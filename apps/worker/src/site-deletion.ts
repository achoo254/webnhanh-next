/**
 * Deleted sites, applied by webnhanh-worker (the only writer of SITES_DIR): the server already deleted the rows, freed
 * the names and queued a `site_deletions` row. Each of its names (the site's, and old names it still held) is taken off
 * the web through `removeSite` (`current` first, then the releases), then the site's photos are deleted.
 *
 * The names are free at once, so another site may already have one of them. Deletions run before publishes in the
 * worker's single loop, so a new site under that name cannot have published yet unless a deletion is retried late:
 * a name now held by a site that is not a draft is left alone (its files are the new site's).
 */
import { rm } from 'node:fs/promises';
import { claimNextSiteDeletion, finishSiteDeletion, sites, siteUploadsDir, type SiteDeletionRow } from '@webnhanh/db';
import { and, eq, ne } from 'drizzle-orm';
import { removeSite } from '@webnhanh/publish';
import type { PublishDeps } from './publish-job';

export type SiteDeletionDeps = Pick<PublishDeps, 'db' | 'log' | 'sitesDir' | 'uploadsDir' | 'now'>;

async function apply(deps: SiteDeletionDeps, deletion: SiteDeletionRow): Promise<string | null> {
  // removeSite refuses anything that is not a site name before it becomes a path.
  for (const name of deletion.names) {
    const [taken] = await deps.db
      .select({ id: sites.id })
      .from(sites)
      .where(and(eq(sites.name, name), ne(sites.status, 'draft')))
      .limit(1);
    if (taken) {
      deps.log.info(`site deletion: ${name} belongs to another site now, left alone`);
      continue;
    }
    await removeSite(deps.sitesDir, name);
  }
  await rm(siteUploadsDir(deps.uploadsDir, deletion.siteId), { recursive: true, force: true });
  return null;
}

/** Applies the oldest queued deletion, if any; true when there was one. */
export async function processNextSiteDeletion(deps: SiteDeletionDeps): Promise<boolean> {
  const deletion = await claimNextSiteDeletion(deps.db);
  if (!deletion) return false;
  let error: string | null;
  try {
    error = await apply(deps, deletion);
  } catch (failure) {
    deps.log.warn(`deleting ${deletion.names.join(', ')} failed: ${failure instanceof Error ? failure.message : String(failure)}`);
    error = 'apply-failed';
  }
  await finishSiteDeletion(deps.db, deletion.id, error, deps.now());
  deps.log.info(`site deleted ${deletion.names.join(', ')}: ${error ?? 'done'}`);
  return true;
}
