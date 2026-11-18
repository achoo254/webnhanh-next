import { describe, expect, it } from 'vitest';
import { STYLE_IDS } from './looks';
import { imageAsset } from './page';
import { rsvpFormHtml, rsvpInputSchema } from './rsvp-form';
import { countdownText, daysUntil, renderWedding, storyMonthLabel, weddingDateLabel, weddingShareCard } from './wedding-render';
import {
  isIsoDate,
  isIsoMonth,
  isTime,
  newWeddingDraft,
  sampleWeddingDraft,
  WEDDING_LIMITS,
  weddingDraftSchema,
  weddingImageIds,
  weddingPublishIssues,
  type WeddingDraft,
  type WeddingStory,
} from './wedding-schema';

const COVER = '11111111-1111-4111-8111-111111111111';
const assets = new Map([[COVER, imageAsset({ width: 675, height: 900, widths: [675] }, () => 'img/w.webp')]]);
const sample = (overrides: Partial<WeddingDraft> = {}): WeddingDraft => ({ ...sampleWeddingDraft({ cover: COVER }), ...overrides });
const NOW = new Date('2026-11-01T03:00:00Z');
const PHOTO = '22222222-2222-4222-8222-222222222222';
const FORM = { action: 'https://webnhanh.hoandat.com/f/minh-thao', token: 't' };

/** An invitation saved before the two families existed: none of `hostSide`, `parents`, `story`, `events[].side`. */
const legacyDraft = (style: WeddingDraft['style']): WeddingDraft => ({
  groom: 'Minh',
  bride: 'Thảo',
  intro:
    'Sau sáu năm đi cùng nhau qua bao mùa mưa nắng, tụi mình quyết định về chung một nhà. Ngày vui sẽ trọn vẹn hơn khi có bạn ở đó, cùng nâng ly và chia sẻ niềm hạnh phúc này.',
  date: '2026-12-12',
  lunarDate: 'Tức ngày 4 tháng 11 năm Bính Ngọ',
  cover: COVER,
  events: [
    { key: 'e1', label: 'Lễ thành hôn', date: '', time: '09:00', venue: 'Tư gia nhà gái', address: '25 Nguyễn Trãi, Phường Bến Thành, TP. Hồ Chí Minh' },
    { key: 'e2', label: 'Tiệc cưới', date: '', time: '18:00', venue: 'Nhà hàng Hoa Sen, sảnh Ngọc Lan', address: '120 Lê Lợi, Phường Sài Gòn, TP. Hồ Chí Minh' },
    { key: 'e3', label: 'Lễ vu quy', date: '2026-12-11', time: '', venue: 'Tư gia', address: '' },
  ],
  gallery: [COVER],
  rsvp: true,
  rsvpNote: 'Mong bạn báo trước ngày 1/12 để tụi mình chuẩn bị chu đáo nhé.',
  contacts: { zalo: '0912345678', phone: '0912345678', facebook: '' },
  palette: 'blush',
  style,
  ornaments: [COVER],
});

/**
 * SHA-256 of the pages `legacyDraft` rendered to before the two families existed (`now` = NOW; the form pages with
 * the form script and its CSP hash blanked, as the script changed since). Published invitations are rendered again
 * every day from their saved draft: these keep an older one looking exactly as it did. Change them only on purpose.
 */
const LEGACY_DIGESTS = {
  'ruc-ro': { preview: 'cmy9Nav23TkDM/3AQhUyIHlZ89VnW+bmh/SroHYblG8=', form: 'NTlPSGwBhkAGQRvfB2Dw+I42yJEMo0ATBjkn3ujg9aQ=' },
  'tinh-te': { preview: 'UvXdKmrX3ucifw7JbqL0+ugI7XcHSu/V5BoR74KqwvI=', form: 'S9o0llbOqgTaSOcQAZhz5ZqsmwFOXWiTifPL8Bhqfo4=' },
  'am-cung': { preview: '1QQkh6uLKtKD+Z5u/smOEYIvXSaFUuFROzJaYMGLLfM=', form: 'M8ayA4jgVgIjnO/xCd2Ui1kBuQgSgeQViORvP/xg174=' },
} as const satisfies Record<WeddingDraft['style'], { preview: string; form: string }>;

