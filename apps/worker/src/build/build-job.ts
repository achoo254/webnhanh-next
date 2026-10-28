/**
 * One `build` job in webnhanh-builder: fetch the source, recognize it, install and build in Docker (run-build.ts), copy
 * the output to the staging directory, then hand the job back to the queue for webnhanh-worker to publish (the builder
 * never writes SITES_DIR). Each step is timed in `jobs.steps` (fetch, install, build, check, then publish by the
 * worker); the log goes to `job_logs` as it comes and the latest line, read as progress, to `jobs.progress`.
 *
 * A build that fails leaves the live site as it is. One that would build exactly what is live (same commit or zip,
 * same settings) is skipped and not counted.
 */
import { createHash } from 'node:crypto';
import { constants, createReadStream } from 'node:fs';
import { lstat, mkdir, open, rm } from 'node:fs/promises';
import path from 'node:path';
import {
  appendJobLog,
  developerSites,
  failJob,
  isUuid,
  jobs,
  markJobReady,
  sites,
  skipRunningBuild,
  type BuildReport,
  type Db,
  type Job,
  type JobStep,
} from '@webnhanh/db';
import { and, eq } from 'drizzle-orm';
import { failureOf, LogCollector, relevantLines, type BuildStage } from './build-log';
import { lockKey, restoreModules, saveCache, takeHome } from './build-cache';
import { collectOutput, OutputError, sha256 } from './collect-output';
import { detectProject, installArgv, type Detection, type DetectionWarning } from './detect';
import { cloneRepo, extractZip, SourceError, type CloneInput } from './fetch-source';
import { localSource } from './project-sources';
import { BUILD_TIMEOUT_MS, dockerReady, NO_NETWORK, runStep, shellArgv, type ContainerSpec, type DockerConfig, type StepResult } from './run-build';
import { buildSettingsSchema, checkBranch, joinRel, parseRepoUrl } from './settings';

/** The named steps of a build, in order; `publish` is the worker's. The web app shows each under its own label. */
export const BUILD_STEPS = ['fetch', 'install', 'build', 'check', 'publish'] as const;
export type BuildStep = (typeof BUILD_STEPS)[number];

export interface Logger {
  info(message: string): void;
  warn(message: string): void;
}

export interface BuildDirs {
  /** Uploaded zips, `<site id>.zip` (written by the server). */
  readonly inbox: string;
  /** Staging of finished outputs, `<job id>/` (read by the worker). */
  readonly out: string;
  /** Job directories while they build. */
  readonly work: string;
  /** Per-site caches (build-cache.ts). */
  readonly cache: string;
}

/** The outside world of a build; tests replace the parts that need git or Docker. */
export interface BuildTools {
  readonly clone: (input: CloneInput) => Promise<{ commit: string }>;
  readonly runStep: (config: DockerConfig, spec: ContainerSpec, options: { deadline: number; onLine: (line: string) => void; signal?: AbortSignal }) => Promise<StepResult>;
  readonly dockerReady: (config: DockerConfig) => Promise<'ok' | 'no-docker' | 'no-network'>;
}

export const REAL_TOOLS: BuildTools = { clone: cloneRepo, runStep, dockerReady };

export interface BuilderDeps {
  readonly db: Db;
  readonly log: Logger;
  readonly now: () => Date;
  readonly docker: DockerConfig;
  readonly gitPath: string;
  readonly dirs: BuildDirs;
  /** Size limit of one release (the site's size limit). */
  readonly siteMaxBytes: number;
  readonly tools?: BuildTools;
  /** How often the log and progress are written while a build runs. */
  readonly flushMs?: number;
}

export type BuildOutcome = 'ready' | 'failed' | 'skipped' | 'requeued';

/** A failure the person is told about: a stable code and the lines that show why. */
export class BuildFailure extends Error {
  constructor(
    readonly code: string,
    readonly lines: readonly string[] = [],
  ) {
    super(code);
    this.name = 'BuildFailure';
  }
}

/** Times the steps of one build. */
class BuildClock {
  readonly steps: JobStep[] = [];

  constructor(private readonly now: () => Date) {}

  begin(name: BuildStep, note?: JobStep['note']): void {
    const at = this.now().toISOString();
    const last = this.steps[this.steps.length - 1];
    if (last && !last.finishedAt) last.finishedAt = at;
    this.steps.push(note ? { name, startedAt: at, note } : { name, startedAt: at });
  }

  /** Marks the current step as not needed after all (libraries reused). */
  note(note: NonNullable<JobStep['note']>): void {
    const last = this.steps[this.steps.length - 1];
    if (last) last.note = note;
  }
}

const BLOCKING_WARNINGS: ReadonlySet<DetectionWarning> = new Set(['next-needs-export', 'next-api-routes', 'sveltekit-needs-static', 'hugo-later', 'nothing-to-publish', 'package-json-invalid']);

/** sha256 of a file, read as a stream. */
async function fileHash(file: string): Promise<string> {
  const hash = createHash('sha256');
  for await (const chunk of createReadStream(file)) hash.update(chunk as Buffer);
  return hash.digest('hex');
}

