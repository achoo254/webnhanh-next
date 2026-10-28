/**
 * Web Push in this browser: the service worker (public/sw.js) and this device's subscription. On an iPhone or iPad,
 * Safari offers push only to the app added to the Home Screen.
 */
import { removePushSubscription, savePushSubscription } from './orders-api';

export type PushState = 'unsupported' | 'needs-home-screen' | 'denied' | 'off' | 'on';

const SW_URL = '/sw.js';

function isAppleMobile(): boolean {
  return /iPhone|iPad|iPod/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
}

function supported(): boolean {
  return 'serviceWorker' in navigator && typeof window.PushManager === 'function' && typeof window.Notification === 'function';
}

async function currentSubscription(): Promise<PushSubscription | null> {
  const registration = await navigator.serviceWorker.getRegistration('/');
  return registration ? registration.pushManager.getSubscription() : null;
}

export async function pushState(): Promise<PushState> {
  if (!supported()) return isAppleMobile() ? 'needs-home-screen' : 'unsupported';
  if (Notification.permission === 'denied') return 'denied';
  return (await currentSubscription()) ? 'on' : 'off';
}

/** The VAPID public key (base64url) as the bytes `subscribe` takes. */
export function keyBytes(base64url: string): Uint8Array<ArrayBuffer> {
  const base64 = base64url.replace(/-/g, '+').replace(/_/g, '/').padEnd(Math.ceil(base64url.length / 4) * 4, '=');
  const binary = atob(base64);
  const bytes = new Uint8Array(new ArrayBuffer(binary.length));
  for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

/** Asks for permission, subscribes this device and tells the server. */
export async function enablePush(publicKey: string): Promise<PushState> {
  const permission = await Notification.requestPermission();
  if (permission !== 'granted') return permission === 'denied' ? 'denied' : 'off';
  await navigator.serviceWorker.register(SW_URL, { scope: '/' });
  const registration = await navigator.serviceWorker.ready;
  const subscription =
    (await registration.pushManager.getSubscription()) ??
    (await registration.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: keyBytes(publicKey) }));
  await savePushSubscription(subscription.toJSON());
  return 'on';
}

/** Stops push on this device: on the server first, so no order is sent to a dead subscription. */
export async function disablePush(): Promise<PushState> {
  const subscription = await currentSubscription();
  if (subscription) {
    await removePushSubscription(subscription.endpoint);
    await subscription.unsubscribe();
  }
  return 'off';
}
