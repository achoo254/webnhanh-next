/**
 * The admin API (`/api/admin/*`), for the accounts listed in ADMIN_SUBS only (`requireAdmin`, 404 to anyone else):
 * reports, releases held for review, a site by name, an account's sites, the audit log, and the actions (take down,
 * restore, approve, reject, lock, unlock, resolve, dismiss). Admin routes reach any account's site through
 * `admin-store.ts`, never through `ownedSite`.
 */
import type { Db } from '@webnhanh/db';
import express, { type RequestHandler, type Router } from 'express';
import { accountOf } from '../auth/auth-routes';
import type { ServerConfig } from '../config';
import { siteNameOf } from '../abuse/report-routes';
import { HttpError } from '../http-error';
import { requireAdmin } from './admin-guard';
import {
  accountSites,
  adminSite,
  adminSiteByName,
  closeOpenReport,
  decideReview,
  listActions,
  listReports,
  listReviews,
  restoreSite,
  setAccountLock,
  takeDownSite,
  type ActionInput,
} from './admin-store';

/** An admin's note on an action, kept in the audit log. */
export const NOTE_MAX = 500;

function body(req: express.Request): Record<string, unknown> {
  return typeof req.body === 'object' && req.body !== null && !Buffer.isBuffer(req.body) ? (req.body as Record<string, unknown>) : {};
}

function actionInput(req: express.Request, res: express.Response): ActionInput {
  const note = body(req).note;
  if (note !== undefined && note !== null && typeof note !== 'string') throw new HttpError(400, 'bad-request');
  const trimmed = typeof note === 'string' ? note.trim().slice(0, NOTE_MAX) : '';
  return { adminAccountId: accountOf(res.locals).id, note: trimmed === '' ? null : trimmed };
}

export function adminRoutes(config: ServerConfig, db: Db): Router {
  const router = express.Router();
  const json = express.json({ limit: '8kb' });
  const noStore: RequestHandler = (_req, res, next) => {
    res.set('Cache-Control', 'no-store');
    next();
  };
  // The guard comes first on every admin path: nobody else learns which admin routes exist.
  router.use('/api/admin', requireAdmin(config, db), noStore);

  router.get('/api/admin/reports', async (req, res) => {
    res.json({ reports: await listReports(db, req.query.status === 'all' ? 'all' : 'open') });
  });

  router.get('/api/admin/reviews', async (_req, res) => {
    res.json({ sites: await listReviews(db) });
  });

  router.get('/api/admin/actions', async (_req, res) => {
    res.json({ actions: await listActions(db) });
  });

  router.get('/api/admin/sites', async (req, res) => {
    // A name, its address or a link to any of its pages, like the report form takes.
    const name = typeof req.query.name === 'string' ? siteNameOf(req.query.name) : null;
    if (!name) throw new HttpError(400, 'name-format');
    res.json({ site: await adminSiteByName(db, name) });
  });

  router.get('/api/admin/sites/:siteId', async (req, res) => {
    const site = await adminSite(db, req.params.siteId);
    res.json({ site, accountSites: await accountSites(db, site.accountId) });
  });

  router.post('/api/admin/sites/:siteId/takedown', json, async (req, res) => {
    const reportId = body(req).reportId;
    if (reportId !== undefined && reportId !== null && typeof reportId !== 'string') throw new HttpError(400, 'bad-request');
    const action = await takeDownSite(db, { ...actionInput(req, res), siteId: req.params.siteId, reportId: reportId ?? null }, new Date());
    res.status(202).json({ action });
  });

  router.post('/api/admin/sites/:siteId/restore', json, async (req, res) => {
    res.status(202).json({ action: await restoreSite(db, { ...actionInput(req, res), siteId: req.params.siteId }, new Date()) });
  });

  for (const decision of ['approve', 'reject'] as const) {
    router.post(`/api/admin/sites/:siteId/${decision}`, json, async (req, res) => {
      res.status(202).json({ action: await decideReview(db, { ...actionInput(req, res), siteId: req.params.siteId, decision }, new Date()) });
    });
  }

  for (const [path, lock] of [['lock', true], ['unlock', false]] as const) {
    router.post(`/api/admin/accounts/:accountId/${path}`, json, async (req, res) => {
      res.json({ action: await setAccountLock(db, { ...actionInput(req, res), accountId: req.params.accountId, lock }, new Date()) });
    });
  }

  for (const [path, status] of [['resolve', 'resolved'], ['dismiss', 'dismissed']] as const) {
    router.post(`/api/admin/reports/:reportId/${path}`, json, async (req, res) => {
      res.json({ action: await closeOpenReport(db, { ...actionInput(req, res), reportId: req.params.reportId, status }, new Date()) });
    });
  }

  return router;
}
