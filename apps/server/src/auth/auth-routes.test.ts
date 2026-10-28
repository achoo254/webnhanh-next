import type { AddressInfo } from 'node:net';
import type { Server } from 'node:http';
import { accounts, sessions } from '@webnhanh/db';
import express from 'express';
import { afterEach, describe, expect, it } from 'vitest';
import { loadConfig } from '../config';
import { ORIGIN, startTestApp, type TestApp } from '../test-support';
import { codeChallenge } from './oidc-login';
import { hashToken, sessionCookieName } from './session';

const SECRET = 's'.repeat(40);
const b64 = (value: unknown): string => Buffer.from(JSON.stringify(value)).toString('base64url');

interface FakeIdp {
  readonly issuer: string;
  /** The token requests it received (Authorization header and form). */
  readonly tokenRequests: { authorization: string | undefined; form: Record<string, string> }[];
  /** Nonce of the ID token it hands out. */
  nonce: string;
  close(): Promise<void>;
}

/** A local stand-in for auth.hoandat.com: discovery and a token endpoint (http is allowed on loopback outside production). */
async function startFakeIdp(): Promise<FakeIdp> {
  const app = express();
  app.use(express.urlencoded({ extended: false }));
  const idp: { issuer: string; nonce: string; tokenRequests: FakeIdp['tokenRequests'] } = { issuer: '', nonce: '', tokenRequests: [] };
  app.get('/.well-known/openid-configuration', (_req, res) => {
    res.json({ issuer: idp.issuer, authorization_endpoint: `${idp.issuer}/auth`, token_endpoint: `${idp.issuer}/token` });
  });
  app.post('/token', (req, res) => {
    idp.tokenRequests.push({ authorization: req.headers.authorization, form: req.body as Record<string, string> });
    const claims = { iss: idp.issuer, aud: 'webnhanh-web', exp: Math.floor(Date.now() / 1000) + 300, nonce: idp.nonce, sub: 'account-42' };
    res.json({ id_token: `${b64({ alg: 'RS256' })}.${b64(claims)}.sig`, token_type: 'Bearer' });
  });
  const server: Server = app.listen(0, '127.0.0.1');
  await new Promise<void>((resolve) => server.once('listening', resolve));
  idp.issuer = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  return Object.assign(idp, { close: () => new Promise<void>((resolve) => server.close(() => resolve())) });
}

let app: TestApp | null = null;
let idp: FakeIdp | null = null;
afterEach(async () => {
  await app?.close();
  await idp?.close();
  app = null;
  idp = null;
});

/** The session token the response set, from its Set-Cookie header. */
function sessionToken(setCookie: string[] | string | undefined, name: string): string | null {
  const cookies = Array.isArray(setCookie) ? setCookie : setCookie ? [setCookie] : [];
  for (const cookie of cookies) {
    const [pair] = cookie.split(';');
    if (pair?.startsWith(`${name}=`)) return pair.slice(name.length + 1);
  }
  return null;
}

