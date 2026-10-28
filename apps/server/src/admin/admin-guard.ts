/**
 * Who may use the admin tools: the signed-in accounts whose IdP subject is listed in ADMIN_SUBS. Admin routes reach
 * any site, so they never go through `ownedSite`; this guard is their only gate, and it answers 404 like a route that
 * does not exist, so the tools cannot be found by probing.
 */
import { accounts, type Db } from '@webnhanh/db';
import { eq } from 'drizzle-orm';
import type { RequestHandler } from 'express';
import { readSessionToken, sessionAccount } from '../auth/session';
import type { ServerConfig } from '../config';
import { HttpError } from '../http-error';

/** What the app shows of an account's standing: admin tools, and whether an admin locked it. */
export interface AccountStanding {
  readonly admin: boolean;
  readonly locked: boolean;
}

export async function accountStanding(db: Db, config: Pick<ServerConfig, 'adminSubs'>, accountId: string): Promise<AccountStanding> {
  const [row] = await db.select({ sub: accounts.sub, lockedAt: accounts.lockedAt }).from(accounts).where(eq(accounts.id, accountId));
  return { admin: row !== undefined && config.adminSubs.includes(row.sub), locked: row?.lockedAt != null };
}

/**
 * Lets a signed-in admin through (the account on `res.locals.account`, as `requireAccount` leaves it); answers
 * everyone else 404, signed out included.
 */
export function requireAdmin(config: ServerConfig, db: Db): RequestHandler {
  return async (req, res, next) => {
    const token = readSessionToken(req, config);
    const account = token ? await sessionAccount(db, token, new Date()) : null;
    if (!account || !(await accountStanding(db, config, account.id)).admin) throw new HttpError(404, 'not-found');
    res.locals.account = account;
    next();
  };
}
