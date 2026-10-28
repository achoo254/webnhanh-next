/**
 * What is deleted once it is no longer needed: expired sessions, expired name holds, and photos no draft uses.
 * The worker runs these on a schedule; the server also prunes sessions at each sign-in.
 */
import { rm } from 'node:fs/promises';
import { and, eq, inArray, lt, lte, or } from 'drizzle-orm';
import type { Db } from './client';
import { SESSION_IDLE_MS, sessions, siteImages, siteNameHolds } from './schema';
import { siteImageFile } from './site-files';

/** Deletes every session that expired or went unused for SESSION_IDLE_MS. */
export async function pruneSessions(db: Db, now: Date): Promise<number> {
  const rows = await db
    .delete(sessions)
    .where(or(lte(sessions.expiresAt, now), lt(sessions.lastSeenAt, new Date(now.getTime() - SESSION_IDLE_MS))))
    .returning({ id: sessions.id });
  return rows.length;
}

/** Frees the old names whose hold ran out. */
export async function pruneNameHolds(db: Db, now: Date): Promise<number> {
  const rows = await db.delete(siteNameHolds).where(lte(siteNameHolds.heldUntil, now)).returning({ name: siteNameHolds.name });
  return rows.length;
}

export interface StoredImage {
  readonly id: string;
  readonly siteId: string;
  readonly widths: readonly number[];
}

/** Deletes photos of one site: the rows first (nothing points at a missing file), then their files. */
export async function deleteSiteImages(db: Db, uploadsDir: string, siteId: string, images: readonly StoredImage[]): Promise<void> {
  const ids = images.filter((image) => image.siteId === siteId).map((image) => image.id);
  if (ids.length === 0) return;
  await db.delete(siteImages).where(and(eq(siteImages.siteId, siteId), inArray(siteImages.id, ids)));
  await Promise.all(
    images.flatMap((image) => image.widths.map((width) => rm(siteImageFile(uploadsDir, siteId, image.id, width), { force: true }))),
  );
}
