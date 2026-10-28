/**
 * Site rows and their rules: names (format, reserved, taken or held), the per-account limit, the template's sample
 * photos copied into a new site, and renaming with the old name held for NAME_HOLD_MS.
 */
import { randomBytes, randomUUID } from 'node:crypto';
import { copyFile, mkdir, rm, stat } from 'node:fs/promises';
import { createRequire } from 'node:module';
import path from 'node:path';
import {
  activeJobOf,
  checkSiteName,
  DEVELOPER_SITES_PER_ACCOUNT,
  developerSiteCount,
  developerSites,
  enqueueBuild,
  enqueueJob,
  isUniqueViolation,
  NAME_HOLD_MS,
  siteImageFile,
  siteImages,
  siteNameHolds,
  sites,
  siteUploadsDir,
  type BuildSettings,
  type Db,
  type DeveloperSource,
  type Job,
} from '@webnhanh/db';
import { isTemplateId, TEMPLATE_SAMPLES, templateDraft, type SamplePhoto, type TemplateId } from '@webnhanh/templates';
import { and, count, eq, gt, ne } from 'drizzle-orm';
import { HttpError } from '../http-error';
import type { Site } from './site-access';

/** The templates' sample photos, found through their package so the path holds in the bundle too. */
const SAMPLES_DIR = path.join(path.dirname(createRequire(import.meta.url).resolve('@webnhanh/templates/package.json')), 'samples');

/** HTTP status of each reason a job is not queued. */
export const ENQUEUE_STATUS = { 'job-active': 409, 'daily-limit': 429, 'queue-full': 503, 'account-locked': 403, 'site-removed': 403 } as const;

/** Old names one site may hold at once: renaming back and forth must not reserve names by the dozen. */
export const MAX_HELD_NAMES = 2;

/** The checked, normalized name, or a 400 saying why it cannot be a site name. */
export function validName(input: unknown): string {
  if (typeof input !== 'string') throw new HttpError(400, 'name-format');
  const check = checkSiteName(input);
  if (!check.ok) throw new HttpError(400, `name-${check.reason}`);
  return check.name;
}

/** Throws 409 when `name` is another site's, or held for another site after a rename. */
async function assertNameFree(db: Db, name: string, now: Date, siteId?: string): Promise<void> {
  const [owner] = await db.select({ id: sites.id }).from(sites).where(eq(sites.name, name));
  if (owner && owner.id !== siteId) throw new HttpError(409, 'name-taken');
  const [hold] = await db
    .select({ siteId: siteNameHolds.siteId })
    .from(siteNameHolds)
    .where(and(eq(siteNameHolds.name, name), gt(siteNameHolds.heldUntil, now)));
  if (hold && hold.siteId !== siteId) throw new HttpError(409, 'name-taken');
}

/** Every sample photo of `template`, each once, in the order the template lists them. */
function samplesOf(template: TemplateId): SamplePhoto[] {
  const byFile = new Map<string, SamplePhoto>();
  for (const value of Object.values(TEMPLATE_SAMPLES[template])) {
    for (const photo of Array.isArray(value) ? value : [value]) byFile.set(photo.file, photo);
  }
  return [...byFile.values()];
}

/**
 * Creates a template site of any template: its sample photos copied in as the site's own (marked `sample`), and the
 * template's new draft pointing at them. Template sites of every kind share one limit per account.
 */
export async function createTemplateSite(
  db: Db,
  input: { accountId: string; name: string; template: string; uploadsDir: string; sitesPerAccount: number },
  now: Date,
): Promise<Site> {
  const template = input.template;
  if (!isTemplateId(template)) throw new HttpError(400, 'unknown-template');
  const [mine] = await db
    .select({ n: count() })
    .from(sites)
    .where(and(eq(sites.accountId, input.accountId), eq(sites.kind, 'template')));
  if ((mine?.n ?? 0) >= input.sitesPerAccount) throw new HttpError(403, 'site-limit', { limit: input.sitesPerAccount });
  await assertNameFree(db, input.name, now);

  const siteId = randomUUID();
  const samples = samplesOf(template).map((sample) => ({ ...sample, id: randomUUID() }));
  const idOf = new Map(samples.map((sample) => [sample.file, sample.id]));
  const dir = siteUploadsDir(input.uploadsDir, siteId);
  try {
    await mkdir(dir, { recursive: true });
    for (const sample of samples) {
      await copyFile(path.join(SAMPLES_DIR, sample.file), siteImageFile(input.uploadsDir, siteId, sample.id, sample.width));
    }
    const sizes = await Promise.all(samples.map((sample) => stat(siteImageFile(input.uploadsDir, siteId, sample.id, sample.width))));
    const { draft } = templateDraft(template, (photo) => {
      const id = idOf.get(photo.file);
      if (!id) throw new Error(`sample ${photo.file} was not copied`);
      return id;
    });
    return await db.transaction(async (tx) => {
      const [site] = await tx
        .insert(sites)
        .values({ id: siteId, accountId: input.accountId, name: input.name, kind: 'template', template, status: 'draft', draft, createdAt: now, updatedAt: now })
        .returning();
      if (!site) throw new Error('site insert returned no row');
      if (samples.length > 0) {
        await tx.insert(siteImages).values(
          samples.map((sample, index) => ({
            id: sample.id,
            siteId,
            width: sample.width,
            height: sample.height,
            widths: [sample.width],
            bytes: sizes[index]?.size ?? 0,
            sample: true,
            createdAt: now,
          })),
        );
      }
      return site;
    });
  } catch (error) {
    await rm(dir, { recursive: true, force: true });
    if (isUniqueViolation(error)) throw new HttpError(409, 'name-taken');
    throw error;
  }
}

