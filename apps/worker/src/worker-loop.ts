import { claimNextJob, failJob, failStuckJobs, markJobDone, markJobFailed } from '@webnhanh/db';
import { processNextAdminAction, pruneTakenDown } from './admin-actions';
import { runBuildPublish } from './build-publish';
import { cleanup } from './cleanup';
import { JobError, runPublish, type PublishDeps } from './publish-job';
import { refreshNextWedding } from './wedding-refresh';

export type WorkerDeps = PublishDeps & {
  /** Where webnhanh-builder stages finished builds; unset: built jobs fail here (no builder on this server). */
  readonly buildOutputDir?: string;
};

export type JobOutcome = 'idle' | 'done' | 'failed';

/**
 * One turn of the worker: an admin's takedown, restore or review decision first (they must not wait behind
 * publishes), else fails jobs stuck in `running`, then claims the oldest queued job of its lane (template publishes,
 * and developer builds the builder handed back) and publishes it. A publish takes seconds, so a stopping worker
 * finishes the job in hand instead of putting it back.
 */
export async function processNextJob(deps: WorkerDeps): Promise<JobOutcome> {
  if (await processNextAdminAction(deps)) return 'done';
  const stuck = await failStuckJobs(deps.db, deps.now());
  for (const id of stuck) deps.log.warn(`job ${id} was running too long: marked failed`);
  const job = await claimNextJob(deps.db, deps.now());
  if (!job) return 'idle';
  deps.log.info(`job ${job.id} ${job.type} for site ${job.siteId}`);
  try {
    if (job.type === 'build') {
      const outcome = await runBuildPublish(deps, job);
      deps.log.info(`build ${job.id} ${outcome.held ? 'held for review' : 'published'}: release ${outcome.releaseId}`);
      return 'done';
    }
    const outcome = await runPublish(deps, job);
    if (!(await markJobDone(deps.db, job.id, outcome.held ? null : outcome.releaseId, deps.now()))) deps.log.warn(`job ${job.id} finished after it was marked failed`);
    deps.log.info(`job ${job.id} ${outcome.held ? 'held for review' : 'done'}: release ${outcome.releaseId}`);
    return 'done';
  } catch (error) {
    const code = error instanceof JobError ? error.code : 'publish-failed';
    deps.log.warn(`job ${job.id} failed: ${error instanceof Error ? error.message : String(error)}`);
    // A build's owner may have asked to hear how it ended.
    if (job.type === 'build') await failJob(deps.db, job.id, code, [], deps.now());
    else await markJobFailed(deps.db, job.id, code, deps.now());
    return 'failed';
  }
}

export interface RunningWorker {
  /** Stops polling once the job in hand (if any) is finished. */
  stop(): Promise<void>;
}

/** Cleanup (expired sessions and name holds, unused photos) runs this often. */
const CLEANUP_EVERY_MS = 60 * 60 * 1000;
/** After finding no wedding page to refresh, the worker looks again this much later. */
const REFRESH_CHECK_MS = 10 * 60 * 1000;

/**
 * Polls the queue every `pollMs`, one job at a time; right after a job it looks again at once. With nothing queued it
 * does the housekeeping: cleanup about once an hour, and the daily refresh of wedding countdowns.
 */
export function startWorker(deps: WorkerDeps & { readonly pollMs: number }): RunningWorker {
  let stopped = false;
  let timer: NodeJS.Timeout | null = null;
  let current: Promise<void> = Promise.resolve();
  let lastCleanup = 0;
  let nextRefreshCheck = 0;

  const tick = (): void => {
    timer = null;
    current = (async () => {
      let outcome: JobOutcome = 'idle';
      try {
        outcome = await processNextJob(deps);
        if (outcome === 'idle' && deps.now().getTime() - lastCleanup >= CLEANUP_EVERY_MS) {
          lastCleanup = deps.now().getTime();
          const result = await cleanup(deps.db, deps.uploadsDir, deps.now());
          const takenDown = await pruneTakenDown(deps);
          deps.log.info(
            `cleanup: ${result.sessions} session(s), ${result.nameHolds} name hold(s), ${result.chatLinkCodes} chat code(s), ${result.deliveries} notification(s), ${result.images} unused photo(s), ${takenDown} taken-down site(s)`,
          );
        }
        // Low priority: only with an empty queue, one page a turn, and the queue is looked at again first.
        if (outcome === 'idle' && deps.now().getTime() >= nextRefreshCheck) {
          if (await refreshNextWedding(deps)) outcome = 'done';
          else nextRefreshCheck = deps.now().getTime() + REFRESH_CHECK_MS;
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
