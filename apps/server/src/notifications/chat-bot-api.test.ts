import { createServer, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { chatBotSender, chatDeepLink, verifyChatWebhook } from './chat-bot-api';
import { DeliveryError } from './senders';
import { isPushEndpoint } from './web-push-sender';

describe('chat webhook signature', () => {
  const body = Buffer.from('{"update_id":1}');
  const headers = { 'x-bot-api-secret-token': 'my_secret', 'x-bot-timestamp': '1760500000', 'x-bot-signature': 'v1=12ce7a96902e36f654800624244c841b5b6ce24b50f42f876fa551d508a6e8e1' };
  const at = 1760500000 * 1000;

  it('accepts the Bot API documentation vector', () => {
    expect(verifyChatWebhook('my_secret', headers, body, at)).toBe(true);
  });

  it('refuses a wrong secret, signature, body or an old timestamp', () => {
    expect(verifyChatWebhook('other', headers, body, at)).toBe(false);
    expect(verifyChatWebhook('my_secret', { ...headers, 'x-bot-api-secret-token': 'other' }, body, at)).toBe(false);
    expect(verifyChatWebhook('my_secret', { ...headers, 'x-bot-signature': 'v1=00' }, body, at)).toBe(false);
    expect(verifyChatWebhook('my_secret', headers, Buffer.from('{"update_id":2}'), at)).toBe(false);
    expect(verifyChatWebhook('my_secret', headers, body, at + 300_000)).toBe(false);
    expect(verifyChatWebhook('my_secret', { ...headers, 'x-bot-timestamp': undefined }, body, at)).toBe(false);
  });
});

describe('chat deep link', () => {
  it('follows https://chat.<domain>/b/<bot>?start=<param>', () => {
    expect(chatDeepLink({ url: 'https://chat.example.com', username: 'don_bot', token: '1:x', webhookSecret: 's' }, 'Ab_9-')).toBe('https://chat.example.com/b/don_bot?start=Ab_9-');
  });
});

describe('chat sender', () => {
  let server: Server;
  let url: string;
  const seen: { auth: string | undefined; body: unknown }[] = [];
  let answer = 200;

  beforeAll(async () => {
    server = createServer((req, res) => {
      let data = '';
      req.on('data', (chunk: Buffer) => (data += chunk.toString()));
      req.on('end', () => {
        seen.push({ auth: req.headers.authorization, body: JSON.parse(data) });
        res.writeHead(answer, { 'Content-Type': 'application/json' }).end('{}');
      });
    });
    await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
    url = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  });
  afterAll(() => new Promise<void>((resolve) => server.close(() => resolve())));

  it('posts the message with the token and random_id, and reads the answer', async () => {
    const sender = chatBotSender({ url, username: 'don_bot', token: '7:secret', webhookSecret: 's' });
    answer = 200;
    expect(await sender.send(42, 'Đơn mới', 99)).toBe('sent');
    expect(seen[0]).toEqual({ auth: 'Bearer 7:secret', body: { chat_id: 42, text: 'Đơn mới', random_id: 99, disable_link_preview: true } });
    answer = 403;
    expect(await sender.send(42, 'x', 1)).toBe('gone');
    answer = 400;
    await expect(sender.send(42, 'x', 1)).rejects.toMatchObject({ code: 'chat-400', permanent: true });
    answer = 503;
    await expect(sender.send(42, 'x', 1)).rejects.toMatchObject({ code: 'chat-503', permanent: false });
    const down = chatBotSender({ url: 'http://127.0.0.1:1', username: 'b', token: '1:x', webhookSecret: 's' });
    await expect(down.send(42, 'x', 1)).rejects.toBeInstanceOf(DeliveryError);
  });
});

describe('push endpoints', () => {
  it('accepts the browsers push services only', () => {
    for (const ok of ['https://fcm.googleapis.com/fcm/send/abc', 'https://updates.push.services.mozilla.com/wpush/v2/x', 'https://web.push.apple.com/QM', 'https://wns2-par02p.notify.windows.com/w/?token=x']) {
      expect(isPushEndpoint(ok), ok).toBe(true);
    }
    for (const bad of ['http://fcm.googleapis.com/x', 'https://127.0.0.1/x', 'https://evil.com/fcm.googleapis.com', 'https://fcm.googleapis.com:8443/x', 'https://push.apple.com.evil.com/x', 'not a url']) {
      expect(isPushEndpoint(bad), bad).toBe(false);
    }
  });
});
