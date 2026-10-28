/**
 * `POST /hooks/chat`: updates of the order bot from the Chat app (its webhook). Every request must carry the
 * webhook secret and a fresh HMAC (`verifyChatWebhook`). In a private chat:
 *
 * - `/start <code>`: the one-time code from "Nhận báo đơn qua Chat" links this chat to the account that made it;
 * - `/stop`: unlinks the chat;
 * - anything else: a short how-to.
 *
 * The reply rides in the response (`sendMessage` method), so a webhook needs no call back to the Bot API. Handling
 * is idempotent: an update delivered twice finds its code already used and changes nothing.
 */
import { CHAT_LINK_CODE_MS, chatLinkCodes, chatLinks, type Db } from '@trang/db';
import { and, eq, gt } from 'drizzle-orm';
import express, { type Router } from 'express';
import brandConfig from '../../../../brand.config.json';
import type { ServerConfig } from '../config';
import { verifyChatWebhook } from './chat-bot-api';
import { hashLinkCode, LINK_CODE_SHAPE } from './notification-routes';

interface PrivateText {
  readonly chatId: number;
  readonly text: string;
}

/** The chat id and text of a message in a private chat, or null for every other update. */
export function privateText(update: unknown): PrivateText | null {
  if (typeof update !== 'object' || update === null) return null;
  const message = (update as { message?: unknown }).message;
  if (typeof message !== 'object' || message === null) return null;
  const { chat, text } = message as { chat?: unknown; text?: unknown };
  if (typeof chat !== 'object' || chat === null || typeof text !== 'string') return null;
  const { id, type } = chat as { id?: unknown; type?: unknown };
  if (type !== 'private' || typeof id !== 'number' || !Number.isSafeInteger(id) || id <= 0) return null;
  return { chatId: id, text: text.trim() };
}

const HOW_TO = `Mở ${brandConfig.appName}, vào Đơn hàng của trang rồi bấm "Nhận báo đơn qua Chat" để nhận tin khi có đơn mới.`;

/** What the bot answers `message`, after doing what it asks. */
async function handle(db: Db, message: PrivateText, now: Date): Promise<string> {
  const [command, argument = ''] = message.text.split(/\s+/, 2);
  if (command === '/stop') {
    const removed = await db.delete(chatLinks).where(eq(chatLinks.chatId, message.chatId)).returning({ accountId: chatLinks.accountId });
    return removed.length > 0 ? 'Đã tắt báo đơn qua Chat. Bật lại bất cứ lúc nào trong app.' : HOW_TO;
  }
  if (command !== '/start' || !LINK_CODE_SHAPE.test(argument)) return HOW_TO;
  const linked = await db.transaction(async (tx) => {
    const [code] = await tx
      .delete(chatLinkCodes)
      .where(and(eq(chatLinkCodes.codeHash, hashLinkCode(argument)), gt(chatLinkCodes.expiresAt, now)))
      .returning({ accountId: chatLinkCodes.accountId });
    if (!code) return false;
    await tx
      .insert(chatLinks)
      .values({ accountId: code.accountId, chatId: message.chatId, createdAt: now })
      .onConflictDoUpdate({ target: chatLinks.accountId, set: { chatId: message.chatId, createdAt: now } });
    return true;
  });
  if (!linked) return `Mã này đã dùng hoặc đã quá ${CHAT_LINK_CODE_MS / 60_000} phút. ${HOW_TO}`;
  return 'Đã bật báo đơn. Mỗi khi có đơn mới, bạn sẽ nhận tin ở đây. Gõ /stop để tắt.';
}

export function chatWebhookRoutes(config: ServerConfig, db: Db): Router {
  const router = express.Router();
  router.post('/hooks/chat', express.raw({ type: () => true, limit: '64kb' }), async (req, res) => {
    const bot = config.chatBot;
    if (!bot) {
      res.status(404).json({ error: 'not-found' });
      return;
    }
    const raw: unknown = req.body;
    if (!Buffer.isBuffer(raw) || !verifyChatWebhook(bot.webhookSecret, req.headers, raw, Date.now())) {
      res.status(401).json({ error: 'unauthorized' });
      return;
    }
    let update: unknown;
    try {
      update = JSON.parse(raw.toString('utf8'));
    } catch {
      res.status(400).json({ error: 'bad-request' });
      return;
    }
    const message = privateText(update);
    if (!message) {
      res.json({});
      return;
    }
    const text = await handle(db, message, new Date());
    res.json({ method: 'sendMessage', chat_id: message.chatId, text });
  });
  return router;
}
