import { newCafeDraft, newProfileDraft, newTetDraft, newWeddingDraft, TET_GREETINGS, type TemplateId } from '@webnhanh/templates';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { AccountProvider } from './account';
import { App } from './app';
import { I18nProvider } from './i18n';

// jsdom has no layout, so no scrollIntoView; browsers all do. Tests that care spy on this one.
Element.prototype.scrollIntoView ??= (): void => undefined;

const SITE_ID = '11111111-1111-4111-8111-111111111111';
const PHOTO = '22222222-2222-4222-8222-222222222222';
const NOW = '2026-10-28T03:00:00.000Z';
const images = [{ id: PHOTO, width: 675, height: 900, widths: [675], sample: true }];

let saved: unknown[];
let calls: { method: string; url: string }[];

function json(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });
}

/** The editor of a site of `template` with `draft`, saves recorded in `saved`. */
function openEditor(template: TemplateId, draft: unknown): void {
  const site = { id: SITE_ID, name: 'trang-thu', kind: 'template', template, status: 'draft', published: false, createdAt: NOW, updatedAt: NOW, cover: null, job: null, newOrders: 0 };
  vi.stubGlobal(
    'fetch',
    vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const method = init?.method ?? 'GET';
      const url = String(input);
      calls.push({ method, url });
      if (url === '/api/me') return json(200, { account: { id: 'a1', createdAt: NOW } });
      if (method === 'GET' && url === `/api/sites/${SITE_ID}`) return json(200, { site, draft, images, usedBytes: 100 });
      if (method === 'PUT' && url === `/api/sites/${SITE_ID}/draft`) {
        saved.push((JSON.parse(String(init?.body)) as { draft: unknown }).draft);
        return json(200, { updatedAt: NOW });
      }
      return json(404, { error: 'not-found' });
    }),
  );
  render(
    <I18nProvider>
      <AccountProvider>
        <MemoryRouter initialEntries={[`/sites/${SITE_ID}`]}>
          <App />
        </MemoryRouter>
      </AccountProvider>
    </I18nProvider>,
  );
}

function preview(): string {
  const element = document.querySelector('[data-id="preview"]');
  if (!(element instanceof HTMLIFrameElement)) throw new Error('no preview');
  return element.getAttribute('srcdoc') ?? '';
}

const lastSaved = (): Record<string, unknown> => (saved[saved.length - 1] ?? {}) as Record<string, unknown>;

beforeEach(() => {
  document.cookie = 'hd_lang=vi; Path=/';
  saved = [];
  calls = [];
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  document.cookie = 'hd_lang=; Max-Age=0; Path=/';
});

describe('Tết card editor', () => {
  it('picks a ready greeting or takes the sender\'s own, and offers only the Tết colours', async () => {
    openEditor('tet', newTetDraft({ photo: PHOTO }));
    const text = (await screen.findByLabelText('Nội dung lời chúc')) as HTMLTextAreaElement;
    expect(text.value).toBe(TET_GREETINGS[0].text);
    fireEvent.click(screen.getByLabelText('Gia đình'));
    expect(text.value).toBe(TET_GREETINGS[1].text);
    expect(preview()).toContain(TET_GREETINGS[1].text.slice(0, 30));
    fireEvent.change(text, { target: { value: 'Chúc cả nhà <an khang>' } });
    expect((screen.getByLabelText('Tự viết') as HTMLInputElement).checked).toBe(true);
    expect(preview()).toContain('Chúc cả nhà &lt;an khang&gt;');
    fireEvent.change(screen.getByLabelText('Người gửi'), { target: { value: 'Minh Anh' } });
    await waitFor(() => expect(lastSaved()).toMatchObject({ sender: 'Minh Anh', greeting: 'Chúc cả nhà <an khang>' }), { timeout: 3000 });
    expect(screen.getByLabelText('Đỏ vàng')).toBeTruthy();
    expect(screen.queryByLabelText('Cam')).toBeNull();
    expect((screen.getByRole('radio', { name: /Ấm cúng/ }) as HTMLInputElement).checked).toBe(true);
  });

  it('asks for the sender and a contact for replies when Publish is pressed', async () => {
    openEditor('tet', newTetDraft({ photo: PHOTO }));
    fireEvent.click(await screen.findByRole('button', { name: 'Đăng website' }));
    expect((await screen.findByText(/chỗ cần sửa/)).textContent).toBe('Còn 2 chỗ cần sửa trước khi đăng.');
    expect(screen.getByText('Cần ít nhất một cách liên hệ: Zalo, điện thoại hoặc Facebook.')).toBeTruthy();
    expect(calls.some((c) => c.url.endsWith('/publish'))).toBe(false);
  });
});

