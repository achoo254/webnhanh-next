import { describe, expect, it } from 'vitest';
import { emailLink, instagramLink, looksLikeUrl, mapLink, tiktokLink, webLink, youtubeLink } from './web-links';

describe('mapLink', () => {
  it('turns an address into a Google Maps search, encoded', () => {
    expect(mapLink(' 120 Lê Lợi, Quận 1 ')).toEqual({
      href: `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent('120 Lê Lợi, Quận 1')}`,
      label: '120 Lê Lợi, Quận 1',
    });
    expect(mapLink('"><script>x</script>')?.href).not.toMatch(/[<>"]/);
  });

  it('keeps a pasted Google Maps link, on https', () => {
    expect(mapLink('https://maps.app.goo.gl/AbC123xyz')?.href).toBe('https://maps.app.goo.gl/AbC123xyz');
    expect(mapLink('http://goo.gl/maps/AbC123')?.href).toBe('https://goo.gl/maps/AbC123');
    expect(mapLink('https://www.google.com/maps/place/Ch%E1%BB%A3+B%E1%BA%BFn+Th%C3%A0nh/@10.77,106.69,17z')?.href).toContain('https://www.google.com/maps/place/');
    expect(mapLink('maps.google.com/?q=10.77,106.69')?.label).toBe('Google Maps');
  });

  it('refuses other hosts, other Google paths, schemes and empty or control text', () => {
    for (const bad of [
      'https://evil.com/maps/x',
      'https://maps.app.goo.gl.evil.com/x',
      'https://www.google.com/search?q=x',
      'https://goo.gl/abc',
      'https://user:pw@www.google.com/maps/x',
      'javascript:alert(1)',
      'abc',
      '   ',
      '---',
      'a\u0000bcd',
      'x'.repeat(201),
    ]) {
      expect(mapLink(bad), bad).toBeNull();
    }
  });

  it('tells links from addresses', () => {
    expect(looksLikeUrl('https://x.vn')).toBe(true);
    expect(looksLikeUrl('maps.app.goo.gl/x')).toBe(true);
    expect(looksLikeUrl('12/3 Lê Lợi')).toBe(false);
  });
});

describe('webLink', () => {
  it('accepts https pages, adding https:// when left out, with a short label', () => {
    expect(webLink('https://www.example.vn/a?b=1')).toEqual({ href: 'https://www.example.vn/a?b=1', label: 'example.vn/a?b=1' });
    expect(webLink('shop.example.com')).toEqual({ href: 'https://shop.example.com/', label: 'shop.example.com' });
    expect(webLink(`https://example.com/${'a'.repeat(80)}`)?.label).toHaveLength(48);
  });

  it('refuses http, other schemes, credentials, ports, IPs, spaces and bare words', () => {
    for (const bad of [
      'http://example.com',
      'javascript:alert(1)',
      'data:text/html,x',
      'mailto:a@b.vn',
      'https://u:p@example.com',
      'https://example.com:8443/',
      'https://127.0.0.1/',
      'https://exa mple.com',
      'hello',
      '',
      `https://example.com/${'a'.repeat(500)}`,
    ]) {
      expect(webLink(bad), bad).toBeNull();
    }
  });
});

describe('social links', () => {
  it('builds e-mail, TikTok, Instagram and YouTube links from handles or their own links only', () => {
    expect(emailLink('mailto:lan.anh@example.vn')).toEqual({ href: 'mailto:lan.anh@example.vn', label: 'lan.anh@example.vn' });
    expect(emailLink('a@b')).toBeNull();
    expect(emailLink('a@b.vn?bcc=x@y.vn')).toBeNull();
    expect(tiktokLink('@banh.cua_lan')?.href).toBe('https://www.tiktok.com/@banh.cua_lan');
    expect(tiktokLink('https://www.tiktok.com/@banhcualan')?.href).toBe('https://www.tiktok.com/@banhcualan');
    expect(tiktokLink('https://evil.com/@x')).toBeNull();
    expect(instagramLink('instagram.com/banhcualan/')?.href).toBe('https://www.instagram.com/banhcualan');
    expect(instagramLink('a..b')).toBeNull();
    expect(youtubeLink('@banhcualan')?.href).toBe('https://www.youtube.com/@banhcualan');
    expect(youtubeLink('https://www.youtube.com/channel/UC123abc')?.href).toBe('https://www.youtube.com/channel/UC123abc');
    expect(youtubeLink('https://www.youtube.com/watch?v=x')).toBeNull();
    expect(youtubeLink('javascript:alert(1)')).toBeNull();
  });
});
