/**
 * A photo a visitor chose, made at most MAX_SIDE on its longest side in the browser before it is kept (IndexedDB and
 * the preview stay light).
 */
import { ApiError } from '../api';

/** Longest side a chosen photo is kept at: larger than any page shows a photo. */
const MAX_SIDE = 1600;
const QUALITY = 0.85;

/** A chosen photo made at most MAX_SIDE on its longest side, as a JPEG on white (a PNG's transparency included). */
export async function shrinkPhoto(file: Blob): Promise<{ blob: Blob; width: number; height: number }> {
  let bitmap: ImageBitmap;
  try {
    bitmap = await createImageBitmap(file);
  } catch {
    throw new ApiError(400, 'image-unreadable');
  }
  try {
    const scale = Math.min(1, MAX_SIDE / Math.max(bitmap.width, bitmap.height));
    const width = Math.max(1, Math.round(bitmap.width * scale));
    const height = Math.max(1, Math.round(bitmap.height * scale));
    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    const context = canvas.getContext('2d');
    if (!context) throw new ApiError(400, 'image-unreadable');
    context.fillStyle = '#ffffff';
    context.fillRect(0, 0, width, height);
    context.drawImage(bitmap, 0, 0, width, height);
    const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, 'image/jpeg', QUALITY));
    if (!blob) throw new ApiError(400, 'image-unreadable');
    return { blob, width, height };
  } finally {
    bitmap.close();
  }
}
