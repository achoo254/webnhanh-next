import { randomUUID } from 'node:crypto';
import { mkdir, mkdtemp, readFile, rm, stat, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {
  accounts,
  adminActions,
  chatLinks,
  developerSites,
  enqueueJob,
  jobs,
  notificationDeliveries,
  openPglite,
  releases,
  siteImageFile,
  siteImages,
  sites,
  TAKEDOWN_KEEP_MS,
  type AdminAction,
  type DbHandle,
} from '@webnhanh/db';
import { currentRelease, hasRelease, listReleases } from '@webnhanh/publish';
import { TEMPLATE_SAMPLES, templateDraft, type SamplePhoto } from '@webnhanh/templates';
import { eq } from 'drizzle-orm';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { pruneTakenDown } from './admin-actions';
import { reviewOutput, reviewPage } from './review';
import { processNextJob, type WorkerDeps } from './worker-loop';

let handle: DbHandle;
let dir: string;
let deps: WorkerDeps;
let now: Date;
const ADMIN_SUB = 'admin-sub';
const quiet = { info: () => undefined, warn: () => undefined };

beforeEach(async () => {
  handle = await openPglite();
  dir = await mkdtemp(path.join(os.tmpdir(), 'webnhanh-abuse-'));
  now = new Date('2026-11-01T03:00:00Z');
  deps = {
    db: handle.db,
    sitesDir: path.join(dir, 'sites'),
    uploadsDir: path.join(dir, 'uploads'),
    workDir: path.join(dir, 'work'),
    buildOutputDir: path.join(dir, 'out'),
    siteMaxBytes: 1024 * 1024,
    madeWith: { name: 'App', url: 'https://app.example.com' },
    appUrl: 'https://app.example.com',
    formSecret: 'f'.repeat(40),
    ffmpegPath: 'ffmpeg',
    adminSubs: [ADMIN_SUB],
    now: () => now,
    log: quiet,
  };
  // The admin signed in once and linked the Chat bot: held releases are told there.
  const [admin] = await handle.db.insert(accounts).values({ sub: ADMIN_SUB, createdAt: now }).returning();
  if (!admin) throw new Error('no admin');
  await handle.db.insert(chatLinks).values({ accountId: admin.id, chatId: 42, createdAt: now });
});

afterEach(async () => {
  await handle.close();
  await rm(dir, { recursive: true, force: true });
});

async function account(): Promise<string> {
  const [row] = await handle.db.insert(accounts).values({ sub: randomUUID(), createdAt: now }).returning();
  if (!row) throw new Error('no account');
  return row.id;
}

/** A developer site and a build of it the builder handed back with `files` as its output. */
async function builtSite(name: string, files: Record<string, string>, accountId?: string): Promise<{ siteId: string; accountId: string; jobId: string }> {
  const owner = accountId ?? (await account());
  const [site] = await handle.db.insert(sites).values({ accountId: owner, name, kind: 'developer', status: 'draft', createdAt: now, updatedAt: now }).returning();
  if (!site) throw new Error('no site');
  await handle.db.insert(developerSites).values({ siteId: site.id, source: 'zip', settings: { rootDir: '', buildCommand: null, outputDir: '' }, createdAt: now, updatedAt: now });
  const jobId = await handBack(site.id, owner, files);
  return { siteId: site.id, accountId: owner, jobId };
}

async function handBack(siteId: string, accountId: string, files: Record<string, string>): Promise<string> {
  const jobId = randomUUID();
  for (const [file, content] of Object.entries(files)) {
    await mkdir(path.dirname(path.join(dir, 'out', jobId, file)), { recursive: true });
    await writeFile(path.join(dir, 'out', jobId, file), content);
  }
  await handle.db.insert(jobs).values({ id: jobId, siteId, accountId, type: 'build', status: 'queued', trigger: 'manual', readyAt: now, notify: true, createdAt: now });
  return jobId;
}

const siteRow = async (siteId: string) => (await handle.db.select().from(sites).where(eq(sites.id, siteId)))[0];
const jobRow = async (jobId: string) => (await handle.db.select().from(jobs).where(eq(jobs.id, jobId)))[0];
const live = (name: string) => readFile(path.join(deps.sitesDir, name, 'current', 'index.html'), 'utf8');

/** What the server writes for an admin action the worker applies (the server's own effects are in its tests). */
async function queueAction(action: AdminAction, siteId: string): Promise<string> {
  const id = randomUUID();
  if (action === 'takedown') await handle.db.update(sites).set({ status: 'removed', takenDownAt: now }).where(eq(sites.id, siteId));
  await handle.db.insert(adminActions).values({ id, action, siteId, status: 'queued', createdAt: now });
  return id;
}

const actionRow = async (id: string) => (await handle.db.select().from(adminActions).where(eq(adminActions.id, id)))[0];

describe('the pre-publish review', () => {
  it('flags password fields in pages and scripts, and bank, wallet or state names in titles', () => {
    expect(reviewPage('<form><input name="u"><input type="password" name="p"></form>').reasons).toEqual(['password-input']);
    expect(reviewPage('<INPUT TYPE=password>').reasons).toEqual(['password-input']);
    expect(reviewPage('<script>h("input",{type:"password"})</script>').reasons).toEqual(['password-input']);
    expect(reviewPage('<title>Vietcombank - Ưu đãi</title>').reasons).toEqual(['sensitive-title']);
    expect(reviewPage('<title>Cổng Dịch vụ công</title>').reasons).toEqual(['sensitive-title']);
    expect(reviewPage('<title>MB Bank</title>').matches).toEqual(['index.html: title names mbbank']);
  });

  it('flags a bank or brand named beside a request to sign in or for a code', () => {
    expect(reviewPage('<title>Thông báo</title><p>Tài khoản Techcombank của bạn bị khoá. Đăng nhập để mở lại.</p>').reasons).toEqual(['credential-request']);
    expect(reviewPage('<p>Facebook: nhập mã OTP để xác minh</p>').reasons).toEqual(['credential-request']);
  });

  it('leaves honest pages alone: a shop with its bank account, words that only look like a name', () => {
    expect(reviewPage('<title>Tiệm bánh Bơ</title><p>Chuyển khoản: STK 0123456789 Vietcombank, chủ tài khoản Nguyễn Văn A.</p>').reasons).toEqual([]);
    expect(reviewPage('<title>Bán kẹo dừa Bến Tre</title><p>Bán kèm hộp quà. Theo dõi trên Facebook.</p>').reasons).toEqual([]);
    expect(reviewPage('<input type="text" name="password-hint">').reasons).toEqual([]);
    expect(reviewPage('<style>.password{}</style><script>const login = 1;</script><p>Vietcombank</p>').reasons).toEqual([]);
  });

  it('reads every page and script of a build output', async () => {
    const out = path.join(dir, 'review');
    await mkdir(path.join(out, 'assets'), { recursive: true });
    await writeFile(path.join(out, 'index.html'), '<title>Shop</title>');
    await writeFile(path.join(out, 'assets', 'app.js'), 'createElement("input",{type:"password"})');
    expect(await reviewOutput(out)).toEqual({ reasons: ['password-input'], matches: ['assets/app.js: password field'] });
  });
});

describe('a build held for review', () => {
  it('copies the release without making it live, tells the owner and the admins, and goes live once approved', async () => {
    const site = await builtSite('dang-nhap-thu', { 'index.html': '<title>Cổng</title><form><input type="password"></form>' });
    expect(await processNextJob(deps)).toBe('done');

    const held = await siteRow(site.siteId);
    expect(held?.status).toBe('pending-review');
    expect(held?.pendingReview?.reasons).toEqual(['password-input']);
    expect(held?.currentReleaseId).toBeNull();
    expect(await currentRelease(deps.sitesDir, 'dang-nhap-thu')).toBeUndefined();
    expect(await hasRelease(deps.sitesDir, 'dang-nhap-thu', held?.pendingReleaseId ?? '')).toBe(true);
    const job = await jobRow(site.jobId);
    expect(job).toMatchObject({ status: 'done', error: 'held-for-review', releaseId: null });
    const notices = await handle.db.select().from(notificationDeliveries);
    expect(notices.map((n) => ({ review: n.reviewSiteId, job: n.jobId, channel: n.channel }))).toEqual(
      expect.arrayContaining([{ review: site.siteId, job: null, channel: 'chat' }]),
    );

    const approve = await queueAction('approve', site.siteId);
    expect(await processNextJob(deps)).toBe('done');
    expect((await actionRow(approve))?.status).toBe('done');
    const approved = await siteRow(site.siteId);
    expect(approved).toMatchObject({ status: 'published', currentReleaseId: held?.pendingReleaseId, pendingReleaseId: null, pendingReview: null });
    expect(await live('dang-nhap-thu')).toContain('type="password"');
    expect(await handle.db.select().from(releases).where(eq(releases.siteId, site.siteId))).toHaveLength(1);
  });

  it('keeps the live release (and its forms) while a new one waits, and deletes the new one when rejected', async () => {
    const site = await builtSite('trang-co-san', { 'index.html': '<title>Trang</title><p>Xin chào</p>' });
    expect(await processNextJob(deps)).toBe('done');
    const first = await siteRow(site.siteId);
    expect(first?.status).toBe('published');

    await handBack(site.siteId, site.accountId, { 'index.html': '<title>Agribank</title>' });
    expect(await processNextJob(deps)).toBe('done');
    const held = await siteRow(site.siteId);
    expect(held).toMatchObject({ status: 'pending-review', currentReleaseId: first?.currentReleaseId });
    expect(await live('trang-co-san')).toContain('Xin chào');

    const reject = await queueAction('reject', site.siteId);
    expect(await processNextJob(deps)).toBe('done');
    expect((await actionRow(reject))?.status).toBe('done');
    expect(await siteRow(site.siteId)).toMatchObject({ status: 'published', currentReleaseId: first?.currentReleaseId, pendingReleaseId: null });
    expect(await hasRelease(deps.sitesDir, 'trang-co-san', held?.pendingReleaseId ?? '')).toBe(false);
    expect(await live('trang-co-san')).toContain('Xin chào');
  });

  it('holds a template page whose title names a bank, and links every published page to the report form', async () => {
    const owner = await account();
    const [site] = await handle.db.insert(sites).values({ accountId: owner, name: 'ho-tro', kind: 'template', template: 'profile', status: 'draft', createdAt: now, updatedAt: now }).returning();
    if (!site) throw new Error('no site');
    const ids = new Map<string, string>();
    const value = templateDraft('profile', (photo: SamplePhoto) => ids.get(photo.file) ?? ids.set(photo.file, randomUUID()).get(photo.file) ?? '', true);
    for (const [file, id] of ids) {
      const sample = Object.values(TEMPLATE_SAMPLES.profile).flat().find((photo) => photo.file === file);
      const width = sample?.width ?? 600;
      await mkdir(path.dirname(siteImageFile(deps.uploadsDir, site.id, id, width)), { recursive: true });
      await writeFile(siteImageFile(deps.uploadsDir, site.id, id, width), 'webp');
      await handle.db.insert(siteImages).values({ id, siteId: site.id, width, height: sample?.height ?? 600, widths: [width], bytes: 10, sample: true, createdAt: now });
    }
    await handle.db.update(sites).set({ draft: { ...value.draft, name: 'Vietcombank Hỗ Trợ' } }).where(eq(sites.id, site.id));
    const queued = await enqueueJob(handle.db, { siteId: site.id, accountId: owner, type: 'publish' }, now);
    if (!queued.ok) throw new Error(queued.reason);
    expect(await processNextJob(deps)).toBe('done');
    expect(await jobRow(queued.job.id)).toMatchObject({ status: 'done', error: 'held-for-review', releaseId: null });
    const held = await siteRow(site.id);
    expect(held?.pendingReview?.reasons).toEqual(['sensitive-title']);
    expect(held?.pendingReview?.livePage).not.toBeNull();

    await queueAction('approve', site.id);
    expect(await processNextJob(deps)).toBe('done');
    const page = await live('ho-tro');
    expect(page).toContain('<a href="https://app.example.com/bao-cao?site=ho-tro" rel="nofollow">Báo cáo vi phạm</a>');
    expect((await siteRow(site.id))?.livePage).not.toBeNull();
  });
});

describe('takedown and restore', () => {
  it('puts the shared "removed" page live in one action, keeps the releases, and restores the last one', async () => {
    const site = await builtSite('lua-dao', { 'index.html': '<title>Quà tặng</title><p>Nhận quà</p>', 'qua.html': 'x' });
    expect(await processNextJob(deps)).toBe('done');
    const published = await siteRow(site.siteId);
    const takedown = await queueAction('takedown', site.siteId);
    expect(await processNextJob(deps)).toBe('done');
    expect((await actionRow(takedown))?.status).toBe('done');

    const removed = await siteRow(site.siteId);
    expect(removed?.takedownReleaseId).not.toBeNull();
    expect(await currentRelease(deps.sitesDir, 'lua-dao')).toBe(removed?.takedownReleaseId);
    const page = await live('lua-dao');
    expect(page).toContain('Website này đã bị gỡ');
    expect(page).toContain('noreply@hoandat.io.vn');
    expect(page).not.toContain('<script');
    // Every other path shows it too, and the real release stays for review.
    expect(await readFile(path.join(deps.sitesDir, 'lua-dao', 'current', '404.html'), 'utf8')).toBe(page);
    expect(await hasRelease(deps.sitesDir, 'lua-dao', published?.currentReleaseId ?? '')).toBe(true);

    // The owner cannot publish it again.
    const again = await handBack(site.siteId, site.accountId, { 'index.html': '<p>lại</p>' });
    expect(await processNextJob(deps)).toBe('failed');
    expect(await jobRow(again)).toMatchObject({ status: 'failed', error: 'site-removed' });
    expect(await enqueueJob(handle.db, { siteId: site.siteId, accountId: site.accountId, type: 'build' }, now)).toEqual({ ok: false, reason: 'site-removed' });

    const restore = await queueAction('restore', site.siteId);
    expect(await processNextJob(deps)).toBe('done');
    expect((await actionRow(restore))?.status).toBe('done');
    expect(await siteRow(site.siteId)).toMatchObject({ status: 'published', currentReleaseId: published?.currentReleaseId, takenDownAt: null, takedownReleaseId: null });
    expect(await live('lua-dao')).toContain('Nhận quà');
    expect(await hasRelease(deps.sitesDir, 'lua-dao', removed?.takedownReleaseId ?? '')).toBe(false);
  });

  it('deletes the releases of a site taken down over 30 days ago; a restore then leaves a draft', async () => {
    const site = await builtSite('cu-qua', { 'index.html': '<p>cũ</p>' });
    expect(await processNextJob(deps)).toBe('done');
    await queueAction('takedown', site.siteId);
    expect(await processNextJob(deps)).toBe('done');
    const removed = await siteRow(site.siteId);

    now = new Date(now.getTime() + TAKEDOWN_KEEP_MS - 60_000);
    expect(await pruneTakenDown(deps)).toBe(0);
    now = new Date(now.getTime() + 120_000);
    expect(await pruneTakenDown(deps)).toBe(1);
    expect(await listReleases(deps.sitesDir, 'cu-qua')).toEqual([removed?.takedownReleaseId]);
    expect((await siteRow(site.siteId))?.currentReleaseId).toBeNull();

    await queueAction('restore', site.siteId);
    expect(await processNextJob(deps)).toBe('done');
    expect(await siteRow(site.siteId)).toMatchObject({ status: 'draft', currentReleaseId: null });
    await expect(stat(path.join(deps.sitesDir, 'cu-qua'))).rejects.toThrow();
  });
});

describe('a locked account', () => {
  it('cannot queue a publish or a build, and a job queued before the lock is refused when it would publish', async () => {
    const site = await builtSite('bi-khoa', { 'index.html': '<p>trang</p>' });
    await handle.db.update(accounts).set({ lockedAt: now }).where(eq(accounts.id, site.accountId));
    expect(await processNextJob(deps)).toBe('failed');
    expect(await jobRow(site.jobId)).toMatchObject({ status: 'failed', error: 'account-locked' });
    expect(await currentRelease(deps.sitesDir, 'bi-khoa')).toBeUndefined();
    expect(await enqueueJob(handle.db, { siteId: site.siteId, accountId: site.accountId, type: 'publish' }, now)).toEqual({ ok: false, reason: 'account-locked' });
  });

  it('cannot have a held release approved', async () => {
    const site = await builtSite('khoa-sau', { 'index.html': '<input type="password">' });
    expect(await processNextJob(deps)).toBe('done');
    await handle.db.update(accounts).set({ lockedAt: now }).where(eq(accounts.id, site.accountId));
    const approve = await queueAction('approve', site.siteId);
    expect(await processNextJob(deps)).toBe('done');
    expect(await actionRow(approve)).toMatchObject({ status: 'failed', error: 'account-locked' });
    expect((await siteRow(site.siteId))?.status).toBe('pending-review');
  });
});
