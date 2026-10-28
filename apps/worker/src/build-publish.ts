/**
 * The last step of a developer build, run by webnhanh-worker: webnhanh-builder left the checked output in
 * BUILD_OUTPUT_DIR/<job id>/ and gave the job back to the queue (`ready_at`); here it is made live through
 * @webnhanh/publish, like a template page, and the job ends (with its notices when the owner asked for them). The
 * staged copy is the builder's to delete.
 */
import { randomUUID } from 'node:crypto';
import path from 'node:path';
import { developerSites, isUuid, jobs, queueJobNotices, releases, sites, type Db, type Job, type JobStep } from '@webnhanh/db';
import { deleteRelease, publishRelease, PublishError } from '@webnhanh/publish';
import { and, eq, ne } from 'drizzle-orm';
import { assertPublishable, JobError, removeOldNames, type Logger, type PublishOutcome } from './publish-job';
import { OUTPUT_MAX_FILES } from './build/collect-output';
import { reviewOutput } from './review';
import { holdRelease, SiteRemovedError } from './review-hold';

export interface BuildPublishDeps {
  readonly db: Db;
  readonly log: Logger;
  readonly sitesDir: string;
  /** Where the builder stages outputs; unset: build jobs cannot be published here. */
  readonly buildOutputDir?: string;
  readonly siteMaxBytes: number;
  readonly now: () => Date;
  /** IdP subjects of the admins, told when a release is held for review. */
  readonly adminSubs?: readonly string[];
}

function endSteps(steps: readonly JobStep[], at: string): JobStep[] {
  return steps.map((step) => (step.finishedAt ? step : { ...step, finishedAt: at }));
}

/** Ends a built job as done: published, or held for review (`held-for-review`, the site unchanged on the web). */
async function finishBuild(db: Db, job: Job, releaseId: string | null, now: Date): Promise<boolean> {
  const [row] = await db
    .update(jobs)
    .set({ status: 'done', releaseId, error: releaseId === null ? 'held-for-review' : null, finishedAt: now, steps: endSteps(job.steps, now.toISOString()), progress: null })
    .where(and(eq(jobs.id, job.id), eq(jobs.status, 'running')))
    .returning();
  if (row) await queueJobNotices(db, row, now);
  return row !== undefined;
}

/**
 * Publishes the staged output of a built job and ends the job, or holds the release for review when a page asks for
 * a password or poses as a bank, a wallet or the state (`review.ts`).
 */
export async function runBuildPublish(deps: BuildPublishDeps, job: Job): Promise<PublishOutcome> {
  const { db } = deps;
  if (!deps.buildOutputDir) throw new JobError('publish-failed', 'no BUILD_OUTPUT_DIR');
  if (!isUuid(job.id) || job.readyAt === null) throw new JobError('publish-failed', 'not a built job');
  const [site] = await db.select().from(sites).where(and(eq(sites.id, job.siteId), eq(sites.accountId, job.accountId)));
  if (!site || site.kind !== 'developer') throw new JobError('site-missing', `site ${job.siteId}`);
  const [dev] = await db.select({ source: developerSites.source }).from(developerSites).where(eq(developerSites.siteId, site.id));
  if (!dev) throw new JobError('site-missing', `no source for ${site.id}`);
  await assertPublishable(db, site.id);

  const releaseId = randomUUID();
  const sourceDir = path.join(deps.buildOutputDir, job.id);
  const limits = { maxBytes: deps.siteMaxBytes, maxFiles: OUTPUT_MAX_FILES };
  const failed = (error: unknown): never => {
    if (error instanceof SiteRemovedError) throw new JobError('site-removed', error.message);
    if (error instanceof PublishError && (error.code === 'too-large' || error.code === 'too-many-files')) throw new JobError('too-large', error.message);
    throw new JobError('publish-failed', error instanceof Error ? error.message : String(error));
  };
  const findings = await reviewOutput(sourceDir).catch(failed);
  if (findings.reasons.length > 0) {
    await holdRelease(deps, {
      site,
      sourceDir,
      releaseId,
      limits,
      findings,
      jobId: job.id,
      source: dev.source,
      commitSha: dev.source === 'git' ? job.commitSha : null,
      livePage: null,
      orderForm: null,
      buildKey: job.report?.buildKey ?? null,
    }).catch(failed);
    if (!(await deps.db.transaction((tx) => finishBuild(tx, job, null, deps.now())))) deps.log.warn(`build ${job.id} held after it was failed`);
    deps.log.info(`site ${site.name}: held for review (${findings.reasons.join(', ')})`);
    return { releaseId, held: true };
  }
  const result = await publishRelease({ sitesDir: deps.sitesDir, site: site.name, sourceDir, releaseId, limits }).catch(failed);

  const now = deps.now();
  const finished = await db.transaction(async (tx) => {
    await tx.insert(releases).values({
      id: releaseId,
      siteId: site.id,
      source: dev.source,
      commitSha: dev.source === 'git' ? job.commitSha : null,
      bytes: result.bytes,
      fileCount: result.fileCount,
      createdAt: now,
    });
    // A release that was waiting for review is replaced by this one.
    await tx
      .update(sites)
      .set({ currentReleaseId: releaseId, status: 'published', pendingReleaseId: null, pendingReview: null, updatedAt: now })
      .where(and(eq(sites.id, site.id), ne(sites.status, 'removed')));
    if (job.report) await tx.update(developerSites).set({ lastBuildKey: job.report.buildKey, updatedAt: now }).where(eq(developerSites.siteId, site.id));
    return finishBuild(tx, job, releaseId, now);
  });
  if (!finished) deps.log.warn(`build ${job.id} published after it was failed`);
  if (site.pendingReleaseId) await deleteRelease(deps.sitesDir, site.name, site.pendingReleaseId).catch(() => undefined);
  await removeOldNames(deps, site);
  return { releaseId, held: false };
}
