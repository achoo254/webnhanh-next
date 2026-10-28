/**
 * webnhanh-builder's loop: one build at a time. Each turn fails builds stuck past BUILD_STUCK_AFTER_MS, turns pushes
 * whose 30 seconds are over into builds, and starts the oldest queued build when the server has room for it (free
 * memory and disk; otherwise the build waits in the queue). About once an hour: staged outputs the worker is done with,
 * unused caches and old build logs are deleted.
 */
import { readFile, readdir, rm, statfs } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { claimNextJob, failStuckJobs, isUuid, jobs, pruneBuildLogs, queueDuePushes, requeueJob, runningJobsOf, sites, type Db } from '@webnhanh/db';
import { inArray } from 'drizzle-orm';
import { pruneCaches } from './build-cache';
import { runBuildJob, type BuilderDeps } from './build-job';
import { killLeftoverContainers } from './run-build';

export interface BuilderLoopDeps extends BuilderDeps {
  readonly pollMs: number;
  /** A build starts only with this much memory available (bytes); 0 to not check. */
  readonly minFreeMemory: number;
  /** ...and this much free disk where builds and caches live (bytes); 0 to not check. */
  readonly minFreeDisk: number;
  /** How the room is measured; tests replace it. */
  readonly room?: () => Promise<{ memory: number; disk: number }>;
}

/** Available memory: MemAvailable on Linux (what can be had without swapping), else what Node reports. */
export async function availableMemory(): Promise<number> {
  const meminfo = await readFile('/proc/meminfo', 'utf8').catch(() => null);
  const kb = meminfo ? /^MemAvailable:\s+(\d+) kB/m.exec(meminfo)?.[1] : undefined;
  return kb ? Number(kb) * 1024 : os.freemem();
}

export async function freeDisk(dir: string): Promise<number> {
  const info = await statfs(dir);
  return info.bavail * info.bsize;
}

export type BuilderTurn = 'idle' | 'waiting-for-room' | 'ready' | 'failed' | 'skipped' | 'requeued';

/** One turn of the builder. */
export async function processNextBuild(deps: BuilderLoopDeps, signal?: AbortSignal): Promise<BuilderTurn> {
  const stuck = await failStuckJobs(deps.db, deps.now(), 'build');
  for (const id of stuck) deps.log.warn(`build ${id} was running too long: marked failed`);
  const pushes = await queueDuePushes(deps.db, deps.now());
  if (pushes.queued + pushes.skipped > 0) deps.log.info(`pushes: ${pushes.queued} build(s) queued, ${pushes.skipped} over the daily limit`);

  if (deps.minFreeMemory > 0 || deps.minFreeDisk > 0) {
    const room = deps.room ? await deps.room() : { memory: await availableMemory(), disk: await freeDisk(deps.dirs.work) };
    if (room.memory < deps.minFreeMemory || room.disk < deps.minFreeDisk) return 'waiting-for-room';
  }
  const job = await claimNextJob(deps.db, deps.now(), 'build');
  if (!job) return 'idle';
  deps.log.info(`build ${job.id} for site ${job.siteId} (${job.trigger ?? 'manual'})`);
  const outcome = await runBuildJob(deps, job, signal);
  if (outcome === 'requeued') await requeueJob(deps.db, job.id);
  deps.log.info(`build ${job.id}: ${outcome}`);
  return outcome;
}

/**
 * Staged outputs whose job is no longer waiting for the worker (published, failed, or gone). The worker only reads
 * them; the builder owns the directory.
 */
export async function pruneStaged(db: Db, outDir: string): Promise<number> {
  const names = (await readdir(outDir).catch(() => [])).filter(isUuid);
  if (names.length === 0) return 0;
  const waiting = new Set(
    (await db.select({ id: jobs.id, status: jobs.status }).from(jobs).where(inArray(jobs.id, names)))
      .filter((job) => job.status === 'queued' || job.status === 'running')
      .map((job) => job.id),
  );
  const stale = names.filter((name) => !waiting.has(name));
  for (const name of stale) await rm(path.join(outDir, name), { recursive: true, force: true });
  return stale.length;
}

const MAINTENANCE_EVERY_MS = 60 * 60 * 1000;

async function maintenance(deps: BuilderLoopDeps): Promise<void> {
  const staged = await pruneStaged(deps.db, deps.dirs.out);
  const live = new Set((await deps.db.select({ id: sites.id }).from(sites)).map((site) => site.id));
  const caches = await pruneCaches(deps.dirs.cache, deps.now(), live);
  const logs = await pruneBuildLogs(deps.db, deps.now());
  deps.log.info(`maintenance: ${staged} staged output(s), ${caches} cache(s), ${logs} log line(s) removed`);
}

export interface RunningBuilder {
  /** Stops: a build in hand is killed and put back in the queue (it runs again from the start). */
  stop(): Promise<void>;
}

/**
 * Starts the loop. One builder serves the server, so builds left `running` by its last stop were cut off: their
 * containers are killed and they go back to the queue.
 */
export async function startBuilder(deps: BuilderLoopDeps): Promise<RunningBuilder> {
  const leftovers = await killLeftoverContainers(deps.docker).catch(() => 0);
  if (leftovers > 0) deps.log.warn(`killed ${leftovers} build container(s) left by the last run`);
  for (const job of await runningJobsOf(deps.db, 'build')) {
    await requeueJob(deps.db, job.id);
    deps.log.warn(`build ${job.id} was cut off by the last stop: queued again`);
  }

  const abort = new AbortController();
  let stopped = false;
  let timer: NodeJS.Timeout | null = null;
  let current: Promise<void> = Promise.resolve();
  let lastMaintenance = 0;
  const tick = (): void => {
    timer = null;
    current = (async () => {
      let turn: BuilderTurn = 'idle';
      try {
        turn = await processNextBuild(deps, abort.signal);
        if ((turn === 'idle' || turn === 'waiting-for-room') && deps.now().getTime() - lastMaintenance >= MAINTENANCE_EVERY_MS) {
          lastMaintenance = deps.now().getTime();
          await maintenance(deps);
        }
      } catch (error) {
        deps.log.warn(`builder turn failed: ${error instanceof Error ? error.message : String(error)}`);
      }
      const busy = turn === 'ready' || turn === 'failed' || turn === 'skipped';
      if (!stopped) timer = setTimeout(tick, busy ? 0 : turn === 'waiting-for-room' ? Math.max(deps.pollMs, 5_000) : deps.pollMs);
    })();
  };
  tick();
  return {
    async stop() {
      stopped = true;
      if (timer) clearTimeout(timer);
      abort.abort();
      await current;
    },
  };
}
