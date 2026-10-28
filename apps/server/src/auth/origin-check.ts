import type { RequestHandler } from 'express';
import { HttpError } from '../http-error';

const SAFE_METHODS = new Set(['GET', 'HEAD', 'OPTIONS']);

/**
 * CSRF defence alongside SameSite=Lax: every state-changing request must carry an `Origin` from the allow-list. A
 * missing Origin is rejected too — browsers always send it on cross-site POST.
 */
export function requireAllowedOrigin(allowedOrigins: readonly string[]): RequestHandler {
  const allowed = new Set(allowedOrigins);
  return (req, _res, next) => {
    if (SAFE_METHODS.has(req.method)) return next();
    const origin = req.headers.origin;
    if (!origin || !allowed.has(origin)) throw new HttpError(403, 'forbidden-origin');
    next();
  };
}
