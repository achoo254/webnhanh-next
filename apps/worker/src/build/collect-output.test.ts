import { mkdir, mkdtemp, readdir, readFile, rm, stat, symlink, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { lockKey, restoreModules, saveCache, takeHome } from './build-cache';
import { collectOutput, OutputError, pageFacts } from './collect-output';

let dir: string;
let src: string;
beforeEach(async () => {
  dir = await mkdtemp(path.join(os.tmpdir(), 'webnhanh-out-'));
  src = path.join(dir, 'src');
  await mkdir(path.join(src, 'dist', 'assets'), { recursive: true });
  await writeFile(path.join(src, 'dist', 'index.html'), '<title>Shop</title><meta name="description" content="Bánh"><meta property="og:image" content="/og.png"><link rel="icon" href="/i.svg">');
  await writeFile(path.join(src, 'dist', 'og.png'), 'png');
  await writeFile(path.join(src, 'dist', 'assets', 'app.js'), 'x');
});
afterEach(async () => {
  await rm(dir, { recursive: true, force: true });
});

const collect = (outputRel = 'dist', maxBytes = 1024 * 1024) => collectOutput({ sourceRoot: src, outputRel, dest: path.join(dir, 'out'), maxBytes, buildKey: 'k' });

async function failure(promise: Promise<unknown>): Promise<string> {
  const error = await promise.then(
    () => null,
    (e: unknown) => e,
  );
  expect(error).toBeInstanceOf(OutputError);
  return (error as OutputError).code;
}

describe('collectOutput', () => {
  it('copies only the output, with plain modes, and reports what the page says', async () => {
    const report = await collect();
    expect((await readdir(path.join(dir, 'out'))).sort()).toEqual(['assets', 'index.html', 'og.png']);
    expect((await stat(path.join(dir, 'out', 'index.html'))).mode & 0o777).toBe(0o644);
    expect(report).toMatchObject({ title: 'Shop', hasDescription: true, hasOgImage: true, ogImage: 'og.png', hasFavicon: true, fileCount: 3, buildKey: 'k' });
  });

  it('copies a symlink inside the output as its file, and refuses one leading out', async () => {
    await symlink('assets/app.js', path.join(src, 'dist', 'latest.js'));
    await collect();
    expect(await readFile(path.join(dir, 'out', 'latest.js'), 'utf8')).toBe('x');
    await symlink('/etc/passwd', path.join(src, 'dist', 'passwd'));
    expect(await failure(collect())).toBe('output-unsafe');
  });

  it('refuses an output directory that is a symlink out of the source', async () => {
    await symlink('/etc', path.join(src, 'etc-out'));
    expect(await failure(collect('etc-out'))).toBe('output-unsafe');
  });

  it('says when the output is missing (naming what is there), has no index.html, or is too big', async () => {
    const missing = await collectOutput({ sourceRoot: src, outputRel: 'build', dest: path.join(dir, 'out'), maxBytes: 1024, buildKey: 'k' }).catch((e: unknown) => e);
    expect(missing).toMatchObject({ code: 'output-missing', lines: ['Có trong thư mục: dist'] });
    await rm(path.join(src, 'dist', 'index.html'));
    expect(await failure(collect())).toBe('output-no-index');
    await writeFile(path.join(src, 'dist', 'index.html'), 'x'.repeat(2000));
    expect(await failure(collect('dist', 1000))).toBe('output-too-large');
  });

  it('reads the page facts without running anything', () => {
    expect(pageFacts('<html><head></head></html>')).toEqual({ title: null, hasDescription: false, hasOgImage: false, ogImage: null, hasFavicon: false });
    expect(pageFacts('<meta content="https://cdn.x/og.png" property="og:image">').ogImage).toBeNull();
  });
});

describe('build cache', () => {
  const SITE = '0b8d2d3e-1111-4222-8333-444455556666';
  it('reuses node_modules for the same lockfile and starts over for a new one', async () => {
    const cache = path.join(dir, 'cache');
    const job = path.join(dir, 'job');
    await mkdir(path.join(job, 'src', 'node_modules', 'vite'), { recursive: true });
    await mkdir(path.join(job, 'src', 'packages', 'ui', 'node_modules'), { recursive: true });
    await writeFile(path.join(job, 'src', 'node_modules', 'vite', 'index.js'), 'v');
    await takeHome(cache, SITE, job);
    await writeFile(path.join(job, 'home', 'npm-cache'), 'c');
    const key = lockKey(Buffer.from('lock v1'), 'pnpm', '');
    await saveCache(cache, SITE, { jobDir: job, sourceDir: path.join(job, 'src'), key });

    await rm(job, { recursive: true, force: true });
    await mkdir(path.join(job, 'src', 'packages', 'ui'), { recursive: true });
    await takeHome(cache, SITE, job);
    expect(await readFile(path.join(job, 'home', 'npm-cache'), 'utf8')).toBe('c');
    expect(await restoreModules(cache, SITE, lockKey(Buffer.from('lock v2'), 'pnpm', ''), path.join(job, 'src'))).toBe(false);
    expect(await restoreModules(cache, SITE, key, path.join(job, 'src'))).toBe(true);
    expect(await readFile(path.join(job, 'src', 'node_modules', 'vite', 'index.js'), 'utf8')).toBe('v');
    expect((await stat(path.join(job, 'src', 'packages', 'ui', 'node_modules'))).isDirectory()).toBe(true);
  });

  it('drops a cache over its size limit', async () => {
    const cache = path.join(dir, 'cache');
    const job = path.join(dir, 'job');
    await mkdir(path.join(job, 'src', 'node_modules'), { recursive: true });
    await writeFile(path.join(job, 'src', 'node_modules', 'big'), Buffer.alloc(4096));
    await takeHome(cache, SITE, job);
    const { bytes } = await saveCache(cache, SITE, { jobDir: job, sourceDir: path.join(job, 'src'), key: 'k', maxBytes: 1000 });
    expect(bytes).toBeLessThanOrEqual(1000);
    expect(await readdir(path.join(cache, SITE))).toEqual(expect.not.arrayContaining(['modules']));
  });
});
