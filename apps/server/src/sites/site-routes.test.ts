import { spawnSync } from 'node:child_process';
import { mkdtemp, readFile, readdir } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { jobs, siteImages, siteNameHolds, sites } from '@webnhanh/db';
import type { ShopDraft } from '@webnhanh/templates';
import { eq } from 'drizzle-orm';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { ORIGIN, startTestApp, type TestApp } from '../test-support';
import { canWriteWebp } from './image-processing';
import { UNUSED_IMAGE_GRACE_MS } from './site-routes';

/** Whether this machine's ffmpeg can write WebP. */
const WEBP = await canWriteWebp({ ffmpeg: 'ffmpeg', ffprobe: 'ffprobe' });

let app: TestApp;
let owner: { accountId: string; cookie: string };
let stranger: { accountId: string; cookie: string };

beforeEach(async () => {
  // A dot in the uploads path, as in dev (.data/uploads): photos must still be served.
  const uploadsDir = await mkdtemp(path.join(os.tmpdir(), '.webnhanh-uploads-'));
  app = await startTestApp({ sitesPerAccount: 2, uploadsDir });
  owner = await app.signIn('owner');
  stranger = await app.signIn('stranger');
});

afterEach(async () => {
  await app.close();
});

interface SiteBody {
  site: { id: string; name: string; published: boolean; cover: { id: string; widths: number[]; sample: boolean } | null };
  draft: ShopDraft;
  images: { id: string; widths: number[]; sample: boolean }[];
}

async function create(name: string, who = owner): Promise<string> {
  const res = await app.http().post('/api/sites').set('Cookie', who.cookie).set('Origin', ORIGIN).send({ name, template: 'shop' });
  expect(res.status, JSON.stringify(res.body)).toBe(201);
  return (res.body as SiteBody).site.id;
}

async function read(siteId: string): Promise<SiteBody> {
  const res = await app.http().get(`/api/sites/${siteId}`).set('Cookie', owner.cookie);
  expect(res.status).toBe(200);
  return res.body as SiteBody;
}

function filled(draft: ShopDraft): ShopDraft {
  return {
    ...draft,
    name: 'Tiệm Bánh Tráng Nhà Bơ',
    products: draft.products.map((p, i) => ({ ...p, name: `Món ${i + 1}`, price: '25.000đ' })),
    contacts: { zalo: '0912345678', phone: '', facebook: '' },
  };
}

async function save(siteId: string, draft: unknown, who = owner) {
  return app.http().put(`/api/sites/${siteId}/draft`).set('Cookie', who.cookie).set('Origin', ORIGIN).send({ draft });
}

describe('creating sites', () => {
  it('makes a shop with the sample photos and an empty draft, listed with its cover', async () => {
    const id = await create('  Nha-Bo ');
    const body = await read(id);
    expect(body.site).toMatchObject({ name: 'nha-bo', published: false });
    expect(body.draft.name).toBe('');
    expect(body.draft.products).toHaveLength(2);
    expect(body.images).toHaveLength(3);
    expect(body.images.every((image) => image.sample)).toBe(true);
    expect(body.draft.cover).toBe(body.images[0]?.id);
    expect(await readdir(path.join(app.config.uploadsDir, id))).toHaveLength(3);

    const list = await app.http().get('/api/sites').set('Cookie', owner.cookie);
    expect(list.body.sites).toHaveLength(1);
    expect(list.body.sites[0].cover.id).toBe(body.draft.cover);
    expect(list.body.limits).toEqual({ sites: 2, developerSites: 3, siteBytes: 20 * 1024 * 1024 });
    expect(list.headers['cache-control']).toBe('no-store');
  });

  it.each([
    ['ab', 'name-format'],
    ['admin', 'name-reserved'],
    ['vietcombank-hotro', 'name-sensitive'],
  ])('refuses the name %j (%s)', async (name, error) => {
    const res = await app.http().post('/api/sites').set('Cookie', owner.cookie).set('Origin', ORIGIN).send({ name, template: 'shop' });
    expect(res.status).toBe(400);
    expect(res.body.error).toBe(error);
  });

  it('refuses a taken name, an unknown template, and more sites than the limit', async () => {
    await create('nha-bo');
    const taken = await app.http().post('/api/sites').set('Cookie', stranger.cookie).set('Origin', ORIGIN).send({ name: 'nha-bo', template: 'shop' });
    expect(taken.status).toBe(409);
    expect(taken.body.error).toBe('name-taken');
    const template = await app.http().post('/api/sites').set('Cookie', owner.cookie).set('Origin', ORIGIN).send({ name: 'thiep', template: 'tiec' });
    expect(template.body.error).toBe('unknown-template');
    await create('tiem-hai');
    const third = await app.http().post('/api/sites').set('Cookie', owner.cookie).set('Origin', ORIGIN).send({ name: 'tiem-ba', template: 'shop' });
    expect(third.status).toBe(403);
    expect(third.body).toEqual({ error: 'site-limit', limit: 2 });
  });

  it('needs a session and the app origin', async () => {
    expect((await app.http().get('/api/sites')).status).toBe(401);
    const foreign = await app.http().post('/api/sites').set('Cookie', owner.cookie).set('Origin', 'https://evil.example').send({ name: 'nha-bo', template: 'shop' });
    expect(foreign.status).toBe(403);
  });
});

