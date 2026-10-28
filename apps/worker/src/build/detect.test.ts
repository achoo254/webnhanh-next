import { describe, expect, it } from 'vitest';
import { detectProject, installArgv, type ProjectSource } from './detect';

/** A project held in memory: file path → content; directories are implied by the paths. */
function project(files: Readonly<Record<string, string>>): ProjectSource {
  const dirs = new Set(Object.keys(files).flatMap((file) => file.split('/').slice(0, -1).map((_, i, parts) => parts.slice(0, i + 1).join('/'))));
  return {
    read: (path) => Promise.resolve(files[path] ?? null),
    exists: (path) => Promise.resolve(path in files || dirs.has(path)),
    isDir: (path) => Promise.resolve(dirs.has(path)),
  };
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
    });
  }

  it('installs with the lockfile, never updating it', () => {
    expect(installArgv('npm')).toEqual(['npm', 'ci', '--prefer-offline', '--no-audit', '--no-fund']);
    expect(installArgv('pnpm')).toEqual(['pnpm', 'install', '--frozen-lockfile', '--prefer-offline']);
    expect(installArgv('yarn-berry')).toEqual(['yarn', 'install', '--immutable']);
    expect(installArgv('yarn')).toContain('--frozen-lockfile');
  });
});
