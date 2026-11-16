/**
 * Moves a visitor's draft into their account, once, after they signed up: makes the site at the address they chose
 * from the same look (the server copies the look's pictures), uploads the photos they chose (checked and cleaned by
 * the server like any upload), saves the draft with every photo pointing at the site's images, and starts publishing.
 * Each step is recorded (`GuestTransfer`), so a reload in the middle carries on with the same site.
 */
import { parseDraft, templateImageIds, type TemplateDraft } from '@webnhanh/templates';
import { ApiError } from '../api';
import { createSiteFromLook, publishSite, saveDraft, uploadImage } from '../sites-api';
import { clearGuestDraft, clearGuestTransfer, loadGuestTransfer, saveGuestTransfer, type GuestDraft, type GuestTransfer } from './guest-draft-storage';

export type TransferStep = 'create' | 'photos' | 'save' | 'publish';

/** Every string of `value` that is a key of `ids` replaced by its value (photo ids sit at any depth of a draft). */
export function remapIds(value: unknown, ids: ReadonlyMap<string, string>): unknown {
  if (typeof value === 'string') return ids.get(value) ?? value;
  if (Array.isArray(value)) return value.map((item) => remapIds(item, ids));
  if (typeof value === 'object' && value !== null) return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, remapIds(item, ids)]));
  return value;
}

/**
 * Puts `draft` into the account: a new site named `name` (ignored when a transfer already made the site), then its
 * photos, draft and publish job. Resolves the site's id; the stored draft is forgotten once the draft is saved.
 * Throws the server's ApiError (name taken, site limit, photo refused...) with the progress kept for the next try.
 */
export async function transferGuestDraft(draft: GuestDraft, name: string, onStep: (step: TransferStep) => void): Promise<string> {
  let transfer: GuestTransfer | null = loadGuestTransfer();
  if (!transfer) {
    onStep('create');
    const made = await createSiteFromLook(name, draft.look.template, draft.look.id);
    transfer = { siteId: made.site.id, slotImages: made.slotImages, uploaded: {} };
    saveGuestTransfer(transfer);
  }
  try {
    return await moveInto(draft, transfer, onStep);
  } catch (error) {
    // The site the transfer carried on with is gone (deleted meanwhile): the next try makes a new one.
    if (error instanceof ApiError && error.status === 404) clearGuestTransfer();
    throw error;
  }
}

async function moveInto(draft: GuestDraft, start: GuestTransfer, onStep: (step: TransferStep) => void): Promise<string> {
  let transfer = start;
  const siteId = transfer.siteId;

  const used = new Set(templateImageIds(draft.value));
  const ids = new Map<string, string>();
  onStep('photos');
  for (const photo of draft.photos) {
    const id = photo.image.id;
    if (!used.has(id)) continue;
    if (photo.slot !== null) {
      const siteImage = transfer.slotImages[photo.slot];
      if (!siteImage) throw new ApiError(500, 'bad-response');
      ids.set(id, siteImage);
      continue;
    }
    const done = transfer.uploaded[id];
    if (done) {
      ids.set(id, done);
      continue;
    }
    const blob = draft.blobs.get(id);
    if (!blob) throw new ApiError(400, 'image-missing');
    const uploaded = await uploadImage(siteId, blob, () => undefined);
    transfer = { ...transfer, uploaded: { ...transfer.uploaded, [id]: uploaded.id } };
    saveGuestTransfer(transfer);
    ids.set(id, uploaded.id);
  }

  onStep('save');
  const moved: TemplateDraft | null = parseDraft(draft.value.template, remapIds(draft.value.draft, ids));
  if (!moved) throw new ApiError(400, 'draft-invalid');
  await saveDraft(siteId, moved.draft);
  clearGuestTransfer();
  await clearGuestDraft();

  onStep('publish');
  try {
    await publishSite(siteId);
  } catch (error) {
    // The site and its draft are in the account: the editor shows why it did not publish, and Publish is there again.
    console.warn('publish after sign-up failed', error instanceof Error ? error.message : String(error));
  }
  return siteId;
}
