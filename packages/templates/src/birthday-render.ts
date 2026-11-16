/**
 * The birthday card page (see `page.ts` for what every page shares): confetti drawn in CSS, the card with the title,
 * the name, a photo, the wish and who sends it, a few more photos, and "Gửi lời chúc" with the owner's contacts. No
 * form, so no script.
 */
import { BIRTHDAY_CSS, BIRTHDAY_LOOK_CSS } from './birthday-styles';
import { BIRTHDAY_DEFAULT_TITLE, type BirthdayDraft } from './birthday-schema';
import { escapeHtml } from './html';
import { LOOK_CONTACT_CSS, LOOK_KIT_CSS, LOOK_TOKENS } from './looks';
import {
  contactItem,
  contactLinks,
  contactSection,
  decorationAssets,
  decorationImg,
  dockNav,
  ICONS,
  img,
  pageDocument,
  type Action,
  type ImageAsset,
  type PageOptions,
  type RenderedPage,
} from './page';
import { PALETTES } from './palettes';
import type { ShareCardContent } from './share-card';

/** Confetti across the top of the page: decoration only. */
const CONFETTI = '<div class="b-confetti" aria-hidden="true"></div>';

export function renderBirthday(draft: BirthdayDraft, assets: ReadonlyMap<string, ImageAsset>, options: PageOptions = {}): RenderedPage {
  const kicker = draft.kicker.trim();
  const title = draft.title.trim();
  const name = draft.name.trim();
  const message = draft.message.trim();
  const sender = draft.sender.trim();
  const photo = draft.photo ? assets.get(draft.photo) : undefined;
  const [ornament, second] = decorationAssets(draft.ornaments, assets);

  const links = contactLinks(draft.contacts);
  const replyItems = draft.reply
    ? [contactItem(links.zalo, 'Chúc qua Zalo', ICONS.chat), contactItem(links.phone, 'Gọi chúc mừng', ICONS.phone), contactItem(links.facebook, 'Nhắn Facebook', ICONS.link)].filter(
        Boolean,
      )
    : [];
  const actions: Action[] = draft.reply
    ? [
        links.zalo ? { href: links.zalo.href, label: 'Chúc qua Zalo', icon: ICONS.chat } : null,
        links.phone ? { href: links.phone.href, label: 'Gọi chúc mừng', icon: ICONS.phone } : null,
      ].filter((action): action is Action => action !== null)
    : [];
  const replyIntro = name ? `<p class="reply-intro">Gửi ${escapeHtml(name)} một lời chúc nhé.</p>` : '';
  const reply = contactSection(replyItems, { heading: 'Gửi lời chúc', headingId: 'gui-loi-chuc', intro: replyIntro });

  const gallery = draft.gallery
    .map((id) => assets.get(id))
    .filter((asset): asset is ImageAsset => asset !== undefined)
    .map((asset) => `<li>${img(asset, '', '(min-width:720px) 300px, 50vw', false)}</li>`);

  const heading = [title ? `<span class="b-title">${escapeHtml(title)}</span>` : '', name ? `<span class="b-name">${escapeHtml(name)}</span>` : ''].join('');

  return pageDocument({
    title: [title || BIRTHDAY_DEFAULT_TITLE, name].filter(Boolean).join(' · '),
    description: message,
    palette: PALETTES[draft.palette],
    style: draft.style,
    css: [LOOK_TOKENS[draft.style], LOOK_KIT_CSS[draft.style], LOOK_CONTACT_CSS[draft.style], BIRTHDAY_CSS, BIRTHDAY_LOOK_CSS[draft.style]],
    formOrigin: null,
    options,
    dock: dockNav(actions, 'Gửi lời chúc'),
    body: [
      CONFETTI,
      '<main class="b-main">',
      '<article class="b-card">',
      ornament ? decorationImg(ornament, 'b-orn b-orn-1', '104px') : '',
      second ? decorationImg(second, 'b-orn b-orn-2', '104px') : '',
      kicker ? `<p class="b-kicker">${escapeHtml(kicker)}</p>` : '',
      heading ? `<h1>${heading}</h1>` : '',
      photo ? `<div class="frame b-photo">${img(photo, name, '(min-width:600px) 400px, 86vw', true)}</div>` : '',
      message ? `<p class="b-message">${escapeHtml(message)}</p>` : '',
      sender ? `<p class="b-from"><span>Thương,</span> <strong>${escapeHtml(sender)}</strong></p>` : '',
      '</article>',
      gallery.length > 0 ? `<section aria-labelledby="kk"><h2 id="kk">Khoảnh khắc</h2><ul class="b-gallery">${gallery.join('')}</ul></section>` : '',
      reply,
      '</main>',
    ].filter(Boolean),
  });
}

export function birthdayShareCard(draft: BirthdayDraft): ShareCardContent {
  const name = draft.name.trim();
  const sender = draft.sender.trim();
  return {
    kicker: draft.kicker.trim() || 'Thiệp sinh nhật',
    title: [draft.title.trim() || BIRTHDAY_DEFAULT_TITLE, name].filter(Boolean).join(' '),
    description: sender ? `Từ ${sender}` : draft.message.trim(),
    palette: draft.palette,
    photo: draft.photo,
  };
}
