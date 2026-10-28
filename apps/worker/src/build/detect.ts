/**
 * Recognizes a project from its files without running any of its code: the package manager (from the lockfile), the
 * framework (from package.json), and so the build command and output directory to suggest. The same rules run on the
 * server when a repo link is pasted (files fetched over HTTPS, or read from the uploaded zip) and in the builder on
 * the fetched source before every build.
 */
import { joinRel } from './settings';

/** Files of a project, wherever they are. `read` gives null for a missing (or unreadable, or too big) file. */
export interface ProjectSource {
  read(path: string): Promise<string | null>;
  exists(path: string): Promise<boolean>;
  /** Directories, when the source can tell (a fetched checkout); the remote check cannot list them. */
  isDir?(path: string): Promise<boolean>;
}

export const FRAMEWORKS = ['static', 'vite', 'astro', 'next', 'cra', 'sveltekit', 'nuxt', 'docusaurus', 'vitepress', 'hugo', 'other'] as const;
export type Framework = (typeof FRAMEWORKS)[number];

/** `yarn` is Yarn 1 (classic); `yarn-berry` is Yarn 2 and later. */
export type PackageManager = 'npm' | 'pnpm' | 'yarn' | 'yarn-berry';

export type DetectionWarning =
  | 'no-lockfile'
  | 'next-needs-export'
  | 'next-api-routes'
  | 'sveltekit-needs-static'
  | 'nuxt-needs-generate'
  | 'hugo-later'
  | 'no-build-script'
  | 'nothing-to-publish'
  | 'package-json-invalid'
  | 'unknown-framework';

/** Warnings that make a build pointless: the check says so before anything is queued. */
const BLOCKING: ReadonlySet<DetectionWarning> = new Set([
  'next-needs-export',
  'next-api-routes',
  'sveltekit-needs-static',
  'hugo-later',
  'nothing-to-publish',
  'package-json-invalid',
  'no-build-script',
]);

export interface Detection {
  readonly framework: Framework;
  /** Null for plain HTML: published as it is, nothing installed or built. */
  readonly packageManager: PackageManager | null;
  /** Where the lockfile is (the install runs there; the repo root of a monorepo), relative to the repo. */
  readonly installDir: string;
  readonly lockfile: string | null;
  /** Suggested; null for plain HTML. */
  readonly buildCommand: string | null;
  /** Suggested, relative to the app's directory; `''` is the directory itself. */
  readonly outputDir: string;
  readonly supported: boolean;
  readonly warnings: readonly DetectionWarning[];
}

const LOCKFILES: readonly { file: string; pm: PackageManager }[] = [
  { file: 'pnpm-lock.yaml', pm: 'pnpm' },
  { file: 'yarn.lock', pm: 'yarn' },
  { file: 'package-lock.json', pm: 'npm' },
  { file: 'npm-shrinkwrap.json', pm: 'npm' },
];

/** The program a package manager runs as. */
export function pmCommand(pm: PackageManager): 'npm' | 'pnpm' | 'yarn' {
  return pm === 'yarn-berry' ? 'yarn' : pm;
}

/** The install command of each package manager, as an argument list: it never goes through a shell. */
export function installArgv(pm: PackageManager): string[] {
  switch (pm) {
    case 'pnpm':
      return ['pnpm', 'install', '--frozen-lockfile', '--prefer-offline'];
    case 'yarn':
      return ['yarn', 'install', '--frozen-lockfile', '--prefer-offline', '--non-interactive'];
    case 'yarn-berry':
      return ['yarn', 'install', '--immutable'];
    case 'npm':
      return ['npm', 'ci', '--prefer-offline', '--no-audit', '--no-fund'];
  }
}

/** The directories from `dir` up to the repo root: `a/b` → `a/b`, `a`, `''`. */
function upToRoot(dir: string): string[] {
  const parts = dir === '' ? [] : dir.split('/');
  return parts.map((_, i) => parts.slice(0, parts.length - i).join('/')).concat('');
}

async function firstExisting(source: ProjectSource, dir: string, names: readonly string[]): Promise<string | null> {
  for (const name of names) {
    const path = joinRel(dir, name);
    if (await source.exists(path)) return path;
  }
  return null;
}

interface PackageJson {
  readonly deps: ReadonlySet<string>;
  readonly scripts: Readonly<Record<string, string>>;
  readonly packageManager: string | null;
}

function parsePackageJson(text: string): PackageJson | null {
  let value: unknown;
  try {
    value = JSON.parse(text);
  } catch {
    return null;
  }
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return null;
  const record = value as Record<string, unknown>;
  const names = (key: string): string[] => {
    const deps = record[key];
    return typeof deps === 'object' && deps !== null && !Array.isArray(deps) ? Object.keys(deps) : [];
  };
  const rawScripts = record.scripts;
  const scripts =
    typeof rawScripts === 'object' && rawScripts !== null && !Array.isArray(rawScripts)
      ? Object.fromEntries(Object.entries(rawScripts).filter((entry): entry is [string, string] => typeof entry[1] === 'string'))
      : {};
  return {
    deps: new Set([...names('dependencies'), ...names('devDependencies')]),
    scripts,
    packageManager: typeof record.packageManager === 'string' ? record.packageManager : null,
  };
}

