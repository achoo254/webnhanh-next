/**
 * The party invitation page (see `page.ts` for what every page shares): the cover, what the party is, the day with a
 * countdown (worked out when the page is rendered, like the wedding's, and rendered again each day by the worker),
 * where it is with directions, the dress code and programme, and "Xác nhận tham dự" through the wedding's reply form
 * (`rsvpForm`; the order form's fixed script, unchanged) or, without it, the host's contacts.
 */
import { escapeHtml } from './html';
import { LOOK_CONTACT_CSS, LOOK_KIT_CSS, LOOK_TOKENS } from './looks';
import { ORDER_CSS } from './order-form';
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
  type RenderedPage,
} from './page';
import { PALETTES } from './palettes';
import { PARTY_CSS, PARTY_LOOK_CSS } from './party-styles';
import type { PartyDraft } from './party-schema';
import { RSVP_CSS, RSVP_SECTION_ID, rsvpFormHtml } from './rsvp-form';
import type { ShareCardContent } from './share-card';
import { countdownText, daysUntil, weddingDateLabel, type WeddingRenderOptions } from './wedding-render';
import { looksLikeUrl, mapLink } from './web-links';

/** Same options as the wedding: the reply form and "now" for the countdown. */
export type PartyRenderOptions = WeddingRenderOptions;

/** Who the reply form's note goes to. */
const NOTE_LABEL = 'Lời nhắn cho ban tổ chức';

/** "18:30 · Thứ Bảy, 26.12.2026", or what of it is set. */
function whenText(draft: PartyDraft): string {
  return [draft.time, weddingDateLabel(draft.date)].filter(Boolean).join(' · ');
}

