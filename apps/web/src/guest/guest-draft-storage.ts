/**
 * The draft of a visitor without an account, kept in this browser only until they sign up and publish: the draft and
 * its photo list in localStorage, the photos they chose in IndexedDB. Nothing goes to the server before sign-in.
 * Storage can be off or full (private mode, quota): every call catches. A draft that cannot be read back whole opens
 * the template fresh, but nothing is deleted on a failed read: photos are only removed once their draft went into an
 * account, or by a sweep run when no guest editor is open in any tab (`guest-locks.ts`).
 */
import { CAFE_LIMITS, LIMITS, parseDraft, PARTY_LIMITS, TET_LIMITS, WEDDING_LIMITS, type TemplateDraft } from '@webnhanh/templates';
import { artFile, type TemplateVariant } from '@webnhanh/templates/variants';
import { z } from 'zod';
import { libraryUrl, pickedLook, type GuestPhoto } from './guest-library';

/** The localStorage key of the draft: other tabs see its writes as `storage` events. */
export const DRAFT_KEY = 'webnhanh.guest-draft';
const TRANSFER_KEY = 'webnhanh.guest-transfer';
const DB_NAME = 'webnhanh-guest';
const STORE = 'photos';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
const UUIDS = /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/g;

/**
 * The most photos a draft of any template can show (the cover plus every place for a photo): a café's 120 dishes, a
 * shop's products, a wedding's gallery and ornaments, a Tết card's or a party invitation's ornaments. A stored list
 * longer than this is not a draft of ours.
 */
export const MAX_DRAFT_PHOTOS = Math.max(1 + CAFE_LIMITS.items, 1 + LIMITS.products, 1 + WEDDING_LIMITS.gallery + WEDDING_LIMITS.ornaments, 1 + TET_LIMITS.ornaments, 1 + PARTY_LIMITS.ornaments);

const storedPhoto = z.object({
  id: z.string().regex(UUID),
  width: z.number().int().positive(),
  height: z.number().int().positive(),
  sample: z.boolean(),
  slot: z.string().nullable(),
});

const storedDraft = z.object({
  v: z.literal(2),
  /** Names this draft: a transfer and a tab's writes belong to one draft. */
  id: z.string().regex(UUID),
  template: z.string(),
  variant: z.string(),
  draft: z.unknown(),
  photos: z.array(storedPhoto).max(MAX_DRAFT_PHOTOS),
});
type StoredDraft = z.infer<typeof storedDraft>;

/** A visitor's draft read back: its look, the draft, every photo it has with where it shows from, and their own photos' bytes. */
export interface GuestDraft {
  readonly id: string;
  readonly look: TemplateVariant;
  readonly value: TemplateDraft;
  readonly photos: readonly GuestPhoto[];
  /** The photos the visitor chose, by id (library pictures have none). */
  readonly blobs: ReadonlyMap<string, Blob>;
}

// IndexedDB, one store of Blobs by photo id.

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    if (typeof indexedDB === 'undefined') {
      reject(new Error('no IndexedDB'));
      return;
    }
    const request = indexedDB.open(DB_NAME, 1);
    request.onupgradeneeded = () => request.result.createObjectStore(STORE);
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error ?? new Error('IndexedDB open failed'));
    request.onblocked = () => reject(new Error('IndexedDB blocked'));
  });
}

async function withStore<T>(mode: IDBTransactionMode, run: (store: IDBObjectStore) => IDBRequest<T> | null): Promise<T | undefined> {
  const db = await openDb();
  try {
    return await new Promise<T | undefined>((resolve, reject) => {
      const tx = db.transaction(STORE, mode);
      const request = run(tx.objectStore(STORE));
      tx.oncomplete = () => resolve(request?.result);
      tx.onerror = () => reject(tx.error ?? new Error('IndexedDB transaction failed'));
      tx.onabort = () => reject(tx.error ?? new Error('IndexedDB transaction aborted'));
    });
  } finally {
    db.close();
  }
}

/** Keeps one chosen photo; false when the browser would not keep it. */
export async function putGuestPhoto(id: string, blob: Blob): Promise<boolean> {
  try {
    await withStore('readwrite', (store) => store.put(blob, id));
    return true;
  } catch (error) {
    console.warn('guest photo not kept', error instanceof Error ? error.message : String(error));
    return false;
  }
}

async function getGuestPhoto(id: string): Promise<Blob | null> {
  try {
    const value: unknown = await withStore('readonly', (store) => store.get(id));
    return value instanceof Blob ? value : null;
  } catch {
    return null;
  }
}

/** Removes the photos `ids` (their draft went into an account). */
export async function deleteGuestPhotos(ids: readonly string[]): Promise<void> {
  if (ids.length === 0) return;
  try {
    await withStore('readwrite', (store) => {
      for (const id of ids) store.delete(id);
      return null;
    });
  } catch {
    // Left behind: the next sweep takes them.
  }
}

/** Removes every kept photo but `keep` (call only when no guest editor is open in any tab). */
export async function sweepGuestPhotos(keep: ReadonlySet<string>): Promise<void> {
  try {
    const keys = (await withStore('readonly', (store) => store.getAllKeys())) ?? [];
    await deleteGuestPhotos(keys.filter((key): key is string => typeof key === 'string' && !keep.has(key)));
  } catch {
    // No IndexedDB: nothing was kept.
  }
}

