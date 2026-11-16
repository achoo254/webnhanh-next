import { describe, expect, it } from 'vitest';
import { ORDER_SCRIPT } from './order-form';
import { imageAsset } from './page';
import { newPartyDraft, partyDraftSchema, partyImageIds, partyPublishIssues, samplePartyDraft, type PartyDraft } from './party-schema';
import { partyShareCard, renderParty } from './party-render';

const COVER = '11111111-1111-4111-8111-111111111111';
const ORNAMENT = '22222222-2222-4222-8222-222222222222';
const assets = new Map([
  [COVER, imageAsset({ width: 675, height: 900, widths: [675] }, () => 'img/c.webp')],
  [ORNAMENT, imageAsset({ width: 512, height: 512, widths: [512] }, () => 'img/o.webp')],
]);
const sample = (overrides: Partial<PartyDraft> = {}): PartyDraft => ({ ...samplePartyDraft({ cover: COVER }), ...overrides });
const NOW = new Date('2026-11-16T03:00:00Z');
const FORM = { action: 'https://app.example.com/f/tiec', token: '1.abc' };

describe('party draft', () => {
  it('starts with replies on, a programme to adjust and nothing else written', () => {
    const draft = newPartyDraft();
    expect(partyDraftSchema.safeParse(draft).success).toBe(true);
    expect(draft.rsvp).toBe(true);
    expect(draft.agenda.map((item) => item.label)).toHaveLength(3);
    expect(partyPublishIssues(draft)).toEqual([
      { field: 'title', code: 'required' },
      { field: 'date', code: 'required' },
      { field: 'venue', code: 'required' },
    ]);
  });

  it('checks the day and time as the inputs give them, and agenda keys are unique', () => {
    expect(partyDraftSchema.safeParse(sample({ date: '2026-12-32' })).success).toBe(false);
    expect(partyDraftSchema.safeParse(sample({ time: '25:00' })).success).toBe(false);
    const [first] = sample().agenda;
    if (!first) throw new Error('sample has a programme');
    expect(partyDraftSchema.safeParse(sample({ agenda: [first, first] })).success).toBe(false);
  });

  it('needs only the title, the day and a place; a typed address must be a real map link', () => {
    expect(partyPublishIssues(sample())).toEqual([]);
    expect(partyPublishIssues(sample({ venue: '', address: 'Phố đi bộ Nguyễn Huệ' }))).toEqual([]);
    expect(partyPublishIssues(sample({ address: 'https://evil.example/maps' }))).toEqual([{ field: 'address', code: 'invalid-map' }]);
    expect(partyPublishIssues(sample({ host: '', intro: '', dressCode: '', time: '', contacts: { zalo: '', phone: '', facebook: '' } }))).toEqual([]);
    const [first] = sample().agenda;
    if (!first) throw new Error('sample has a programme');
    expect(partyPublishIssues(sample({ agenda: [{ ...first, label: ' ' }] }))).toEqual([{ field: 'agenda.0.label', code: 'required' }]);
    expect(partyPublishIssues(sample({ contacts: { zalo: 'abc', phone: '', facebook: '' } }))).toEqual([{ field: 'contacts.zalo', code: 'invalid-zalo' }]);
  });

  it('lists its photos cover first, ornaments after', () => {
    expect(partyImageIds(sample({ ornaments: [ORNAMENT] }))).toEqual([COVER, ORNAMENT]);
    expect(partyImageIds(sample({ cover: null }))).toEqual([]);
  });
});

describe('renderParty', () => {
  it('shows the title, the day with a countdown, the place with directions and the programme', () => {
    const { html } = renderParty(sample(), assets, { now: NOW });
    expect(html).toContain('<h1>Tất niên nhà Mây Xanh</h1>');
    expect(html).toContain('<p class="pt-date">18:30 · Thứ Bảy, 26.12.2026</p>');
    expect(html).toContain('<p class="countdown">Còn 40 ngày</p>');
    expect(html).toContain(`href="https://www.google.com/maps/search/?api=1&amp;query=${encodeURIComponent('88 Nguyễn Huệ, Phường Sài Gòn, TP. Hồ Chí Minh')}"`);
    expect(html).toContain('<span class="pa-time">19:00</span><span class="pa-label">Khai tiệc, cả nhà nâng ly</span>');
    expect(renderParty(sample(), assets, { now: new Date('2026-12-26T01:00:00Z') }).html).toContain('Hôm nay là ngày tiệc');
    expect(renderParty(sample(), assets, { now: new Date('2027-01-01T00:00:00Z') }).html).not.toContain('class="countdown"');
  });

  it('takes replies through the fixed form script, the note addressed to the organisers', () => {
    const { html } = renderParty(sample(), assets, { now: NOW, rsvpForm: FORM });
    expect(html.match(/<script>[\s\S]*?<\/script>/g)).toEqual([`<script>${ORDER_SCRIPT}</script>`]);
    expect(html).toContain('name="kind" value="rsvp"');
    expect(html).toContain('<label for="r-note">Lời nhắn cho ban tổ chức</label>');
    expect(html).toContain("form-action https://app.example.com");
  });

  it('replies by contacts without the form, and shows no reply at all when replies are off', () => {
    const contacts = renderParty(sample(), assets, { now: NOW }).html;
    expect(contacts).toContain('<section class="contact" id="xac-nhan"');
    expect(contacts).not.toMatch(/<script|<form/);
    const off = renderParty(sample({ rsvp: false }), assets, { now: NOW, rsvpForm: FORM }).html;
    expect(off).not.toContain('xac-nhan');
    expect(off).toContain('Liên hệ ban tổ chức');
  });

  it('escapes what the host typed and shows the variant ornaments as decoration', () => {
    const { html } = renderParty(sample({ title: '<b>Tiệc</b>', ornaments: [ORNAMENT] }), assets, { now: NOW });
    expect(html).toContain('<h1>&lt;b&gt;Tiệc&lt;/b&gt;</h1>');
    expect(html).toMatch(/<img class="pt-orn pt-orn-1" aria-hidden="true" [^>]*alt=""/);
  });

  it('shares the title, the day and the venue', () => {
    expect(partyShareCard(sample())).toMatchObject({ kicker: 'Year End Party 2026', title: 'Tất niên nhà Mây Xanh', description: '18:30 · Thứ Bảy, 26.12.2026 · Nhà hàng Sông Xanh, sảnh Hoa Sứ', photo: COVER });
  });
});
