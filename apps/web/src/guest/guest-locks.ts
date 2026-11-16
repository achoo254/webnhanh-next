/**
 * Coordination between tabs of the same browser over the one draft they share. Web Locks where the browser has them;
 * otherwise a short lease in localStorage for the transfer (not atomic, but two tabs pressing Publish within the same
 * instant is the only case it misses), and no sweeping of photos at all (never deleting is the safe side).
 */

/** Held, shared, by every open guest editor: photos are swept only when no editor is open. */
export const EDITOR_LOCK = 'webnhanh-guest-editor';
/** Held, exclusive, while a draft moves into an account: two tabs never make two sites. */
export const TRANSFER_LOCK = 'webnhanh-guest-transfer';

const LEASE_KEY = 'webnhanh.guest-transfer-lease';
/** A lease older than this is a tab that died in the middle: it is taken over. */
const LEASE_MS = 2 * 60_000;
const LEASE_POLL_MS = 250;

function webLocks(): LockManager | null {
  return typeof navigator !== 'undefined' && navigator.locks && typeof navigator.locks.request === 'function' ? navigator.locks : null;
}

const sleep = (ms: number): Promise<void> => new Promise((resolve) => setTimeout(resolve, ms));

/** Runs `run` while no other tab runs it under `name`; waits for the other tab first. */
export async function withExclusiveLock<T>(name: string, run: () => Promise<T>): Promise<T> {
  const locks = webLocks();
  if (locks) return locks.request(name, { mode: 'exclusive' }, run);
  return withLease(run);
}

async function withLease<T>(run: () => Promise<T>): Promise<T> {
  const owner = crypto.randomUUID();
  for (;;) {
    let held: { owner?: unknown; until?: unknown } | null;
    try {
      const raw = localStorage.getItem(LEASE_KEY);
      held = raw ? (JSON.parse(raw) as { owner?: unknown; until?: unknown }) : null;
    } catch {
      held = null;
    }
    if (!held || typeof held.until !== 'number' || held.until < Date.now()) break;
    await sleep(LEASE_POLL_MS);
  }
  try {
    localStorage.setItem(LEASE_KEY, JSON.stringify({ owner, until: Date.now() + LEASE_MS }));
  } catch {
    // Storage off: nothing to coordinate with (no other tab can read a draft either).
  }
  try {
    return await run();
  } finally {
    try {
      const raw = localStorage.getItem(LEASE_KEY);
      if (raw && (JSON.parse(raw) as { owner?: unknown }).owner === owner) localStorage.removeItem(LEASE_KEY);
    } catch {
      // The lease runs out on its own.
    }
  }
}

/** Holds `name` in shared mode until the returned release is called (no-op without Web Locks). */
export function holdShared(name: string): () => void {
  const locks = webLocks();
  if (!locks) return () => undefined;
  let release: () => void = () => undefined;
  const released = new Promise<void>((resolve) => {
    release = resolve;
  });
  locks.request(name, { mode: 'shared' }, () => released).catch(() => undefined);
  return release;
}

/** Runs `run` only when no other tab holds `name` at all (and returns false without running it otherwise). */
export async function whenNobodyHolds(name: string, run: () => Promise<void>): Promise<boolean> {
  const locks = webLocks();
  if (!locks) return false;
  return locks.request(name, { mode: 'exclusive', ifAvailable: true }, async (lock) => {
    if (!lock) return false;
    await run();
    return true;
  });
}
