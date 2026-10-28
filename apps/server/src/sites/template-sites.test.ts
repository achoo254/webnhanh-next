import { readdir } from 'node:fs/promises';
import path from 'node:path';
import { TEMPLATE_IDS, type CafeDraft, type ProfileDraft, type TemplateId, type TetDraft, type WeddingDraft } from '@webnhanh/templates';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { ORIGIN, startTestApp, type TestApp } from '../test-support';

let app: TestApp;
let owner: { accountId: string; cookie: string };
let stranger: { accountId: string; cookie: string };

beforeEach(async () => {
  app = await startTestApp({ sitesPerAccount: 5 });
  owner = await app.signIn('owner');
  stranger = await app.signIn('stranger');
});

afterEach(async () => {
  await app.close();
});

interface Detail<T> {
  site: { id: string; template: string; cover: { id: string; sample: boolean } | null };
  draft: T;
  images: { id: string; sample: boolean }[];
}

async function create(name: string, template: TemplateId | string): Promise<string> {
  const res = await app.http().post('/api/sites').set('Cookie', owner.cookie).set('Origin', ORIGIN).send({ name, template });
  expect(res.status, JSON.stringify(res.body)).toBe(201);
  return res.body.site.id as string;
}

async function read<T>(siteId: string, who = owner): Promise<Detail<T>> {
  const res = await app.http().get(`/api/sites/${siteId}`).set('Cookie', who.cookie);
  expect(res.status).toBe(200);
  return res.body as Detail<T>;
}

const save = (siteId: string, draft: unknown, who = owner) =>
  app.http().put(`/api/sites/${siteId}/draft`).set('Cookie', who.cookie).set('Origin', ORIGIN).send({ draft });
const publish = (siteId: string) => app.http().post(`/api/sites/${siteId}/publish`).set('Cookie', owner.cookie).set('Origin', ORIGIN);

/** Photos each new site starts with: the template's samples. */
const SAMPLE_COUNT: Readonly<Record<TemplateId, number>> = { shop: 3, tet: 1, wedding: 1, cafe: 1, profile: 0 };

describe('sites of every template', () => {
  it('makes each template with its own samples and new draft, all counted against one limit', async () => {
    for (const template of TEMPLATE_IDS) {
      const id = await create(`trang-${template}`, template);
      const body = await read<Record<string, unknown>>(id);
      expect(body.site.template).toBe(template);
      expect(body.images, template).toHaveLength(SAMPLE_COUNT[template]);
      expect(body.images.every((image) => image.sample)).toBe(true);
      // The list shows the photo that stands for the page: a cover, the card's photo; none for a profile yet.
      expect(body.site.cover?.id ?? null, template).toBe(body.images[0]?.id ?? null);
      expect(await readdir(path.join(app.config.uploadsDir, id)).catch(() => [])).toHaveLength(SAMPLE_COUNT[template]);
    }
    const tet = (await app.http().get('/api/sites').set('Cookie', owner.cookie)).body.sites.find((site: { template: string }) => site.template === 'tet');
    expect(tet.cover).not.toBeNull();
    const sixth = await app.http().post('/api/sites').set('Cookie', owner.cookie).set('Origin', ORIGIN).send({ name: 'trang-sau', template: 'tet' });
    expect(sixth.status).toBe(403);
    expect(sixth.body).toEqual({ error: 'site-limit', limit: 5 });
  });

  it('starts a Tết card with the first greeting and the Tết look, the sender left to the owner', async () => {
    const id = await create('chuc-tet', 'tet');
    const { draft } = await read<TetDraft>(id);
    expect(draft).toMatchObject({ title: 'Chúc Mừng Năm Mới', sender: '', reply: true, palette: 'lucky', style: 'am-cung' });
    expect(draft.greeting.length).toBeGreaterThan(20);
  });
});

