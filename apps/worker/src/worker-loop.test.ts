import { spawnSync } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { mkdir, mkdtemp, readdir, readFile, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { accounts, enqueueJob, verifyFormToken, jobs, NAME_HOLD_MS, openPglite, releases, siteImageFile, siteImages, siteNameHolds, sites, type DbHandle } from '@webnhanh/db';
import { currentRelease, publishRelease } from '@webnhanh/publish';
import { DEFAULT_STYLE, styleFontFiles, type ShopDraft } from '@webnhanh/templates';
import { eq } from 'drizzle-orm';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { cleanup, UNUSED_IMAGE_AGE_MS } from './cleanup';
import { PUBLISH_STEPS } from './publish-job';
import { processNextJob, type WorkerDeps } from './worker-loop';

let handle: DbHandle;
let dir: string;
let deps: WorkerDeps;
const quiet = { info: () => undefined, warn: () => undefined };
const FORM_SECRET = 'f'.repeat(40);
/** A real Chrome for the share picture test (CHROME_PATH), else that test is skipped. */
const CHROME = process.env.CHROME_PATH;

beforeEach(async () => {
  handle = await openPglite();
  dir = await mkdtemp(path.join(os.tmpdir(), 'webnhanh-worker-'));
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
    now: () => new Date(),
    log: quiet,
  };
});

afterEach(async () => {
  await handle.close();
  await rm(dir, { recursive: true, force: true });
});

/** A stored photo of `siteId` with one file per width. */
async function photo(siteId: string, widths: number[], createdAt = new Date()): Promise<string> {
  const id = randomUUID();
  for (const width of widths) {
    await mkdir(path.dirname(siteImageFile(deps.uploadsDir, siteId, id, width)), { recursive: true });
    await writeFile(siteImageFile(deps.uploadsDir, siteId, id, width), `webp ${width}`);
  }
  const last = widths[widths.length - 1] ?? 1;
  await handle.db.insert(siteImages).values({ id, siteId, width: last, height: last, widths, bytes: 10, createdAt });
  return id;
}

/** A draft as stored: drafts saved before styles existed have no `style`. */
type StoredDraft = ShopDraft | Omit<ShopDraft, 'style'>;

async function shopSite(name: string, draft: (images: { cover: string; product: string }) => StoredDraft): Promise<{ siteId: string; accountId: string }> {
  const now = new Date();
  const [account] = await handle.db.insert(accounts).values({ sub: randomUUID(), createdAt: now }).returning();
  if (!account) throw new Error('no account');
  const [site] = await handle.db
    .insert(sites)
    .values({ accountId: account.id, name, kind: 'template', template: 'shop', status: 'draft', createdAt: now, updatedAt: now })
    .returning();
  if (!site) throw new Error('no site');
  const cover = await photo(site.id, [480, 960]);
  const product = await photo(site.id, [480]);
  await handle.db.update(sites).set({ draft: draft({ cover, product }) }).where(eq(sites.id, site.id));
  return { siteId: site.id, accountId: account.id };
}

const fullDraft = ({ cover, product }: { cover: string; product: string }): ShopDraft => ({
  name: 'Tiệm <Bơ>',
  description: 'Giao tận nơi',
  cover,
  products: [{ key: 'p1', name: 'Bánh tráng trộn', image: product, description: '', price: '25k' }],
  contacts: { zalo: '0912345678', phone: '', facebook: '' },
  palette: 'leaf',
  style: 'am-cung',
});

async function queuePublish(site: { siteId: string; accountId: string }): Promise<string> {
  const queued = await enqueueJob(handle.db, { ...site, type: 'publish' }, new Date());
  if (!queued.ok) throw new Error('refused');
  return queued.job.id;
}

async function jobRow(id: string) {
  const [row] = await handle.db.select().from(jobs).where(eq(jobs.id, id));
  if (!row) throw new Error('no job');
  return row;
}

