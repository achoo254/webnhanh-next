/**
 * An account deleted at the IdP (auth-next ADR 0018, POST /api/idp/account-deleted): which notices are taken, that
 * everything of the account goes (its sites queued for the worker to take off the web), what outlives it, that it is
 * signed out everywhere, and that a repeated notice changes nothing.
 */
import { generateKeyPairSync, randomUUID, sign } from 'node:crypto';
import { access, writeFile } from 'node:fs/promises';
import type { Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import {
  abuseReports,
  accounts,
  adminActions,
  chatLinks,
  developerSites,
  jobs,
  pushSubscriptions,
  siteDeletions,
  siteImages,
  siteNameHolds,
  sites,
  sessions,
  submissions,
} from '@webnhanh/db';
import { inboxZip } from '@webnhanh/worker/build';
import { eq } from 'drizzle-orm';
import express from 'express';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { loadConfig } from '../config';
import { ORIGIN, publishedShop, startTestApp, type TestApp } from '../test-support';
import { ACCOUNT_DELETED_PATH } from './account-deleted';

const SECRET = 's'.repeat(40);
const KID = 'fake-key-1';
const b64url = (value: string | Buffer): string => Buffer.from(value).toString('base64url');

interface NoticeOptions {
  /** Claims replacing or added to the valid ones; an `undefined` one is left out. */
  claims?: Record<string, unknown>;
  /** `stranger`: signed with a key the IdP never published. */
  how?: 'valid' | 'stranger';
  typ?: string;
}

/** A stand-in for auth.hoandat.com: discovery, its JWKS, and the SETs it signs. */
interface FakeIdp {
  issuer: string;
  notice(sub: string, audience: string, options?: NoticeOptions): string;
  close(): Promise<void>;
}

async function startFakeIdp(): Promise<FakeIdp> {
  const key = generateKeyPairSync('ec', { namedCurve: 'P-256' });
  const stranger = generateKeyPairSync('ec', { namedCurve: 'P-256' });
  const jwk = { ...key.publicKey.export({ format: 'jwk' }), kid: KID, alg: 'ES256', use: 'sig' };
  let issuer = '';
  const app = express();
  app.get('/.well-known/openid-configuration', (_req, res) => {
    res.json({ issuer, authorization_endpoint: `${issuer}/auth`, token_endpoint: `${issuer}/token`, jwks_uri: `${issuer}/jwks` });
  });
  app.get('/jwks', (_req, res) => {
    res.json({ keys: [jwk] });
  });
  const server: Server = app.listen(0, '127.0.0.1');
  await new Promise<void>((resolve) => server.once('listening', resolve));
  issuer = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  return {
    issuer,
    notice(sub, audience, { claims = {}, how = 'valid', typ = 'secevent+jwt' } = {}) {
      const now = Math.floor(Date.now() / 1000);
      const events = { 'urn:hoandat:auth:event:account.deleted': {} };
      const head = b64url(JSON.stringify({ alg: 'ES256', kid: KID, typ }));
      const body = b64url(JSON.stringify({ iss: issuer, aud: audience, sub, iat: now, exp: now + 600, jti: randomUUID(), toe: now, events, ...claims }));
      const signature = sign('sha256', Buffer.from(`${head}.${body}`), { key: (how === 'valid' ? key : stranger).privateKey, dsaEncoding: 'ieee-p1363' });
      return `${head}.${body}.${b64url(signature)}`;
    },
    close: () => new Promise<void>((resolve) => server.close(() => resolve())),
  };
}

let idp: FakeIdp;
let app: TestApp;
const receiver = `${ORIGIN}${ACCOUNT_DELETED_PATH}`;

beforeAll(async () => {
  idp = await startFakeIdp();
  app = await startTestApp({ auth: loadConfig({ NODE_ENV: 'test', AUTH_ISSUER: idp.issuer, AUTH_CLIENT_SECRET: SECRET, PUBLIC_URL: ORIGIN }).auth });
});

afterAll(async () => {
  await app.close();
  await idp.close();
});

/** The IdP's POST: server to server, no Origin, no cookie. */
function notify(target: TestApp, body: string, type = 'application/secevent+jwt') {
  return target.http().post(ACCOUNT_DELETED_PATH).set('Content-Type', type).send(body);
}
const noticeFor = (sub: string, options?: NoticeOptions): string => idp.notice(sub, receiver, options);

async function signedIn(cookie: string): Promise<boolean> {
  return (await app.http().get('/api/me').set('Cookie', cookie)).status === 200;
}

async function exists(file: string): Promise<boolean> {
  return access(file).then(
    () => true,
    () => false,
  );
}

/**
 * An account signed in on two browsers with a published shop (an order, a photo, an old name, a queued publish, an
 * open abuse report, an admin's earlier action), a developer site with an uploaded zip, a push device and a Chat link.
 */
async function accountWithData(sub: string) {
  const first = await app.signIn(sub);
  const second = await app.signIn(sub);
  const db = app.handle.db;
  const now = new Date();
  const shop = await publishedShop(app, first, `tiem-${sub}`);
  await db.insert(siteImages).values({ id: randomUUID(), siteId: shop.siteId, width: 10, height: 10, widths: [10], bytes: 1, createdAt: now });
  await db
    .insert(submissions)
    .values({ id: randomUUID(), siteId: shop.siteId, kind: 'order', data: { name: 'A', phone: '0912345678', address: 'x', productKey: 'p1', productName: 'Bánh', quantity: 1, note: '' }, createdAt: now });
  await db.insert(siteNameHolds).values({ name: `cu-${sub}`, siteId: shop.siteId, heldUntil: new Date(now.getTime() + 60_000), createdAt: now });
  await db.insert(jobs).values({ id: randomUUID(), siteId: shop.siteId, accountId: first.accountId, type: 'publish', status: 'queued', createdAt: now });
  const reportId = randomUUID();
  await db.insert(abuseReports).values({ id: reportId, siteId: shop.siteId, siteName: `tiem-${sub}`, category: 'spam', details: 'x', status: 'open', createdAt: now });
  const actionId = randomUUID();
  await db.insert(adminActions).values({ id: actionId, action: 'resolve', siteId: shop.siteId, siteName: `tiem-${sub}`, accountId: first.accountId, status: 'done', createdAt: now });

  const [dev] = await db.insert(sites).values({ accountId: first.accountId, name: `dev-${sub}`, kind: 'developer', status: 'draft', createdAt: now, updatedAt: now }).returning();
  if (!dev) throw new Error('no site');
  await db.insert(developerSites).values({ siteId: dev.id, source: 'zip', settings: { rootDir: '.', buildCommand: null, outputDir: '.' }, createdAt: now, updatedAt: now });
  const inbox = app.config.buildInboxDir ?? '';
  const zip = inboxZip({ inbox, out: inbox, work: inbox, cache: inbox }, dev.id);
  await writeFile(zip, 'zip');

  await db.insert(pushSubscriptions).values({ id: randomUUID(), accountId: first.accountId, endpoint: `https://fcm.googleapis.com/fcm/send/${sub}`, p256dh: 'p', auth: 'a', createdAt: now });
  await db.insert(chatLinks).values({ accountId: first.accountId, chatId: 42, createdAt: now });
  return { accountId: first.accountId, cookies: [first.cookie, second.cookie], shopId: shop.siteId, devId: dev.id, zip, reportId, actionId };
}

describe('POST /api/idp/account-deleted: which notices are taken', () => {
  const nowS = (): number => Math.floor(Date.now() / 1000);

  it.each([
    ['a key the IdP never published', () => noticeFor('careful', { how: 'stranger' })],
    ['another receiver', () => noticeFor('careful', { claims: { aud: 'https://chat.hoandat.com/api/idp/account-deleted' } })],
    ['an audience list', () => noticeFor('careful', { claims: { aud: [receiver] } })],
    ['another issuer', () => noticeFor('careful', { claims: { iss: 'https://evil.example' } })],
    ['an expired notice', () => noticeFor('careful', { claims: { iat: nowS() - 1200, exp: nowS() - 600 } })],
    ['no expiry', () => noticeFor('careful', { claims: { exp: undefined } })],
    ['another event', () => noticeFor('careful', { claims: { events: { 'urn:hoandat:auth:event:account.created': {} } } })],
    ['no sub', () => noticeFor('', {})],
  ])('refuses %s with 401 and deletes nothing', async (_label, makeToken) => {
    const { cookie } = await app.signIn('careful');
    expect((await notify(app, makeToken())).status).toBe(401);
    expect(await signedIn(cookie)).toBe(true);
  });

  it('refuses a token signed with another algorithm than ES256', async () => {
    const { cookie } = await app.signIn('careful');
    const [, payload = '', signature = ''] = noticeFor('careful').split('.');
    const forged = `${b64url(JSON.stringify({ alg: 'RS256', kid: KID, typ: 'secevent+jwt' }))}.${payload}.${signature}`;
    expect((await notify(app, forged)).status).toBe(401);
    expect(await signedIn(cookie)).toBe(true);
  });

  it.each([
    ['an empty body', () => ''],
    ['not a JWS', () => 'hello'],
    ['another token type (a logout token)', () => noticeFor('careful', { typ: 'logout+jwt' })],
  ])('answers 400 to %s', async (_label, makeBody) => {
    expect((await notify(app, makeBody())).status).toBe(400);
  });

  it('answers 400 to a SET sent as another media type', async () => {
    expect((await notify(app, noticeFor('careful'), 'application/json')).status).toBe(400);
  });

  it('answers 202 to an account this app never saw', async () => {
    expect((await notify(app, noticeFor('never-signed-in'))).status).toBe(202);
  });

  it('answers 503 when the IdP keys cannot be read, so the IdP retries', async () => {
    const down = await startFakeIdp();
    await down.close();
    const cut = await startTestApp({ auth: loadConfig({ NODE_ENV: 'test', AUTH_ISSUER: down.issuer, AUTH_CLIENT_SECRET: SECRET, PUBLIC_URL: ORIGIN }).auth });
    try {
      expect((await notify(cut, noticeFor('careful'))).status).toBe(503);
    } finally {
      await cut.close();
    }
  });

  it('answers 503 while sign-in is off (no IdP to check against)', async () => {
    const off = await startTestApp({ auth: null });
    try {
      expect((await notify(off, noticeFor('careful'))).status).toBe(503);
    } finally {
      await off.close();
    }
  });
});

describe('POST /api/idp/account-deleted: what goes and what stays', () => {
  it('deletes the account and its sites at once, queues the sites off the web, and leaves other accounts alone', async () => {
    const db = app.handle.db;
    const other = await accountWithData('stays');
    const leaver = await accountWithData('leaver');

    expect((await notify(app, noticeFor('leaver'))).status).toBe(202);

    expect(await db.select().from(accounts).where(eq(accounts.id, leaver.accountId))).toEqual([]);
    expect(await db.select().from(sessions).where(eq(sessions.accountId, leaver.accountId))).toEqual([]);
    expect(await db.select().from(sites).where(eq(sites.accountId, leaver.accountId))).toEqual([]);
    expect(await db.select().from(siteImages).where(eq(siteImages.siteId, leaver.shopId))).toEqual([]);
    expect(await db.select().from(submissions).where(eq(submissions.siteId, leaver.shopId))).toEqual([]);
    expect(await db.select().from(jobs).where(eq(jobs.accountId, leaver.accountId))).toEqual([]);
    expect(await db.select().from(developerSites).where(eq(developerSites.siteId, leaver.devId))).toEqual([]);
    expect(await db.select().from(pushSubscriptions).where(eq(pushSubscriptions.accountId, leaver.accountId))).toEqual([]);
    expect(await db.select().from(chatLinks).where(eq(chatLinks.accountId, leaver.accountId))).toEqual([]);
    expect(await db.select().from(siteNameHolds).where(eq(siteNameHolds.name, 'cu-leaver'))).toEqual([]);
    expect(await exists(leaver.zip)).toBe(false);
    for (const cookie of leaver.cookies) expect(await signedIn(cookie)).toBe(false);

    // The worker takes both sites off the web and deletes their photos; the queue outlives the account.
    const queued = await db.select().from(siteDeletions);
    expect(queued.filter((d) => d.siteId === leaver.shopId)).toEqual([expect.objectContaining({ accountId: null, names: ['tiem-leaver', 'cu-leaver'], status: 'queued' })]);
    expect(queued.filter((d) => d.siteId === leaver.devId)).toEqual([expect.objectContaining({ accountId: null, names: ['dev-leaver'], status: 'queued' })]);

    // The abuse report and the admin log stay for the admins, no longer tied to the site or the account.
    const [report] = await db.select().from(abuseReports).where(eq(abuseReports.id, leaver.reportId));
    expect(report).toMatchObject({ siteId: null, siteName: 'tiem-leaver', status: 'open' });
    const [action] = await db.select().from(adminActions).where(eq(adminActions.id, leaver.actionId));
    expect(action).toMatchObject({ siteId: null, accountId: null, siteName: 'tiem-leaver' });

    // The names are free at once.
    const taken = await app.http().post('/api/sites').set('Cookie', other.cookies[0] ?? '').set('Origin', ORIGIN).send({ name: 'tiem-leaver', template: 'shop' });
    expect(taken.status, JSON.stringify(taken.body)).toBe(201);

    expect(await db.select().from(sites).where(eq(sites.accountId, other.accountId))).toHaveLength(3);
    expect(await db.select().from(pushSubscriptions).where(eq(pushSubscriptions.accountId, other.accountId))).toHaveLength(1);
    expect(await exists(other.zip)).toBe(true);
    for (const cookie of other.cookies) expect(await signedIn(cookie)).toBe(true);
  });

  it('takes the same notice again (the IdP retries) without changing anything', async () => {
    const { shopId } = await accountWithData('twice');
    const notice = noticeFor('twice');
    expect((await notify(app, notice)).status).toBe(202);
    expect((await notify(app, notice)).status).toBe(202);
    expect(await app.handle.db.select().from(accounts).where(eq(accounts.sub, 'twice'))).toEqual([]);
    expect(await app.handle.db.select().from(siteDeletions).where(eq(siteDeletions.siteId, shopId))).toHaveLength(1);
  });
});
