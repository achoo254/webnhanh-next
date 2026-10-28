/**
 * The check before a page goes live. A release is held for an admin when it has a password field, when its title
 * names a bank, an e-wallet or the state, or when its text names one of those (or a big brand) beside words that ask
 * for a login or a code. Pages are read with simple patterns, never run. Names come from the site-name rules
 * (`SENSITIVE_NAMES` of @webnhanh/db), matched as whole words (one to three words joined, accents removed): a shop
 * that writes "Vietcombank" beside its account number is not held, a page that asks for the Vietcombank password is.
 */
import { readdir, open } from 'node:fs/promises';
import path from 'node:path';
import { SENSITIVE_NAMES, type ReviewReason } from '@webnhanh/db';

export interface ReviewFindings {
  readonly reasons: ReviewReason[];
  /** What matched and where, for the admin (at most MAX_MATCHES). */
  readonly matches: string[];
}

const MAX_MATCHES = 10;
/** Only the start of a big file is read: a password field or a title is near the top of any real page. */
const READ_BYTES = 2 * 1024 * 1024;
/** Files looked at in one output. */
const MAX_FILES = 500;

/** Names a page must not use in its title: banks, wallets, the state (and the short bank names of site names). */
const TITLE_NAMES = new Set<string>([...SENSITIVE_NAMES.bank, ...SENSITIVE_NAMES.wallet, ...SENSITIVE_NAMES.state, 'shb', 'ocb', 'evn']);
/** Names that make a login request on a page a phishing sign: the above and the big brands. */
const PAGE_NAMES = new Set<string>([...TITLE_NAMES, ...SENSITIVE_NAMES.brand]);
/**
 * Words asking for a login or a code. `taikhoan` (tài khoản) is left out: shops write "số tài khoản" beside their
 * bank for transfers.
 */
const CREDENTIAL_WORDS = new Set<string>([...SENSITIVE_NAMES.login.filter((word) => word !== 'taikhoan'), 'otp']);

const PASSWORD_PATTERNS = [/<input\b[^>]*\btype\s*=\s*["']?password\b/i, /\btype\s*[:=]\s*["'`]password["'`]/];

/** Lower case, no accents, split into words of letters and digits. */
export function words(text: string): string[] {
  return text
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[đĐ]/g, 'd')
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter(Boolean);
}

/** The first of `names` written as one to three words in a row ("MB Bank" is `mbbank`), or null. */
export function findName(tokens: readonly string[], names: ReadonlySet<string>): string | null {
  for (let i = 0; i < tokens.length; i += 1) {
    let joined = '';
    for (let n = 0; n < 3 && i + n < tokens.length; n += 1) {
      joined += tokens[i + n] ?? '';
      if (names.has(joined)) return joined;
    }
  }
  return null;
}

const ENTITIES: Readonly<Record<string, string>> = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ' };

function decodeEntities(text: string): string {
  return text.replace(/&(#x[0-9a-f]{1,6}|#[0-9]{1,7}|[a-z]{2,6});/gi, (whole, code: string) => {
    if (code.startsWith('#x') || code.startsWith('#X')) return String.fromCodePoint(Number.parseInt(code.slice(2), 16) % 0x110000);
    if (code.startsWith('#')) return String.fromCodePoint(Number(code.slice(1)) % 0x110000);
    return ENTITIES[code.toLowerCase()] ?? whole;
  });
}

/** The visible text of an HTML page: scripts, styles and tags left out. */
function pageText(html: string): string {
  return decodeEntities(
    html
      .replace(/<script\b[\s\S]*?<\/script>/gi, ' ')
      .replace(/<style\b[\s\S]*?<\/style>/gi, ' ')
      .replace(/<!--[\s\S]*?-->/g, ' ')
      .replace(/<[^>]*>/g, ' '),
  );
}

class Findings {
  private readonly reasons = new Set<ReviewReason>();
  private readonly matches: string[] = [];

  add(reason: ReviewReason, match: string): void {
    this.reasons.add(reason);
    if (this.matches.length < MAX_MATCHES) this.matches.push(match);
  }

  result(): ReviewFindings {
    return { reasons: [...this.reasons], matches: [...this.matches] };
  }
}

function reviewInto(findings: Findings, content: string, file: string): void {
  if (PASSWORD_PATTERNS.some((pattern) => pattern.test(content))) findings.add('password-input', `${file}: password field`);
  if (!/\.html?$/i.test(file)) return;
  const title = /<title[^>]*>([\s\S]{0,500}?)<\/title>/i.exec(content)?.[1];
  const inTitle = title === undefined ? null : findName(words(decodeEntities(title)), TITLE_NAMES);
  if (inTitle) findings.add('sensitive-title', `${file}: title names ${inTitle}`);
  const text = words(pageText(content));
  const name = findName(text, PAGE_NAMES);
  const ask = name ? findName(text, CREDENTIAL_WORDS) : null;
  if (name && ask) findings.add('credential-request', `${file}: ${name} with ${ask}`);
}

/** Reviews one page (a template's `index.html`). */
export function reviewPage(html: string, file = 'index.html'): ReviewFindings {
  const findings = new Findings();
  reviewInto(findings, html, file);
  return findings.result();
}

async function readStart(file: string): Promise<string> {
  const handle = await open(file, 'r');
  try {
    const buffer = Buffer.alloc(READ_BYTES);
    const { bytesRead } = await handle.read(buffer, 0, READ_BYTES, 0);
    return buffer.subarray(0, bytesRead).toString('utf8');
  } finally {
    await handle.close();
  }
}

/** Reviews every page and script of an output directory (a developer build): HTML for all checks, scripts for password fields. */
export async function reviewOutput(dir: string): Promise<ReviewFindings> {
  const findings = new Findings();
  const pending = [''];
  let seen = 0;
  for (let rel = pending.pop(); rel !== undefined && seen < MAX_FILES; rel = pending.pop()) {
    for (const entry of await readdir(path.join(dir, rel), { withFileTypes: true })) {
      const childRel = rel === '' ? entry.name : `${rel}/${entry.name}`;
      if (entry.isDirectory()) pending.push(childRel);
      else if (entry.isFile() && /\.(?:html?|m?js)$/i.test(entry.name) && seen < MAX_FILES) {
        seen += 1;
        reviewInto(findings, await readStart(path.join(dir, childRel)), childRel);
      }
    }
  }
  return findings.result();
}
