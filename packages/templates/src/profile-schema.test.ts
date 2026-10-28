import { describe, expect, it } from 'vitest';
import { imageAsset } from './page';
import { initials, renderProfile } from './profile-render';
import { EMPTY_SOCIALS, profilePublishIssues, sampleProfileDraft, type ProfileDraft } from './profile-schema';

const AVATAR = '11111111-1111-4111-8111-111111111111';
const assets = new Map([[AVATAR, imageAsset({ width: 900, height: 900, widths: [900] }, () => 'img/a.webp')]]);
const sample = (overrides: Partial<ProfileDraft> = {}): ProfileDraft => ({ ...sampleProfileDraft(), ...overrides });

describe('profile draft', () => {
  it('needs a name and something to link to; links need a label and an https address', () => {
    expect(profilePublishIssues(sample({ name: '', links: [], socials: { ...EMPTY_SOCIALS } }))).toEqual([
      { field: 'name', code: 'required' },
      { field: 'links', code: 'no-links' },
    ]);
    expect(
      profilePublishIssues(
        sample({
          links: [
            { key: 'a', label: '', url: 'https://x.vn' },
            { key: 'b', label: 'B', url: '' },
            { key: 'c', label: 'C', url: 'http://x.vn' },
          ],
        }),
      ),
    ).toEqual([
      { field: 'links.0.label', code: 'required' },
      { field: 'links.1.url', code: 'required' },
      { field: 'links.2.url', code: 'invalid-url' },
    ]);
  });

  it('checks each social account by its own rule', () => {
    const socials = { ...EMPTY_SOCIALS, email: 'x', tiktok: 'https://evil.com/@x', youtube: 'nope nope', phone: '12' };
    expect(profilePublishIssues(sample({ socials })).map((issue) => issue.code)).toEqual(['invalid-tiktok', 'invalid-youtube', 'invalid-phone', 'invalid-email']);
  });
});

describe('renderProfile', () => {
  it('shows initials without a photo, social buttons with names for screen readers, and links as buttons', () => {
    const { html } = renderProfile(sample(), assets);
    expect(initials('Lan Anh')).toBe('LA');
    expect(initials('  đức  ')).toBe('Đ');
    expect(html).toContain('<div class="p-avatar p-initials" aria-hidden="true">LA</div>');
    expect(html).toContain('href="https://www.instagram.com/banhcualan"');
    expect(html).toContain('<span class="vh">Instagram: @banhcualan</span>');
    expect(html).toContain('<a class="p-link" href="https://banhcualan.hoandat.io.vn/"><span class="p-label">Đặt bánh tuần này</span>');
    expect(html).not.toMatch(/<script|<form|<nav class="dock"/);
  });

  it('shows the photo when there is one and drops links that are not https', () => {
    const { html } = renderProfile(sample({ avatar: AVATAR, links: [{ key: 'a', label: 'X', url: 'javascript:alert(1)' }] }), assets);
    expect(html).toContain('alt="Lan Anh"');
    expect(html).not.toContain('javascript:');
    expect(html).not.toContain('<ul class="p-links">');
  });
});
