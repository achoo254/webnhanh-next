/**
 * Escaping for everything a person typed. Every piece of user text goes through `escapeHtml` before it reaches the
 * page, in text and in attributes alike (both quote kinds are escaped, so the one function is safe in either).
 */
const HTML_ESCAPES: Readonly<Record<string, string>> = {
  '&': '&amp;',
  '<': '&lt;',
  '>': '&gt;',
  '"': '&quot;',
  "'": '&#39;',
};

export function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/g, (c) => HTML_ESCAPES[c] ?? c);
}

/** Tab, line feed and carriage return are text; every other C0 control, DEL and the C1 range are not. */
function isControl(code: number, allowNewline: boolean): boolean {
  if (allowNewline && (code === 0x0a || code === 0x0d || code === 0x09)) return false;
  return code < 0x20 || (code >= 0x7f && code < 0xa0);
}

/** True when `value` has no control characters (line breaks only where `allowNewline`). */
export function isPlainText(value: string, allowNewline: boolean): boolean {
  for (let i = 0; i < value.length; i += 1) {
    if (isControl(value.charCodeAt(i), allowNewline)) return false;
  }
  return true;
}

/**
 * URLs the renderer itself puts in `src`/`srcset`: relative paths of the release or of the editor's image route. No
 * spaces or commas (they would split a srcset entry), no quotes, no scheme other than https.
 */
const ASSET_URL = /^(?:https:\/\/[a-z0-9.-]+)?\/?[A-Za-z0-9][A-Za-z0-9/._-]*$/;

export function assertAssetUrl(url: string): string {
  if (!ASSET_URL.test(url) || url.includes('..')) throw new Error(`refused asset url: ${url}`);
  return url;
}
