/**
 * `POST /f/<site>`: what visitors send from the form of a published page (https://<site>.hoandat.io.vn): an order
 * from a shop page, or a reply ("Xác nhận tham dự") from a wedding invitation (`kind=rsvp`). Public, so it guards
 * itself: only the site's own origin (CORS, and refused when a browser says it came from elsewhere), the page's
 * signed token, a hidden field bots fill, a minimum time to fill the form (measured by the page's script), rate
 * limits per IP and per site, and every field checked. A site whose live page has no form of that kind, and unknown,
 * unpublished, taken-down or renamed-away sites, answer 404. Mounted before the app's own Origin check: the visitor's origin is
 * the site, not the app.
 */
import { SITE_NAME_PATTERN, siteOrigin, sites, verifyFormToken, type Db, type SubmissionContent } from '@webnhanh/db';
import { ORDER_FIELDS, orderInputSchema, orderIssueFields, RSVP_FIELDS, RSVP_KIND, rsvpInputSchema, rsvpIssueFields } from '@webnhanh/templates';
import { and, eq, inArray, isNotNull } from 'drizzle-orm';
import express, { type Request, type RequestHandler, type Response, type Router } from 'express';
import { rateLimit } from 'express-rate-limit';
import type { ServerConfig } from '../config';
import type { Site } from '../sites/site-access';
import { sendFormOutcome, type FormField, type FormKind, type FormOutcome } from './form-response';
import { recordSubmission } from './order-store';

/** Less than this from the first touch of the form to sending it is a bot, or a person asked to look again. */
export const MIN_FILL_MS = 3_000;

/** The published site the form posts for, kept for the handlers after it. */
function siteOf(res: Response): Site {
  return res.locals.orderSite as Site;
}

function field(body: unknown, name: string): string | undefined {
  const value = typeof body === 'object' && body !== null ? (body as Record<string, unknown>)[name] : undefined;
  return typeof value === 'string' ? value : undefined;
}

/** What the form says it sends (an order unless `kind=rsvp`); the body is parsed before anything answers. */
function kindOf(req: Request): FormKind {
  return field(req.body, RSVP_FIELDS.kind) === RSVP_KIND ? 'rsvp' : 'order';
}

/** The submission checked for its kind, or the fields to fix (an order of a product the page does not offer: `product`). */
function readSubmission(kind: FormKind, body: unknown, site: Site): { ok: true; content: SubmissionContent } | { ok: false; fields: FormField[] } {
  if (kind === 'rsvp') {
    const parsed = rsvpInputSchema.safeParse({
      kind: field(body, RSVP_FIELDS.kind),
      name: field(body, RSVP_FIELDS.name) ?? '',
      phone: field(body, RSVP_FIELDS.phone),
      attending: field(body, RSVP_FIELDS.attending) ?? '',
      guests: field(body, RSVP_FIELDS.guests) || undefined,
      note: field(body, RSVP_FIELDS.note),
    });
    if (!parsed.success) return { ok: false, fields: rsvpIssueFields(parsed.error) };
    const { name, phone, attending, guests, note } = parsed.data;
    // Someone who is not coming brings nobody.
    return { ok: true, content: { kind: 'rsvp', data: { name, phone, attending, guests: attending === 'yes' ? guests : 0, note } } };
  }
  const parsed = orderInputSchema.safeParse({
    name: field(body, ORDER_FIELDS.name) ?? '',
    phone: field(body, ORDER_FIELDS.phone) ?? '',
    address: field(body, ORDER_FIELDS.address) ?? '',
    product: field(body, ORDER_FIELDS.product) ?? '',
    quantity: field(body, ORDER_FIELDS.quantity) ?? '',
    note: field(body, ORDER_FIELDS.note),
  });
  if (!parsed.success) return { ok: false, fields: orderIssueFields(parsed.error) };
  const input = parsed.data;
  const product = site.orderForm?.products.find((p) => p.key === input.product);
  if (!product) return { ok: false, fields: ['product'] };
  return {
    ok: true,
    content: {
      kind: 'order',
      data: { name: input.name, phone: input.phone, address: input.address, productKey: product.key, productName: product.name, quantity: input.quantity, note: input.note },
    },
  };
}

