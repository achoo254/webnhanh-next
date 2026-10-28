/**
 * The Tết card page (see `page.ts` for what every page shares): lanterns and apricot blossoms drawn in CSS and inline
 * SVG (no words in any picture: every text is the sender's, in HTML), the card itself, and "Gửi lời chúc lại" with the
 * sender's contacts. No form, so no script.
 */
import { escapeHtml } from './html';
import { LOOK_CONTACT_CSS, LOOK_KIT_CSS, LOOK_TOKENS } from './looks';
import { BLOSSOM } from './ornaments';
import { contactItem, contactLinks, contactSection, dockNav, ICONS, img, pageDocument, type Action, type ImageAsset, type PageOptions, type RenderedPage } from './page';
import { PALETTES } from './palettes';
import type { ShareCardContent } from './share-card';
import { TET_YEAR, type TetDraft } from './tet-schema';
import { TET_CSS, TET_LOOK_CSS } from './tet-styles';

/** Two lanterns hanging from the top of the page, on strings of different lengths. */
const SKY =
  '<div class="tet-sky" aria-hidden="true"><span class="hang hang-1"><span class="lantern"></span></span><span class="hang hang-2"><span class="lantern"></span></span></div>';

export function renderTet(draft: TetDraft, assets: ReadonlyMap<string, ImageAsset>, options: PageOptions = {}): RenderedPage {
  const title = draft.title.trim();
  const recipient = draft.recipient.trim();
  const greeting = draft.greeting.trim();
  const sender = draft.sender.trim();
  const photo = draft.photo ? assets.get(draft.photo) : undefined;

  const links = contactLinks(draft.contacts);
  const replyItems = draft.reply
    ? [contactItem(links.zalo, 'Chúc lại qua Zalo', ICONS.chat), contactItem(links.phone, 'Gọi chúc Tết', ICONS.phone), contactItem(links.facebook, 'Nhắn Facebook', ICONS.link)].filter(
        Boolean,
      )
    : [];
  const actions: Action[] = draft.reply
    ? [
        links.zalo ? { href: links.zalo.href, label: 'Chúc lại qua Zalo', icon: ICONS.chat } : null,
        links.phone ? { href: links.phone.href, label: 'Gọi chúc Tết', icon: ICONS.phone } : null,
      ].filter((action): action is Action => action !== null)
    : [];
  const replyIntro = sender ? `<p class="reply-intro">Nhắn cho ${escapeHtml(sender)} một lời chúc nhé.</p>` : '';
  const reply = contactSection(replyItems, { heading: 'Gửi lời chúc lại', headingId: 'chuc-lai', intro: replyIntro });

  return pageDocument({
    title: [title || 'Chúc mừng năm mới', sender].filter(Boolean).join(' · '),
    description: greeting,
    palette: PALETTES[draft.palette],
    style: draft.style,
    css: [LOOK_TOKENS[draft.style], LOOK_KIT_CSS[draft.style], LOOK_CONTACT_CSS[draft.style], TET_CSS, TET_LOOK_CSS[draft.style]],
    formOrigin: null,
    options,
    dock: dockNav(actions, 'Chúc lại'),
    body: [
      SKY,
      '<main class="tet">',
      '<article class="tet-card">',
      BLOSSOM('bl bl-1'),
      BLOSSOM('bl bl-2'),
      BLOSSOM('bl bl-3'),
      `<p class="year">${TET_YEAR}</p>`,
      recipient ? `<p class="to">${escapeHtml(recipient)}</p>` : '',
      title ? `<h1>${escapeHtml(title)}</h1>` : '',
      photo ? `<div class="frame tet-photo">${img(photo, '', '(min-width:600px) 380px, 86vw', true)}</div>` : '',
      greeting ? `<p class="greeting">${escapeHtml(greeting)}</p>` : '',
      sender ? `<p class="from"><span>Thân chúc,</span> <strong>${escapeHtml(sender)}</strong></p>` : '',
      '</article>',
      reply,
      '</main>',
    ].filter(Boolean),
  });
}

export function tetShareCard(draft: TetDraft): ShareCardContent {
  const sender = draft.sender.trim();
  return {
    kicker: TET_YEAR,
    title: draft.title.trim() || 'Chúc mừng năm mới',
    description: sender ? `Từ ${sender}` : draft.greeting.trim(),
    palette: draft.palette,
    photo: draft.photo,
  };
}
