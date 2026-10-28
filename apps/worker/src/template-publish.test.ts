import { randomUUID } from 'node:crypto';
import { mkdir, mkdtemp, readdir, readFile, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { accounts, enqueueJob, jobs, notificationDeliveries, openPglite, releases, siteImageFile, siteImages, sites, verifyFormToken, type DbHandle } from '@webnhanh/db';
import { currentRelease } from '@webnhanh/publish';
import { ORDER_SCRIPT, TEMPLATE_SAMPLES, templateDraft, type SamplePhoto, type TemplateId, type WeddingDraft } from '@webnhanh/templates';
import { eq } from 'drizzle-orm';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { refreshNextWedding, vietnamDayStart } from './wedding-refresh';
import { processNextJob, type WorkerDeps } from './worker-loop';

let handle: DbHandle;
let dir: string;
let deps: WorkerDeps;
let now: Date;
const FORM_SECRET = 'f'.repeat(40);
const quiet = { info: () => undefined, warn: () => undefined };

beforeEach(async () => {
  handle = await openPglite();
  dir = await mkdtemp(path.join(os.tmpdir(), 'webnhanh-templates-'));
  // 10:00 on 1 November 2026 in Vietnam.
  now = new Date('2026-11-01T03:00:00Z');
  deps = {
    db: handle.db,
    sitesDir: path.join(dir, 'sites'),
    uploadsDir: path.join(dir, 'uploads'),
    workDir: path.join(dir, 'work'),
    siteMaxBytes: 1024 * 1024,
    madeWith: { name: 'App', url: 'https://app.example.com' },
    appUrl: 'https://app.example.com',
    formSecret: FORM_SECRET,
    ffmpegPath: 'ffmpeg',
    now: () => now,
    log: quiet,
  };
});

afterEach(async () => {
  await handle.close();
  await rm(dir, { recursive: true, force: true });
});

/** A site of `template` with the template's filled-in sample draft, its sample photos stored as uploads. */
async function templateSite(template: TemplateId, name: string, change: (draft: Record<string, unknown>) => Record<string, unknown> = (d) => d) {
  const [account] = await handle.db.insert(accounts).values({ sub: randomUUID(), createdAt: now }).returning();
  if (!account) throw new Error('no account');
  const [site] = await handle.db.insert(sites).values({ accountId: account.id, name, kind: 'template', template, status: 'draft', createdAt: now, updatedAt: now }).returning();
  if (!site) throw new Error('no site');
  const ids = new Map<string, string>();
  const photoId = (photo: SamplePhoto): string => {
    const known = ids.get(photo.file);
    if (known) return known;
    const id = randomUUID();
    ids.set(photo.file, id);
    return id;
  };
  const value = templateDraft(template, photoId, true);
  for (const [file, id] of ids) {
    const sample = Object.values(TEMPLATE_SAMPLES[template]).flat().find((photo) => photo.file === file);
    const width = sample?.width ?? 600;
    await mkdir(path.dirname(siteImageFile(deps.uploadsDir, site.id, id, width)), { recursive: true });
    await writeFile(siteImageFile(deps.uploadsDir, site.id, id, width), `webp ${file}`);
    await handle.db.insert(siteImages).values({ id, siteId: site.id, width, height: sample?.height ?? 600, widths: [width], bytes: 10, sample: true, createdAt: now });
  }
  await handle.db.update(sites).set({ draft: change({ ...value.draft }) }).where(eq(sites.id, site.id));
  return { siteId: site.id, accountId: account.id, photos: ids.size };
}

async function publish(site: { siteId: string; accountId: string }): Promise<string> {
  const queued = await enqueueJob(handle.db, { siteId: site.siteId, accountId: site.accountId, type: 'publish' }, now);
  if (!queued.ok) throw new Error('refused');
  expect(await processNextJob(deps)).toBe('done');
  const [job] = await handle.db.select().from(jobs).where(eq(jobs.id, queued.job.id));
  expect(job?.status, job?.error ?? '').toBe('done');
  return queued.job.id;
}

const livePage = (name: string) => readFile(path.join(deps.sitesDir, name, 'current', 'index.html'), 'utf8');
const siteRow = async (siteId: string) => (await handle.db.select().from(sites).where(eq(sites.id, siteId)))[0];

describe('publishing every template', () => {
  it.each([
    ['tet', 'chuc-tet', 'Gia đình Minh Anh'],
    ['cafe', 'goc-nho', 'Góc Nhỏ Cà Phê'],
    ['profile', 'lan-anh', 'Lan Anh'],
  ] as const)('publishes a %s page with its photos and fonts, and no form', async (template, name, text) => {
    const site = await templateSite(template, name);
    await publish(site);
    const html = await livePage(name);
    expect(html).toContain(text);
    expect(html).not.toContain('<script>');
    expect(html).not.toContain('<form');
    expect(html).toContain(`<meta property="og:url" content="https://${name}.hoandat.io.vn/">`);
    const live = path.join(deps.sitesDir, name, 'current');
    expect(await readdir(path.join(live, 'img')).catch(() => [])).toHaveLength(site.photos);
    expect((await readdir(path.join(live, 'fonts'))).length).toBe(6);
    const row = await siteRow(site.siteId);
    expect(row?.status).toBe('published');
    expect(row?.orderForm).toBeNull();
    expect(row?.livePage).toMatchObject({ draft: { palette: expect.any(String) }, shareImage: null });
    expect(row?.livePage?.images).toHaveLength(site.photos);
  });

  it('puts the reply form on a wedding page, signed for the site, and records that it takes replies', async () => {
    const site = await templateSite('wedding', 'minh-thao');
    await publish(site);
    const html = await livePage('minh-thao');
    expect(html).toContain('action="https://app.example.com/f/minh-thao"');
    expect(html).toContain('<input type="hidden" name="kind" value="rsvp">');
    expect(html.match(/<script>/g)).toHaveLength(1);
    expect(html).toContain(`<script>${ORDER_SCRIPT}</script>`);
    const token = /name="_t" value="([^"]+)"/.exec(html)?.[1];
    expect(verifyFormToken(FORM_SECRET, site.siteId, token, now)).not.toBeNull();
    // 12.12.2026 is 41 days after 1.11.2026.
    expect(html).toContain('Còn 41 ngày');
    expect((await siteRow(site.siteId))?.orderForm).toEqual({ products: [], rsvp: true });
  });

  it('publishes a wedding without replies with no form at all', async () => {
    const site = await templateSite('wedding', 'khong-hoi', (draft) => ({ ...draft, rsvp: false }));
    await publish(site);
    expect(await livePage('khong-hoi')).not.toContain('<form');
    expect((await siteRow(site.siteId))?.orderForm).toBeNull();
  });

  it('fails a draft of the wrong template without touching the site', async () => {
    const site = await templateSite('cafe', 'sai-mau');
    await handle.db.update(sites).set({ template: 'profile' }).where(eq(sites.id, site.siteId));
    const queued = await enqueueJob(handle.db, { siteId: site.siteId, accountId: site.accountId, type: 'publish' }, now);
    if (!queued.ok) throw new Error('refused');
    expect(await processNextJob(deps)).toBe('failed');
    expect((await handle.db.select().from(jobs).where(eq(jobs.id, queued.job.id)))[0]?.error).toBe('draft-invalid');
    expect((await siteRow(site.siteId))?.currentReleaseId).toBeNull();
  });
});

