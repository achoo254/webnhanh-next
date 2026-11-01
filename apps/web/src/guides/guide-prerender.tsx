/**
 * Server-side entry of the guide pages, built with `vite build --ssr` and run once at build time (apps/web/prerender.ts)
 * and on each request in dev (vite-guide-pages.ts): the HTML crawlers and link previews read without running the app.
 * The browser renders the same component (guide-page.tsx) over it.
 */
import { StrictMode } from 'react';
import { renderToString } from 'react-dom/server';
import { StaticRouter } from 'react-router';
import { brand } from '../brand';
import { I18nProvider } from '../i18n';
import { variantChoices } from '../pages/template-variant-choices';
import { GUIDES, guideStartHref } from './guide-content';
import { GuidePage } from './guide-page';
import { GUIDE_IDS, GUIDE_PATHS, guideAt } from './guide-paths';
import type { RenderedGuide } from './guide-render-types';

export type { GuideHead, RenderedGuide } from './guide-render-types';

/** The paths the build writes, one file each. */
export function guidePaths(): string[] {
  return GUIDE_IDS.map((id) => GUIDE_PATHS[id]);
}

/** The guide page at `path` as HTML, with its head and JSON-LD, or null when no guide lives there. */
export function renderGuidePage(path: string, origin: string): RenderedGuide | null {
  const id = guideAt(path);
  if (id === null) return null;
  const guide = GUIDES[id];
  const url = `${origin}${guide.path}`;
  const look = variantChoices(guide.template)[0];
  if (!look) throw new Error(`no look with a thumbnail for template ${guide.template}`);
  const image = `${origin}${look.thumb}`;
  const html = renderToString(
    <StrictMode>
      <I18nProvider>
        <StaticRouter location={guide.path}>
          <GuidePage guide={guide} />
        </StaticRouter>
      </I18nProvider>
    </StrictMode>,
  );
  const jsonLd = {
    '@context': 'https://schema.org',
    '@graph': [
      {
        '@type': 'WebPage',
        '@id': `${url}#page`,
        url,
        name: guide.title,
        headline: guide.heading,
        description: guide.description,
        inLanguage: 'vi',
        datePublished: guide.datePublished,
        primaryImageOfPage: image,
        isPartOf: { '@type': 'WebSite', name: brand.appName, url: `${origin}/` },
        potentialAction: { '@type': 'Action', name: guide.cta, target: `${origin}${guideStartHref(guide)}` },
      },
      {
        '@type': 'FAQPage',
        '@id': `${url}#faq`,
        url,
        inLanguage: 'vi',
        mainEntity: guide.faq.map((item) => ({ '@type': 'Question', name: item.question, acceptedAnswer: { '@type': 'Answer', text: item.answer } })),
      },
    ],
  };
  return { head: { title: guide.title, description: guide.description, url, image }, jsonLd, html };
}
