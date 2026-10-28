import { describe, expect, it } from 'vitest';
import type { ProjectSource } from './detect';
import { lockfileWorkspaces, MAX_WORKSPACE_DIRS, packageJsonWorkspaces, pnpmWorkspaceGlobs, workspaceDirs } from './workspace-apps';

describe('workspace declarations', () => {
  it('reads pnpm-workspace.yaml packages as a block list or a flow list, with quotes and comments', () => {
    expect(pnpmWorkspaceGlobs("packages:\n  - 'apps/*'\n  # tools\n  - \"packages/*\" # shared\n  - docs\ncatalog:\n  react: ^19\n")).toEqual(['apps/*', 'packages/*', 'docs']);
    expect(pnpmWorkspaceGlobs("packages: ['apps/*', packages/*]\n")).toEqual(['apps/*', 'packages/*']);
    expect(pnpmWorkspaceGlobs('onlyBuiltDependencies:\n  - esbuild\n')).toEqual([]);
  });

  it('reads package.json workspaces as a list or as Yarn 1 `packages`', () => {
    expect(packageJsonWorkspaces(['apps/*', 3])).toEqual(['apps/*']);
    expect(packageJsonWorkspaces({ packages: ['sites/*'], nohoist: ['**/x'] })).toEqual(['sites/*']);
    expect(packageJsonWorkspaces('apps/*')).toEqual([]);
  });

  it('takes the package folders of a lockfile, never installed dependencies', () => {
    expect(lockfileWorkspaces('pnpm-lock.yaml', "importers:\n\n  .:\n    dependencies: {}\n  'apps/site':\n    x: 1\n\npackages:\n\n  astro@7.0.0:\n    x: 1\n")).toEqual(['.', 'apps/site']);
    expect(lockfileWorkspaces('package-lock.json', JSON.stringify({ packages: { '': {}, 'apps/a': {}, 'node_modules/b': {}, 'apps/a/node_modules/c': {} } }, null, 2))).toEqual(['apps/a']);
    expect(lockfileWorkspaces('yarn.lock', '"root@workspace:.":\n"web@workspace:apps/web":\n')).toEqual(['.', 'apps/web']);
  });
});

describe('workspaceDirs', () => {
  it(`reads at most ${MAX_WORKSPACE_DIRS} package folders, sorted, and lists only what the globs reach`, async () => {
    const names = Array.from({ length: 80 }, (_, i) => `p${String(i).padStart(2, '0')}`);
    const listed: string[] = [];
    const source: ProjectSource = {
      read: (path) => Promise.resolve(path === 'pnpm-workspace.yaml' ? "packages: ['apps/*', '.hidden/*', 'node_modules/*']" : null),
      exists: () => Promise.resolve(false),
      list: (path) => {
        listed.push(path);
        return Promise.resolve(path === 'apps' ? [...names, 'node_modules', '.git'] : []);
      },
    };
    const dirs = await workspaceDirs(source, { rootDir: '', workspaces: [], lockfile: null });
    expect(dirs).toHaveLength(MAX_WORKSPACE_DIRS);
    expect(dirs[0]).toBe('apps/p00');
    expect(dirs.every((dir) => /^apps\/p\d\d$/.test(dir))).toBe(true);
    expect(listed).toEqual(['apps']);
  });

  it('stays inside the chosen folder when the workspace is declared there', async () => {
    const source: ProjectSource = {
      read: (path) =>
        Promise.resolve(
          path === 'web/pnpm-workspace.yaml' ? 'packages: [apps/*]' : path === 'pnpm-lock.yaml' ? "importers:\n  web/apps/site: {}\n  other/apps/x: {}\n  web: {}\n" : null,
        ),
      exists: () => Promise.resolve(false),
    };
    expect(await workspaceDirs(source, { rootDir: 'web', workspaces: [], lockfile: 'pnpm-lock.yaml' })).toEqual(['web/apps/site']);
  });
});
