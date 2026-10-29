import type { ReactNode } from 'react';
import { Link, useLocation } from 'react-router';
import { brand, BRAND_MARK_URL } from '../brand';
import { useI18n, type MessageKey } from '../i18n';

const LEGAL_LINKS: readonly { readonly to: string; readonly label: MessageKey; readonly dataId: string }[] = [
  { to: '/privacy', label: 'chrome.privacy', dataId: 'foot-privacy' },
  { to: '/terms', label: 'chrome.terms', dataId: 'foot-terms' },
];

/** The colours of the row of blocks along the top of the footer, left to right. */
const BLOCKS = ['coral', 'sun', 'mint', 'sky', 'pink', 'lilac'] as const;

/**
 * Under every page: a row of coloured blocks, the app's mark and name, "An app from hoandat.com" (to the ecosystem's
 * home), then Privacy and Terms.
 */
export function AppFooter(): ReactNode {
  const { t } = useI18n();
  const { pathname } = useLocation();
  const domain = brand.primaryTenant.domain;
  return (
    <footer className="foot" data-id="public-footer">
      <div className="foot-blocks" aria-hidden="true">
        {BLOCKS.map((colour) => (
          <span key={colour} className={`foot-block block-${colour}`} />
        ))}
      </div>
      <div className="foot-inner container">
        <p className="foot-brand">
          <img className="foot-mark" src={BRAND_MARK_URL} width={32} height={32} alt="" />
          <span className="foot-name">{brand.appName}</span>
        </p>
        <nav className="foot-links" aria-label={t('chrome.footLinks')}>
          <a className="foot-link" href={`https://${domain}`} data-id="foot-home">
            {t('chrome.ecosystem')}
          </a>
          {LEGAL_LINKS.map((link) => (
            <Link key={link.dataId} className="foot-link" to={link.to} data-id={link.dataId} aria-current={pathname === link.to ? 'page' : undefined}>
              {t(link.label)}
            </Link>
          ))}
        </nav>
      </div>
    </footer>
  );
}