describe('drafts of every template', () => {
  it('saves a wedding draft and checks it against the wedding schema only', async () => {
    const id = await create('minh-thao', 'wedding');
    const { draft, images } = await read<WeddingDraft>(id);
    const cover = images[0]?.id ?? null;
    const edited: WeddingDraft = { ...draft, groom: 'Minh', bride: 'Thảo', date: '2027-01-09', gallery: cover ? [cover] : [] };
    expect((await save(id, edited)).status).toBe(200);
    expect((await read<WeddingDraft>(id)).draft).toMatchObject({ groom: 'Minh', gallery: edited.gallery });

    // A draft of another template, a bad date, or a photo of no one is refused.
    const shop = await create('tiem-bo', 'shop');
    const shopDraft = (await read<unknown>(shop)).draft;
    for (const bad of [shopDraft, { ...edited, date: '2027-02-30' }, { ...edited, gallery: ['11111111-1111-4111-8111-111111111111'] }]) {
      const res = await save(id, bad);
      expect(res.status).toBe(400);
    }
    expect((await save(id, { ...edited, gallery: ['11111111-1111-4111-8111-111111111111'] })).body.error).toBe('unknown-image');
    expect((await save(id, shopDraft)).body.error).toBe('invalid-draft');
    // Another account cannot save into it, whatever the template.
    expect((await save(id, edited, stranger)).status).toBe(404);
  });

  it('saves a café menu and a profile page as typed, half-filled included', async () => {
    const cafe = await create('goc-nho', 'cafe');
    const { draft: menu } = await read<CafeDraft>(cafe);
    const half: CafeDraft = { ...menu, name: 'Góc Nhỏ', menu: [{ key: 's1', title: 'Cà phê', items: [{ key: 'i1', name: '', description: '', price: '29k', image: null }] }] };
    expect((await save(cafe, half)).status).toBe(200);

    const profile = await create('lan-anh', 'profile');
    const { draft: page } = await read<ProfileDraft>(profile);
    expect((await save(profile, { ...page, name: 'Lan Anh', links: [{ key: 'l1', label: 'Blog', url: 'lananh.blog' }] })).status).toBe(200);
    expect((await save(profile, { ...page, links: [{ key: 'bad key!', label: '', url: '' }] })).status).toBe(400);
  });
});

describe('publishing every template', () => {
  it.each([
    // "Gửi lời chúc lại" and "Đặt bàn" are on by default: they need a way to reach the owner.
    ['tet', ['sender', 'contacts']],
    ['wedding', ['groom', 'bride', 'date', 'events.0.venue', 'events.1.venue']],
    ['cafe', ['name', 'menu.0.items.0.name', 'menu.0.items.1.name', 'contacts']],
    ['profile', ['name', 'links.0.label', 'links.0.url', 'links.1.label', 'links.1.url']],
  ] as const)('refuses a new %s naming the fields its template needs', async (template, fields) => {
    const id = await create(`moi-${template}`, template);
    const res = await publish(id);
    expect(res.status).toBe(422);
    expect(res.body).toEqual({ error: 'draft-incomplete', fields });
  });

  it('queues a finished draft of each new template', async () => {
    const tet = await create('chuc-tet', 'tet');
    const card = (await read<TetDraft>(tet)).draft;
    expect((await save(tet, { ...card, sender: 'Gia đình Minh Anh', contacts: { zalo: '0912345678', phone: '', facebook: '' } })).status).toBe(200);
    expect((await publish(tet)).status).toBe(202);
  });

  it('checks the links a profile and a café page make before publishing', async () => {
    const profile = await create('lan-anh', 'profile');
    const page = (await read<ProfileDraft>(profile)).draft;
    await save(profile, { ...page, name: 'Lan', links: [{ key: 'l1', label: 'Blog', url: 'http://lananh.blog' }], socials: { ...page.socials, email: 'khong-phai-email' } });
    expect((await publish(profile)).body.fields).toEqual(['links.0.url', 'socials.email']);

    const cafe = await create('goc-nho', 'cafe');
    const menu = (await read<CafeDraft>(cafe)).draft;
    await save(cafe, {
      ...menu,
      name: 'Góc Nhỏ',
      menu: [{ key: 's1', title: '', items: [{ key: 'i1', name: 'Bạc xỉu', description: '', price: '', image: null }] }],
      address: 'https://evil.example/maps',
      booking: false,
    });
    expect((await publish(cafe)).body.fields).toEqual(['address']);
  });
});
