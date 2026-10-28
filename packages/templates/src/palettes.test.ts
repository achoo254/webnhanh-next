import { describe, expect, it } from 'vitest';
import { ALL_PALETTE_IDS, PALETTES } from './palettes';

function luminance(hex: string): number {
  const [r, g, b] = [1, 3, 5].map((i) => {
    const c = parseInt(hex.slice(i, i + 2), 16) / 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * (r ?? 0) + 0.7152 * (g ?? 0) + 0.0722 * (b ?? 0);
}

function contrast(a: string, b: string): number {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return ((hi ?? 0) + 0.05) / ((lo ?? 0) + 0.05);
}

describe('palettes', () => {
  it.each(ALL_PALETTE_IDS)('%s: white on the accent, ink on soft and on pop read at 4.5:1 or more', (id) => {
    const palette = PALETTES[id];
    expect(contrast('#ffffff', palette.accent)).toBeGreaterThanOrEqual(4.5);
    expect(contrast(palette.ink, palette.soft)).toBeGreaterThanOrEqual(4.5);
    expect(contrast(palette.ink, palette.pop)).toBeGreaterThanOrEqual(4.5);
  });
});
