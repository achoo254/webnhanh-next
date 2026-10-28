/**
 * The notification outbox: `notification_deliveries` rows are written with an order or a wedding reply
 * (orders/order-store.ts), with the end of a build the owner asked to hear about (`queueJobNotices` of @webnhanh/db),
 * or for the admins with an abuse report or a release held for review (`queueAdminNotices`), and sent from here, each on its own. A failing row only moves its own next attempt (with backoff), so a push
 * service that is down never holds back the Chat message, nor the other way round, and the submission itself is
 * stored whatever happens here. A row is leased while it is sent: a crash mid-send retries it after the lease.
 */
import { abuseReports, chatLinks, jobs, notificationDeliveries, pushSubscriptions, sites, submissionContent, submissions, type Db } from '@webnhanh/db';
import { and, asc, eq, inArray, lte } from 'drizzle-orm';
import { reportChatText, reportPushPayload, reviewChatText, reviewPushPayload } from './admin-message';
import { buildChatText, buildPushPayload, type BuildNotice } from './build-message';
import { chatText, pushPayload, randomIdOf, type OrderNotice } from './order-message';
import { DeliveryError, type Senders } from './senders';

/** Wait before attempt n+1 (index n-1); after the last one the delivery is failed. */
export const RETRY_DELAYS_MS = [30_000, 2 * 60_000, 10 * 60_000, 30 * 60_000, 2 * 3_600_000, 6 * 3_600_000] as const;
export const MAX_ATTEMPTS = RETRY_DELAYS_MS.length + 1;
/** A claimed row is skipped by other turns this long. */
const LEASE_MS = 2 * 60_000;
const BATCH = 20;

type Delivery = typeof notificationDeliveries.$inferSelect;

export interface DeliveryLog {
  warn(message: string): void;
}

export interface DeliveryResult {
  readonly sent: number;
  readonly retrying: number;
  readonly dropped: number;
  readonly failed: number;
}

async function claimDue(db: Db, now: Date): Promise<Delivery[]> {
  return db.transaction(async (tx) => {
    const due = await tx
      .select({ id: notificationDeliveries.id })
      .from(notificationDeliveries)
      .where(and(eq(notificationDeliveries.status, 'pending'), lte(notificationDeliveries.nextAttemptAt, now)))
      .orderBy(asc(notificationDeliveries.nextAttemptAt))
      .limit(BATCH)
      .for('update', { skipLocked: true });
    if (due.length === 0) return [];
    const rows = await tx
      .select()
      .from(notificationDeliveries)
      .where(inArray(notificationDeliveries.id, due.map((row) => row.id)));
    await tx
      .update(notificationDeliveries)
      .set({ nextAttemptAt: new Date(now.getTime() + LEASE_MS) })
      .where(inArray(notificationDeliveries.id, due.map((row) => row.id)));
    return rows.map((row) => ({ ...row, attempts: row.attempts + 1 }));
  });
}

async function noticeOf(db: Db, submissionId: string): Promise<OrderNotice | null> {
  const [row] = await db
    .select({ id: submissions.id, siteId: submissions.siteId, kind: submissions.kind, data: submissions.data, siteName: sites.name })
    .from(submissions)
    .innerJoin(sites, eq(sites.id, submissions.siteId))
    .where(eq(submissions.id, submissionId));
  return row ? { submissionId: row.id, siteId: row.siteId, siteName: row.siteName, content: submissionContent(row) } : null;
}

async function buildNoticeOf(db: Db, jobId: string): Promise<BuildNotice | null> {
  const [row] = await db
    .select({ jobId: jobs.id, siteId: jobs.siteId, status: jobs.status, error: jobs.error, siteName: sites.name })
    .from(jobs)
    .innerJoin(sites, eq(sites.id, jobs.siteId))
    .where(eq(jobs.id, jobId));
  if (!row || (row.status !== 'done' && row.status !== 'failed' && row.status !== 'skipped')) return null;
  return { jobId: row.jobId, siteId: row.siteId, siteName: row.siteName, status: row.status, held: row.status === 'done' && row.error === 'held-for-review' };
}

/** The admins' message of a report or a held release; null once there is nothing to tell (a review already decided). */
async function adminMessageOf(db: Db, appUrl: string, delivery: Delivery): Promise<{ push: string; chat: string } | null> {
  if (delivery.reportId) {
    const [report] = await db.select().from(abuseReports).where(eq(abuseReports.id, delivery.reportId));
    if (!report) return null;
    const notice = { reportId: report.id, siteName: report.siteName, category: report.category, details: report.details };
    return { push: reportPushPayload(notice), chat: reportChatText(notice, appUrl) };
  }
  if (delivery.reviewSiteId) {
    const [site] = await db.select().from(sites).where(eq(sites.id, delivery.reviewSiteId));
    if (site?.status !== 'pending-review' || !site.pendingReview) return null;
    const notice = { siteId: site.id, siteName: site.name, reasons: site.pendingReview.reasons };
    return { push: reviewPushPayload(notice), chat: reviewChatText(notice, appUrl) };
  }
  return null;
}