describe('ownership', () => {
  it('answers 404 for every route of a site to another account', async () => {
    const id = await create('nha-bo');
    const { draft, images } = await read(id);
    const as = (req: ReturnType<ReturnType<TestApp['http']>['get']>) => req.set('Cookie', stranger.cookie).set('Origin', ORIGIN);
    const http = app.http();
    const responses = await Promise.all([
      as(http.get(`/api/sites/${id}`)),
      as(http.put(`/api/sites/${id}/draft`)).send({ draft }),
      as(http.patch(`/api/sites/${id}`)).send({ name: 'cuop-ten' }),
      as(http.post(`/api/sites/${id}/images`)).set('Content-Type', 'image/png').send(Buffer.from('x')),
      as(http.get(`/api/sites/${id}/images/${images[0]?.id}-${images[0]?.widths[0]}.webp`)),
      as(http.post(`/api/sites/${id}/publish`)),
      as(http.get('/api/sites/not-a-uuid')),
    ]);
    for (const [index, res] of responses.entries()) {
      expect(res.status, `request ${index}`).toBe(404);
      expect(res.body.error).toBe('site-not-found');
    }
    const list = await app.http().get('/api/sites').set('Cookie', stranger.cookie);
    expect(list.body.sites).toEqual([]);
  });
});

describe('drafts', () => {
  it('saves a valid draft, refuses a bad one or an unknown photo', async () => {
    const id = await create('nha-bo');
    const { draft } = await read(id);
    expect((await save(id, filled(draft))).status).toBe(200);
    expect((await read(id)).draft.name).toBe('Tiệm Bánh Tráng Nhà Bơ');

    const bad = await save(id, { ...draft, palette: 'neon' });
    expect(bad.status).toBe(400);
    expect(bad.body.error).toBe('invalid-draft');
    const unknown = await save(id, { ...draft, cover: '99999999-9999-4999-8999-999999999999' });
    expect(unknown.body.error).toBe('unknown-image');
    // Another site's photo is unknown here too.
    const other = await create('tiem-hai');
    const otherDraft = (await read(other)).draft;
    expect((await save(id, { ...draft, cover: otherDraft.cover })).body.error).toBe('unknown-image');
  });

  it('deletes photos a save stopped using, once they are older than the grace period', async () => {
    const id = await create('nha-bo');
    const { draft, images } = await read(id);
    const old = new Date(Date.now() - UNUSED_IMAGE_GRACE_MS - 1000);
    await app.handle.db.update(siteImages).set({ createdAt: old }).where(eq(siteImages.siteId, id));
    const withoutCover = { ...draft, cover: null };
    expect((await save(id, withoutCover)).status).toBe(200);
    const left = (await read(id)).images.map((image) => image.id);
    expect(left).toHaveLength(2);
    expect(left).not.toContain(images[0]?.id);
    expect(await readdir(path.join(app.config.uploadsDir, id))).toHaveLength(2);
  });

  it('refuses a body over the limit', async () => {
    const id = await create('nha-bo');
    const res = await app.http().put(`/api/sites/${id}/draft`).set('Cookie', owner.cookie).set('Origin', ORIGIN).set('Content-Type', 'application/json').send(`{"draft":"${'x'.repeat(70_000)}"}`);
    expect(res.status).toBe(413);
    expect(res.body.error).toBe('too-large');
  });
});

