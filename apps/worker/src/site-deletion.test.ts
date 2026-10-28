import { randomUUID } from 'node:crypto';
import { mkdir, mkdtemp, readdir, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { accounts, openPglite, siteDeletions, sites, siteUploadsDir, type DbHandle } from '@webnhanh/db';
import { eq } from 'drizzle-orm';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { processNextSiteDeletion, type SiteDeletionDeps } from './site-deletion';
import { processNextJob, type WorkerDeps } from './worker-loop';

let handle: DbHandle;
let dir: string;
let deps: WorkerDeps;
let accountId: string;
const now = new Date('2026-10-28T10:00:00Z');
const quiet = { info: () => undefined, warn: () => undefined };

beforeEach(async () => {
  handle = await openPglite();
  dir = await mkdtemp(path.join(os.tmpdir(), 'webnhanh-delete-'));
  deps = {
    db: handle.db,
    sitesDir: path.join(dir, 'sites'),
    uploadsDir: path.join(dir, 'uploads'),
    workDir: path.join(dir, 'work'),
    siteMaxBytes: 1024 * 1024,
    madeWith: { name: 'App', url: 'https://app.example.com' },
    appUrl: 'https://app.example.com',
    formSecret: 'f'.repeat(40),
    ffmpegPath: 'ffmpeg',
    adminSubs: [],
    now: () => now,
    log: quiet,
  };
  const [account] = await handle.db.insert(accounts).values({ sub: 'owner', createdAt: now }).returning();
  if (!account) throw new Error('no account');
  accountId = account.id;
});

afterEach(async () => {
  await handle.close();
  await rm(dir, { recursive: true, force: true });
});

/** A site on disk as the publisher leaves it (plain directories stand in for the `current` link). */
async function siteOnDisk(name: string): Promise<void> {
  const release = path.join(deps.sitesDir, name, 'releases', randomUUID());
  await mkdir(release, { recursive: true });
  await writeFile(path.join(release, 'index.html'), `<title>${name}</title>`);
}

async function photosOf(siteId: string): Promise<string> {
  const photos = siteUploadsDir(deps.uploadsDir, siteId);
  await mkdir(photos, { recursive: true });
  await writeFile(path.join(photos, `${randomUUID()}-480.webp`), 'webp');
  return photos;
}

async function queueDeletion(siteId: string, names: string[]): Promise<string> {
  const id = randomUUID();
  await handle.db.insert(siteDeletions).values({ id, siteId, accountId, names, status: 'queued', createdAt: now });
  return id;
}

describe('a deleted site', () => {
  it('is taken off the web with its old names and photos, other sites untouched', async () => {
    const gone = randomUUID();
    const kept = randomUUID();
    await siteOnDisk('tiem-xoa');
    await siteOnDisk('tiem-cu');
    await siteOnDisk('tiem-con');
    await photosOf(gone);
    const keptPhotos = await photosOf(kept);
    const id = await queueDeletion(gone, ['tiem-xoa', 'tiem-cu']);

    // Before any publish in the queue.
    expect(await processNextJob(deps)).toBe('done');
    expect((await readdir(deps.sitesDir)).sort()).toEqual(['tiem-con']);
    expect(await readdir(deps.uploadsDir)).toEqual([kept]);
    expect(await readdir(keptPhotos)).toHaveLength(1);
    const [row] = await handle.db.select().from(siteDeletions).where(eq(siteDeletions.id, id));
    expect(row).toMatchObject({ status: 'done', error: null, finishedAt: now });
    expect(await processNextJob(deps)).toBe('idle');
  });

  it('is done even when nothing was ever published or uploaded', async () => {
    const id = await queueDeletion(randomUUID(), ['chua-dang']);
    const only: SiteDeletionDeps = deps;
    expect(await processNextSiteDeletion(only)).toBe(true);
    const [row] = await handle.db.select().from(siteDeletions).where(eq(siteDeletions.id, id));
    expect(row?.status).toBe('done');
    expect(await processNextSiteDeletion(only)).toBe(false);
  });

  it('leaves a freed name alone once another site published under it, but clears it under a draft', async () => {
    await siteOnDisk('ten-moi');
    await siteOnDisk('ten-nhap');
    const newSite = { accountId, kind: 'template' as const, template: 'shop', draft: {}, createdAt: now, updatedAt: now };
    await handle.db.insert(sites).values([
      { ...newSite, id: randomUUID(), name: 'ten-moi', status: 'published' as const },
      { ...newSite, id: randomUUID(), name: 'ten-nhap', status: 'draft' as const },
    ]);
    await queueDeletion(randomUUID(), ['ten-moi', 'ten-nhap']);
    expect(await processNextSiteDeletion(deps)).toBe(true);
    expect(await readdir(deps.sitesDir)).toEqual(['ten-moi']);
  });

  it('fails without touching anything when a name is not a site name', async () => {
    await siteOnDisk('ten-that');
    const id = await queueDeletion(randomUUID(), ['../sites']);
    expect(await processNextSiteDeletion(deps)).toBe(true);
    const [row] = await handle.db.select().from(siteDeletions).where(eq(siteDeletions.id, id));
    expect(row).toMatchObject({ status: 'failed', error: 'apply-failed' });
    expect(await readdir(deps.sitesDir)).toEqual(['ten-that']);
  });
});
