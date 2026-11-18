import { describe, expect, it } from 'vitest';
import { ORDER_SCRIPT, ORDER_SCRIPT_HASH } from './order-form';
import { imageAsset } from './page';
import { renderCard } from './share-card';
import { draftFontFiles } from './templates';
import { CINEMA_DEFAULT_TAGLINE, CINEMA_DEFAULT_TITLE, renderWeddingCinema } from './wedding-cinema-render';
import { CINEMA_SCRIPT, CINEMA_SCRIPT_HASH } from './wedding-cinema-script';
import { renderWedding, weddingShareCard } from './wedding-render';
import { sampleWeddingDraft, weddingDraftSchema, weddingImageIds, type WeddingDraft } from './wedding-schema';

const COVER = '11111111-1111-4111-8111-111111111111';
const PHOTOS = ['22222222-2222-4222-8222-222222222222', '33333333-3333-4333-8333-333333333333', '44444444-4444-4444-8444-444444444444'];
const PORTRAIT = '55555555-5555-4555-8555-555555555555';
const assets = new Map([COVER, ...PHOTOS, PORTRAIT].map((id, i) => [id, imageAsset({ width: 675, height: 900, widths: [400, 675] }, (w) => `img/p${i}-${w}.webp`)]));
const NOW = new Date('2026-11-18T03:00:00Z');
const FORM = { action: 'https://webnhanh.hoandat.com/f/minh-thao', token: 't' };

/** A "Rạp phim" invitation using every part. */
const cinema = (overrides: Partial<WeddingDraft> = {}): WeddingDraft => ({
  ...sampleWeddingDraft({ cover: COVER }),
  groom: 'Minh Khoa',
  bride: 'Thảo Vy',
  date: '2026-12-05',
  layout: 'cinema',
  hostSide: 'chung',
  gallery: PHOTOS,
  parents: { groom: ['Ông Nguyễn Văn Hải'], bride: ['Bà Phạm Thị Lan'] },
  story: [{ key: 's1', when: '2018-09', title: 'Ghế bên cạnh', text: 'Chung một lớp tiếng Anh.', photo: PHOTOS[0] }],
  portraits: { groom: PORTRAIT },
  events: [
    { key: 'e1', label: 'Lễ Vu Quy', date: '', time: '08:30', venue: 'Tư gia nhà gái', address: '12 Lê Lợi, Huế', side: 'gai' },
    { key: 'e2', label: 'Lễ Thành Hôn', date: '', time: '10:30', venue: 'Tư gia nhà trai', address: '45 Trần Phú, Huế', side: 'trai' },
    { key: 'e3', label: 'Tiệc cưới', date: '', time: '18:00', venue: 'Nhà hàng Hoàng Cung', address: '9 Ngô Quyền, Huế', side: '' },
  ],
  ...overrides,
});
const page = (draft: WeddingDraft = cinema(), form = true): string =>
  renderWedding(draft, assets, { now: NOW, ...(form ? { rsvpForm: FORM } : {}), fontUrl: (file) => `fonts/${file}` }).html;

async function sha256(text: string): Promise<string> {
  // Web Crypto: this package is browser code, without Node's types.
  const digest = new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text)));
  return btoa(String.fromCharCode(...digest));
}

describe('wedding layout field', () => {
  it('reads drafts without a layout as before, and takes the cinema fields only within their limits', () => {
    const { layout: _layout, filmTitle: _title, tagline: _tagline, portraits: _portraits, ...older } = cinema();
    expect(weddingDraftSchema.parse(older).layout).toBeUndefined();
    expect(renderWedding(older, assets, { now: NOW }).html).not.toContain('class="cinema"');
    expect(weddingDraftSchema.safeParse(cinema({ filmTitle: 'x'.repeat(40), tagline: 'y'.repeat(80) })).success).toBe(true);
    for (const patch of [{ layout: 'poster' }, { filmTitle: 'x'.repeat(41) }, { tagline: 'a\nb' }, { portraits: { groom: 'abc' } }, { portraits: { aunt: PORTRAIT } }]) {
      expect(weddingDraftSchema.safeParse({ ...cinema(), ...patch }).success, JSON.stringify(patch)).toBe(false);
    }
  });

  it('counts the portraits among the photos, and keeps every field when the layout changes', () => {
    expect(weddingImageIds(cinema())).toEqual([COVER, ...PHOTOS, PORTRAIT]);
    const standard = page(cinema({ layout: 'standard', filmTitle: 'Phim riêng' }));
    expect(standard).not.toContain('Phim riêng');
    expect(standard).toContain('<span class="name">Minh Khoa</span>');
    expect(page(cinema({ filmTitle: 'Phim riêng' }))).toContain('Phim riêng');
  });
});

