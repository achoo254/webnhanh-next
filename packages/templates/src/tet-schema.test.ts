import { describe, expect, it } from 'vitest';
import { imageAsset } from './page';
import { renderTet, tetShareCard } from './tet-render';
import { newTetDraft, sampleTetDraft, TET_GREETINGS, TET_YEAR, tetDraftSchema, tetPublishIssues, type TetDraft } from './tet-schema';

const PHOTO = '11111111-1111-4111-8111-111111111111';
const assets = new Map([[PHOTO, imageAsset({ width: 675, height: 900, widths: [675] }, () => 'img/tet.webp')]]);
const sample = (overrides: Partial<TetDraft> = {}): TetDraft => ({ ...sampleTetDraft({ photo: PHOTO }), ...overrides });

describe('Tết card draft', () => {
  it('starts from the first greeting, with the sender left to write', () => {
    const draft = newTetDraft({ photo: PHOTO });
    expect(draft.greeting).toBe(TET_GREETINGS[0].text);
    expect(tetPublishIssues(draft)).toEqual([
      { field: 'sender', code: 'required' },
      { field: 'contacts', code: 'no-contact' },
    ]);
  });

  it('offers short, distinct greetings', () => {
    expect(new Set(TET_GREETINGS.map((g) => g.id)).size).toBe(TET_GREETINGS.length);
    for (const greeting of TET_GREETINGS) expect(tetDraftSchema.safeParse(sample({ greeting: greeting.text })).success).toBe(true);
  });

  it('takes only the Tết palettes and the clay look by default', () => {
    expect(tetDraftSchema.safeParse(sample({ palette: 'ocean' as TetDraft['palette'] })).success).toBe(false);
    const { style: _style, ...withoutStyle } = sample();
    expect(tetDraftSchema.parse(withoutStyle).style).toBe('am-cung');
    expect(tetDraftSchema.safeParse({ ...sample(), extra: 1 }).success).toBe(false);
  });

  it('asks for a working contact only when replies are on, and checks typed ones', () => {
    expect(tetPublishIssues(sample({ reply: false, contacts: { zalo: '', phone: '', facebook: '' } }))).toEqual([]);
    expect(tetPublishIssues(sample({ contacts: { zalo: 'abc', phone: '', facebook: '' } }))).toEqual([{ field: 'contacts.zalo', code: 'invalid-zalo' }]);
    expect(tetPublishIssues(sample({ greeting: ' ' }))).toEqual([{ field: 'greeting', code: 'required' }]);
  });
});

describe('renderTet', () => {
  it('shows the card and the reply links, with no form and no script', () => {
    const { html } = renderTet(sample(), assets);
    expect(html).toContain(`<p class="year">${TET_YEAR}</p>`);
    expect(html).toContain('<h1>Chúc Mừng Năm Mới</h1>');
    expect(html).toContain('<strong>Gia đình Minh Anh</strong>');
    expect(html).toContain('href="https://zalo.me/0912345678"');
    expect(html).toContain('Gửi lời chúc lại');
    expect(html).toContain('<nav class="dock"');
    expect(html).not.toMatch(/<script|<form/);
    expect(html).toContain('form-action &#39;none&#39;');
  });

  it('leaves the reply out when it is off, and the photo when it is missing', () => {
    const { html } = renderTet(sample({ reply: false, photo: null }), assets);
    expect(html).not.toContain('Gửi lời chúc lại');
    expect(html).not.toContain('<nav');
    expect(html).not.toContain('<img');
  });

  it('puts the year and the sender on the share card', () => {
    expect(tetShareCard(sample())).toEqual({ kicker: TET_YEAR, title: 'Chúc Mừng Năm Mới', description: 'Từ Gia đình Minh Anh', palette: 'lucky', photo: PHOTO });
  });
});