describe('wedding editor', () => {
  it('edits the couple and the day with the phone\'s pickers, adds a ceremony, and previews the reply form', async () => {
    openEditor('wedding', newWeddingDraft({ cover: PHOTO }));
    fireEvent.change(await screen.findByLabelText('Tên chú rể'), { target: { value: 'Minh' } });
    fireEvent.change(screen.getByLabelText('Tên cô dâu'), { target: { value: 'Thảo' } });
    const date = screen.getByLabelText('Ngày cưới') as HTMLInputElement;
    expect(date.type).toBe('date');
    fireEvent.change(date, { target: { value: '2026-12-12' } });
    expect(preview()).toContain('Thứ Bảy, 12.12.2026');
    // The reply form, as published (its token a stand-in), in a frame that runs no script.
    expect(preview()).toContain('<input type="hidden" name="kind" value="rsvp">');

    expect(screen.getAllByLabelText('Tên lễ')).toHaveLength(2);
    fireEvent.click(screen.getByRole('button', { name: 'Thêm lễ' }));
    const labels = screen.getAllByLabelText('Tên lễ') as HTMLInputElement[];
    fireEvent.change(labels[2] as HTMLInputElement, { target: { value: 'Lễ vu quy' } });
    expect((screen.getAllByLabelText('Giờ')[0] as HTMLInputElement).type).toBe('time');
    fireEvent.click(document.querySelector('[data-id="event-2-up"]') as HTMLButtonElement);
    expect((screen.getAllByLabelText('Tên lễ') as HTMLInputElement[]).map((input) => input.value)).toEqual(['Lễ thành hôn', 'Lễ vu quy', 'Tiệc cưới']);

    fireEvent.click(screen.getByLabelText('Cho khách xác nhận tham dự'));
    expect(preview()).not.toContain('name="kind"');
    await waitFor(() => expect(lastSaved()).toMatchObject({ groom: 'Minh', date: '2026-12-12', rsvp: false }), { timeout: 3000 });
    expect((lastSaved().events as { label: string }[]).map((event) => event.label)).toEqual(['Lễ thành hôn', 'Lễ vu quy', 'Tiệc cưới']);
  });

  it('marks a wrong map link at once', async () => {
    openEditor('wedding', newWeddingDraft({ cover: PHOTO }));
    const addresses = (await screen.findAllByLabelText('Địa chỉ')) as HTMLInputElement[];
    fireEvent.change(addresses[0] as HTMLInputElement, { target: { value: 'https://evil.example/maps' } });
    expect(screen.getByText('Chưa đúng: gõ địa chỉ hoặc dán link Google Maps.')).toBeTruthy();
  });
});

describe('café editor', () => {
  it('builds the menu in sections and the hours table', async () => {
    openEditor('cafe', newCafeDraft({ cover: PHOTO }));
    const heading = await screen.findByRole('heading', { name: 'Thực đơn (2/120 món)' });
    expect(heading).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Thêm nhóm món' }));
    expect(screen.getByRole('heading', { name: 'Thực đơn (3/120 món)' })).toBeTruthy();
    const sections = screen.getAllByLabelText('Tên nhóm món') as HTMLInputElement[];
    fireEvent.change(sections[1] as HTMLInputElement, { target: { value: 'Trà' } });
    const items = screen.getAllByLabelText('Tên món') as HTMLInputElement[];
    fireEvent.change(items[2] as HTMLInputElement, { target: { value: 'Trà đào' } });
    expect(preview()).toContain('Trà đào');
    fireEvent.change(screen.getByLabelText('Ngày'), { target: { value: 'Mỗi ngày' } });
    fireEvent.change(screen.getByLabelText('Giờ'), { target: { value: '7:00 – 22:00' } });
    fireEvent.click(screen.getByRole('button', { name: 'Thêm dòng giờ mở cửa' }));
    expect(screen.getAllByLabelText('Ngày')).toHaveLength(2);
    await waitFor(() => expect(lastSaved()).toMatchObject({ hours: [{ days: 'Mỗi ngày', time: '7:00 – 22:00' }, { days: '', time: '' }] }), { timeout: 3000 });
    const menu = lastSaved().menu as { title: string; items: { key: string; name: string }[] }[];
    expect(menu.map((section) => section.title)).toEqual(['', 'Trà']);
    // Item keys stay unique across the whole menu.
    const keys = menu.flatMap((section) => section.items.map((item) => item.key));
    expect(new Set(keys).size).toBe(keys.length);
  });

  it('brings the "no dishes" issue into view when Publish is refused', async () => {
    const scrolled: Element[] = [];
    const spy = vi.spyOn(Element.prototype, 'scrollIntoView').mockImplementation(function (this: Element) {
      scrolled.push(this);
    });
    openEditor('cafe', { ...newCafeDraft({ cover: PHOTO }), name: 'Góc Nhỏ', menu: [], booking: false });
    fireEvent.click(await screen.findByRole('button', { name: 'Đăng website' }));
    await waitFor(() => expect(scrolled).toHaveLength(1));
    expect(scrolled[0]?.textContent).toBe('Cần ít nhất một món trong thực đơn.');
    expect(document.activeElement).toBe(scrolled[0]);
    spy.mockRestore();
  });
});

describe('profile editor', () => {
  it('edits links and socials, and marks a link that is not https at once', async () => {
    openEditor('profile', newProfileDraft());
    fireEvent.change(await screen.findByLabelText('Tên'), { target: { value: 'Lan Anh' } });
    const labels = screen.getAllByLabelText('Chữ trên nút') as HTMLInputElement[];
    const urls = screen.getAllByLabelText('Địa chỉ (https)') as HTMLInputElement[];
    fireEvent.change(labels[0] as HTMLInputElement, { target: { value: 'Blog' } });
    fireEvent.change(urls[0] as HTMLInputElement, { target: { value: 'http://lananh.blog' } });
    expect(screen.getByText('Chưa đúng địa chỉ web. Chỉ nhận link https.')).toBeTruthy();
    fireEvent.change(urls[0] as HTMLInputElement, { target: { value: 'lananh.blog' } });
    expect(screen.queryByText('Chưa đúng địa chỉ web. Chỉ nhận link https.')).toBeNull();
    expect(preview()).toContain('href="https://lananh.blog/"');
    fireEvent.click(document.querySelector('[data-id="link-1-remove"]') as HTMLButtonElement);
    fireEvent.change(screen.getByLabelText('Instagram (@tên hoặc link)'), { target: { value: '@lananh' } });
    await waitFor(() => expect(lastSaved()).toMatchObject({ name: 'Lan Anh', links: [{ label: 'Blog', url: 'lananh.blog' }], socials: { instagram: '@lananh' } }), {
      timeout: 3000,
    });
  });
});
