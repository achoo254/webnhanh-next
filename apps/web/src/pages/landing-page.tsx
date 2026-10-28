import { FeatureList, Hero } from '@achoo254/app-shell';
import type { ReactNode } from 'react';
import { brand } from '../brand';
import { useI18n, type MessageKey } from '../i18n';
import { TrangPage } from '../public-page';
import { TrangSignInCard } from '../sign-in';

/** In-page anchors of the landing sections. */
const ANCHORS = { features: 'features', how: 'how' } as const;

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

/**
 * The page visitors see at `/` before signing in: what the app does beside the shared sign-in card (the page's one
 * call to action), then the features and the three steps. No prices.
 */
export function LandingPage(): ReactNode {
  const { t } = useI18n();
  return (
    <TrangPage
      navLinks={[
        { href: `#${ANCHORS.features}`, label: t('nav.features'), dataId: 'landing-nav-features', hideOnPhones: true },
        { href: `#${ANCHORS.how}`, label: t('nav.how'), dataId: 'landing-nav-how', hideOnPhones: true },
      ]}
    >
      <Hero
        eyebrow={brand.appName}
        title={t('hero.title')}
        lede={t('hero.lede')}
        aside={<TrangSignInCard headingLevel={2} title={t('signIn.title')} description={t('signIn.body')} returnTo="/" />}
      />
      <FeatureList
        id={ANCHORS.features}
        eyebrow={t('features.eyebrow')}
        title={t('features.title')}
        items={FEATURES.map(({ id, title, body }) => ({ id, title: t(title), description: t(body) }))}
      />
      <FeatureList
        id={ANCHORS.how}
        dataId="how"
        eyebrow={t('how.eyebrow')}
        title={t('how.title')}
        items={STEPS.map(({ id, title, body }, index) => ({
          id,
          title: t(title),
          description: t(body),
          icon: String(index + 1).padStart(2, '0'),
        }))}
      />
    </TrangPage>
  );
}
