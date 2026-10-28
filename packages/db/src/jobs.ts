/**
 * The job queue shared by the server (enqueue, read) and the worker (claim, steps, finish). One job waiting or
 * running per account is enforced by the `jobs_one_active_per_account` index; the worker claims with
 * FOR UPDATE SKIP LOCKED, so a second worker would never take the same job.
 */
import { randomUUID } from 'node:crypto';
import { and, asc, desc, eq, inArray, lt } from 'drizzle-orm';
import type { Db } from './client';
import { jobs, type JobStep, type JobType } from './schema';

export type Job = typeof jobs.$inferSelect;

/** A publish takes seconds; one still running after this was cut off (a crash, a kill) and is failed. */
export const JOB_STUCK_AFTER_MS = 5 * 60 * 1000;

/** True for a unique-index violation (Postgres 23505), also when drizzle wrapped the driver's error. */
export function isUniqueViolation(error: unknown): boolean {
  for (let e: unknown = error; typeof e === 'object' && e !== null; e = (e as { cause?: unknown }).cause) {
    if ((e as { code?: unknown }).code === '23505') return true;
  }
  return false;
}

export type EnqueueResult = { ok: true; job: Job } | { ok: false; reason: 'job-active' };

/** Queues a job, or refuses when the account already has one waiting or running. */
export async function enqueueJob(
  db: Db,
  input: { siteId: string; accountId: string; type: JobType },
  now: Date,
): Promise<EnqueueResult> {
  try {
    const [job] = await db
      .insert(jobs)
      .values({ id: randomUUID(), ...input, status: 'queued', createdAt: now })
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

/** Takes the oldest queued job and marks it running, or null when the queue is empty. */
export async function claimNextJob(db: Db, now: Date): Promise<Job | null> {
  return db.transaction(async (tx) => {
    const [next] = await tx
      .select({ id: jobs.id })
      .from(jobs)
      .where(eq(jobs.status, 'queued'))
      .orderBy(asc(jobs.createdAt), asc(jobs.id))
      .limit(1)
      .for('update', { skipLocked: true });
    if (!next) return null;
    const [row] = await tx.update(jobs).set({ status: 'running', startedAt: now, steps: [] }).where(eq(jobs.id, next.id)).returning();
    return row ?? null;
  });
}

/** Records the steps so far of a running job (the progress screen polls them). */
export async function saveJobSteps(db: Db, jobId: string, steps: readonly JobStep[]): Promise<void> {
  await db
    .update(jobs)
    .set({ steps: [...steps] })
    .where(and(eq(jobs.id, jobId), eq(jobs.status, 'running')));
}

/** Marks a running job done. False when it is no longer running (failed as stuck meanwhile). */
export async function markJobDone(db: Db, jobId: string, releaseId: string | null, now: Date): Promise<boolean> {
  const rows = await db
    .update(jobs)
    .set({ status: 'done', releaseId, finishedAt: now })
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

/** Puts a running job back in the queue (its worker is stopping); it runs again from the start. */
export async function requeueJob(db: Db, jobId: string): Promise<void> {
  await db
    .update(jobs)
    .set({ status: 'queued', startedAt: null, steps: [] })
    .where(and(eq(jobs.id, jobId), eq(jobs.status, 'running')));
}

/** Fails jobs running longer than JOB_STUCK_AFTER_MS; returns their ids. */
export async function failStuckJobs(db: Db, now: Date): Promise<string[]> {
  const rows = await db
    .update(jobs)
    .set({ status: 'failed', error: 'stuck', finishedAt: now })
    .where(and(eq(jobs.status, 'running'), lt(jobs.startedAt, new Date(now.getTime() - JOB_STUCK_AFTER_MS))))
    .returning({ id: jobs.id });
  return rows.map((row) => row.id);
}