async function sha256(text: string): Promise<string> {
  // Web Crypto: this package is browser code, without Node's types.
  const digest = new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text)));
  return btoa(String.fromCharCode(...digest));
}

const withoutScript = (html: string): string => html.replace(/<script>[\s\S]*?<\/script>/g, '<script></script>').replace(/sha256-[A-Za-z0-9+/=]+/g, 'sha256-');

const moment = (overrides: Partial<WeddingStory> = {}): WeddingStory => ({ key: 's1', when: '2019-05', title: 'Lần đầu gặp nhau', text: 'Ở quán cà phê đầu hẻm.', ...overrides });

/** An invitation using every newer part: the bride's family sends it. */
const familyDraft = (overrides: Partial<WeddingDraft> = {}): WeddingDraft => {
  const base = sample();
  return {
    ...base,
    hostSide: 'gai',
    parents: { groom: ['Ông Trần Văn An', 'Bà Lê Thị Bình'], bride: ['Ông Nguyễn Văn Cường'] },
    story: [moment({ photo: PHOTO }), moment({ key: 's2', when: '', title: 'Cầu hôn', text: '' })],
    events: base.events.map((event, index) => ({ ...event, side: index === 0 ? 'gai' : '' })),
    ...overrides,
  };
};

describe('wedding draft', () => {
  it('checks dates and times as the date and time inputs give them', () => {
    expect(isIsoDate('2026-12-12')).toBe(true);
    expect(isIsoDate('2026-02-30')).toBe(false);
    expect(isIsoDate('12/12/2026')).toBe(false);
    expect(isTime('18:00')).toBe(true);
    expect(isTime('24:00')).toBe(false);
    expect(weddingDraftSchema.safeParse(sample({ date: '2026-13-01' })).success).toBe(false);
    expect(weddingDraftSchema.safeParse(sample({ date: '' })).success).toBe(true);
  });

  it('needs the couple, the day and at least one event with a place, and real map links', () => {
    expect(weddingPublishIssues(sample({ groom: '', date: '', events: [] }))).toEqual([
      { field: 'groom', code: 'required' },
      { field: 'date', code: 'required' },
      { field: 'events', code: 'no-events' },
    ]);
    const [first] = sample().events;
    if (!first) throw new Error('sample has events');
    expect(weddingPublishIssues(sample({ events: [{ ...first, venue: '', address: '' }] }))).toEqual([{ field: 'events.0.venue', code: 'required' }]);
    expect(weddingPublishIssues(sample({ events: [{ ...first, address: 'https://evil.com/maps' }] }))).toEqual([{ field: 'events.0.address', code: 'invalid-map' }]);
  });

  it('takes replies through the form, so contacts are optional but must work when typed', () => {
    expect(weddingPublishIssues(sample({ contacts: { zalo: '', phone: '', facebook: '' } }))).toEqual([]);
    expect(weddingPublishIssues(sample({ rsvp: false, contacts: { zalo: '', phone: '', facebook: '' } }))).toEqual([]);
    expect(weddingPublishIssues(sample({ contacts: { zalo: 'abc', phone: '', facebook: '' } }))).toEqual([{ field: 'contacts.zalo', code: 'invalid-zalo' }]);
  });
});

