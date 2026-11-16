/**
 * The link-in-bio page (see `page.ts` for what every page shares): a banner, the avatar over its edge (or the name's
 * initials), the name, handle and bio, the contact buttons, then the links as large buttons. No script.
 */
import { escapeHtml } from './html';
import { LINKS_CSS, LINKS_LOOK_CSS } from './links-styles';
import type { LinksDraft } from './links-schema';
import { LOOK_KIT_CSS, LOOK_TOKENS } from './looks';
import { contactLinks, dockNav, ICONS, img, pageDocument, type Action, type ImageAsset, type PageOptions, type RenderedPage } from './page';
import { PALETTES } from './palettes';
import { initials } from './profile-render';
import type { ShareCardContent } from './share-card';
import { webLink } from './web-links';

export function renderLinks(draft: LinksDraft, assets: ReadonlyMap<string, ImageAsset>, options: PageOptions = {}): RenderedPage {
  const name = draft.name.trim();
  const handle = draft.handle.trim();
  const bio = draft.bio.trim();
  const avatar = draft.avatar ? assets.get(draft.avatar) : undefined;
  const cover = draft.cover ? assets.get(draft.cover) : undefined;
  const letters = initials(name);

  const links = contactLinks(draft.contacts);
  const contacts: Action[] = [
    links.zalo ? { href: links.zalo.href, label: 'Zalo', icon: ICONS.chat } : null,
    links.phone ? { href: links.phone.href, label: 'Gọi', icon: ICONS.phone } : null,
    links.facebook ? { href: links.facebook.href, label: 'Facebook', icon: ICONS.link } : null,
  ].filter((action): action is Action => action !== null);
  const contactRow = contacts
    .map((action) => `<li><a class="l-contact" href="${escapeHtml(action.href)}">${action.icon}<span>${action.label}</span></a></li>`)
    .join('');

  const buttons = draft.links
    .map((item) => {
      const link = webLink(item.url);
      const label = item.label.trim();
      if (!label) return '';
      // A named link still without a working address: shown greyed in the editor's preview. Publishing refuses it
      // (`linkListIssues`), so a published page never has one.
      if (!link) return `<li><span class="l-link l-pending"><span class="l-label">${escapeHtml(label)}</span><span class="l-host">Chưa có link</span></span></li>`;
      return `<li><a class="l-link" href="${escapeHtml(link.href)}"><span class="l-label">${escapeHtml(label)}</span><span class="l-host">${escapeHtml(link.label)}</span></a></li>`;
    })
    .filter(Boolean);

  const photo = avatar
    ? `<div class="l-avatar">${img(avatar, name, '144px', !cover)}</div>`
    : letters
      ? `<div class="l-avatar l-initials" aria-hidden="true">${escapeHtml(letters)}</div>`
      : '';

  return pageDocument({
    title: name ? `${name}${handle ? ` (${handle})` : ''}` : 'Link',
    description: bio || handle,
    palette: PALETTES[draft.palette],
    style: draft.style,
    css: [LOOK_TOKENS[draft.style], LOOK_KIT_CSS[draft.style], LINKS_CSS, LINKS_LOOK_CSS[draft.style]],
    formOrigin: null,
    options,
    // The phone's bar: the first two ways to reach the owner.
    dock: dockNav(contacts.slice(0, 2), 'Liên hệ'),
    body: [
      `<header class="l-head${cover ? ' has-cover' : ''}">`,
      cover ? `<div class="l-cover">${img(cover, '', '(min-width:600px) 600px, 100vw', true)}</div>` : '',
      photo,
      name ? `<h1>${escapeHtml(name)}</h1>` : '',
      handle ? `<p class="l-handle">${escapeHtml(handle)}</p>` : '',
      bio ? `<p class="l-bio">${escapeHtml(bio)}</p>` : '',
      contactRow ? `<ul class="l-contacts" aria-label="Liên hệ">${contactRow}</ul>` : '',
      '</header>',
      buttons.length > 0 ? `<main class="l-main"><nav aria-label="Liên kết"><ul class="l-links">${buttons.join('')}</ul></nav></main>` : '',
    ].filter(Boolean),
  });
}

export function linksShareCard(draft: LinksDraft): ShareCardContent {
  return {
    kicker: draft.handle.trim(),
    title: draft.name.trim() || 'Link',
    description: draft.bio.trim(),
    palette: draft.palette,
    photo: draft.avatar,
  };
}
