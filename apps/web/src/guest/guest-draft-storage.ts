/**
 * The draft of a visitor without an account, kept in this browser only until they sign up and publish: the draft and
 * its photo list in localStorage, the photos they chose in IndexedDB. Nothing goes to the server before sign-in.
 * Storage can be off or full (private mode, quota): every call catches, and a draft that cannot be read back whole is
 * dropped, so the editor opens the template fresh.
 */
import { parseDraft, type TemplateDraft } from '@webnhanh/templates';
import { artFile, type TemplateVariant } from '@webnhanh/templates/variants';
import { z } from 'zod';
import { libraryUrl, pickedLook, type GuestPhoto } from './guest-library';

const DRAFT_KEY = 'webnhanh.guest-draft';
const TRANSFER_KEY = 'webnhanh.guest-transfer';
const DB_NAME = 'webnhanh-guest';
const STORE = 'photos';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

const storedPhoto = z.object({
  id: z.string().regex(UUID),
  width: z.number().int().positive(),
  height: z.number().int().positive(),
  sample: z.boolean(),
  slot: z.string().nullable(),
});

const storedDraft = z.object({
  v: z.literal(1),
  template: z.string(),
  variant: z.string(),
  draft: z.unknown(),
  photos: z.array(storedPhoto).max(60),
});

/** A visitor's draft read back: its look, the draft, every photo it has with where it shows from, and their own photos' bytes. */
export interface GuestDraft {
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

async function withStore<T>(mode: IDBTransactionMode, run: (store: IDBObjectStore) => IDBRequest<T>): Promise<T> {
  const db = await openDb();
  try {
    return await new Promise<T>((resolve, reject) => {
      const tx = db.transaction(STORE, mode);
      const request = run(tx.objectStore(STORE));
      tx.oncomplete = () => resolve(request.result);
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

/** Keeps the draft and its photo list; false when storage is off or full. */
export function saveGuestDraft(look: TemplateVariant, value: TemplateDraft, photos: readonly GuestPhoto[]): boolean {
  const used = new Set<string>(JSON.stringify(value.draft).match(/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/g) ?? []);
  const record: z.infer<typeof storedDraft> = {
    v: 1,
    template: look.template,
    variant: look.id,
    draft: value.draft,
    // Only the photos the draft still uses: a replaced photo is not kept for the transfer.
    photos: photos.filter((photo) => used.has(photo.image.id)).map((photo) => ({ ...photo.image, slot: photo.slot })),
  };
  try {
    localStorage.setItem(DRAFT_KEY, JSON.stringify(record));
    return true;
  } catch (error) {
    console.warn('guest draft not kept', error instanceof Error ? error.message : String(error));
    return false;
  }
}

/** Which template and look the stored draft is of, without reading its photos; null when there is none. */
export function storedGuestLook(): { template: string; variant: string } | null {
  try {
    const raw = localStorage.getItem(DRAFT_KEY);
    const parsed = raw ? storedDraft.safeParse(JSON.parse(raw)) : null;
    return parsed?.success ? { template: parsed.data.template, variant: parsed.data.variant } : null;
  } catch {
    return null;
  }
}

/** The stored draft with every photo, or null when there is none or any part of it is gone or does not fit. */
export async function loadGuestDraft(): Promise<GuestDraft | null> {
  let record: z.infer<typeof storedDraft>;
  try {
    const raw = localStorage.getItem(DRAFT_KEY);
    if (!raw) return null;
    const parsed = storedDraft.safeParse(JSON.parse(raw));
    if (!parsed.success) return null;
    record = parsed.data;
  } catch {
    return null;
  }
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
  return { look, value, photos, blobs };
}

/** Forgets the draft and its photos (after it went into an account, or when another template is opened). */
export async function clearGuestDraft(): Promise<void> {
  try {
    localStorage.removeItem(DRAFT_KEY);
  } catch {
    // Nothing to forget.
  }
  try {
    await withStore('readwrite', (store) => store.clear());
  } catch {
    // No IndexedDB: no photos were kept.
  }
}

// How far moving the draft into the account went, so a reload in the middle neither makes a second site nor uploads
// a photo twice.

const transferSchema = z.object({
  siteId: z.string().regex(UUID),
  /** The image id each library picture became in the site, by slot. */
  slotImages: z.record(z.string(), z.string()),
  /** The image id each of the visitor's photos became once uploaded, by its id in the draft. */
  uploaded: z.record(z.string(), z.string()),
});
export type GuestTransfer = z.infer<typeof transferSchema>;

export function loadGuestTransfer(): GuestTransfer | null {
  try {
    const raw = localStorage.getItem(TRANSFER_KEY);
    const parsed = raw ? transferSchema.safeParse(JSON.parse(raw)) : null;
    return parsed?.success ? parsed.data : null;
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