/** The push payload and chat text of a delivery's order, build, report or review; null when it no longer exists. */
async function messageOf(db: Db, appUrl: string, delivery: Delivery): Promise<{ push: string; chat: string } | null> {
  if (delivery.submissionId) {
    const notice: OrderNotice | null = await noticeOf(db, delivery.submissionId);
    return notice ? { push: pushPayload(notice), chat: chatText(notice, appUrl) } : null;
  }
  if (delivery.jobId) {
    const notice = await buildNoticeOf(db, delivery.jobId);
    return notice ? { push: buildPushPayload(notice), chat: buildChatText(notice, appUrl) } : null;
  }
  return adminMessageOf(db, appUrl, delivery);
}

type Outcome = 'sent' | 'dropped';

/** Sends one delivery; throws DeliveryError (or anything else) when it did not go out. */
async function sendOne(db: Db, senders: Senders, appUrl: string, delivery: Delivery): Promise<Outcome> {
  const message = await messageOf(db, appUrl, delivery);
  if (!message) return 'dropped';
  if (delivery.channel === 'push') {
    if (!senders.push) return 'dropped';
    const [target] = await db.select().from(pushSubscriptions).where(eq(pushSubscriptions.id, delivery.target));
    if (!target) return 'dropped';
    if ((await senders.push.send(target, message.push)) === 'gone') {
      await db.delete(pushSubscriptions).where(eq(pushSubscriptions.id, target.id));
      return 'dropped';
    }
    return 'sent';
  }
  if (!senders.chat) return 'dropped';
  const chatId = Number(delivery.target);
  const [link] = await db
    .select()
    .from(chatLinks)
    .where(and(eq(chatLinks.accountId, delivery.accountId), eq(chatLinks.chatId, chatId)));
  if (!link) return 'dropped';
  if ((await senders.chat.send(chatId, message.chat, randomIdOf(delivery.id))) === 'gone') {
    await db.delete(chatLinks).where(and(eq(chatLinks.accountId, delivery.accountId), eq(chatLinks.chatId, chatId)));
    return 'dropped';
  }
  return 'sent';
}

/** One turn: every due delivery (a batch), each sent, retried later or given up on its own. */
export async function deliverDue(db: Db, senders: Senders, appUrl: string, now: Date, log: DeliveryLog): Promise<DeliveryResult> {
  const claimed = await claimDue(db, now);
  const result = { sent: 0, retrying: 0, dropped: 0, failed: 0 };
  for (const delivery of claimed) {
    const done = { attempts: delivery.attempts };
    try {
      const outcome = await sendOne(db, senders, appUrl, delivery);
      await db
        .update(notificationDeliveries)
        .set({ ...done, status: outcome, sentAt: outcome === 'sent' ? now : null, lastError: outcome === 'dropped' ? 'target-gone' : null })
        .where(eq(notificationDeliveries.id, delivery.id));
      result[outcome] += 1;
    } catch (error) {
      const code = error instanceof DeliveryError ? error.code : 'send-error';
      const giveUp = (error instanceof DeliveryError && error.permanent) || delivery.attempts >= MAX_ATTEMPTS;
      const delay = RETRY_DELAYS_MS[Math.min(delivery.attempts, RETRY_DELAYS_MS.length) - 1] ?? 0;
      await db
        .update(notificationDeliveries)
        .set(giveUp ? { ...done, status: 'failed', lastError: code } : { ...done, lastError: code, nextAttemptAt: new Date(now.getTime() + delay) })
        .where(eq(notificationDeliveries.id, delivery.id));
      log.warn(`${delivery.channel} delivery ${delivery.id} attempt ${delivery.attempts}: ${code}${giveUp ? ', given up' : ''}`);
      if (!(error instanceof DeliveryError)) log.warn(`  ${error instanceof Error ? error.message : String(error)}`);
      result[giveUp ? 'failed' : 'retrying'] += 1;
    }
  }
  return result;
}

export interface DeliveryLoop {
  /** Looks for due deliveries now (a new order was just stored). */
  wake(): void;
  stop(): Promise<void>;
}

/** Runs `deliverDue` every `pollMs`, and right away on `wake`; one turn at a time. */
export function startDeliveryLoop(deps: { db: Db; senders: Senders; appUrl: string; log: DeliveryLog; pollMs: number }): DeliveryLoop {
  let stopped = false;
  let running: Promise<void> | null = null;
  let again = false;
  const turn = (): void => {
    if (stopped) return;
    if (running) {
      again = true;
      return;
    }
    running = (async () => {
      try {
        let more = true;
        while (more && !stopped) {
          const result = await deliverDue(deps.db, deps.senders, deps.appUrl, new Date(), deps.log);
          // A full batch may have left more due rows behind.
          more = result.sent + result.retrying + result.dropped + result.failed >= BATCH;
        }
      } catch (error) {
        deps.log.warn(`delivery turn failed: ${error instanceof Error ? error.message : String(error)}`);
      } finally {
        running = null;
        if (again) {
          again = false;
          turn();
        }
      }
    })();
  };
  const timer = setInterval(turn, deps.pollMs);
  turn();
  return {
    wake: turn,
    async stop() {
      stopped = true;
      clearInterval(timer);
      await running;
    },
  };
}
