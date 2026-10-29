import type { ReactNode } from 'react';
import { chooseLocale, LOCALE_NAMES, LOCALES, useI18n } from '../i18n';

/**
 * The header's language pill: one button per language of the app, the current one pressed. A pick is stored for
 * every hoandat.com app (`hd_lang`), so the next app opens in it too. Narrow phones show only the language to switch
 * to, by its code; the full name stays in the button's name for screen readers.
 */
export function LanguageSwitch(): ReactNode {
  const { locale, t } = useI18n();
  return (
    <fieldset className="lang-switch" data-id="lang-switch">
      <legend className="visually-hidden">{t('chrome.language')}</legend>
      {LOCALES.map((option) => (
        <button
          key={option}
          type="button"
          className="lang-option"
          lang={option}
          aria-pressed={option === locale}
          data-id={`lang-${option}`}
          onClick={() => chooseLocale(option)}
        >
          <span aria-hidden="true">{LOCALE_NAMES[option].code}</span>
          <span className="visually-hidden">{LOCALE_NAMES[option].name}</span>
        </button>
      ))}
    </fieldset>
  );
}