describe('wedding families and story', () => {
  it('parses a draft saved before them as it was, with nothing added', () => {
    const legacy = legacyDraft('tinh-te');
    expect(weddingDraftSchema.parse(legacy)).toEqual(legacy);
  });

  it('accepts every newer part up to its limits', () => {
    const full = familyDraft({
      parents: { groom: ['x'.repeat(WEDDING_LIMITS.parent), 'y'], bride: ['z', 'w'] },
      story: Array.from({ length: WEDDING_LIMITS.story }, (_, i) =>
        moment({ key: `s${i}`, title: 't'.repeat(WEDDING_LIMITS.storyTitle), text: 'a\nb'.padEnd(WEDDING_LIMITS.storyText, 'c') }),
      ),
    });
    expect(weddingDraftSchema.safeParse(full).success).toBe(true);
    expect(weddingDraftSchema.safeParse({ ...full, hostSide: 'chung' }).success).toBe(true);
    expect(newWeddingDraft({ cover: null }).hostSide).toBe('chung');
  });

  it.each([
    ['an unknown host side', { hostSide: 'ca-hai' }],
    ['an unknown event side', { events: [{ key: 'e1', label: 'Lễ', date: '', time: '', venue: 'Nhà', address: '', side: 'chung' }] }],
    ['three parents of one family', { parents: { groom: ['a', 'b', 'c'], bride: [] } }],
    ['a parent line too long', { parents: { groom: ['x'.repeat(61)], bride: [] } }],
    ['a parent line with a break', { parents: { groom: ['a\nb'], bride: [] } }],
    ['parents without the bride', { parents: { groom: [] } }],
    ['seven moments', { story: Array.from({ length: 7 }, (_, i) => moment({ key: `s${i}` })) }],
    ['two moments with one key', { story: [moment(), moment()] }],
    ['a month that is not one', { story: [moment({ when: '2019-13' })] }],
    ['a full date as month', { story: [moment({ when: '2019-05-01' })] }],
    ['a title too long', { story: [moment({ title: 'x'.repeat(81) })] }],
    ['a text too long', { story: [moment({ text: 'x'.repeat(301) })] }],
    ['a photo that is not one', { story: [moment({ photo: 'abc' })] }],
    ['an unknown field of a moment', { story: [{ ...moment(), extra: 1 }] }],
  ])('refuses %s', (_name, patch) => {
    expect(weddingDraftSchema.safeParse({ ...familyDraft(), ...patch }).success).toBe(false);
  });

  it('counts the story photos among the site photos, each once', () => {
    expect(weddingImageIds(familyDraft())).toEqual([COVER, PHOTO]);
    expect(weddingImageIds(familyDraft({ story: [moment({ photo: null })] }))).toEqual([COVER]);
  });

  it('reads months as an <input type="month"> gives them', () => {
    expect(isIsoMonth('2019-05')).toBe(true);
    expect(isIsoMonth('2019-00')).toBe(false);
    expect(storyMonthLabel('2019-05')).toBe('Tháng 5/2019');
    expect(storyMonthLabel('')).toBe('');
  });
});

describe('wedding dates', () => {
  it('names the weekday and counts days in Vietnam time', () => {
    expect(weddingDateLabel('2026-12-12')).toBe('Thứ Bảy, 12.12.2026');
    expect(daysUntil('2026-12-12', NOW)).toBe(41);
    // 23:30 on 11 Dec in Vietnam is 16:30 UTC: still the day before.
    expect(daysUntil('2026-12-12', new Date('2026-12-11T16:30:00Z'))).toBe(1);
    expect(daysUntil('2026-12-12', new Date('2026-12-11T17:30:00Z'))).toBe(0);
    expect(countdownText(41)).toBe('Còn 41 ngày');
    expect(countdownText(1)).toBe('Ngày mai là ngày cưới');
    expect(countdownText(0)).toBe('Hôm nay là ngày cưới');
    expect(countdownText(-1)).toBe('');
    expect(countdownText(null)).toBe('');
  });
});

describe('renderWedding', () => {
  it('shows names, day, events with directions and the countdown', () => {
    const { html } = renderWedding(sample(), assets, { now: NOW });
    expect(html).toContain('<span class="name">Minh</span><span class="amp" aria-label="và">&amp;</span><span class="name">Thảo</span>');
    expect(html).toContain('<time datetime="2026-12-12">Thứ Bảy, 12.12.2026</time>');
    expect(html).toContain('<p class="countdown">Còn 41 ngày</p>');
    expect(html).toContain('<p class="when">18:00 · Thứ Bảy, 12.12.2026</p>');
    expect(html).toContain(`href="https://www.google.com/maps/search/?api=1&amp;query=${encodeURIComponent('120 Lê Lợi, Phường Sài Gòn, TP. Hồ Chí Minh')}"`);
    expect(renderWedding(sample(), assets, { now: new Date('2027-01-01T00:00:00Z') }).html).not.toContain('class="countdown"');
  });

  it('replies by contacts without the form, and has no script then', () => {
    const { html } = renderWedding(sample(), assets, { now: NOW });
    expect(html).toContain('<section class="contact" id="xac-nhan"');
    expect(html).toContain('Báo qua Zalo');
    expect(html).not.toMatch(/<script|<form/);
  });

  it('shows no reply section and no reply button when replies are off', () => {
    const { html } = renderWedding(sample({ rsvp: false }), assets, { rsvpForm: { action: 'https://a.example/f/x', token: 't' }, now: NOW });
    expect(html).not.toContain('xac-nhan');
    expect(html).not.toContain('<form');
    expect(html).toContain('Liên hệ');
  });
});

