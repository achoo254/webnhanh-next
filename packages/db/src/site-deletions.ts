/**
 * The queue of deleted sites, shared by the server (which deletes the rows and queues one) and webnhanh-worker (which
 * takes the names off the web and deletes the photos: it alone writes SITES_DIR).
 */
import { and, asc, eq } from 'drizzle-orm';
import type { Db } from './client';
import { siteDeletions } from './schema';

export type SiteDeletionRow = typeof siteDeletions.$inferSelect;

/** Takes the oldest queued deletion, or null. */
export async function claimNextSiteDeletion(db: Db): Promise<SiteDeletionRow | null> {
  return db.transaction(async (tx) => {
    const [next] = await tx
      .select()
      .from(siteDeletions)
      .where(eq(siteDeletions.status, 'queued'))
      .orderBy(asc(siteDeletions.createdAt), asc(siteDeletions.id))
      .limit(1)
      .for('update', { skipLocked: true });
    return next ?? null;
  });
}

/** Records how a queued deletion ended (`error`: a stable code). */
export async function finishSiteDeletion(db: Db, id: string, error: string | null, now: Date): Promise<void> {
  await db
    .update(siteDeletions)
    .set({ status: error === null ? 'done' : 'failed', error, finishedAt: now })
    .where(and(eq(siteDeletions.id, id), eq(siteDeletions.status, 'queued')));
}
