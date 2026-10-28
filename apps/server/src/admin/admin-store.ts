/**
 * What the admin tools read and do. Every action writes its row in the audit log (`admin_actions`) in the same
 * transaction as its effect. Effects on the database apply at once (a taken-down site stops taking orders and
 * publishes immediately); effects on files under SITES_DIR are queued for webnhanh-worker (`queued` in the log until
 * it applied them).
 */
import { randomUUID } from 'node:crypto';
import {
  abuseReports,
  accounts,
  adminActions,
  isUuid,
  jobs,
  sites,
  type AdminAction,
  type Db,
  type PendingReview,
  type ReportStatus,
} from '@webnhanh/db';
import { and, desc, eq, inArray, isNotNull, sql } from 'drizzle-orm';
import { HttpError } from '../http-error';

type SiteRow = typeof sites.$inferSelect;
type ReportRow = typeof abuseReports.$inferSelect;
type ActionRow = typeof adminActions.$inferSelect;

/** A site as an admin sees it: whose, its state, and the review waiting on it. */
export interface AdminSiteView {
  readonly id: string;
  readonly name: string;
  readonly kind: string;
  readonly template: string | null;
  readonly status: string;
  readonly published: boolean;
  readonly accountId: string;
  readonly accountLocked: boolean;
  readonly takenDownAt: string | null;
  readonly review: Pick<PendingReview, 'reasons' | 'matches' | 'heldAt'> | null;
  /** A takedown, restore or review decision the worker has not applied yet. */
  readonly actionQueued: boolean;
}

export interface ReportView {
  readonly id: string;
  readonly siteName: string;
  readonly category: string;
  readonly details: string;
  readonly contact: string | null;
  readonly status: string;
  readonly createdAt: string;
  readonly handledAt: string | null;
  readonly site: AdminSiteView | null;
}

export interface ActionView {
  readonly id: string;
  readonly action: string;
  readonly adminAccountId: string | null;
  readonly siteId: string | null;
  readonly siteName: string | null;
  readonly accountId: string | null;
  readonly reportId: string | null;
  readonly note: string | null;
  readonly status: string;
  readonly error: string | null;
  readonly createdAt: string;
  readonly finishedAt: string | null;
}

export function actionView(row: ActionRow): ActionView {
  return {
    id: row.id,
    action: row.action,
    adminAccountId: row.adminAccountId,
    siteId: row.siteId,
    siteName: row.siteName,
    accountId: row.accountId,
    reportId: row.reportId,
    note: row.note,
    status: row.status,
    error: row.error,
    createdAt: row.createdAt.toISOString(),
    finishedAt: row.finishedAt?.toISOString() ?? null,
  };
}

/** Views of the given sites, by id. */
async function siteViews(db: Db, ids: readonly string[]): Promise<Map<string, AdminSiteView>> {
  if (ids.length === 0) return new Map();
  const rows = await db
    .select({ site: sites, lockedAt: accounts.lockedAt })
    .from(sites)
    .innerJoin(accounts, eq(accounts.id, sites.accountId))
    .where(inArray(sites.id, [...ids]));
  const queued = await db
    .select({ siteId: adminActions.siteId })
    .from(adminActions)
    .where(and(eq(adminActions.status, 'queued'), inArray(adminActions.siteId, [...ids])));
  const busy = new Set(queued.map((row) => row.siteId));
  return new Map(
    rows.map(({ site, lockedAt }) => [
      site.id,
      {
        id: site.id,
        name: site.name,
        kind: site.kind,
        template: site.template,
        status: site.status,
        published: site.currentReleaseId !== null,
        accountId: site.accountId,
        accountLocked: lockedAt !== null,
        takenDownAt: site.takenDownAt?.toISOString() ?? null,
        review: site.pendingReview ? { reasons: site.pendingReview.reasons, matches: site.pendingReview.matches, heldAt: site.pendingReview.heldAt } : null,
        actionQueued: busy.has(site.id),
      },
    ]),
  );
}

/** One site by id, for an admin (any account's). 404 when it does not exist. */
export async function adminSite(db: Db, siteId: unknown): Promise<AdminSiteView> {
  if (!isUuid(siteId)) throw new HttpError(404, 'site-not-found');
  const view = (await siteViews(db, [siteId])).get(siteId);
  if (!view) throw new HttpError(404, 'site-not-found');
  return view;
}

