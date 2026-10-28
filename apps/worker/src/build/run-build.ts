/**
 * The one module that runs `docker`. webnhanh-builder is in the `docker` group, which is as good as root, so nothing
 * here ever builds a command line from text: docker gets an argument list (spawn, no shell), and every value in it is
 * either a constant or checked against a strict shape right here. The person's build command is one argument of
 * `sh -c` inside the container, where it runs as user 10001 with:
 *
 *   --read-only, a 256 MB /tmp, no capabilities, no-new-privileges, 256 processes, 1 GB memory (no swap beyond it),
 *   one CPU, only the job's own directory mounted (its source and the site's cache), no environment but CI=1 and
 *   NODE_OPTIONS; the install step on the `webnhanh-build` network (internet only, see
 *   infra/builder/build-network.sh), the build step with no network at all; both steps together killed after 5 minutes.
 */
import { spawn } from 'node:child_process';
import path from 'node:path';

/** Inside the container: the job's directory, the source under it, HOME (package manager caches) beside it. */
export const CONTAINER_ROOT = '/build';
export const CONTAINER_SRC = '/build/src';
export const CONTAINER_HOME = '/build/home';

/** Both steps of one build together. */
export const BUILD_TIMEOUT_MS = 5 * 60 * 1000;
/** The uid and gid of the build user, made in infra/builder/Dockerfile; webnhanh-builder has the same on the host. */
export const BUILD_USER = '10001:10001';
/** Containers of builds carry this label, so leftovers of a crashed builder can be found and killed. */
export const BUILD_LABEL = 'webnhanh.build';

export const NO_NETWORK = 'none';

export interface DockerConfig {
  /** The docker program. */
  readonly docker: string;
  /** The build image (infra/builder/Dockerfile), e.g. `webnhanh-build:node22`. */
  readonly image: string;
  /** The network of the install step (`webnhanh-build`). */
  readonly network: string;
}

export interface ContainerSpec {
  /** Unique per step: `webnhanh-build-<job id>-install`. */
  readonly name: string;
  readonly jobId: string;
  /** The job's directory on the host, mounted at /build. */
  readonly jobDir: string;
  /** Where the step runs, relative to the source (`''`: the source itself). */
  readonly workdir: string;
  /** `none`, or the build network. */
  readonly network: string;
  /** The program and its arguments inside the container. */
  readonly argv: readonly string[];
}

const NAME = /^webnhanh-build-[0-9a-f-]{36}-(?:install|build)$/;
const IMAGE = /^[a-z0-9][a-z0-9._/-]{0,127}(?::[A-Za-z0-9._-]{1,128})?(?:@sha256:[0-9a-f]{64})?$/;
const NETWORK = /^[a-z0-9][a-z0-9_.-]{0,62}$/;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
/** Host paths of the builder's own directories: no comma (the --mount syntax), no space, no `..`. */
const HOST_PATH = /^\/[A-Za-z0-9._/-]+$/;
const WORKDIR = /^(?:[A-Za-z0-9._@+-]+(?:\/[A-Za-z0-9._@+-]+)*)?$/;

export class DockerArgumentError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'DockerArgumentError';
  }
}

function check(ok: boolean, what: string): void {
  if (!ok) throw new DockerArgumentError(`refusing docker argument: ${what}`);
}

/** The build step: the confirmed command, run by the container's shell (never the server's). */
export function shellArgv(command: string): string[] {
  // eslint-disable-next-line no-control-regex
  check(command.trim() !== '' && command.length <= 300 && !/[\u0000-\u001f\u007f]/.test(command), 'build command');
  return ['sh', '-c', command];
}

/** `docker run` arguments of one step. Throws DockerArgumentError for anything not of the expected shape. */
export function dockerRunArgs(config: DockerConfig, spec: ContainerSpec): string[] {
  check(NAME.test(spec.name) && spec.name.includes(spec.jobId), 'container name');
  check(UUID.test(spec.jobId), 'job id');
  check(IMAGE.test(config.image), 'image');
  check(spec.network === NO_NETWORK || (spec.network === config.network && NETWORK.test(spec.network)), 'network');
  check(HOST_PATH.test(spec.jobDir) && !spec.jobDir.split('/').includes('..') && path.isAbsolute(spec.jobDir), 'job directory');
  check(WORKDIR.test(spec.workdir) && !spec.workdir.split('/').some((p) => p === '.' || p === '..'), 'working directory');
  check(spec.argv.length > 0 && spec.argv.every((arg) => typeof arg === 'string' && !arg.includes('\0')), 'command');
  const workdir = spec.workdir === '' ? CONTAINER_SRC : `${CONTAINER_SRC}/${spec.workdir}`;
  return [
    'run',
    '--rm',
    '--name', spec.name,
    '--label', `${BUILD_LABEL}=${spec.jobId}`,
    '--user', BUILD_USER,
    '--read-only',
    '--tmpfs', '/tmp:size=256m',
    '--cap-drop', 'ALL',
    '--security-opt', 'no-new-privileges',
    '--pids-limit', '256',
    '--memory', '1g',
    '--memory-swap', '1g',
    '--cpus', '1',
    '--network', spec.network,
    '--env', 'CI=1',
    '--env', 'NODE_OPTIONS=--max-old-space-size=768',
    '--mount', `type=bind,source=${spec.jobDir},target=${CONTAINER_ROOT}`,
    '--workdir', workdir,
    '--',
    config.image,
    ...spec.argv,
  ];
}

