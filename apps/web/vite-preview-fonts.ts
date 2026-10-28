/*
 * previewFonts: the shop styles' font files for the editor's preview, served by the app itself at
 * /assets/preview-fonts/<file> (copied from their @fontsource packages into the build; served from the packages in
 * dev). The preview's page asks only its own origin for them, like a published page asks its own site.
 */
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import path from 'node:path';
import { allFontFiles, type FontFile } from '@webnhanh/templates/shop-fonts';
import type { Plugin } from 'vite';

export const PREVIEW_FONT_PATH = '/assets/preview-fonts/';

const require = createRequire(import.meta.url);
const fontPath = (font: FontFile): string => path.join(path.dirname(require.resolve(`@fontsource/${font.source}/package.json`)), 'files', font.file);

export function previewFonts(): Plugin {
  const fonts = new Map(allFontFiles().map((font) => [font.file, font]));
  return {
    name: 'webnhanh-preview-fonts',
    configureServer(server) {
      server.middlewares.use((req, res, next) => {
        const url = req.url?.split('?')[0] ?? '';
        const font = url.startsWith(PREVIEW_FONT_PATH) ? fonts.get(url.slice(PREVIEW_FONT_PATH.length)) : undefined;
        if (!font) {
          next();
          return;
        }
        res.setHeader('Content-Type', 'font/woff2');
        res.end(readFileSync(fontPath(font)));
      });
    },
    generateBundle() {
      for (const font of fonts.values()) this.emitFile({ type: 'asset', fileName: `${PREVIEW_FONT_PATH.slice(1)}${font.file}`, source: readFileSync(fontPath(font)) });
    },
  };
}
