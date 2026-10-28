/** Codes of abuse reports and reviews shared with the web app (no database code here, so the browser can import it). */

/** What a report says is wrong with a site, as the form offers it. */
export const ABUSE_CATEGORIES = ['scam', 'malware', 'illegal', 'spam', 'copyright', 'other'] as const;
export type AbuseCategory = (typeof ABUSE_CATEGORIES)[number];

/**
 * Why a release waits for an admin before it goes live: a password field, a bank, wallet or state name in the title,
 * or such a name beside words that ask for a login or a code.
 */
export const REVIEW_REASONS = ['password-input', 'sensitive-title', 'credential-request'] as const;
export type ReviewReason = (typeof REVIEW_REASONS)[number];
