/**
 * The pixel size of a WebP file read from its header (lossy `VP8 `, lossless `VP8L`, or extended `VP8X`, the form of
 * a picture with transparency), or null when the bytes are not a WebP. Used to check the library's pictures are kept
 * at the size a page shows them.
 */
export function webpSize(bytes: Uint8Array): { width: number; height: number } | null {
  const ascii = (from: number, to: number): string => String.fromCharCode(...bytes.subarray(from, to));
  if (bytes.length < 30 || ascii(0, 4) !== 'RIFF' || ascii(8, 12) !== 'WEBP') return null;
  const at = (index: number): number => bytes[index] ?? 0;
  const u24 = (index: number): number => at(index) | (at(index + 1) << 8) | (at(index + 2) << 16);
  switch (ascii(12, 16)) {
    case 'VP8X':
      return { width: u24(24) + 1, height: u24(27) + 1 };
    case 'VP8 ':
      return { width: (at(26) | (at(27) << 8)) & 0x3fff, height: (at(28) | (at(29) << 8)) & 0x3fff };
    case 'VP8L': {
      const bits = at(21) | (at(22) << 8) | (at(23) << 16) | (at(24) << 24);
      return { width: (bits & 0x3fff) + 1, height: ((bits >>> 14) & 0x3fff) + 1 };
    }
    default:
      return null;
  }
}
