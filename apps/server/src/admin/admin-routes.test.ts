import { randomUUID } from 'node:crypto';
import { abuseReports, adminActions, developerSites, jobs, sites, type PendingReview } from '@webnhanh/db';
import { eq } from 'drizzle-orm';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { ORIGIN, publishedShop, startTestApp, type TestApp } from '../test-support';

let app: TestApp;
let admin: { accountId: string; cookie: string };
let owner: { accountId: string; cookie: string };

beforeEach(async () => {
  app = await startTestApp({ adminSubs: ['admin-sub'] });
  admin = await app.signIn('admin-sub');
  owner = await app.signIn('shop-owner');
});

afterEach(async () => {
  await app.close();
});

const post = (path: string, who: { cookie: string }, body: object = {}) => app.http().post(path).set('Cookie', who.cookie).set('Origin', ORIGIN).send(body);
const get = (path: string, who: { cookie: string }) => app.http().get(path).set('Cookie', who.cookie);
const siteRow = async (siteId: string) => (await app.handle.db.select().from(sites).where(eq(sites.id, siteId)))[0];

async function report(siteId: string, siteName: string): Promise<string> {
  const id = randomUUID();
  await app.handle.db.insert(abuseReports).values({ id, siteId, siteName, category: 'scam', details: 'Giả mạo ngân hàng', status: 'open', createdAt: new Date() });
  return id;
}

/** A form post from the shop's own page. */
const order = (name: string, token: string) =>
  app
    .http()
    .post(`/f/${name}`)
    .set('Origin', `https://${name}.hoandat.io.vn`)
    .set('Accept', 'application/json')
    .type('form')
    .send({ _t: token, name: 'Lan', phone: '0912345678', address: '1 Lê Lợi', product: 'p1', quantity: '1', _e: '9000' });

describe('who gets the admin tools', () => {
  it('answers 404 to everyone but the admins, signed out included, and tells the app who is an admin', async () => {
    const paths = ['/api/admin/reports', '/api/admin/reviews', '/api/admin/actions', '/api/admin/sites?name=banh-trang'];
    for (const path of paths) {
      expect((await get(path, owner)).status, path).toBe(404);
      expect((await app.http().get(path)).status, path).toBe(404);
    }
    const { siteId } = await publishedShop(app, owner, 'banh-trang');
    expect((await post(`/api/admin/sites/${siteId}/takedown`, owner)).status).toBe(404);
    expect((await post(`/api/admin/accounts/${owner.accountId}/lock`, owner)).status).toBe(404);
    expect((await siteRow(siteId))?.status).toBe('published');

    expect((await get('/api/me', admin)).body).toMatchObject({ account: { admin: true, locked: false } });
    expect((await get('/api/me', owner)).body).toMatchObject({ account: { admin: false, locked: false } });
    expect((await get('/api/admin/reports', admin)).status).toBe(200);
  });
});

describe('taking a site down', () => {
  it('stops its orders and publishes at once, resolves the report, and queues the switch for the worker', async () => {
    const { siteId, token } = await publishedShop(app, owner, 'banh-trang');
    const reportId = await report(siteId, 'banh-trang');
    const listed = await get('/api/admin/reports', admin);
    expect(listed.body.reports).toEqual([expect.objectContaining({ id: reportId, siteName: 'banh-trang', site: expect.objectContaining({ id: siteId, status: 'published', accountId: owner.accountId }) })]);
    await app.handle.db.insert(jobs).values({ id: randomUUID(), siteId, accountId: owner.accountId, type: 'publish', status: 'queued', createdAt: new Date() });

    // Orders come in until the takedown.
    expect((await order('banh-trang', token)).status).toBe(201);
    const res = await post(`/api/admin/sites/${siteId}/takedown`, admin, { note: 'Giả mạo Vietcombank', reportId });
    expect(res.status, JSON.stringify(res.body)).toBe(202);
    expect(res.body.action).toMatchObject({ action: 'takedown', status: 'queued', siteName: 'banh-trang', note: 'Giả mạo Vietcombank', reportId });
    expect(await siteRow(siteId)).toMatchObject({ status: 'removed', takenDownAt: expect.any(Date) });
    expect((await app.handle.db.select().from(jobs).where(eq(jobs.siteId, siteId)))[0]).toMatchObject({ status: 'failed', error: 'site-removed' });
    expect((await app.handle.db.select().from(abuseReports).where(eq(abuseReports.id, reportId)))[0]?.status).toBe('resolved');

    expect((await order('banh-trang', token)).status).toBe(404);
    expect((await post(`/api/sites/${siteId}/publish`, owner)).body).toMatchObject({ error: 'site-removed' });
    expect((await post(`/api/admin/sites/${siteId}/takedown`, admin)).status).toBe(409);

    const restored = await post(`/api/admin/sites/${siteId}/restore`, admin);
    expect(restored.status).toBe(202);
    expect(restored.body.action).toMatchObject({ action: 'restore', status: 'queued' });
    const log = await get('/api/admin/actions', admin);
    expect(log.body.actions.map((a: { action: string }) => a.action)).toEqual(['restore', 'takedown']);
    expect(log.body.actions[1]).toMatchObject({ adminAccountId: admin.accountId, accountId: owner.accountId });
  });

  it('finds a site by its address, and refuses what is not one', async () => {
    const { siteId } = await publishedShop(app, owner, 'banh-trang');
    expect((await get('/api/admin/sites?name=https://banh-trang.hoandat.io.vn/x', admin)).body.site).toMatchObject({ id: siteId, name: 'banh-trang' });
    expect((await get('/api/admin/sites?name=khong-co', admin)).status).toBe(404);
    expect((await get('/api/admin/sites?name=..%2Fetc', admin)).status).toBe(400);
  });
});

