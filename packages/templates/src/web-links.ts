/**
 * Links the newer templates put on a page besides phone, Zalo and Facebook (`contact-links.ts`): a map, any https
 * page, an email address and the big social networks. As there, what the owner typed stays as typed in the draft and
 * only links built here reach the page, so a typed `javascript:` or a look-alike host can never become a link.
 */
import { SEGMENT, urlOn, type ContactLink } from './contact-links';
import { isPlainText } from './html';

/** True when `input` is written as a link (`https://…` or `host.tld/…`) rather than as plain words. */
export function looksLikeUrl(input: string): boolean {
  const trimmed = input.trim();
  return /^https?:\/\//i.test(trimmed) || /^[a-z0-9.-]+\.[a-z]+\//i.test(trimmed);
}

const GOOGLE_HOSTS = ['google.com', 'www.google.com', 'maps.google.com', 'google.com.vn', 'www.google.com.vn'];
const ADDRESS_MIN = 4;
const ADDRESS_MAX = 200;

/**
 * Directions to a place: a Google Maps link the owner pasted (`maps.app.goo.gl/…`, `goo.gl/maps/…`,
 * `google.com/maps/…`), or an address, which becomes a Google Maps search for it. Null for anything else.
 */
export function mapLink(input: string): ContactLink | null {
  const trimmed = input.trim();
  if (looksLikeUrl(trimmed)) {
    const url = urlOn(trimmed, ['maps.app.goo.gl', 'goo.gl', ...GOOGLE_HOSTS]);
    if (!url) return null;
    const host = url.hostname.toLowerCase();
    const segments = url.pathname.split('/').filter(Boolean);
    const ok =
      host === 'maps.app.goo.gl'
        ? segments.length === 1 && SEGMENT.test(segments[0] ?? '')
        : host === 'goo.gl'
          ? segments[0] === 'maps' && segments.length === 2 && SEGMENT.test(segments[1] ?? '')
          : host === 'maps.google.com' || segments[0] === 'maps';
    if (!ok) return null;
    url.protocol = 'https:';
    return { href: url.href, label: 'Google Maps' };
  }
  // Something with a scheme that is not a map link was not meant as an address.
  if (/^[a-z][a-z0-9+.-]*:\S/i.test(trimmed)) return null;
  if (trimmed.length < ADDRESS_MIN || trimmed.length > ADDRESS_MAX || !isPlainText(trimmed, false) || !/[\p{L}\p{N}]/u.test(trimmed)) return null;
  return { href: `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(trimmed)}`, label: trimmed };
}

const HOST = /^(?=.{4,253}$)(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,63}$/;
export const WEB_LINK_MAX = 500;

/** Any https page (`https://` may be left out). Plain http, other schemes, credentials, ports and IP hosts are refused. */
export function webLink(input: string): ContactLink | null {
  const trimmed = input.trim();
  if (!trimmed || trimmed.length > WEB_LINK_MAX || !isPlainText(trimmed, false) || /\s/.test(trimmed)) return null;
  if (/^[a-z][a-z0-9+.-]*:/i.test(trimmed) && !/^https:\/\//i.test(trimmed)) return null;
  let url: URL;
  try {
    url = new URL(/^https:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`);
  } catch {
    return null;
  }
  const host = url.hostname.toLowerCase();
  if (url.protocol !== 'https:' || url.username || url.password || url.port || !HOST.test(host)) return null;
  const path = `${url.pathname === '/' ? '' : url.pathname}${url.search}`;
  const label = `${host.replace(/^www\./, '')}${path}`;
  return { href: url.href, label: label.length > 48 ? `${label.slice(0, 47)}…` : label };
}

const EMAIL = /^[A-Za-z0-9._%+-]{1,64}@(?:[A-Za-z0-9](?:[A-Za-z0-9-]{0,61}[A-Za-z0-9])?\.)+[A-Za-z]{2,63}$/;

export function emailLink(input: string): ContactLink | null {
  const trimmed = input.trim().replace(/^mailto:/i, '');
  if (trimmed.length > 254 || !EMAIL.test(trimmed)) return null;
  return { href: `mailto:${trimmed}`, label: trimmed };
}

/** A handle typed as `@name`, `name` or a link to `hosts` whose path is `prefix` + the handle. */
function handleLink(input: string, hosts: readonly string[], pattern: RegExp, build: (handle: string) => ContactLink): ContactLink | null {
  const trimmed = input.trim();
  const bare = trimmed.replace(/^@/, '');
  if (pattern.test(bare) && !bare.includes('..')) return build(bare);
  const url = urlOn(trimmed, hosts);
  if (!url) return null;
  const segments = url.pathname.split('/').filter(Boolean);
  if (segments.length !== 1) return null;
  const handle = (segments[0] ?? '').replace(/^@/, '');
  return pattern.test(handle) && !handle.includes('..') ? build(handle) : null;
}

export function tiktokLink(input: string): ContactLink | null {
  return handleLink(input, ['tiktok.com', 'www.tiktok.com', 'm.tiktok.com'], /^[A-Za-z0-9._]{2,24}$/, (h) => ({
    href: `https://www.tiktok.com/@${h}`,
    label: `@${h}`,
  }));
}

export function instagramLink(input: string): ContactLink | null {
  return handleLink(input, ['instagram.com', 'www.instagram.com'], /^[A-Za-z0-9._]{1,30}$/, (h) => ({
    href: `https://www.instagram.com/${h}`,
    label: `@${h}`,
  }));
}

/** A YouTube channel: `@handle`, or a youtube.com link to `@handle`, `channel/<id>` or `c/<name>`. */
export function youtubeLink(input: string): ContactLink | null {
  const trimmed = input.trim();
  const handle = /^@([A-Za-z0-9._-]{3,30})$/.exec(trimmed);
  if (handle) return { href: `https://www.youtube.com/@${handle[1]}`, label: trimmed };
  const url = urlOn(trimmed, ['youtube.com', 'www.youtube.com', 'm.youtube.com']);
  if (!url) return null;
  const segments = url.pathname.split('/').filter(Boolean);
  const [first, second] = segments;
  if (segments.length === 1 && first && /^@[A-Za-z0-9._-]{3,30}$/.test(first)) return { href: `https://www.youtube.com/${first}`, label: first };
  if (segments.length === 2 && (first === 'channel' || first === 'c') && second && SEGMENT.test(second)) {
    return { href: `https://www.youtube.com/${first}/${second}`, label: 'YouTube' };
  }
  return null;
}
