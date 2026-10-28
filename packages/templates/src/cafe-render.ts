/**
 * The restaurant / café page (see `page.ts` for what every page shares): menu sections with quick links, opening hours
 * as a table, the address with directions, and booking by the owner's contacts. No form, so no script.
 */
import { escapeHtml } from './html';
import { LOOK_CONTACT_CSS, LOOK_KIT_CSS, LOOK_TOKENS } from './looks';
import { contactItem, contactLinks, contactSection, dockNav, heroActions, ICONS, img, pageDocument, type Action, type ImageAsset, type PageOptions, type RenderedPage } from './page';
import { PALETTES } from './palettes';
import { CAFE_CSS, CAFE_LOOK_CSS } from './cafe-styles';
import type { CafeDraft, CafeItem, CafeSection } from './cafe-schema';
import type { ShareCardContent } from './share-card';
import { looksLikeUrl, mapLink } from './web-links';

const BOOKING_ID = 'dat-ban';

function menuItem(item: CafeItem, assets: ReadonlyMap<string, ImageAsset>): string {
  const name = item.name.trim();
  const desc = item.description.trim();
  const price = item.price.trim();
  const photo = item.image ? assets.get(item.image) : undefined;
  if (!name && !desc && !price && !photo) return '';
  return [
    `<li class="m-item${photo ? ' has-photo' : ''}">`,
    photo ? `<div class="m-photo">${img(photo, name, '96px', false)}</div>` : '',
    '<div class="m-text">',
    `<p class="m-line"><span class="m-name">${escapeHtml(name)}</span>${price ? `<span class="m-price">${escapeHtml(price)}</span>` : ''}</p>`,
    desc ? `<p class="m-desc">${escapeHtml(desc)}</p>` : '',
    '</div></li>',
  ].join('');
}

function menuSection(section: CafeSection, assets: ReadonlyMap<string, ImageAsset>): string {
  const items = section.items.map((item) => menuItem(item, assets)).filter(Boolean);
  if (items.length === 0) return '';
  const title = section.title.trim();
  const id = `m-${escapeHtml(section.key)}`;
  return `<section class="m-sec" id="${id}"${title ? ` aria-labelledby="${id}-t"` : ''}>${title ? `<h3 id="${id}-t">${escapeHtml(title)}</h3>` : ''}<ul class="m-items">${items.join('')}</ul></section>`;
}

export function renderCafe(draft: CafeDraft, assets: ReadonlyMap<string, ImageAsset>, options: PageOptions = {}): RenderedPage {
  const name = draft.name.trim();
  const description = draft.description.trim();
  const cover = draft.cover ? assets.get(draft.cover) : undefined;

  const sections = draft.menu.map((section) => ({ section, html: menuSection(section, assets) })).filter((s) => s.html);
  const titled = sections.filter((s) => s.section.title.trim());
  const menuNav =
    titled.length > 1
      ? `<nav class="m-nav" aria-label="Các mục thực đơn">${titled.map((s) => `<a href="#m-${escapeHtml(s.section.key)}">${escapeHtml(s.section.title.trim())}</a>`).join('')}</nav>`
      : '';
  const menu = sections.length > 0 ? `<section class="menu" aria-labelledby="td"><h2 id="td">Thực đơn</h2>${menuNav}${sections.map((s) => s.html).join('')}</section>` : '';

  const hoursRows = draft.hours
    .filter((row) => row.days.trim() || row.time.trim())
    .map((row) => `<tr><th scope="row">${escapeHtml(row.days.trim())}</th><td>${escapeHtml(row.time.trim())}</td></tr>`);
  const hours = hoursRows.length > 0 ? `<section class="card hours" aria-labelledby="gm"><h2 id="gm">Giờ mở cửa</h2><table><tbody>${hoursRows.join('')}</tbody></table></section>` : '';

  const map = draft.address.trim() ? mapLink(draft.address) : null;
  const addressText = map && !looksLikeUrl(draft.address) ? map.label : '';
  const where = map
    ? `<section class="card where" aria-labelledby="dc"><h2 id="dc">Địa chỉ</h2>${addressText ? `<p class="addr">${escapeHtml(addressText)}</p>` : ''}<a class="btn btn-primary" href="${escapeHtml(map.href)}">${ICONS.pin}Chỉ đường</a></section>`
    : '';
  const visit = hours || where ? `<div class="visit">${hours}${where}</div>` : '';

  const links = contactLinks(draft.contacts);
  const items = [
    contactItem(links.phone, draft.booking ? 'Gọi đặt bàn' : 'Gọi', ICONS.phone),
    contactItem(links.zalo, 'Nhắn Zalo', ICONS.chat),
    contactItem(links.facebook, 'Facebook', ICONS.link),
  ].filter(Boolean);
  const contact = draft.booking
    ? contactSection(items, { heading: 'Đặt bàn', headingId: 'db', id: BOOKING_ID, intro: '<p class="booking-intro">Gọi hoặc nhắn Zalo để giữ chỗ trước nhé.</p>' })
    : contactSection(items, { heading: 'Liên hệ', headingId: 'lh', id: BOOKING_ID });

  const actions: Action[] = [
    contact ? { href: `#${BOOKING_ID}`, label: draft.booking ? 'Đặt bàn' : 'Liên hệ', icon: ICONS.phone } : null,
    map ? { href: map.href, label: 'Chỉ đường', icon: ICONS.pin } : null,
  ].filter((action): action is Action => action !== null);
  const dockActions: Action[] = [
    links.phone ? { href: links.phone.href, label: draft.booking ? 'Gọi đặt bàn' : 'Gọi', icon: ICONS.phone } : null,
    links.zalo ? { href: links.zalo.href, label: 'Nhắn Zalo', icon: ICONS.chat } : null,
    map ? { href: map.href, label: 'Chỉ đường', icon: ICONS.pin } : null,
  ]
    .filter((action): action is Action => action !== null)
    .slice(0, 2);

  return pageDocument({
    title: name || 'Quán',
    description,
    palette: PALETTES[draft.palette],
    style: draft.style,
    css: [LOOK_TOKENS[draft.style], LOOK_KIT_CSS[draft.style], LOOK_CONTACT_CSS[draft.style], CAFE_CSS, CAFE_LOOK_CSS[draft.style]],
    formOrigin: null,
    options,
    dock: dockNav(dockActions, 'Đặt nhanh'),
    body: [
      `<header class="c-hero${cover ? ' has-cover' : ''}">`,
      cover ? `<div class="frame c-cover">${img(cover, '', '(min-width:720px) 480px, 100vw', true)}</div>` : '',
      '<div class="c-text">',
      name ? `<h1>${escapeHtml(name)}</h1>` : '',
      description ? `<p class="lede">${escapeHtml(description)}</p>` : '',
      heroActions(actions),
      '</div>',
      '</header>',
      '<main class="wrap">',
      menu,
      visit,
      contact,
      '</main>',
    ],
  });
}

export function cafeShareCard(draft: CafeDraft): ShareCardContent {
  return { kicker: '', title: draft.name.trim() || 'Quán', description: draft.description.trim(), palette: draft.palette, photo: draft.cover };
}
