import path from 'node:path';

/**
 * Where uploaded photos live, shared by the server (writes, serves to the editor) and the worker (copies into a
 * release):
 *
 *   UPLOADS_DIR/<site id>/<image id>-<width>.webp
 */
const ID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

export function isUuid(value: unknown): value is string {
  return typeof value === 'string' && ID_PATTERN.test(value);
}

/** The directory of one site's photos. */
export function siteUploadsDir(uploadsDir: string, siteId: string): string {
  if (!isUuid(siteId)) throw new Error(`not a site id: ${siteId}`);
  return path.join(uploadsDir, siteId);
}

/** The file name of one width of a photo, the same in the uploads and in a release's `img/`. */
export function imageFileName(imageId: string, width: number): string {
  if (!isUuid(imageId) || !Number.isInteger(width) || width <= 0) throw new Error(`not an image file: ${imageId} ${width}`);
  return `${imageId}-${width}.webp`;
}

/** Parses a name made by `imageFileName`; null for anything else (a path, another extension). */
export function parseImageFileName(name: string): { imageId: string; width: number } | null {
  const match = /^([0-9a-f-]{36})-([1-9][0-9]{0,4})\.webp$/.exec(name);
  if (!match?.[1] || !match[2] || !isUuid(match[1])) return null;
  return { imageId: match[1], width: Number(match[2]) };
}

export function siteImageFile(uploadsDir: string, siteId: string, imageId: string, width: number): string {
  return path.join(siteUploadsDir(uploadsDir, siteId), imageFileName(imageId, width));
}

/** Size limit of one site (its photos while editing, and each release), unless SITE_MAX_MB says otherwise. */
export const DEFAULT_SITE_MAX_MB = 20;
