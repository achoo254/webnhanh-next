/**
 * The owner's inbox: what visitors sent from one site (orders of a shop, replies to a wedding invitation), the open
 * ones or all, and marking one handled or open again. Every route reaches the site through `ownedSite`.
 */
import { isUuid, submissionContent, submissions, type Db } from '@webnhanh/db';
import { and, count, desc, eq, inArray, isNull, lt, sql } from 'drizzle-orm';
import express, { type Router } from 'express';
import { accountOf, requireAccount } from '../auth/auth-routes';
import type { ServerConfig } from '../config';
import { HttpError } from '../http-error';
import { ownedSite } from '../sites/site-access';

/** Submissions per page of the inbox. */
export const ORDERS_PAGE = 50;

type SubmissionRow = typeof submissions.$inferSelect;

interface SubmissionBase {
  readonly id: string;
  readonly createdAt: string;
  readonly handledAt: string | null;
  readonly name: string;
  readonly phone: string;
  readonly note: string;
}

/** One submission as the inbox shows it, by its kind. */
export type OrderView =
  | (SubmissionBase & { readonly kind: 'order'; readonly address: string; readonly product: string; readonly quantity: number })
  | (SubmissionBase & { readonly kind: 'rsvp'; readonly attending: 'yes' | 'no'; readonly guests: number });

export function orderView(row: SubmissionRow): OrderView {
  const base = { id: row.id, createdAt: row.createdAt.toISOString(), handledAt: row.handledAt?.toISOString() ?? null };
  const content = submissionContent(row);
  if (content.kind === 'rsvp') {
    const d = content.data;
    return { ...base, kind: 'rsvp', name: d.name, phone: d.phone, note: d.note, attending: d.attending, guests: d.guests };
  }
  const d = content.data;
  return { ...base, kind: 'order', name: d.name, phone: d.phone, note: d.note, address: d.address, product: d.productName, quantity: d.quantity };
}

/** Replies to a wedding invitation, counted: who is coming (and how many people with them), who is not. */
export interface RsvpSummary {
  readonly yes: number;
  readonly guests: number;
  readonly no: number;
}

async function rsvpSummary(db: Db, siteId: string): Promise<RsvpSummary> {
  const rows = await db
    .select({
      attending: sql<string>`${submissions.data}->>'attending'`,
      n: count(),
      guests: sql<string>`coalesce(sum((${submissions.data}->>'guests')::int), 0)`,
    })
    .from(submissions)
    .where(and(eq(submissions.siteId, siteId), eq(submissions.kind, 'rsvp')))
    .groupBy(sql`${submissions.data}->>'attending'`);
  const yes = rows.find((row) => row.attending === 'yes');
  const no = rows.find((row) => row.attending === 'no');
  return { yes: Number(yes?.n ?? 0), guests: Number(yes?.guests ?? 0), no: Number(no?.n ?? 0) };
}

/** Orders not yet marked handled, per site. */
export async function openOrderCounts(db: Db, siteIds: readonly string[]): Promise<Map<string, number>> {
  if (siteIds.length === 0) return new Map();
  const rows = await db
    .select({ siteId: submissions.siteId, n: count() })
    .from(submissions)
    .where(and(inArray(submissions.siteId, [...siteIds]), isNull(submissions.handledAt)))
    .groupBy(submissions.siteId);
  return new Map(rows.map((row) => [row.siteId, Number(row.n)]));
}

export function orderRoutes(config: ServerConfig, db: Db): Router {
  const router = express.Router();
  const signedIn = requireAccount(config, db);
  const json = express.json({ limit: '4kb' });

  router.get('/api/sites/:siteId/orders', signedIn, async (req, res) => {
    const site = await ownedSite(db, accountOf(res.locals).id, req.params.siteId);
    const all = req.query.view === 'all';
    const before = typeof req.query.before === 'string' ? new Date(req.query.before) : null;
    if (before && Number.isNaN(before.getTime())) throw new HttpError(400, 'bad-request');
    const where = and(eq(submissions.siteId, site.id), all ? undefined : isNull(submissions.handledAt), before ? lt(submissions.createdAt, before) : undefined);
    const rows = await db
      .select()
      .from(submissions)
      .where(where)
      .orderBy(desc(submissions.createdAt), desc(submissions.id))
      .limit(ORDERS_PAGE + 1);
    const open = (await openOrderCounts(db, [site.id])).get(site.id) ?? 0;
    res.set('Cache-Control', 'no-store');
    const rsvp = site.template === 'wedding' ? await rsvpSummary(db, site.id) : null;
    res.json({
      site: { name: site.name, template: site.template, published: site.currentReleaseId !== null },
      orders: rows.slice(0, ORDERS_PAGE).map(orderView),
      more: rows.length > ORDERS_PAGE,
      open,
      rsvp,
    });
  });

  router.patch('/api/sites/:siteId/orders/:orderId', signedIn, json, async (req, res) => {
    const site = await ownedSite(db, accountOf(res.locals).id, req.params.siteId);
    const orderId = req.params.orderId;
    const handled: unknown = typeof req.body === 'object' && req.body !== null ? (req.body as { handled?: unknown }).handled : undefined;
    if (!isUuid(orderId)) throw new HttpError(404, 'not-found');
    if (typeof handled !== 'boolean') throw new HttpError(400, 'bad-request');
    const [row] = await db
      .update(submissions)
      .set({ handledAt: handled ? new Date() : null })
      .where(and(eq(submissions.id, orderId), eq(submissions.siteId, site.id)))
      .returning();
    if (!row) throw new HttpError(404, 'not-found');
    res.set('Cache-Control', 'no-store');
    res.json({ order: orderView(row) });
  });

  return router;
}