describe('sign-in with the account service', () => {
  it('runs Code + PKCE with client_secret_basic, opens a session for the IdP subject and signs out', async () => {
    idp = await startFakeIdp();
    const base = loadConfig({ NODE_ENV: 'test', AUTH_ISSUER: idp.issuer, AUTH_CLIENT_SECRET: SECRET, PUBLIC_URL: ORIGIN });
    app = await startTestApp({ auth: base.auth });
    const http = app.http();

    expect((await http.get('/api/me')).status).toBe(401);

    const login = await http.get('/auth/login?return=/webnhanh&lang=en');
    expect(login.status).toBe(302);
    const authorize = new URL(login.headers.location ?? '');
    expect(authorize.origin + authorize.pathname).toBe(`${idp.issuer}/auth`);
    const q = authorize.searchParams;
    expect(Object.fromEntries([...q].filter(([k]) => ['client_id', 'redirect_uri', 'response_type', 'scope', 'code_challenge_method', 'ui_locales'].includes(k)))).toEqual({
      client_id: 'webnhanh-web',
      redirect_uri: `${ORIGIN}/auth/callback`,
      response_type: 'code',
      scope: 'openid',
      code_challenge_method: 'S256',
      ui_locales: 'en',
    });
    idp.nonce = q.get('nonce') ?? '';

    // A callback with another state is refused (back on the page it started from, with the failure noted).
    expect((await http.get('/auth/callback?state=wrong&code=c1')).headers.location).toBe('/webnhanh?login=fail');
    expect(idp.tokenRequests).toHaveLength(0);
    // The refused attempt cleared the state cookie: start again.
    const again = new URL((await http.get('/auth/login?return=/webnhanh&lang=en')).headers.location ?? '');
    idp.nonce = again.searchParams.get('nonce') ?? '';
    const callback = await http.get(`/auth/callback?state=${again.searchParams.get('state') ?? ''}&code=c1`);
    expect(callback.status).toBe(302);
    expect(callback.headers.location).toBe('/webnhanh');

    const [request] = idp.tokenRequests;
    expect(request?.authorization).toBe(`Basic ${Buffer.from(`webnhanh-web:${SECRET}`).toString('base64')}`);
    expect(request?.form.grant_type).toBe('authorization_code');
    expect(codeChallenge(request?.form.code_verifier ?? '')).toBe(again.searchParams.get('code_challenge'));

    // The account is keyed by the IdP subject, and only the token's hash is stored.
    const token = sessionToken(callback.headers['set-cookie'], sessionCookieName(app.config));
    expect(token).toMatch(/^[A-Za-z0-9_-]{43}$/);
    const [account] = await app.handle.db.select().from(accounts);
    expect(account?.sub).toBe('account-42');
    const stored = await app.handle.db.select().from(sessions);
    expect(stored.map((s) => s.id)).toEqual([hashToken(token ?? '')]);

    const me = await http.get('/api/me');
    expect(me.status).toBe(200);
    expect(me.body).toEqual({ account: { id: account?.id, createdAt: account?.createdAt.toISOString(), admin: false, locked: false } });

    expect((await http.post('/auth/logout').set('Origin', ORIGIN)).status).toBe(204);
    expect((await http.get('/api/me')).status).toBe(401);
    expect(await app.handle.db.select().from(sessions)).toHaveLength(0);
  });

  it('signs the same IdP subject into the same account twice', async () => {
    app = await startTestApp();
    const first = await app.signIn('sub-7');
    const second = await app.signIn('sub-7');
    expect(second.accountId).toBe(first.accountId);
    expect(await app.handle.db.select().from(accounts)).toHaveLength(1);
  });

  it('says sign-in is unavailable while no client secret is set', async () => {
    app = await startTestApp({ auth: null });
    const login = await app.http().get('/auth/login?return=/');
    expect(login.status).toBe(302);
    expect(login.headers.location).toBe('/?login=unavailable');
  });

  it('refuses a sign-out from another origin', async () => {
    app = await startTestApp();
    const { cookie } = await app.signIn('sub-8');
    const res = await app.http().post('/auth/logout').set('Cookie', cookie).set('Origin', 'https://evil.example');
    expect(res.status).toBe(403);
    expect(res.body).toEqual({ error: 'forbidden-origin' });
    expect((await app.http().get('/api/me').set('Cookie', cookie)).status).toBe(200);
  });

  it('ends sessions that expired or went unused for a week', async () => {
    app = await startTestApp();
    const longAgo = new Date(Date.now() - 8 * 24 * 60 * 60 * 1000);
    const idle = await app.signIn('sub-9', longAgo);
    const res = await app.http().get('/api/me').set('Cookie', idle.cookie);
    expect(res.status).toBe(401);
    expect(res.body).toEqual({ error: 'sign-in-required' });
    expect(await app.handle.db.select().from(sessions)).toHaveLength(0);
    // A cookie that is not one of our tokens is ignored.
    expect((await app.http().get('/api/me').set('Cookie', `${sessionCookieName(app.config)}=forged`)).status).toBe(401);
  });

  it('answers /healthz and an unknown API path', async () => {
    app = await startTestApp();
    const health = await app.http().get('/healthz');
    expect(health.status).toBe(200);
    expect(health.text).toBe('ok');
    const unknown = await app.http().get('/api/nothing-here');
    expect(unknown.status).toBe(404);
    expect(unknown.body).toEqual({ error: 'not-found' });
  });
});
