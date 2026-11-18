import { describe, expect, it } from 'vitest';
import { appFilesOf, inlineAppFiles } from './preview-files';

const PHOTO = '/api/sites/11111111-1111-4111-8111-111111111111/images/22222222-2222-4222-8222-222222222222-800.webp';
const FONT = '/assets/preview-fonts/anton-latin-400-normal.woff2';
const page = `<meta http-equiv="Content-Security-Policy" content="default-src &#39;none&#39;; img-src &#39;self&#39;; font-src &#39;self&#39;">
<style>@font-face{src:url(${FONT})}</style><img src="${PHOTO}" srcset="${PHOTO} 800w"><img src="/assets/library.webp"><a href="https://example.com/api/sites/x">`;

describe('preview files', () => {
  it('finds only the files the sandboxed frame cannot load itself: the owner\'s photos and the fonts', () => {
    expect(appFilesOf(page)).toEqual([FONT, PHOTO]);
  });

  it('swaps the fetched ones for their data URLs and lets the page show data: pictures and fonts', () => {
    const html = inlineAppFiles(page, new Map([[PHOTO, 'data:image/webp;base64,AAAA'], [FONT, null]]));
    expect(html).toContain('<img src="data:image/webp;base64,AAAA" srcset="data:image/webp;base64,AAAA 800w">');
    expect(html).toContain(`url(${FONT})`);
    expect(html).toContain('img-src &#39;self&#39; data:; font-src &#39;self&#39; data:');
    expect(html).toContain('<img src="/assets/library.webp">');
  });
});