describe('the daily wedding countdown', () => {
  const DAY = 24 * 60 * 60 * 1000;

  /** A wedding published at `publishedAt`, on `date`. */
  async function publishedWedding(name: string, date: string, publishedAt: Date) {
    const site = await templateSite('wedding', name, (draft) => ({ ...draft, date }));
    const today = now;
    now = publishedAt;
    await publish(site);
    now = today;
    return site;
  }

  it('renders yesterday\'s page again with today\'s countdown, from the live page, not the draft being edited', async () => {
    const site = await publishedWedding('minh-thao', '2026-12-12', new Date(now.getTime() - DAY));
    const before = await siteRow(site.siteId);
    const firstRelease = before?.currentReleaseId;
    expect(await livePage('minh-thao')).toContain('Còn 42 ngày');
    // The couple is editing: none of that may go live by itself.
    const draft = before?.draft as WeddingDraft;
    await handle.db.update(sites).set({ draft: { ...draft, groom: 'Chưa đăng' } }).where(eq(sites.id, site.siteId));

    expect(await refreshNextWedding(deps)).toBe('minh-thao');
    const html = await livePage('minh-thao');
    expect(html).toContain('Còn 41 ngày');
    expect(html).not.toContain('Chưa đăng');
    // The photos and fonts came along from the live release; the form is signed again.
    const live = path.join(deps.sitesDir, 'minh-thao', 'current');
    expect(await readdir(path.join(live, 'img'))).toHaveLength(site.photos);
    expect((await readdir(path.join(live, 'fonts'))).length).toBe(6);
    expect(verifyFormToken(FORM_SECRET, site.siteId, /name="_t" value="([^"]+)"/.exec(html)?.[1], now)?.getTime()).toBe(Math.floor(now.getTime() / 1000) * 1000);

    const after = await siteRow(site.siteId);
    expect(after?.currentReleaseId).not.toBe(firstRelease);
    expect(await currentRelease(deps.sitesDir, 'minh-thao')).toBe(after?.currentReleaseId);
    expect(after?.updatedAt.getTime()).toBe(before?.updatedAt.getTime());
    // No job, no notification: the owner did nothing.
    expect(await handle.db.select().from(jobs)).toHaveLength(1);
    expect(await handle.db.select().from(notificationDeliveries)).toHaveLength(0);
    // Once a day.
    expect(await refreshNextWedding(deps)).toBeNull();
    expect(await handle.db.select().from(releases).where(eq(releases.siteId, site.siteId))).toHaveLength(2);
  });

  it('takes the countdown off the day after the wedding, then leaves the page alone', async () => {
    await publishedWedding('cuoi-roi', '2026-10-31', new Date('2026-10-31T02:00:00Z'));
    expect(await livePage('cuoi-roi')).toContain('Hôm nay là ngày cưới');
    expect(await refreshNextWedding(deps)).toBe('cuoi-roi');
    const html = await livePage('cuoi-roi');
    expect(html).not.toContain('class="countdown"');
    now = new Date(now.getTime() + DAY);
    expect(await refreshNextWedding(deps)).toBeNull();
  });

  it('leaves pages published today, past weddings and other templates alone', async () => {
    await publishedWedding('hom-nay', '2026-12-12', new Date(now.getTime() - 60_000));
    await publishedWedding('da-qua', '2026-09-01', new Date(now.getTime() - 30 * DAY));
    const tet = await templateSite('tet', 'chuc-tet');
    now = new Date(now.getTime() - 2 * DAY);
    await publish(tet);
    now = new Date(now.getTime() + 2 * DAY);
    expect(await refreshNextWedding(deps)).toBeNull();
  });

  it('starts the day at midnight in Vietnam', () => {
    expect(vietnamDayStart(new Date('2026-11-01T03:00:00Z')).toISOString()).toBe('2026-10-31T17:00:00.000Z');
    expect(vietnamDayStart(new Date('2026-10-31T16:59:59Z')).toISOString()).toBe('2026-10-30T17:00:00.000Z');
  });
});
