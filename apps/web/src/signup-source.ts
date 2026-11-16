/**
 * Where a visitor came from (`utm_source`, `utm_medium`, `utm_campaign` of the address they landed on, an ad or a
 * post), kept for the tab so the sign-up they start pages later still carries it. The server passes the tags on to
 * the IdP, which keeps them on a new account. Each tag once, its first value: the IdP refuses a repeated parameter.
 */
const KEYS = ['utm_source', 'utm_medium', 'utm_campaign'] as const;
const STORAGE_KEY = 'webnhanh.signup-source';
/** The IdP keeps at most 64 characters; a little room here, the IdP decides. */
const MAX_LENGTH = 200;

export type SignUpSource = Partial<Record<(typeof KEYS)[number], string>>;

/** The tags of a query string, each its first non-empty value. */
export function sourceOf(search: string): SignUpSource {
  const params = new URLSearchParams(search);
  const source: SignUpSource = {};
  for (const key of KEYS) {
    const first = params.getAll(key).find((value) => value !== '');
    if (first !== undefined && first.length <= MAX_LENGTH) source[key] = first;
  }
  return source;
}

/**
 * Keeps the tags of the address the visitor landed on (called once when the app starts). An address without tags
 * leaves earlier ones in place: moving around the app must not forget where the visitor came from.
 */
export function rememberSignUpSource(search: string): void {
  const source = sourceOf(search);
  if (Object.keys(source).length === 0) return;
  try {
    sessionStorage.setItem(STORAGE_KEY, JSON.stringify(source));
  } catch {
    // Storage off (private mode, full): the sign-up simply goes without its source.
  }
}

/** The tags kept for this tab, or none. */
export function signUpSource(): SignUpSource {
  try {
    const raw = sessionStorage.getItem(STORAGE_KEY);
    if (!raw) return {};
    const value: unknown = JSON.parse(raw);
    if (typeof value !== 'object' || value === null) return {};
    const source: SignUpSource = {};
    for (const key of KEYS) {
      const tag = (value as Record<string, unknown>)[key];
      if (typeof tag === 'string' && tag !== '' && tag.length <= MAX_LENGTH) source[key] = tag;
    }
    return source;
  } catch {
    return {};
  }
}
