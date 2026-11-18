/**
 * The app's files a preview page needs, inlined as `data:` URLs. The preview frame is sandboxed without
 * `allow-same-origin` (its page runs the template's scripts, so it must not be the app's origin): from there a
 * browser sends no session cookie with a request (the owner's photos come from the signed-in image route) and fetches
 * fonts in CORS mode from a `null` origin. So the editor fetches those files itself, once each, and swaps them into the
 * page; the page's CSP then also allows `data:` pictures and fonts. Nothing else of the page changes.
 */
import { useEffect, useState } from 'react';

/** The URLs in a preview page that only the app itself can load: the owner's photos and the looks' font files. */
const APP_FILE = /\/(?:api\/sites\/[0-9a-f-]+\/images\/[A-Za-z0-9._-]+|assets\/preview-fonts\/[A-Za-z0-9._-]+\.woff2)/g;

/** What a fetched file may become: base64 only, so nothing in it can leave the attribute or `url()` it is put in. */
const DATA_URL = /^data:(?:image\/(?:webp|jpeg|png)|font\/woff2|application\/octet-stream);base64,[A-Za-z0-9+/]+={0,2}$/;

/** Every file fetched this session, by URL: its data URL, or null when it could not be read. */
const loaded = new Map<string, string | null>();
const pending = new Map<string, Promise<void>>();

function readAsDataUrl(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => (typeof reader.result === 'string' ? resolve(reader.result) : reject(new Error('not a data URL')));
    reader.onerror = () => reject(reader.error ?? new Error('read failed'));
    reader.readAsDataURL(blob);
  });
}

function load(url: string): Promise<void> {
  const known = pending.get(url);
  if (known) return known;
  const task = fetch(url, { credentials: 'same-origin' })
    .then((res) => {
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      return res.blob();
    })
    .then(readAsDataUrl)
    .then((data) => {
      loaded.set(url, DATA_URL.test(data) ? data : null);
    })
    .catch((error: unknown) => {
      loaded.set(url, null);
      console.warn('preview file not loaded', url, error instanceof Error ? error.message : String(error));
    });
  pending.set(url, task);
  return task;
}

/** The app files `html` names, each once. */
export function appFilesOf(html: string): string[] {
  return [...new Set(html.match(APP_FILE) ?? [])];
}

/**
 * `html` with every app file already fetched swapped for its data URL, and its CSP allowing `data:` pictures and
 * fonts. Files not fetched (yet, or that failed) stay as they are: the frame shows them as missing.
 */
export function inlineAppFiles(html: string, files: ReadonlyMap<string, string | null>): string {
  let out = html;
  for (const url of appFilesOf(html)) {
    const data = files.get(url);
    if (data) out = out.replaceAll(url, data);
  }
  // The CSP as the renderer writes it in the page's meta tag (escaped).
  return out.replace('img-src &#39;self&#39;', 'img-src &#39;self&#39; data:').replace('font-src &#39;self&#39;', 'font-src &#39;self&#39; data:');
}

/**
 * `html` with its app files inlined, updated as they arrive (fetched once per session, shared by every preview). Until a
 * file arrives the frame tries its app URL, which fails (no cookie, `null` origin): a photo or font missing for a moment
 * on the first preview only.
 */
export function useInlinedAppFiles(html: string): string {
  const [, setVersion] = useState(0);
  const missing = appFilesOf(html).filter((url) => !loaded.has(url));
  const key = missing.join('\n');
  useEffect(() => {
    if (!key) return;
    let live = true;
    void Promise.all(key.split('\n').map(load)).then(() => {
      if (live) setVersion((v) => v + 1);
    });
    return () => {
      live = false;
    };
  }, [key]);
  return inlineAppFiles(html, loaded);
}
