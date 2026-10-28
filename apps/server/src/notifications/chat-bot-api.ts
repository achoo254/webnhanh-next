/**
 * The Chat app's Bot API (chat-next docs/bot-api): sending a message, checking the signature of a webhook update,
 * and the deep link that starts the bot with a parameter.
 */
import { createHmac, timingSafeEqual } from 'node:crypto';
import type { ChatBotConfig } from '../config';
import { DeliveryError, type ChatSender } from './senders';

/** `https://chat.<domain>/b/<bot>?start=<param>`: the app opens the bot and sends `/start <param>` for the person. */
export function chatDeepLink(config: ChatBotConfig, startParam: string): string {
  return `${config.url}/b/${encodeURIComponent(config.username)}?start=${encodeURIComponent(startParam)}`;
}

/** Updates signed longer ago than this are refused (replays). */
const MAX_SKEW_SECONDS = 300;

function same(got: unknown, want: string): boolean {
  const a = Buffer.from(typeof got === 'string' ? got : '');
  const b = Buffer.from(want);
  return a.length === b.length && timingSafeEqual(a, b);
}

/**
 * True when a webhook request carries our secret and a fresh `v1=` HMAC-SHA256 of `timestamp.body`, compared in
 * constant time.
 */
export function verifyChatWebhook(secret: string, headers: Readonly<Record<string, unknown>>, rawBody: Buffer, nowMs: number): boolean {
  const ts = typeof headers['x-bot-timestamp'] === 'string' ? headers['x-bot-timestamp'] : '';
  if (!/^\d{1,12}$/.test(ts) || Math.abs(nowMs / 1000 - Number(ts)) >= MAX_SKEW_SECONDS) return false;
  const want = `v1=${createHmac('sha256', secret).update(`${ts}.`).update(rawBody).digest('hex')}`;
  // Both compared, always: no early exit tells which one was wrong.
  const secretOk = same(headers['x-bot-api-secret-token'], secret);
  const signatureOk = same(headers['x-bot-signature'], want);
  return secretOk && signatureOk;
}

export function chatBotSender(config: ChatBotConfig): ChatSender {
  return {
    async send(chatId, text, randomId) {
      let res: Response;
      try {
        res = await fetch(`${config.url}/bot/v1/messages`, {
          method: 'POST',
          headers: { Authorization: `Bearer ${config.token}`, 'Content-Type': 'application/json' },
          body: JSON.stringify({ chat_id: chatId, text, random_id: randomId, disable_link_preview: true }),
          signal: AbortSignal.timeout(10_000),
        });
      } catch {
        throw new DeliveryError('chat-network', false);
      }
      await res.body?.cancel();
      if (res.ok) return 'sent';
      // 403: the person blocked or never started the bot; the link is no use any more.
      if (res.status === 403) return 'gone';
      if (res.status === 400 || res.status === 404) throw new DeliveryError(`chat-${res.status}`, true);
      // 401 (a wrong token in the env), 429, 5xx: retried, so fixing the env or waiting recovers.
      throw new DeliveryError(`chat-${res.status}`, false);
    },
  };
}
