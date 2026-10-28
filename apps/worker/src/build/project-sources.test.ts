import { mkdir, mkdtemp, rm, symlink, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { detectProject } from './detect';
import { localSource, zipSource } from './project-sources';
import { writeZip } from './test-zip';

let dir: string;
beforeEach(async () => {
  dir = await mkdtemp(path.join(os.tmpdir(), 'webnhanh-source-'));
});
afterEach(async () => {
  await rm(dir, { recursive: true, force: true });
});

const MONOREPO: Readonly<Record<string, string>> = {
  'package.json': '{"scripts":{"build":"pnpm -r --if-present build"}}',
  'pnpm-workspace.yaml': "packages:\n  - 'apps/*'\n",
  'pnpm-lock.yaml': "lockfileVersion: '9.0'\n",
  'apps/site/package.json': '{"dependencies":{"astro":"7"},"scripts":{"build":"astro build"}}',
  'apps/editor/package.json': '{"devDependencies":{"vite":"8"},"scripts":{"build":"vite build"}}',
  'apps/notes.txt': '',
};

async function writeTree(root: string, files: Readonly<Record<string, string>>): Promise<void> {
  for (const [name, data] of Object.entries(files)) {
    await mkdir(path.dirname(path.join(root, name)), { recursive: true });
    await writeFile(path.join(root, name), data);
  }
}

describe('listing folders of a project', () => {
  it('lists the subfolders of a checkout, not its files, and nothing outside or missing', async () => {
    await writeTree(dir, MONOREPO);
    const source = localSource(dir);
    expect(await source.list?.('apps')).toEqual(['editor', 'site']);
    expect(await source.list?.('')).toEqual(['apps']);
    expect(await source.list?.('apps/notes.txt')).toEqual([]);
    expect(await source.list?.('missing')).toEqual([]);
    expect(await source.list?.('../')).toEqual([]);
    expect((await detectProject(source, '')).apps).toEqual([
      { dir: 'apps/site', framework: 'astro' },
      { dir: 'apps/editor', framework: 'vite' },
    ]);
  });

  it('never lists through a symlink, nor lists one as a folder', async (context) => {
    const outside = path.join(dir, 'outside');
    await writeTree(outside, { 'evil/package.json': '{"dependencies":{"astro":"7"}}' });
    const repo = path.join(dir, 'repo');
    await writeTree(repo, MONOREPO);
    try {
      await symlink(outside, path.join(repo, 'apps', 'linked'), 'dir');
      await symlink(outside, path.join(repo, 'more'), 'dir');
    } catch {
      context.skip(); // Windows without the right to make symlinks
    }
    const source = localSource(repo);
    expect(await source.list?.('apps')).toEqual(['editor', 'site']);
    expect(await source.list?.('more')).toEqual([]);
  });

  it('lists the folders of an uploaded zip', async () => {
    const file = await writeZip(path.join(dir, 'upload.zip'), Object.entries(MONOREPO).map(([name, data]) => ({ name: `repo-main/${name}`, data })));
    const source = await zipSource(file);
    try {
      expect(await source.list?.('apps')).toEqual(['editor', 'site']);
      expect(await source.list?.('')).toEqual(['apps']);
      expect((await detectProject(source, '')).apps.map((app) => app.dir)).toEqual(['apps/site', 'apps/editor']);
    } finally {
      source.close();
    }
  });
});
