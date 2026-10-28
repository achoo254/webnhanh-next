import { themeBootstrapScript } from '@achoo254/app-shell/preferences';

/**
 * The inline <head> script that sets `data-theme` from the shared `hd_theme` choice before the first paint. vite.config.ts
 * puts it in index.html; the CSP in infra/nginx/trang.hoandat.com.conf allows exactly this text by its sha256
 * (theme-bootstrap.test.ts keeps the two in step).
 */
export const THEME_BOOTSTRAP_SCRIPT = themeBootstrapScript({});