/** The environment of the docker client itself: where its daemon is, nothing else of the builder's. */
export function dockerEnv(): NodeJS.ProcessEnv {
  const env: NodeJS.ProcessEnv = { PATH: process.env.PATH ?? '/usr/bin:/bin', HOME: '/nonexistent' };
  if (process.env.DOCKER_HOST) env.DOCKER_HOST = process.env.DOCKER_HOST;
  return env;
}

export interface StepResult {
  readonly exitCode: number | null;
  /** Killed at the deadline. */
  readonly timedOut: boolean;
  /** Stopped because the builder is stopping. */
  readonly aborted: boolean;
}

/** Runs docker with a fixed argument list and collects its output; resolves with its exit code. */
function runDocker(docker: string, args: readonly string[], onLine?: (line: string) => void): { done: Promise<number | null> } {
  const child = spawn(docker, args, { env: dockerEnv(), stdio: ['ignore', 'pipe', 'pipe'] });
  let rest = '';
  const take = (chunk: Buffer): void => {
    if (!onLine) return;
    const parts = (rest + chunk.toString('utf8')).split(/\r\n|\n|\r/);
    rest = parts.pop() ?? '';
    for (const line of parts) onLine(line);
  };
  child.stdout.on('data', take);
  child.stderr.on('data', take);
  const done = new Promise<number | null>((resolve, reject) => {
    child.on('error', reject);
    child.on('close', (code) => {
      if (onLine && rest !== '') onLine(rest);
      resolve(code);
    });
  });
  return { done };
}

/** Kills a build container by name (it is removed by `--rm`). Quiet when it is already gone. */
export async function killContainer(config: DockerConfig, name: string): Promise<void> {
  check(NAME.test(name), 'container name');
  await runDocker(config.docker, ['kill', '--signal', 'KILL', '--', name]).done.catch(() => null);
}

/**
 * Runs one step in its container until it exits, the deadline passes (`docker kill`), or `signal` aborts (the
 * builder is stopping: also killed). Every output line goes to `onLine`.
 */
export async function runStep(
  config: DockerConfig,
  spec: ContainerSpec,
  options: { readonly deadline: number; readonly onLine: (line: string) => void; readonly signal?: AbortSignal },
): Promise<StepResult> {
  const args = dockerRunArgs(config, spec);
  let timedOut = false;
  let aborted = false;
  const run = runDocker(config.docker, args, options.onLine);
  const kill = (): void => void killContainer(config, spec.name);
  const timer = setTimeout(
    () => {
      timedOut = true;
      kill();
    },
    Math.max(0, options.deadline - Date.now()),
  );
  const onAbort = (): void => {
    aborted = true;
    kill();
  };
  if (options.signal?.aborted) onAbort();
  options.signal?.addEventListener('abort', onAbort, { once: true });
  try {
    const exitCode = await run.done;
    return { exitCode, timedOut, aborted };
  } finally {
    clearTimeout(timer);
    options.signal?.removeEventListener('abort', onAbort);
  }
}

/** Kills build containers left by a builder that crashed (found by their label). */
export async function killLeftoverContainers(config: DockerConfig): Promise<number> {
  const names: string[] = [];
  const code = await runDocker(config.docker, ['ps', '--no-trunc', '--filter', `label=${BUILD_LABEL}`, '--format', '{{.Names}}'], (line) => {
    if (NAME.test(line.trim())) names.push(line.trim());
  }).done.catch(() => null);
  if (code !== 0) return 0;
  for (const name of names) await killContainer(config, name);
  return names.length;
}

/** Whether docker answers and the build network exists; builds need both. */
export async function dockerReady(config: DockerConfig): Promise<'ok' | 'no-docker' | 'no-network'> {
  check(NETWORK.test(config.network), 'network');
  const version = await runDocker(config.docker, ['version', '--format', '{{.Server.Version}}']).done.catch(() => null);
  if (version !== 0) return 'no-docker';
  const network = await runDocker(config.docker, ['network', 'inspect', '--format', '{{.Name}}', '--', config.network]).done.catch(() => null);
  return network === 0 ? 'ok' : 'no-network';
}
