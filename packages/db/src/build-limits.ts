/** Limits of developer sites, shared with the web app (which imports this file alone, without the database code). */
export const DEVELOPER_SITES_PER_ACCOUNT = 3;
/**
 * Build time an account may use a day, counted from each build's real run time (the wait in the queue left out). A
 * build may start while some is left, and then runs to its own timeout.
 */
export const BUILD_MINUTES_PER_DAY = 60;
export const BUILD_MS_PER_DAY = BUILD_MINUTES_PER_DAY * 60_000;
/** Builds waiting on the whole server. */
export const BUILD_QUEUE_MAX = 20;

/** Build time used, as shown to people: whole minutes, a started minute counted. */
export function buildMinutesUsed(ms: number): number {
  return Math.ceil(Math.max(ms, 0) / 60_000);
}
