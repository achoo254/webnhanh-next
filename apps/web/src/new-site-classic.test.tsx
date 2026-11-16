import type { ShopDraft } from '@webnhanh/templates';
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { AccountProvider } from './account';
import { App } from './app';
import { I18nProvider } from './i18n';

// The flow with TRY_FIRST off: the address is picked on /new, and a visitor signs up before the editor.
vi.mock('./features', () => ({ TRY_FIRST: false }));

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
  return new Response(status === 204 ? null : JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });
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

describe('landing with TRY_FIRST off', () => {
  it('shows a visitor the sign-in card, going through the server sign-in', async () => {
    on('GET', '/api/me', () => ({ status: 401, body: { error: 'sign-in-required' } }));
    renderAt('/');
    const cta = await screen.findByRole('link', { name: 'Đăng nhập bằng hoandat.com' });
    expect(cta.getAttribute('href')).toBe('/auth/login?return=%2F&lang=vi');
    expect(screen.getByText(/App không bao giờ thấy mật khẩu của bạn/)).toBeTruthy();
    expect(screen.getByRole('link', { name: 'Hoặc chọn mẫu trước, chưa cần tài khoản' }).getAttribute('href')).toBe('/new');
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

  it('lets a visitor pick first and sends them to sign up with what they picked', async () => {
    on('GET', '/api/me', () => ({ status: 401, body: { error: 'unauthenticated' } }));
    renderAt('/new');
    fireEvent.click(await screen.findByRole('button', { name: /Thiệp cưới/ }));
    // No button that makes a page before the address is valid.
    expect(screen.queryByRole('link', { name: 'Đăng ký miễn phí để tạo website' })).toBeNull();
    fireEvent.change(screen.getByLabelText('Địa chỉ website'), { target: { value: 'minh-thao' } });
    const link = screen.getByRole('link', { name: 'Đăng ký miễn phí để tạo website' });
    const url = new URL(link.getAttribute('href') ?? '', 'https://webnhanh.hoandat.com');
    expect(url.pathname).toBe('/auth/login');
    expect(url.searchParams.get('signup')).toBe('1');
    expect(url.searchParams.get('return')).toBe('/new?template=wedding&variant=hoa-pastel&name=minh-thao');
    expect(calls.some((c) => c.method === 'POST')).toBe(false);
  });

  it('comes back from sign-up with the template, look and address filled in', async () => {
    on('POST', '/api/sites', () => ({ status: 201, body: { site: site({ template: 'wedding' }) } }));
    renderAt('/new?template=wedding&variant=hoa-pastel&name=minh-thao');
    expect((await screen.findByRole('button', { name: /Thiệp cưới/ })).getAttribute('aria-pressed')).toBe('true');
    expect((screen.getByLabelText('Hoa pastel') as HTMLInputElement).checked).toBe(true);
    expect((screen.getByLabelText('Địa chỉ website') as HTMLInputElement).value).toBe('minh-thao');
    fireEvent.click(screen.getByRole('button', { name: 'Tạo website' }));
    await waitFor(() => expect(calls.find((c) => c.method === 'POST')?.body).toEqual({ name: 'minh-thao', template: 'wedding', variant: 'hoa-pastel' }));
  });

  it('drops a template or look from the address that does not exist', async () => {
    renderAt('/new?template=casino&variant=x&name=abc');
    expect(await screen.findByRole('button', { name: /Thiệp cưới/ })).toBeTruthy();
    expect(screen.queryByLabelText('Địa chỉ website')).toBeNull();
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
