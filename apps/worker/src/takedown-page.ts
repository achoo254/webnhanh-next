/**
 * The page a taken-down site shows, at every path: it becomes a release of its own (`index.html` and `404.html`), so
 * nginx serves it through `current` like any page, and the site's real releases stay untouched for review. No script,
 * no request to anyone, nothing of the site's owner.
 */
import { ABUSE_EMAIL } from '@webnhanh/db';
import { escapeHtml, webUrl } from '@webnhanh/templates';

export function takedownPageHtml(app: { readonly name: string; readonly url: string }): string {
  const name = escapeHtml(app.name);
  const terms = escapeHtml(`${webUrl(app.url).replace(/\/+$/, '')}/terms`);
  return `<!doctype html>
<html lang="vi">
<head>
<meta charset="utf-8">
<meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline'; base-uri 'none'; form-action 'none'">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="robots" content="noindex">
<title>Website này đã bị gỡ</title>
<style>
  :root { color-scheme: light dark; }
  body { margin: 0; min-height: 100vh; display: grid; place-items: center; padding: 16px;
         font: 16px/1.5 system-ui, -apple-system, "Segoe UI", sans-serif; background: #faf7fb; color: #1f1a24; }
  @media (prefers-color-scheme: dark) { body { background: #17131b; color: #f3eef6; } a { color: #f0a6d8; } }
  main { max-width: 440px; text-align: center; }
  h1 { font-size: 1.5rem; margin: 0 0 8px; }
  a { color: #8a2a6b; font-weight: 600; }
</style>
</head>
<body>
<main>
  <h1>Website này đã bị gỡ</h1>
  <p>Website này vi phạm <a href="${terms}">điều khoản sử dụng</a> của ${name} nên đã bị gỡ.</p>
  <p lang="en">This website was removed for breaking the terms of use of ${name}.</p>
  <p>Liên hệ: ${escapeHtml(ABUSE_EMAIL)}</p>
</main>
</body>
</html>
`;
}
