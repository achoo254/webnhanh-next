/**
 * `POST /api/reports`: the public abuse report form (`/bao-cao` in the web app), no sign-in. It guards itself like the
 * order form: a hidden field bots fill (thanked, nothing stored), a minimum time to fill the form (measured by the
 * page), a rate limit per IP, every field checked, and only sites that exist. A report is stored with its notices
 * to the admins (Chat, Web Push) in one transaction; nothing about the sender is kept but the contact they chose to
 * give.
 */
import { randomUUID } from 'node:crypto';
import { ABUSE_CATEGORIES, abuseReports, queueAdminNotices, SITE_NAME_PATTERN, sites, SITES_DOMAIN, type Db } from '@webnhanh/db';
import { eq } from 'drizzle-orm';
import express, { type Router } from 'express';
import { rateLimit } from 'express-rate-limit';
import { z } from 'zod';
import type { ServerConfig } from '../config';
import { HttpError } from '../http-error';

/** Less than this between the first touch of the form and sending it is a bot. */
export const MIN_REPORT_FILL_MS = 3_000;
export const DETAILS_MIN = 10;
export const DETAILS_MAX = 2_000;
export const CONTACT_MAX = 200;

const reportSchema = z.object({
  site: z.string().max(300),
  category: z.enum(ABUSE_CATEGORIES),
  details: z.string().trim().min(DETAILS_MIN).max(DETAILS_MAX),
  contact: z.string().trim().max(CONTACT_MAX).optional(),
  /** The hidden trap field. */
  website: z.string().max(300).optional(),
  /** Milliseconds from the first touch of the form to sending it. */
  elapsed: z.number().int().min(0).max(86_400_000).optional(),
});

/**
 * The site name in what the reporter typed: a name, `name.hoandat.io.vn`, or a link to any page of it. Null when it
 * is none of these.
 */
export function siteNameOf(input: string): string | null {
  let text = input.trim().toLowerCase();
  if (/^[a-z][a-z0-9+.-]*:\/\//.test(text)) {
    try {
      text = new URL(text).hostname;
    } catch {
      return null;
    }
  } else {
    text = text.split(/[/?#]/)[0] ?? '';
  }
  const suffix = `.${SITES_DOMAIN}`;
  const name = text.endsWith(suffix) ? text.slice(0, -suffix.length) : text;
  return SITE_NAME_PATTERN.test(name) ? name : null;
}

export function reportRoutes(config: ServerConfig, db: Db, onReport: () => void): Router {
  const router = express.Router();
  const perIp = rateLimit({
    windowMs: 60 * 60_000,
    limit: config.reportsPerIp,
    standardHeaders: 'draft-8',
    legacyHeaders: false,
    handler: (_req, _res, next) => next(new HttpError(429, 'too-many-requests')),
  });

  router.post('/api/reports', express.json({ limit: '16kb' }), perIp, async (req, res) => {
    res.set('Cache-Control', 'no-store');
    const parsed = reportSchema.safeParse(req.body);
    if (!parsed.success) {
      const fields = [...new Set(parsed.error.issues.map((issue) => String(issue.path[0] ?? '')))].filter(Boolean);
      throw new HttpError(422, 'invalid', { fields });
    }
    const input = parsed.data;
    // A filled trap: thanked like anyone, and nothing is stored, so the bot learns nothing.
    if (input.website) {
      res.status(201).json({ ok: true });
      return;
    }
    if (input.elapsed !== undefined && input.elapsed < MIN_REPORT_FILL_MS) throw new HttpError(422, 'too-fast');
    const name = siteNameOf(input.site);
    if (!name) throw new HttpError(422, 'invalid', { fields: ['site'] });
    const [site] = await db.select({ id: sites.id }).from(sites).where(eq(sites.name, name));
    if (!site) throw new HttpError(404, 'report-site-unknown');

    const now = new Date();
    await db.transaction(async (tx) => {
      const id = randomUUID();
      await tx.insert(abuseReports).values({
        id,
        siteId: site.id,
        siteName: name,
        category: input.category,
        details: input.details,
        contact: input.contact ? input.contact : null,
        status: 'open',
        createdAt: now,
      });
      await queueAdminNotices(tx, config.adminSubs, { reportId: id }, now);
    });
    onReport();
    res.status(201).json({ ok: true });
  });

  return router;
}