/** A webhook secret: 32 random bytes, base64url. */
export function newWebhookSecret(): string {
  return randomBytes(32).toString('base64url');
}

/** Creates a developer site (DEVELOPER_SITES_PER_ACCOUNT per account) with its source and confirmed settings. */
export async function createDeveloperSite(
  db: Db,
  input: { accountId: string; name: string; source: DeveloperSource; repoUrl: string | null; branch: string | null; settings: BuildSettings; detection: unknown },
  now: Date,
): Promise<Site> {
  if ((await developerSiteCount(db, input.accountId)) >= DEVELOPER_SITES_PER_ACCOUNT) {
    throw new HttpError(403, 'developer-site-limit', { limit: DEVELOPER_SITES_PER_ACCOUNT });
  }
  await assertNameFree(db, input.name, now);
  try {
    return await db.transaction(async (tx) => {
      const [site] = await tx
        .insert(sites)
        .values({ accountId: input.accountId, name: input.name, kind: 'developer', status: 'draft', createdAt: now, updatedAt: now })
        .returning();
      if (!site) throw new Error('site insert returned no row');
      await tx.insert(developerSites).values({
        siteId: site.id,
        source: input.source,
        repoUrl: input.repoUrl,
        branch: input.branch,
        settings: input.settings,
        detection: input.detection,
        webhookSecret: input.source === 'git' ? newWebhookSecret() : null,
        createdAt: now,
        updatedAt: now,
      });
      return site;
    });
  } catch (error) {
    if (isUniqueViolation(error)) throw new HttpError(409, 'name-taken');
    throw error;
  }
}

/**
 * Renames a site. A published site keeps its old name reserved (answering 404 once the new name is published) for
 * NAME_HOLD_MS, and is published again under the new name; a site never published simply changes name.
 */
export async function renameSite(db: Db, site: Site, newName: string, now: Date): Promise<{ site: Site; job: Job | null }> {
  if (newName === site.name) return { site, job: null };
  try {
    return await db.transaction(async (tx) => {
      // A job running for this account would publish under the old name; renaming waits for it.
      if (await activeJobOf(tx, site.accountId)) throw new HttpError(409, 'job-active');
      await assertNameFree(tx, newName, now, site.id);
      const published = site.currentReleaseId !== null;
      if (published) {
        const [held] = await tx
          .select({ n: count() })
          .from(siteNameHolds)
          .where(and(eq(siteNameHolds.siteId, site.id), gt(siteNameHolds.heldUntil, now), ne(siteNameHolds.name, newName)));
        if ((held?.n ?? 0) >= MAX_HELD_NAMES) throw new HttpError(409, 'rename-limit');
        await tx
          .insert(siteNameHolds)
          .values({ name: site.name, siteId: site.id, heldUntil: new Date(now.getTime() + NAME_HOLD_MS), createdAt: now })
          .onConflictDoUpdate({ target: siteNameHolds.name, set: { siteId: site.id, heldUntil: new Date(now.getTime() + NAME_HOLD_MS) } });
      }
      // Taking back one of its own held names ends that hold.
      await tx.delete(siteNameHolds).where(and(eq(siteNameHolds.name, newName), eq(siteNameHolds.siteId, site.id)));
      const [renamed] = await tx.update(sites).set({ name: newName, updatedAt: now }).where(eq(sites.id, site.id)).returning();
      if (!renamed) throw new Error('site update returned no row');
      if (!published) return { site: renamed, job: null };
      // A developer site is built again under its new name (not counted against the day's builds).
      const queued =
        site.kind === 'developer'
          ? await enqueueBuild(tx, { siteId: site.id, accountId: site.accountId, trigger: 'rename' }, now)
          : await enqueueJob(tx, { siteId: site.id, accountId: site.accountId, type: 'publish' }, now);
      if (!queued.ok) throw new HttpError(ENQUEUE_STATUS[queued.reason], queued.reason);
      return { site: renamed, job: queued.job };
    });
  } catch (error) {
    if (isUniqueViolation(error)) throw new HttpError(409, 'name-taken');
    throw error;
  }
}
