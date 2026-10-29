// @vitest-environment node
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

/*
 * The app has one light theme and no script of its own in the page: the CSP of the nginx site allows the Vite bundle
 * (and the Cloudflare beacon) but no inline script, so an inline one would silently not run.
 */
const NGINX_SITE = new URL('../../../infra/nginx/webnhanh.hoandat.com.conf', import.meta.url);
const INDEX_HTML = new URL('../index.html', import.meta.url);

describe('index.html and the CSP', () => {
  it('has no inline script, and the CSP allows none', () => {
    const html = readFileSync(INDEX_HTML, 'utf8');
    expect(html).not.toMatch(/<script>/);
    const csp = /set \$webnhanh_csp "([^"]+)"/.exec(readFileSync(NGINX_SITE, 'utf8'))?.[1] ?? '';
    const scriptSrc = csp.split(';').map((part) => part.trim()).find((part) => part.startsWith('script-src')) ?? '';
    expect(scriptSrc).toMatch(/^script-src 'self'/);
    expect(scriptSrc).not.toMatch(/sha256-|unsafe-inline/);
  });

  it('lets the account menu show the hoandat.com picture (Google or GitHub) and nothing else from elsewhere', () => {
    const csp = /set \$webnhanh_csp "([^"]+)"/.exec(readFileSync(NGINX_SITE, 'utf8'))?.[1] ?? '';
    const imgSrc = csp.split(';').map((part) => part.trim()).find((part) => part.startsWith('img-src')) ?? '';
    expect(imgSrc.split(' ').slice(1).sort()).toEqual(
      ["'self'", 'data:', 'https://*.hoandat.io.vn', 'https://avatars.githubusercontent.com', 'https://lh3.googleusercontent.com'].sort(),
    );
  });

  it('is a light page only', () => {
    expect(readFileSync(INDEX_HTML, 'utf8')).toContain('<meta name="color-scheme" content="light" />');
  });
});
