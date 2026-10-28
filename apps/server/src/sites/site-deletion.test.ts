import { randomUUID } from 'node:crypto';
import { access, mkdir, writeFile } from 'node:fs/promises';
import {
  abuseReports,
  accounts,
  adminActions,
  buildMsToday,
  DELETED_NAME_HOLD_MS,
  developerSites,
  jobs,
  siteDeletions,
  siteImages,
  siteNameHolds,
  sites,
  startOfBuildDay,
  submissions,
} from '@webnhanh/db';
import { inboxZip } from '@webnhanh/worker/build';
import { eq } from 'drizzle-orm';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { ORIGIN, publishedShop, startTestApp, type TestApp } from '../test-support';

let app: TestApp;
let owner: { accountId: string; cookie: string };
let stranger: { accountId: string; cookie: string };

beforeEach(async () => {
  app = await startTestApp({ sitesPerAccount: 2 });
  owner = await app.signIn('owner');
  stranger = await app.signIn('stranger');
});

afterEach(async () => {
  await app.close();
});

async function create(name: string, who = owner) {
  return app.http().post('/api/sites').set('Cookie', who.cookie).set('Origin', ORIGIN).send({ name, template: 'shop' });
}

async function createdId(name: string, who = owner): Promise<string> {
  const res = await create(name, who);
  expect(res.status, JSON.stringify(res.body)).toBe(201);
  return (res.body as { site: { id: string } }).site.id;
}

function remove(siteId: string, confirm: unknown, who = owner) {
  return app.http().delete(`/api/sites/${siteId}`).set('Cookie', who.cookie).set('Origin', ORIGIN).send({ confirm });
}

async function exists(file: string): Promise<boolean> {
  return access(file).then(
    () => true,
    () => false,
  );
}

