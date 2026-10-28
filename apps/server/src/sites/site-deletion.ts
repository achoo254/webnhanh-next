/**
 * Deleting a site, by its owner. The rows go at once in one transaction (orders, replies, photos' rows, builds and
 * their logs, releases' rows, the webhook secret cascade from `sites`; abuse reports and the admin log keep their row
 * with the site's id set null), the name is held DELETED_NAME_HOLD_MS for everyone, and a `site_deletions` row asks
 * webnhanh-worker to take the site off the web and delete its photos (the server never writes SITES_DIR). The site's
 * uploaded zip is removed here (the server owns the build inbox); its build cache goes with the builder's next
 * maintenance, which drops caches of sites that no longer exist.
 *
 * Refused, keeping everything, while a publish or build of the site is waiting or running, while the site is taken
 * down or its account locked (`publishBlock`), and while an abuse report about it is open: what an admin may need to
 * look at stays until an admin decided.
 */
import { randomUUID } from 'node:crypto';
import { rm } from 'node:fs/promises';
import { abuseReports, buildMsToday, DELETED_NAME_HOLD_MS, jobs, publishBlock, siteDeletions, siteNameHolds, sites, type Db } from '@webnhanh/db';
import { inboxZip } from '@webnhanh/worker/build';
import { and, eq, inArray, ne } from 'drizzle-orm';
import { HttpError } from '../http-error';
import type { Site } from './site-access';

/** The name typed to confirm, which must be exactly the site's name. */
function assertConfirmed(site: Site, confirm: unknown): void {
  if (typeof confirm !== 'string' || confirm.trim() !== site.name) throw new HttpError(400, 'confirm-name');
}

export async function deleteSite(db: Db, site: Site, confirm: unknown, now: Date, inboxDir: string | null): Promise<void> {
  assertConfirmed(site, confirm);
  await db.transaction(async (tx) => {
    // Locked first: no job can be queued for the site (its insert needs this row) until the deletion is decided.
    const [row] = await tx.select().from(sites).where(eq(sites.id, site.id)).for('update');
    if (!row) throw new HttpError(404, 'site-not-found');
    const block = await publishBlock(tx, row.id);
    if (block) throw new HttpError(403, block);
    const [report] = await tx
      .select({ id: abuseReports.id })
      .from(abuseReports)
      .where(and(eq(abuseReports.siteId, row.id), eq(abuseReports.status, 'open')))
      .limit(1);
    if (report) throw new HttpError(409, 'report-open');
    const [active] = await tx
      .select({ id: jobs.id })
      .from(jobs)
      .where(and(eq(jobs.siteId, row.id), inArray(jobs.status, ['queued', 'running'])))
      .limit(1);
    if (active) throw new HttpError(409, 'job-active');

    // Old names of a rename the site still holds keep their hold (now nobody's) and are taken off the web too.
    const oldNames = await tx
      .select({ name: siteNameHolds.name })
      .from(siteNameHolds)
      .where(and(eq(siteNameHolds.siteId, row.id), ne(siteNameHolds.name, row.name)));
    const heldUntil = new Date(now.getTime() + DELETED_NAME_HOLD_MS);
    await tx
      .insert(siteNameHolds)
      .values({ name: row.name, siteId: null, heldUntil, createdAt: now })
      .onConflictDoUpdate({ target: siteNameHolds.name, set: { siteId: null, heldUntil } });
    // The site's builds of today leave with it but still count against the account's day.
    const buildMs = await buildMsToday(tx, row.accountId, now, row.id);
    await tx.delete(sites).where(eq(sites.id, row.id));
    await tx.insert(siteDeletions).values({
      id: randomUUID(),
      siteId: row.id,
      accountId: row.accountId,
      names: [row.name, ...oldNames.map((hold) => hold.name)],
      buildMs,
      status: 'queued',
      createdAt: now,
    });
  });
  if (site.kind === 'developer' && inboxDir) {
    await rm(inboxZip({ inbox: inboxDir, out: inboxDir, work: inboxDir, cache: inboxDir }, site.id), { force: true }).catch((error: unknown) => {
      // The builder's maintenance removes zips of sites that no longer exist.
      console.warn('zip of a deleted site not removed', error instanceof Error ? error.message : String(error));
    });
  }
}
