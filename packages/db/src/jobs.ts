/**
 * The job queue shared by the server (enqueue, read), the worker (publishes) and the builder (builds). One job
 * waiting or running per account is enforced by the `jobs_one_active_per_account` index; both claim with
 * FOR UPDATE SKIP LOCKED, so no two processes ever take the same job.
 *
 * Two lanes: webnhanh-builder takes `build` jobs that are not built yet; webnhanh-worker takes `publish` jobs and the
 * build jobs the builder handed back (`ready_at` set, queued again), so only the worker ever writes SITES_DIR.
 */
import { randomUUID } from 'node:crypto';
import { and, asc, desc, eq, inArray, isNotNull, isNull, lt, or, sql } from 'drizzle-orm';
import type { Db } from './client';
import { accounts, jobs, sites, type BuildTrigger, type JobStep, type JobType } from './schema';

export type Job = typeof jobs.$inferSelect;

/** A publish takes seconds; one still running after this was cut off (a crash, a kill) and is failed. */
export const JOB_STUCK_AFTER_MS = 5 * 60 * 1000;
/** A build: fetching (up to 2 minutes), Docker (5 minutes in all), collecting the output, with room to spare. */
export const BUILD_STUCK_AFTER_MS = 15 * 60 * 1000;

/** `publish`: webnhanh-worker. `build`: webnhanh-builder. */
export type JobLane = 'publish' | 'build';

/** Queued jobs a lane takes. */
function laneFilter(lane: JobLane) {
  return lane === 'build'
    ? and(eq(jobs.type, 'build'), isNull(jobs.readyAt))
    : or(eq(jobs.type, 'publish'), and(eq(jobs.type, 'build'), isNotNull(jobs.readyAt)));
}

/** True for a unique-index violation (Postgres 23505), also when drizzle wrapped the driver's error. */
export function isUniqueViolation(error: unknown): boolean {
  for (let e: unknown = error; typeof e === 'object' && e !== null; e = (e as { cause?: unknown }).cause) {
    if ((e as { code?: unknown }).code === '23505') return true;
  }
  return false;
}

/** Why nothing of a site may be published or built: its account was locked, or the site taken down, by an admin. */
export type PublishBlock = 'account-locked' | 'site-removed';

/** The reason the site (or its account) may not be published now, or null. A site that does not exist is not blocked here. */
export async function publishBlock(db: Db, siteId: string): Promise<PublishBlock | null> {
  const [row] = await db
    .select({ status: sites.status, lockedAt: accounts.lockedAt })
    .from(sites)
    .innerJoin(accounts, eq(accounts.id, sites.accountId))
    .where(eq(sites.id, siteId));
  if (!row) return null;
  if (row.lockedAt !== null) return 'account-locked';
  return row.status === 'removed' ? 'site-removed' : null;
}

export type EnqueueResult = { ok: true; job: Job } | { ok: false; reason: 'job-active' | PublishBlock };

export interface EnqueueInput {
  siteId: string;
  accountId: string;
  type: JobType;
  /** A given id (a zip upload names its file after it); a new one otherwise. */
  id?: string;
  trigger?: BuildTrigger;
  commitSha?: string | null;
}

/**
 * Queues a job, or refuses when the account already has one waiting or running, is locked, or the site was taken
 * down.
 */
export async function enqueueJob(db: Db, input: EnqueueInput, now: Date): Promise<EnqueueResult> {
  const block = await publishBlock(db, input.siteId);
  if (block) return { ok: false, reason: block };
  try {
    const { id = randomUUID(), ...rest } = input;
    const [job] = await db
      .insert(jobs)
      .values({ id, ...rest, status: 'queued', createdAt: now })
      .returning();
    if (!job) throw new Error('job insert returned no row');
    return { ok: true, job };
  } catch (error) {
    if (isUniqueViolation(error)) return { ok: false, reason: 'job-active' };
    throw error;
  }
}

/** The job waiting or running for an account, if any. */
export async function activeJobOf(db: Db, accountId: string): Promise<Job | null> {
  const [job] = await db
    .select()
    .from(jobs)
    .where(and(eq(jobs.accountId, accountId), inArray(jobs.status, ['queued', 'running'])))
    .limit(1);
  return job ?? null;
}

/** The newest job of each of the given sites. */
export async function latestJobsOf(db: Db, siteIds: readonly string[]): Promise<Map<string, Job>> {
  if (siteIds.length === 0) return new Map();
  const rows = await db
    .selectDistinctOn([jobs.siteId])
    .from(jobs)
    .where(inArray(jobs.siteId, [...siteIds]))
    .orderBy(jobs.siteId, desc(jobs.createdAt), desc(jobs.id));
  return new Map(rows.map((job) => [job.siteId, job]));
}

