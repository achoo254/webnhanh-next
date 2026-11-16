import { describe, expect, it } from 'vitest';
import { birthdayShareCard, renderBirthday } from './birthday-render';
import { birthdayDraftSchema, birthdayImageIds, birthdayPublishIssues, newBirthdayDraft, sampleBirthdayDraft, type BirthdayDraft } from './birthday-schema';
import { imageAsset } from './page';

const PHOTO = '11111111-1111-4111-8111-111111111111';
const MORE = '22222222-2222-4222-8222-222222222222';
const ORNAMENT = '33333333-3333-4333-8333-333333333333';
const assets = new Map(
  [PHOTO, MORE, ORNAMENT].map((id) => [id, imageAsset({ width: 600, height: 600, widths: [600] }, () => `img/${id}.webp`)] as const),
);
const sample = (overrides: Partial<BirthdayDraft> = {}): BirthdayDraft => ({ ...sampleBirthdayDraft({ photo: PHOTO }), ...overrides });
const NO_CONTACTS = { zalo: '', phone: '', facebook: '' };

describe('birthday draft', () => {
  it('starts with the default title and replies on, and needs only the name and the wish', () => {
    const draft = newBirthdayDraft();
    expect(birthdayDraftSchema.safeParse(draft).success).toBe(true);
    expect(draft.title).toBe('Chúc mừng sinh nhật');
    expect(birthdayPublishIssues({ ...draft, reply: false })).toEqual([
      { field: 'name', code: 'required' },
      { field: 'message', code: 'required' },
    ]);
    expect(birthdayPublishIssues(sample({ kicker: '', sender: '', title: '' }))).toEqual([]);
  });

  it('needs somewhere for wishes to go when replies are on, and typed contacts must work', () => {
    expect(birthdayPublishIssues(sample({ contacts: NO_CONTACTS }))).toEqual([{ field: 'contacts', code: 'no-contact' }]);
    expect(birthdayPublishIssues(sample({ reply: false, contacts: NO_CONTACTS }))).toEqual([]);
    expect(birthdayPublishIssues(sample({ contacts: { ...NO_CONTACTS, zalo: 'abc' } }))).toEqual([{ field: 'contacts.zalo', code: 'invalid-zalo' }]);
  });

  it('keeps at most nine more photos and lists every photo once, the main one first', () => {
    expect(birthdayDraftSchema.safeParse(sample({ gallery: Array.from({ length: 10 }, () => MORE) })).success).toBe(false);
    expect(birthdayImageIds(sample({ gallery: [MORE, PHOTO], ornaments: [ORNAMENT] }))).toEqual([PHOTO, MORE, ORNAMENT]);
  });
});

describe('renderBirthday', () => {
  it('shows the title and name in one heading, the wish, who sends it and the photos', () => {
    const { html } = renderBirthday(sample({ gallery: [MORE] }), assets);
    expect(html).toContain('<h1><span class="b-title">Chúc mừng sinh nhật</span><span class="b-name">Minh Thư</span></h1>');
    expect(html).toContain('<p class="b-from"><span>Thương,</span> <strong>Hội bạn thân K18</strong></p>');
    expect(html).toContain('alt="Minh Thư"');
    expect(html).toContain('<h2 id="kk">Khoảnh khắc</h2>');
  });

  it('lets whoever opens it send a wish back through the contacts, with no form and no script', () => {
    const { html } = renderBirthday(sample(), assets);
    expect(html).toContain('<h2 id="gui-loi-chuc">Gửi lời chúc</h2>');
    expect(html).toContain('Gửi Minh Thư một lời chúc nhé.');
    expect(html).toContain('href="https://zalo.me/0912345678"');
    expect(html).not.toMatch(/<script|<form/);
    expect(renderBirthday(sample({ reply: false }), assets).html).not.toContain('gui-loi-chuc');
  });

  it('escapes what the owner typed and shows ornaments as decoration', () => {
    const { html } = renderBirthday(sample({ name: '<i>Thư</i>', ornaments: [ORNAMENT] }), assets);
    expect(html).toContain('&lt;i&gt;Thư&lt;/i&gt;');
    expect(html).toMatch(/<img class="b-orn b-orn-1" aria-hidden="true" [^>]*alt=""/);
  });

  it('shares the title with the name, and who sends it', () => {
    expect(birthdayShareCard(sample())).toMatchObject({ kicker: 'Tuổi 25 rực rỡ', title: 'Chúc mừng sinh nhật Minh Thư', description: 'Từ Hội bạn thân K18', photo: PHOTO });
  });
});
