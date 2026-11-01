/**
 * What the server entry of the guides (guide-prerender.tsx) gives the build (vite-guide-pages.ts). No imports: the
 * Vite side reads these types without the app's modules.
 */
export interface GuideHead {
  readonly title: string;
  readonly description: string;
  /** Absolute URL of the page (canonical, og:url). */
  readonly url: string;
  /** Absolute URL of the template's first look (og:image), 240×320. */
  readonly image: string;
}

export interface RenderedGuide {
  readonly head: GuideHead;
  /** schema.org data of the page (WebPage and FAQPage), for a JSON-LD data block. */
  readonly jsonLd: Readonly<Record<string, unknown>>;
  /** The markup that goes inside #root. */
  readonly html: string;
}
