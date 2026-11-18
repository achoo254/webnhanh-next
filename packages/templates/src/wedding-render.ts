/**
 * The wedding invitation page (see `page.ts` for what every page shares). The countdown ("Còn 41 ngày") is worked out
 * when the page is rendered, in Vietnam's time zone, so it is only as fresh as the last render; it is left out once the
 * day has passed. Replies go through the app's form when `rsvpForm` is given (its script is the order form's), otherwise
 * through the couple's contacts.
 *
 * The parents (at the head of the card, as a printed invitation has them), the couple's story and each event's family
 * show when the draft has them. A draft that names who sends it (`hostSide`: made or edited since the two families
 * exist) also gets "Thêm vào lịch" for each event with a day and asks the guest's family in the reply form. A draft
 * saved before has none of it and renders as it always did, so the daily re-render of a published invitation does not
 * change how it looks.
 */
import { escapeHtml } from './html';
import { LOOK_CONTACT_CSS, LOOK_KIT_CSS, LOOK_TOKENS } from './looks';
import { ORDER_CSS, type OrderFormOptions } from './order-form';
import { SPRIG } from './ornaments';
import {
  contactItem,
  contactLinks,
  contactSection,
  decorationAssets,
  decorationImg,
  dockNav,
  heroActions,
  ICONS,
  img,
  pageDocument,
  webUrlOrigin,
  type Action,
  type ImageAsset,
  type PageOptions,
  type RenderedPage,
} from './page';
import { PALETTES } from './palettes';
import { RSVP_CSS, RSVP_SECTION_ID, rsvpFormHtml } from './rsvp-form';
import type { ShareCardContent } from './share-card';
import { WEDDING_CSS, WEDDING_FAMILIES_CSS, WEDDING_LOOK_CSS } from './wedding-styles';
import { isIsoDate, isIsoMonth, type WeddingDraft, type WeddingEvent, type WeddingSide, type WeddingStory } from './wedding-schema';
import { calendarLink, looksLikeUrl, mapLink } from './web-links';

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

/** "Còn 41 ngày", "Ngày mai", "Hôm nay", or '' once the day has passed; `day` names the day ("ngày cưới", "ngày tiệc"). */
export function countdownText(days: number | null, day = 'ngày cưới'): string {
  if (days === null || days < 0) return '';
  if (days === 0) return `Hôm nay là ${day}`;
  if (days === 1) return `Ngày mai là ${day}`;
  return `Còn ${days} ngày`;
}

/** The family names as the card writes them. */
export const WEDDING_SIDE_LABELS: Readonly<Record<WeddingSide, string>> = { trai: 'Nhà trai', gai: 'Nhà gái' };

/** True when the draft names who sends it: it was made or edited since the two families exist (see the top). */
export function weddingHasFamilies(draft: WeddingDraft): boolean {
  return draft.hostSide !== undefined;
}

/** The families in the order the card names them: the bride's first when her family sends it. */
function familyOrder(draft: WeddingDraft): readonly WeddingSide[] {
  return draft.hostSide === 'gai' ? ['gai', 'trai'] : ['trai', 'gai'];
}

/** The couple's names in the card's order (typed ones only). */
function coupleNames(draft: WeddingDraft): string[] {
  const names: Readonly<Record<WeddingSide, string>> = { trai: draft.groom.trim(), gai: draft.bride.trim() };
  return familyOrder(draft)
    .map((side) => names[side])
    .filter(Boolean);
}

/** The parents of each family at the head of the card, as a printed invitation has them, or ''. */
function parentsBlock(draft: WeddingDraft): string {
  const parents = draft.parents;
  if (!parents) return '';
  const lines: Readonly<Record<WeddingSide, string[]>> = {
    trai: parents.groom.map((name) => name.trim()).filter(Boolean),
    gai: parents.bride.map((name) => name.trim()).filter(Boolean),
  };
  const families = familyOrder(draft)
    .filter((side) => lines[side].length > 0)
    .map(
      (side) =>
        `<div class="w-family"><p class="w-family-name">${WEDDING_SIDE_LABELS[side]}</p>${lines[side].map((name) => `<p>${escapeHtml(name)}</p>`).join('')}</div>`,
    );
  return families.length > 0 ? `<div class="w-parents">${families.join('')}</div>` : '';
}

