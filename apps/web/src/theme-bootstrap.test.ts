// @vitest-environment node
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { THEME_BOOTSTRAP_SCRIPT } from './theme-bootstrap';

/*
 * The inline theme script of index.html runs only if the CSP names its hash. A new @achoo254/app-shell version
 * changes the text, so this fails first and prints the hash to put in the nginx site.
 */
const NGINX_SITE = new URL('../../../infra/nginx/trang.hoandat.com.conf', import.meta.url);

describe('theme bootstrap script', () => {
  it('is allowed by the CSP hash of the nginx site', () => {
    const hash = createHash('sha256').update(THEME_BOOTSTRAP_SCRIPT).digest('base64');
    expect(readFileSync(NGINX_SITE, 'utf8'), `script-src needs 'sha256-${hash}'`).toContain(`'sha256-${hash}'`);
  });

  it('reads the shared hd_theme choice and has one place in index.html', () => {
    expect(THEME_BOOTSTRAP_SCRIPT).toContain('hd_theme');
    const html = readFileSync(new URL('../index.html', import.meta.url), 'utf8');
    expect(html.split('<!--theme-bootstrap-->')).toHaveLength(2);
    expect(html).not.toMatch(/<script>/);
  });
});
