import { describe, expect, it } from 'vitest';
import { imageAsset } from './page';
import { rsvpInputSchema } from './rsvp-form';
import { countdownText, daysUntil, renderWedding, weddingDateLabel } from './wedding-render';
import { isIsoDate, isTime, sampleWeddingDraft, weddingDraftSchema, weddingPublishIssues, type WeddingDraft } from './wedding-schema';

const COVER = '11111111-1111-4111-8111-111111111111';
const assets = new Map([[COVER, imageAsset({ width: 675, height: 900, widths: [675] }, () => 'img/w.webp')]]);
const sample = (overrides: Partial<WeddingDraft> = {}): WeddingDraft => ({ ...sampleWeddingDraft({ cover: COVER }), ...overrides });
const NOW = new Date('2026-11-01T03:00:00Z');

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

  it('needs a contact for replies while replies go through contacts', () => {
    expect(weddingPublishIssues(sample({ contacts: { zalo: '', phone: '', facebook: '' } }))).toEqual([{ field: 'contacts', code: 'no-contact' }]);
    expect(weddingPublishIssues(sample({ rsvp: false, contacts: { zalo: '', phone: '', facebook: '' } }))).toEqual([]);
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

describe('reply input', () => {
  const valid = { kind: 'rsvp', name: ' Lan ', phone: '0912 345 678', attending: 'yes', guests: '2', note: '' };

  it('accepts a reply, phone optional', () => {
    expect(rsvpInputSchema.parse(valid)).toEqual({ kind: 'rsvp', name: 'Lan', phone: '0912345678', attending: 'yes', guests: 2, note: '' });
    expect(rsvpInputSchema.parse({ ...valid, phone: '', guests: undefined, note: undefined })).toMatchObject({ phone: '', guests: 1, note: '' });
  });

  it.each([
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
