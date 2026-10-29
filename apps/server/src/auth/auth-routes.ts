// Sign-in with a hoandat.com account: /auth/login sends the browser to auth.hoandat.com (Code + PKCE, scope
// openid profile email), /auth/callback exchanges the code (client_secret_basic), reads the name, email and picture
// from the userinfo endpoint for the account menu, opens a session and comes back to the page the person started
// from. Off until AUTH_CLIENT_SECRET is set.
import { pruneSessions, type Db } from '@webnhanh/db';
import express, { type RequestHandler, type Router } from 'express';
import { accountStanding } from '../admin/admin-guard';
import type { AuthConfig, ServerConfig } from '../config';
import { HttpError } from '../http-error';
import {
  codeChallenge,
  newLoginState,
  openState,
  profileFromUserinfo,
  safeReturnPath,
  sealState,
  subFromIdToken,
  withLoginResult,
  type IdpProfile,
} from './oidc-login';
import {
  accountForSub,
  clearSessionCookie,
  createSession,
  deleteSession,
  readCookie,
  readSessionToken,
  sessionAccount,
  setSessionCookie,
  type Account,
} from './session';

const STATE_COOKIE = 'webnhanh_login';

/** What the app asks the IdP for: the account's key, then the name, picture and email of the account menu. */
const LOGIN_SCOPE = 'openid profile email';

interface Discovery {
  readonly issuer: string;
  readonly authorization_endpoint: string;
  readonly token_endpoint: string;
  readonly userinfo_endpoint?: string;
}

function isDiscovery(value: unknown): value is Discovery {
  if (typeof value !== 'object' || value === null) return false;
  const v = value as Record<string, unknown>;
  return (
    typeof v.issuer === 'string' &&
    typeof v.authorization_endpoint === 'string' &&
    typeof v.token_endpoint === 'string' &&
    (v.userinfo_endpoint === undefined || typeof v.userinfo_endpoint === 'string')
  );
}

/** The IdP's endpoints, cached for an hour. */
function discoveryCache(issuer: string): () => Promise<Discovery> {
  let cached: { at: number; doc: Discovery } | null = null;
  return async () => {
    if (cached && Date.now() - cached.at < 3_600_000) return cached.doc;
    const res = await fetch(`${issuer}/.well-known/openid-configuration`, { signal: AbortSignal.timeout(10_000) });
    if (!res.ok) throw new Error(`discovery ${res.status}`);
    const doc: unknown = await res.json();
    if (!isDiscovery(doc) || doc.issuer !== issuer) throw new Error('discovery document does not match the issuer');
    cached = { at: Date.now(), doc };
    return doc;
  };
}

interface TokenResult {
  readonly status: number;
  readonly idToken: string | null;
  readonly accessToken: string | null;
}

function stringField(body: unknown, key: string): string | null {
  if (typeof body !== 'object' || body === null) return null;
  const value = (body as Record<string, unknown>)[key];
  return typeof value === 'string' && value !== '' ? value : null;
}

async function exchangeCode(auth: AuthConfig, discovery: Discovery, code: string, verifier: string): Promise<TokenResult> {
  const basic = Buffer.from(`${encodeURIComponent(auth.clientId)}:${encodeURIComponent(auth.clientSecret)}`).toString('base64');
  const res = await fetch(discovery.token_endpoint, {
    method: 'POST',
    headers: { Authorization: `Basic ${basic}`, 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ grant_type: 'authorization_code', code, redirect_uri: auth.redirectUri, code_verifier: verifier }),
    signal: AbortSignal.timeout(10_000),
  });
  const body: unknown = await res.json().catch(() => null);
  if (!res.ok) return { status: res.status, idToken: null, accessToken: null };
  return { status: res.status, idToken: stringField(body, 'id_token'), accessToken: stringField(body, 'access_token') };
}

/**
 * The person's name, email and picture from the userinfo endpoint, or null when it cannot be read: sign-in still
 * goes on, and the account keeps what it had.
 */
async function fetchProfile(discovery: Discovery, accessToken: string | null, sub: string): Promise<IdpProfile | null> {
  if (!discovery.userinfo_endpoint || !accessToken) return null;
  try {
    const res = await fetch(discovery.userinfo_endpoint, {
      headers: { Authorization: `Bearer ${accessToken}`, Accept: 'application/json' },
      signal: AbortSignal.timeout(10_000),
    });
    if (!res.ok) {
      console.warn(`userinfo refused (${res.status})`);
      return null;
    }
    const profile = profileFromUserinfo(await res.json(), sub);
    if (!profile) console.warn('userinfo is not about the signed-in subject');
    return profile;
  } catch (error) {
    console.warn(`userinfo failed: ${error instanceof Error ? error.message : String(error)}`);
    return null;
  }
}