describe('publishing', () => {
  it('refuses an incomplete draft naming the fields, then queues one job at a time', async () => {
    const id = await create('nha-bo');
    const publish = () => app.http().post(`/api/sites/${id}/publish`).set('Cookie', owner.cookie).set('Origin', ORIGIN);
    const incomplete = await publish();
    expect(incomplete.status).toBe(422);
    expect(incomplete.body).toEqual({ error: 'draft-incomplete', fields: ['name', 'products.0.name', 'products.1.name'] });

    await save(id, filled((await read(id)).draft));
    const queued = await publish();
    expect(queued.status).toBe(202);
    expect(queued.body.job).toMatchObject({ siteId: id, type: 'publish', status: 'queued', steps: [] });
    expect((await publish()).body.error).toBe('job-active');

    const job = await app.http().get(`/api/jobs/${queued.body.job.id}`).set('Cookie', owner.cookie);
    expect(job.body).toMatchObject({ job: { id: queued.body.job.id, status: 'queued' }, siteName: 'nha-bo' });
    expect((await app.http().get(`/api/jobs/${queued.body.job.id}`).set('Cookie', stranger.cookie)).status).toBe(404);
    expect((await read(id)).site).toMatchObject({ published: false });
  });
});

describe('renaming', () => {
  it('renames a site never published without holding the old name', async () => {
    const id = await create('nha-bo');
    const res = await app.http().patch(`/api/sites/${id}`).set('Cookie', owner.cookie).set('Origin', ORIGIN).send({ name: 'tiem-bo' });
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ site: { name: 'tiem-bo' }, job: null });
    await create('nha-bo', stranger);
  });

  it('holds the old name of a published site for others, republishes, and lets the site take it back', async () => {
    const id = await create('nha-bo');
    // As the worker leaves a published site.
    await app.handle.db.update(sites).set({ currentReleaseId: '77777777-7777-4777-8777-777777777777', status: 'published' }).where(eq(sites.id, id));
    const rename = (name: string) => app.http().patch(`/api/sites/${id}`).set('Cookie', owner.cookie).set('Origin', ORIGIN).send({ name });

    const res = await rename('tiem-bo');
    expect(res.status).toBe(200);
    expect(res.body.job).toMatchObject({ type: 'publish', status: 'queued' });
    const [hold] = await app.handle.db.select().from(siteNameHolds).where(eq(siteNameHolds.name, 'nha-bo'));
    expect(hold?.siteId).toBe(id);
    expect(hold && hold.heldUntil.getTime() - Date.now()).toBeGreaterThan(6.9 * 24 * 3600_000);

    const grab = await app.http().post('/api/sites').set('Cookie', stranger.cookie).set('Origin', ORIGIN).send({ name: 'nha-bo', template: 'shop' });
    expect(grab.body.error).toBe('name-taken');
    // A job is queued: renaming waits for it.
    expect((await rename('tiem-moi')).body.error).toBe('job-active');
    await app.handle.db.update(jobs).set({ status: 'done' });

    const back = await rename('nha-bo');
    expect(back.status).toBe(200);
    const holds = await app.handle.db.select().from(siteNameHolds);
    expect(holds.map((h) => h.name)).toEqual(['tiem-bo']);
  });

  it('limits how many old names one site holds', async () => {
    const id = await create('ten-mot');
    await app.handle.db.update(sites).set({ currentReleaseId: '77777777-7777-4777-8777-777777777777' }).where(eq(sites.id, id));
    for (const name of ['ten-hai', 'ten-ba']) {
      expect((await app.http().patch(`/api/sites/${id}`).set('Cookie', owner.cookie).set('Origin', ORIGIN).send({ name })).status).toBe(200);
      await app.handle.db.update(jobs).set({ status: 'done' });
    }
    const res = await app.http().patch(`/api/sites/${id}`).set('Cookie', owner.cookie).set('Origin', ORIGIN).send({ name: 'ten-bon' });
    expect(res.body.error).toBe('rename-limit');
  });
});