/**
 * Takes the oldest queued job of a lane and marks it running, or null when there is none. A build handed back for
 * publishing keeps its start time and steps: the person follows one job from the queue to the live site.
 */
export async function claimNextJob(db: Db, now: Date, lane: JobLane = 'publish'): Promise<Job | null> {
  return db.transaction(async (tx) => {
    const [next] = await tx
      .select({ id: jobs.id, readyAt: jobs.readyAt })
      .from(jobs)
      .where(and(eq(jobs.status, 'queued'), laneFilter(lane)))
      .orderBy(asc(jobs.createdAt), asc(jobs.id))
      .limit(1)
      .for('update', { skipLocked: true });
    if (!next) return null;
    const handedBack = next.readyAt !== null;
    const [row] = await tx
      .update(jobs)
      .set(handedBack ? { status: 'running', claimedAt: now } : { status: 'running', startedAt: now, claimedAt: now, steps: [] })
      .where(eq(jobs.id, next.id))
      .returning();
    return row ?? null;
  });
}

/**
 * Gives a built job back to the queue for webnhanh-worker: its output is in the staging directory. False when it is
 * no longer running (failed as stuck meanwhile).
 */
export async function markJobReady(db: Db, jobId: string, steps: readonly JobStep[], now: Date): Promise<boolean> {
  const rows = await db
    .update(jobs)
    .set({ status: 'queued', readyAt: now, steps: [...steps], progress: null })
    .where(and(eq(jobs.id, jobId), eq(jobs.status, 'running'), isNull(jobs.readyAt)))
    .returning({ id: jobs.id });
  return rows.length > 0;
}

/** Records the steps so far of a running job (the progress screen polls them). */
export async function saveJobSteps(db: Db, jobId: string, steps: readonly JobStep[]): Promise<void> {
  await db
    .update(jobs)
    .set({ steps: [...steps] })
    .where(and(eq(jobs.id, jobId), eq(jobs.status, 'running')));
}

/**
 * Marks a running job done: published (`releaseId`), or held for an admin's review (no release live, `error`
 * `held-for-review`). False when it is no longer running (failed as stuck meanwhile).
 */
export async function markJobDone(db: Db, jobId: string, releaseId: string | null, now: Date): Promise<boolean> {
  const rows = await db
    .update(jobs)
    .set({ status: 'done', releaseId, error: releaseId === null ? 'held-for-review' : null, finishedAt: now })
    .where(and(eq(jobs.id, jobId), eq(jobs.status, 'running')))
    .returning({ id: jobs.id });
  return rows.length > 0;
}

/** Fails a running job with a stable error code (never a stack trace or user data). */
export async function markJobFailed(db: Db, jobId: string, error: string, now: Date): Promise<void> {
  await db
    .update(jobs)
    .set({ status: 'failed', error, finishedAt: now })
    .where(and(eq(jobs.id, jobId), eq(jobs.status, 'running')));
}

/** Puts a running job back in the queue (its process is stopping); it runs again from the start. */
export async function requeueJob(db: Db, jobId: string): Promise<void> {
  await db
    .update(jobs)
    .set({ status: 'queued', startedAt: null, claimedAt: null, steps: [], progress: null, readyAt: null })
    .where(and(eq(jobs.id, jobId), eq(jobs.status, 'running')));
}

/** Running jobs of a lane: one process per lane, so at its start these were cut off by its last stop. */
export async function runningJobsOf(db: Db, lane: JobLane): Promise<Job[]> {
  return db
    .select()
    .from(jobs)
    .where(and(eq(jobs.status, 'running'), laneFilter(lane)));
}

/**
 * Fails the lane's jobs running longer than they ever should (JOB_STUCK_AFTER_MS for a publish, BUILD_STUCK_AFTER_MS
 * for a build); returns their ids. Each process only judges its own lane: a build is never failed by the worker.
 */
export async function failStuckJobs(db: Db, now: Date, lane: JobLane = 'publish'): Promise<string[]> {
  const limit = lane === 'build' ? BUILD_STUCK_AFTER_MS : JOB_STUCK_AFTER_MS;
  const rows = await db
    .update(jobs)
    .set({ status: 'failed', error: 'stuck', finishedAt: now, progress: null })
    .where(
      and(
        eq(jobs.status, 'running'),
        laneFilter(lane),
        lt(sql`coalesce(${jobs.claimedAt}, ${jobs.startedAt})`, new Date(now.getTime() - limit)),
      ),
    )
    .returning({ id: jobs.id });
  return rows.map((row) => row.id);
}
