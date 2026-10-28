import { describe, expect, it } from 'vitest';
import { detectProject, installArgv, type ProjectSource } from './detect';

/** A project held in memory: file path → content; directories are implied by the paths. */
function project(files: Readonly<Record<string, string>>): ProjectSource {
  const dirs = new Set(Object.keys(files).flatMap((file) => file.split('/').slice(0, -1).map((_, i, parts) => parts.slice(0, i + 1).join('/'))));
  return {
    read: (path) => Promise.resolve(files[path] ?? null),
    exists: (path) => Promise.resolve(path in files || dirs.has(path)),
    isDir: (path) => Promise.resolve(dirs.has(path)),
    list: (path) => {
      const prefix = path === '' ? '' : `${path}/`;
      return Promise.resolve([...dirs].filter((dir) => dir.startsWith(prefix) && dir !== path && !dir.slice(prefix.length).includes('/')).map((dir) => dir.slice(prefix.length)).sort());
    },
  };
}

/** The same project seen as the remote check sees it: single files only, no directory listing. */
function remote(files: Readonly<Record<string, string>>): ProjectSource {
  const local = project(files);
  return { read: (path) => local.read(path), exists: (path) => local.exists(path) };
}

const pkg = (deps: Record<string, string>, scripts: Record<string, string> = { build: 'x' }, extra: Record<string, unknown> = {}): string =>
  JSON.stringify({ dependencies: deps, scripts, ...extra });

