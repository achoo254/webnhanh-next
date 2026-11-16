import { describe, expect, it } from 'vitest';
import { linksShareCard, renderLinks } from './links-render';
import { linksDraftSchema, linksImageIds, linksPublishIssues, newLinksDraft, sampleLinksDraft, type LinksDraft } from './links-schema';
import { imageAsset } from './page';

const AVATAR = '11111111-1111-4111-8111-111111111111';
const COVER = '22222222-2222-4222-8222-222222222222';
const assets = new Map([
  [AVATAR, imageAsset({ width: 900, height: 900, widths: [900] }, () => 'img/a.webp')],
  [COVER, imageAsset({ width: 900, height: 509, widths: [900] }, () => 'img/c.webp')],
]);
const sample = (overrides: Partial<LinksDraft> = {}): LinksDraft => ({ ...sampleLinksDraft({ avatar: AVATAR, cover: COVER }), ...overrides });
const NO_CONTACTS = { zalo: '', phone: '', facebook: '' };

describe('link-in-bio draft', () => {
  it('starts with two empty links; needs a name and something to tap', () => {
    const draft = newLinksDraft();
    expect(linksDraftSchema.safeParse(draft).success).toBe(true);
    expect(linksPublishIssues({ ...draft, links: [] })).toEqual([
      { field: 'name', code: 'required' },
      { field: 'links', code: 'no-links' },
    ]);
    expect(linksPublishIssues(sample({ links: [] }))).toEqual([]);
    expect(linksPublishIssues(sample({ contacts: NO_CONTACTS }))).toEqual([]);
    expect(linksPublishIssues(sample({ handle: '', bio: '', avatar: null, cover: null }))).toEqual([]);
  });

  it('checks each link like the profile page, and typed contacts', () => {
    const [first] = sample().links;
    if (!first) throw new Error('sample has links');
    expect(linksPublishIssues(sample({ links: [{ ...first, url: 'javascript:alert(1)' }] }))).toEqual([{ field: 'links.0.url', code: 'invalid-url' }]);
    expect(linksPublishIssues(sample({ links: [{ ...first, label: '' }] }))).toEqual([{ field: 'links.0.label', code: 'required' }]);
    expect(linksPublishIssues(sample({ contacts: { ...NO_CONTACTS, phone: '12' } }))).toEqual([{ field: 'contacts.phone', code: 'invalid-phone' }]);
    expect(linksDraftSchema.safeParse(sample({ links: [first, first] })).success).toBe(false);
  });

  it('lists the avatar then the banner', () => {
    expect(linksImageIds(sample())).toEqual([AVATAR, COVER]);
    expect(linksImageIds(sample({ cover: null }))).toEqual([AVATAR]);
  });
});

describe('renderLinks', () => {
  it('shows the banner, the avatar, name, handle and bio, the contact buttons and the links, the first one first', () => {
    const { html } = renderLinks(sample(), assets);
    expect(html).toContain('<header class="l-head has-cover">');
    expect(html).toContain('<h1>Minh Thư</h1>');
    expect(html).toContain('<p class="l-handle">@minhthu.daily</p>');
    expect(html).toContain('<a class="l-contact" href="https://zalo.me/0912345678">');
    expect(html).toContain('href="https://www.facebook.com/minhthu.daily"');
    expect(html.indexOf('Video mới nhất trên TikTok')).toBeLessThan(html.indexOf('List quán ngon Sài Gòn'));
    expect(html).not.toMatch(/<script|<form/);
  });

  it('shows the initials without a photo, and leaves out broken links', () => {
    const [first] = sample().links;
    if (!first) throw new Error('sample has links');
    const { html } = renderLinks(sample({ avatar: null, cover: null, links: [{ ...first, url: 'not a link' }] }), assets);
    expect(html).toContain('<div class="l-avatar l-initials" aria-hidden="true">MT</div>');
    expect(html).not.toContain('class="l-links"');
  });

  it('escapes what the owner typed', () => {
    expect(renderLinks(sample({ bio: '<script>x</script>' }), assets).html).toContain('&lt;script&gt;x&lt;/script&gt;');
  });

  it('shares the name, the handle and the avatar', () => {
    expect(linksShareCard(sample())).toMatchObject({ kicker: '@minhthu.daily', title: 'Minh Thư', photo: AVATAR });
  });
});
