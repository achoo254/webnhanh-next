/**
 * The owner's notification settings: which channels the server offers, Web Push subscriptions of this device, and
 * linking the Chat app (a one-time code in the bot's deep link; the bot's webhook completes the link).
 */
import { createHash, randomBytes, randomUUID } from 'node:crypto';
import { CHAT_LINK_CODE_MS, chatLinkCodes, chatLinks, pushSubscriptions, type Db } from '@webnhanh/db';
import { and, eq } from 'drizzle-orm';
import express, { type Router } from 'express';
import { rateLimit } from 'express-rate-limit';
import { z } from 'zod';
import { accountOf, requireAccount } from '../auth/auth-routes';
import type { ServerConfig } from '../config';
import { HttpError } from '../http-error';
import { chatDeepLink } from './chat-bot-api';
import { isPushEndpoint } from './web-push-sender';

/** Devices one account may register for push. */
export const MAX_PUSH_DEVICES = 10;

const subscriptionSchema = z.object({
  endpoint: z.string().max(1000).refine(isPushEndpoint, 'push-endpoint'),
  keys: z.object({
    p256dh: z.string().regex(/^[A-Za-z0-9_-]{80,100}={0,2}$/),
    auth: z.string().regex(/^[A-Za-z0-9_-]{16,32}={0,2}$/),
  }),
});

/** Stored as sha256 like session tokens: a database leak hands out no live link code. */
export function hashLinkCode(code: string): string {
  return createHash('sha256').update(code).digest('hex');
}

/** Link codes are base64url of 24 bytes: within the deep link's 64 characters of A-Z a-z 0-9 _ -. */
export const LINK_CODE_SHAPE = /^[A-Za-z0-9_-]{32}$/;

export function notificationRoutes(config: ServerConfig, db: Db): Router {
  const router = express.Router();
  const signedIn = requireAccount(config, db);
  const json = express.json({ limit: '4kb' });
  const linkLimit = rateLimit({
    windowMs: 10 * 60_000,
    limit: 10,
    standardHeaders: 'draft-8',
    legacyHeaders: false,
    keyGenerator: (_req, res) => accountOf(res.locals).id,
    handler: (_req, _res, next) => next(new HttpError(429, 'too-many-requests')),
  });
  router.use(['/api/notifications', '/api/push', '/api/chat'], (_req, res, next) => {
    res.set('Cache-Control', 'no-store');
    next();
  });

  router.get('/api/notifications', signedIn, async (_req, res) => {
    const account = accountOf(res.locals);
    const [link] = config.chatBot ? await db.select({ chatId: chatLinks.chatId }).from(chatLinks).where(eq(chatLinks.accountId, account.id)) : [];
    res.json({ push: config.push ? { publicKey: config.push.publicKey } : null, chat: config.chatBot ? { linked: link !== undefined } : null });
  });

  router.post('/api/push/subscriptions', signedIn, json, async (req, res) => {
    if (!config.push) throw new HttpError(404, 'push-off');
    const account = accountOf(res.locals);
    const parsed = subscriptionSchema.safeParse(typeof req.body === 'object' && req.body !== null ? (req.body as { subscription?: unknown }).subscription : undefined);
    if (!parsed.success) throw new HttpError(400, 'bad-subscription');
    const { endpoint, keys } = parsed.data;
    const mine = await db.select({ id: pushSubscriptions.id, endpoint: pushSubscriptions.endpoint }).from(pushSubscriptions).where(eq(pushSubscriptions.accountId, account.id));
    if (mine.length >= MAX_PUSH_DEVICES && !mine.some((s) => s.endpoint === endpoint)) throw new HttpError(409, 'too-many-devices');
    // One endpoint is one browser: whoever signed in on it last gets its notifications.
    await db
      .insert(pushSubscriptions)
      .values({ id: randomUUID(), accountId: account.id, endpoint, p256dh: keys.p256dh, auth: keys.auth, createdAt: new Date() })
      .onConflictDoUpdate({ target: pushSubscriptions.endpoint, set: { accountId: account.id, p256dh: keys.p256dh, auth: keys.auth } });
    res.status(204).end();
  });

  router.delete('/api/push/subscriptions', signedIn, json, async (req, res) => {
    const endpoint: unknown = typeof req.body === 'object' && req.body !== null ? (req.body as { endpoint?: unknown }).endpoint : undefined;
    if (typeof endpoint !== 'string') throw new HttpError(400, 'bad-request');
    await db.delete(pushSubscriptions).where(and(eq(pushSubscriptions.accountId, accountOf(res.locals).id), eq(pushSubscriptions.endpoint, endpoint)));
    res.status(204).end();
  });

  router.post('/api/chat/link', signedIn, linkLimit, async (_req, res) => {
    if (!config.chatBot) throw new HttpError(404, 'chat-off');
    const account = accountOf(res.locals);
    const code = randomBytes(24).toString('base64url');
    const now = new Date();
    // One live code per account: a new one replaces the last.
    await db.transaction(async (tx) => {
      await tx.delete(chatLinkCodes).where(eq(chatLinkCodes.accountId, account.id));
      await tx.insert(chatLinkCodes).values({ codeHash: hashLinkCode(code), accountId: account.id, expiresAt: new Date(now.getTime() + CHAT_LINK_CODE_MS), createdAt: now });
    });
    res.json({ url: chatDeepLink(config.chatBot, code), expiresAt: new Date(now.getTime() + CHAT_LINK_CODE_MS).toISOString() });
  });

  router.delete('/api/chat/link', signedIn, async (_req, res) => {
    await db.delete(chatLinks).where(eq(chatLinks.accountId, accountOf(res.locals).id));
    res.status(204).end();
  });

  return router;
}
