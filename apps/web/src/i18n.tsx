import { readPreferences, subscribePreferences, writePreference } from '@achoo254/app-shell/preferences';
import { createContext, useContext, useLayoutEffect, useMemo, useSyncExternalStore, type ReactNode } from 'react';
import { BUILD_MINUTES_PER_DAY } from '@webnhanh/db/build-limits';
import { ABUSE_EMAIL } from '@webnhanh/db/site-name';
import { brand, SITES_DOMAIN } from './brand';
import { DICTIONARIES, type Locale, type MessageKey } from './messages';

export type { Locale, MessageKey };
export const LOCALES: readonly Locale[] = ['vi', 'en'];
const DEFAULT_LOCALE: Locale = 'vi';

/** Each language in its own words (the switch never translates them), and its short code for narrow screens. */
export const LOCALE_NAMES: Readonly<Record<Locale, { readonly name: string; readonly code: string }>> = {
  vi: { name: 'Tiếng Việt', code: 'VI' },
  en: { name: 'English', code: 'EN' },
};

export type Translate = (key: MessageKey, params?: Readonly<Record<string, string | number>>) => string;

/**
 * Fills `{name}` placeholders; `{app}`, `{domain}`, `{sites}` and `{email}` (the abuse mailbox) always come from the
 * brand, `{buildMinutes}` from the daily build time.
 */
export function format(template: string, params: Readonly<Record<string, string | number>> = {}): string {
  const all: Readonly<Record<string, string | number>> = { app: brand.appName, domain: brand.primaryTenant.domain, sites: SITES_DOMAIN, email: ABUSE_EMAIL, buildMinutes: BUILD_MINUTES_PER_DAY, ...params };
  return template.replace(/\{(\w+)\}/g, (whole, name: string) => String(all[name] ?? whole));
}

/** Whether `key` is one of the app's messages (for keys built from a server code). */
export function isMessageKey(key: string): key is MessageKey {
  return Object.hasOwn(DICTIONARIES.vi, key);
}

export function translator(locale: Locale): Translate {
  return (key, params) => format(DICTIONARIES[locale][key], params);
}

/** One of the app's languages by the primary subtag of a BCP 47 tag ("vi-VN" is vi, "en-GB" is en). */
export function matchLocale(tag: unknown): Locale | undefined {
  if (typeof tag !== 'string') return undefined;
  const primary = tag.trim().toLowerCase().split(/[-_]/)[0];
  return LOCALES.find((locale) => locale === primary);
}

/** The shared choice of every hoandat.com app (`hd_lang`), else the device's language when the app speaks it, else Vietnamese. */
export function readPreferredLocale(): Locale {
  return readPreferences({ domain: brand.primaryTenant.domain, locales: LOCALES }).lang ?? matchLocale(globalThis.navigator?.language) ?? DEFAULT_LOCALE;
}

/**
 * Stores the language for every hoandat.com app (cookie `hd_lang` on the root domain); the provider's subscription
 * re-renders the app in it.
 */
export function chooseLocale(locale: Locale): void {
  writePreference('lang', locale, { domain: brand.primaryTenant.domain });
}

const serverLocale = (): Locale => DEFAULT_LOCALE;

interface I18n {
  readonly locale: Locale;
  readonly t: Translate;
}

const I18nContext = createContext<I18n | null>(null);

/**
 * Speaks the visitor's language to the whole app. The header's language switch stores the choice (`chooseLocale`);
 * the subscription re-renders the app in it, also when another app changed it while this tab was away.
 */
export function I18nProvider({ children }: { readonly children: ReactNode }): ReactNode {
  const locale = useSyncExternalStore(subscribePreferences, readPreferredLocale, serverLocale);
  useLayoutEffect(() => {
    document.documentElement.lang = locale;
  }, [locale]);
  const value = useMemo(() => ({ locale, t: translator(locale) }), [locale]);
  return <I18nContext value={value}>{children}</I18nContext>;
}

export function useI18n(): I18n {
  const value = useContext(I18nContext);
  if (!value) throw new Error('useI18n outside I18nProvider');
  return value;
}
