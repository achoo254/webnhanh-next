/** Web Push through the `web-push` library (VAPID, RFC 8291 encryption). */
import webpush from 'web-push';
import type { PushConfig } from '../config';
import { DeliveryError, type PushSender } from './senders';

/** A new order is worth a day; after that the push service may drop it. */
const TTL_SECONDS = 24 * 60 * 60;

function statusOf(error: unknown): number | null {
  const status = typeof error === 'object' && error !== null ? (error as { statusCode?: unknown }).statusCode : undefined;
  return typeof status === 'number' ? status : null;
}

export function webPushSender(config: PushConfig): PushSender {
  const vapidDetails = { subject: config.subject, publicKey: config.publicKey, privateKey: config.privateKey };
  return {
    async send(target, payload) {
      try {
        await webpush.sendNotification({ endpoint: target.endpoint, keys: { p256dh: target.p256dh, auth: target.auth } }, payload, {
          vapidDetails,
          TTL: TTL_SECONDS,
          urgency: 'high',
          timeout: 10_000,
        });
        return 'sent';
      } catch (error) {
        const status = statusOf(error);
        // 404/410: the browser unsubscribed or the subscription expired.
        if (status === 404 || status === 410) return 'gone';
        if (status === 400 || status === 403 || status === 413) throw new DeliveryError(`push-${status}`, true);
        throw new DeliveryError(status ? `push-${status}` : 'push-network', false);
      }
    },
  };
}

/**
 * Push services browsers subscribe with. The server POSTs to a subscription's endpoint, so only these hosts are
 * accepted: an endpoint elsewhere would make the server call any address a signed-in person gave it.
 */
const PUSH_HOSTS = ['fcm.googleapis.com', 'updates.push.services.mozilla.com'];
const PUSH_HOST_SUFFIXES = ['.push.apple.com', '.notify.windows.com'];

export function isPushEndpoint(value: string): boolean {
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    return false;
  }
  if (url.protocol !== 'https:' || url.port || url.username || url.password) return false;
  const host = url.hostname.toLowerCase();
  return PUSH_HOSTS.includes(host) || PUSH_HOST_SUFFIXES.some((suffix) => host.endsWith(suffix));
}