async function packageManagerOf(source: ProjectSource, rootDir: string, pkg: PackageJson): Promise<{ pm: PackageManager; installDir: string; lockfile: string | null }> {
  for (const dir of upToRoot(rootDir)) {
    for (const { file, pm } of LOCKFILES) {
      const path = joinRel(dir, file);
      if (!(await source.exists(path))) continue;
      if (pm === 'yarn') {
        const text = (await source.read(path)) ?? '';
        return { pm: /^__metadata:/m.test(text) ? 'yarn-berry' : 'yarn', installDir: dir, lockfile: path };
      }
      return { pm, installDir: dir, lockfile: path };
    }
  }
  const declared = pkg.packageManager?.split('@')[0];
  const pm: PackageManager = declared === 'pnpm' ? 'pnpm' : declared === 'yarn' ? (pkg.packageManager?.startsWith('yarn@1') ? 'yarn' : 'yarn-berry') : 'npm';
  return { pm, installDir: rootDir, lockfile: null };
}

function result(partial: Omit<Detection, 'supported'>): Detection {
  return { ...partial, supported: !partial.warnings.some((w) => BLOCKING.has(w)) };
}

const CONFIG_EXTENSIONS = ['js', 'mjs', 'cjs', 'ts', 'mts'] as const;
const configNames = (base: string): string[] => CONFIG_EXTENSIONS.map((ext) => `${base}.${ext}`);

/** Recognizes the project whose app lives in `rootDir` (relative to the repo root, `''` for the root). */
export async function detectProject(source: ProjectSource, rootDir: string): Promise<Detection> {
  const pkgText = await source.read(joinRel(rootDir, 'package.json'));
  if (pkgText === null) {
    if (await source.exists(joinRel(rootDir, 'index.html'))) {
      return result({ framework: 'static', packageManager: null, installDir: rootDir, lockfile: null, buildCommand: null, outputDir: '', warnings: [] });
    }
    const hugo = await firstExisting(source, rootDir, ['hugo.toml', 'hugo.yaml', 'config.toml']);
    return result({ framework: hugo ? 'hugo' : 'static', packageManager: null, installDir: rootDir, lockfile: null, buildCommand: null, outputDir: '', warnings: [hugo ? 'hugo-later' : 'nothing-to-publish'] });
  }
  const pkg = parsePackageJson(pkgText);
  if (!pkg) {
    return result({ framework: 'other', packageManager: null, installDir: rootDir, lockfile: null, buildCommand: null, outputDir: '', warnings: ['package-json-invalid'] });
  }
  const { pm, installDir, lockfile } = await packageManagerOf(source, rootDir, pkg);
  const run = (script: string): string => `${pmCommand(pm)} run ${script}`;
  const warnings: DetectionWarning[] = lockfile ? [] : ['no-lockfile'];
  const base = { packageManager: pm, installDir, lockfile };
  const needsBuildScript = (framework: Framework, outputDir: string): Detection => {
    if (!pkg.scripts.build) warnings.push('no-build-script');
    return result({ ...base, framework, buildCommand: run('build'), outputDir, warnings });
  };

  if (pkg.deps.has('next')) {
    let exported = false;
    for (const name of configNames('next.config')) {
      const text = await source.read(joinRel(rootDir, name));
      if (text !== null && /output\s*:\s*['"`]export['"`]/.test(text)) exported = true;
    }
    if (!exported) warnings.push('next-needs-export');
    if (source.isDir) {
      for (const dir of ['pages/api', 'src/pages/api', 'app/api', 'src/app/api']) {
        if (await source.isDir(joinRel(rootDir, dir))) {
          warnings.push('next-api-routes');
          break;
        }
      }
    }
    return needsBuildScript('next', 'out');
  }
  if (pkg.deps.has('nuxt')) {
    if (pkg.scripts.generate) return result({ ...base, framework: 'nuxt', buildCommand: run('generate'), outputDir: '.output/public', warnings });
    warnings.push('nuxt-needs-generate');
    return result({ ...base, framework: 'nuxt', buildCommand: 'npx nuxt generate', outputDir: '.output/public', warnings });
  }
  if (pkg.deps.has('@sveltejs/kit')) {
    let isStatic = pkg.deps.has('@sveltejs/adapter-static');
    for (const name of configNames('svelte.config')) {
      const text = await source.read(joinRel(rootDir, name));
      if (text !== null && text.includes('adapter-static')) isStatic = true;
    }
    if (!isStatic) warnings.push('sveltekit-needs-static');
    return needsBuildScript('sveltekit', 'build');
  }
  if (pkg.deps.has('astro')) return needsBuildScript('astro', 'dist');
  if (pkg.deps.has('@docusaurus/core')) return needsBuildScript('docusaurus', 'build');
  if (pkg.deps.has('vitepress')) {
    const inDocs = (await firstExisting(source, joinRel(rootDir, 'docs/.vitepress'), configNames('config'))) !== null;
    const script = pkg.scripts['docs:build'] ? 'docs:build' : 'build';
    if (!pkg.scripts[script]) warnings.push('no-build-script');
    return result({ ...base, framework: 'vitepress', buildCommand: run(script), outputDir: inDocs ? 'docs/.vitepress/dist' : '.vitepress/dist', warnings });
  }
  if (pkg.deps.has('react-scripts')) return needsBuildScript('cra', 'build');
  if (pkg.deps.has('vite')) return needsBuildScript('vite', 'dist');
  if (pkg.scripts.build) {
    warnings.push('unknown-framework');
    return result({ ...base, framework: 'other', buildCommand: run('build'), outputDir: 'dist', warnings });
  }
  // A package.json for tooling only, beside a finished page: published as it is.
  if (await source.exists(joinRel(rootDir, 'index.html'))) {
    return result({ framework: 'static', packageManager: null, installDir: rootDir, lockfile: null, buildCommand: null, outputDir: '', warnings: [] });
  }
  warnings.push('no-build-script');
  return result({ ...base, framework: 'other', buildCommand: run('build'), outputDir: 'dist', warnings });
}
