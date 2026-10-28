/**
 * The wedding invitation page (see `page.ts` for what every page shares). The countdown ("Còn 41 ngày") is worked out
 * when the page is rendered, in Vietnam's time zone, so it is only as fresh as the last render; it is left out once the
 * day has passed. Replies go through the app's form when `rsvpForm` is given (its script is the order form's, unchanged),
 * otherwise through the couple's contacts.
 */
import { escapeHtml } from './html';
import { LOOK_CONTACT_CSS, LOOK_KIT_CSS, LOOK_TOKENS } from './looks';
import { ORDER_CSS, type OrderFormOptions } from './order-form';
import { SPRIG } from './ornaments';
import { contactItem, contactLinks, contactSection, dockNav, heroActions, ICONS, img, pageDocument, webUrlOrigin, type Action, type ImageAsset, type PageOptions, type RenderedPage } from './page';
import { PALETTES } from './palettes';
import { RSVP_CSS, RSVP_SECTION_ID, rsvpFormHtml } from './rsvp-form';
import type { ShareCardContent } from './share-card';
import { WEDDING_CSS, WEDDING_LOOK_CSS } from './wedding-styles';
import { isIsoDate, type WeddingDraft, type WeddingEvent } from './wedding-schema';
import { looksLikeUrl, mapLink } from './web-links';

export interface WeddingRenderOptions extends PageOptions {
  /** The reply form: where it posts and the page's signed token. Without it guests reply by the couple's contacts. */
  readonly rsvpForm?: OrderFormOptions;
  /** "Now" for the countdown; the current time when left out. */
  readonly now?: Date;
}

const WEEKDAYS = ['Chủ Nhật', 'Thứ Hai', 'Thứ Ba', 'Thứ Tư', 'Thứ Năm', 'Thứ Sáu', 'Thứ Bảy'] as const;
/** Vietnam is UTC+7 all year. */
const VIETNAM_OFFSET_MS = 7 * 60 * 60 * 1000;
const DAY_MS = 24 * 60 * 60 * 1000;

function utcDay(iso: string): Date {
  const [year, month, day] = iso.split('-').map(Number);
  return new Date(Date.UTC(year ?? 0, (month ?? 1) - 1, day ?? 1));
}

/** "Thứ Bảy, 12.12.2026" for a valid `YYYY-MM-DD`, else ''. */
export function weddingDateLabel(iso: string): string {
  if (!isIsoDate(iso)) return '';
  const date = utcDay(iso);
  const [year, month, day] = iso.split('-');
  return `${WEEKDAYS[date.getUTCDay()]}, ${day}.${month}.${year}`;
}

/** Days from `now` (in Vietnam) to the day `iso`: 0 on the day itself, negative after it; null for no valid day. */
export function daysUntil(iso: string, now: Date): number | null {
  if (!isIsoDate(iso)) return null;
  const local = new Date(now.getTime() + VIETNAM_OFFSET_MS);
  const today = Date.UTC(local.getUTCFullYear(), local.getUTCMonth(), local.getUTCDate());
  return Math.round((utcDay(iso).getTime() - today) / DAY_MS);
}

/** "Còn 41 ngày", "Ngày mai", "Hôm nay", or '' once the day has passed. */
export function countdownText(days: number | null): string {
  if (days === null || days < 0) return '';
  if (days === 0) return 'Hôm nay là ngày cưới';
  if (days === 1) return 'Ngày mai là ngày cưới';
  return `Còn ${days} ngày`;
}

function eventItem(event: WeddingEvent, weddingDate: string): string {
  const label = event.label.trim();
  const venue = event.venue.trim();
  const day = weddingDateLabel(event.date || weddingDate);
  const when = [event.time, day].filter(Boolean).join(' · ');
  const map = event.address.trim() ? mapLink(event.address) : null;
  // A pasted map link is not an address worth showing; a typed address is.
  const address = map && !looksLikeUrl(event.address) ? map.label : '';
  if (!label && !venue && !when && !map) return '';
  return [
    '<li class="card event">',
    label ? `<h3>${escapeHtml(label)}</h3>` : '',
    when ? `<p class="when">${escapeHtml(when)}</p>` : '',
    venue ? `<p class="venue">${escapeHtml(venue)}</p>` : '',
    address ? `<p class="addr">${escapeHtml(address)}</p>` : '',
    map ? `<a class="btn btn-secondary map" href="${escapeHtml(map.href)}">${ICONS.pin}Chỉ đường<span class="vh"> tới ${escapeHtml(venue || label)}</span></a>` : '',
    '</li>',
  ].join('');
}