/** "Tháng 5/2019" for `2019-05`, '' for no month. */
export function storyMonthLabel(month: string): string {
  if (!isIsoMonth(month)) return '';
  const [year, number] = month.split('-');
  return `Tháng ${Number(number)}/${year}`;
}

function storyItem(moment: WeddingStory, assets: ReadonlyMap<string, ImageAsset>): string {
  const title = moment.title.trim();
  const text = moment.text.trim();
  const photo = moment.photo ? assets.get(moment.photo) : undefined;
  if (!title && !text && !photo) return '';
  const when = storyMonthLabel(moment.when);
  return [
    '<li class="moment">',
    photo ? `<div class="m-photo">${img(photo, title, '(min-width:720px) 200px, 40vw', false)}</div>` : '',
    '<div class="m-body">',
    when ? `<p class="m-when"><time datetime="${escapeHtml(moment.when)}">${when}</time></p>` : '',
    title ? `<h3>${escapeHtml(title)}</h3>` : '',
    text ? `<p class="m-text">${escapeHtml(text)}</p>` : '',
    '</div>',
    '</li>',
  ].join('');
}

/** What an event's "Thêm vào lịch" link needs besides the event (only drafts that name the families have the link). */
interface CalendarExtras {
  /** "Minh & Thảo", for the calendar entry's title. */
  readonly couple: string;
  /** The published page's address, put in the calendar entry. */
  readonly pageUrl?: string;
}

function eventCalendarLink(event: WeddingEvent, weddingDate: string, extras: CalendarExtras, address: string): string | null {
  const label = event.label.trim();
  return calendarLink({
    title: [label || 'Đám cưới', extras.couple].filter(Boolean).join(' · '),
    date: event.date || weddingDate,
    time: event.time,
    location: [event.venue.trim(), address].filter(Boolean).join(', '),
    details: extras.pageUrl,
  });
}

function eventItem(event: WeddingEvent, weddingDate: string, calendarExtras: CalendarExtras | null): string {
  const label = event.label.trim();
  const venue = event.venue.trim();
  const day = weddingDateLabel(event.date || weddingDate);
  const when = [event.time, day].filter(Boolean).join(' · ');
  const map = event.address.trim() ? mapLink(event.address) : null;
  // A pasted map link is not an address worth showing; a typed address is.
  const address = map && !looksLikeUrl(event.address) ? map.label : '';
  if (!label && !venue && !when && !map) return '';
  const side = event.side ? WEDDING_SIDE_LABELS[event.side] : '';
  const calendar = calendarExtras ? eventCalendarLink(event, weddingDate, calendarExtras, address) : null;
  return [
    '<li class="card event">',
    side ? `<p class="e-side">${side}</p>` : '',
    label ? `<h3>${escapeHtml(label)}</h3>` : '',
    when ? `<p class="when">${escapeHtml(when)}</p>` : '',
    venue ? `<p class="venue">${escapeHtml(venue)}</p>` : '',
    address ? `<p class="addr">${escapeHtml(address)}</p>` : '',
    map ? `<a class="btn btn-secondary map" href="${escapeHtml(map.href)}">${ICONS.pin}Chỉ đường<span class="vh"> tới ${escapeHtml(venue || label)}</span></a>` : '',
    calendar ? `<a class="cal" href="${escapeHtml(calendar)}">${ICONS.calendar}Thêm vào lịch${label ? `<span class="vh">: ${escapeHtml(label)}</span>` : ''}</a>` : '',
    '</li>',
  ].join('');
}