describe('photos', () => {
  it('serves a stored photo to its owner only, as WebP, private', async () => {
    const id = await create('nha-bo');
    const image = (await read(id)).images[0];
    if (!image) throw new Error('no image');
    const url = `/api/sites/${id}/images/${image.id}-${image.widths[0]}.webp`;
    const res = await app.http().get(url).set('Cookie', owner.cookie).buffer(true);
    expect(res.status).toBe(200);
    expect(res.headers['content-type']).toBe('image/webp');
    expect(res.headers['cache-control']).toContain('private');
    for (const bad of [`${image.id}-1.webp`, `${image.id}-480.jpg`, '..%2F..%2Fetc%2Fpasswd']) {
      expect((await app.http().get(`/api/sites/${id}/images/${bad}`).set('Cookie', owner.cookie)).status, bad).toBe(404);
    }
  });

  it('refuses what is not a JPEG, PNG or WebP, and uploads over 5 MB', async () => {
    const id = await create('nha-bo');
    const upload = (bytes: Buffer) => app.http().post(`/api/sites/${id}/images`).set('Cookie', owner.cookie).set('Origin', ORIGIN).set('Content-Type', 'application/octet-stream').send(bytes);
    const gif = await upload(Buffer.from('GIF89a........'));
    expect(gif.status).toBe(400);
    expect(gif.body.error).toBe('image-type');
    const html = await upload(Buffer.from('<svg onload=alert(1)>'));
    expect(html.body.error).toBe('image-type');
    const big = await upload(Buffer.alloc(5 * 1024 * 1024 + 1, 0xff));
    expect(big.status).toBe(413);
  });

  it('refuses an upload once the site is full', async () => {
    await app.close();
    app = await startTestApp({ siteMaxBytes: 1000 });
    owner = await app.signIn('owner');
    const id = await create('nha-bo');
    const res = await app.http().post(`/api/sites/${id}/images`).set('Cookie', owner.cookie).set('Origin', ORIGIN).set('Content-Type', 'image/jpeg').send(await readFile(fixture('orient6.jpg')));
    expect(res.status).toBe(413);
    expect(res.body.error).toBe('site-full');
  });

  // Needs an ffmpeg with libwebp (CI installs one; Homebrew's ffmpeg 8+ has none).
  it.skipIf(!WEBP)('stores an upload upright, as WebP widths, without metadata', async () => {
    const id = await create('nha-bo');
    const res = await app.http().post(`/api/sites/${id}/images`).set('Cookie', owner.cookie).set('Origin', ORIGIN).set('Content-Type', 'image/jpeg').send(await readFile(fixture('orient6.jpg')));
    expect(res.status, JSON.stringify(res.body)).toBe(201);
    // orient6.jpg is stored 640×480 with "rotate 90°" in its EXIF.
    expect(res.body.image).toMatchObject({ width: 480, height: 640, widths: [480], sample: false });
    const file = await readFile(path.join(app.config.uploadsDir, id, `${res.body.image.id}-480.webp`));
    expect(file.subarray(8, 12).toString()).toBe('WEBP');
    expect(file.includes(Buffer.from('Exif'))).toBe(false);
    for (const name of ['alpha.png', 'photo.webp']) {
      const other = await app.http().post(`/api/sites/${id}/images`).set('Cookie', owner.cookie).set('Origin', ORIGIN).set('Content-Type', 'image/png').send(await readFile(fixture(name)));
      expect(other.status, name).toBe(201);
    }
    // A large photo: longer side down to 1600 px, with the smaller widths for phones.
    const large = spawnSync('ffmpeg', ['-v', 'error', '-f', 'lavfi', '-i', 'testsrc=s=3000x2000', '-frames:v', '1', '-f', 'mjpeg', 'pipe:1']).stdout;
    const big = await app.http().post(`/api/sites/${id}/images`).set('Cookie', owner.cookie).set('Origin', ORIGIN).set('Content-Type', 'image/jpeg').send(large);
    expect(big.body.image).toMatchObject({ width: 1600, height: 1066, widths: [480, 960, 1600] });
  });
});

function fixture(name: string): string {
  return path.join(path.dirname(new URL(import.meta.url).pathname), 'image-fixtures', name);
}