export function renderWedding(draft: WeddingDraft, assets: ReadonlyMap<string, ImageAsset>, options: WeddingRenderOptions = {}): RenderedPage {
  const groom = draft.groom.trim();
  const bride = draft.bride.trim();
  const intro = draft.intro.trim();
  const lunar = draft.lunarDate.trim();
  const cover = draft.cover ? assets.get(draft.cover) : undefined;
  const dateLabel = weddingDateLabel(draft.date);
  const countdown = countdownText(daysUntil(draft.date, options.now ?? new Date()));
  const couple = [groom, bride].filter(Boolean);

  const events = draft.events.map((event) => eventItem(event, draft.date)).filter(Boolean);
  const firstMap = draft.events.map((event) => (event.address.trim() ? mapLink(event.address) : null)).find((link) => link !== null) ?? null;
  const gallery = draft.gallery
    .map((id) => assets.get(id))
    .filter((asset): asset is ImageAsset => asset !== undefined)
    .map((asset) => `<li>${img(asset, '', '(min-width:720px) 320px, 50vw', false)}</li>`);

  const form = draft.rsvp && options.rsvpForm ? rsvpFormHtml(options.rsvpForm) : '';
  const formOrigin = form && options.rsvpForm ? webUrlOrigin(options.rsvpForm.action) : null;
  const links = contactLinks(draft.contacts);
  const rsvpNote = draft.rsvpNote.trim() ? `<p class="rsvp-note">${escapeHtml(draft.rsvpNote.trim())}</p>` : '';
  const rsvpItems = [contactItem(links.zalo, 'Báo qua Zalo', ICONS.chat), contactItem(links.phone, 'Gọi', ICONS.phone), contactItem(links.facebook, 'Facebook', ICONS.link)].filter(
    Boolean,
  );
  const rsvp = !draft.rsvp
    ? contactSection(rsvpItems, { heading: 'Liên hệ', headingId: 'lien-he' })
    : form
      ? `<section class="rsvp" id="${RSVP_SECTION_ID}" aria-labelledby="xn"><h2 id="xn">Xác nhận tham dự</h2>${rsvpNote}${form}</section>`
      : contactSection(rsvpItems, { heading: 'Xác nhận tham dự', headingId: 'xn', intro: rsvpNote, id: RSVP_SECTION_ID });
  const canReply = Boolean(form) || (draft.rsvp && rsvpItems.length > 0);

  const actions: Action[] = [
    canReply ? { href: `#${RSVP_SECTION_ID}`, label: 'Xác nhận tham dự', icon: ICONS.heart } : null,
    firstMap ? { href: firstMap.href, label: 'Chỉ đường', icon: ICONS.pin } : null,
  ].filter((action): action is Action => action !== null);

  const names =
    couple.length > 0 ? `<h1>${couple.map((name) => `<span class="name">${escapeHtml(name)}</span>`).join('<span class="amp" aria-label="và">&amp;</span>')}</h1>` : '';

  return pageDocument({
    title: couple.length > 0 ? `Thiệp cưới ${couple.join(' & ')}` : 'Thiệp cưới',
    description: intro || [dateLabel, lunar].filter(Boolean).join(' · '),
    palette: PALETTES[draft.palette],
    style: draft.style,
    css: [LOOK_TOKENS[draft.style], LOOK_KIT_CSS[draft.style], LOOK_CONTACT_CSS[draft.style], form ? `${ORDER_CSS}\n${RSVP_CSS}` : '', WEDDING_CSS, WEDDING_LOOK_CSS[draft.style]],
    formOrigin,
    options,
    // The bar is narrow: the reply button says less there.
    dock: dockNav(
      actions.map((action) => (action.href === `#${RSVP_SECTION_ID}` ? { ...action, label: 'Xác nhận' } : action)),
      'Thiệp cưới',
    ),
    body: [
      `<header class="w-hero${cover ? ' has-cover' : ''}">`,
      cover ? `<div class="frame w-cover">${img(cover, '', '(min-width:720px) 480px, 100vw', true)}</div>` : '',
      '<div class="w-names">',
      SPRIG('sprig sprig-top'),
      '<p class="w-kicker">Trân trọng báo tin vui</p>',
      names,
      dateLabel ? `<p class="w-date"><time datetime="${escapeHtml(draft.date)}">${dateLabel}</time></p>` : '',
      lunar ? `<p class="w-lunar">${escapeHtml(lunar)}</p>` : '',
      countdown ? `<p class="countdown">${countdown}</p>` : '',
      heroActions(actions),
      '</div>',
      '</header>',
      '<main class="wrap">',
      intro ? `<section class="card w-intro" aria-label="Lời mời"><p>${escapeHtml(intro)}</p>${SPRIG('sprig sprig-end')}</section>` : '',
      events.length > 0 ? `<section aria-labelledby="ls"><h2 id="ls">Lễ cưới</h2><ul class="events">${events.join('')}</ul></section>` : '',
      gallery.length > 0 ? `<section aria-labelledby="kk"><h2 id="kk">Khoảnh khắc</h2><ul class="gallery">${gallery.join('')}</ul></section>` : '',
      rsvp,
      '</main>',
    ],
  });
}

export function weddingShareCard(draft: WeddingDraft): ShareCardContent {
  const couple = [draft.groom.trim(), draft.bride.trim()].filter(Boolean);
  return {
    kicker: 'Thiệp cưới',
    title: couple.length > 0 ? couple.join(' & ') : 'Thiệp cưới',
    description: [weddingDateLabel(draft.date), draft.lunarDate.trim()].filter(Boolean).join(' · '),
    palette: draft.palette,
    photo: draft.cover,
  };
}
