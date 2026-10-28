import { randomUUID } from 'node:crypto';
import { mkdir, mkdtemp, readFile, readdir, rm, symlink, utimes, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { activateRelease, currentRelease, deleteRelease, hasRelease, listReleases, publishRelease, PublishError, removeSite, rollbackRelease, stageRelease } from './publish';

const LIMITS = { maxBytes: 1024 * 1024, maxFiles: 100 };

let work: string;
let sitesDir: string;

beforeEach(async () => {
  work = await mkdtemp(path.join(tmpdir(), 'webnhanh-publish-'));
  sitesDir = path.join(work, 'sites');
});

afterEach(async () => {
  await rm(work, { recursive: true, force: true });
});

/** A source tree with index.html saying `text`, plus the given extra files. */
async function source(text: string, extra: Record<string, string> = {}): Promise<string> {
  const dir = path.join(work, `src-${randomUUID()}`);
  await mkdir(dir, { recursive: true });
  await writeFile(path.join(dir, 'index.html'), text);
  for (const [name, body] of Object.entries(extra)) {
    await mkdir(path.dirname(path.join(dir, name)), { recursive: true });
    await writeFile(path.join(dir, name), body);
  }
  return dir;
}

async function live(site: string): Promise<string> {
  return readFile(path.join(sitesDir, site, 'current', 'index.html'), 'utf8');
}

/** Publishes and backdates the release, so ordering by write time does not depend on the clock's resolution. */
async function publish(site: string, text: string, age: number): Promise<string> {
  const releaseId = randomUUID();
  const { releaseDir } = await publishRelease({ sitesDir, site, sourceDir: await source(text), releaseId, limits: LIMITS });
  const when = new Date(Date.now() - age * 1000);
  await utimes(releaseDir, when, when);
  return releaseId;
}

describe('publishRelease', () => {
  it('makes the new release live and reports its size', async () => {
    const releaseId = randomUUID();
    const sourceDir = await source('<h1>v1</h1>', { 'assets/app.js': 'x'.repeat(10) });
    const result = await publishRelease({ sitesDir, site: 'banh-mi', sourceDir, releaseId, limits: LIMITS });

    expect(result).toEqual({ releaseDir: path.join(sitesDir, 'banh-mi', 'releases', releaseId), bytes: 21, fileCount: 2 });
    expect(await live('banh-mi')).toBe('<h1>v1</h1>');
    expect(await currentRelease(sitesDir, 'banh-mi')).toBe(releaseId);
  });

  it('switches to each new release and keeps only the newest three', async () => {
    const ids = [];
    for (const [i, age] of [40, 30, 20, 10].entries()) ids.push(await publish('shop', `v${i + 1}`, age));
    ids.push(await publishRelease({ sitesDir, site: 'shop', sourceDir: await source('v5'), releaseId: randomUUID(), limits: LIMITS }).then((r) => path.basename(r.releaseDir)));

    expect(await live('shop')).toBe('v5');
    expect(await listReleases(sitesDir, 'shop')).toEqual([ids[4], ids[3], ids[2]]);
    const leftovers = (await readdir(path.join(sitesDir, 'shop'))).filter((name) => name.startsWith('.'));
    expect(leftovers).toEqual([]);
  });

  it('rolls back to the previous release, or to a chosen one', async () => {
    const first = await publish('shop', 'v1', 30);
    const second = await publish('shop', 'v2', 20);
    await publish('shop', 'v3', 10);

    expect(await rollbackRelease(sitesDir, 'shop')).toBe(second);
    expect(await live('shop')).toBe('v2');
    expect(await rollbackRelease(sitesDir, 'shop', first)).toBe(first);
    expect(await live('shop')).toBe('v1');
    await expect(rollbackRelease(sitesDir, 'shop')).rejects.toMatchObject({ code: 'no-release' });
  });

  it.each([
    ['a symlink', 'symlink'],
    ['too many bytes', 'too-large'],
    ['too many files', 'too-many-files'],
    ['no index.html', 'no-index'],
  ])('refuses an output with %s and leaves the live site alone', async (_case, code) => {
    await publish('shop', 'v1', 10);
    const sourceDir = await source('v2');
    if (code === 'symlink') await symlink('/etc/passwd', path.join(sourceDir, 'passwd'));
    if (code === 'too-large') await writeFile(path.join(sourceDir, 'big.bin'), Buffer.alloc(LIMITS.maxBytes));
    if (code === 'too-many-files') {
      await Promise.all(Array.from({ length: LIMITS.maxFiles }, (_, i) => writeFile(path.join(sourceDir, `${i}.txt`), '')));
    }
    if (code === 'no-index') await rm(path.join(sourceDir, 'index.html'));

    const attempt = publishRelease({ sitesDir, site: 'shop', sourceDir, releaseId: randomUUID(), limits: LIMITS });
    await expect(attempt).rejects.toBeInstanceOf(PublishError);
    await expect(attempt).rejects.toMatchObject({ code });
    expect(await live('shop')).toBe('v1');
    expect(await listReleases(sitesDir, 'shop')).toHaveLength(1);
  });

  it.each(['../etc', 'Shop', 'a/b', ''])('refuses the site name %j before touching the disk', async (site) => {
    const attempt = publishRelease({ sitesDir, site, sourceDir: await source('x'), releaseId: randomUUID(), limits: LIMITS });
    await expect(attempt).rejects.toMatchObject({ code: 'bad-site-name' });
    await expect(readdir(sitesDir)).rejects.toThrow();
  });

  it('refuses a release id that is not a uuid', async () => {
    const attempt = publishRelease({ sitesDir, site: 'shop', sourceDir: await source('x'), releaseId: '../x', limits: LIMITS });
    await expect(attempt).rejects.toMatchObject({ code: 'bad-release-id' });
  });
});

describe('removeSite', () => {
  it('takes a published site off and leaves the others', async () => {
    await publish('old-name', 'v1', 10);
    await publish('other', 'v1', 10);
    await removeSite(sitesDir, 'old-name');
    expect(await readdir(sitesDir)).toEqual(['other']);
    expect(await live('other')).toBe('v1');
    await removeSite(sitesDir, 'old-name');
  });

  it('refuses a name that is not a site name', async () => {
    await expect(removeSite(sitesDir, '../x')).rejects.toMatchObject({ code: 'bad-site-name' });
  });
});

describe('releases waiting off the web', () => {
  it('stages a release without touching `current`, activates it later without pruning, and deletes one that is not live', async () => {
    const live1 = await publish('shop', 'v1', 30);
    const staged = randomUUID();
    await stageRelease({ sitesDir, site: 'shop', sourceDir: await source('<input type="password">'), releaseId: staged, limits: LIMITS });
    expect(await currentRelease(sitesDir, 'shop')).toBe(live1);
    expect(await live('shop')).toBe('v1');
    expect(await hasRelease(sitesDir, 'shop', staged)).toBe(true);

    await activateRelease(sitesDir, 'shop', staged);
    expect(await live('shop')).toBe('<input type="password">');
    await activateRelease(sitesDir, 'shop', live1);
    expect(await listReleases(sitesDir, 'shop')).toHaveLength(2);

    await expect(deleteRelease(sitesDir, 'shop', live1)).rejects.toBeInstanceOf(PublishError);
    await deleteRelease(sitesDir, 'shop', staged);
    expect(await hasRelease(sitesDir, 'shop', staged)).toBe(false);
    await expect(activateRelease(sitesDir, 'shop', staged)).rejects.toMatchObject({ code: 'no-release' });
  });
});
