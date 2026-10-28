import type { ShopDraft } from '@webnhanh/templates';
import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { AccountProvider } from './account';
import { App } from './app';
import { I18nProvider } from './i18n';

// jsdom has no layout, so no scrollIntoView; browsers all do. Tests that care spy on this one.
Element.prototype.scrollIntoView ??= (): void => undefined;

const SITE_ID = '11111111-1111-4111-8111-111111111111';
const COVER = '22222222-2222-4222-8222-222222222222';
const P1 = '33333333-3333-4333-8333-333333333333';
const NOW = '2026-10-28T03:00:00.000Z';

const images = [
  { id: COVER, width: 675, height: 900, widths: [675], sample: true },
  { id: P1, width: 900, height: 900, widths: [900], sample: true },
];

function site(overrides: Record<string, unknown> = {}) {
  return { id: SITE_ID, name: 'nha-bo', template: 'shop', status: 'draft', published: false, createdAt: NOW, updatedAt: NOW, cover: images[0], job: null, newOrders: 0, ...overrides };
}

/** A new site's draft as stored before pages had a style: the editor reads it in the default style. */
function emptyDraft(): Omit<ShopDraft, 'style'> {
  return {
    name: '',
    description: '',
    cover: COVER,
    products: [{ key: 'p1', name: '', image: P1, description: '', price: '' }],
    contacts: { zalo: '', phone: '', facebook: '' },
    palette: 'berry',
  };
}

type Handler = (init: RequestInit | undefined) => { status: number; body: unknown };
let routes: Map<string, Handler>;
let calls: { method: string; url: string; body: unknown }[];

function json(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });
}

function on(method: string, url: string, handler: Handler): void {
  routes.set(`${method} ${url}`, handler);
}

beforeEach(() => {
  document.cookie = 'hd_lang=vi; Path=/';
  routes = new Map();
  calls = [];
  on('GET', '/api/me', () => ({ status: 200, body: { account: { id: 'a1', createdAt: NOW } } }));
  vi.stubGlobal(
    'fetch',
    vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const method = init?.method ?? 'GET';
      const url = String(input);
      calls.push({ method, url, body: typeof init?.body === 'string' ? JSON.parse(init.body) : undefined });
      const handler = routes.get(`${method} ${url}`);
      if (!handler) return json(404, { error: 'not-found' });
      const answer = handler(init);
      return json(answer.status, answer.body);
    }),
  );
});

afterEach(() => {
  cleanup();
  vi.useRealTimers();
  vi.unstubAllGlobals();
  document.cookie = 'hd_lang=; Max-Age=0; Path=/';
});

function renderAt(path: string): void {
  render(
    <I18nProvider>
      <AccountProvider>
        <MemoryRouter initialEntries={[path]}>
          <App />
        </MemoryRouter>
      </AccountProvider>
    </I18nProvider>,
  );
}

describe('home with pages', () => {
  it('lists the pages with their address, state and actions', async () => {
    on('GET', '/api/sites', () => ({
      status: 200,
      body: { sites: [site({ published: true, status: 'published' }), site({ id: '44444444-4444-4444-8444-444444444444', name: 'tiem-hai', cover: null })], limits: { sites: 2, siteBytes: 1 } },
    }));
    renderAt('/');
    expect(await screen.findByText('nha-bo.hoandat.io.vn')).toBeTruthy();
    expect(screen.getByText('Đã đăng')).toBeTruthy();
    expect(screen.getByText('Bản nháp')).toBeTruthy();
    expect(screen.getByRole('link', { name: 'Xem website' }).getAttribute('href')).toBe('https://nha-bo.hoandat.io.vn/');
    expect(screen.getAllByRole('link', { name: 'Sửa' })[0]?.getAttribute('href')).toBe(`/sites/${SITE_ID}`);
    // At the limit: no button to make another page, and why.
    expect(screen.queryByRole('link', { name: 'Tạo website mới' })).toBeNull();
    expect(screen.getByText(/đủ 2 website/)).toBeTruthy();
  });
});

