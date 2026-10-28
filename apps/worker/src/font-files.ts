/**
 * Where the shop styles' font files are on disk: the `files/` directory of their `@fontsource/<source>` package,
 * found at run time like the samples and migrations (the release keeps the workspace's node_modules).
 */
import { createRequire } from 'node:module';
import path from 'node:path';
import type { FontFile } from '@webnhanh/templates';

const require = createRequire(import.meta.url);

export function fontFilePath(font: FontFile): string {
  return path.join(path.dirname(require.resolve(`@fontsource/${font.source}/package.json`)), 'files', font.file);
}

/** The relative URL of a font file in a release, for `renderShop`. */
export const pageFontUrl = (file: string): string => `fonts/${file}`;