describe('publish job', () => {
  it('renders the draft, copies its photos and makes the release live, timing each step', async () => {
    const site = await shopSite('nha-bo', fullDraft);
    const jobId = await queuePublish(site);
    expect(await processNextJob(deps)).toBe('done');

    const job = await jobRow(jobId);
    expect(job.status).toBe('done');
    expect(job.steps.map((s) => s.name)).toEqual([...PUBLISH_STEPS]);
    expect(job.steps.every((s) => s.finishedAt !== undefined && s.finishedAt >= s.startedAt)).toBe(true);
    const [stored] = await handle.db.select().from(sites).where(eq(sites.id, site.siteId));
    expect(stored?.status).toBe('published');
    expect(stored?.currentReleaseId).toBe(job.releaseId);
    expect(await currentRelease(deps.sitesDir, 'nha-bo')).toBe(job.releaseId);
    const [release] = await handle.db.select().from(releases).where(eq(releases.siteId, site.siteId));
    // The page, three photo files and the style's six font files.
    expect(release).toMatchObject({ source: 'template', fileCount: 10 });

    const live = path.join(deps.sitesDir, 'nha-bo', 'current');
    const html = await readFile(path.join(live, 'index.html'), 'utf8');
    expect(html).toContain('<h1>Tiệm &lt;Bơ&gt;</h1>');
    expect(html).toContain('Làm bằng App');
    expect((await readdir(path.join(live, 'img'))).length).toBe(3);
    expect((await readdir(path.join(live, 'fonts'))).sort()).toEqual(styleFontFiles('am-cung').map((f) => f.file).sort());
    expect(html).toContain('<body class="s-am-cung');
    expect(html).toContain('url(fonts/baloo-2-latin-700-normal.woff2)');
    expect(html).toContain('font-src &#39;self&#39;');
    // Nothing is left in the work directory.
    expect(await readdir(deps.workDir ?? '')).toEqual([]);
  });

  it('puts the order form on the page, signed for the site, and records what it offers', async () => {
    const site = await shopSite('don-hang', fullDraft);
    await queuePublish(site);
    expect(await processNextJob(deps)).toBe('done');
    const html = await readFile(path.join(deps.sitesDir, 'don-hang', 'current', 'index.html'), 'utf8');
    expect(html).toContain('action="https://app.example.com/f/don-hang"');
    const token = /name="_t" value="([^"]+)"/.exec(html)?.[1];
    expect(verifyFormToken(FORM_SECRET, site.siteId, token, new Date())).not.toBeNull();
    expect(html).toContain('<meta property="og:url" content="https://don-hang.hoandat.io.vn/">');
    const [stored] = await handle.db.select().from(sites).where(eq(sites.id, site.siteId));
    expect(stored?.orderForm).toEqual({ products: [{ key: 'p1', name: 'Bánh tráng trộn' }] });
  });

  it('publishes a draft saved before styles existed in the default style', async () => {
    const site = await shopSite('kieu-cu', (images) => {
      const { style: _style, ...legacy } = fullDraft(images);
      return legacy;
    });
    await queuePublish(site);
    expect(await processNextJob(deps)).toBe('done');
    const live = path.join(deps.sitesDir, 'kieu-cu', 'current');
    expect(await readFile(path.join(live, 'index.html'), 'utf8')).toContain(`<body class="s-${DEFAULT_STYLE}`);
    expect((await readdir(path.join(live, 'fonts'))).length).toBe(styleFontFiles(DEFAULT_STYLE).length);
  });

  it('publishes without a share picture when Chrome is missing or fails, and says so in the log', async () => {
    const warnings: string[] = [];
    const site = await shopSite('khong-anh', fullDraft);
    await queuePublish(site);
    expect(await processNextJob({ ...deps, chromePath: path.join(dir, 'no-chrome'), log: { info: () => undefined, warn: (m) => warnings.push(m) } })).toBe('done');
    const html = await readFile(path.join(deps.sitesDir, 'khong-anh', 'current', 'index.html'), 'utf8');
    expect(html).not.toContain('og:image');
    expect(html).toContain('<meta name="twitter:card" content="summary">');
    expect(warnings.some((m) => m.includes('no share picture'))).toBe(true);
  });

  it.skipIf(!CHROME)('photographs the share picture with Chrome (CHROME_PATH)', async () => {
    const site = await shopSite('co-anh', fullDraft);
    await queuePublish(site);
    expect(await processNextJob({ ...deps, chromePath: CHROME, siteMaxBytes: 10 * 1024 * 1024 })).toBe('done');
    const live = path.join(deps.sitesDir, 'co-anh', 'current');
    const html = await readFile(path.join(live, 'index.html'), 'utf8');
    const file = /og:image" content="https:\/\/co-anh\.hoandat\.io\.vn\/(og-[0-9a-f]{8}\.(?:jpg|png))"/.exec(html)?.[1];
    expect(file).toBeDefined();
    const picture = path.join(live, file ?? '');
    expect((await readFile(picture)).length).toBeGreaterThan(1000);
    // The whole 1200×630 card, down to its last row: the text side is the palette's colour (leaf, #15803d) there too,
    // not a band of blank page below Chrome's viewport.
    const probe = spawnSync('ffprobe', ['-v', 'error', '-show_entries', 'stream=width,height', '-of', 'csv=p=0', picture], { encoding: 'utf8' });
    expect(probe.stdout.trim()).toBe('1200,630');
    const rows = spawnSync('ffmpeg', ['-v', 'error', '-i', picture, '-vf', 'crop=600:4:0:626', '-f', 'rawvideo', '-pix_fmt', 'rgb24', '-'], { maxBuffer: 1 << 20 });
    const pixels = rows.stdout as Buffer;
    expect(pixels.length).toBe(600 * 4 * 3);
    let near = 0;
    for (let i = 0; i < pixels.length; i += 3) {
      if (Math.abs((pixels[i] ?? 0) - 0x15) + Math.abs((pixels[i + 1] ?? 0) - 0x80) + Math.abs((pixels[i + 2] ?? 0) - 0x3d) < 40) near += 1;
    }
    expect(near / (600 * 4)).toBeGreaterThan(0.95);
    expect(html).toContain('<meta name="twitter:card" content="summary_large_image">');
  });

  it('fails a draft that cannot be published yet, without touching the sites', async () => {
    const site = await shopSite('chua-xong', (images) => ({ ...fullDraft(images), name: ' ' }));
    const jobId = await queuePublish(site);
    expect(await processNextJob(deps)).toBe('failed');
    expect((await jobRow(jobId)).error).toBe('draft-invalid');
    expect(await readdir(deps.sitesDir).catch(() => [])).toEqual([]);
  });

  it('fails a site over its size limit', async () => {
    const site = await shopSite('qua-lon', fullDraft);
    const jobId = await queuePublish(site);
    expect(await processNextJob({ ...deps, siteMaxBytes: 50 })).toBe('failed');
    expect((await jobRow(jobId)).error).toBe('too-large');
  });

  it('takes the old name of a renamed site off the web', async () => {
    const site = await shopSite('ten-moi', fullDraft);
    await publishRelease({ sitesDir: deps.sitesDir, site: 'ten-cu', sourceDir: await oldRelease(), releaseId: randomUUID(), limits: { maxBytes: 1000, maxFiles: 5 } });
    await handle.db.insert(siteNameHolds).values({ name: 'ten-cu', siteId: site.siteId, heldUntil: new Date(Date.now() + NAME_HOLD_MS), createdAt: new Date() });
    await queuePublish(site);
    expect(await processNextJob(deps)).toBe('done');
    expect((await readdir(deps.sitesDir)).sort()).toEqual(['ten-moi']);
  });

  it('is idle with an empty queue', async () => {
    expect(await processNextJob(deps)).toBe('idle');
  });
});

