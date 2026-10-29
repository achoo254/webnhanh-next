/** A refused API call: the server's stable error code, and the fields it named (an incomplete draft). */
export class ApiError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    readonly fields: readonly string[] = [],
  ) {
    super(code);
    this.name = 'ApiError';
  }
}

/** The ApiError of a refused response body (`{ error, fields? }`). */
export function apiError(status: number, body: unknown): ApiError {
  const b = typeof body === 'object' && body !== null ? (body as { error?: unknown; fields?: unknown }) : {};
  const fields = Array.isArray(b.fields) ? b.fields.filter((f): f is string => typeof f === 'string') : [];
  return new ApiError(status, typeof b.error === 'string' ? b.error : 'generic', fields);
}

export interface Account {
  readonly id: string;
  readonly createdAt: string;
  /** The admin tools (`/admin`) are open to this account. */
  readonly admin: boolean;
  /** An admin locked the account: nothing of it is published or built. */
  readonly locked: boolean;
  /** Name, email and picture URL from hoandat.com at the last sign-in, for the account menu; null when unknown. */
  readonly name: string | null;
  readonly email: string | null;
  readonly picture: string | null;
}

const optionalText = (value: unknown): string | null => (typeof value === 'string' && value !== '' ? value : null);

/** The account of a /api/me body; `admin` and `locked` read as false when absent. Null when it is not one. */
function readAccount(value: unknown): Account | null {
  if (typeof value !== 'object' || value === null) return null;
  const v = value as Record<string, unknown>;
  if (typeof v.id !== 'string' || typeof v.createdAt !== 'string') return null;
  return {
    id: v.id,
    createdAt: v.createdAt,
    admin: v.admin === true,
    locked: v.locked === true,
    name: optionalText(v.name),
    email: optionalText(v.email),
    picture: optionalText(v.picture),
  };
}

/** A JSON call to the app's server; throws ApiError with the server's code when it refuses. */
export async function call(path: string, init: RequestInit = {}): Promise<unknown> {
  const res = await fetch(path, { credentials: 'same-origin', ...init });
  const body: unknown = res.status === 204 ? null : await res.json().catch(() => null);
  if (!res.ok) {
    throw apiError(res.status, body);
  }
  return body;
}

/** The signed-in account, or null when this browser has no live session. */
export async function getAccount(): Promise<Account | null> {
  try {
    const body = await call('/api/me');
    const account = readAccount(typeof body === 'object' && body !== null ? (body as { account?: unknown }).account : undefined);
    if (!account) throw new ApiError(500, 'bad-response');
    return account;
  } catch (error) {
    if (error instanceof ApiError && error.status === 401) return null;
    throw error;
  }
}

export async function signOut(): Promise<void> {
  await call('/auth/logout', { method: 'POST' });
}

/** Sign-in at the account service, coming back to `returnTo`. */
export function signInUrl(returnTo: string, lang: string): string {
  return `/auth/login?${new URLSearchParams({ return: returnTo, lang }).toString()}`;
}
