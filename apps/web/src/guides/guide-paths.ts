/**
 * Paths of the guide pages (what people search for, each leading to one template). No imports: the Vite config reads
 * it in Node to write the sitemap and to serve the prerendered pages in dev, the app to route them.
 */
export const GUIDE_PATHS = {
  wedding: '/thiep-cuoi-online',
  shop: '/website-ban-hang-mien-phi',
  tet: '/thiep-tet-2027',
} as const;

export type GuideId = keyof typeof GUIDE_PATHS;
export type GuidePath = (typeof GUIDE_PATHS)[GuideId];

export const GUIDE_IDS: readonly GuideId[] = ['wedding', 'shop', 'tet'];

/** The guide at `path` (a trailing slash allowed), or null. */
export function guideAt(path: string): GuideId | null {
  const normalised = path.length > 1 ? path.replace(/\/+$/, '') : path;
  return GUIDE_IDS.find((id) => GUIDE_PATHS[id] === normalised) ?? null;
}

/** Every public page worth listing for search engines, in sitemap order, with how much it matters. */
export const SITEMAP_PAGES: readonly { readonly path: string; readonly priority: string; readonly changefreq: 'weekly' | 'monthly' | 'yearly' }[] = [
  { path: '/', priority: '1.0', changefreq: 'weekly' },
  ...GUIDE_IDS.map((id) => ({ path: GUIDE_PATHS[id], priority: '0.8', changefreq: 'monthly' as const })),
  { path: '/new', priority: '0.6', changefreq: 'monthly' },
  { path: '/credits', priority: '0.2', changefreq: 'yearly' },
  { path: '/privacy', priority: '0.2', changefreq: 'yearly' },
  { path: '/terms', priority: '0.2', changefreq: 'yearly' },
];