/** One site by its name, for an admin looking up an address. */
export async function adminSiteByName(db: Db, name: string): Promise<AdminSiteView> {
  const [row] = await db.select({ id: sites.id }).from(sites).where(eq(sites.name, name));
  if (!row) throw new HttpError(404, 'site-not-found');
  return adminSite(db, row.id);
}

/** Reports, newest first: the open ones, or every one (`all`). */
export async function listReports(db: Db, which: 'open' | 'all', limit = 100): Promise<ReportView[]> {
  const rows = await db
    .select()
    .from(abuseReports)
    .where(which === 'open' ? eq(abuseReports.status, 'open') : undefined)
    .orderBy(desc(abuseReports.createdAt))
    .limit(limit);
  const views = await siteViews(db, [...new Set(rows.flatMap((row) => (row.siteId ? [row.siteId] : [])))]);
  return rows.map((row: ReportRow) => ({
    id: row.id,
    siteName: row.siteName,
    category: row.category,
    details: row.details,
    contact: row.contact,
    status: row.status,
    createdAt: row.createdAt.toISOString(),
    handledAt: row.handledAt?.toISOString() ?? null,
    site: row.siteId ? (views.get(row.siteId) ?? null) : null,
  }));
}

/** Sites with a release held for review, oldest hold first. */
export async function listReviews(db: Db): Promise<AdminSiteView[]> {
  const rows = await db
    .select({ id: sites.id })
    .from(sites)
    .where(and(eq(sites.status, 'pending-review'), isNotNull(sites.pendingReleaseId)))
    .orderBy(sql`${sites.pendingReview}->>'heldAt'`);
  const views = await siteViews(db, rows.map((row) => row.id));
  return rows.flatMap((row) => views.get(row.id) ?? []);
}

export async function listActions(db: Db, limit = 100): Promise<ActionView[]> {
  const rows = await db.select().from(adminActions).orderBy(desc(adminActions.createdAt), desc(adminActions.id)).limit(limit);
  return rows.map(actionView);
}

export interface ActionInput {
  readonly adminAccountId: string;
  readonly note: string | null;
}

type Tx = Parameters<Parameters<Db['transaction']>[0]>[0];

async function logAction(
  tx: Tx,
  input: ActionInput,
  action: AdminAction,
  target: { site?: SiteRow; accountId?: string; reportId?: string | null },
  queued: boolean,
  now: Date,
): Promise<ActionRow> {
  const [row] = await tx
    .insert(adminActions)
    .values({
      id: randomUUID(),
      adminAccountId: input.adminAccountId,
      action,
      siteId: target.site?.id ?? null,
      siteName: target.site?.name ?? null,
      accountId: target.accountId ?? target.site?.accountId ?? null,
      reportId: target.reportId ?? null,
      note: input.note,
      status: queued ? 'queued' : 'done',
      createdAt: now,
      finishedAt: queued ? null : now,
    })
    .returning();
  if (!row) throw new Error('admin action insert returned no row');
  return row;
}

async function lockedSite(tx: Tx, siteId: unknown): Promise<SiteRow> {
  if (!isUuid(siteId)) throw new HttpError(404, 'site-not-found');
  const [site] = await tx.select().from(sites).where(eq(sites.id, siteId)).for('update');
  if (!site) throw new HttpError(404, 'site-not-found');
  return site;
}

/** Marks an open report handled (resolved by an action, or dismissed). */
async function closeReport(tx: Tx, reportId: string, status: Exclude<ReportStatus, 'open'>, now: Date): Promise<boolean> {
  const rows = await tx
    .update(abuseReports)
    .set({ status, handledAt: now })
    .where(and(eq(abuseReports.id, reportId), eq(abuseReports.status, 'open')))
    .returning({ id: abuseReports.id });
  return rows.length > 0;
}

/**
 * Takes a site down in one action: from now on it takes no order and cannot be published or built (its waiting jobs
 * fail, a held release is dropped from review), and the worker puts the "removed" page live. A report it answers is
 * resolved with it.
 */
