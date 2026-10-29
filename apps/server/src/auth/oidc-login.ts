/**
 * The pure parts of "sign in with a hoandat.com account" (OpenID Connect, Code + PKCE against auth.hoandat.com,
 * confidential client `webnhanh-web`, scope `openid`), ported from tieu-de-next: the signed state cookie and the ID
 * token checks. Web Nhanh only needs the account's `sub`. The ID token comes straight from the token endpoint over TLS
 * with client authentication, so its signature is not re-checked here (OIDC Core 3.1.3.7, step 6); issuer,
 * audience, expiry and nonce are.
 */
import { createHash, createHmac, randomBytes, timingSafeEqual } from 'node:crypto';

export interface LoginState {
  readonly state: string;
  readonly nonce: string;
  readonly verifier: string;
  /** Path of the app to come back to after sign-in (always a local path). */
  readonly returnTo: string;
  readonly lang: 'vi' | 'en';
  /** Unix seconds after which the attempt is void. */
  readonly exp: number;
}

const b64url = (buf: Buffer): string => buf.toString('base64url');

const LOCAL = 'http://local';
// Control characters and the backslash (browsers read `\` as `/` in URLs).
// eslint-disable-next-line no-control-regex -- matching control characters is the point
const UNSAFE = /[\u0000-\u001f\u007f\\]/;

/** A path that can only stay on this site: one leading `/`, not followed by `/` or `\`. */
export function isLocalPath(path: string): boolean {
  return path.startsWith('/') && !path.startsWith('//') && !UNSAFE.test(path);
}

/**
 * A same-site path to return to. The value is normalised the way the browser will read it (dot segments and
 * `%2e` resolved) before it is checked, so `/.//evil.com` cannot turn into `//evil.com`. Anything else — absolute or
 * protocol-relative URLs, backslashes, control characters — becomes `/`. The fragment is dropped.
 */
export function safeReturnPath(value: unknown): string {
  if (typeof value !== 'string' || value.length > 200 || !isLocalPath(value)) return '/';
  let url: URL;
  try {
    url = new URL(value, LOCAL);
  } catch {
    return '/';
  }
  const path = `${url.pathname}${url.search}`;
  return url.origin === LOCAL && isLocalPath(path) ? path : '/';
}

/** `path` (made safe first) with `login=<result>` in its query. */
export function withLoginResult(path: string, result: string): string {
  const url = new URL(safeReturnPath(path), LOCAL);
  url.searchParams.set('login', result);
  const out = `${url.pathname}${url.search}`;
  return isLocalPath(out) ? out : `/?login=${encodeURIComponent(result)}`;
}

export function newLoginState(returnTo: string, lang: 'vi' | 'en', now = Date.now()): LoginState {
  return {
    state: b64url(randomBytes(16)),
    nonce: b64url(randomBytes(16)),
    verifier: b64url(randomBytes(32)),
    returnTo: safeReturnPath(returnTo),
    lang,
    exp: Math.floor(now / 1000) + 600,
  };
}

/** S256 code challenge of the PKCE verifier. */
export function codeChallenge(verifier: string): string {
  return b64url(createHash('sha256').update(verifier).digest());
}

/** The state as a cookie value, signed with the client secret. */
export function sealState(s: LoginState, key: string): string {
  const body = b64url(Buffer.from(JSON.stringify(s)));
  const mac = b64url(createHmac('sha256', key).update(body).digest());
  return `${body}.${mac}`;
}

function isLoginState(value: unknown): value is LoginState {
  if (typeof value !== 'object' || value === null) return false;
  const v = value as Record<string, unknown>;
  return (
    typeof v.state === 'string' &&
    typeof v.nonce === 'string' &&
    typeof v.verifier === 'string' &&
    typeof v.returnTo === 'string' &&
    (v.lang === 'vi' || v.lang === 'en') &&
    typeof v.exp === 'number'
  );
}

export function openState(value: string | undefined, key: string, now = Date.now()): LoginState | null {
  if (!value) return null;
  const [body, mac] = value.split('.');
  if (!body || !mac) return null;
  const want = Buffer.from(b64url(createHmac('sha256', key).update(body).digest()));
  const got = Buffer.from(mac);
  if (got.length !== want.length || !timingSafeEqual(got, want)) return null;
  try {
    const parsed: unknown = JSON.parse(Buffer.from(body, 'base64url').toString());
    return isLoginState(parsed) && parsed.exp > Math.floor(now / 1000) ? { ...parsed, returnTo: safeReturnPath(parsed.returnTo) } : null;
  } catch {
    return null;
  }
}

/** The account `sub` from the ID token, or null when any check fails. */
export function subFromIdToken(idToken: string, expect: { issuer: string; clientId: string; nonce: string }, now = Date.now()): string | null {
  const part = idToken.split('.')[1];
  if (!part) return null;
  let claims: Record<string, unknown>;
  try {
    const parsed: unknown = JSON.parse(Buffer.from(part, 'base64url').toString());
    if (typeof parsed !== 'object' || parsed === null) return null;
    claims = parsed as Record<string, unknown>;
  } catch {
    return null;
  }
  const aud = claims.aud;
  const audOk = Array.isArray(aud) ? aud.includes(expect.clientId) : aud === expect.clientId;
  const fresh = typeof claims.exp === 'number' && claims.exp > Math.floor(now / 1000);
  if (claims.iss !== expect.issuer || !audOk || !fresh || claims.nonce !== expect.nonce || typeof claims.sub !== 'string' || claims.sub === '') {
    return null;
  }
  return claims.sub;
}

/** What the account menu shows of the person, from the IdP's userinfo; null where the IdP has nothing usable. */
export interface IdpProfile {
  readonly name: string | null;
  readonly email: string | null;
  readonly picture: string | null;
}

const NAME_MAX = 200;
const EMAIL_MAX = 320;
const PICTURE_MAX = 2048;

function shortText(value: unknown, max: number): string | null {
  if (typeof value !== 'string') return null;
  const text = value.trim();
  return text !== '' && text.length <= max ? text : null;
}

/** An https URL only: the menu shows nothing else, and the CSP allows no other scheme. */
function httpsUrl(value: unknown): string | null {
  const text = shortText(value, PICTURE_MAX);
  if (!text) return null;
  try {
    return new URL(text).protocol === 'https:' ? text : null;
  } catch {
    return null;
  }
}

/**
 * The profile in a userinfo response, or null when the response is not about `sub` (OIDC Core 5.3.2: its `sub`
 * must be the ID token's). Fields that are missing, too long or of the wrong shape become null.
 */
export function profileFromUserinfo(value: unknown, sub: string): IdpProfile | null {
  if (typeof value !== 'object' || value === null) return null;
  const v = value as Record<string, unknown>;
  if (v.sub !== sub) return null;
  const email = shortText(v.email, EMAIL_MAX);
  return {
    name: shortText(v.name, NAME_MAX) ?? shortText(v.preferred_username, NAME_MAX),
    email: email?.includes('@') ? email : null,
    picture: httpsUrl(v.picture),
  };
}
