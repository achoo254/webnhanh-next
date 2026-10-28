/**
 * Developer builds, shared by the server (manual builds, webhooks, history), webnhanh-builder (pushes waiting out
 * their 30 seconds, logs) and webnhanh-worker (the notice at the end):
 *
 * - limits: DEVELOPER_SITES_PER_ACCOUNT, BUILDS_PER_DAY per account (failed builds count, skipped ones do not),
 *   BUILD_QUEUE_MAX builds waiting on the whole server, one job per account (the jobs index);
 * - the log of each build, line by line;
 * - "Báo tôi khi xong": notification_deliveries rows written with the end of the job.
 */
import { and, asc, count, desc, eq, gt, gte, inArray, isNotNull, isNull, lte, ne, notInArray, or, sql } from 'drizzle-orm';
import { randomUUID } from 'node:crypto';
import type { Db } from './client';
import { enqueueJob, publishBlock, type Job, type PublishBlock } from './jobs';
import { chatLinks, developerSites, JOB_LOG_MAX_LINES, jobLogs, jobs, notificationDeliveries, pushSubscriptions, sites, type BuildTrigger } from './schema';

import { BUILD_QUEUE_MAX, BUILDS_PER_DAY } from './build-limits';

export { BUILD_QUEUE_MAX, BUILDS_PER_DAY, DEVELOPER_SITES_PER_ACCOUNT } from './build-limits';
/** Pushes this close together become one build. */
export const PUSH_DEBOUNCE_MS = 30_000;
/** The day of the daily build limit is Vietnam's (UTC+7, no daylight saving). */
const DAY_OFFSET_MS = 7 * 60 * 60 * 1000;

export type DeveloperSiteRow = typeof developerSites.$inferSelect;

/** Midnight of `now`'s day in Vietnam, as an instant. */
export function startOfBuildDay(now: Date): Date {
  const local = now.getTime() + DAY_OFFSET_MS;
  return new Date(local - (local % (24 * 60 * 60 * 1000)) - DAY_OFFSET_MS);
}

/** Builds of an account that count today: everything but skipped ones and rebuilds for a rename. */
export async function buildsToday(db: Db, accountId: string, now: Date): Promise<number> {
  const [row] = await db
    .select({ n: count() })
    .from(jobs)
    .where(
      and(
        eq(jobs.accountId, accountId),
        eq(jobs.type, 'build'),
        ne(jobs.status, 'skipped'),
        or(isNull(jobs.trigger), ne(jobs.trigger, 'rename')),
        gte(jobs.createdAt, startOfBuildDay(now)),
      ),
    );
  return row?.n ?? 0;
}

/** Builds waiting to be built on the whole server (not those built and waiting to be published). */
export async function queuedBuildCount(db: Db): Promise<number> {
  const [row] = await db
    .select({ n: count() })
    .from(jobs)
    .where(and(eq(jobs.type, 'build'), eq(jobs.status, 'queued'), isNull(jobs.readyAt)));
  return row?.n ?? 0;
}

export type BuildEnqueueResult = { ok: true; job: Job } | { ok: false; reason: 'job-active' | 'daily-limit' | 'queue-full' | PublishBlock };

/** Queues a build within the limits. A rename's rebuild is not counted against the day. */
export async function enqueueBuild(
  db: Db,
  input: { siteId: string; accountId: string; trigger: BuildTrigger; commitSha?: string | null; id?: string },
  now: Date,
): Promise<BuildEnqueueResult> {
  const block = await publishBlock(db, input.siteId);
  if (block) return { ok: false, reason: block };
  if (input.trigger !== 'rename' && (await buildsToday(db, input.accountId, now)) >= BUILDS_PER_DAY) return { ok: false, reason: 'daily-limit' };
  if ((await queuedBuildCount(db)) >= BUILD_QUEUE_MAX) return { ok: false, reason: 'queue-full' };
  return enqueueJob(db, { ...input, type: 'build' }, now);
}

/**
 * Records a build that did not run (nothing changed, or the day's builds were used up) so the history shows it.
 * Skipped jobs never count against the limit.
 */
