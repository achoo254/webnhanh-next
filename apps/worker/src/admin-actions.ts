/**
 * The admin actions that change files under SITES_DIR, applied by webnhanh-worker (the only writer there) in the
 * order the admins took them, before any queued publish:
 *
 * - takedown: `current` goes to the shared "removed" page, a release of its own; the site's releases stay for
 *   TAKEDOWN_KEEP_MS (the server already marked the site `removed`, so forms and publishes stopped at once);
 * - restore: `current` goes back to the release live before, or, once that was pruned, the site is emptied and goes
 *   back to a draft its owner can publish again;
 * - approve / reject: a release held for review goes live, or is deleted (`review-hold.ts`).
 */
import { randomUUID } from 'node:crypto';
import { mkdir, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { accounts, claimNextAdminAction, finishAdminAction, sites, TAKEDOWN_KEEP_MS, type AdminActionRow } from '@webnhanh/db';
import { activateRelease, currentRelease, deleteRelease, hasRelease, listReleases, removeSite, stageRelease } from '@webnhanh/publish';
import { and, eq, isNotNull, lt } from 'drizzle-orm';
import { removeOldNames, type Logger, type PublishDeps } from './publish-job';
import { approveRelease, rejectRelease } from './review-hold';
import { takedownPageHtml } from './takedown-page';

export type AdminActionDeps = Pick<PublishDeps, 'db' | 'log' | 'sitesDir' | 'madeWith' | 'now' | 'workDir' | 'adminSubs'>;

type SiteRow = typeof sites.$inferSelect;

/** Puts the "removed" page live as a release of its own, keeping every other release. */
async function takeDown(deps: AdminActionDeps, site: SiteRow): Promise<string | null> {
  if (site.status !== 'removed') return 'not-removed';
  const live = await currentRelease(deps.sitesDir, site.name);
  // Never published (nothing on the web), or already showing the "removed" page.
  if (live === undefined || live === site.takedownReleaseId) return null;
  const releaseId = randomUUID();
  const work = path.join(deps.workDir ?? os.tmpdir(), `webnhanh-takedown-${releaseId}`);
  try {
    await mkdir(work, { recursive: true });
    const html = takedownPageHtml(deps.madeWith);
    await writeFile(path.join(work, 'index.html'), html);
    await writeFile(path.join(work, '404.html'), html);
    await stageRelease({ sitesDir: deps.sitesDir, site: site.name, sourceDir: work, releaseId, limits: { maxBytes: 1024 * 1024, maxFiles: 2 } });
    await activateRelease(deps.sitesDir, site.name, releaseId);
  } finally {
    await rm(work, { recursive: true, force: true });
  }
  await deps.db.update(sites).set({ takedownReleaseId: releaseId }).where(eq(sites.id, site.id));
  return null;
}

/** Puts back the release live before the takedown, or empties the site when it is gone. */
async function restore(deps: AdminActionDeps, site: SiteRow): Promise<string | null> {
  if (site.status !== 'removed') return 'not-removed';
  const now = deps.now();
  const back = site.currentReleaseId;
  const cleared = { takenDownAt: null, takedownReleaseId: null, updatedAt: now };
  if (back && (await hasRelease(deps.sitesDir, site.name, back))) {
    await activateRelease(deps.sitesDir, site.name, back);
    if (site.takedownReleaseId) await deleteRelease(deps.sitesDir, site.name, site.takedownReleaseId);
    await deps.db.update(sites).set({ ...cleared, status: 'published' }).where(eq(sites.id, site.id));
    await removeOldNames(deps, site);
    return null;
  }
  await removeSite(deps.sitesDir, site.name);
  await deps.db
    .update(sites)
    .set({ ...cleared, status: 'draft', currentReleaseId: null, livePage: null, orderForm: null })
    .where(eq(sites.id, site.id));
  return null;
}

async function apply(deps: AdminActionDeps, action: AdminActionRow): Promise<string | null> {
  if (!action.siteId) return 'site-missing';
  const [row] = await deps.db
    .select({ site: sites, lockedAt: accounts.lockedAt })
    .from(sites)
    .innerJoin(accounts, eq(accounts.id, sites.accountId))
    .where(eq(sites.id, action.siteId));
  if (!row) return 'site-missing';
  switch (action.action) {
    case 'takedown':
      return takeDown(deps, row.site);
    case 'restore':
      return restore(deps, row.site);
    case 'approve': {
      const error = await approveRelease(deps, row.site, row.lockedAt !== null);
      if (error === null) await removeOldNames(deps, row.site);
      return error;
    }
    case 'reject':
      return rejectRelease(deps, row.site);
    default:
      return 'not-a-worker-action';
  }
}

/** Applies the oldest queued admin action, if any; true when there was one. */
export async function processNextAdminAction(deps: AdminActionDeps): Promise<boolean> {
  const action = await claimNextAdminAction(deps.db);
  if (!action) return false;
  let error: string | null;
  try {
    error = await apply(deps, action);
  } catch (failure) {
    deps.log.warn(`admin ${action.action} ${action.siteName ?? ''} failed: ${failure instanceof Error ? failure.message : String(failure)}`);
    error = 'apply-failed';
  }
  await finishAdminAction(deps.db, action.id, error, deps.now());
  deps.log.info(`admin ${action.action} ${action.siteName ?? action.siteId ?? ''}: ${error ?? 'done'}`);
  return true;
}

/**
 * Sites taken down more than TAKEDOWN_KEEP_MS ago keep only the "removed" page: their releases are deleted and a
 * later restore makes them a draft. Returns how many sites were pruned.
 */
export async function pruneTakenDown(deps: Pick<AdminActionDeps, 'db' | 'sitesDir' | 'now'> & { readonly log: Logger }): Promise<number> {
  const old = await deps.db
    .select()
    .from(sites)
    .where(and(eq(sites.status, 'removed'), isNotNull(sites.currentReleaseId), lt(sites.takenDownAt, new Date(deps.now().getTime() - TAKEDOWN_KEEP_MS))));
  let pruned = 0;
  for (const site of old) {
    // Only once the "removed" page is what `current` shows: a takedown that failed to apply keeps everything.
    if (!site.takedownReleaseId || (await currentRelease(deps.sitesDir, site.name)) !== site.takedownReleaseId) continue;
    for (const id of await listReleases(deps.sitesDir, site.name)) {
      if (id !== site.takedownReleaseId) await deleteRelease(deps.sitesDir, site.name, id);
    }
    await deps.db.update(sites).set({ currentReleaseId: null, livePage: null, orderForm: null }).where(eq(sites.id, site.id));
    deps.log.info(`taken down ${site.name}: releases deleted after the review period`);
    pruned += 1;
  }
  return pruned;
}
