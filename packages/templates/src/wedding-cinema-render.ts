/**
 * The wedding invitation's "Rạp phim" layout (`layout: 'cinema'`): the invitation as a film on a streaming service, from
 * the approved mock-up. It shows the same draft as the looks, each part under a fixed film-themed heading:
 *
 * - the banner: the cover and up to three photos of the gallery, the film title and tagline (the layout's own when empty);
 * - "Lịch công chiếu": the events, each with its family, time, place, "Chỉ đường" and "Thêm vào lịch", and a countdown
 *   to the earliest event for everyone with a day (the wedding day without one);
 * - "Các tập": the couple's story, then a last "Sắp chiếu" episode on the wedding day;
 * - "Top N khoảnh khắc": the gallery (up to ten); "Diễn viên": the couple and the guest; "Nhà sản xuất": the parents;
 * - "Đặt vé": the shared reply form (`rsvp-form.ts`, its script `ORDER_SCRIPT`), and the end credits.
 *
 * A part without data is left out, never filled with sample words. Every event is in the HTML: the fixed script
 * (`CINEMA_SCRIPT`) only hides the other family's once a guest has picked a profile, so without script the page reads
 * whole and the form still sends.
 */
import { assertAssetUrl, escapeHtml } from './html';
import { contactLinks, img, pageDocument, webUrlOrigin, type ImageAsset, type RenderedPage } from './page';
import { PALETTES } from './palettes';
import { RSVP_LABELS, rsvpFormHtml, type RsvpWords } from './rsvp-form';
import { cinemaFontFiles } from './shop-fonts';
import { CINEMA_SCRIPT, CINEMA_SCRIPT_HASH } from './wedding-cinema-script';
import { cinemaCss } from './wedding-cinema-styles';
import { coupleNames, daysUntil, familyOrder, WEDDING_SIDE_LABELS, weddingDateLabel, type WeddingRenderOptions } from './wedding-render';
import { isIsoDate, isIsoMonth, type WeddingDraft, type WeddingEvent, type WeddingSide } from './wedding-schema';
import { calendarLink, looksLikeUrl, mapLink } from './web-links';

export const CINEMA_DEFAULT_TITLE = 'Chuyện Chúng Mình';
export const CINEMA_DEFAULT_TAGLINE = 'Phần 1: Về chung một nhà';
/** The page's fixed dark background, also the browser's theme colour. */
const CINEMA_BACKGROUND = '#0b0809';
const MOMENTS_MAX = 10;
/** The reply form in the film's words (the mock-up's). */
const CINEMA_FORM_WORDS = {
  name: 'Tên in trên vé',
  side: 'Bạn là khách',
  sideTrai: 'Nhà trai',
  sideGai: 'Nhà gái',
  attendingYes: 'Có, giữ ghế cho tôi',
  attendingNo: 'Tiếc quá, không đến được',
  guests: 'Số ghế (kể cả bạn)',
  submit: 'Đặt vé',
} as const satisfies RsvpWords;
const BANNER_GALLERY_MAX = 3;

/** The film title the page and its share picture show. */
export function cinemaTitle(draft: WeddingDraft): string {
  return draft.filmTitle?.trim() || CINEMA_DEFAULT_TITLE;
}

/** The last word of a name ("Minh Khoa" → "Khoa"): what a guest calls them. */
function shortName(name: string): string {
  const words = name.trim().split(/\s+/);
  return words[words.length - 1] ?? '';
}

function initial(name: string): string {
  const [first = ''] = Array.from(name.trim());
  return first.toLocaleUpperCase('vi');
}

/** "05.12.2026" for a valid day, else ''. */
function dottedDay(iso: string): string {
  if (!isIsoDate(iso)) return '';
  const [year, month, day] = iso.split('-');
  return `${day}.${month}.${year}`;
}

/** "Tháng 9, 2018" for `2018-09`, '' for no month. */
function episodeMonth(month: string): string {
  if (!isIsoMonth(month)) return '';
  const [year, number] = month.split('-');
  return `Tháng ${Number(number)}, ${year}`;
}

/** The event the countdown runs to: the earliest one for everyone with a day; null when none has one. */
function mainEvent(draft: WeddingDraft): WeddingEvent | null {
  const timed = draft.events
    .filter((event) => !event.side && isIsoDate(event.date || draft.date))
    .map((event) => ({ event, at: `${event.date || draft.date}T${event.time || '00:00'}` }))
    .sort((a, b) => a.at.localeCompare(b.at));
  return timed[0]?.event ?? null;
}