describe('cinema script', () => {
  it('is pinned by its CSP hash, small, and holds nothing of a card', async () => {
    expect(`sha256-${await sha256(CINEMA_SCRIPT)}`).toBe(CINEMA_SCRIPT_HASH);
    expect(new TextEncoder().encode(CINEMA_SCRIPT).length).toBeLessThan(15 * 1024);
    expect(CINEMA_SCRIPT).not.toMatch(/<\/script|<!--|fetch\(|XMLHttpRequest|eval\(|new Function/i);
    // The other family's events are hidden by the script, after a profile is picked or the link names the family.
    expect(CINEMA_SCRIPT).toContain("classList.toggle('is-other'");
  });
});

describe('renderWeddingCinema', () => {
  it('runs only its fixed script and the form script, allowed by their hashes', () => {
    const html = page();
    const csp = (text: string): string => text.replaceAll('&#39;', "'");
    expect(csp(html)).toContain(`script-src '${CINEMA_SCRIPT_HASH}' '${ORDER_SCRIPT_HASH}'; connect-src https://webnhanh.hoandat.com; form-action https://webnhanh.hoandat.com`);
    expect(html.match(/<script>[\s\S]*?<\/script>/g)).toEqual([`<script>${ORDER_SCRIPT}</script>`, `<script>${CINEMA_SCRIPT}</script>`]);
    expect(html).not.toMatch(/unsafe-inline'[^;]*script|\son[a-z]+=/);
    const preview = page(cinema(), false);
    expect(csp(preview)).toContain(`script-src '${CINEMA_SCRIPT_HASH}'; form-action 'none'`);
    expect(preview).not.toContain('<form');
  });

  it('loads its own fonts and no look', () => {
    const html = page();
    expect(html).toContain('<body class="cinema">');
    expect(html).toContain('font-family:"Anton"');
    expect(html).toContain('<link rel="preload" href="fonts/anton-latin-400-normal.woff2"');
    expect(html).toContain('<meta name="theme-color" content="#0b0809">');
    expect(draftFontFiles({ template: 'wedding', draft: cinema() }).map((font) => font.file)).toContain('anton-vietnamese-400-normal.woff2');
    expect(draftFontFiles({ template: 'wedding', draft: cinema({ layout: 'standard' }) }).some((font) => font.source === 'anton')).toBe(false);
  });

  it('has every event in the page, each with its family, and counts down to the earliest one for everyone', () => {
    const html = page();
    expect([...html.matchAll(/<li class="show[^"]*" data-side="([^"]*)"/g)].map((match) => match[1])).toEqual(['gai', 'trai', '']);
    expect(html).toContain('<li class="show show--main" data-side="" data-reveal>');
    expect(html).toContain('<p class="show-tag">Nhà gái</p><h3>Lễ Vu Quy</h3>');
    expect(html).toContain('<p class="show-tag">Suất chính · mời tất cả</p>');
    expect(html).toContain('data-at="2026-12-05T18:00:00+07:00"');
    expect(html).toContain('Còn <b>17 ngày</b> nữa tới suất chiếu');
    expect(html.match(/calendar\.google\.com/g)).toHaveLength(3);
    // Without an event for everyone, the countdown runs to the wedding day.
    const sided = cinema({ events: cinema().events.slice(0, 2) });
    expect(page(sided)).toContain('data-at="2026-12-05T00:00:00+07:00"');
  });

  it('fills the film from the draft, with the layout\'s own title and tagline when empty', () => {
    const html = page();
    expect(html).toContain('<h1 class="title">Chuyện<br>Chúng Mình</h1>');
    expect(html).toContain(`<p class="tagline">${CINEMA_DEFAULT_TAGLINE}</p>`);
    expect(html).toContain(`<title>${CINEMA_DEFAULT_TITLE} · Minh Khoa &amp; Thảo Vy · 05.12.2026</title>`);
    expect(html).toContain('<button type="button" class="pf" data-side="trai" data-of="Khoa">');
    expect(html).toContain('<a class="brand" href="#home" aria-label="Minh Khoa &amp; Thảo Vy, về đầu trang">K<span>&amp;</span>V</a>');
    expect(html).toContain('Phần 1 · 2 tập');
    expect(html).toContain('<h2 class="h2" id="kkTitle">Top 3 khoảnh khắc</h2>');
    expect(html).toContain('alt="Chân dung Minh Khoa"');
    expect(html).toContain('<div class="cast-ph cast-ph--initial" aria-hidden="true"><span>V</span></div>');
    expect(html).toContain('<div><h3>Nhà trai</h3><p>Ông Nguyễn Văn Hải</p></div>'.replace('<div>', '<div data-reveal>'));
    expect(html).toContain('id="booking" data-film="Chuyện Chúng Mình" data-day="Thứ Bảy 05.12" data-time="18:00" data-code="KV"');
    expect(html).toContain('<label for="r-name">Tên in trên vé</label>');
    expect(html).toContain('<button type="submit">Đặt vé</button>');
    const own = page(cinema({ filmTitle: 'Hẹn Ước', tagline: 'Tập đặc biệt' }));
    expect(own).toContain('<h1 class="title">Hẹn Ước</h1>');
    expect(own).toContain('<p class="tagline">Tập đặc biệt</p>');
  });

  it('leaves out every part it has no data for, with no sample words', () => {
    const bare = page(cinema({ groom: '', bride: '', intro: '', story: [], gallery: [], cover: null, parents: undefined, events: [], date: '', rsvp: false }));
    for (const part of ['id="lich"', 'id="tap"', 'id="khoanh-khac"', 'id="dien-vien"', 'id="dat-ve"', 'id="credits"', 'id="pick"', 'id="slides"', 'class="lede"', 'id="tabs"']) {
      expect(bare, part).not.toContain(part);
    }
    expect(bare).toContain('<h1 class="title">Chuyện<br>Chúng Mình</h1>');
  });

  it('escapes every text the owner types', () => {
    const mark = (name: string): string => `"><b id=${name}>'&`;
    const html = page(
      cinema({
        groom: mark('g'),
        bride: mark('b'),
        intro: mark('i'),
        filmTitle: mark('f'),
        tagline: mark('t'),
        rsvpNote: mark('n'),
        parents: { groom: [mark('pg')], bride: [mark('pb')] },
        story: [{ key: 's1', when: '2018-09', title: mark('st'), text: mark('sx') }],
        events: [{ key: 'e1', label: mark('el'), date: '', time: '18:00', venue: mark('ev'), address: '9 Ngô Quyền, Huế', side: '' }],
      }),
    );
    for (const name of ['g', 'b', 'i', 'f', 't', 'n', 'pg', 'pb', 'st', 'sx', 'el', 'ev']) {
      expect(html, name).not.toContain(`<b id=${name}>`);
      expect(html, name).toContain(`&lt;b id=${name}&gt;`);
    }
  });

  it('renders directly too', () => {
    expect(renderWeddingCinema(cinema(), assets, { now: NOW }).html).toContain('<body class="cinema">');
  });
});

describe('cinema share picture', () => {
  it('is dark with the film title', () => {
    const content = weddingShareCard(cinema());
    expect(content).toMatchObject({ kicker: 'Suất chiếu đặc biệt', title: CINEMA_DEFAULT_TITLE, description: 'Minh Khoa & Thảo Vy · Thứ Bảy, 05.12.2026', theme: 'cinema' });
    const card = renderCard(content, assets, { host: 'minh-thao.hoandat.io.vn', fontUrl: (file) => `fonts/${file}` });
    expect(card).toContain('#0b0809');
    expect(card).toContain('text-transform:uppercase');
    expect(weddingShareCard(cinema({ layout: 'standard' })).theme).toBeUndefined();
  });
});
