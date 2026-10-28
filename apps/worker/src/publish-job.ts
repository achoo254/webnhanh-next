/**
 * The `publish` job: the site's current draft, rendered with its template, its photos copied beside it, made live
 * through @webnhanh/publish. Each named step is timed in `jobs.steps` for the progress screen.
 */
import { randomUUID } from 'node:crypto';
import { copyFile, mkdir, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {
  imageFileName,
  jobs,
  releases,
  saveJobSteps,
  signFormToken,
  siteImageFile,
  siteImages,
  siteNameHolds,
  siteOrigin,
  sites,
  SITES_DOMAIN,
  type Db,
  type Job,
  type JobStep,
} from '@webnhanh/db';
import { publishRelease, PublishError, removeSite } from '@webnhanh/publish';
import {
  imageAsset,
  orderProducts,
  renderShareCard,
  renderShop,
  SHARE_CARD_SIZE,
  SHOP_TEMPLATE,
  shopDraftSchema,
  shopImageIds,
  shopPublishIssues,
  type ImageAsset,
  type ShareImage,
  type ShopDraft,
} from '@webnhanh/templates';
import { and, eq, inArray, ne } from 'drizzle-orm';
import { captureShareImage, cardFontUrl } from './share-image';

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

export interface Logger {
  info(message: string): void;
  warn(message: string): void;
}

export interface PublishDeps {
  readonly db: Db;
  readonly log: Logger;
  /** The app's address: order forms post to `<appUrl>/f/<site>`. */
  readonly appUrl: string;
  /** Signs the order form token of each page (the server checks it with the same secret). */
  readonly formSecret: string;
  /** Headless Chrome for the share picture; unset: pages are published without one. */
  readonly chromePath?: string;
  /** ffmpeg turns the share picture into a JPEG. */
  readonly ffmpegPath: string;
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
  const work = path.join(deps.workDir ?? os.tmpdir(), `webnhanh-publish-${releaseId}`);
  try {
    await clock.begin('render');
    const assets = new Map<string, ImageAsset>(images.map((image) => [image.id, imageAsset(image, (width) => `img/${imageFileName(image.id, width)}`)]));
    await mkdir(path.join(work, 'img'), { recursive: true });
    const pageUrl = `${siteOrigin(site.name)}/`;
    const shareImage = await shareImageOf(deps, { siteId: site.id, siteName: site.name, draft, images, assets, work, releaseId });
    const { html } = renderShop(draft, assets, {
      madeWith: deps.madeWith,
      orderForm: { action: `${deps.appUrl}/f/${site.name}`, token: signFormToken(deps.formSecret, site.id, deps.now()) },
      page: { url: pageUrl, image: shareImage ? { ...shareImage, url: `${pageUrl}${shareImage.file}` } : undefined },
    });
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
      await tx
        .update(sites)
        .set({ currentReleaseId: releaseId, status: 'published', orderForm: { products: orderProducts(draft).map(({ key, name }) => ({ key, name })) }, updatedAt: now })
        .where(eq(sites.id, site.id));
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

type ImageRow = typeof siteImages.$inferSelect;

/**
 * Photographs the share card into the release as `og-<release>.<ext>` (a new name per release, so Zalo and Facebook
 * fetch the new picture after a change). Null, logged, when there is no Chrome or it failed: the page goes out
 * without a share picture rather than not at all.
 */
async function shareImageOf(
  deps: PublishDeps,
  page: { siteId: string; siteName: string; draft: ShopDraft; images: readonly ImageRow[]; assets: ReadonlyMap<string, ImageAsset>; work: string; releaseId: string },
): Promise<(Omit<ShareImage, 'url'> & { file: string }) | null> {
  if (!deps.chromePath) {
    deps.log.info(`site ${page.siteName}: no CHROME_PATH, published without a share picture`);
    return null;
  }
  const cardDir = `${page.work}-card`;
  try {
    const cover = page.images.find((image) => image.id === page.draft.cover);
    const files = cover ? cover.widths.map((width) => ({ name: `img/${imageFileName(cover.id, width)}`, from: siteImageFile(deps.uploadsDir, page.siteId, cover.id, width) })) : [];
    const html = renderShareCard(page.draft, page.assets, { host: `${page.siteName}.${SITES_DOMAIN}`, fontUrl: cardFontUrl });
    const shot = await captureShareImage({ workDir: cardDir, html, files, chromePath: deps.chromePath, ffmpegPath: deps.ffmpegPath });
    const file = `og-${page.releaseId.slice(0, 8)}.jpg`;
    await copyFile(shot.file, path.join(page.work, file));
    return { file, type: shot.type, ...SHARE_CARD_SIZE };
  } catch (error) {
    deps.log.warn(`site ${page.siteName}: no share picture: ${error instanceof Error ? error.message : String(error)}`);
    return null;
  } finally {
    await rm(cardDir, { recursive: true, force: true });
  }
}