export async function recordSkippedBuild(
  db: Db,
  input: { siteId: string; accountId: string; trigger: BuildTrigger; commitSha?: string | null; reason: 'no-change' | 'daily-limit' },
  now: Date,
): Promise<Job> {
  const [job] = await db
    .insert(jobs)
    .values({
      id: randomUUID(),
      siteId: input.siteId,
      accountId: input.accountId,
      type: 'build',
      status: 'skipped',
      error: input.reason,
      trigger: input.trigger,
      commitSha: input.commitSha ?? null,
      createdAt: now,
      finishedAt: now,
    })
    .returning();
  if (!job) throw new Error('job insert returned no row');
  return job;
}

/**
 * A push to the chosen branch: waits PUSH_DEBOUNCE_MS (a newer push restarts the wait and replaces the commit). A
 * build of the site already waiting in the queue simply builds the newest commit when it starts (it clones the
 * branch then), so it only learns the commit.
 */
export async function notePush(db: Db, siteId: string, commit: string, now: Date): Promise<'queued-build' | 'waiting'> {
  return db.transaction(async (tx) => {
    const [waiting] = await tx
      .update(jobs)
      .set({ commitSha: commit })
      .where(and(eq(jobs.siteId, siteId), eq(jobs.type, 'build'), eq(jobs.status, 'queued'), isNull(jobs.readyAt)))
      .returning({ id: jobs.id });
    if (waiting) {
      await tx.update(developerSites).set({ pendingPushAt: null, pendingCommit: null }).where(eq(developerSites.siteId, siteId));
      return 'queued-build';
    }
    await tx
      .update(developerSites)
      .set({ pendingPushAt: new Date(now.getTime() + PUSH_DEBOUNCE_MS), pendingCommit: commit })
      .where(eq(developerSites.siteId, siteId));
    return 'waiting';
  });
}

export interface DuePushOutcome {
  readonly queued: number;
  readonly skipped: number;
}

/**
 * Turns pushes whose wait is over into builds. One whose account has a job running stays until it ends; one that
 * finds the queue full stays until there is room; one past the day's limit is recorded as skipped and dropped; one of
 * a locked account or a taken-down site is dropped.
 */
export async function queueDuePushes(db: Db, now: Date): Promise<DuePushOutcome> {
  const due = await db
    .select({ siteId: developerSites.siteId, commit: developerSites.pendingCommit, accountId: sites.accountId })
    .from(developerSites)
    .innerJoin(sites, eq(sites.id, developerSites.siteId))
    .where(and(isNotNull(developerSites.pendingPushAt), lte(developerSites.pendingPushAt, now)))
    .orderBy(asc(developerSites.pendingPushAt))
    .limit(50);
  const outcome = { queued: 0, skipped: 0 };
  for (const push of due) {
    const queued = await enqueueBuild(db, { siteId: push.siteId, accountId: push.accountId, trigger: 'push', commitSha: push.commit }, now);
    if (!queued.ok && (queued.reason === 'job-active' || queued.reason === 'queue-full')) continue;
    if (queued.ok) {
      outcome.queued += 1;
    } else if (queued.reason === 'daily-limit') {
      await recordSkippedBuild(db, { siteId: push.siteId, accountId: push.accountId, trigger: 'push', commitSha: push.commit, reason: 'daily-limit' }, now);
      outcome.skipped += 1;
    }
    // Only the push that was due is cleared: one that arrived meanwhile keeps waiting.
    await db
      .update(developerSites)
      .set({ pendingPushAt: null, pendingCommit: null })
      .where(and(eq(developerSites.siteId, push.siteId), lte(developerSites.pendingPushAt, now)));
  }
  return outcome;
}

/** A line as stored: no ANSI colours or other control characters, at most 1000 characters. */
export function cleanLogLine(line: string): string {
  // eslint-disable-next-line no-control-regex
  const plain = line.replace(/\u001b\[[0-9;?]*[ -/]*[@-~]/g, '').replace(/\u001b\][^\u0007]*(\u0007|\u001b\\)/g, '').replace(/[\u0000-\u0008\u000b-\u001f\u007f]/g, '');
  return plain.length > 1000 ? `${plain.slice(0, 999)}…` : plain;
}

/**
 * Appends lines to a job's log after `fromSeq` (the caller's count so far); returns the new count. Past
 * JOB_LOG_MAX_LINES only one last line says the rest was cut.
 */