describe('renderWedding of an older draft', () => {
  it.each(STYLE_IDS)('renders %s exactly as before the two families existed', async (style) => {
    const legacy = legacyDraft(style);
    const preview = renderWedding(legacy, assets, { now: NOW }).html;
    const form = renderWedding(legacy, assets, { now: NOW, rsvpForm: { action: 'https://webnhanh.hoandat.com/f/x', token: 't' }, madeWith: { name: 'W', url: 'https://webnhanh.hoandat.com' } }).html;
    expect(await sha256(preview)).toBe(LEGACY_DIGESTS[style].preview);
    expect(await sha256(withoutScript(form))).toBe(LEGACY_DIGESTS[style].form);
    expect(withoutScript(form)).not.toMatch(/Thêm vào lịch|calendar\.google|name="side"|invitedAs|data-from-query/);
  });
});

describe('renderWedding with the two families', () => {
  const page = (draft: WeddingDraft = familyDraft()): string =>
    renderWedding(draft, new Map([...assets, [PHOTO, imageAsset({ width: 600, height: 600, widths: [600] }, () => 'img/s.webp')]]), {
      now: NOW,
      rsvpForm: FORM,
      page: { url: 'https://minh-thao.hoandat.io.vn/' },
    }).html;

  it('names the parents at the head, the sending family first, and the couple in that order', () => {
    const html = page();
    expect(html).toContain(
      '<div class="w-parents"><div class="w-family"><p class="w-family-name">Nhà gái</p><p>Ông Nguyễn Văn Cường</p></div><div class="w-family"><p class="w-family-name">Nhà trai</p><p>Ông Trần Văn An</p><p>Bà Lê Thị Bình</p></div></div>',
    );
    expect(html).toContain('<p class="w-kicker">Trân trọng báo tin lễ thành hôn của con chúng tôi</p>');
    expect(html).toContain('<span class="name">Thảo</span><span class="amp" aria-label="và">&amp;</span><span class="name">Minh</span>');
    expect(html).toContain('<title>Thiệp cưới Thảo &amp; Minh</title>');
    expect(weddingShareCard(familyDraft()).title).toBe('Thảo & Minh');
    const groomFirst = page(familyDraft({ hostSide: 'chung' }));
    expect(groomFirst.indexOf('Nhà trai</p>')).toBeLessThan(groomFirst.indexOf('Nhà gái</p>'));
    expect(page(familyDraft({ parents: { groom: [' '], bride: [] } }))).not.toContain('<div class="w-parents"');
    expect(page(familyDraft({ parents: { groom: ['<b>Ông A</b>'], bride: [] } }))).toContain('<p>&lt;b&gt;Ông A&lt;/b&gt;</p>');
  });

  it('tells the couple story as a timeline, photo and month when given', () => {
    const html = page();
    expect(html).toContain('<section aria-labelledby="ct"><h2 id="ct">Chuyện tình</h2><ol class="story">');
    expect(html).toContain('<p class="m-when"><time datetime="2019-05">Tháng 5/2019</time></p><h3>Lần đầu gặp nhau</h3><p class="m-text">Ở quán cà phê đầu hẻm.</p>');
    expect(html).toContain('alt="Lần đầu gặp nhau"');
    expect(html).toContain('<li class="moment"><div class="m-body"><h3>Cầu hôn</h3></div></li>');
    expect(html.indexOf('id="ct"')).toBeLessThan(html.indexOf('id="ls"'));
    expect(page(familyDraft({ story: [moment({ title: ' ', text: '' })] }))).not.toContain('Chuyện tình');
    const marked = page(familyDraft({ story: [moment({ title: '"><b>t', text: '<i>x</i>', photo: PHOTO })] }));
    expect(marked).toContain('<h3>&quot;&gt;&lt;b&gt;t</h3><p class="m-text">&lt;i&gt;x&lt;/i&gt;</p>');
    expect(marked).toContain('alt="&quot;&gt;&lt;b&gt;t"');
  });

  it('labels each event with its family and links it to Google Calendar in Vietnam time', () => {
    const html = page();
    expect(html).toContain('<li class="card event"><p class="e-side">Nhà gái</p><h3>Lễ thành hôn</h3>');
    expect(html.match(/class="e-side"/g)).toHaveLength(1);
    const links = [...html.matchAll(/<a class="cal" href="([^"]+)">/g)].map((match) => new URL((match[1] ?? '').replaceAll('&amp;', '&')));
    expect(links).toHaveLength(2);
    const [ceremony, party] = links;
    expect(ceremony?.origin + (ceremony?.pathname ?? '')).toBe('https://calendar.google.com/calendar/render');
    expect(ceremony?.searchParams.get('action')).toBe('TEMPLATE');
    // 09:00 in Vietnam is 02:00 UTC; two hours.
    expect(ceremony?.searchParams.get('dates')).toBe('20261212T020000Z/20261212T040000Z');
    expect(ceremony?.searchParams.get('text')).toBe('Lễ thành hôn · Thảo & Minh');
    expect(ceremony?.searchParams.get('location')).toBe('Tư gia nhà gái, 25 Nguyễn Trãi, Phường Bến Thành, TP. Hồ Chí Minh');
    expect(ceremony?.searchParams.get('details')).toBe('https://minh-thao.hoandat.io.vn/');
    expect(party?.searchParams.get('dates')).toBe('20261212T110000Z/20261212T130000Z');
  });

  it('makes an event without a time an all-day one, on its own day, and links nothing without a day', () => {
    const [first] = familyDraft().events;
    if (!first) throw new Error('sample has events');
    const allDay = page(familyDraft({ events: [{ ...first, date: '2026-12-11', time: '' }] }));
    const href = /<a class="cal" href="([^"]+)">/.exec(allDay)?.[1] ?? '';
    expect(new URL(href.replaceAll('&amp;', '&')).searchParams.get('dates')).toBe('20261211/20261212');
    expect(page(familyDraft({ date: '', events: [first] }))).not.toContain('class="cal"');
  });

  it('asks the guest family in the form, and fills it and the name from a personal link', () => {
    const html = page();
    expect(html).toContain('<input type="hidden" name="invitedAs" value="" data-from-query="to">');
    expect(html).toContain('autocomplete="name" data-from-query="to">');
    expect(html).toContain('<fieldset class="field wide choices" data-from-query="side"><legend>Bạn là khách của</legend>');
    expect(html).toContain('<label><input type="radio" name="side" value="trai"> Khách nhà trai</label>');
    expect(html).not.toMatch(/name="side"[^>]*required/);
  });

  it('keeps a party reply form as it was', () => {
    expect(withoutScript(rsvpFormHtml(FORM, 'Lời nhắn'))).not.toMatch(/data-from-query|invitedAs|name="side"/);
  });
});