/** A lockfile's bytes (not through a symlink), for the cache key. */
async function readLockfile(sourceDir: string, rel: string): Promise<Buffer | null> {
  const file = path.join(sourceDir, ...rel.split('/'));
  const info = await lstat(file).catch(() => null);
  if (!info?.isFile() || info.size > 64 * 1024 * 1024) return null;
  const handle = await open(file, constants.O_RDONLY | constants.O_NOFOLLOW).catch(() => null);
  if (!handle) return null;
  try {
    return await handle.readFile();
  } finally {
    await handle.close();
  }
}

/** Where a job's directory and its staged output are. */
export function jobPaths(dirs: BuildDirs, jobId: string): { jobDir: string; sourceDir: string; outDir: string } {
  if (!isUuid(jobId)) throw new Error(`not a job id: ${jobId}`);
  const jobDir = path.join(dirs.work, jobId);
  return { jobDir, sourceDir: path.join(jobDir, 'src'), outDir: path.join(dirs.out, jobId) };
}

/** The uploaded zip of a site. */
export function inboxZip(dirs: BuildDirs, siteId: string): string {
  if (!isUuid(siteId)) throw new Error(`not a site id: ${siteId}`);
  return path.join(dirs.inbox, `${siteId}.zip`);
}

/** Runs one claimed build job to its handoff (or its end); never throws for a failure of the build itself. */
export async function runBuildJob(deps: BuilderDeps, job: Job, signal?: AbortSignal): Promise<BuildOutcome> {
  const { db } = deps;
  const tools = deps.tools ?? REAL_TOOLS;
  const clock = new BuildClock(deps.now);
  const collector = new LogCollector();
  let seq = 0;
  let saving: Promise<void> = Promise.resolve();
  const flush = (): Promise<void> => {
    saving = saving.then(async () => {
      const { lines, progress } = collector.drain();
      seq = await appendJobLog(db, job.id, seq, lines, deps.now());
      await db
        .update(jobs)
        .set(progress ? { steps: [...clock.steps], progress } : { steps: [...clock.steps] })
        .where(and(eq(jobs.id, job.id), eq(jobs.status, 'running')));
    });
    return saving.catch((error: unknown) => deps.log.warn(`build ${job.id}: log not saved: ${error instanceof Error ? error.message : String(error)}`));
  };
  const timer = setInterval(() => void flush(), deps.flushMs ?? 1_000);
  const { jobDir, sourceDir, outDir } = jobPaths(deps.dirs, job.id);
  let siteId: string | null = null;
  let cacheKey: string | null = null;
  let installRan = false;
  let cacheTaken = false;

  try {
    const [row] = await db
      .select({ site: sites, dev: developerSites })
      .from(sites)
      .innerJoin(developerSites, eq(developerSites.siteId, sites.id))
      .where(and(eq(sites.id, job.siteId), eq(sites.accountId, job.accountId)));
    if (!row || row.site.kind !== 'developer') throw new BuildFailure('site-missing');
    const { site, dev } = row;
    siteId = site.id;
    const parsedSettings = buildSettingsSchema.safeParse(dev.settings);
    if (!parsedSettings.success) throw new BuildFailure('settings-invalid');
    const settings = parsedSettings.data;

    await rm(jobDir, { recursive: true, force: true });
    await mkdir(jobDir, { recursive: true, mode: 0o700 });

    // Fetch.
    clock.begin('fetch');
    await flush();
    let sourceId: string;
    if (dev.source === 'git') {
      const repo = parseRepoUrl(dev.repoUrl);
      const branch = checkBranch(dev.branch);
      if (!repo || !branch) throw new BuildFailure('settings-invalid');
      collector.note(`git clone --depth 1 --branch ${branch} ${repo.url}`);
      const { commit } = await tools.clone({ gitPath: deps.gitPath, repo, branch, dest: sourceDir, home: path.join(jobDir, 'git-home'), signal });
      await rm(path.join(jobDir, 'git-home'), { recursive: true, force: true });
      collector.note(`commit ${commit}`);
      await db.update(jobs).set({ commitSha: commit }).where(eq(jobs.id, job.id));
      sourceId = commit;
    } else {
      const zip = inboxZip(deps.dirs, site.id);
      collector.note('giải nén file zip đã tải lên');
      const hash = await fileHash(zip).catch(() => {
        throw new BuildFailure('zip-invalid', ['Chưa có file zip nào được tải lên.']);
      });
      const extracted = await extractZip(zip, sourceDir);
      collector.note(`${extracted.files} file, ${Math.round(extracted.bytes / 1024)} KB`);
      sourceId = `zip:${hash}`;
    }

    const buildKey = sha256(sourceId, JSON.stringify(settings));
    if (job.trigger !== 'rename' && site.currentReleaseId !== null && dev.lastBuildKey === buildKey) {
      collector.note('không có gì thay đổi so với bản đang chạy: bỏ qua build');
      await flush();
      await skipRunningBuild(db, job.id, deps.now());
      return 'skipped';
    }

    // Recognize, on the fetched files (nothing of them runs here).
    const detection: Detection = await detectProject(localSource(sourceDir), settings.rootDir);
    await db.update(developerSites).set({ detection, updatedAt: deps.now() }).where(eq(developerSites.siteId, site.id));
    await db.update(jobs).set({ framework: settings.buildCommand === null ? 'static' : detection.framework }).where(eq(jobs.id, job.id));
    const plain = settings.buildCommand === null;
    const blocking = detection.warnings.filter((w) => BLOCKING_WARNINGS.has(w));
    if (!plain && (detection.packageManager === null || blocking.length > 0)) throw new BuildFailure('unsupported', blocking.length > 0 ? blocking : ['no-package-json']);

    // Install.
    const deadline = deps.now().getTime() + BUILD_TIMEOUT_MS;
    clock.begin('install', plain ? 'not-needed' : undefined);
    await flush();
    const runIn = async (stage: BuildStage, spec: Omit<ContainerSpec, 'name' | 'jobId' | 'jobDir'>): Promise<void> => {
      collector.setStage(stage);
      collector.note(spec.argv.join(' '));
      const result = await tools.runStep(deps.docker, { ...spec, name: `webnhanh-build-${job.id}-${stage}`, jobId: job.id, jobDir }, { deadline, onLine: (line) => collector.add(line), signal });
      if (result.aborted || signal?.aborted) throw new BuildFailure('aborted');
      if (result.exitCode !== 0 || result.timedOut) {
        const lines = [...collector.recent];
        const code = failureOf({ stage, exitCode: result.exitCode, timedOut: result.timedOut }, lines);
        collector.note(`exit ${String(result.exitCode)}${result.timedOut ? ' (quá 5 phút, đã dừng)' : ''}`);
        throw new BuildFailure(code, relevantLines(lines));
      }
    };
    if (!plain && detection.packageManager !== null) {
      if ((await tools.dockerReady(deps.docker)) !== 'ok') throw new BuildFailure('docker-unavailable');
      await takeHome(deps.dirs.cache, site.id, jobDir);
      cacheTaken = true;
      const lock = detection.lockfile ? await readLockfile(sourceDir, detection.lockfile) : null;
      cacheKey = lock ? lockKey(lock, detection.packageManager, detection.installDir) : null;
      if (cacheKey && (await restoreModules(deps.dirs.cache, site.id, cacheKey, sourceDir))) {
        clock.note('cached');
        collector.note('dùng lại thư viện đã cài ở lần build trước (lockfile không đổi)');
        installRan = true;
      } else {
        await runIn('install', { workdir: detection.installDir, network: deps.docker.network, argv: installArgv(detection.packageManager) });
        installRan = true;
      }

      // Build.
      clock.begin('build');
      await flush();
      await runIn('build', { workdir: settings.rootDir, network: NO_NETWORK, argv: shellArgv(settings.buildCommand ?? '') });
    } else {
      clock.begin('build', 'not-needed');
    }

    // Check and stage the output.
    clock.begin('check');
    await flush();
    const report: BuildReport = await collectOutput({
      sourceRoot: sourceDir,
      outputRel: joinRel(settings.rootDir, settings.outputDir),
      dest: outDir,
      maxBytes: deps.siteMaxBytes,
      skipHidden: plain,
      buildKey,
    });
    collector.note(`output: ${report.fileCount} file, ${Math.round(report.bytes / 1024)} KB`);

    clock.begin('publish');
    await flush();
    await db.update(jobs).set({ report }).where(eq(jobs.id, job.id));
    if (!(await markJobReady(db, job.id, clock.steps, deps.now()))) {
      deps.log.warn(`build ${job.id} finished after it was failed`);
      await rm(outDir, { recursive: true, force: true });
      return 'failed';
    }
    return 'ready';
  } catch (error) {
    await rm(outDir, { recursive: true, force: true });
    if (signal?.aborted) return 'requeued';
    const failure =
      error instanceof BuildFailure
        ? error
        : error instanceof SourceError || error instanceof OutputError
          ? new BuildFailure(error.code, error.lines)
          : new BuildFailure('builder-error');
    if (!(error instanceof BuildFailure || error instanceof SourceError || error instanceof OutputError)) {
      deps.log.warn(`build ${job.id}: ${error instanceof Error ? (error.stack ?? error.message) : String(error)}`);
    }
    collector.note(`thất bại: ${failure.code}`);
    await flush();
    await failJob(db, job.id, failure.code, failure.lines.slice(0, 20), deps.now());
    return 'failed';
  } finally {
    clearInterval(timer);
    await saving.catch(() => undefined);
    if (siteId && cacheTaken) {
      await saveCache(deps.dirs.cache, siteId, { jobDir, sourceDir, key: installRan ? cacheKey : null }).catch((error: unknown) =>
        deps.log.warn(`build ${job.id}: cache not saved: ${error instanceof Error ? error.message : String(error)}`),
      );
    }
    await rm(jobDir, { recursive: true, force: true });
  }
}