export async function appendJobLog(db: Db, jobId: string, fromSeq: number, lines: readonly string[], now: Date): Promise<number> {
  if (lines.length === 0 || fromSeq > JOB_LOG_MAX_LINES) return fromSeq;
  const room = JOB_LOG_MAX_LINES - fromSeq;
  const kept = lines.slice(0, Math.max(room, 0)).map(cleanLogLine);
  if (lines.length > room) kept.push(`… log cut after ${JOB_LOG_MAX_LINES} lines`);
  if (kept.length === 0) return fromSeq;
  await db.insert(jobLogs).values(kept.map((line, i) => ({ jobId, seq: fromSeq + i + 1, line, createdAt: now })));
  return fromSeq + kept.length;
}

/** Log lines of a job after `afterSeq`, in order (at most `limit`). */
export async function jobLogSince(db: Db, jobId: string, afterSeq: number, limit = 500): Promise<{ seq: number; line: string }[]> {
  return db
    .select({ seq: jobLogs.seq, line: jobLogs.line })
    .from(jobLogs)
    .where(and(eq(jobLogs.jobId, jobId), gt(jobLogs.seq, afterSeq)))
    .orderBy(asc(jobLogs.seq))
    .limit(limit);
}

/** Build logs are kept this long after their job ended; the job row itself stays in the history. */
export const BUILD_LOG_KEEP_MS = 30 * 24 * 60 * 60 * 1000;

export async function pruneBuildLogs(db: Db, now: Date): Promise<number> {
  const old = db
    .select({ id: jobs.id })
    .from(jobs)
    .where(and(eq(jobs.type, 'build'), inArray(jobs.status, ['done', 'failed', 'skipped']), lte(jobs.finishedAt, new Date(now.getTime() - BUILD_LOG_KEEP_MS))));
  const rows = await db.delete(jobLogs).where(inArray(jobLogs.jobId, old)).returning({ seq: jobLogs.seq });
  return rows.length;
}

/**
 * When a job the owner asked to hear about ends: one delivery per push subscription of the account and one for its
 * linked chat, in the caller's transaction (with the end of the job). The server sends them (it alone may call out);
 * a channel it has no keys for drops its rows.
 */
export async function queueJobNotices(db: Db, job: Pick<Job, 'id' | 'accountId' | 'notify'>, now: Date): Promise<number> {
  if (!job.notify) return 0;
  const devices = await db.select({ id: pushSubscriptions.id }).from(pushSubscriptions).where(eq(pushSubscriptions.accountId, job.accountId));
  const [chat] = await db.select({ chatId: chatLinks.chatId }).from(chatLinks).where(eq(chatLinks.accountId, job.accountId));
  const targets = [
    ...devices.map((device) => ({ channel: 'push' as const, target: device.id })),
    ...(chat ? [{ channel: 'chat' as const, target: String(chat.chatId) }] : []),
  ];
  if (targets.length === 0) return 0;
  await db
    .insert(notificationDeliveries)
    .values(targets.map((t) => ({ id: randomUUID(), jobId: job.id, accountId: job.accountId, ...t, status: 'pending' as const, nextAttemptAt: now, createdAt: now })));
  return targets.length;
}

/** Ends a running job as failed with its reason and the log lines that show it, and queues its notices. */
export async function failJob(db: Db, jobId: string, error: string, errorLines: readonly string[], now: Date): Promise<boolean> {
  return db.transaction(async (tx) => {
    const [row] = await tx
      .update(jobs)
      .set({ status: 'failed', error, errorLines: errorLines.length > 0 ? [...errorLines] : null, finishedAt: now, progress: null })
      .where(and(eq(jobs.id, jobId), eq(jobs.status, 'running')))
      .returning();
    if (!row) return false;
    await queueJobNotices(tx, row, now);
    return true;
  });
}

/** Ends a running build as skipped (nothing changed since the live build): it is not counted against the day. */
export async function skipRunningBuild(db: Db, jobId: string, now: Date): Promise<boolean> {
  return db.transaction(async (tx) => {
    const [row] = await tx
      .update(jobs)
      .set({ status: 'skipped', error: 'no-change', finishedAt: now, progress: null })
      .where(and(eq(jobs.id, jobId), eq(jobs.status, 'running')))
      .returning();
    if (!row) return false;
    await queueJobNotices(tx, row, now);
    return true;
  });
}