export function renderWedding(draft: WeddingDraft, assets: ReadonlyMap<string, ImageAsset>, options: WeddingRenderOptions = {}): RenderedPage {
  const intro = draft.intro.trim();
  const lunar = draft.lunarDate.trim();
  const cover = draft.cover ? assets.get(draft.cover) : undefined;
  const dateLabel = weddingDateLabel(draft.date);
  const countdown = countdownText(daysUntil(draft.date, options.now ?? new Date()));
  const families = weddingHasFamilies(draft);
  const couple = coupleNames(draft);
  const parents = parentsBlock(draft);
  const calendar: CalendarExtras | null = families ? { couple: couple.join(' & '), pageUrl: options.page?.url } : null;
  // The variant's drawn ornament above the names and closing the invitation; the SVG sprigs without one.
  const [ornament, closing] = decorationAssets(draft.ornaments, assets);
  const topDecoration = ornament ? decorationImg(ornament, 'w-orn w-orn-top', '120px') : SPRIG('sprig sprig-top');
  const endDecoration = ornament ? decorationImg(closing ?? ornament, 'w-orn w-orn-end', '120px') : SPRIG('sprig sprig-end');

  const events = draft.events.map((event) => eventItem(event, draft.date, calendar)).filter(Boolean);
  const story = (draft.story ?? []).map((moment) => storyItem(moment, assets)).filter(Boolean);
  // Only a card with any of the newer parts carries their styles: an older one keeps its stylesheet byte for byte.
  const newerParts = families || parents !== '' || story.length > 0 || draft.events.some((event) => event.side);
  const firstMap = draft.events.map((event) => (event.address.trim() ? mapLink(event.address) : null)).find((link) => link !== null) ?? null;
  const gallery = draft.gallery
    .map((id) => assets.get(id))
    .filter((asset): asset is ImageAsset => asset !== undefined)
    .map((asset) => `<li>${img(asset, '', '(min-width:720px) 320px, 50vw', false)}</li>`);

  const form = draft.rsvp && options.rsvpForm ? rsvpFormHtml(options.rsvpForm, undefined, { guestSide: families }) : '';
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
    css: [LOOK_TOKENS[draft.style], LOOK_KIT_CSS[draft.style], LOOK_CONTACT_CSS[draft.style], form ? `${ORDER_CSS}\n${RSVP_CSS}` : '', WEDDING_CSS, newerParts ? WEDDING_FAMILIES_CSS : '', WEDDING_LOOK_CSS[draft.style]],
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
      topDecoration,
      parents,
      `<p class="w-kicker">${parents ? 'Trân trọng báo tin lễ thành hôn của con chúng tôi' : 'Trân trọng báo tin vui'}</p>`,
      names,
      dateLabel ? `<p class="w-date"><time datetime="${escapeHtml(draft.date)}">${dateLabel}</time></p>` : '',
      lunar ? `<p class="w-lunar">${escapeHtml(lunar)}</p>` : '',
      countdown ? `<p class="countdown">${countdown}</p>` : '',
      heroActions(actions),
      '</div>',
      '</header>',
      '<main class="wrap">',
      intro ? `<section class="card w-intro" aria-label="Lời mời"><p>${escapeHtml(intro)}</p>${endDecoration}</section>` : '',
      story.length > 0 ? `<section aria-labelledby="ct"><h2 id="ct">Chuyện tình</h2><ol class="story">${story.join('')}</ol></section>` : '',
      events.length > 0 ? `<section aria-labelledby="ls"><h2 id="ls">Lễ cưới</h2><ul class="events">${events.join('')}</ul></section>` : '',
      gallery.length > 0 ? `<section aria-labelledby="kk"><h2 id="kk">Khoảnh khắc</h2><ul class="gallery">${gallery.join('')}</ul></section>` : '',
      rsvp,
      '</main>',
    ],
  });
}

export function weddingShareCard(draft: WeddingDraft): ShareCardContent {
  const couple = coupleNames(draft);
  return {
    kicker: 'Thiệp cưới',
    title: couple.length > 0 ? couple.join(' & ') : 'Thiệp cưới',
    description: [weddingDateLabel(draft.date), draft.lunarDate.trim()].filter(Boolean).join(' · '),
    palette: draft.palette,
    photo: draft.cover,
  };
}
