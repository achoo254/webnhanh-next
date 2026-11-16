/**
 * Moves a visitor's draft into their account, once, after they signed up: makes the site at the address they chose
 * from the same look (the server copies the look's pictures), uploads the photos they chose (checked and cleaned by
 * the server like any upload), saves the draft with every photo pointing at the site's images, and publishes. Each
 * step is recorded (`GuestTransfer`), so a retry or a reload carries on with the same site; the draft is forgotten
 * only once publishing started. Two tabs never move it at the same time (`TRANSFER_LOCK`).
 */
import { parseDraft, templateImageIds } from '@webnhanh/templates';
import { ApiError } from '../api';
import { createSiteFromLook, publishSite, saveDraft, uploadImage } from '../sites-api';
import { clearGuestTransfer, forgetGuestDraft, loadGuestTransfer, saveGuestTransfer, storedGuestLook, type GuestDraft, type GuestTransfer } from './guest-draft-storage';
import { TRANSFER_LOCK, withExclusiveLock } from './guest-locks';

export type TransferStep = 'create' | 'photos' | 'save' | 'publish';

/** The draft is no longer in this browser: another tab published it, or opened another template. */
export const DRAFT_GONE = 'guest-draft-gone';

/**
 * Every string of `value` that is a key of `ids` replaced by its value, and every one in `drop` removed (left out of a
 * list, null elsewhere): photo ids sit at any depth of a draft.
 */
export function remapIds(value: unknown, ids: ReadonlyMap<string, string>, drop: ReadonlySet<string> = new Set()): unknown {
  if (typeof value === 'string') return drop.has(value) ? null : (ids.get(value) ?? value);
  if (Array.isArray(value)) return value.filter((item) => typeof item !== 'string' || !drop.has(item)).map((item) => remapIds(item, ids, drop));
  if (typeof value === 'object' && value !== null) return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, remapIds(item, ids, drop)]));
  return value;
}

/**
 * Puts `draft` into the account: a new site named `name` (ignored when a transfer of this draft already made the
 * site), then its photos, draft and publish job. Resolves the site's id. Throws the server's ApiError (name taken,
 * site limit, photo refused, publish refused...) with the progress kept for the next try, or `DRAFT_GONE`.
 */
export function transferGuestDraft(draft: GuestDraft, name: string, onStep: (step: TransferStep) => void): Promise<string> {
  return withExclusiveLock(TRANSFER_LOCK, async () => {
    // Another tab may have moved (or replaced) this draft while this one waited.
    if (storedGuestLook()?.id !== draft.id) throw new ApiError(409, DRAFT_GONE);
    let transfer = loadGuestTransfer(draft.id);
    if (!transfer) {
      onStep('create');
      const made = await createSiteFromLook(name, draft.look.template, draft.look.id);
      transfer = { draftId: draft.id, siteId: made.site.id, slotImages: made.slotImages, uploaded: {} };
      saveGuestTransfer(transfer);
    }
    try {
      return await moveInto(draft, transfer, onStep);
    } catch (error) {
      // The site the transfer carried on with is gone (deleted meanwhile): the next try makes a new one.
      if (error instanceof ApiError && error.status === 404) clearGuestTransfer();
      throw error;
    }
  });
}

async function moveInto(draft: GuestDraft, start: GuestTransfer, onStep: (step: TransferStep) => void): Promise<string> {
  let transfer = start;
  const siteId = transfer.siteId;

  const used = new Set(templateImageIds(draft.value));
  const ids = new Map<string, string>();
  const drop = new Set<string>();
  onStep('photos');
  for (const photo of draft.photos) {
    const id = photo.image.id;
    if (!used.has(id)) continue;
    if (photo.slot !== null) {
      const siteImage = transfer.slotImages[photo.slot];
      // The look no longer draws this picture: the page goes without it (the owner can add a photo in the editor).
      if (siteImage) ids.set(id, siteImage);
      else drop.add(id);
      continue;
    }
    const done = transfer.uploaded[id];
    if (done) {
      ids.set(id, done);
      continue;
    }
    const blob = draft.blobs.get(id);
    if (!blob) {
      drop.add(id);
      continue;
    }
    const uploaded = await uploadImage(siteId, blob, () => undefined);
    transfer = { ...transfer, uploaded: { ...transfer.uploaded, [id]: uploaded.id } };
    saveGuestTransfer(transfer);
    ids.set(id, uploaded.id);
  }

  onStep('save');
  const moved = parseDraft(draft.value.template, remapIds(draft.value.draft, ids, drop));
  if (!moved) throw new ApiError(400, 'draft-invalid');
  await saveDraft(siteId, moved.draft);

  onStep('publish');
  await publishSite(siteId);
  clearGuestTransfer();
  await forgetGuestDraft(draft);
  return siteId;
}

/** The site a cut-short transfer of `draftId` already made (to open it in the editor instead), or null. */
export function madeSiteOf(draftId: string): string | null {
  return loadGuestTransfer(draftId)?.siteId ?? null;
}
