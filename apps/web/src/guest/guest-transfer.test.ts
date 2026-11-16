import { findVariant } from '@webnhanh/templates/variants';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ApiError } from '../api';
import { fakeIndexedDb, type FakeIndexedDb } from './fake-indexed-db.test-support';
import { loadGuestDraft, MAX_DRAFT_PHOTOS, putGuestPhoto, saveGuestDraft, type GuestDraft } from './guest-draft-storage';
import { freshGuestDraft, type GuestPhoto } from './guest-library';
import { imageSize, MAX_PIXELS, shrinkPhoto } from './guest-photo-shrink';
import { DRAFT_GONE, transferGuestDraft } from './guest-transfer';

const SITE_ID = '11111111-1111-4111-8111-111111111111';
const SERVER_COVER = '22222222-2222-4222-8222-222222222222';
const NOW = '2026-11-16T03:00:00.000Z';

let idb: FakeIndexedDb;
let calls: { method: string; url: string; body: unknown }[];
let answers: Map<string, () => { status: number; body: unknown }>;

beforeEach(() => {
  localStorage.clear();
  idb = fakeIndexedDb();
  vi.stubGlobal('indexedDB', idb.factory);
  calls = [];
  answers = new Map();
  vi.stubGlobal(
    'fetch',
    vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const method = init?.method ?? 'GET';
      const url = String(input);
      calls.push({ method, url, body: typeof init?.body === 'string' ? JSON.parse(init.body) : undefined });
      const answer = answers.get(`${method} ${url}`)?.() ?? { status: 404, body: { error: 'not-found' } };
      return new Response(answer.status === 204 ? null : JSON.stringify(answer.body), { status: answer.status, headers: { 'Content-Type': 'application/json' } });
    }),
  );
});

afterEach(() => {
  vi.unstubAllGlobals();
});

function look(template: 'wedding' | 'cafe', id: string) {
  const found = findVariant(template, id);
  if (!found) throw new Error('no look');
  return found;
}

/** A visitor's draft of `variant`, stored as the editor stores it. */
function storedDraft(template: 'wedding' | 'cafe', id: string): GuestDraft {
  const chosen = look(template, id);
  const fresh = freshGuestDraft(chosen);
  const draft: GuestDraft = { id: crypto.randomUUID(), look: chosen, value: fresh.value, photos: fresh.photos, blobs: new Map() };
  if (!saveGuestDraft(draft.id, chosen, draft.value, draft.photos)) throw new Error('not saved');
  return draft;
}

function siteAnswers(slotImages: Record<string, string>): void {
  const site = { id: SITE_ID, name: 'minh-thao', template: 'wedding', status: 'draft', published: false, createdAt: NOW, updatedAt: NOW, cover: null, job: null, newOrders: 0 };
  answers.set('POST /api/sites', () => ({ status: 201, body: { site, slotImages } }));
  answers.set(`PUT /api/sites/${SITE_ID}/draft`, () => ({ status: 204, body: null }));
  answers.set(`POST /api/sites/${SITE_ID}/publish`, () => ({
    status: 202,
    body: { job: { id: 'j1', siteId: SITE_ID, type: 'publish', status: 'queued', steps: [], error: null, createdAt: NOW, startedAt: null, finishedAt: null } },
  }));
}

describe('a draft with many photos', () => {
  it('keeps and reads back a café menu with a photo for every dish, more than 60', async () => {
    const chosen = look('cafe', 'quan-com-nha');
    const fresh = freshGuestDraft(chosen);
    if (fresh.value.template !== 'cafe') throw new Error('not a café');
    const photos: GuestPhoto[] = [...fresh.photos];
    const menu = Array.from({ length: 10 }, (_, s) => ({
      key: `s${s}`,
      title: `Nhóm ${s}`,
      items: Array.from({ length: 12 }, (_, i) => {
        const id = crypto.randomUUID();
        photos.push({ image: { id, width: 900, height: 900, widths: [900], sample: false }, url: 'data:image/jpeg;base64,AA==', slot: null });
        return { key: `i${s}-${i}`, name: `Món ${i}`, price: '', description: '', image: id };
      }),
    }));
    for (const photo of photos) if (photo.slot === null) await putGuestPhoto(photo.image.id, new Blob(['x'], { type: 'image/jpeg' }));
    const value = { template: 'cafe' as const, draft: { ...fresh.value.draft, menu } };
    expect(saveGuestDraft(crypto.randomUUID(), chosen, value, photos)).toBe(true);
    const back = await loadGuestDraft();
    expect(back?.blobs.size).toBe(120);
    expect(MAX_DRAFT_PHOTOS).toBe(121);
  }, 30_000);

  it('refuses to keep more photos than any template can show, so it never keeps what it cannot read back', () => {
    const chosen = look('wedding', 'hoa-pastel');
    const fresh = freshGuestDraft(chosen);
    const many = Array.from({ length: MAX_DRAFT_PHOTOS + 1 }, () => crypto.randomUUID());
    const value = { ...fresh.value, draft: { ...fresh.value.draft, gallery: many } } as typeof fresh.value;
    const photos = many.map((id) => ({ image: { id, width: 9, height: 9, widths: [9], sample: false }, url: '', slot: null }));
    expect(saveGuestDraft(crypto.randomUUID(), chosen, value, photos)).toBe(false);
    expect(localStorage.getItem('webnhanh.guest-draft')).toBeNull();
  });
});

