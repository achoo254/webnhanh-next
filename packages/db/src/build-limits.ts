/** Limits of developer sites, shared with the web app (which imports this file alone, without the database code). */
export const DEVELOPER_SITES_PER_ACCOUNT = 3;
/** Builds an account may start a day (failed ones count, skipped ones do not). */
export const BUILDS_PER_DAY = 5;
/** Builds waiting on the whole server. */
export const BUILD_QUEUE_MAX = 20;