describe('making a page', () => {
  it('offers every template, checks the address as typed, and opens the editor', async () => {
    on('POST', '/api/sites', () => ({ status: 201, body: { site: site() } }));
    on('GET', `/api/sites/${SITE_ID}`, () => ({ status: 200, body: { site: site(), draft: emptyDraft(), images, usedBytes: 100 } }));
    renderAt('/new');
    for (const name of [/Thiệp chúc Tết/, /Thiệp cưới/, /Quán, cửa hàng/, /Hồ sơ cá nhân/]) expect(await screen.findByRole('button', { name })).toBeTruthy();
    expect(screen.queryByText('Sắp có')).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: /Bán hàng nhận đơn/ }));
    expect(screen.getByRole('button', { name: /Bán hàng nhận đơn/ }).getAttribute('aria-pressed')).toBe('true');

    // The shop's looks, as a radio group with the first one picked; each has its thumbnail, loaded lazily.
    const looks = screen.getByRole('group', { name: 'Chọn kiểu' });
    const radios = within(looks).getAllByRole('radio') as HTMLInputElement[];
    expect(radios.map((radio) => radio.value)).toEqual(['cay-canh', 'do-an-vat', 'handmade', 'my-pham', 'nong-san', 'quan-ao']);
    expect(radios[0]?.checked).toBe(true);
    expect(looks.querySelectorAll('img[loading="lazy"]')).toHaveLength(6);
    fireEvent.click(within(looks).getByLabelText('Mỹ phẩm'));
    expect((within(looks).getByLabelText('Mỹ phẩm') as HTMLInputElement).checked).toBe(true);

    const input = screen.getByLabelText('Địa chỉ website');
    fireEvent.change(input, { target: { value: 'vietcombank-hotro' } });
    expect(screen.getByRole('alert').textContent).toContain('giả mạo');
    expect((screen.getByRole('button', { name: 'Tạo website' }) as HTMLButtonElement).disabled).toBe(true);

    fireEvent.change(input, { target: { value: 'Nha-Bo' } });
    fireEvent.click(screen.getByRole('button', { name: 'Tạo website' }));
    expect(await screen.findByTitle('Xem trước website')).toBeTruthy();
    expect(calls.find((c) => c.method === 'POST')?.body).toEqual({ name: 'nha-bo', template: 'shop', variant: 'my-pham' });
  });

  it('makes a page of the template picked', async () => {
    on('POST', '/api/sites', () => ({ status: 201, body: { site: site({ template: 'wedding' }) } }));
    renderAt('/new');
    fireEvent.click(await screen.findByRole('button', { name: /Thiệp cưới/ }));
    expect(screen.getByRole('link', { name: /Phông chữ và ảnh/ }).getAttribute('href')).toBe('/credits');
    // Switching template starts again from that template's first look.
    expect((screen.getByLabelText('Hoa pastel') as HTMLInputElement).checked).toBe(true);
    fireEvent.click(screen.getByRole('button', { name: /Thiệp chúc Tết/ }));
    expect((screen.getByLabelText('Đất sét đỏ vàng') as HTMLInputElement).checked).toBe(true);
    fireEvent.click(screen.getByRole('button', { name: /Thiệp cưới/ }));
    fireEvent.change(screen.getByLabelText('Địa chỉ website'), { target: { value: 'minh-thao' } });
    fireEvent.click(screen.getByRole('button', { name: 'Tạo website' }));
    await waitFor(() => expect(calls.find((c) => c.method === 'POST')?.body).toEqual({ name: 'minh-thao', template: 'wedding', variant: 'hoa-pastel' }));
  });

  it('says when the look is not one of the template', async () => {
    on('POST', '/api/sites', () => ({ status: 400, body: { error: 'unknown-variant' } }));
    renderAt('/new');
    fireEvent.click(await screen.findByRole('button', { name: /Hồ sơ cá nhân/ }));
    fireEvent.change(screen.getByLabelText('Địa chỉ website'), { target: { value: 'lan-anh' } });
    fireEvent.click(screen.getByRole('button', { name: 'Tạo website' }));
    expect((await screen.findByRole('alert')).textContent).toContain('không có kiểu đã chọn');
  });

  it('says when the name is taken', async () => {
    on('POST', '/api/sites', () => ({ status: 409, body: { error: 'name-taken' } }));
    renderAt('/new');
    fireEvent.click(await screen.findByRole('button', { name: /Bán hàng nhận đơn/ }));
    fireEvent.change(screen.getByLabelText('Địa chỉ website'), { target: { value: 'nha-bo' } });
    fireEvent.click(screen.getByRole('button', { name: 'Tạo website' }));
    expect((await screen.findByRole('alert')).textContent).toContain('đã có người dùng');
  });
});

