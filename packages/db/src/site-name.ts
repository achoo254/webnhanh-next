/**
 * Site names become `<name>.hoandat.io.vn` and the directory SITES_DIR/<name>. The nginx `server_name` regex in
 * infra/nginx/hoandat.io.vn.conf accepts the same shape; keep the two in step.
 */
/** The domain under which every site gets its name. */
export const SITES_DOMAIN = 'hoandat.io.vn';

/**
 * The one mailbox of the sites' domain, for abuse reports by email (shown on the report page and the "removed" page,
 * and given to the Public Suffix List). Read and answered within 30 days.
 */
export const ABUSE_EMAIL = `noreply@${SITES_DOMAIN}`;

/** Where a site is reported: the app's public page `/bao-cao`, with the site's name filled in. */
export function reportUrl(appUrl: string, name: string): string {
  return `${appUrl}/bao-cao?site=${encodeURIComponent(name)}`;
}

/** `https://<name>.hoandat.io.vn`: the origin of a site (its page, and the only origin its form may post from). */
export function siteOrigin(name: string): string {
  return `https://${name}.${SITES_DOMAIN}`;
}

export const SITE_NAME_PATTERN = /^[a-z0-9](?:[a-z0-9-]{1,28})[a-z0-9]$/;

/** Names kept for the service itself, its subdomains, and the smoke-test site. */
const RESERVED = new Set([
  'www', 'api', 'app', 'admin', 'auth', 'login', 'mail', 'smtp', 'imap', 'pop', 'ftp', 'ns1', 'ns2', 'cdn',
  'static', 'assets', 'media', 'status', 'help', 'support', 'docs', 'blog', 'trang', 'webnhanh', 'web-nhanh', 'hoandat', 'root', 'abuse',
  'postmaster', 'webmaster', 'security', 'kiem-tra',
]);

/**
 * Names phishing pages pretend to be, by kind, and words that ask for a login. Matched in site names (any piece,
 * anywhere, hyphens removed) and, by the pre-publish review, in what a page says (`SENSITIVE_NAMES`).
 */
const BANK_PIECES = ['vietcombank', 'techcombank', 'vietinbank', 'agribank', 'sacombank', 'vpbank', 'tpbank', 'mbbank', 'bidv', 'hdbank', 'seabank', 'nganhang', 'bank'];
const WALLET_PIECES = ['momo', 'zalopay', 'vnpay', 'shopeepay', 'viettelmoney', 'paypal', 'binance', 'metamask', 'wallet', 'vidientu'];
const BRAND_PIECES = ['facebook', 'messenger', 'instagram', 'google', 'gmail', 'icloud', 'microsoft', 'outlook', 'zalo', 'shopee', 'lazada', 'tiktok', 'netflix'];
const STATE_PIECES = ['chinhphu', 'congan', 'dichvucong', 'vneid', 'baohiem', 'hoanthue', 'nopthue', 'cucthue', 'thuetncn'];
const LOGIN_PIECES = ['dangnhap', 'login', 'signin', 'xacminh', 'xacthuc', 'verify', 'taikhoan', 'password', 'matkhau'];

/** The groups of sensitive pieces, for checks beyond site names. */
export const SENSITIVE_NAMES = {
  bank: BANK_PIECES,
  wallet: WALLET_PIECES,
  brand: BRAND_PIECES,
  state: STATE_PIECES,
  login: LOGIN_PIECES,
} as const satisfies Readonly<Record<string, readonly string[]>>;

/**
 * Pieces that make a name easy to use for phishing: banks, wallets, big brands, the state, and words that ask for a
 * login. Matched anywhere in the name with hyphens removed. Strict on purpose: a refused honest name costs a retry,
 * a phishing page can get the whole domain blocked.
 */
const SENSITIVE_PIECES = [...BANK_PIECES, ...WALLET_PIECES, ...BRAND_PIECES, ...STATE_PIECES, ...LOGIN_PIECES];

/**
 * Short or common words that only count as a whole hyphen-separated word: as pieces they would refuse honest names
 * such as `lau-hot-pot` (otp). `thue` alone is not refused: without accents it is also thuê ("rent", as in
 * `thue-xe`); tax scams are caught by the pieces above (hoàn thuế, nộp thuế, cục thuế).
 */
const SENSITIVE_WORDS = new Set(['shb', 'ocb', 'evn', 'gov', 'otp', 'apple', 'steam', 'account', 'secure']);

export type SiteNameCheck =
  | { ok: true; name: string }
  | { ok: false; reason: 'format' | 'reserved' | 'sensitive' };

/** Normalizes (trim, lower case) and checks a requested site name. */
export function checkSiteName(input: string): SiteNameCheck {
  const name = input.trim().toLowerCase();
  if (!SITE_NAME_PATTERN.test(name) || name.includes('--')) return { ok: false, reason: 'format' };
  if (RESERVED.has(name)) return { ok: false, reason: 'reserved' };
  const bare = name.replaceAll('-', '');
  if (SENSITIVE_PIECES.some((piece) => bare.includes(piece))) return { ok: false, reason: 'sensitive' };
  if (name.split('-').some((word) => SENSITIVE_WORDS.has(word))) return { ok: false, reason: 'sensitive' };
  return { ok: true, name };
}
