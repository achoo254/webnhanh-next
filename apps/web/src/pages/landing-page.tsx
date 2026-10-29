import type { ReactNode } from 'react';
import { brand } from '../brand';
import { useI18n, type MessageKey } from '../i18n';
import { AppPage } from '../public-page';
import { AppSignInCard } from '../sign-in';
import { interleavedVariantChoices, type VariantChoice } from './template-variant-choices';

/** In-page anchors of the landing sections. */
const ANCHORS = { features: 'features', how: 'how' } as const;

/** The small drawings of the features: a page built from blocks, an address, code. Decoration only. */
const FEATURE_ICONS: Readonly<Record<string, ReactNode>> = {
  template: (
    <svg viewBox="0 0 32 32" width="32" height="32" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinejoin="round">
      <rect x="4" y="5" width="24" height="9" rx="3" />
      <rect x="4" y="18" width="10" height="9" rx="3" />
      <rect x="18" y="18" width="10" height="9" rx="3" />
    </svg>
  ),
  address: (
    <svg viewBox="0 0 32 32" width="32" height="32" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round">
      <circle cx="16" cy="16" r="11" />
      <path d="M5 16h22M16 5c3.5 3.2 5 7 5 11s-1.5 7.8-5 11c-3.5-3.2-5-7-5-11s1.5-7.8 5-11Z" />
    </svg>
  ),
  developer: (
    <svg viewBox="0 0 32 32" width="32" height="32" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round">
      <path d="m11 9-7 7 7 7M21 9l7 7-7 7M18 6l-4 20" />
    </svg>
  ),
};

const FEATURES: readonly { id: string; title: MessageKey; body: MessageKey }[] = [
  { id: 'template', title: 'features.template.title', body: 'features.template.body' },
  { id: 'address', title: 'features.address.title', body: 'features.address.body' },
  { id: 'developer', title: 'features.developer.title', body: 'features.developer.body' },
];

const STEPS: readonly { id: string; title: MessageKey; body: MessageKey }[] = [
  { id: 'sign-in', title: 'how.signIn.title', body: 'how.signIn.body' },
  { id: 'make', title: 'how.make.title', body: 'how.make.body' },
  { id: 'publish', title: 'how.publish.title', body: 'how.publish.body' },
];

/** Columns of the template wall (rows on phones). */
const MOSAIC_COLUMNS = 3;
/** Pictures of the first column load at once (they are in view first); the rest when they scroll in. */
const EAGER_TILES = 3;

/**
 * The page visitors see at `/` before signing in: the title and the sign-in card (the page's one call to action)
 * beside a slowly moving wall of the templates' looks, then the features and the three steps. No prices.
 */
export function LandingPage(): ReactNode {
  const { t } = useI18n();
  return (
    <AppPage
      navLinks={[
        { href: `#${ANCHORS.features}`, label: t('nav.features'), dataId: 'landing-nav-features', hideOnPhones: true },
        { href: `#${ANCHORS.how}`, label: t('nav.how'), dataId: 'landing-nav-how', hideOnPhones: true },
      ]}
    >
      <section className="hero" data-id="hero">
        <span className="hero-shape hero-shape-1" aria-hidden="true" />
        <span className="hero-shape hero-shape-2" aria-hidden="true" />
        <span className="hero-shape hero-shape-3" aria-hidden="true" />
        <div className="hero-intro">
          <p className="eyebrow">{brand.appName}</p>
          <h1 className="hero-title">{t('hero.title')}</h1>
          <p className="hero-lede">{t('hero.lede')}</p>
          <AppSignInCard headingLevel={2} title={t('signIn.title')} description={t('signIn.body')} returnTo="/" />
        </div>
        <TemplateWall />
      </section>

      <section className="landing-section" id={ANCHORS.features} data-id="features">
        <div className="section-head">
          <p className="eyebrow">{t('features.eyebrow')}</p>
          <h2 className="section-title">{t('features.title')}</h2>
        </div>
        <ul className="feature-grid">
          {FEATURES.map(({ id, title, body }) => (
            <li key={id} className={`feature feature-${id}`} data-id={`feature-${id}`}>
              <span className="feature-icon" aria-hidden="true">
                {FEATURE_ICONS[id]}
              </span>
              <h3 className="feature-title">{t(title)}</h3>
              <p className="feature-text">{t(body)}</p>
            </li>
          ))}
        </ul>
      </section>

      <section className="landing-section" id={ANCHORS.how} data-id="how">
        <div className="section-head">
          <p className="eyebrow">{t('how.eyebrow')}</p>
          <h2 className="section-title">{t('how.title')}</h2>
        </div>
        <ol className="how-grid">
          {STEPS.map(({ id, title, body }, index) => (
            <li key={id} className="how-step" data-id={`feature-${id}`}>
              <span className="how-number" aria-hidden="true">
                {String(index + 1).padStart(2, '0')}
              </span>
              <h3 className="feature-title">{t(title)}</h3>
              <p className="feature-text">{t(body)}</p>
            </li>
          ))}
        </ol>
      </section>
    </AppPage>
  );
}

/**
 * The looks of every template as small browser windows in moving columns (rows on phones), each list twice so the
 * movement loops without a jump. Decoration: the template picker after sign-in is where they are chosen.
 */
function TemplateWall(): ReactNode {
  const { t } = useI18n();
  const choices = interleavedVariantChoices();
  const columns = Array.from({ length: MOSAIC_COLUMNS }, (_, column) => choices.filter((_, index) => index % MOSAIC_COLUMNS === column));
  return (
    <div className="wall" aria-hidden="true" data-id="template-wall">
      {columns.map((column, columnIndex) => (
        <div key={columnIndex} className={`wall-lane wall-lane-${columnIndex + 1}`}>
          <ul className="wall-track">
            {[...column, ...column].map((choice, index) => (
              <WallTile key={`${choice.label}-${index}`} choice={choice} label={t(choice.label)} eager={columnIndex === 0 && index < EAGER_TILES} />
            ))}
          </ul>
        </div>
      ))}
    </div>
  );
}

function WallTile({ choice, label, eager }: { readonly choice: VariantChoice; readonly label: string; readonly eager: boolean }): ReactNode {
  return (
    <li className="wall-tile">
      <span className="wall-tile-bar">
        <i />
        <i />
        <i />
      </span>
      <img src={choice.thumb} alt="" width={240} height={320} loading={eager ? 'eager' : 'lazy'} decoding="async" />
      <span className="wall-tile-label">{label}</span>
    </li>
  );
}
