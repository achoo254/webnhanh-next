import type { Db } from '@webnhanh/db';
import express, { type ErrorRequestHandler, type Express } from 'express';
import { rateLimit } from 'express-rate-limit';
import helmet from 'helmet';
import { reportRoutes } from './abuse/report-routes';
import { adminRoutes } from './admin/admin-routes';
import { authRoutes } from './auth/auth-routes';
import { developerRoutes } from './builds/developer-routes';
import { gitWebhookRoutes } from './builds/git-webhook';
import type { Fetcher } from './builds/repo-check';
import { requireAllowedOrigin } from './auth/origin-check';
import type { ServerConfig } from './config';
import { HttpError } from './http-error';
import { chatWebhookRoutes } from './notifications/chat-webhook';
import { notificationRoutes } from './notifications/notification-routes';
import { formRoutes } from './orders/form-routes';
import { orderRoutes } from './orders/order-routes';
import { siteRoutes } from './sites/site-routes';

export interface AppDeps {
  readonly config: ServerConfig;
  readonly db: Db;
  /** Called after a new order or abuse report is stored: the notification sender looks for due deliveries at once. */
  readonly onOrder?: () => void;
  /** HTTPS client of the repo check (GitHub, GitLab); tests replace it. */
  readonly fetcher?: Fetcher;
}

export function createApp({ config, db, onOrder = () => undefined, fetcher = (url, init) => fetch(url, init) }: AppDeps): Express {
  const app = express();
  app.disable('x-powered-by');
  // nginx in front (one hop): req.ip is the visitor, for the rate limits.
  app.set('trust proxy', 'loopback');
  app.use(helmet({ contentSecurityPolicy: false }));

  app.get('/healthz', (_req, res) => {
    res.type('text/plain').send('ok');
  });

  // Sign-in round trips per IP: generous, because mobile carriers and offices put many people behind one address.
  const signInLimit = rateLimit({ windowMs: 15 * 60_000, limit: 100, standardHeaders: 'draft-8', legacyHeaders: false });
  app.use(['/auth/login', '/auth/callback'], signInLimit);
  // Callers from elsewhere, each with checks of its own: visitors' orders from published sites (CORS by the site's
  // origin), the Chat bot's webhook (HMAC), and pushes from GitHub/GitLab (the site's webhook secret). Everything after
  // this takes requests from the app's origin only.
  app.use(formRoutes(config, db, onOrder));
  app.use(chatWebhookRoutes(config, db));
  app.use(gitWebhookRoutes(db));
  app.use(requireAllowedOrigin(config.allowedOrigins));
  app.use(authRoutes(config, db));
  // The public abuse report form posts from the app's own page (`/bao-cao`), without sign-in.
  app.use(reportRoutes(config, db, onOrder));
  app.use(adminRoutes(config, db));
  app.use(siteRoutes(config, db));
  app.use(developerRoutes(config, db, fetcher));
  app.use(orderRoutes(config, db));
  app.use(notificationRoutes(config, db));

  app.use('/api', (_req, _res, next) => next(new HttpError(404, 'not-found')));

  const errors: ErrorRequestHandler = (error, _req, res, _next) => {
    if (error instanceof HttpError) {
      res.status(error.status).json({ error: error.code, ...error.extra });
      return;
    }
    // body-parser: a body over its route's limit, or JSON that does not parse.
    const type = typeof error === 'object' && error !== null ? (error as { type?: unknown }).type : undefined;
    if (type === 'entity.too.large') {
      res.status(413).json({ error: 'too-large' });
      return;
    }
    if (type === 'entity.parse.failed') {
      res.status(400).json({ error: 'bad-request' });
      return;
    }
    console.error('request failed', error instanceof Error ? error.message : String(error));
    res.status(500).json({ error: 'server-error' });
  };
  app.use(errors);
  return app;
}
