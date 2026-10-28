import { createHash, randomBytes } from 'node:crypto';
import type { IncomingMessage } from 'node:http';
import { accounts, SESSION_ABSOLUTE_MS, SESSION_IDLE_MS, sessions, type Db } from '@trang/db';
import { eq, lt, lte, or, sql } from 'drizzle-orm';
import type { CookieOptions, Response } from 'express';
import type { ServerConfig } from '../config';

/** Refresh `last_seen_at` at most this often to avoid a write on every request. */
const TOUCH_INTERVAL_MS = 60 * 1000;

/** Only the sha256 of the session token is stored, so a database leak does not hand out live sessions. */
export function hashToken(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}

export interface Account {
  readonly id: string;
  readonly createdAt: Date;
}

/** The account of an IdP subject, created on its first sign-in. */
export async function accountForSub(db: Db, sub: string, now: Date): Promise<string> {
  const [row] = await db
    .insert(accounts)
    .values({ sub, createdAt: now })
    .onConflictDoUpdate({ target: accounts.sub, set: { sub: sql`excluded.sub` } })
    .returning({ id: accounts.id });
  if (!row) throw new Error('account upsert returned no row');
  return row.id;
}

/** Opens a session; returns the opaque token for the cookie (never stored). */
export async function createSession(db: Db, accountId: string, now: Date): Promise<string> {
  const token = randomBytes(32).toString('base64url');
  await db.insert(sessions).values({
    id: hashToken(token),
    accountId,
    createdAt: now,
    lastSeenAt: now,
    expiresAt: new Date(now.getTime() + SESSION_ABSOLUTE_MS),
  });
  return token;
}

/** The account of a live session, or null. An expired session (absolute or idle) is deleted. */
export async function sessionAccount(db: Db, token: string, now: Date): Promise<Account | null> {
  const id = hashToken(token);
  const [row] = await db
    .select({ session: sessions, account: { id: accounts.id, createdAt: accounts.createdAt } })
    .from(sessions)
    .innerJoin(accounts, eq(accounts.id, sessions.accountId))
    .where(eq(sessions.id, id));
  if (!row) return null;
  const { session, account } = row;
  if (session.expiresAt.getTime() <= now.getTime() || now.getTime() - session.lastSeenAt.getTime() > SESSION_IDLE_MS) {
    await db.delete(sessions).where(eq(sessions.id, id));
    return null;
  }
  if (now.getTime() - session.lastSeenAt.getTime() > TOUCH_INTERVAL_MS) {
    await db.update(sessions).set({ lastSeenAt: now }).where(eq(sessions.id, id));
  }
  return account;
}

export async function deleteSession(db: Db, token: string): Promise<void> {
  await db.delete(sessions).where(eq(sessions.id, hashToken(token)));
}

/**
 * Deletes every session that expired or went unused for SESSION_IDLE_MS. Run on each sign-in: there is no
 * background worker yet, and sign-ins are rare enough for the extra delete to cost nothing.
 */
export async function pruneSessions(db: Db, now: Date): Promise<void> {
  await db.delete(sessions).where(or(lte(sessions.expiresAt, now), lt(sessions.lastSeenAt, new Date(now.getTime() - SESSION_IDLE_MS))));
}

/**
 * Production uses the `__Host-` prefix, which browsers only accept with `Secure`, `Path=/` and no `Domain`. Dev
 * runs over plain http on localhost, where a Secure cookie would be dropped by some browsers.
 */
export function sessionCookieName(config: Pick<ServerConfig, 'nodeEnv'>): string {
  return config.nodeEnv === 'production' ? '__Host-trang_session' : 'trang_session';
}

function cookieOptions(config: Pick<ServerConfig, 'nodeEnv'>): CookieOptions {
  return { httpOnly: true, secure: config.nodeEnv === 'production', sameSite: 'lax', path: '/' };
}

export function setSessionCookie(res: Response, config: Pick<ServerConfig, 'nodeEnv'>, token: string): void {
  res.cookie(sessionCookieName(config), token, { ...cookieOptions(config), maxAge: SESSION_ABSOLUTE_MS });
}

export function clearSessionCookie(res: Response, config: Pick<ServerConfig, 'nodeEnv'>): void {
  res.clearCookie(sessionCookieName(config), cookieOptions(config));
}

/** One cookie of the request's Cookie header, or undefined (no parser dependency for two cookies). */
export function readCookie(req: Pick<IncomingMessage, 'headers'>, name: string): string | undefined {
  for (const part of (req.headers.cookie ?? '').split(';')) {
    const eq = part.indexOf('=');
    if (eq >= 0 && part.slice(0, eq).trim() === name) return part.slice(eq + 1).trim();
  }
  return undefined;
}

/** Tokens are base64url of 32 bytes; anything else is not ours. */
const TOKEN_SHAPE = /^[A-Za-z0-9_-]{43}$/;

export function readSessionToken(req: Pick<IncomingMessage, 'headers'>, config: Pick<ServerConfig, 'nodeEnv'>): string | null {
  const value = readCookie(req, sessionCookieName(config));
  return value && TOKEN_SHAPE.test(value) ? value : null;
}