describe('moving a draft into the account', () => {
  it('makes one site when two tabs publish the same draft at once', async () => {
    const draft = storedDraft('wedding', 'hoa-pastel');
    siteAnswers({ cover: SERVER_COVER, ornament: SERVER_COVER });
    const results = await Promise.allSettled([transferGuestDraft(draft, 'minh-thao', () => undefined), transferGuestDraft(draft, 'minh-thao', () => undefined)]);
    expect(results.filter((result) => result.status === 'fulfilled')).toHaveLength(1);
    const refused = results.find((result) => result.status === 'rejected');
    expect(refused?.status === 'rejected' && refused.reason instanceof ApiError && refused.reason.code === DRAFT_GONE).toBe(true);
    expect(calls.filter((call) => call.method === 'POST' && call.url === '/api/sites')).toHaveLength(1);
  });

  it('goes without a look picture the site no longer has, instead of failing for good', async () => {
    const draft = storedDraft('wedding', 'hoa-pastel');
    siteAnswers({ cover: SERVER_COVER });
    expect(await transferGuestDraft(draft, 'minh-thao', () => undefined)).toBe(SITE_ID);
    const saved = calls.find((call) => call.method === 'PUT')?.body as { draft: { cover: string; ornaments?: string[] } };
    expect(saved.draft.cover).toBe(SERVER_COVER);
    expect(saved.draft.ornaments ?? []).toEqual([]);
  });

  it('keeps the draft until publishing started, and carries on with the same site on the next try', async () => {
    const draft = storedDraft('wedding', 'hoa-pastel');
    siteAnswers({ cover: SERVER_COVER, ornament: SERVER_COVER });
    answers.set(`POST /api/sites/${SITE_ID}/publish`, () => ({ status: 503, body: { error: 'busy' } }));
    await expect(transferGuestDraft(draft, 'minh-thao', () => undefined)).rejects.toBeInstanceOf(ApiError);
    expect(localStorage.getItem('webnhanh.guest-draft')).not.toBeNull();
    expect(localStorage.getItem('webnhanh.guest-transfer')).toContain(SITE_ID);

    siteAnswers({ cover: SERVER_COVER, ornament: SERVER_COVER });
    expect(await transferGuestDraft(draft, '', () => undefined)).toBe(SITE_ID);
    expect(calls.filter((call) => call.method === 'POST' && call.url === '/api/sites')).toHaveLength(1);
    expect(localStorage.getItem('webnhanh.guest-draft')).toBeNull();
    expect(localStorage.getItem('webnhanh.guest-transfer')).toBeNull();
  });
});

describe('making a chosen photo smaller', () => {
  /** A JPEG header: SOI, an APP1 EXIF block with `orientation`, then a SOF0 of width x height. */
  function jpeg(width: number, height: number, orientation: number): Uint8Array<ArrayBuffer> {
    const exif = [0x45, 0x78, 0x69, 0x66, 0, 0, 0x4d, 0x4d, 0, 0x2a, 0, 0, 0, 8, 0, 1, 0x01, 0x12, 0, 3, 0, 0, 0, 1, 0, orientation, 0, 0, 0, 0, 0, 0];
    const app1 = [0xff, 0xe1, 0, exif.length + 2, ...exif];
    const sof = [0xff, 0xc0, 0, 17, 8, height >> 8, height & 0xff, width >> 8, width & 0xff, 3, 1, 0x22, 0, 2, 0x11, 1, 3, 0x11, 1];
    return new Uint8Array([0xff, 0xd8, ...app1, ...sof]);
  }

  it('reads the size from the header, turned as the photo is shown', () => {
    expect(imageSize(jpeg(4032, 3024, 1))).toEqual({ width: 4032, height: 3024 });
    expect(imageSize(jpeg(4032, 3024, 6))).toEqual({ width: 3024, height: 4032 });
    const png = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 13, 0x49, 0x48, 0x44, 0x52, 0, 0, 0x07, 0x80, 0, 0, 0x04, 0x38]);
    expect(imageSize(png)).toEqual({ width: 1920, height: 1080 });
    expect(imageSize(new Uint8Array([1, 2, 3, 4]))).toBeNull();
  });

  it('refuses a giant photo before decoding anything, and decodes the rest at the smaller size', async () => {
    const decode = vi.fn(async () => {
      throw new Error('not in jsdom');
    });
    vi.stubGlobal('createImageBitmap', decode);
    const side = Math.ceil(Math.sqrt(MAX_PIXELS)) + 1;
    await expect(shrinkPhoto(new Blob([jpeg(side, side, 1)]))).rejects.toMatchObject({ code: 'image-too-big' });
    expect(decode).not.toHaveBeenCalled();

    await expect(shrinkPhoto(new Blob([jpeg(4032, 3024, 6)]))).rejects.toMatchObject({ code: 'image-unreadable' });
    expect(decode).toHaveBeenCalledWith(expect.any(Blob), { resizeWidth: 1200, resizeHeight: 1600, resizeQuality: 'high' });
  });
});