async function oldRelease(): Promise<string> {
  const source = path.join(dir, 'old');
  await mkdir(source, { recursive: true });
  await writeFile(path.join(source, 'index.html'), 'old');
  return source;
}

describe('cleanup', () => {
  it('deletes photos no draft uses once they are a day old, and expired name holds', async () => {
    const site = await shopSite('don-dep', fullDraft);
    const old = new Date(Date.now() - UNUSED_IMAGE_AGE_MS - 1000);
    const unused = await photo(site.siteId, [480], old);
    const fresh = await photo(site.siteId, [480]);
    await handle.db.update(siteImages).set({ createdAt: old }).where(eq(siteImages.siteId, site.siteId));
    await handle.db.update(siteImages).set({ createdAt: new Date() }).where(eq(siteImages.id, fresh));
    await handle.db.insert(siteNameHolds).values({ name: 'het-han', siteId: site.siteId, heldUntil: new Date(Date.now() - 1000), createdAt: old });

    const result = await cleanup(handle.db, deps.uploadsDir, new Date());
    expect(result).toEqual({ sessions: 0, nameHolds: 1, chatLinkCodes: 0, deliveries: 0, images: 1 });
    const left = (await handle.db.select({ id: siteImages.id }).from(siteImages).where(eq(siteImages.siteId, site.siteId))).map((r) => r.id);
    expect(left).toHaveLength(3);
    expect(left).not.toContain(unused);
    expect(await readdir(path.join(deps.uploadsDir, site.siteId))).not.toContain(`${unused}-480.webp`);
  });
});
