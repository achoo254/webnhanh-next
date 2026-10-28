/**
 * The three ways a visitor can reach a shop. What the owner typed is kept as typed in the draft; these turn it into
 * a link, or null when it is not a phone number, Zalo or Facebook address. Only links built here reach the page, so
 * a typed `javascript:` or any other site can never become a link.
 */

export interface ContactLink {
  readonly href: string;
  /** What the page shows. */
  readonly label: string;
}

/** Vietnamese numbers: mobile and landline (10 or 11 digits from 0, or +84), and 1800/1900 hotlines. */
export function normalizePhone(input: string): string | null {
  const compact = input.trim().replace(/[\s.()-]/g, '');
  const local = compact.startsWith('+84') ? `0${compact.slice(3)}` : compact.startsWith('84') && compact.length >= 11 ? `0${compact.slice(2)}` : compact;
  if (/^0[1-9]\d{8,9}$/.test(local)) return local;
  if (/^1[89]00\d{4,6}$/.test(local)) return local;
  return null;
}

/** 0912 345 678, the way people read numbers aloud. */
function groupDigits(phone: string): string {
  if (phone.length === 10) return `${phone.slice(0, 4)} ${phone.slice(4, 7)} ${phone.slice(7)}`;
  if (phone.length === 11) return `${phone.slice(0, 3)} ${phone.slice(3, 7)} ${phone.slice(7)}`;
  return phone;
}

export function phoneLink(input: string): ContactLink | null {
  const phone = normalizePhone(input);
  if (!phone) return null;
  const href = phone.startsWith('0') ? `tel:+84${phone.slice(1)}` : `tel:${phone}`;
  return { href, label: groupDigits(phone) };
}

/** Parses `input` as an https URL on one of `hosts` (a scheme may be left out), or null. */
function urlOn(input: string, hosts: readonly string[]): URL | null {
  const trimmed = input.trim();
  if (!/^[a-z0-9.]+\.[a-z]+\//i.test(trimmed) && !/^https?:\/\//i.test(trimmed)) return null;
  let url: URL;
  try {
    url = new URL(/^https?:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`);
  } catch {
    return null;
  }
  if (url.username || url.password || url.port || !hosts.includes(url.hostname.toLowerCase())) return null;
  return url;
}

const SEGMENT = /^[A-Za-z0-9._-]{1,64}$/;

/** A Zalo phone number (zalo.me/<number>) or a zalo.me link to a person, an Official Account or a group. */
export function zaloLink(input: string): ContactLink | null {
  const phone = normalizePhone(input);
  if (phone && phone.startsWith('0')) return { href: `https://zalo.me/${phone}`, label: groupDigits(phone) };
  const url = urlOn(input, ['zalo.me', 'www.zalo.me']);
  if (!url) return null;
  const segments = url.pathname.split('/').filter(Boolean);
  if (segments.length < 1 || segments.length > 2 || !segments.every((s) => SEGMENT.test(s))) return null;
  const path = segments.join('/');
  return { href: `https://zalo.me/${path}`, label: `zalo.me/${path}` };
}

const FACEBOOK_HOSTS = ['facebook.com', 'www.facebook.com', 'm.facebook.com', 'web.facebook.com', 'fb.com', 'www.fb.com'];
const FACEBOOK_NAME = /^[A-Za-z0-9.]{5,50}$/;

/** A Facebook page or profile: a facebook.com link, or the bare username. */
export function facebookLink(input: string): ContactLink | null {
  const trimmed = input.trim().replace(/^@/, '');
  if (FACEBOOK_NAME.test(trimmed) && !trimmed.includes('..')) {
    return { href: `https://www.facebook.com/${trimmed}`, label: `facebook.com/${trimmed}` };
  }
  const url = urlOn(trimmed, FACEBOOK_HOSTS);
  if (!url) return null;
  const segments = url.pathname.split('/').filter(Boolean);
  if (segments.length === 1 && segments[0] === 'profile.php') {
    const id = url.searchParams.get('id');
    if (!id || !/^\d{5,20}$/.test(id)) return null;
    return { href: `https://www.facebook.com/profile.php?id=${id}`, label: 'Facebook' };
  }
  if (segments.length < 1 || segments.length > 3 || !segments.every((s) => SEGMENT.test(s))) return null;
  const path = segments.join('/');
  return { href: `https://www.facebook.com/${path}`, label: `facebook.com/${path}` };
}
