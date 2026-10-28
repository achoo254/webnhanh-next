/**
 * The typefaces of the shop styles. Each style has a display face and a body face, all OFL-1.1 from Google Fonts as
 * packaged by Fontsource (`@fontsource/<source>`, its `files/` directory). Only the Latin and Vietnamese subsets are
 * used: between them they cover every Vietnamese letter (the Latin Extended subset is not needed). The files are
 * laid out beside the page (the publish job copies them into the release, the editor serves them as its own assets),
 * so a shop page never asks anyone else for a font.
 *
 * Plain data with no runtime imports: the web app's Vite plugin loads this file as it is
 * (`@webnhanh/templates/shop-fonts`).
 */
import type { StyleId } from './looks';

export const LATIN_RANGE =
  'U+0000-00FF,U+0131,U+0152-0153,U+02BB-02BC,U+02C6,U+02DA,U+02DC,U+0304,U+0308,U+0329,U+2000-206F,U+20AC,U+2122,U+2191,U+2193,U+2212,U+2215,U+FEFF,U+FFFD';
export const VIETNAMESE_RANGE =
  'U+0102-0103,U+0110-0111,U+0128-0129,U+0168-0169,U+01A0-01A1,U+01AF-01B0,U+0300-0301,U+0303-0304,U+0308-0309,U+0323,U+0329,U+1EA0-1EF9,U+20AB';

/** One face in one weight: its CSS family name and its Fontsource package id. */
interface Face {
  readonly family: string;
  readonly source: string;
  readonly weight: number;
}

/** One woff2 file of a face. */
export interface FontFile extends Face {
  /** File name in `@fontsource/<source>/files/`. */
  readonly file: string;
  readonly range: string;
}

export interface StyleFonts {
  readonly display: Face;
  readonly body: readonly Face[];
}

const BRICOLAGE: Face = { family: 'Bricolage Grotesque', source: 'bricolage-grotesque', weight: 800 };
const NEWSREADER: Face = { family: 'Newsreader', source: 'newsreader', weight: 500 };
const BALOO: Face = { family: 'Baloo 2', source: 'baloo-2', weight: 700 };
const BE_VIETNAM: readonly Face[] = [400, 600].map((weight) => ({ family: 'Be Vietnam Pro', source: 'be-vietnam-pro', weight }));
const NUNITO: readonly Face[] = [400, 700].map((weight) => ({ family: 'Nunito', source: 'nunito', weight }));

export const STYLE_FONTS: Readonly<Record<StyleId, StyleFonts>> = {
  'ruc-ro': { display: BRICOLAGE, body: BE_VIETNAM },
  'tinh-te': { display: NEWSREADER, body: BE_VIETNAM },
  'am-cung': { display: BALOO, body: NUNITO },
};

function filesOf(face: Face): FontFile[] {
  return [
    { ...face, file: `${face.source}-latin-${face.weight}-normal.woff2`, range: LATIN_RANGE },
    { ...face, file: `${face.source}-vietnamese-${face.weight}-normal.woff2`, range: VIETNAMESE_RANGE },
  ];
}

/** The font files a page of `style` loads, display face first (its Latin file is the one preloaded). */
export function styleFontFiles(style: StyleId): FontFile[] {
  const fonts = STYLE_FONTS[style];
  return [fonts.display, ...fonts.body].flatMap(filesOf);
}

/** Every font file of every style, each once: what the editor's preview must be able to serve. */
export function allFontFiles(): FontFile[] {
  const byFile = new Map<string, FontFile>();
  for (const style of Object.keys(STYLE_FONTS) as StyleId[]) for (const font of styleFontFiles(style)) byFile.set(font.file, font);
  return [...byFile.values()];
}