describe('detectProject', () => {
  const cases: readonly {
    name: string;
    files: Record<string, string>;
    rootDir?: string;
    expect: { framework: string; pm: string | null; build: string | null; out: string; supported: boolean; warnings?: string[]; installDir?: string };
  }[] = [
    { name: 'plain HTML', files: { 'index.html': '<h1>hi</h1>', 'style.css': '' }, expect: { framework: 'static', pm: null, build: null, out: '', supported: true } },
    { name: 'Vite + React (pnpm)', files: { 'package.json': pkg({ react: '19', vite: '8' }), 'pnpm-lock.yaml': 'lockfileVersion: 9' }, expect: { framework: 'vite', pm: 'pnpm', build: 'pnpm run build', out: 'dist', supported: true } },
    { name: 'Astro (npm)', files: { 'package.json': pkg({ astro: '5' }), 'package-lock.json': '{}' }, expect: { framework: 'astro', pm: 'npm', build: 'npm run build', out: 'dist', supported: true } },
    { name: 'Next with static export', files: { 'package.json': pkg({ next: '15' }), 'yarn.lock': '# yarn lockfile v1', 'next.config.mjs': "export default { output: 'export' }" }, expect: { framework: 'next', pm: 'yarn', build: 'yarn run build', out: 'out', supported: true } },
    { name: 'Next with server rendering', files: { 'package.json': pkg({ next: '15' }), 'package-lock.json': '{}', 'next.config.js': 'module.exports = {}' }, expect: { framework: 'next', pm: 'npm', build: 'npm run build', out: 'out', supported: false, warnings: ['next-needs-export'] } },
    { name: 'Next export with API routes', files: { 'package.json': pkg({ next: '15' }), 'package-lock.json': '{}', 'next.config.ts': 'const c = { output: "export" }', 'pages/api/hello.ts': '' }, expect: { framework: 'next', pm: 'npm', build: 'npm run build', out: 'out', supported: false, warnings: ['next-api-routes'] } },
    { name: 'Create React App', files: { 'package.json': pkg({ 'react-scripts': '5' }), 'package-lock.json': '{}' }, expect: { framework: 'cra', pm: 'npm', build: 'npm run build', out: 'build', supported: true } },
    { name: 'SvelteKit adapter-static', files: { 'package.json': pkg({ '@sveltejs/kit': '2', '@sveltejs/adapter-static': '3' }), 'pnpm-lock.yaml': '' }, expect: { framework: 'sveltekit', pm: 'pnpm', build: 'pnpm run build', out: 'build', supported: true } },
    { name: 'SvelteKit adapter-node', files: { 'package.json': pkg({ '@sveltejs/kit': '2' }), 'pnpm-lock.yaml': '', 'svelte.config.js': "import adapter from '@sveltejs/adapter-node'" }, expect: { framework: 'sveltekit', pm: 'pnpm', build: 'pnpm run build', out: 'build', supported: false, warnings: ['sveltekit-needs-static'] } },
    { name: 'Nuxt generate', files: { 'package.json': pkg({ nuxt: '3' }, { generate: 'nuxt generate' }), 'package-lock.json': '{}' }, expect: { framework: 'nuxt', pm: 'npm', build: 'npm run generate', out: '.output/public', supported: true } },
    { name: 'Docusaurus', files: { 'package.json': pkg({ '@docusaurus/core': '3' }), 'yarn.lock': '__metadata:\n  version: 8' }, expect: { framework: 'docusaurus', pm: 'yarn-berry', build: 'yarn run build', out: 'build', supported: true } },
    { name: 'VitePress in docs/', files: { 'package.json': pkg({ vitepress: '1' }, { 'docs:build': 'vitepress build docs' }), 'package-lock.json': '{}', 'docs/.vitepress/config.mts': '' }, expect: { framework: 'vitepress', pm: 'npm', build: 'npm run docs:build', out: 'docs/.vitepress/dist', supported: true } },
    { name: 'Hugo (later)', files: { 'hugo.toml': 'title = "x"' }, expect: { framework: 'hugo', pm: null, build: null, out: '', supported: false, warnings: ['hugo-later'] } },
    { name: 'no lockfile', files: { 'package.json': pkg({ vite: '8' }) }, expect: { framework: 'vite', pm: 'npm', build: 'npm run build', out: 'dist', supported: true, warnings: ['no-lockfile'] } },
    { name: 'packageManager field without lockfile', files: { 'package.json': pkg({ vite: '8' }, { build: 'vite build' }, { packageManager: 'pnpm@10.0.0' }) }, expect: { framework: 'vite', pm: 'pnpm', build: 'pnpm run build', out: 'dist', supported: true, warnings: ['no-lockfile'] } },
    { name: 'no build script', files: { 'package.json': pkg({ vite: '8' }, {}), 'package-lock.json': '{}' }, expect: { framework: 'vite', pm: 'npm', build: 'npm run build', out: 'dist', supported: false, warnings: ['no-build-script'] } },
    { name: 'package.json for tooling beside a page', files: { 'package.json': pkg({ prettier: '3' }, {}), 'index.html': '' }, expect: { framework: 'static', pm: null, build: null, out: '', supported: true } },
    { name: 'unknown framework with a build script', files: { 'package.json': pkg({ webpack: '5' }), 'package-lock.json': '{}' }, expect: { framework: 'other', pm: 'npm', build: 'npm run build', out: 'dist', supported: true, warnings: ['unknown-framework'] } },
    { name: 'broken package.json', files: { 'package.json': '{ nope' }, expect: { framework: 'other', pm: null, build: null, out: '', supported: false, warnings: ['package-json-invalid'] } },
    { name: 'empty repo', files: { 'README.md': '' }, expect: { framework: 'static', pm: null, build: null, out: '', supported: false, warnings: ['nothing-to-publish'] } },
    {
      name: 'pnpm monorepo app in apps/web',
      rootDir: 'apps/web',
      files: { 'pnpm-lock.yaml': '', 'pnpm-workspace.yaml': 'packages: [apps/*]', 'package.json': pkg({}, {}), 'apps/web/package.json': pkg({ vite: '8' }) },
      expect: { framework: 'vite', pm: 'pnpm', build: 'pnpm run build', out: 'dist', supported: true, installDir: '' },
    },
  ];

  for (const c of cases) {
    it(c.name, async () => {
      const d = await detectProject(project(c.files), c.rootDir ?? '');
      expect({ framework: d.framework, pm: d.packageManager, build: d.buildCommand, out: d.outputDir, supported: d.supported }).toEqual({
        framework: c.expect.framework,
        pm: c.expect.pm,
        build: c.expect.build,
        out: c.expect.out,
        supported: c.expect.supported,
      });
      expect(d.warnings).toEqual(c.expect.warnings ?? []);
      if (c.expect.installDir !== undefined) expect(d.installDir).toBe(c.expect.installDir);
      expect(d.apps).toEqual([]);
    });
  }

  it('installs with the lockfile, never updating it', () => {
    expect(installArgv('npm')).toEqual(['npm', 'ci', '--prefer-offline', '--no-audit', '--no-fund']);
    expect(installArgv('pnpm')).toEqual(['pnpm', 'install', '--frozen-lockfile', '--prefer-offline']);
    expect(installArgv('yarn-berry')).toEqual(['yarn', 'install', '--immutable']);
    expect(installArgv('yarn')).toContain('--frozen-lockfile');
  });
});

