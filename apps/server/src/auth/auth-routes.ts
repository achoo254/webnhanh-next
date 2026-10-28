// Sign-in with a hoandat.com account: /auth/login sends the browser to auth.hoandat.com (Code + PKCE, scope
// openid), /auth/callback exchanges the code (client_secret_basic), opens a session and comes back to the page the
// person started from. Off until AUTH_CLIENT_SECRET is set.
import type { Db } from '@trang/db';
import express, { type RequestHandler, type Router } from 'express';
import type { AuthConfig, ServerConfig } from '../config';
import { HttpError } from '../http-error';
import { codeChallenge, newLoginState, openState, safeReturnPath, sealState, subFromIdToken, withLoginResult } from './oidc-login';
import {
  accountForSub,
  clearSessionCookie,
  createSession,
  deleteSession,
  pruneSessions,
  readCookie,
  readSessionToken,
  sessionAccount,
  setSessionCookie,
  type Account,
} from './session';

const STATE_COOKIE = 'trang_login';

interface Discovery {
  readonly issuer: string;
  readonly authorization_endpoint: string;
  readonly token_endpoint: string;
}

function isDiscovery(value: unknown): value is Discovery {
  if (typeof value !== 'object' || value === null) return false;
  const v = value as Record<string, unknown>;
  return typeof v.issuer === 'string' && typeof v.authorization_endpoint === 'string' && typeof v.token_endpoint === 'string';
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

async function exchangeCode(auth: AuthConfig, discovery: Discovery, code: string, verifier: string): Promise<{ status: number; idToken: string | null }> {
  const basic = Buffer.from(`${encodeURIComponent(auth.clientId)}:${encodeURIComponent(auth.clientSecret)}`).toString('base64');
  const res = await fetch(discovery.token_endpoint, {
    method: 'POST',
    headers: { Authorization: `Basic ${basic}`, 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ grant_type: 'authorization_code', code, redirect_uri: auth.redirectUri, code_verifier: verifier }),
    signal: AbortSignal.timeout(10_000),
  });
  const body: unknown = await res.json().catch(() => null);
  const idToken = typeof body === 'object' && body !== null && typeof (body as { id_token?: unknown }).id_token === 'string' ? (body as { id_token: string }).id_token : null;
  return { status: res.status, idToken: res.ok ? idToken : null };
}

/** The signed-in account as the web app sees it. */
export interface MeResponse {
  readonly account: { readonly id: string; readonly createdAt: string };
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
        scope: 'openid',
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
      const accountId = await accountForSub(db, sub, now);
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

  router.get('/api/me', requireAccount(config, db), (_req, res) => {
    const account = accountOf(res.locals);
    const body: MeResponse = { account: { id: account.id, createdAt: account.createdAt.toISOString() } };
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
