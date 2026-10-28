import { claimNextJob, failStuckJobs, markJobDone, markJobFailed } from '@webnhanh/db';
import { cleanup } from './cleanup';
import { JobError, runPublish, type PublishDeps } from './publish-job';

export type WorkerDeps = PublishDeps;

export type JobOutcome = 'idle' | 'done' | 'failed';

/**
 * One turn of the worker: fails jobs stuck in `running`, then claims the oldest queued job and runs it. A publish
 * takes seconds, so a stopping worker finishes the job in hand instead of putting it back.
 */
export async function processNextJob(deps: WorkerDeps): Promise<JobOutcome> {
  const stuck = await failStuckJobs(deps.db, deps.now());
  for (const id of stuck) deps.log.warn(`job ${id} was running too long: marked failed`);
  const job = await claimNextJob(deps.db, deps.now());
  if (!job) return 'idle';
  deps.log.info(`job ${job.id} ${job.type} for site ${job.siteId}`);
  try {
    if (job.type !== 'publish') throw new JobError('publish-failed', `no runner for ${job.type} jobs yet`);
    const releaseId = await runPublish(deps, job);
    if (!(await markJobDone(deps.db, job.id, releaseId, deps.now()))) deps.log.warn(`job ${job.id} finished after it was marked failed`);
    deps.log.info(`job ${job.id} done: release ${releaseId}`);
    return 'done';
  } catch (error) {
    const code = error instanceof JobError ? error.code : 'publish-failed';
    deps.log.warn(`job ${job.id} failed: ${error instanceof Error ? error.message : String(error)}`);
    await markJobFailed(deps.db, job.id, code, deps.now());
    return 'failed';
  }
}

export interface RunningWorker {
  /** Stops polling once the job in hand (if any) is finished. */
  stop(): Promise<void>;
}

/** Cleanup (expired sessions and name holds, unused photos) runs this often. */
const CLEANUP_EVERY_MS = 60 * 60 * 1000;

/** Polls the queue every `pollMs`, one job at a time; right after a job it looks again at once. */
export function startWorker(deps: WorkerDeps & { readonly pollMs: number }): RunningWorker {
  let stopped = false;
  let timer: NodeJS.Timeout | null = null;
  let current: Promise<void> = Promise.resolve();
  let lastCleanup = 0;

  const tick = (): void => {
    timer = null;
    current = (async () => {
      let outcome: JobOutcome = 'idle';
      try {
        outcome = await processNextJob(deps);
        if (outcome === 'idle' && deps.now().getTime() - lastCleanup >= CLEANUP_EVERY_MS) {
          lastCleanup = deps.now().getTime();
          const result = await cleanup(deps.db, deps.uploadsDir, deps.now());
          deps.log.info(
            `cleanup: ${result.sessions} session(s), ${result.nameHolds} name hold(s), ${result.chatLinkCodes} chat code(s), ${result.deliveries} notification(s), ${result.images} unused photo(s)`,
          );
        }
      } catch (error) {
        deps.log.warn(`worker turn failed: ${error instanceof Error ? error.message : String(error)}`);
      }
      if (!stopped) timer = setTimeout(tick, outcome === 'idle' ? deps.pollMs : 0);
    })();
  };
  tick();
  return {
    async stop() {
      stopped = true;
      if (timer) clearTimeout(timer);
      await current;
    },
  };
}