describe('detectProject in a monorepo', () => {
  /** Shaped like a pnpm workspace whose site is an Astro app beside a Vite editor and a Worker with no framework. */
  const pnpmLock = [
    "lockfileVersion: '9.0'",
    '',
    'importers:',
    '',
    '  .:',
    '    devDependencies:',
    '      eslint:',
    '        specifier: ^10.0.0',
    '  apps/editor:',
    '    dependencies:',
    '      hono: {specifier: ^4.0.0, version: 4.0.0}',
    '  apps/mcp-worker:',
    '    dependencies: {}',
    '  apps/site:',
    '    dependencies: {}',
    '  packages/lesson-core:',
    '    dependencies: {}',
    '',
    'packages:',
    '',
    '  astro@7.3.5:',
    '    resolution: {integrity: sha512-x}',
  ].join('\n');
  const workspaceRepo: Record<string, string> = {
    'package.json': pkg({}, { build: 'pnpm -r --if-present build' }, { packageManager: 'pnpm@10.30.3' }),
    'pnpm-workspace.yaml': "packages:\n  - 'apps/*'\n  - 'packages/*'\n",
    'pnpm-lock.yaml': pnpmLock,
    'apps/site/package.json': pkg({ astro: '7', 'lesson-core': 'workspace:*' }, { build: 'pnpm sync-media && astro build', 'sync-media': 'node scripts/sync-lesson-media.ts' }),
    'apps/site/scripts/sync-lesson-media.ts': '',
    'apps/editor/package.json': JSON.stringify({ scripts: { build: 'vite build' }, devDependencies: { vite: '8' } }),
    'apps/mcp-worker/package.json': pkg({ hono: '4' }, { deploy: 'wrangler deploy' }),
    'packages/lesson-core/package.json': pkg({ zod: '4' }, {}),
    'content/2026-01-01-bai/bai.md': '',
  };
  const suggested = [
    { dir: 'apps/site', framework: 'astro' },
    { dir: 'apps/editor', framework: 'vite' },
  ];

  it('suggests the workspace packages with a framework when the root has none', async () => {
    const d = await detectProject(project(workspaceRepo), '');
    expect({ framework: d.framework, pm: d.packageManager, build: d.buildCommand, out: d.outputDir, supported: d.supported, warnings: d.warnings }).toEqual({
      framework: 'other',
      pm: 'pnpm',
      build: 'pnpm run build',
      out: 'dist',
      supported: true,
      warnings: ['unknown-framework'],
    });
    expect(d.apps).toEqual(suggested);
  });

  it('finds the same packages from the lockfile when the source cannot list folders (the remote check)', async () => {
    expect((await detectProject(remote(workspaceRepo), '')).apps).toEqual(suggested);
  });

  it('recognizes the chosen app folder, installing at the workspace root', async () => {
    const d = await detectProject(project(workspaceRepo), 'apps/site');
    expect({ framework: d.framework, pm: d.packageManager, installDir: d.installDir, lockfile: d.lockfile, build: d.buildCommand, out: d.outputDir, supported: d.supported, warnings: d.warnings, apps: d.apps }).toEqual({
      framework: 'astro',
      pm: 'pnpm',
      installDir: '',
      lockfile: 'pnpm-lock.yaml',
      build: 'pnpm run build',
      out: 'dist',
      supported: true,
      warnings: [],
      apps: [],
    });
  });

  it('reads package.json `workspaces` (npm), from listings or from package-lock.json', async () => {
    const files: Record<string, string> = {
      'package.json': pkg({}, {}, { workspaces: ['packages/*', '!packages/ignored', 'docs'] }),
      'package-lock.json': JSON.stringify(
        { packages: { '': {}, docs: {}, 'node_modules/next': {}, 'packages/web': {}, 'packages/ui': {}, 'packages/web/node_modules/vite': {} } },
        null,
        2,
      ),
      'docs/package.json': pkg({ '@docusaurus/core': '3' }),
      'packages/web/package.json': pkg({ next: '15' }),
      'packages/ui/package.json': pkg({ react: '19' }),
      'node_modules/next/package.json': pkg({ next: '15' }),
    };
    const expected = [
      { dir: 'docs', framework: 'docusaurus' },
      { dir: 'packages/web', framework: 'next' },
    ];
    const local = await detectProject(project(files), '');
    expect(local.warnings).toEqual(['no-build-script']);
    expect(local.apps).toEqual(expected);
    expect((await detectProject(remote(files), '')).apps).toEqual(expected);
  });

  it('reads Yarn 1 `workspaces.packages` and the `@workspace:` entries of a Yarn 2+ lockfile', async () => {
    const files: Record<string, string> = {
      'package.json': pkg({}, { build: 'turbo run build' }, { workspaces: { packages: ['sites/**'] } }),
      'yarn.lock': '__metadata:\n  version: 8\n\n"blog@workspace:sites/blog/app":\n  version: 0.0.0-use.local\n',
      'sites/blog/app/package.json': pkg({ vitepress: '1' }),
    };
    expect((await detectProject(project(files), '')).apps).toEqual([{ dir: 'sites/blog/app', framework: 'vitepress' }]);
    expect((await detectProject(remote(files), '')).apps).toEqual([{ dir: 'sites/blog/app', framework: 'vitepress' }]);
  });

  it('suggests nothing without a workspace, and never looks outside the declared globs', async () => {
    const files: Record<string, string> = { 'package.json': pkg({ webpack: '5' }), 'package-lock.json': '{}', 'apps/site/package.json': pkg({ astro: '7' }) };
    expect((await detectProject(project(files), '')).apps).toEqual([]);
    const tooBroad = { ...files, 'pnpm-workspace.yaml': "packages: ['../outside/*', '/etc/*', 'apps/**/deep/**/x', '!apps/*']" };
    expect((await detectProject(project(tooBroad), '')).apps).toEqual([]);
  });
});
