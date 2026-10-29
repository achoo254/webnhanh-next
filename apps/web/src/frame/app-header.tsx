import type { ReactNode } from 'react';
import { Link, useLocation } from 'react-router';
import { brand, BRAND_MARK_URL } from '../brand';
import { useI18n } from '../i18n';
import { LanguageSwitch } from './language-switch';

export const LOGIN_PATH = '/login';

/** A header link: an in-page anchor (`#…`) or a path of the app. */
export interface NavLink {
  readonly href: string;
  readonly label: string;
  readonly dataId: string;
  /** Left out of the header on phones, where the name, the language and the sign-in need the room. */
  readonly hideOnPhones?: boolean;
}

/**
 * The sticky top bar of every page: the mark and name linking home, the page's few links, the language pill, then
 * the sign-in pill, or `accountSlot` (Đăng xuất) once signed in.
 */
export function AppHeader({ navLinks = [], accountSlot }: { readonly navLinks?: readonly NavLink[]; readonly accountSlot?: ReactNode }): ReactNode {
  const { t } = useI18n();
  const { pathname } = useLocation();
  return (
    <header className="topbar" data-id="public-header">
      <div className="topbar-inner container">
        <Link to="/" className="brand" data-id="public-home">
          <img className="brand-mark" src={BRAND_MARK_URL} width={36} height={36} alt="" />
          <span className="brand-name">{brand.appName}</span>
        </Link>
        {navLinks.length > 0 ? (
          <nav className="topbar-nav" aria-label={t('chrome.nav')}>
            {navLinks.map((link) => {
              const className = link.hideOnPhones === true ? 'topbar-link hide-phone' : 'topbar-link';
              return link.href.startsWith('#') ? (
                <a key={link.dataId} className={className} href={link.href} data-id={link.dataId}>
                  {link.label}
                </a>
              ) : (
                <Link key={link.dataId} className={className} to={link.href} data-id={link.dataId} aria-current={pathname === link.href ? 'page' : undefined}>
                  {link.label}
                </Link>
              );
            })}
          </nav>
        ) : null}
        <div className="topbar-end">
          <LanguageSwitch />
          {accountSlot ?? (
            <Link to={LOGIN_PATH} className="topbar-cta" data-id="public-sign-in" aria-current={pathname === LOGIN_PATH ? 'page' : undefined}>
              {t('chrome.signIn')}
            </Link>
          )}
        </div>
      </div>
    </header>
  );
}
