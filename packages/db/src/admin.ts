/**
 * Admin work shared by the server (reports, actions, the audit log) and webnhanh-worker (the actions that change files
 * under SITES_DIR, and the notice of a release held for review). Admins are the accounts whose IdP `sub` is listed in
 * ADMIN_SUBS: an admin who never signed in here has no account yet and gets no notice.
 */
import { randomUUID } from 'node:crypto';
import { and, asc, eq, inArray } from 'drizzle-orm';
import type { Db } from './client';
import { accounts, adminActions, chatLinks, notificationDeliveries, pushSubscriptions, WORKER_ADMIN_ACTIONS } from './schema';

/** How long the releases of a taken-down site are kept for review before only the "removed" page is left. */
export const TAKEDOWN_KEEP_MS = 30 * 24 * 60 * 60 * 1000;

/**
 * ADMIN_SUBS as configured: IdP subjects separated by commas (spaces around them ignored). Throws on a subject with
 * spaces or control characters inside, so a typo stops the process instead of silently making nobody an admin.
 */
export function parseAdminSubs(value: string | undefined): string[] {
  if (value === undefined) return [];
  const subs = value
    .split(',')
    .map((sub) => sub.trim())
    .filter(Boolean);
  const bad = subs.filter((sub) => !/^[\x21-\x7e]{1,255}$/.test(sub));
  if (bad.length > 0) throw new Error(`ADMIN_SUBS: ${bad.length} subject(s) are not printable ASCII without spaces`);
  return [...new Set(subs)];
}

/** Accounts of the admins (by IdP subject) that exist here. */
export async function adminAccountIds(db: Db, adminSubs: readonly string[]): Promise<string[]> {
  if (adminSubs.length === 0) return [];
  const rows = await db
    .select({ id: accounts.id })
    .from(accounts)
    .where(inArray(accounts.sub, [...adminSubs]));
  return rows.map((row) => row.id);
}

/** What an admin notice is about: a new abuse report, or a site whose release waits for review. */
export type AdminNoticeSubject = { readonly reportId: string } | { readonly reviewSiteId: string };

/**
 * One delivery per push subscription and linked chat of every admin, in the caller's transaction (with the report or
 * the hold). The server sends them; a channel it has no keys for drops its rows.
 */
export async function queueAdminNotices(db: Db, adminSubs: readonly string[], subject: AdminNoticeSubject, now: Date): Promise<number> {
  const admins = await adminAccountIds(db, adminSubs);
  if (admins.length === 0) return 0;
  const devices = await db
    .select({ id: pushSubscriptions.id, accountId: pushSubscriptions.accountId })
    .from(pushSubscriptions)
    .where(inArray(pushSubscriptions.accountId, admins));
  const chats = await db
    .select({ chatId: chatLinks.chatId, accountId: chatLinks.accountId })
    .from(chatLinks)
    .where(inArray(chatLinks.accountId, admins));
  const targets = [
    ...devices.map((device) => ({ accountId: device.accountId, channel: 'push' as const, target: device.id })),
    ...chats.map((chat) => ({ accountId: chat.accountId, channel: 'chat' as const, target: String(chat.chatId) })),
  ];
  if (targets.length === 0) return 0;
  const about = 'reportId' in subject ? { reportId: subject.reportId } : { reviewSiteId: subject.reviewSiteId };
  await db
    .insert(notificationDeliveries)
    .values(targets.map((t) => ({ id: randomUUID(), ...about, ...t, status: 'pending' as const, nextAttemptAt: now, createdAt: now })));
  return targets.length;
}

export type AdminActionRow = typeof adminActions.$inferSelect;

/** Takes the oldest queued action the worker applies (takedown, restore, approve, reject), or null. */
export async function claimNextAdminAction(db: Db): Promise<AdminActionRow | null> {
  return db.transaction(async (tx) => {
    const [next] = await tx
      .select()
      .from(adminActions)
      .where(and(eq(adminActions.status, 'queued'), inArray(adminActions.action, [...WORKER_ADMIN_ACTIONS])))
      .orderBy(asc(adminActions.createdAt), asc(adminActions.id))
      .limit(1)
      .for('update', { skipLocked: true });
    return next ?? null;
  });
}

/** Records how a queued action ended (`error`: a stable code). */
export async function finishAdminAction(db: Db, id: string, error: string | null, now: Date): Promise<void> {
  await db
    .update(adminActions)
    .set({ status: error === null ? 'done' : 'failed', error, finishedAt: now })
    .where(and(eq(adminActions.id, id), eq(adminActions.status, 'queued')));
}