describe('deleting a site', () => {
  it('deletes a published site and its rows, holds the name 30 days for everyone, and queues the files for the worker', async () => {
    const { siteId } = await publishedShop(app, owner, 'tiem-xoa');
    const imageId = randomUUID();
    const now = new Date();
    await app.handle.db.insert(siteImages).values({ id: imageId, siteId, width: 10, height: 10, widths: [10], bytes: 1, createdAt: now });
    await app.handle.db.insert(submissions).values({ id: randomUUID(), siteId, kind: 'order', data: { name: 'A', phone: '0912345678', address: 'x', productKey: 'p1', productName: 'Bánh', quantity: 1, note: '' }, createdAt: now });
    await app.handle.db.insert(jobs).values({ id: randomUUID(), siteId, accountId: owner.accountId, type: 'publish', status: 'done', createdAt: now });
    // An old name from a rename: still held, and taken off the web too.
    await app.handle.db.insert(siteNameHolds).values({ name: 'tiem-cu', siteId, heldUntil: new Date(now.getTime() + 60_000), createdAt: now });
    // An admin's earlier action on the site: the log outlives it.
    const actionId = randomUUID();
    await app.handle.db.insert(adminActions).values({ id: actionId, action: 'resolve', siteId, siteName: 'tiem-xoa', status: 'done', createdAt: now });

    const res = await remove(siteId, ' tiem-xoa ');
    expect(res.status, JSON.stringify(res.body)).toBe(204);

    expect(await app.handle.db.select().from(sites).where(eq(sites.id, siteId))).toEqual([]);
    expect(await app.handle.db.select().from(siteImages).where(eq(siteImages.siteId, siteId))).toEqual([]);
    expect(await app.handle.db.select().from(submissions).where(eq(submissions.siteId, siteId))).toEqual([]);
    expect(await app.handle.db.select().from(jobs).where(eq(jobs.siteId, siteId))).toEqual([]);
    const [action] = await app.handle.db.select().from(adminActions).where(eq(adminActions.id, actionId));
    expect(action).toMatchObject({ siteId: null, siteName: 'tiem-xoa' });

    const [deletion] = await app.handle.db.select().from(siteDeletions);
    expect(deletion).toMatchObject({ siteId, accountId: owner.accountId, names: ['tiem-xoa', 'tiem-cu'], status: 'queued', buildMs: 0 });
    const holds = await app.handle.db.select().from(siteNameHolds);
    const held = holds.find((hold) => hold.name === 'tiem-xoa');
    expect(held?.siteId).toBeNull();
    expect(Math.abs((held?.heldUntil.getTime() ?? 0) - Date.now() - DELETED_NAME_HOLD_MS)).toBeLessThan(60_000);
    expect(holds.find((hold) => hold.name === 'tiem-cu')?.siteId).toBeNull();

    // Nobody takes the name, the owner included.
    expect((await create('tiem-xoa', stranger)).body).toEqual({ error: 'name-taken' });
    expect((await create('tiem-xoa')).body).toEqual({ error: 'name-taken' });
    expect((await create('tiem-cu', stranger)).body).toEqual({ error: 'name-taken' });
    expect((await app.http().get(`/api/sites/${siteId}`).set('Cookie', owner.cookie)).status).toBe(404);
  });

  it('frees the slot of the template site limit at once', async () => {
    const first = await createdId('mot-trang');
    await createdId('hai-trang');
    expect((await create('ba-trang')).body).toMatchObject({ error: 'site-limit' });
    expect((await remove(first, 'mot-trang')).status).toBe(204);
    expect((await create('ba-trang')).status).toBe(201);
  });

  it('answers 404 for a site of another account, and keeps it', async () => {
    const id = await createdId('cua-nguoi-khac', stranger);
    const res = await remove(id, 'cua-nguoi-khac');
    expect(res.status).toBe(404);
    expect(res.body).toEqual({ error: 'site-not-found' });
    expect(await app.handle.db.select({ id: sites.id }).from(sites).where(eq(sites.id, id))).toHaveLength(1);
  });

  it('needs the exact name typed, from the app origin', async () => {
    const id = await createdId('ten-dung');
    for (const confirm of [undefined, '', 'ten-sai', 'TEN-DUNG', 'ten-dung.hoandat.io.vn']) {
      const res = await remove(id, confirm);
      expect(res.status, String(confirm)).toBe(400);
      expect(res.body).toEqual({ error: 'confirm-name' });
    }
    const foreign = await app.http().delete(`/api/sites/${id}`).set('Cookie', owner.cookie).set('Origin', 'https://evil.example').send({ confirm: 'ten-dung' });
    expect(foreign.status).toBe(403);
    expect(await app.handle.db.select({ id: sites.id }).from(sites).where(eq(sites.id, id))).toHaveLength(1);
    expect(await app.handle.db.select().from(siteDeletions)).toEqual([]);
  });

  it('waits for a publish or build of the site that is queued or running', async () => {
    const id = await createdId('dang-dang');
    const jobId = randomUUID();
    await app.handle.db.insert(jobs).values({ id: jobId, siteId: id, accountId: owner.accountId, type: 'publish', status: 'queued', createdAt: new Date() });
    expect((await remove(id, 'dang-dang')).body).toEqual({ error: 'job-active' });
    await app.handle.db.update(jobs).set({ status: 'running' }).where(eq(jobs.id, jobId));
    const res = await remove(id, 'dang-dang');
    expect(res.status).toBe(409);
    expect(res.body).toEqual({ error: 'job-active' });
    await app.handle.db.update(jobs).set({ status: 'failed' }).where(eq(jobs.id, jobId));
    expect((await remove(id, 'dang-dang')).status).toBe(204);
  });

  it('keeps a site taken down, one with an open abuse report, and those of a locked account', async () => {
    const removed = await createdId('bi-go');
    await app.handle.db.update(sites).set({ status: 'removed', takenDownAt: new Date() }).where(eq(sites.id, removed));
    const res = await remove(removed, 'bi-go');
    expect(res.status).toBe(403);
    expect(res.body).toEqual({ error: 'site-removed' });

    const reported = await createdId('bi-bao-cao');
    const reportId = randomUUID();
    await app.handle.db.insert(abuseReports).values({ id: reportId, siteId: reported, siteName: 'bi-bao-cao', category: 'scam', details: 'lừa đảo', status: 'open', createdAt: new Date() });
    const refused = await remove(reported, 'bi-bao-cao');
    expect(refused.status).toBe(409);
    expect(refused.body).toEqual({ error: 'report-open' });
    // Once an admin dismissed it, the owner may delete; the report keeps the name.
    await app.handle.db.update(abuseReports).set({ status: 'dismissed', handledAt: new Date() }).where(eq(abuseReports.id, reportId));
    expect((await remove(reported, 'bi-bao-cao')).status).toBe(204);
    const [report] = await app.handle.db.select().from(abuseReports).where(eq(abuseReports.id, reportId));
    expect(report).toMatchObject({ siteId: null, siteName: 'bi-bao-cao' });

    const locked = await app.signIn('locked');
    const lockedSite = await createdId('bi-khoa', locked);
    await app.handle.db.update(accounts).set({ lockedAt: new Date() }).where(eq(accounts.id, locked.accountId));
    expect((await remove(lockedSite, 'bi-khoa', locked)).body).toEqual({ error: 'account-locked' });
    expect(await app.handle.db.select({ id: sites.id }).from(sites).where(eq(sites.id, removed))).toHaveLength(1);
    expect(await app.handle.db.select({ id: sites.id }).from(sites).where(eq(sites.id, lockedSite))).toHaveLength(1);
  });

  it('deletes a developer site with its zip and webhook, frees its slot, and still counts its build minutes today', async () => {
    const make = (name: string) => app.http().post('/api/developer/sites').set('Cookie', owner.cookie).set('Origin', ORIGIN).send({ name, source: 'zip' });
    const ids: string[] = [];
    for (const name of ['dev-mot', 'dev-hai', 'dev-ba']) {
      const res = await make(name);
      expect(res.status, JSON.stringify(res.body)).toBe(201);
      ids.push((res.body as { site: { id: string } }).site.id);
    }
    expect((await make('dev-bon')).body).toMatchObject({ error: 'developer-site-limit' });
    const [id] = ids;
    if (!id || !app.config.buildInboxDir) throw new Error('no site or inbox');
    const inbox = app.config.buildInboxDir;
    const zip = inboxZip({ inbox, out: inbox, work: inbox, cache: inbox }, id);
    await mkdir(inbox, { recursive: true });
    await writeFile(zip, 'zip');
    const dayStart = startOfBuildDay(new Date()).getTime();
    await app.handle.db.insert(jobs).values({ id: randomUUID(), siteId: id, accountId: owner.accountId, type: 'build', status: 'failed', createdAt: new Date(dayStart), startedAt: new Date(dayStart), finishedAt: new Date(dayStart + 5 * 60_000) });

    expect((await remove(id, 'dev-mot')).status).toBe(204);
    expect(await exists(zip)).toBe(false);
    expect(await app.handle.db.select().from(developerSites).where(eq(developerSites.siteId, id))).toEqual([]);
    expect(await buildMsToday(app.handle.db, owner.accountId, new Date())).toBe(5 * 60_000);
    expect((await make('dev-bon')).status).toBe(201);
  });
});
