import { readdir, readFile } from 'node:fs/promises';
import { siteImageFile } from '@webnhanh/db';
import { parseDraft, templateImageIds, type TetDraft } from '@webnhanh/templates';
import { isDecorationSlot, templateVariants, webpSize } from '@webnhanh/templates/variants';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { ORIGIN, startTestApp, type TestApp } from '../test-support';

const variants = templateVariants();

let app: TestApp;
let owner: { accountId: string; cookie: string };

beforeEach(async () => {
  app = await startTestApp({ sitesPerAccount: variants.length + 5 });
  owner = await app.signIn('owner');
});

afterEach(async () => {
  await app.close();
});

interface Image {
  id: string;
  width: number;
  height: number;
  widths: number[];
  sample: boolean;
}

const create = (body: Record<string, unknown>) => app.http().post('/api/sites').set('Cookie', owner.cookie).set('Origin', ORIGIN).send(body);

async function read(siteId: string): Promise<{ site: { cover: Image | null }; draft: unknown; images: Image[] }> {
  const res = await app.http().get(`/api/sites/${siteId}`).set('Cookie', owner.cookie);
  expect(res.status).toBe(200);
  return res.body;
}

describe('sites made from a variant', () => {
  it('starts every variant with its look, copy and pictures, kept at the size a page shows them', async () => {
    for (const [index, variant] of variants.entries()) {
      const res = await create({ name: `bien-the-${index}`, template: variant.template, variant: variant.id });
      expect(res.status, `${variant.template}/${variant.id}: ${JSON.stringify(res.body)}`).toBe(201);
      const siteId = res.body.site.id as string;
      const { site, draft, images } = await read(siteId);
      const parsed = parseDraft(variant.template, draft);
      if (!parsed) throw new Error(`${variant.id}: draft does not parse`);
      expect(parsed.draft).toMatchObject({ ...variant.copy, style: variant.style, palette: variant.palette });

      // One picture per drawn slot, every one used by the draft; ornaments are not samples to replace.
      expect(images).toHaveLength(variant.art.length);
      expect(new Set(templateImageIds(parsed))).toEqual(new Set(images.map((image) => image.id)));
      expect(images.filter((image) => !image.sample)).toHaveLength(variant.art.filter((art) => isDecorationSlot(art.slot)).length);
      expect(site.cover?.sample, variant.id).toBe(true);
      for (const image of images) {
        expect(image.widths).toEqual([image.width]);
        const bytes = await readFile(siteImageFile(app.config.uploadsDir, siteId, image.id, image.width));
        expect(webpSize(bytes), `${variant.id} ${image.width}x${image.height}`).toEqual({ width: image.width, height: image.height });
        expect(Math.max(image.width, image.height)).toBeLessThanOrEqual(900);
      }
    }
  });

  it('saves a variant draft back with its ornaments', async () => {
    const res = await create({ name: 'chuc-tet', template: 'tet', variant: 'clay-do-vang' });
    const siteId = res.body.site.id as string;
    const { draft } = await read(siteId);
    const card = draft as TetDraft;
    expect(card.ornaments).toHaveLength(2);
    const saved = await app.http().put(`/api/sites/${siteId}/draft`).set('Cookie', owner.cookie).set('Origin', ORIGIN).send({ draft: { ...card, sender: 'Minh Anh' } });
    expect(saved.status).toBe(200);
    expect(((await read(siteId)).draft as TetDraft).ornaments).toEqual(card.ornaments);
  });

  it('refuses a variant the template does not have, and leaves nothing behind', async () => {
    for (const variant of ['khong-co', 'clay-do-vang', '../tet/clay-do-vang', 42, '']) {
      const res = await create({ name: 'sai-bien-the', template: 'shop', variant });
      expect(res.status, String(variant)).toBe(400);
      expect(res.body.error).toBe('unknown-variant');
    }
    expect((await app.http().get('/api/sites').set('Cookie', owner.cookie)).body.sites).toEqual([]);
    expect(await readdir(app.config.uploadsDir).catch(() => [])).toEqual([]);
  });

  it('keeps the template samples when no variant is named', async () => {
    const res = await create({ name: 'tiem-bo', template: 'shop' });
    expect(res.status).toBe(201);
    const { images } = await read(res.body.site.id as string);
    expect(images).toHaveLength(3);
    expect(images.every((image) => image.sample)).toBe(true);
  });
});