describe('reply input', () => {
  const valid = { kind: 'rsvp', name: ' Lan ', phone: '0912 345 678', attending: 'yes', guests: '2', note: '' };

  it('accepts a reply, phone optional', () => {
    expect(rsvpInputSchema.parse(valid)).toEqual({ kind: 'rsvp', name: 'Lan', phone: '0912345678', attending: 'yes', guests: 2, note: '', side: '', invitedAs: '' });
    expect(rsvpInputSchema.parse({ ...valid, phone: '', guests: undefined, note: undefined })).toMatchObject({ phone: '', guests: 1, note: '' });
  });

  it('takes the guest family and the name of the invitation link', () => {
    expect(rsvpInputSchema.parse({ ...valid, side: 'gai', invitedAs: ' Cô Lan ' })).toMatchObject({ side: 'gai', invitedAs: 'Cô Lan' });
    expect(rsvpInputSchema.parse({ ...valid, side: '' })).toMatchObject({ side: '' });
  });

  it.each([
    ['side', 'chung'],
    ['side', 'TRAI'],
    ['invitedAs', 'x'.repeat(81)],
    ['invitedAs', 'a\nb'],
    ['invitedAs', 'a\u0000b'],
    ['kind', 'order'],
    ['name', ' '],
    ['name', 'a\nb'],
    ['phone', '123'],
    ['attending', 'maybe'],
    ['guests', '0'],
    ['guests', '21'],
    ['note', 'x'.repeat(301)],
  ])('refuses %s = %j', (field, value) => {
    expect(rsvpInputSchema.safeParse({ ...valid, [field]: value }).success).toBe(false);
  });
});
