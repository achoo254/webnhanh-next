import { findVariant } from '@webnhanh/templates/variants';
import { afterEach, describe, expect, it } from 'vitest';
import { rememberSignUpSource, signUpSource, sourceOf } from '../signup-source';
import { freshGuestDraft, pickedLook } from './guest-library';
import { guestPreviewHtml } from './guest-preview';
import { remapIds } from './guest-transfer';

afterEach(() => {
  sessionStorage.clear();
});

describe('sign-up source', () => {
  it('keeps the first value of each tag the landing address had, and nothing else', () => {
    expect(sourceOf('?utm_source=fb&utm_source=zalo&utm_campaign=tet&utm_term=x&utm_medium=')).toEqual({ utm_source: 'fb', utm_campaign: 'tet' });
    rememberSignUpSource('?utm_source=fb&utm_medium=cpc');
    // Moving around the app (addresses without tags) does not forget them.
    rememberSignUpSource('?template=shop');
    expect(signUpSource()).toEqual({ utm_source: 'fb', utm_medium: 'cpc' });
    expect(sourceOf(`?utm_source=${'a'.repeat(201)}`)).toEqual({});
  });

  it('reads nothing from a stored value that is not its own', () => {
    sessionStorage.setItem('webnhanh.signup-source', '{"utm_source":42,"other":"x"}');
    expect(signUpSource()).toEqual({});
    sessionStorage.setItem('webnhanh.signup-source', 'not json');
    expect(signUpSource()).toEqual({});
  });
});

describe('a visitor draft', () => {
  it('starts from the look asked for, or the template first look when the look is unknown', () => {
    expect(pickedLook('wedding', 'vintage')?.id).toBe('vintage');
    expect(pickedLook('wedding', 'khong-co')?.id).toBe('hoa-pastel');
    expect(pickedLook('casino', 'x')).toBeNull();
    const look = findVariant('wedding', 'hoa-pastel');
    if (!look) throw new Error('no look');
    const { value, photos } = freshGuestDraft(look);
    expect(value.draft).toMatchObject({ groom: 'Huy', bride: 'Vy' });
    expect(photos.map((photo) => photo.slot)).toEqual(['cover', 'ornament']);
    expect(photos.every((photo) => photo.url !== '')).toBe(true);
  });

  it('shows chosen photos in the preview from data: URLs, and nothing that could leave its attribute', () => {
    const look = findVariant('wedding', 'hoa-pastel');
    if (!look) throw new Error('no look');
    const { value, photos } = freshGuestDraft(look);
    const images = new Map(photos.map((photo) => [photo.image.id, photo.image]));
    const cover = photos[0];
    if (!cover) throw new Error('no cover');
    const data = 'data:image/jpeg;base64,/9j/4AAQSkZJRg==';
    const urls = new Map(photos.map((photo) => [photo.image.id, photo.url]));
    const html = guestPreviewHtml(value, images, new Map(urls).set(cover.image.id, data), 'ban-nhap');
    expect(html).toContain(`src="${data}"`);
    expect(html).toContain('img-src &#39;self&#39; data:');
    expect(html).not.toContain('/guest-photo/');

    // A URL that is not a plain base64 photo is never put in the page.
    const unsafe = guestPreviewHtml(value, images, new Map(urls).set(cover.image.id, 'data:text/html,"><script>x</script>'), 'ban-nhap');
    expect(unsafe).not.toContain('<script>x');
    expect(unsafe).not.toContain('img-src &#39;self&#39; data:');
  });
});

describe('moving a draft into the account', () => {
  it('points every photo of the draft at the site images, at any depth', () => {
    const ids = new Map([
      ['a', 'A'],
      ['b', 'B'],
    ]);
    expect(remapIds({ cover: 'a', gallery: ['b', 'c'], events: [{ venue: 'a b' }], n: 1, x: null }, ids)).toEqual({
      cover: 'A',
      gallery: ['B', 'c'],
      events: [{ venue: 'a b' }],
      n: 1,
      x: null,
    });
  });
});