/** Reads a Blob as a `data:` URL (the preview frame and the app's CSP allow `data:` pictures, not `blob:`). */
export function dataUrlOf(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => (typeof reader.result === 'string' ? resolve(reader.result) : reject(new Error('not a data URL')));
    reader.onerror = () => reject(reader.error ?? new Error('photo unreadable'));
    reader.readAsDataURL(blob);
  });
}

// The draft itself, in localStorage.

function readRecord(raw: string | null): StoredDraft | null {
  if (!raw) return null;
  try {
    const parsed = storedDraft.safeParse(JSON.parse(raw));
    return parsed.success ? parsed.data : null;
  } catch {
    return null;
  }
}

function storedRecord(): StoredDraft | null {
  try {
    return readRecord(localStorage.getItem(DRAFT_KEY));
  } catch {
    return null;
  }
}

/**
 * Keeps the draft `id` and its photo list (only the photos the draft still shows); false when storage is off or full,
 * or the draft has more photos than any template can show (it would not read back).
 */
export function saveGuestDraft(id: string, look: TemplateVariant, value: TemplateDraft, photos: readonly GuestPhoto[]): boolean {
  const used = new Set<string>(JSON.stringify(value.draft).match(UUIDS) ?? []);
  const record = storedDraft.safeParse({
    v: 2,
    id,
    template: look.template,
    variant: look.id,
    draft: value.draft,
    photos: photos.filter((photo) => used.has(photo.image.id)).map((photo) => ({ ...photo.image, slot: photo.slot })),
  });
  if (!record.success) {
    console.warn('guest draft does not fit the stored shape', record.error.issues[0]?.message ?? '');
    return false;
  }
  try {
    localStorage.setItem(DRAFT_KEY, JSON.stringify(record.data));
    return true;
  } catch (error) {
    console.warn('guest draft not kept', error instanceof Error ? error.message : String(error));
    return false;
  }
}

/** Which draft is stored (its id, template and look), without reading its photos; null when there is none. */
export function storedGuestLook(): { id: string; template: string; variant: string } | null {
  const record = storedRecord();
  return record ? { id: record.id, template: record.template, variant: record.variant } : null;
}

/** The photo ids a stored draft (as `raw`, a localStorage value) still uses. */
export function storedPhotoIds(raw: string | null = null): Set<string> {
  const record = raw === null ? storedRecord() : readRecord(raw);
  return new Set(record?.photos.map((photo) => photo.id) ?? []);
}

/** The stored draft with every photo, or null when there is none or any part of it is gone or does not fit. */
export async function loadGuestDraft(): Promise<GuestDraft | null> {
  const record = storedRecord();
  if (!record) return null;
  const look = pickedLook(record.template, record.variant);
  const value = look && look.id === record.variant ? parseDraft(look.template, record.draft) : null;
  if (!look || !value) return null;
  const photos: GuestPhoto[] = [];
  const blobs = new Map<string, Blob>();
  for (const photo of record.photos) {
    const image = { id: photo.id, width: photo.width, height: photo.height, widths: [photo.width], sample: photo.sample };
    if (photo.slot !== null) {
      const url = libraryUrl(artFile(look, photo.slot));
      if (!url) return null;
      photos.push({ image, url, slot: photo.slot });
      continue;
    }
    const blob = await getGuestPhoto(photo.id);
    if (!blob) return null;
    try {
      photos.push({ image, url: await dataUrlOf(blob), slot: null });
    } catch {
      return null;
    }
    blobs.set(photo.id, blob);
  }
  return { id: record.id, look, value, photos, blobs };
}

/**
 * Forgets the draft `draft` once it is in an account: its record (only if no tab stored another draft since) and the
 * visitor's photos of it.
 */
export async function forgetGuestDraft(draft: Pick<GuestDraft, 'id' | 'blobs'>): Promise<void> {
  try {
    if (storedRecord()?.id === draft.id) localStorage.removeItem(DRAFT_KEY);
  } catch {
    // Nothing to forget.
  }
  await deleteGuestPhotos([...draft.blobs.keys()]);
}

// How far moving a draft into the account went, so a reload in the middle neither makes a second site nor uploads a
// photo twice.

const transferSchema = z.object({
  /** The draft being moved: a transfer never carries over to another draft. */
  draftId: z.string().regex(UUID),
  siteId: z.string().regex(UUID),
  /** The image id each library picture became in the site, by slot. */
  slotImages: z.record(z.string(), z.string()),
  /** The image id each of the visitor's photos became once uploaded, by its id in the draft. */
  uploaded: z.record(z.string(), z.string()),
});
export type GuestTransfer = z.infer<typeof transferSchema>;

/** The transfer of draft `draftId` cut short earlier, or null. */
export function loadGuestTransfer(draftId: string): GuestTransfer | null {
  try {
    const raw = localStorage.getItem(TRANSFER_KEY);
    const parsed = raw ? transferSchema.safeParse(JSON.parse(raw)) : null;
    return parsed?.success && parsed.data.draftId === draftId ? parsed.data : null;
  } catch {
    return null;
  }
}

export function saveGuestTransfer(transfer: GuestTransfer): void {
  try {
    localStorage.setItem(TRANSFER_KEY, JSON.stringify(transfer));
  } catch {
    // Without it a reload in the middle starts again with a new address; the draft itself is still there.
  }
}

export function clearGuestTransfer(): void {
  try {
    localStorage.removeItem(TRANSFER_KEY);
  } catch {
    // Nothing to forget.
  }
}
