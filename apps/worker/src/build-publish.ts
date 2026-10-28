/**
 * The last step of a developer build, run by webnhanh-worker: webnhanh-builder left the checked output in
 * BUILD_OUTPUT_DIR/<job id>/ and gave the job back to the queue (`ready_at`); here it is made live through
 * @webnhanh/publish, like a template page, and the job ends (with its notices when the owner asked for them). The
 * staged copy is the builder's to delete.
 */
import { randomUUID } from 'node:crypto';
import path from 'node:path';
import { developerSites, isUuid, jobs, queueJobNotices, releases, siteNameHolds, sites, type Db, type Job, type JobStep } from '@webnhanh/db';
import { publishRelease, PublishError, removeSite } from '@webnhanh/publish';
import { and, eq, ne } from 'drizzle-orm';
import { JobError, type Logger } from './publish-job';
import { OUTPUT_MAX_FILES } from './build/collect-output';

export interface BuildPublishDeps {
  readonly db: Db;
  readonly log: Logger;
  readonly sitesDir: string;
  /** Where the builder stages outputs; unset: build jobs cannot be published here. */
  readonly buildOutputDir?: string;
  readonly siteMaxBytes: number;
  readonly now: () => Date;
}

function endSteps(steps: readonly JobStep[], at: string): JobStep[] {
  return steps.map((step) => (step.finishedAt ? step : { ...step, finishedAt: at }));
}

/** Publishes the staged output of a built job and ends the job; returns the release id. */
export async function runBuildPublish(deps: BuildPublishDeps, job: Job): Promise<string> {
  const { db } = deps;
  if (!deps.buildOutputDir) throw new JobError('publish-failed', 'no BUILD_OUTPUT_DIR');
  if (!isUuid(job.id) || job.readyAt === null) throw new JobError('publish-failed', 'not a built job');
  const [site] = await db.select().from(sites).where(and(eq(sites.id, job.siteId), eq(sites.accountId, job.accountId)));
  if (!site || site.kind !== 'developer') throw new JobError('site-missing', `site ${job.siteId}`);
  const [dev] = await db.select({ source: developerSites.source }).from(developerSites).where(eq(developerSites.siteId, site.id));
  if (!dev) throw new JobError('site-missing', `no source for ${site.id}`);

  const releaseId = randomUUID();
  const result = await publishRelease({
    sitesDir: deps.sitesDir,
    site: site.name,
    sourceDir: path.join(deps.buildOutputDir, job.id),
    releaseId,
    limits: { maxBytes: deps.siteMaxBytes, maxFiles: OUTPUT_MAX_FILES },
  }).catch((error: unknown) => {
    if (error instanceof PublishError && (error.code === 'too-large' || error.code === 'too-many-files')) throw new JobError('too-large', error.message);
    throw new JobError('publish-failed', error instanceof Error ? error.message : String(error));
  });

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
    await tx.update(sites).set({ currentReleaseId: releaseId, status: 'published', updatedAt: now }).where(eq(sites.id, site.id));
    if (job.report) await tx.update(developerSites).set({ lastBuildKey: job.report.buildKey, updatedAt: now }).where(eq(developerSites.siteId, site.id));
    const [row] = await tx
      .update(jobs)
      .set({ status: 'done', releaseId, finishedAt: now, steps: endSteps(job.steps, now.toISOString()), progress: null })
      .where(and(eq(jobs.id, job.id), eq(jobs.status, 'running')))
      .returning();
    if (row) await queueJobNotices(tx, row, now);
    return row !== undefined;
  });
  if (!finished) deps.log.warn(`build ${job.id} published after it was failed`);
  // Old names of a renamed site answer 404 from now on (their hold keeps anyone else from taking them).
  const held = await db
    .select({ name: siteNameHolds.name })
    .from(siteNameHolds)
    .where(and(eq(siteNameHolds.siteId, site.id), ne(siteNameHolds.name, site.name)));
  for (const { name } of held) await removeSite(deps.sitesDir, name);
  return releaseId;
}