/** The newest build jobs of a site, newest first. */
export async function buildHistory(db: Db, siteId: string, limit = 20): Promise<Job[]> {
  return db
    .select()
    .from(jobs)
    .where(and(eq(jobs.siteId, siteId), eq(jobs.type, 'build')))
    .orderBy(desc(jobs.createdAt), desc(jobs.id))
    .limit(limit);
}

/** How long finished builds took (claim to finish, the wait in the queue left out), newest first. */
async function buildDurations(db: Db, where: ReturnType<typeof and>, limit: number): Promise<number[]> {
  const rows = await db
    .select({ startedAt: jobs.startedAt, finishedAt: jobs.finishedAt })
    .from(jobs)
    .where(and(eq(jobs.type, 'build'), eq(jobs.status, 'done'), isNotNull(jobs.startedAt), isNotNull(jobs.finishedAt), where))
    .orderBy(desc(jobs.finishedAt))
    .limit(limit);
  return rows.flatMap((row) => (row.startedAt && row.finishedAt ? [row.finishedAt.getTime() - row.startedAt.getTime()] : []));
}

export function median(values: readonly number[]): number | null {
  if (values.length === 0) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 1 ? (sorted[mid] ?? null) : Math.round(((sorted[mid - 1] ?? 0) + (sorted[mid] ?? 0)) / 2);
}

/**
 * Starting points before a framework has any build on this server, in ms. Replaced by the server's own median as soon
 * as one build of that framework finished (see `buildEstimate`).
 */
export const DEFAULT_BUILD_MS: Readonly<Record<string, number>> = {
  static: 10_000,
  vite: 75_000,
  astro: 90_000,
  next: 180_000,
  cra: 150_000,
  sveltekit: 100_000,
  nuxt: 150_000,
  docusaurus: 180_000,
  vitepress: 80_000,
  other: 120_000,
};

export interface BuildEstimate {
  readonly ms: number;
  /** `site`: median of this site's last builds; `framework`: of the server's builds of that framework; `default`. */
  readonly basis: 'site' | 'framework' | 'default';
}

/** What to expect for the next build of a site: honest, from real builds whenever there are any. */
export async function buildEstimate(db: Db, siteId: string, framework: string | null): Promise<BuildEstimate> {
  const own = median(await buildDurations(db, eq(jobs.siteId, siteId), 10));
  if (own !== null) return { ms: own, basis: 'site' };
  const fw = framework ?? 'other';
  const theirs = median(await buildDurations(db, eq(jobs.framework, fw), 50));
  if (theirs !== null) return { ms: theirs, basis: 'framework' };
  return { ms: DEFAULT_BUILD_MS[fw] ?? DEFAULT_BUILD_MS.other ?? 120_000, basis: 'default' };
}

/** Builds waiting to be built ahead of `job` (0 when it is next or already running). */
export async function queuePosition(db: Db, job: Pick<Job, 'id' | 'createdAt'>): Promise<number> {
  const [row] = await db
    .select({ n: count() })
    .from(jobs)
    .where(
      and(
        eq(jobs.type, 'build'),
        eq(jobs.status, 'queued'),
        isNull(jobs.readyAt),
        notInArray(jobs.id, [job.id]),
        sql`(${jobs.createdAt}, ${jobs.id}) < (${job.createdAt.toISOString()}::timestamptz, ${job.id}::uuid)`,
      ),
    );
  return row?.n ?? 0;
}

/** The build running right now on the server (one at a time), if any. */
export async function runningBuild(db: Db): Promise<Job | null> {
  const [row] = await db
    .select()
    .from(jobs)
    .where(and(eq(jobs.type, 'build'), eq(jobs.status, 'running'), isNull(jobs.readyAt)))
    .limit(1);
  return row ?? null;
}

/** Developer sites of an account. */
export async function developerSiteCount(db: Db, accountId: string): Promise<number> {
  const [row] = await db
    .select({ n: count() })
    .from(sites)
    .where(and(eq(sites.accountId, accountId), eq(sites.kind, 'developer')));
  return row?.n ?? 0;
}