describe('locking an account', () => {
  it('blocks its publishes and builds, fails its waiting jobs, and is undone by unlocking', async () => {
    const { siteId } = await publishedShop(app, owner, 'banh-trang');
    const [dev] = await app.handle.db.insert(sites).values({ accountId: owner.accountId, name: 'dev-site', kind: 'developer', status: 'draft', createdAt: new Date(), updatedAt: new Date() }).returning();
    if (!dev) throw new Error('no site');
    await app.handle.db.insert(developerSites).values({ siteId: dev.id, source: 'git', repoUrl: 'https://github.com/acme/shop', branch: 'main', settings: { rootDir: '', buildCommand: null, outputDir: '' }, createdAt: new Date(), updatedAt: new Date() });
    const waiting = randomUUID();
    await app.handle.db.insert(jobs).values({ id: waiting, siteId: dev.id, accountId: owner.accountId, type: 'build', status: 'queued', trigger: 'push', createdAt: new Date() });

    const locked = await post(`/api/admin/accounts/${owner.accountId}/lock`, admin, { note: 'lừa đảo' });
    expect(locked.status).toBe(200);
    expect(locked.body.action).toMatchObject({ action: 'lock', status: 'done', accountId: owner.accountId });
    expect((await app.handle.db.select().from(jobs).where(eq(jobs.id, waiting)))[0]).toMatchObject({ status: 'failed', error: 'account-locked' });
    expect((await get('/api/me', owner)).body).toMatchObject({ account: { locked: true } });

    const publish = await post(`/api/sites/${siteId}/publish`, owner);
    expect(publish.status).toBe(403);
    expect(publish.body).toMatchObject({ error: 'account-locked' });
    const build = await post(`/api/sites/${dev.id}/builds`, owner);
    expect(build.status).toBe(403);
    expect(build.body).toMatchObject({ error: 'account-locked' });
    expect((await post(`/api/admin/accounts/${owner.accountId}/lock`, admin)).status).toBe(409);

    expect((await post(`/api/admin/accounts/${owner.accountId}/unlock`, admin)).status).toBe(200);
    expect((await post(`/api/sites/${dev.id}/builds`, owner)).status).toBe(202);
  });
});

describe('reviews and reports', () => {
  it('lists releases held for review and queues the decision; refuses one for a site with nothing waiting', async () => {
    const { siteId } = await publishedShop(app, owner, 'banh-trang');
    expect((await post(`/api/admin/sites/${siteId}/approve`, admin)).status).toBe(409);
    const review: PendingReview = {
      reasons: ['password-input'],
      matches: ['index.html: password field'],
      heldAt: new Date().toISOString(),
      jobId: randomUUID(),
      source: 'template',
      commitSha: null,
      bytes: 10,
      fileCount: 1,
      livePage: null,
      orderForm: null,
      buildKey: null,
    };
    await app.handle.db.update(sites).set({ status: 'pending-review', pendingReleaseId: randomUUID(), pendingReview: review }).where(eq(sites.id, siteId));

    const reviews = await get('/api/admin/reviews', admin);
    expect(reviews.body.sites).toEqual([expect.objectContaining({ id: siteId, review: { reasons: ['password-input'], matches: ['index.html: password field'], heldAt: review.heldAt } })]);
    const res = await post(`/api/admin/sites/${siteId}/reject`, admin);
    expect(res.status).toBe(202);
    expect(res.body.action).toMatchObject({ action: 'reject', status: 'queued' });
    expect((await get(`/api/admin/sites/${siteId}`, admin)).body.site).toMatchObject({ actionQueued: true });
  });

  it('resolves or dismisses an open report once', async () => {
    const { siteId } = await publishedShop(app, owner, 'banh-trang');
    const first = await report(siteId, 'banh-trang');
    const second = await report(siteId, 'banh-trang');
    expect((await post(`/api/admin/reports/${first}/dismiss`, admin, { note: 'không vi phạm' })).body.action).toMatchObject({ action: 'dismiss', note: 'không vi phạm' });
    expect((await post(`/api/admin/reports/${first}/resolve`, admin)).status).toBe(409);
    expect((await post(`/api/admin/reports/${second}/resolve`, admin)).status).toBe(200);
    expect((await get('/api/admin/reports', admin)).body.reports).toEqual([]);
    expect((await get('/api/admin/reports?status=all', admin)).body.reports.map((r: { status: string }) => r.status).sort()).toEqual(['dismissed', 'resolved']);
    expect(await app.handle.db.select().from(adminActions)).toHaveLength(2);
  });
});