/** The poster title, broken after its first word when it has three or more (as the mock-up sets it). */
function titleHtml(title: string): string {
  const words = title.split(/\s+/).filter(Boolean);
  if (words.length < 3) return escapeHtml(title);
  return `${escapeHtml(words[0] ?? '')}<br>${escapeHtml(words.slice(1).join(' '))}`;
}

/** A part of the page with its heading in the top menu; '' when the draft has nothing for it. */
interface Section {
  readonly id: string;
  readonly nav: string;
  readonly html: string;
}

const TAB_ICONS = {
  home: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 11l8-7 8 7v9h-5v-6H9v6H4z"/></svg>',
  lich: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 5h14v15H5zM5 9h14M9 3v4M15 3v4" fill="none" stroke="currentColor" stroke-width="2"/></svg>',
  ticket: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M3 8a2 2 0 0 0 2-2h14a2 2 0 0 0 2 2v2a2 2 0 0 0 0 4v2a2 2 0 0 0-2 2H5a2 2 0 0 0-2-2v-2a2 2 0 0 0 0-4z"/></svg>',
  photo: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 6h16v12H4zM8 14l3-3 3 3 2-2 3 3" fill="none" stroke="currentColor" stroke-width="2"/></svg>',
  cast: '<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="8" r="4"/><path d="M4 21a8 8 0 0 1 16 0z"/></svg>',
} as const;

function showItem(event: WeddingEvent, draft: WeddingDraft, main: boolean, anySided: boolean, couple: string, pageUrl: string | undefined): string {
  const label = event.label.trim();
  const venue = event.venue.trim();
  const day = event.date || draft.date;
  const [weekday = '', dotted = ''] = weddingDateLabel(day).split(', ');
  const [dd = '', mm = ''] = dotted.split('.');
  const map = event.address.trim() ? mapLink(event.address) : null;
  const address = map && !looksLikeUrl(event.address) ? map.label : '';
  if (!label && !venue && !weekday && !map) return '';
  const side = event.side ?? '';
  const tag = side ? WEDDING_SIDE_LABELS[side] : main ? (anySided ? 'Suất chính · mời tất cả' : 'Suất chính') : 'Mời tất cả';
  const calendar = calendarLink({
    title: [label || 'Đám cưới', couple].filter(Boolean).join(' · '),
    date: day,
    time: event.time,
    location: [venue, address].filter(Boolean).join(', '),
    details: pageUrl,
  });
  const time = [event.time, venue].filter(Boolean).join(' · ');
  const links = [
    map ? `<a href="${escapeHtml(map.href)}" target="_blank" rel="noopener">Chỉ đường</a>` : '',
    calendar ? `<a href="${escapeHtml(calendar)}" target="_blank" rel="noopener">Thêm vào lịch</a>` : '',
  ].filter(Boolean);
  return [
    `<li class="show${main ? ' show--main' : ''}" data-side="${side}" data-reveal>`,
    weekday ? `<div class="show-date"><span class="dow">${weekday}</span><b>${dd}</b><span>Th${Number(mm)}</span></div>` : '',
    '<div class="show-body">',
    `<p class="show-tag">${tag}</p>`,
    label ? `<h3>${escapeHtml(label)}</h3>` : '',
    time ? `<p class="show-time">${escapeHtml(time)}</p>` : '',
    address ? `<p class="show-addr">${escapeHtml(address)}</p>` : '',
    links.length > 0 ? `<p class="show-links">${links.join('')}</p>` : '',
    '</div></li>',
  ].join('');
}

