/**
 * Retention, run by the worker about once an hour: expired sessions, name holds that ran out, and photos no draft
 * uses any more (replaced or removed in the editor) once they are a day old. A release keeps its own copies, so a
 * live page never loses a photo to this.
 */
import { deleteSiteImages, pruneNameHolds, pruneSessions, siteImages, sites, type Db } from '@trang/db';
import { draftImageIds } from '@trang/templates';
import { eq, lt } from 'drizzle-orm';

/** A photo is only treated as unused once it is this old: an upload that no save has used yet is kept. */
export const UNUSED_IMAGE_AGE_MS = 24 * 60 * 60 * 1000;

export interface CleanupResult {
  readonly sessions: number;
  readonly nameHolds: number;
  readonly images: number;
}

export async function cleanup(db: Db, uploadsDir: string, now: Date): Promise<CleanupResult> {
  const sessionCount = await pruneSessions(db, now);
  const nameHolds = await pruneNameHolds(db, now);
  const old = await db
    .select({ id: siteImages.id, siteId: siteImages.siteId, widths: siteImages.widths, template: sites.template, draft: sites.draft })
    .from(siteImages)
    .innerJoin(sites, eq(sites.id, siteImages.siteId))
    .where(lt(siteImages.createdAt, new Date(now.getTime() - UNUSED_IMAGE_AGE_MS)));
  const unusedBySite = new Map<string, typeof old>();
  for (const image of old) {
    const used = draftImageIds(image.template, image.draft);
    if (!used || used.has(image.id)) continue;
    unusedBySite.set(image.siteId, [...(unusedBySite.get(image.siteId) ?? []), image]);
  }
  for (const [siteId, images] of unusedBySite) await deleteSiteImages(db, uploadsDir, siteId, images);
  return { sessions: sessionCount, nameHolds, images: [...unusedBySite.values()].reduce((n, list) => n + list.length, 0) };
}
