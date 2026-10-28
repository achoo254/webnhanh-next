/**
 * The colours a page can take: few on purpose. White text on every accent has a contrast of at least 4.5:1; `ink` on
 * `soft` and on `pop` far more (`palettes.test.ts` checks every one).
 */
export interface Palette {
  readonly accent: string;
  readonly soft: string;
  readonly ink: string;
  /** A light second colour for stickers, tags and tape; `ink` on it reads at 4.5:1 or more. */
  readonly pop: string;
}

/** Every palette of every template. */
export const ALL_PALETTE_IDS = ['berry', 'rose', 'sunset', 'leaf', 'ocean', 'ink', 'lucky', 'blush', 'sepia'] as const;
export type PaletteId = (typeof ALL_PALETTE_IDS)[number];

/** The shop page's palettes (its editor shows these); the newer templates take every palette. */
export const PALETTE_IDS = ['berry', 'rose', 'sunset', 'leaf', 'ocean', 'ink'] as const satisfies readonly PaletteId[];
export type ShopPaletteId = (typeof PALETTE_IDS)[number];

export const PALETTES: Readonly<Record<PaletteId, Palette>> = {
  berry: { accent: '#6d4ae0', soft: '#f6f3ff', ink: '#1e1636', pop: '#ffd84d' },
  rose: { accent: '#c2307a', soft: '#fff2f8', ink: '#3a1028', pop: '#ffd84d' },
  sunset: { accent: '#c2410c', soft: '#fff4ec', ink: '#3b1d0c', pop: '#9ee6d0' },
  leaf: { accent: '#15803d', soft: '#f0faf3', ink: '#0f2e1a', pop: '#ffd84d' },
  ocean: { accent: '#1d4ed8', soft: '#eff5ff', ink: '#0f1f45', pop: '#ffc2a8' },
  ink: { accent: '#1f1b2e', soft: '#f5f5f7', ink: '#1f1b2e', pop: '#ffd84d' },
  /** Red and gold: Tết, a traditional wedding. */
  lucky: { accent: '#b3261e', soft: '#fff6e6', ink: '#3b0d08', pop: '#ffd25e' },
  /** Dusty rose and blush: pastel flowers. */
  blush: { accent: '#a3456c', soft: '#fdf1f4', ink: '#3a1424', pop: '#f7d5e1' },
  /** Brown paper and cream: vintage, film photos. */
  sepia: { accent: '#7a4a22', soft: '#f6efe3', ink: '#2e1f12', pop: '#ead3a4' },
};
