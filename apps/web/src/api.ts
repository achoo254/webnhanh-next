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
}

function isAccount(value: unknown): value is Account {
  if (typeof value !== 'object' || value === null) return false;
  const v = value as Record<string, unknown>;
  return typeof v.id === 'string' && typeof v.createdAt === 'string';
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
    const account = typeof body === 'object' && body !== null ? (body as { account?: unknown }).account : undefined;
    if (!isAccount(account)) throw new ApiError(500, 'bad-response');
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
