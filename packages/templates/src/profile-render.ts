/**
 * The profile / link-in-bio page (see `page.ts` for what every page shares): one centred column with the photo (or the
 * name's initials), the name, a line and a bio, round social buttons, and the links as large buttons. No script.
 */
import { escapeHtml } from './html';
import { LOOK_KIT_CSS, LOOK_TOKENS } from './looks';
import { ICONS, img, pageDocument, type ImageAsset, type PageOptions, type RenderedPage } from './page';
import { PALETTES } from './palettes';
import { PROFILE_CSS, PROFILE_LOOK_CSS } from './profile-styles';
import { SOCIAL_KEYS, SOCIAL_LINKS, type ProfileDraft, type SocialKey } from './profile-schema';
import type { ShareCardContent } from './share-card';
import { webLink } from './web-links';

const icon = (paths: string): string => `<svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">${paths}</svg>`;

/** Each network's button: its icon and what a screen reader says. */
const SOCIAL_BUTTONS: Readonly<Record<SocialKey, { readonly icon: string; readonly name: string }>> = {
  facebook: { icon: icon('<path d="M14 8h3V4h-3a4 4 0 0 0-4 4v3H7v4h3v6h4v-6h3l1-4h-4V8z"/>'), name: 'Facebook' },
  instagram: { icon: ICONS.camera, name: 'Instagram' },
  tiktok: { icon: ICONS.note, name: 'TikTok' },
  youtube: { icon: ICONS.play, name: 'YouTube' },
  zalo: { icon: ICONS.chat, name: 'Zalo' },
  phone: { icon: ICONS.phone, name: 'Gọi điện' },
  email: { icon: ICONS.mail, name: 'Email' },
};

/** Up to two initials of a name ("Lan Anh" → "LA"), for when there is no photo. */
export function initials(name: string): string {
  const words = name.trim().split(/\s+/).filter(Boolean);
  const picked = words.length > 1 ? [words[0], words[words.length - 1]] : words;
  return picked.map((word) => [...(word ?? '')][0]?.toLocaleUpperCase('vi') ?? '').join('');
}

export function renderProfile(draft: ProfileDraft, assets: ReadonlyMap<string, ImageAsset>, options: PageOptions = {}): RenderedPage {
  const name = draft.name.trim();
  const headline = draft.headline.trim();
  const bio = draft.bio.trim();
  const avatar = draft.avatar ? assets.get(draft.avatar) : undefined;
  const letters = initials(name);

  const socials = SOCIAL_KEYS.map((key) => {
    const link = SOCIAL_LINKS[key].link(draft.socials[key]);
    if (!link) return '';
    const button = SOCIAL_BUTTONS[key];
    return `<li><a href="${escapeHtml(link.href)}" title="${button.name}">${button.icon}<span class="vh">${button.name}: ${escapeHtml(link.label)}</span></a></li>`;
  }).filter(Boolean);

  const links = draft.links
    .map((item) => {
      const link = webLink(item.url);
      const label = item.label.trim();
      if (!link || !label) return '';
      return `<li><a class="p-link" href="${escapeHtml(link.href)}"><span class="p-label">${escapeHtml(label)}</span><span class="p-host">${escapeHtml(link.label)}</span></a></li>`;
    })
    .filter(Boolean);

  const photo = avatar
    ? `<div class="p-avatar">${img(avatar, name, '160px', true)}</div>`
    : letters
      ? `<div class="p-avatar p-initials" aria-hidden="true">${escapeHtml(letters)}</div>`
      : '';

  return pageDocument({
    title: name || 'Hồ sơ',
    description: headline || bio,
    palette: PALETTES[draft.palette],
    style: draft.style,
    css: [LOOK_TOKENS[draft.style], LOOK_KIT_CSS[draft.style], PROFILE_CSS, PROFILE_LOOK_CSS[draft.style]],
    formOrigin: null,
    options,
    body: [
      '<main class="p-main">',
      '<header class="p-head">',
      photo,
      name ? `<h1>${escapeHtml(name)}</h1>` : '',
      headline ? `<p class="p-headline">${escapeHtml(headline)}</p>` : '',
      bio ? `<p class="p-bio">${escapeHtml(bio)}</p>` : '',
      socials.length > 0 ? `<ul class="p-socials" aria-label="Mạng xã hội và liên hệ">${socials.join('')}</ul>` : '',
      '</header>',
      links.length > 0 ? `<nav aria-label="Liên kết"><ul class="p-links">${links.join('')}</ul></nav>` : '',
      '</main>',
    ].filter(Boolean),
  });
}

export function profileShareCard(draft: ProfileDraft): ShareCardContent {
  return {
    kicker: '',
    title: draft.name.trim() || 'Hồ sơ',
    description: draft.headline.trim() || draft.bio.trim(),
    palette: draft.palette,
    photo: draft.avatar,
  };
}
