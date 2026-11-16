/**
 * A photo a visitor chose, made at most MAX_SIDE on its longest side in the browser before it is kept (IndexedDB and
 * the preview stay light). Its size is read from the file's header first: a photo with more than MAX_PIXELS is
 * refused before anything is decoded, and the rest are decoded straight at the smaller size (`createImageBitmap` with
 * `resizeWidth`/`resizeHeight`), so a huge photo never sits in memory at full size.
 */
import { ApiError } from '../api';

/** Longest side a chosen photo is kept at: larger than any page shows a photo. */
export const MAX_SIDE = 1600;
/** Most pixels a chosen photo may have (a 50 MP phone camera's photos pass; a giant scan does not). */
export const MAX_PIXELS = 60_000_000;
const QUALITY = 0.85;

/** Width and height as the photo is shown (a JPEG's EXIF rotation applied), or null for a file this cannot read. */
export function imageSize(bytes: Uint8Array): { width: number; height: number } | null {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const at = (offset: number, length: number): boolean => offset >= 0 && offset + length <= bytes.length;
  // PNG: signature, then the IHDR chunk.
  if (at(0, 24) && view.getUint32(0) === 0x89504e47 && view.getUint32(12) === 0x49484452) {
    return { width: view.getUint32(16), height: view.getUint32(20) };
  }
  // WebP: RIFF....WEBP, then VP8 (lossy), VP8L (lossless) or VP8X (extended).
  if (at(0, 30) && view.getUint32(0) === 0x52494646 && view.getUint32(8) === 0x57454250) {
    const chunk = String.fromCharCode(...bytes.subarray(12, 16));
    if (chunk === 'VP8 ') return { width: view.getUint16(26, true) & 0x3fff, height: view.getUint16(28, true) & 0x3fff };
    if (chunk === 'VP8L') {
      const bits = view.getUint32(21, true);
      return { width: (bits & 0x3fff) + 1, height: ((bits >> 14) & 0x3fff) + 1 };
    }
    if (chunk === 'VP8X') {
      const width = 1 + (bytes[24] ?? 0) + ((bytes[25] ?? 0) << 8) + ((bytes[26] ?? 0) << 16);
      const height = 1 + (bytes[27] ?? 0) + ((bytes[28] ?? 0) << 8) + ((bytes[29] ?? 0) << 16);
      return { width, height };
    }
    return null;
  }
  // JPEG: walk the segments to the frame header (SOF), noting the EXIF orientation on the way.
  if (!at(0, 2) || view.getUint16(0) !== 0xffd8) return null;
  let offset = 2;
  let rotated = false;
  while (at(offset, 4)) {
    if (bytes[offset] !== 0xff) return null;
    const marker = bytes[offset + 1] ?? 0;
    if (marker === 0xff) {
      offset += 1;
      continue;
    }
    const length = view.getUint16(offset + 2);
    if (marker === 0xe1) rotated = exifRotated(view, offset + 4, length - 2) || rotated;
    // SOF0..SOF15 but DHT (C4), JPG (C8) and DAC (CC).
    if (marker >= 0xc0 && marker <= 0xcf && marker !== 0xc4 && marker !== 0xc8 && marker !== 0xcc) {
      if (!at(offset + 5, 4)) return null;
      const height = view.getUint16(offset + 5);
      const width = view.getUint16(offset + 7);
      return rotated ? { width: height, height: width } : { width, height };
    }
    offset += 2 + length;
  }
  return null;
}

/** Whether an APP1 segment's EXIF says the photo is turned a quarter (orientations 5 to 8: width and height swap). */
function exifRotated(view: DataView, start: number, length: number): boolean {
  const end = Math.min(view.byteLength, start + length);
  if (start + 14 > end || view.getUint32(start) !== 0x45786966) return false; // "Exif"
  const tiff = start + 6;
  const little = view.getUint16(tiff) === 0x4949;
  const ifd = tiff + view.getUint32(tiff + 4, little);
  if (ifd + 2 > end) return false;
  const entries = view.getUint16(ifd, little);
  for (let index = 0; index < entries; index += 1) {
    const entry = ifd + 2 + index * 12;
    if (entry + 12 > end) return false;
    if (view.getUint16(entry, little) === 0x0112) {
      const orientation = view.getUint16(entry + 8, little);
      return orientation >= 5 && orientation <= 8;
    }
  }
  return false;
}

/** The file's bytes (FileReader: every browser the app supports has it). */
function bytesOf(file: Blob): Promise<Uint8Array> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => (reader.result instanceof ArrayBuffer ? resolve(new Uint8Array(reader.result)) : reject(new ApiError(400, 'image-unreadable')));
    reader.onerror = () => reject(new ApiError(400, 'image-unreadable'));
    reader.readAsArrayBuffer(file);
  });
}

/** A chosen photo made at most MAX_SIDE on its longest side, as a JPEG on white (a PNG's transparency included). */
export async function shrinkPhoto(file: Blob): Promise<{ blob: Blob; width: number; height: number }> {
  const size = imageSize(await bytesOf(file));
  if (!size || size.width < 1 || size.height < 1) throw new ApiError(400, 'image-unreadable');
  if (size.width * size.height > MAX_PIXELS) throw new ApiError(400, 'image-too-big');
  const scale = Math.min(1, MAX_SIDE / Math.max(size.width, size.height));
  const width = Math.max(1, Math.round(size.width * scale));
  const height = Math.max(1, Math.round(size.height * scale));
  let bitmap: ImageBitmap;
  try {
    bitmap = await createImageBitmap(file, { resizeWidth: width, resizeHeight: height, resizeQuality: 'high' });
  } catch {
    throw new ApiError(400, 'image-unreadable');
  }
  try {
    const canvas = document.createElement('canvas');
    canvas.width = bitmap.width;
    canvas.height = bitmap.height;
    const context = canvas.getContext('2d');
    if (!context) throw new ApiError(400, 'image-unreadable');
    context.fillStyle = '#ffffff';
    context.fillRect(0, 0, canvas.width, canvas.height);
    context.drawImage(bitmap, 0, 0);
    const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, 'image/jpeg', QUALITY));
    if (!blob) throw new ApiError(400, 'image-unreadable');
    return { blob, width: canvas.width, height: canvas.height };
  } finally {
    bitmap.close();
  }
}