/** Whether the live page of `site` has a form for `kind`. */
function takes(site: Site, kind: FormKind): boolean {
  return kind === 'rsvp' ? site.orderForm?.rsvp === true : (site.orderForm?.products.length ?? 0) > 0;
}

export function formRoutes(config: ServerConfig, db: Db, onOrder: () => void): Router {
  const router = express.Router();
  const form = express.urlencoded({ extended: false, limit: '16kb', parameterLimit: 20 });
  const tooMany: RequestHandler = (req, res) => sendFormOutcome(req, res, 429, 'too-many-requests', { kind: kindOf(req) });

  const perIp = rateLimit({ windowMs: 10 * 60_000, limit: config.orderLimits.perIp, standardHeaders: 'draft-8', legacyHeaders: false, handler: tooMany });
  const perSite = rateLimit({
    windowMs: 60 * 60_000,
    limit: config.orderLimits.perSite,
    standardHeaders: 'draft-8',
    legacyHeaders: false,
    keyGenerator: (_req, res) => siteOf(res).id,
    handler: tooMany,
  });

  /**
   * Finds the published site, then lets in only its own origin (and form posts that name none). Runs before the rate
   * limits so that their answers carry the CORS header too and the page can show them.
   */
  const publishedSite: RequestHandler = async (req, res, next) => {
    const name = String(req.params.site ?? '');
    const [site] = SITE_NAME_PATTERN.test(name)
      ? await db
          .select()
          .from(sites)
          // A site whose next release waits for review still has its live page, and that page takes orders.
          .where(and(eq(sites.name, name), inArray(sites.status, ['published', 'pending-review']), isNotNull(sites.currentReleaseId), isNotNull(sites.orderForm)))
      : [];
    const kind = kindOf(req);
    if (!site) return sendFormOutcome(req, res, 404, 'not-found', { kind });
    const origin = req.get('origin');
    if (origin !== undefined && origin !== siteOrigin(site.name)) return sendFormOutcome(req, res, 403, 'forbidden-origin', { kind });
    res.set({ 'Access-Control-Allow-Origin': siteOrigin(site.name), Vary: 'Origin' });
    res.locals.orderSite = site;
    next();
  };

  // The page's script sends a simple request (form body, Accept only), but a browser that asks first gets an answer.
  router.options('/f/:site', publishedSite, (_req, res) => {
    res.set({ 'Access-Control-Allow-Methods': 'POST', 'Access-Control-Allow-Headers': 'Accept, Content-Type', 'Access-Control-Max-Age': '600' });
    res.status(204).end();
  });

  // The body is read first, so that every answer (the rate limits' too) is worded for an order or a reply.
  router.post('/f/:site', form, publishedSite, perIp, perSite, async (req: Request, res: Response) => {
    const site = siteOf(res);
    const body: unknown = req.body;
    const kind = kindOf(req);
    const reply = (status: number, outcome: FormOutcome, fields?: readonly FormField[]): void =>
      sendFormOutcome(req, res, status, outcome, { kind, siteName: site.name, fields });

    if (!takes(site, kind)) return reply(404, 'not-found');
    // A filled trap: thanked like anyone, and nothing is stored, so the bot learns nothing.
    if (field(body, ORDER_FIELDS.honeypot)) return reply(200, 'sent');
    if (!verifyFormToken(config.formSecret, site.id, field(body, ORDER_FIELDS.token), new Date())) return reply(400, 'stale-page');
    const elapsed = field(body, ORDER_FIELDS.elapsed);
    if (elapsed && /^\d{1,9}$/.test(elapsed) && Number(elapsed) < MIN_FILL_MS) return reply(422, 'too-fast');

    const submission = readSubmission(kind, body, site);
    if (!submission.ok) return reply(422, 'invalid', submission.fields);
    try {
      await recordSubmission(db, { siteId: site.id, accountId: site.accountId, content: submission.content }, { push: config.push !== null, chat: config.chatBot !== null }, new Date());
    } catch (error) {
      console.error(`${kind} not stored`, error instanceof Error ? error.message : String(error));
      return reply(500, 'server-error');
    }
    onOrder();
    reply(201, 'sent');
  });

  return router;
}