/** The signed-in account as the web app sees it. */
export interface MeResponse {
  /**
   * `admin`: the admin tools are open to it (ADMIN_SUBS); `locked`: an admin locked it (nothing is published or built);
   * `name`, `email`, `picture`: from the IdP at the last sign-in, null when unknown.
   */
  readonly account: {
    readonly id: string;
    readonly createdAt: string;
    readonly name: string | null;
    readonly email: string | null;
    readonly picture: string | null;
    readonly admin: boolean;
    readonly locked: boolean;
  };
}

export function authRoutes(config: ServerConfig, db: Db): Router {
  const router = express.Router();
  const auth = config.auth;
  const discover = auth ? discoveryCache(auth.issuer) : null;
  const stateCookie = { httpOnly: true, secure: config.nodeEnv === 'production', sameSite: 'lax' as const, path: '/auth' };

  router.get('/auth/login', async (req, res) => {
    const returnTo = safeReturnPath(req.query.return);
    const lang = req.query.lang === 'en' ? 'en' : 'vi';
    if (!auth || !discover) {
      res.redirect(withLoginResult(returnTo, 'unavailable'));
      return;
    }
    try {
      const d = await discover();
      const s = newLoginState(returnTo, lang);
      res.cookie(STATE_COOKIE, sealState(s, auth.clientSecret), { ...stateCookie, maxAge: 600_000 });
      const url = new URL(d.authorization_endpoint);
      url.search = new URLSearchParams({
        client_id: auth.clientId,
        redirect_uri: auth.redirectUri,
        response_type: 'code',
        scope: LOGIN_SCOPE,
        state: s.state,
        nonce: s.nonce,
        code_challenge: codeChallenge(s.verifier),
        code_challenge_method: 'S256',
        ui_locales: lang,
      }).toString();
      res.redirect(url.href);
    } catch (error) {
      console.warn(`sign-in start failed: ${error instanceof Error ? error.message : String(error)}`);
      res.redirect(withLoginResult(returnTo, 'fail'));
    }
  });

  router.get('/auth/callback', async (req, res) => {
    const s = auth ? openState(readCookie(req, STATE_COOKIE), auth.clientSecret) : null;
    res.clearCookie(STATE_COOKIE, stateCookie);
    const back = (result: string): void => res.redirect(withLoginResult(s?.returnTo ?? '/', result));
    if (!auth || !discover || !s || req.query.state !== s.state || typeof req.query.code !== 'string') {
      back('fail');
      return;
    }
    try {
      const d = await discover();
      const token = await exchangeCode(auth, d, req.query.code, s.verifier);
      const sub = token.idToken ? subFromIdToken(token.idToken, { issuer: d.issuer, clientId: auth.clientId, nonce: s.nonce }) : null;
      if (!sub) {
        console.warn(`sign-in rejected (token endpoint ${token.status})`);
        back('fail');
        return;
      }
      const now = new Date();
      await pruneSessions(db, now);
      const profile = await fetchProfile(d, token.accessToken, sub);
      const accountId = await accountForSub(db, sub, now, profile ?? undefined);
      setSessionCookie(res, config, await createSession(db, accountId, now));
      res.redirect(s.returnTo);
    } catch (error) {
      console.warn(`sign-in failed: ${error instanceof Error ? error.message : String(error)}`);
      back('fail');
    }
  });

  router.post('/auth/logout', async (req, res) => {
    const token = readSessionToken(req, config);
    if (token) await deleteSession(db, token);
    clearSessionCookie(res, config);
    res.status(204).end();
  });

  router.get('/api/me', requireAccount(config, db), async (_req, res) => {
    const account = accountOf(res.locals);
    const standing = await accountStanding(db, config, account.id);
    const body: MeResponse = {
      account: {
        id: account.id,
        createdAt: account.createdAt.toISOString(),
        name: account.name,
        email: account.email,
        picture: account.picture,
        ...standing,
      },
    };
    res.set('Cache-Control', 'no-store').json(body);
  });

  return router;
}

/** Requires a live session; puts the account on `res.locals.account`. */
export function requireAccount(config: ServerConfig, db: Db): RequestHandler {
  return async (req, res, next) => {
    const token = readSessionToken(req, config);
    const account = token ? await sessionAccount(db, token, new Date()) : null;
    if (!account) throw new HttpError(401, 'sign-in-required');
    res.locals.account = account;
    next();
  };
}

function isAccount(value: unknown): value is Account {
  if (typeof value !== 'object' || value === null) return false;
  const v = value as Record<string, unknown>;
  return typeof v.id === 'string' && v.createdAt instanceof Date;
}

/** The account `requireAccount` put on the response. */
export function accountOf(locals: Record<string, unknown>): Account {
  const account = locals.account;
  if (!isAccount(account)) throw new HttpError(401, 'sign-in-required');
  return account;
}
