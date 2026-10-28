/**
 * The `publish` job: the site's current draft, rendered with its template (any of `@webnhanh/templates`), its photos
 * and the look's fonts copied beside it, its share picture photographed, made live through @webnhanh/publish. Each
 * named step is timed in `jobs.steps` for the progress screen. What went live is kept in `sites.live_page`, so the page
 * can be rendered again later without the draft (`renderLivePage`, used by the wedding countdown refresh).
 */
import { randomUUID } from 'node:crypto';
import { copyFile, mkdir, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {
  imageFileName,
  jobs,
  publishBlock,
  reportUrl,
  type LivePage,
  type OrderFormSpec,
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
import { deleteRelease, publishRelease, PublishError, removeSite } from '@webnhanh/publish';
import {
  draftShareCard,
  imageAsset,
  orderProducts,
  parseDraft,
  publishIssues,
  renderCard,
  renderDraft,
  SHARE_CARD_SIZE,
  styleFontFiles,
  templateImageIds,
  type ImageAsset,
  type ShareImage,
  type TemplateDraft,
} from '@webnhanh/templates';
import { and, eq, inArray, ne } from 'drizzle-orm';
import { fontFilePath, pageFontUrl } from './font-files';
import { reviewPage } from './review';
import { holdRelease, SiteRemovedError } from './review-hold';
import { captureShareImage, cardFontUrl } from './share-image';

/** The named steps of a publish, in order. The web app shows each under its own label. */
export const PUBLISH_STEPS = ['prepare', 'render', 'images', 'publish', 'finish'] as const;
export type PublishStep = (typeof PUBLISH_STEPS)[number];

/** A failure the person can be told about: a stable code, and detail for the log only. */
export class JobError extends Error {
  constructor(
    readonly code: 'site-missing' | 'draft-invalid' | 'image-missing' | 'too-large' | 'publish-failed' | 'account-locked' | 'site-removed',
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
  /** IdP subjects of the admins, told when a release is held for review. */
  readonly adminSubs?: readonly string[];
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

/**
 * Three widths of each photo of the largest page (a café menu: a cover and 120 dishes), plus the page, its share
 * picture and its font files. The site's size limit still applies on top.
 */
const MAX_FILES = 400;

/** How a publish ended: live, or copied in and held for an admin's review (`held`, nothing changed on the web). */
export interface PublishOutcome {
  readonly releaseId: string;
  readonly held: boolean;
}

/** Throws when the account was locked or the site taken down since the job was queued. */
export async function assertPublishable(db: Db, siteId: string): Promise<void> {
  const block = await publishBlock(db, siteId);
  if (block) throw new JobError(block, `site ${siteId}`);
}

/** Old names of a renamed site answer 404 from a publish on (their hold keeps anyone else from taking them). */
export async function removeOldNames(deps: Pick<PublishDeps, 'db' | 'sitesDir'>, site: { readonly id: string; readonly name: string }): Promise<void> {
  const held = await deps.db
    .select({ name: siteNameHolds.name })
    .from(siteNameHolds)
    .where(and(eq(siteNameHolds.siteId, site.id), ne(siteNameHolds.name, site.name)));
  for (const { name } of held) await removeSite(deps.sitesDir, name);
}

/**
 * Publishes the job's site, or holds the release for review when the page asks for a password or poses as a bank, a
 * wallet or the state (`review.ts`). The job itself is marked done or failed by the caller (the worker loop), which
 * also catches the JobError.
 */
export async function runPublish(deps: PublishDeps, job: Job): Promise<PublishOutcome> {
  const { db } = deps;
  const clock = new StepClock(db, job.id, deps.now);

  await clock.begin('prepare');
  const [site] = await db.select().from(sites).where(and(eq(sites.id, job.siteId), eq(sites.accountId, job.accountId)));
  if (!site || site.kind !== 'template') throw new JobError('site-missing', `site ${job.siteId}`);
  await assertPublishable(db, site.id);
  const value = parseDraft(site.template, site.draft);
  if (!value) throw new JobError('draft-invalid', `draft does not match the schema of ${site.template ?? 'no template'}`);
  const issues = publishIssues(value);
  if (issues.length > 0) throw new JobError('draft-invalid', issues.map((i) => `${i.field}:${i.code}`).join(','));
  const ids = templateImageIds(value);
  const images = ids.length > 0 ? await db.select().from(siteImages).where(and(eq(siteImages.siteId, site.id), inArray(siteImages.id, ids))) : [];
  if (images.length !== ids.length) throw new JobError('image-missing', `${ids.length - images.length} photo(s) not stored`);

  const releaseId = randomUUID();
  const work = path.join(deps.workDir ?? os.tmpdir(), `webnhanh-publish-${releaseId}`);
  try {
    await clock.begin('render');
    const assets = new Map<string, ImageAsset>(images.map((image) => [image.id, imageAsset(image, (width) => `img/${imageFileName(image.id, width)}`)]));
    await mkdir(path.join(work, 'img'), { recursive: true });
    const shareImage = await shareImageOf(deps, { siteId: site.id, siteName: site.name, value, images, assets, work, releaseId });
    const html = renderLivePage(deps, site, value, assets, shareImage);
    await writeFile(path.join(work, 'index.html'), html);
    // The style's fonts ship inside the release, beside the page: the page asks no one else for them.
    await mkdir(path.join(work, 'fonts'));
    for (const font of styleFontFiles(value.draft.style)) await copyFile(fontFilePath(font), path.join(work, pageFontUrl(font.file)));

    await clock.begin('images');
    for (const image of images) {
      for (const width of image.widths) {
        await copyFile(siteImageFile(deps.uploadsDir, site.id, image.id, width), path.join(work, 'img', imageFileName(image.id, width))).catch((error: unknown) => {
          throw new JobError('image-missing', error instanceof Error ? error.message : String(error));
        });
      }
    }

    await clock.begin('publish');
    const limits = { maxBytes: deps.siteMaxBytes, maxFiles: MAX_FILES };
    const livePage: LivePage = {
      draft: value.draft,
      images: images.map((image) => ({ id: image.id, width: image.width, height: image.height, widths: image.widths })),
      shareImage,
    };
    const findings = reviewPage(html);
    if (findings.reasons.length > 0) {
      await holdRelease(deps, {
        site,
        sourceDir: work,
        releaseId,
        limits,
        findings,
        jobId: job.id,
        source: 'template',
        commitSha: null,
        livePage,
        orderForm: formSpecOf(value),
        buildKey: null,
      }).catch((error: unknown) => {
        if (error instanceof SiteRemovedError) throw new JobError('site-removed', error.message);
        if (error instanceof PublishError && (error.code === 'too-large' || error.code === 'too-many-files')) throw new JobError('too-large', error.message);
        throw error;
      });
      deps.log.info(`site ${site.name}: held for review (${findings.reasons.join(', ')})`);
      await clock.end();
      return { releaseId, held: true };
    }
    const result = await publishRelease({
      sitesDir: deps.sitesDir,
      site: site.name,
      sourceDir: work,
      releaseId,
      limits,
    }).catch((error: unknown) => {
      if (error instanceof PublishError && (error.code === 'too-large' || error.code === 'too-many-files')) throw new JobError('too-large', error.message);
      throw new JobError('publish-failed', error instanceof Error ? error.message : String(error));
    });

    await clock.begin('finish');
    const now = deps.now();
    await db.transaction(async (tx) => {
      await tx.insert(releases).values({ id: releaseId, siteId: site.id, source: 'template', bytes: result.bytes, fileCount: result.fileCount, createdAt: now });
      // A release that was waiting for review is replaced by this one.
      await tx
        .update(sites)
        .set({ currentReleaseId: releaseId, status: 'published', orderForm: formSpecOf(value), livePage, pendingReleaseId: null, pendingReview: null, updatedAt: now })
        .where(and(eq(sites.id, site.id), ne(sites.status, 'removed')));
      await tx.update(jobs).set({ releaseId }).where(eq(jobs.id, job.id));
    });
    if (site.pendingReleaseId) await deleteRelease(deps.sitesDir, site.name, site.pendingReleaseId).catch(() => undefined);
    await removeOldNames(deps, site);
    await clock.end();
    return { releaseId, held: false };
  } finally {
    await rm(work, { recursive: true, force: true });
  }
}

type ImageRow = typeof siteImages.$inferSelect;

/** The share picture of a live page: its file in the release and what `og:image` says of it. */
export type LiveShareImage = Omit<ShareImage, 'url'> & { file: string };

/** What the form of the live page takes (`sites.order_form`): a shop's products, a wedding's replies, or nothing. */
export function formSpecOf(value: TemplateDraft): OrderFormSpec | null {
  if (value.template === 'shop') return { products: orderProducts(value.draft).map(({ key, name }) => ({ key, name })) };
  if (value.template === 'wedding' && value.draft.rsvp) return { products: [], rsvp: true };
  return null;
}

/**
 * The page's HTML as it goes live: its form (orders of a shop, replies of a wedding) posting to the app with a token
 * signed now, its address and share picture, fonts beside it, and a wedding's countdown as of now.
 */
export function renderLivePage(
  deps: Pick<PublishDeps, 'appUrl' | 'formSecret' | 'madeWith' | 'now'>,
  site: { readonly id: string; readonly name: string },
  value: TemplateDraft,
  assets: ReadonlyMap<string, ImageAsset>,
  shareImage: LiveShareImage | null,
): string {
  const now = deps.now();
  const form = { action: `${deps.appUrl}/f/${site.name}`, token: signFormToken(deps.formSecret, site.id, now) };
  const pageUrl = `${siteOrigin(site.name)}/`;
  return renderDraft(value, assets, {
    madeWith: deps.madeWith,
    reportUrl: reportUrl(deps.appUrl, site.name),
    orderForm: value.template === 'shop' ? form : undefined,
    rsvpForm: value.template === 'wedding' ? form : undefined,
    now,
    page: { url: pageUrl, image: shareImage ? { ...shareImage, url: `${pageUrl}${shareImage.file}` } : undefined },
    fontUrl: pageFontUrl,
  }).html;
}

/**
 * Photographs the share card into the release as `og-<release>.<ext>` (a new name per release, so Zalo and Facebook
 * fetch the new picture after a change). Null, logged, when there is no Chrome or it failed: the page goes out
 * without a share picture rather than not at all.
 */
async function shareImageOf(
  deps: PublishDeps,
  page: { siteId: string; siteName: string; value: TemplateDraft; images: readonly ImageRow[]; assets: ReadonlyMap<string, ImageAsset>; work: string; releaseId: string },
): Promise<LiveShareImage | null> {
  if (!deps.chromePath) {
    deps.log.info(`site ${page.siteName}: no CHROME_PATH, published without a share picture`);
    return null;
  }
  const cardDir = `${page.work}-card`;
  try {
    const content = draftShareCard(page.value);
    const cover = page.images.find((image) => image.id === content.photo);
    const files = cover ? cover.widths.map((width) => ({ name: `img/${imageFileName(cover.id, width)}`, from: siteImageFile(deps.uploadsDir, page.siteId, cover.id, width) })) : [];
    const html = renderCard(content, page.assets, { host: `${page.siteName}.${SITES_DOMAIN}`, fontUrl: cardFontUrl });
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