export function renderParty(draft: PartyDraft, assets: ReadonlyMap<string, ImageAsset>, options: PartyRenderOptions = {}): RenderedPage {
  const kicker = draft.kicker.trim();
  const title = draft.title.trim();
  const host = draft.host.trim();
  const intro = draft.intro.trim();
  const venue = draft.venue.trim();
  const dressCode = draft.dressCode.trim();
  const cover = draft.cover ? assets.get(draft.cover) : undefined;
  const when = whenText(draft);
  const countdown = countdownText(daysUntil(draft.date, options.now ?? new Date()), 'ngày tiệc');
  const map = draft.address.trim() ? mapLink(draft.address) : null;
  // A pasted map link is not an address worth showing; a typed address is.
  const address = map && !looksLikeUrl(draft.address) ? map.label : '';
  const [ornament, second] = decorationAssets(draft.ornaments, assets);

  const form = draft.rsvp && options.rsvpForm ? rsvpFormHtml(options.rsvpForm, NOTE_LABEL) : '';
  const formOrigin = form && options.rsvpForm ? webUrlOrigin(options.rsvpForm.action) : null;
  const links = contactLinks(draft.contacts);
  const rsvpNote = draft.rsvpNote.trim() ? `<p class="rsvp-note">${escapeHtml(draft.rsvpNote.trim())}</p>` : '';
  const replyItems = [contactItem(links.zalo, 'Báo qua Zalo', ICONS.chat), contactItem(links.phone, 'Gọi', ICONS.phone), contactItem(links.facebook, 'Facebook', ICONS.link)].filter(
    Boolean,
  );
  const rsvp = !draft.rsvp
    ? contactSection(replyItems, { heading: 'Liên hệ ban tổ chức', headingId: 'lien-he' })
    : form
      ? `<section class="rsvp" id="${RSVP_SECTION_ID}" aria-labelledby="xn"><h2 id="xn">Xác nhận tham dự</h2>${rsvpNote}${form}</section>`
      : contactSection(replyItems, { heading: 'Xác nhận tham dự', headingId: 'xn', intro: rsvpNote, id: RSVP_SECTION_ID });
  const canReply = Boolean(form) || (draft.rsvp && replyItems.length > 0);

  const actions: Action[] = [
    canReply ? { href: `#${RSVP_SECTION_ID}`, label: 'Xác nhận tham dự', icon: ICONS.heart } : null,
    map ? { href: map.href, label: 'Chỉ đường', icon: ICONS.pin } : null,
  ].filter((action): action is Action => action !== null);

  const agenda = draft.agenda
    .filter((item) => item.label.trim())
    .map(
      (item) =>
        `<li>${item.time ? `<span class="pa-time">${escapeHtml(item.time)}</span>` : '<span class="pa-time" aria-hidden="true">·</span>'}<span class="pa-label">${escapeHtml(item.label.trim())}</span></li>`,
    );

  const place =
    when || venue || address || map
      ? [
          '<section class="card pt-place" aria-labelledby="tg">',
          '<h2 id="tg">Thời gian, địa điểm</h2>',
          when ? `<p class="when">${draft.date ? `<time datetime="${escapeHtml(draft.date)}">${escapeHtml(when)}</time>` : escapeHtml(when)}</p>` : '',
          venue ? `<p class="venue">${escapeHtml(venue)}</p>` : '',
          address ? `<p class="addr">${escapeHtml(address)}</p>` : '',
          dressCode ? `<p class="dress"><span>Dress code</span> ${escapeHtml(dressCode)}</p>` : '',
          map ? `<a class="btn btn-secondary map" href="${escapeHtml(map.href)}">${ICONS.pin}Chỉ đường<span class="vh"> tới ${escapeHtml(venue || title)}</span></a>` : '',
          '</section>',
        ].join('')
      : '';

  return pageDocument({
    title: title ? `${title}${host ? ` · ${host}` : ''}` : 'Thiệp mời',
    description: intro || [kicker, when, venue].filter(Boolean).join(' · '),
    palette: PALETTES[draft.palette],
    style: draft.style,
    css: [LOOK_TOKENS[draft.style], LOOK_KIT_CSS[draft.style], LOOK_CONTACT_CSS[draft.style], form ? `${ORDER_CSS}\n${RSVP_CSS}` : '', PARTY_CSS, PARTY_LOOK_CSS[draft.style]],
    formOrigin,
    options,
    dock: dockNav(
      actions.map((action) => (action.href === `#${RSVP_SECTION_ID}` ? { ...action, label: 'Xác nhận' } : action)),
      'Thiệp mời',
    ),
    body: [
      `<header class="pt-hero${cover ? ' has-cover' : ''}">`,
      cover ? `<div class="frame pt-cover">${img(cover, '', '(min-width:720px) 520px, 100vw', true)}</div>` : '',
      '<div class="pt-head">',
      ornament ? decorationImg(ornament, 'pt-orn pt-orn-1', '112px') : '',
      kicker ? `<p class="pt-kicker">${escapeHtml(kicker)}</p>` : '',
      title ? `<h1>${escapeHtml(title)}</h1>` : '',
      host ? `<p class="pt-host">Thân mời từ <strong>${escapeHtml(host)}</strong></p>` : '',
      when ? `<p class="pt-date">${escapeHtml(when)}</p>` : '',
      countdown ? `<p class="countdown">${countdown}</p>` : '',
      heroActions(actions),
      '</div>',
      '</header>',
      '<main class="wrap">',
      intro ? `<section class="card pt-intro" aria-label="Lời mời"><p>${escapeHtml(intro)}</p>${second ? decorationImg(second, 'pt-orn pt-orn-2', '112px') : ''}</section>` : '',
      place,
      agenda.length > 0 ? `<section aria-labelledby="lt"><h2 id="lt">Lịch trình</h2><ol class="pt-agenda">${agenda.join('')}</ol></section>` : '',
      rsvp,
      '</main>',
    ],
  });
}

export function partyShareCard(draft: PartyDraft): ShareCardContent {
  return {
    kicker: draft.kicker.trim() || 'Thiệp mời',
    title: draft.title.trim() || 'Thiệp mời',
    description: [whenText(draft), draft.venue.trim()].filter(Boolean).join(' · '),
    palette: draft.palette,
    photo: draft.cover,
  };
}
