import { matchShellLocale, readPreferences, subscribePreferences } from '@achoo254/app-shell';
import { createContext, useContext, useLayoutEffect, useMemo, useSyncExternalStore, type ReactNode } from 'react';
import { brand, SITES_DOMAIN } from './brand';
import { DICTIONARIES, type Locale, type MessageKey } from './messages';

export type { Locale, MessageKey };
export const LOCALES: readonly Locale[] = ['vi', 'en'];
const DEFAULT_LOCALE: Locale = 'vi';

export type Translate = (key: MessageKey, params?: Readonly<Record<string, string | number>>) => string;

/** Fills `{name}` placeholders; `{app}`, `{domain}` and `{sites}` always come from the brand. */
export function format(template: string, params: Readonly<Record<string, string | number>> = {}): string {
  const all: Readonly<Record<string, string | number>> = { app: brand.appName, domain: brand.primaryTenant.domain, sites: SITES_DOMAIN, ...params };
  return template.replace(/\{(\w+)\}/g, (whole, name: string) => String(all[name] ?? whole));
}

/** Whether `key` is one of the app's messages (for keys built from a server code). */
export function isMessageKey(key: string): key is MessageKey {
  return Object.hasOwn(DICTIONARIES.vi, key);
}

export function translator(locale: Locale): Translate {
  return (key, params) => format(DICTIONARIES[locale][key], params);
}

/** The shared choice of every hoandat.com app (`hd_lang`), else the device's language when the app speaks it, else Vietnamese. */
export function readPreferredLocale(): Locale {
  return readPreferences({ domain: brand.primaryTenant.domain }).lang ?? matchShellLocale(globalThis.navigator?.language) ?? DEFAULT_LOCALE;
}

const serverLocale = (): Locale => DEFAULT_LOCALE;

interface I18n {
  readonly locale: Locale;
  readonly t: Translate;
}

const I18nContext = createContext<I18n | null>(null);

/**
 * Speaks the visitor's language to the whole app. The footer's language switch (@achoo254/app-shell) stores the
 * choice itself; the subscription re-renders the app in it, also when another app changed it while this tab was away.
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

/** `onLocaleChange` of the shared switches: the switch already stored the choice, and the provider follows it. */
export function followStoredLocale(): void {}