export async function takeDownSite(db: Db, input: ActionInput & { siteId: unknown; reportId: string | null }, now: Date): Promise<ActionView> {
  if (input.reportId !== null && !isUuid(input.reportId)) throw new HttpError(404, 'report-not-found');
  return db.transaction(async (tx) => {
    const site = await lockedSite(tx, input.siteId);
    if (site.status === 'removed') throw new HttpError(409, 'already-removed');
    await tx
      .update(sites)
      .set({ status: 'removed', takenDownAt: now, pendingReleaseId: null, pendingReview: null, updatedAt: now })
      .where(eq(sites.id, site.id));
    await tx
      .update(jobs)
      .set({ status: 'failed', error: 'site-removed', finishedAt: now })
      .where(and(eq(jobs.siteId, site.id), eq(jobs.status, 'queued')));
    if (input.reportId) await closeReport(tx, input.reportId, 'resolved', now);
    return actionView(await logAction(tx, input, 'takedown', { site, reportId: input.reportId }, true, now));
  });
}

/** Puts a taken-down site back (the worker makes its last release live again). */
export async function restoreSite(db: Db, input: ActionInput & { siteId: unknown }, now: Date): Promise<ActionView> {
  return db.transaction(async (tx) => {
    const site = await lockedSite(tx, input.siteId);
    if (site.status !== 'removed') throw new HttpError(409, 'not-removed');
    return actionView(await logAction(tx, input, 'restore', { site }, true, now));
  });
}

/** Approves or rejects the release held for review (the worker applies it). */
export async function decideReview(db: Db, input: ActionInput & { siteId: unknown; decision: 'approve' | 'reject' }, now: Date): Promise<ActionView> {
  return db.transaction(async (tx) => {
    const site = await lockedSite(tx, input.siteId);
    if (site.status !== 'pending-review' || !site.pendingReleaseId) throw new HttpError(409, 'not-pending');
    if (input.decision === 'approve') {
      const [owner] = await tx.select({ lockedAt: accounts.lockedAt }).from(accounts).where(eq(accounts.id, site.accountId));
      if (owner?.lockedAt) throw new HttpError(409, 'account-locked');
    }
    return actionView(await logAction(tx, input, input.decision, { site }, true, now));
  });
}

/**
 * Locks an account: its sites stay as they are on the web, but nothing of it is published or built any more (its
 * waiting jobs fail now; a running one is refused when it would publish). Unlocking lets it publish again.
 */
export async function setAccountLock(db: Db, input: ActionInput & { accountId: unknown; lock: boolean }, now: Date): Promise<ActionView> {
  return db.transaction(async (tx) => {
    if (!isUuid(input.accountId)) throw new HttpError(404, 'account-not-found');
    const [account] = await tx.select().from(accounts).where(eq(accounts.id, input.accountId)).for('update');
    if (!account) throw new HttpError(404, 'account-not-found');
    if (input.lock === (account.lockedAt !== null)) throw new HttpError(409, input.lock ? 'already-locked' : 'not-locked');
    await tx
      .update(accounts)
      .set({ lockedAt: input.lock ? now : null })
      .where(eq(accounts.id, account.id));
    if (input.lock) {
      await tx
        .update(jobs)
        .set({ status: 'failed', error: 'account-locked', finishedAt: now })
        .where(and(eq(jobs.accountId, account.id), eq(jobs.status, 'queued')));
    }
    return actionView(await logAction(tx, input, input.lock ? 'lock' : 'unlock', { accountId: account.id }, false, now));
  });
}

/** Closes an open report: resolved (dealt with) or dismissed (nothing wrong). */
export async function closeOpenReport(db: Db, input: ActionInput & { reportId: unknown; status: 'resolved' | 'dismissed' }, now: Date): Promise<ActionView> {
  return db.transaction(async (tx) => {
    if (!isUuid(input.reportId)) throw new HttpError(404, 'report-not-found');
    const [report] = await tx.select().from(abuseReports).where(eq(abuseReports.id, input.reportId));
    if (!report) throw new HttpError(404, 'report-not-found');
    if (!(await closeReport(tx, report.id, input.status, now))) throw new HttpError(409, 'report-closed');
    const [site] = report.siteId ? await tx.select().from(sites).where(eq(sites.id, report.siteId)) : [];
    return actionView(await logAction(tx, input, input.status === 'resolved' ? 'resolve' : 'dismiss', { site, reportId: report.id }, false, now));
  });
}

/** Sites of an account, for an admin deciding on a lock. */
export async function accountSites(db: Db, accountId: string): Promise<AdminSiteView[]> {
  const rows = await db.select({ id: sites.id }).from(sites).where(eq(sites.accountId, accountId));
  const views = await siteViews(db, rows.map((row) => row.id));
  return rows.flatMap((row) => views.get(row.id) ?? []);
}
