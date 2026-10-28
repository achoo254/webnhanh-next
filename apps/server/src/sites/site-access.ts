import { isUuid, sites, type Db } from '@trang/db';
import { and, eq } from 'drizzle-orm';
import { HttpError } from '../http-error';

export type Site = typeof sites.$inferSelect;

/**
 * The one way a route reaches a site: by its id AND the signed-in account. A site of another account answers
 * exactly like a site that does not exist (404), so ids cannot be probed.
 */
export async function ownedSite(db: Db, accountId: string, siteId: unknown): Promise<Site> {
  if (!isUuid(siteId)) throw new HttpError(404, 'site-not-found');
  const [site] = await db
    .select()
    .from(sites)
    .where(and(eq(sites.id, siteId), eq(sites.accountId, accountId)));
  if (!site) throw new HttpError(404, 'site-not-found');
  return site;
}
