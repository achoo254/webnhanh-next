/**
 * The `publish` job: the site's current draft, rendered with its template, its photos copied beside it, made live
 * through @trang/publish. Each named step is timed in `jobs.steps` for the progress screen.
 */
import { randomUUID } from 'node:crypto';
import { copyFile, mkdir, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { imageFileName, releases, saveJobSteps, siteImageFile, siteImages, siteNameHolds, sites, jobs, type Db, type Job, type JobStep } from '@trang/db';
import { publishRelease, PublishError, removeSite } from '@trang/publish';
import { imageAsset, renderShop, SHOP_TEMPLATE, shopDraftSchema, shopImageIds, shopPublishIssues, type ImageAsset } from '@trang/templates';
import { and, eq, inArray, ne } from 'drizzle-orm';

/** The named steps of a publish, in order. The web app shows each under its own label. */
export const PUBLISH_STEPS = ['prepare', 'render', 'images', 'publish', 'finish'] as const;
export type PublishStep = (typeof PUBLISH_STEPS)[number];

/** A failure the person can be told about: a stable code, and detail for the log only. */
export class JobError extends Error {
  constructor(
    readonly code: 'site-missing' | 'draft-invalid' | 'image-missing' | 'too-large' | 'publish-failed',
    readonly detail: string,
  ) {
    super(`${code}: ${detail}`);
    this.name = 'JobError';
  }
}

export interface PublishDeps {
  readonly db: Db;
  readonly sitesDir: string;
  readonly uploadsDir: string;
  readonly siteMaxBytes: number;
  /** "Made with" link at the foot of the page. */
  readonly madeWith: { readonly name: string; readonly url: string };
  readonly now: () => Date;
  /** Where the release is put together before it is published (default: the system temp dir). */
  readonly workDir?: string;
}

/** Times the steps of one job and saves them after each change. */
class StepClock {
  private readonly steps: JobStep[] = [];

  constructor(
    private readonly db: Db,
    private readonly jobId: string,
    private readonly now: () => Date,
  ) {}

  async begin(name: PublishStep): Promise<void> {
    const at = this.now().toISOString();
    const last = this.steps[this.steps.length - 1];
    if (last && !last.finishedAt) last.finishedAt = at;
    this.steps.push({ name, startedAt: at });
    await saveJobSteps(this.db, this.jobId, this.steps);
  }

  async end(): Promise<void> {
    const last = this.steps[this.steps.length - 1];
    if (last && !last.finishedAt) last.finishedAt = this.now().toISOString();
    await saveJobSteps(this.db, this.jobId, this.steps);
  }
}

/** At most one file per width of each of 31 photos, plus the page. */
const MAX_FILES = 200;

/**
 * Publishes the job's site. Returns the new release id; the job itself is marked done or failed by the caller
 * (the worker loop), which also catches the JobError.
 */
export async function runPublish(deps: PublishDeps, job: Job): Promise<string> {
  const { db } = deps;
  const clock = new StepClock(db, job.id, deps.now);

  await clock.begin('prepare');
  const [site] = await db.select().from(sites).where(and(eq(sites.id, job.siteId), eq(sites.accountId, job.accountId)));
  if (!site || site.kind !== 'template' || site.template !== SHOP_TEMPLATE) throw new JobError('site-missing', `site ${job.siteId}`);
  const parsed = shopDraftSchema.safeParse(site.draft);
  if (!parsed.success) throw new JobError('draft-invalid', 'draft does not match the schema');
  const draft = parsed.data;
  const issues = shopPublishIssues(draft);
  if (issues.length > 0) throw new JobError('draft-invalid', issues.map((i) => `${i.field}:${i.code}`).join(','));
  const ids = shopImageIds(draft);
  const images = ids.length > 0 ? await db.select().from(siteImages).where(and(eq(siteImages.siteId, site.id), inArray(siteImages.id, ids))) : [];
  if (images.length !== ids.length) throw new JobError('image-missing', `${ids.length - images.length} photo(s) not stored`);

  const releaseId = randomUUID();
  const work = path.join(deps.workDir ?? os.tmpdir(), `trang-publish-${releaseId}`);
  try {
    await clock.begin('render');
    const assets = new Map<string, ImageAsset>(images.map((image) => [image.id, imageAsset(image, (width) => `img/${imageFileName(image.id, width)}`)]));
    const { html } = renderShop(draft, assets, { madeWith: deps.madeWith });
    await mkdir(path.join(work, 'img'), { recursive: true });
    await writeFile(path.join(work, 'index.html'), html);

    await clock.begin('images');
    for (const image of images) {
      for (const width of image.widths) {
        await copyFile(siteImageFile(deps.uploadsDir, site.id, image.id, width), path.join(work, 'img', imageFileName(image.id, width))).catch((error: unknown) => {
          throw new JobError('image-missing', error instanceof Error ? error.message : String(error));
        });
      }
    }

    await clock.begin('publish');
    const result = await publishRelease({
      sitesDir: deps.sitesDir,
      site: site.name,
      sourceDir: work,
      releaseId,
      limits: { maxBytes: deps.siteMaxBytes, maxFiles: MAX_FILES },
    }).catch((error: unknown) => {
      if (error instanceof PublishError && (error.code === 'too-large' || error.code === 'too-many-files')) throw new JobError('too-large', error.message);
      throw new JobError('publish-failed', error instanceof Error ? error.message : String(error));
    });

    await clock.begin('finish');
    const now = deps.now();
    await db.transaction(async (tx) => {
      await tx.insert(releases).values({ id: releaseId, siteId: site.id, source: 'template', bytes: result.bytes, fileCount: result.fileCount, createdAt: now });
      await tx.update(sites).set({ currentReleaseId: releaseId, status: 'published', updatedAt: now }).where(eq(sites.id, site.id));
      await tx.update(jobs).set({ releaseId }).where(eq(jobs.id, job.id));
    });
    // Old names of this site answer 404 from now on (their hold keeps anyone else from taking them).
    const held = await db
      .select({ name: siteNameHolds.name })
      .from(siteNameHolds)
      .where(and(eq(siteNameHolds.siteId, site.id), ne(siteNameHolds.name, site.name)));
    for (const { name } of held) await removeSite(deps.sitesDir, name);
    await clock.end();
    return releaseId;
  } finally {
    await rm(work, { recursive: true, force: true });
  }
}
