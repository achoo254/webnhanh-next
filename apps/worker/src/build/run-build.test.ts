import { describe, expect, it } from 'vitest';
import { failureOf, progressOf, relevantLines } from './build-log';
import { DockerArgumentError, dockerRunArgs, NO_NETWORK, shellArgv, type ContainerSpec, type DockerConfig } from './run-build';

const JOB = '0b8d2d3e-1111-4222-8333-444455556666';
const config: DockerConfig = { docker: 'docker', image: 'webnhanh-build:node22', network: 'webnhanh-build' };
const install: ContainerSpec = {
  name: `webnhanh-build-${JOB}-install`,
  jobId: JOB,
  jobDir: `/var/lib/webnhanh/work/${JOB}`,
  workdir: '',
  network: 'webnhanh-build',
  argv: ['pnpm', 'install', '--frozen-lockfile', '--prefer-offline'],
};

describe('docker run arguments', () => {
  it('runs the install step with every limit, the build network and only the job directory', () => {
    expect(dockerRunArgs(config, install)).toEqual([
      'run', '--rm',
      '--name', `webnhanh-build-${JOB}-install`,
      '--label', `webnhanh.build=${JOB}`,
      '--user', '10001:10001',
      '--read-only',
      '--tmpfs', '/tmp:size=256m',
      '--cap-drop', 'ALL',
      '--security-opt', 'no-new-privileges',
      '--pids-limit', '256',
      '--memory', '1g',
      '--memory-swap', '1g',
      '--cpus', '1',
      '--network', 'webnhanh-build',
      '--env', 'CI=1',
      '--env', 'NODE_OPTIONS=--max-old-space-size=768',
      '--mount', `type=bind,source=/var/lib/webnhanh/work/${JOB},target=/build`,
      '--workdir', '/build/src',
      '--',
      'webnhanh-build:node22',
      'pnpm', 'install', '--frozen-lockfile', '--prefer-offline',
    ]);
  });

  it('runs the build step with no network, in the app directory, the command as one argument of the container shell', () => {
    const args = dockerRunArgs(config, { ...install, name: `webnhanh-build-${JOB}-build`, workdir: 'apps/web', network: NO_NETWORK, argv: shellArgv('pnpm build && echo "$HOME"; rm -rf /') });
    expect(args.slice(args.indexOf('--network'), args.indexOf('--network') + 2)).toEqual(['--network', 'none']);
    expect(args.slice(args.indexOf('--workdir'), args.indexOf('--workdir') + 2)).toEqual(['--workdir', '/build/src/apps/web']);
    expect(args.slice(-3)).toEqual(['sh', '-c', 'pnpm build && echo "$HOME"; rm -rf /']);
    // Exactly two environment variables, nothing passed through from the builder.
    expect(args.filter((a) => a === '--env' || a === '-e')).toHaveLength(2);
    expect(args.some((a) => a.startsWith('--privileged') || a.startsWith('--cap-add') || a.startsWith('-v') || a === '--volume')).toBe(false);
  });

  it('refuses anything not of the expected shape', () => {
    const bad: Partial<ContainerSpec>[] = [
      { name: 'other-container' },
      { name: `webnhanh-build-${JOB}-install --privileged` },
      { jobId: 'x' },
      { jobDir: '/var/lib/webnhanh/work/a,readonly=false,source=/' },
      { jobDir: '/var/lib/webnhanh/../../etc' },
      { jobDir: 'relative/dir' },
      { workdir: '../..' },
      { workdir: '/etc' },
      { network: 'host' },
      { network: 'bridge' },
      { argv: [] },
      { argv: ['sh', '-c', 'a\0b'] },
    ];
    for (const change of bad) expect(() => dockerRunArgs(config, { ...install, ...change }), JSON.stringify(change)).toThrow(DockerArgumentError);
    expect(() => dockerRunArgs({ ...config, image: 'img; rm -rf /' }, install)).toThrow(DockerArgumentError);
    expect(() => shellArgv('npm run build\nrm -rf /')).toThrow(DockerArgumentError);
  });
});

describe('reading the log', () => {
  it('turns lines into progress', () => {
    expect(progressOf('install', 'Progress: resolved 214, reused 200, downloaded 14, added 0')).toEqual({ code: 'install-packages', n: 214 });
    expect(progressOf('install', 'added 1311 packages, and audited 1312 packages in 21s')).toEqual({ code: 'install-packages', n: 1311 });
    expect(progressOf('build', 'transforming (38) src/App.tsx')).toEqual({ code: 'build-modules', n: 38 });
    expect(progressOf('build', '✓ 120 modules transformed.')).toEqual({ code: 'build-modules', n: 120 });
    expect(progressOf('build', '   Generating static pages (3/7)')).toEqual({ code: 'build-pages', n: 3, total: 7 });
    expect(progressOf('build', 'something else')).toEqual({ code: 'line', text: 'something else' });
  });

  it('names the usual causes of a failure', () => {
    expect(failureOf({ stage: 'build', exitCode: 137, timedOut: true }, [])).toBe('build-timeout');
    expect(failureOf({ stage: 'build', exitCode: 137, timedOut: false }, [])).toBe('build-oom');
    expect(failureOf({ stage: 'build', exitCode: 134, timedOut: false }, ['FATAL ERROR: Reached heap limit Allocation failed - JavaScript heap out of memory'])).toBe('build-oom');
    expect(failureOf({ stage: 'install', exitCode: 1, timedOut: false }, ['npm error The `npm ci` command can only install with an existing package-lock.json'])).toBe('lockfile');
    expect(failureOf({ stage: 'install', exitCode: 1, timedOut: false }, [' ERR_PNPM_OUTDATED_LOCKFILE  Cannot install with "frozen-lockfile"'])).toBe('lockfile');
    expect(failureOf({ stage: 'install', exitCode: 1, timedOut: false }, ['npm error 404 Not Found'])).toBe('install-failed');
    expect(failureOf({ stage: 'build', exitCode: 2, timedOut: false }, ["src/App.tsx(3,1): error TS2304: Cannot find name 'x'."])).toBe('build-failed');
  });

  it('picks the lines around the first error', () => {
    const lines = ['> vite build', 'vite v8', 'transforming...', "src/App.tsx(3,1): error TS2304: Cannot find name 'x'.", 'at line 3', 'done'];
    expect(relevantLines(lines, 3)).toEqual(['vite v8', 'transforming...', "src/App.tsx(3,1): error TS2304: Cannot find name 'x'."]);
    expect(relevantLines(['a', 'b', 'c'], 2)).toEqual(['b', 'c']);
  });
});
