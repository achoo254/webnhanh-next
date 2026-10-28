/**
 * What a page shows while it waits: a loader in the middle of the screen, or placeholder site cards where the list of
 * websites will appear. The words stay for screen readers (`role="status"`); the shapes are decoration.
 */
import type { ReactNode } from 'react';
import boltUrl from './assets/loader-bolt.webp';
import { useI18n } from './i18n';

/**
 * In the middle of the page: the AI-drawn pink bolt floating over a soft glow, three dots in the app's gradient, then
 * "Loading…" in muted text.
 */
export function Loader(): ReactNode {
  const { t } = useI18n();
  return (
    <div className="loading" role="status">
      <img className="loading-art" src={boltUrl} width={112} height={112} alt="" />
      <span className="loader-dots" aria-hidden="true">
        <span />
        <span />
        <span />
      </span>
      <span className="loading-text">{t('loading')}</span>
    </div>
  );
}

const PLACEHOLDER_CARDS = 3;

/** Grey site cards (cover, status, address, buttons) with a light sweeping across, in the grid of the real ones. */
export function SiteCardsPlaceholder(): ReactNode {
  const { t } = useI18n();
  return (
    <div role="status">
      <span className="visually-hidden">{t('loading')}</span>
      <ul className="site-grid" aria-hidden="true">
        {Array.from({ length: PLACEHOLDER_CARDS }, (_, index) => (
          <li key={index} className="site-card site-card-placeholder">
            <div className="site-card-media shimmer" />
            <div className="site-card-body">
              <span className="shimmer shimmer-badge" />
              <span className="shimmer shimmer-line" />
              <span className="row">
                <span className="shimmer shimmer-pill" />
                <span className="shimmer shimmer-pill" />
              </span>
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}