export function renderWeddingCinema(draft: WeddingDraft, assets: ReadonlyMap<string, ImageAsset>, options: WeddingRenderOptions = {}): RenderedPage {
  const palette = PALETTES[draft.palette];
  const film = cinemaTitle(draft);
  const tagline = draft.tagline?.trim() || CINEMA_DEFAULT_TAGLINE;
  const intro = draft.intro.trim();
  const order = familyOrder(draft);
  const names: Readonly<Record<WeddingSide, string>> = { trai: draft.groom.trim(), gai: draft.bride.trim() };
  const couple = coupleNames(draft);
  const bothNames = couple.length === 2;
  const coupleText = couple.join(' & ');
  const dateLabel = weddingDateLabel(draft.date);
  const year = isIsoDate(draft.date) ? draft.date.slice(0, 4) : '';

  // Countdown: to the earliest event for everyone, or the wedding day.
  const main = mainEvent(draft);
  const targetDay = main ? main.date || draft.date : isIsoDate(draft.date) ? draft.date : '';
  const targetTime = main?.time ?? '';
  const days = targetDay ? daysUntil(targetDay, options.now ?? new Date()) : null;
  const countdownLabel =
    days === null || days < 0 ? '' : days === 0 ? '<b>Hôm nay</b> là suất chiếu' : days === 1 ? '<b>Ngày mai</b> là suất chiếu' : `Còn <b>${days} ngày</b> nữa tới suất chiếu`;
  const countdown = countdownLabel
    ? [
        `<div class="countdown" data-at="${targetDay}T${targetTime || '00:00'}:00+07:00" aria-live="off">`,
        `<p class="cd-label">${countdownLabel}</p>`,
        '<div class="cd-grid" aria-hidden="true" hidden>',
        ['d', 'h', 'm', 's'].map((cell, i) => `<div><b data-cd="${cell}">${cell === 'd' ? String(days) : '00'}</b><span>${['Ngày', 'Giờ', 'Phút', 'Giây'][i]}</span></div>`).join(''),
        '</div></div>',
      ].join('')
    : '';

  const anySided = draft.events.some((event) => Boolean(event.side));
  const shows = draft.events.map((event) => showItem(event, draft, event === main, anySided, coupleText, options.page?.url)).filter(Boolean);

  // Episodes: the story, then the wedding day "coming soon".
  const episodes = (draft.story ?? [])
    .filter((moment) => moment.title.trim() || moment.text.trim() || moment.photo)
    .map((moment, index) => {
      const photo = moment.photo ? assets.get(moment.photo) : undefined;
      const when = episodeMonth(moment.when);
      const title = moment.title.trim();
      const text = moment.text.trim();
      return [
        '<li class="ep" data-reveal>',
        `<div class="ep-ph">${photo ? img(photo, '', '(min-width:700px) 220px, 132px', false) : ''}<span class="ep-n">${index + 1}</span></div>`,
        '<div class="ep-body">',
        when ? `<p class="ep-when">${when}</p>` : '',
        title ? `<h3>${escapeHtml(title)}</h3>` : '',
        text ? `<p>${escapeHtml(text)}</p>` : '',
        '</div></li>',
      ].join('');
    });
  const episodesHtml =
    episodes.length > 0
      ? [
          '<section class="sec wrap" id="tap" aria-labelledby="tapTitle">',
          `<div class="sec-head"><h2 class="h2" id="tapTitle">Các tập</h2><p class="sec-note">Phần 1 · ${episodes.length + 1} tập</p></div>`,
          '<ol class="eps">',
          ...episodes,
          `<li class="ep ep--next" data-reveal><div class="ep-ph ep-ph--next"><span class="ep-n">${episodes.length + 1}</span><span class="soon">Sắp chiếu</span></div>`,
          '<div class="ep-body">',
          dateLabel ? `<p class="ep-when">${dottedDay(draft.date)}</p>` : '',
          '<h3>Về chung một nhà</h3><p>Tập này quay trực tiếp, và <b class="hl" data-guest-lower>bạn</b> có tên trong danh sách khán giả.</p>',
          '</div></li></ol></section>',
        ].join('')
      : '';

  // Moments: the gallery, up to ten, each opening the full photo.
  const galleryAssets = draft.gallery.map((id) => assets.get(id)).filter((asset): asset is ImageAsset => asset !== undefined);
  const moments = galleryAssets.slice(0, MOMENTS_MAX).map((asset, index) => {
    const full = asset.variants[asset.variants.length - 1];
    if (!full) return '';
    return `<li><a class="tile" href="${escapeHtml(assertAssetUrl(full.url))}"><span class="tile-n" aria-hidden="true">${index + 1}</span>${img(asset, `Khoảnh khắc ${index + 1}`, '(min-width:720px) 230px, 42vw', false)}</a></li>`;
  });
  const momentsHtml =
    moments.length > 0
      ? [
          '<section class="sec" id="khoanh-khac" aria-labelledby="kkTitle">',
          `<div class="wrap sec-head"><h2 class="h2" id="kkTitle">Top ${moments.length} khoảnh khắc</h2>`,
          '<div class="row-ctl" hidden><button type="button" class="arrow" data-row="-1" aria-label="Ảnh trước">‹</button><button type="button" class="arrow" data-row="1" aria-label="Ảnh sau">›</button></div></div>',
          `<ol class="row" id="row">${moments.join('')}</ol></section>`,
        ].join('')
      : '';

  // The banner: the cover, then up to three photos of the gallery.
  const bannerIds = [...new Set([draft.cover, ...draft.gallery.slice(0, BANNER_GALLERY_MAX)].filter((id): id is string => id !== null))];
  const slides = bannerIds
    .map((id) => assets.get(id))
    .filter((asset): asset is ImageAsset => asset !== undefined)
    .map((asset, index) => `<figure class="slide${index === 0 ? ' is-on' : ''}">${img(asset, '', '100vw', index === 0)}</figure>`);

  // The cast: the couple (portrait or initial), and the guest.
  const portraits: Readonly<Record<WeddingSide, string | null | undefined>> = { trai: draft.portraits?.groom, gai: draft.portraits?.bride };
  const castMembers = order
    .filter((side) => names[side])
    .map((side) => {
      const id = portraits[side];
      const portrait = id ? assets.get(id) : undefined;
      const picture = portrait
        ? `<div class="cast-ph">${img(portrait, `Chân dung ${names[side]}`, '150px', false)}</div>`
        : `<div class="cast-ph cast-ph--initial" aria-hidden="true"><span>${escapeHtml(initial(shortName(names[side])))}</span></div>`;
      return `<li data-reveal>${picture}<h3>${escapeHtml(names[side])}</h3><p class="role">${side === 'trai' ? 'Chú rể' : 'Cô dâu'}</p></li>`;
    });
  const parents = draft.parents;
  const producers = parents
    ? order
        .map((side) => ({ side, lines: (side === 'trai' ? parents.groom : parents.bride).map((line) => line.trim()).filter(Boolean) }))
        .filter((family) => family.lines.length > 0)
        .map((family) => `<div data-reveal><h3>${WEDDING_SIDE_LABELS[family.side]}</h3>${family.lines.map((line) => `<p>${escapeHtml(line)}</p>`).join('')}</div>`)
    : [];
  const hosts = draft.hostSide === 'trai' ? 'Gia đình nhà trai' : draft.hostSide === 'gai' ? 'Gia đình nhà gái' : 'Hai bên gia đình';
  const castHtml =
    castMembers.length > 0
      ? [
          '<section class="sec wrap" id="dien-vien" aria-labelledby="dvTitle"><h2 class="h2" id="dvTitle">Diễn viên</h2><ul class="cast">',
          ...castMembers,
          '<li class="cast-guest" data-reveal><div class="cast-ph cast-ph--guest"><span data-guest-initial>VIP</span></div><h3 data-guest-name>Bạn</h3><p class="role">Khách mời đặc biệt</p><p class="trait">Xuất hiện ở tập cuối</p></li>',
          '</ul>',
          producers.length > 0 ? `<h2 class="h2 h2--sub">Nhà sản xuất</h2><div class="producers">${producers.join('')}</div>` : '',
          bothNames
            ? `<p class="announce">${hosts} trân trọng báo tin vui: Lễ Thành Hôn của <b>${escapeHtml(couple[0] ?? '')}</b> và <b>${escapeHtml(couple[1] ?? '')}</b>. Sự có mặt của quý khách là niềm vinh hạnh của gia đình chúng tôi.</p>`
            : '',
          '</section>',
        ].join('')
      : '';

  // Booking: the shared reply form; the ticket's words come from data-* (the script holds none of the card's).
  const form = draft.rsvp && options.rsvpForm ? rsvpFormHtml(options.rsvpForm, RSVP_LABELS.note, { guestSide: true, words: CINEMA_FORM_WORDS }) : '';
  const formOrigin = form && options.rsvpForm ? webUrlOrigin(options.rsvpForm.action) : null;
  const [targetWeekday = '', targetDotted = ''] = weddingDateLabel(targetDay).split(', ');
  const ticketDay = targetWeekday ? `${targetWeekday} ${targetDotted.slice(0, 5)}` : '';
  const code = order.map((side) => initial(shortName(names[side]))).join('');
  const bookingHtml = form
    ? [
        '<section class="sec wrap" id="dat-ve" aria-labelledby="dvvTitle"><h2 class="h2" id="dvvTitle">Đặt vé</h2>',
        draft.rsvpNote.trim() ? `<p class="sec-lede">${escapeHtml(draft.rsvpNote.trim())}</p>` : '',
        `<div class="booking" id="booking" data-film="${escapeHtml(film)}" data-day="${escapeHtml(ticketDay)}" data-time="${escapeHtml(targetTime)}" data-code="${escapeHtml(code)}">`,
        form,
        '<div class="ticket-slot" id="ticketSlot" aria-live="polite"></div></div></section>',
      ].join('')
    : '';

  const creditsHtml = bothNames
    ? [
        '<section class="credits" id="credits" aria-label="Lời kết"><div class="credits-roll" data-reveal><p class="cr-big">Cảm ơn bạn đã xem</p><dl>',
        `<div><dt>Đạo diễn</dt><dd>${escapeHtml(names.gai)}</dd></div>`,
        `<div><dt>Biên kịch</dt><dd>${escapeHtml(names.trai)}</dd></div>`,
        `<div><dt>Sản xuất</dt><dd>${hosts}</dd></div>`,
        '<div><dt>Khách mời</dt><dd data-guest-name>Bạn</dd></div>',
        '<div><dt>Hậu cần</dt><dd>Bạn bè thân thiết</dd></div>',
        '</dl><p class="cr-end">Hẹn gặp bạn ở phần tiếp theo.</p></div></section>',
      ].join('')
    : '';

  const lichHtml =
    shows.length > 0 || countdown
      ? `<section class="sec wrap" id="lich" aria-labelledby="lichTitle"><h2 class="h2" id="lichTitle">Lịch công chiếu</h2>${countdown}${shows.length > 0 ? `<ol class="shows">${shows.join('')}</ol>` : ''}</section>`
      : '';

  const sections: readonly Section[] = [
    { id: 'lich', nav: 'Lịch chiếu', html: lichHtml },
    { id: 'tap', nav: 'Các tập', html: episodesHtml },
    { id: 'khoanh-khac', nav: 'Khoảnh khắc', html: momentsHtml },
    { id: 'dien-vien', nav: 'Diễn viên', html: castHtml },
    { id: 'dat-ve', nav: 'Đặt vé', html: bookingHtml },
  ];
  const present = sections.filter((section) => section.html);
  const has = (id: string): boolean => present.some((section) => section.id === id);
  const tab = (id: string, label: string, icon: string, main = false): string =>
    `<a href="#${id}"${main ? ' class="tab-main"' : ''}>${icon}${label}</a>`;
  // The bar's order is the mock-up's: home, schedule, booking in the middle, photos, cast.
  const tabs = [
    tab('home', 'Trang đầu', TAB_ICONS.home),
    has('lich') ? tab('lich', 'Lịch', TAB_ICONS.lich) : '',
    has('dat-ve') ? tab('dat-ve', 'Đặt vé', TAB_ICONS.ticket, true) : '',
    has('khoanh-khac') ? tab('khoanh-khac', 'Ảnh', TAB_ICONS.photo) : '',
    has('dien-vien') ? tab('dien-vien', 'Diễn viên', TAB_ICONS.cast) : '',
  ].filter(Boolean);

  const letters = order.map((side) => names[side]).filter(Boolean).map((name) => escapeHtml(initial(shortName(name))));
  const brand = letters.length > 0 ? letters.join('<span>&amp;</span>') : escapeHtml(initial(film));
  const pick = bothNames
    ? [
        '<div class="pick" id="pick" hidden role="dialog" aria-modal="true" aria-labelledby="pickTitle"><div class="pick-in">',
        `<p class="pick-brand">${brand}</p>`,
        '<h1 class="pick-title" id="pickTitle">Bạn là khách của ai?</h1><p class="pick-sub" id="pickSub">Chọn hồ sơ để vào rạp</p><ul class="pick-grid">',
        ...(['trai', 'gai'] as const).map((side) => {
          const short = shortName(names[side]);
          return `<li><button type="button" class="pf" data-side="${side}" data-of="${escapeHtml(short)}"><span class="pf-av pf-av--${side}"><span>${escapeHtml(initial(short))}</span></span><span class="pf-name">Khách ${WEDDING_SIDE_LABELS[side].toLocaleLowerCase('vi')}</span><span class="pf-of">Khách của ${escapeHtml(short)}</span></button></li>`;
        }),
        '</ul>',
        dateLabel ? `<p class="pick-date">Suất chiếu: ${dateLabel}</p>` : '',
        '</div></div>',
      ].join('')
    : '';

  const links = contactLinks(draft.contacts);
  const contacts = [
    links.zalo ? `<a href="${escapeHtml(links.zalo.href)}">Zalo ${escapeHtml(links.zalo.label)}</a>` : '',
    links.phone ? `<a href="${escapeHtml(links.phone.href)}">Gọi ${escapeHtml(links.phone.label)}</a>` : '',
    links.facebook ? `<a href="${escapeHtml(links.facebook.href)}">Facebook</a>` : '',
  ].filter(Boolean);

  const metaYear = year ? `<li>${year}</li>` : '';
  return pageDocument({
    title: [film, coupleText, dottedDay(draft.date)].filter(Boolean).join(' · '),
    description: intro || [`Thiệp mời đám cưới ${couple.join(' và ')}`.trim(), dateLabel].filter(Boolean).join(', '),
    palette,
    style: draft.style,
    css: [cinemaCss(palette.accent)],
    formOrigin,
    options,
    layout: { bodyClass: 'cinema', themeColor: CINEMA_BACKGROUND, fonts: cinemaFontFiles(), script: { source: CINEMA_SCRIPT, hash: CINEMA_SCRIPT_HASH } },
    body: [
      '<a class="skip" href="#main">Bỏ qua, tới nội dung</a>',
      pick,
      '<header class="top" id="top">',
      `<a class="brand" href="#home" aria-label="${escapeHtml(coupleText || film)}, về đầu trang">${brand}</a>`,
      `<nav class="top-nav" aria-label="Mục chính">${present.map((section) => `<a href="#${section.id}">${section.nav}</a>`).join('')}</nav>`,
      bothNames ? '<button type="button" class="me" id="me" hidden aria-label="Đổi hồ sơ"><span class="pf-av pf-av--sm" id="meAv"><span>?</span></span></button>' : '',
      '</header>',
      '<main id="main" tabindex="-1">',
      '<section class="hero" id="home" aria-label="Giới thiệu">',
      slides.length > 0 ? `<div class="hero-slides" id="slides">${slides.join('')}</div>` : '',
      '<div class="hero-shade" aria-hidden="true"></div>',
      '<div class="hero-body">',
      '<p class="eyebrow"><span class="dot" aria-hidden="true"></span> Suất chiếu đặc biệt</p>',
      `<h1 class="title">${titleHtml(film)}</h1>`,
      `<p class="tagline">${escapeHtml(tagline)}</p>`,
      `<ul class="meta" aria-label="Thông tin"><li class="meta-hl">Mới</li>${metaYear}<li><span class="box">Mọi lứa tuổi</span></li><li>1 suất duy nhất</li><li><span class="box">HD</span></li></ul>`,
      '<p class="hello" id="hello">Chào bạn! Suất chiếu này có một ghế dành riêng cho bạn.</p>',
      intro ? `<p class="lede">${escapeHtml(intro)}</p>` : '',
      has('dat-ve') || has('lich')
        ? [
            '<div class="actions">',
            has('dat-ve') ? '<a class="btn btn-play" href="#dat-ve"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M7 4v16l13-8z"/></svg>Đặt vé</a>' : '',
            has('lich')
              ? '<a class="btn btn-ghost" href="#lich"><svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="9" fill="none" stroke="currentColor" stroke-width="2"/><path d="M12 8v5M12 16v.5" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"/></svg>Thông tin</a>'
              : '',
            '</div>',
          ].join('')
        : '',
      '<p class="genres">Lãng mạn · Gia đình · Hài nhẹ</p>',
      '</div>',
      slides.length > 1 ? '<div class="hero-dots" id="dots" aria-hidden="true"></div>' : '',
      '</section>',
      ...present.map((section) => section.html),
      creditsHtml,
      '</main>',
      contacts.length > 0 ? `<footer class="foot wrap"><p>Liên hệ: ${contacts.join(' · ')}</p></footer>` : '',
      tabs.length > 1 ? `<nav class="tabs" id="tabs" aria-label="Điều hướng nhanh">${tabs.join('')}</nav>` : '',
      moments.length > 0
        ? '<div class="lb" id="lb" hidden role="dialog" aria-modal="true" aria-label="Xem ảnh"><button type="button" class="lb-x" data-lb="close" aria-label="Đóng">✕</button><button type="button" class="lb-nav lb-prev" data-lb="-1" aria-label="Ảnh trước">‹</button><figure class="lb-fig"><img id="lbImg" alt=""><figcaption id="lbCap"></figcaption></figure><button type="button" class="lb-nav lb-next" data-lb="1" aria-label="Ảnh sau">›</button></div>'
        : '',
    ],
  });
}