describe('editor', () => {
  function frame(): HTMLIFrameElement {
    const element = document.querySelector('[data-id="preview"]');
    if (!(element instanceof HTMLIFrameElement)) throw new Error('no preview');
    return element;
  }

  it('previews the draft with the published renderer in a frame that runs no script, and saves on its own', async () => {
    let saved: unknown = null;
    on('GET', `/api/sites/${SITE_ID}`, () => ({ status: 200, body: { site: site(), draft: emptyDraft(), images, usedBytes: 100 } }));
    on('PUT', `/api/sites/${SITE_ID}/draft`, (init) => {
      saved = JSON.parse(String(init?.body));
      return { status: 200, body: { updatedAt: NOW } };
    });
    renderAt(`/sites/${SITE_ID}`);
    const name = await screen.findByLabelText('Tên tiệm');
    expect(frame().getAttribute('sandbox')).toBe('allow-same-origin');
    expect(frame().getAttribute('srcdoc')).toContain(`/api/sites/${SITE_ID}/images/${COVER}-675.webp`);
    expect(screen.getAllByText('Ảnh mẫu').length).toBeGreaterThan(0);

    fireEvent.change(name, { target: { value: 'Tiệm <Bơ>' } });
    expect(frame().getAttribute('srcdoc')).toContain('<h1>Tiệm &lt;Bơ&gt;</h1>');
    expect(screen.getByText('Chưa lưu')).toBeTruthy();
    await waitFor(() => expect(saved).toMatchObject({ draft: { name: 'Tiệm <Bơ>' } }), { timeout: 3000 });
    expect(await screen.findByText('Đã lưu')).toBeTruthy();
  });

  it('adds, moves and removes products, and picks a colour', async () => {
    on('GET', `/api/sites/${SITE_ID}`, () => ({ status: 200, body: { site: site(), draft: emptyDraft(), images, usedBytes: 100 } }));
    on('PUT', `/api/sites/${SITE_ID}/draft`, () => ({ status: 200, body: { updatedAt: NOW } }));
    renderAt(`/sites/${SITE_ID}`);
    fireEvent.click(await screen.findByRole('button', { name: 'Thêm sản phẩm' }));
    const names = () => screen.getAllByLabelText('Tên sản phẩm') as HTMLInputElement[];
    fireEvent.change(names()[1] as HTMLInputElement, { target: { value: 'Món hai' } });
    fireEvent.click(document.querySelector('[data-id="product-1-up"]') as HTMLButtonElement);
    expect(names().map((input) => input.value)).toEqual(['Món hai', '']);
    fireEvent.click(document.querySelector('[data-id="product-1-remove"]') as HTMLButtonElement);
    expect(names()).toHaveLength(1);
    expect(screen.getByRole('heading', { name: 'Sản phẩm (1/30)' })).toBeTruthy();

    fireEvent.click(screen.getByLabelText('Cam'));
    expect(frame().getAttribute('srcdoc')).toContain('#c2410c');
  });

  it('reads a draft without a style in the default one, and switches the preview to the style picked', async () => {
    let saved: unknown = null;
    on('GET', `/api/sites/${SITE_ID}`, () => ({ status: 200, body: { site: site(), draft: emptyDraft(), images, usedBytes: 100 } }));
    on('PUT', `/api/sites/${SITE_ID}/draft`, (init) => {
      saved = JSON.parse(String(init?.body));
      return { status: 200, body: { updatedAt: NOW } };
    });
    renderAt(`/sites/${SITE_ID}`);
    const bold = (await screen.findByRole('radio', { name: /Rực rỡ/ })) as HTMLInputElement;
    expect(bold.checked).toBe(true);
    expect(frame().getAttribute('srcdoc')).toContain('<body class="s-ruc-ro');
    // The preview loads the style's fonts from the app itself, and shows the order form once a product has a name.
    expect(frame().getAttribute('srcdoc')).toContain('url(/assets/preview-fonts/bricolage-grotesque-latin-800-normal.woff2)');
    expect(frame().getAttribute('srcdoc')).not.toContain('id="dat-hang"');
    fireEvent.change(screen.getByLabelText('Tên sản phẩm'), { target: { value: 'Món một' } });
    expect(frame().getAttribute('srcdoc')).toContain('id="dat-hang"');

    fireEvent.click(screen.getByRole('radio', { name: /Tinh tế/ }));
    expect(frame().getAttribute('srcdoc')).toContain('<body class="s-tinh-te');
    expect(frame().getAttribute('srcdoc')).toContain('url(/assets/preview-fonts/newsreader-latin-500-normal.woff2)');
    await waitFor(() => expect(saved).toMatchObject({ draft: { style: 'tinh-te' } }), { timeout: 3000 });
  });

  it('marks wrong contacts at once and what is missing when Publish is pressed', async () => {
    on('GET', `/api/sites/${SITE_ID}`, () => ({ status: 200, body: { site: site(), draft: emptyDraft(), images, usedBytes: 100 } }));
    renderAt(`/sites/${SITE_ID}`);
    fireEvent.change(await screen.findByLabelText('Số điện thoại'), { target: { value: '123' } });
    expect(screen.getByText('Chưa đúng số điện thoại Việt Nam.')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Đăng website' }));
    expect((await screen.findByText(/chỗ cần sửa/)).textContent).toBe('Còn 3 chỗ cần sửa trước khi đăng.');
    expect(screen.getAllByText('Cần điền ô này trước khi đăng.')).toHaveLength(2);
    expect(calls.some((c) => c.url.endsWith('/publish'))).toBe(false);
  });

  it('brings the first wrong field into view and focus when Publish is refused', async () => {
    const scrolled: Element[] = [];
    const scrollIntoView = vi.spyOn(Element.prototype, 'scrollIntoView').mockImplementation(function (this: Element) {
      scrolled.push(this);
    });
    on('GET', `/api/sites/${SITE_ID}`, () => ({ status: 200, body: { site: site(), draft: emptyDraft(), images, usedBytes: 100 } }));
    renderAt(`/sites/${SITE_ID}`);
    fireEvent.click(await screen.findByRole('button', { name: 'Đăng website' }));
    await waitFor(() => expect(scrolled).toHaveLength(1));
    const first = document.querySelector('[aria-invalid="true"]');
    expect(scrolled[0]).toBe(first);
    expect(document.activeElement).toBe(first);
    scrollIntoView.mockRestore();
  });

  it('publishes: saves, shows each step with its time, then the live link', async () => {
    const ready: ShopDraft = { ...emptyDraft(), style: 'ruc-ro', name: 'Tiệm Bơ', products: [{ key: 'p1', name: 'Món một', image: P1, description: '', price: '' }] };
    const job = { id: '55555555-5555-4555-8555-555555555555', siteId: SITE_ID, type: 'publish', error: null, createdAt: NOW, finishedAt: null };
    const at = (s: number) => new Date(Date.parse(NOW) + s * 1000).toISOString();
    let polls = 0;
    on('GET', `/api/sites/${SITE_ID}`, () => ({ status: 200, body: { site: site(), draft: ready, images, usedBytes: 100 } }));
    on('PUT', `/api/sites/${SITE_ID}/draft`, () => ({ status: 200, body: { updatedAt: NOW } }));
    on('POST', `/api/sites/${SITE_ID}/publish`, () => ({ status: 202, body: { job: { ...job, status: 'queued', steps: [], startedAt: null } } }));
    on('GET', `/api/jobs/${job.id}`, () => {
      polls += 1;
      const steps = ['prepare', 'render', 'images', 'publish', 'finish'].map((name, i) => ({ name, startedAt: at(i * 0.5), finishedAt: at(i * 0.5 + 0.5) }));
      return polls === 1
        ? { status: 200, body: { job: { ...job, status: 'running', startedAt: at(0), steps: [steps[0], { name: 'render', startedAt: at(0.5) }] }, siteName: 'nha-bo' } }
        : { status: 200, body: { job: { ...job, status: 'done', startedAt: at(0), finishedAt: at(2.5), steps }, siteName: 'nha-bo' } };
    });
    renderAt(`/sites/${SITE_ID}`);
    fireEvent.click(await screen.findByRole('button', { name: 'Đăng website' }));
    expect(await screen.findByText('Kiểm tra nội dung', {}, { timeout: 3000 })).toBeTruthy();
    expect(await screen.findByText('Website của bạn đã lên mạng', {}, { timeout: 4000 })).toBeTruthy();
    expect(screen.getAllByText('0,5 giây', { selector: '.step-time' })).toHaveLength(5);
    expect(document.querySelector('[data-id="publish-url"]')?.textContent).toBe('nha-bo.hoandat.io.vn');
    expect(screen.getByRole('link', { name: 'Xem như khách' }).getAttribute('href')).toBe('https://nha-bo.hoandat.io.vn/');
    // The draft was saved before the job was asked for.
    const order = calls.map((c) => `${c.method} ${c.url}`);
    expect(order.indexOf(`PUT /api/sites/${SITE_ID}/draft`)).toBeLessThan(order.indexOf(`POST /api/sites/${SITE_ID}/publish`));
    await act(async () => undefined);
  });

  it('refuses a photo of the wrong type before uploading', async () => {
    on('GET', `/api/sites/${SITE_ID}`, () => ({ status: 200, body: { site: site(), draft: emptyDraft(), images, usedBytes: 100 } }));
    renderAt(`/sites/${SITE_ID}`);
    await screen.findByLabelText('Tên tiệm');
    const input = document.querySelector('[data-id="cover"] input[type="file"]');
    if (!(input instanceof HTMLInputElement)) throw new Error('no file input');
    fireEvent.change(input, { target: { files: [new File(['GIF89a'], 'a.gif', { type: 'image/gif' })] } });
    expect(screen.getByText('Chỉ nhận ảnh JPEG, PNG hoặc WebP.')).toBeTruthy();
  });

  it('says so when the page is not in the account', async () => {
    on('GET', `/api/sites/${SITE_ID}`, () => ({ status: 404, body: { error: 'site-not-found' } }));
    renderAt(`/sites/${SITE_ID}`);
    expect((await screen.findByRole('alert')).textContent).toBe('Không tìm thấy website này trong tài khoản của bạn.');
  });
});
