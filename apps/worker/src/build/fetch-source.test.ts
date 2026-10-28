import { lstat, mkdir, mkdtemp, readFile, readdir, readlink, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { commonZipFolder, extractZip, gitCloneArgs, gitEnv, SourceError, type ZipLimits } from './fetch-source';
import { zipSource } from './project-sources';
import { checkBranch, checkBuildCommand, checkRelativeDir, parseRepoUrl } from './settings';
import { writeZip, type ZipItem } from './test-zip';

let dir: string;
beforeEach(async () => {
  dir = await mkdtemp(path.join(os.tmpdir(), 'webnhanh-zip-'));
});
afterEach(async () => {
  await rm(dir, { recursive: true, force: true });
});

const LIMITS: ZipLimits = { maxZipBytes: 1024 * 1024, maxEntries: 50, maxUnpackedBytes: 64 * 1024 };

async function extract(items: readonly ZipItem[], limits = LIMITS): Promise<string> {
  const file = await writeZip(path.join(dir, 'upload.zip'), items);
  const dest = path.join(dir, 'src');
  await rm(dest, { recursive: true, force: true });
  await extractZip(file, dest, limits);
  return dest;
}

async function refused(items: readonly ZipItem[], limits = LIMITS): Promise<string> {
  const error = await extract(items, limits).then(
    () => null,
    (e: unknown) => e,
  );
  expect(error).toBeInstanceOf(SourceError);
  return (error as SourceError).code;
}

/** Nothing landed outside the destination. */
async function outsideUntouched(): Promise<void> {
  expect((await readdir(dir)).sort()).toEqual(expect.arrayContaining(['upload.zip']));
  expect((await readdir(dir)).filter((name) => name !== 'upload.zip' && name !== 'src')).toEqual([]);
}

describe('extractZip', () => {
  it('extracts a project, taking off the folder GitHub wraps it in, and keeps symlinks that stay inside', async () => {
    const dest = await extract([
      { name: 'site-main/' },
      { name: 'site-main/index.html', data: '<h1>hi</h1>', deflate: true },
      { name: 'site-main/assets/app.js', data: 'console.log(1)' },
      { name: 'site-main/latest.js', data: 'assets/app.js', mode: 0o120777 },
    ]);
    expect((await readdir(dest)).sort()).toEqual(['assets', 'index.html', 'latest.js']);
    expect(await readFile(path.join(dest, 'index.html'), 'utf8')).toBe('<h1>hi</h1>');
    expect(await readlink(path.join(dest, 'latest.js'))).toBe('assets/app.js');
  });

  it('refuses entries that climb out with ..', async () => {
    expect(await refused([{ name: 'index.html', data: 'x' }, { name: '../evil.txt', data: 'x' }])).toBe('zip-unsafe');
    expect(await refused([{ name: 'a/../../evil.txt', data: 'x' }])).toBe('zip-unsafe');
    await outsideUntouched();
  });

  it('refuses absolute names', async () => {
    expect(await refused([{ name: '/etc/evil', data: 'x' }])).toBe('zip-unsafe');
  });

  it('refuses a symlink leading out, absolute or relative', async () => {
    expect(await refused([{ name: 'shadow', data: '/etc/shadow', mode: 0o120777 }])).toBe('zip-unsafe');
    await rm(path.join(dir, 'src'), { recursive: true, force: true });
    expect(await refused([{ name: 'up', data: '../../..', mode: 0o120777 }])).toBe('zip-unsafe');
  });

  it('never writes through a symlink (a link to a folder inside, then a file "in" it climbing out)', async () => {
    expect(
      await refused([
        { name: 'a/', mode: 0o040755 },
        { name: 'link', data: 'a', mode: 0o120777 },
        { name: 'link/file.txt', data: 'x' },
      ]),
    ).toBe('zip-unsafe');
  });

  it('refuses the same name twice (the second could replace a checked file)', async () => {
    expect(await refused([{ name: 'index.html', data: 'a' }, { name: 'index.html', data: 'b' }])).toBe('zip-unsafe');
  });

  it('stops a zip bomb by what it writes, not by what it claims', async () => {
    const zeros = Buffer.alloc(200 * 1024);
    expect(await refused([{ name: 'bomb.bin', data: zeros, deflate: true }])).toBe('zip-too-large');
    await rm(path.join(dir, 'src'), { recursive: true, force: true });
    // A header that understates the size does not get past either.
    const code = await refused([{ name: 'liar.bin', data: zeros, deflate: true, declaredSize: 10 }]);
    expect(['zip-too-large', 'zip-invalid']).toContain(code);
    const leftover = await lstat(path.join(dir, 'src', 'liar.bin')).catch(() => null);
    expect(leftover === null || leftover.size <= LIMITS.maxUnpackedBytes).toBe(true);
  });

  it('refuses too many entries and too big an upload', async () => {
    const many = Array.from({ length: 51 }, (_, i) => ({ name: `f${i}.txt`, data: '' }));
    expect(await refused(many)).toBe('zip-too-large');
    await rm(path.join(dir, 'src'), { recursive: true, force: true });
    expect(await refused([{ name: 'a.txt', data: 'x' }], { ...LIMITS, maxZipBytes: 10 })).toBe('zip-too-large');
  });

  it('refuses a file that is not a zip', async () => {
    const file = path.join(dir, 'upload.zip');
    await mkdir(dir, { recursive: true });
    await import('node:fs/promises').then(({ writeFile }) => writeFile(file, 'not a zip'));
    await expect(extractZip(file, path.join(dir, 'src'), LIMITS)).rejects.toMatchObject({ code: 'zip-invalid' });
  });

  it('reads a zip in place for the check before the first build', async () => {
    const file = await writeZip(path.join(dir, 'upload.zip'), [
      { name: 'repo-main/package.json', data: '{"dependencies":{"vite":"8"},"scripts":{"build":"vite build"}}' },
      { name: 'repo-main/package-lock.json', data: '{}' },
      { name: 'repo-main/src/main.ts', data: '' },
    ]);
    const source = await zipSource(file);
    try {
      expect(await source.read('package.json')).toContain('vite');
      expect(await source.exists('package-lock.json')).toBe(true);
      expect(await source.exists('src')).toBe(true);
      expect(await source.exists('yarn.lock')).toBe(false);
    } finally {
      source.close();
    }
  });

  it('finds the common folder only when everything is inside it', () => {
    expect(commonZipFolder(['a/', 'a/index.html', 'a/b/c.js'])).toBe('a/');
    expect(commonZipFolder(['a/index.html', 'b.js'])).toBe('');
    expect(commonZipFolder(['index.html'])).toBe('');
  });
});

describe('git clone arguments', () => {
  const repo = parseRepoUrl('https://github.com/acme/site');
  it('clones one branch, one commit deep, over HTTPS only, with no hooks, after `--`', () => {
    if (!repo) throw new Error('no repo');
    const args = gitCloneArgs(repo, 'main', '/var/lib/webnhanh/work/x/src');
    expect(args).toEqual([
      '-c', 'core.hooksPath=/dev/null',
      '-c', 'core.fsmonitor=false',
      '-c', 'protocol.allow=never',
      '-c', 'protocol.https.allow=always',
      '-c', 'credential.helper=',
      '-c', 'transfer.fsckObjects=true',
      'clone', '--depth', '1', '--single-branch', '--no-tags', '--no-recurse-submodules',
      '--branch=main', '--', 'https://github.com/acme/site.git', '/var/lib/webnhanh/work/x/src',
    ]);
  });

  it('refuses a branch that could be read as an option', () => {
    if (!repo) throw new Error('no repo');
    expect(() => gitCloneArgs(repo, '--upload-pack=touch /tmp/x', '/tmp/x')).toThrow(SourceError);
  });

  it('gives git nothing of the builder environment', () => {
    const env = gitEnv('/tmp/home');
    expect(Object.keys(env).sort()).toEqual(['GIT_ASKPASS', 'GIT_CONFIG_GLOBAL', 'GIT_CONFIG_NOSYSTEM', 'GIT_LFS_SKIP_SMUDGE', 'GIT_TERMINAL_PROMPT', 'HOME', 'LANG', 'PATH']);
  });
});

describe('what people type', () => {
  it('takes only public GitHub and GitLab repo addresses', () => {
    expect(parseRepoUrl('https://github.com/acme/site')).toMatchObject({ host: 'github', path: 'acme/site', cloneUrl: 'https://github.com/acme/site.git' });
    expect(parseRepoUrl(' https://github.com/acme/site.git ')).toMatchObject({ path: 'acme/site' });
    expect(parseRepoUrl('https://gitlab.com/group/sub/site')).toMatchObject({ host: 'gitlab', path: 'group/sub/site' });
    for (const bad of [
      'http://github.com/acme/site',
      'https://github.com/acme',
      'https://github.com/acme/site/tree/main',
      'https://user:pass@github.com/acme/site',
      'https://github.com.evil.com/acme/site',
      'https://example.com/acme/site',
      'git@github.com:acme/site.git',
      'file:///etc/passwd',
      'https://github.com/acme/..',
      'https://gitlab.com/group/-/raw/main',
      'ext::sh -c touch% /tmp/pwned',
    ]) {
      expect(parseRepoUrl(bad), bad).toBeNull();
    }
  });

  it('takes branch names, not options or tricks', () => {
    expect(checkBranch('main')).toBe('main');
    expect(checkBranch('feature/new-look')).toBe('feature/new-look');
    for (const bad of ['-x', '--upload-pack=x', 'a..b', 'a b', 'a;b', '/main', 'main/', 'x.lock', 'a//b', '']) expect(checkBranch(bad), bad).toBeNull();
  });

  it('keeps directories inside the project', () => {
    expect(checkRelativeDir('')).toBe('');
    expect(checkRelativeDir('./apps/web/')).toBe('apps/web');
    expect(checkRelativeDir('.output/public')).toBe('.output/public');
    for (const bad of ['../x', '/etc', 'a/../../b', 'a\\b', 'a b']) expect(checkRelativeDir(bad), bad).toBeNull();
  });

  it('takes a build command as one line', () => {
    expect(checkBuildCommand('pnpm build && cp -r static dist/')).toBe('pnpm build && cp -r static dist/');
    expect(checkBuildCommand('npm run build\nrm -rf /')).toBeNull();
    expect(checkBuildCommand('x'.repeat(301))).toBeNull();
  });
});
