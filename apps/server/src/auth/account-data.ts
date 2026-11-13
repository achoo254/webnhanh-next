/**
 * Deleting everything of an account deleted at the IdP (auth-next ADR 0018), in one transaction:
 *
 * - every site of the account goes through `deleteSiteRows`, the same path as a deletion by its owner: its rows
 *   (orders and wedding replies, photos' rows, builds and their logs, releases' rows, the webhook secret, notices
 *   about it) cascade from `sites`, its names are freed, and a `site_deletions` row asks webnhanh-worker to take it
 *   off `<name>.hoandat.io.vn` and delete its photos (the server never writes SITES_DIR). Unlike a deletion by the
 *   owner nothing is refused: not a waiting or running job (the worker runs queued deletions after the job in hand,
 *   the builder's maintenance drops staged output of jobs that are gone), not a takedown, lock or open report (the
 *   account is gone, its data must go now). Abuse reports and the admin log keep their rows, the site's id set null;
 * - then the account row, and with it its sessions, push subscriptions, Chat link and codes, and pending notices.
 *
 * Sites have one owner and nothing else is shared between accounts, so nothing changes hands.
 */
import { accounts, sites, type Db } from '@webnhanh/db';
import { eq } from 'drizzle-orm';
import { deleteSiteRows, removeInboxZip } from '../sites/site-deletion';

export interface DeletedAccount {
  readonly accountId: string;
  readonly sites: number;
}

/** Deletes the account of `sub` and all its data; null when no account has that `sub` (never signed in, or already deleted). */
export async function deleteAccountData(db: Db, sub: string, now: Date, inboxDir: string | null): Promise<DeletedAccount | null> {
  const deleted = await db.transaction(async (tx) => {
    const [account] = await tx.select({ id: accounts.id }).from(accounts).where(eq(accounts.sub, sub)).for('update');
    if (!account) return null;
    // Locked: no job can be queued for these sites (its insert needs the row) until the deletion commits.
    const owned = await tx
      .select({ id: sites.id, name: sites.name, accountId: sites.accountId, kind: sites.kind })
      .from(sites)
      .where(eq(sites.accountId, account.id))
      .for('update');
    for (const site of owned) await deleteSiteRows(tx, site, now);
    await tx.delete(accounts).where(eq(accounts.id, account.id));
    return { accountId: account.id, owned };
  });
  if (!deleted) return null;
  for (const site of deleted.owned) if (site.kind === 'developer') await removeInboxZip(inboxDir, site.id);
  return { accountId: deleted.accountId, sites: deleted.owned.length };
}
