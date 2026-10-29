import type { ReactNode } from 'react';
import { AppFooter } from './frame/app-footer';
import { AppHeader, LOGIN_PATH, type NavLink } from './frame/app-header';
import { useI18n } from './i18n';

export { LOGIN_PATH, type NavLink };

/**
 * Every page of the app in its own frame: skip link, header (mark and name, links, language, sign-in or
 * `accountSlot`), the page in the content column, footer with the hoandat.com and legal links.
 */
export function AppPage({
  children,
  layout = 'flow',
  navLinks,
  accountSlot,
}: {
  readonly children: ReactNode;
  /** "center" for the sign-in card alone (/login), "flow" otherwise. */
  readonly layout?: 'flow' | 'center';
  readonly navLinks?: readonly NavLink[];
  readonly accountSlot?: ReactNode;
}): ReactNode {
  const { t } = useI18n();
  return (
    <div className="app">
      <a className="skip-link" href="#main" data-id="skip-link">
        {t('chrome.skip')}
      </a>
      <AppHeader navLinks={navLinks} accountSlot={accountSlot} />
      {/* Focusable by the skip link only, not in the tab order. */}
      <main id="main" tabIndex={-1} className={layout === 'center' ? 'app-main container app-main-center' : 'app-main container'}>
        {children}
      </main>
      <AppFooter />
    </div>
  );
}
