import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { AccountProvider } from './account';
import { App } from './app';
import { fakeIndexedDb, type FakeIndexedDb } from './guest/fake-indexed-db.test-support';
import { I18nProvider } from './i18n';
import { leaveTo } from './leave-to';
import { rememberSignUpSource } from './signup-source';

// jsdom has no layout, so no scrollIntoView; browsers all do.
Element.prototype.scrollIntoView ??= (): void => undefined;

// Where the app would go on a full page load (the sign-up at /auth/login).
vi.mock('./leave-to', () => ({ leaveTo: vi.fn() }));
// jsdom draws nothing: a chosen photo comes out of the shrinking step as a small JPEG.
vi.mock('./guest/guest-photo-shrink', () => ({
  shrinkPhoto: vi.fn(async () => ({ blob: new Blob([new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 1, 2, 3])], { type: 'image/jpeg' }), width: 1200, height: 900 })),
}));

const NOW = '2026-11-16T03:00:00.000Z';
const SITE_ID = '11111111-1111-4111-8111-111111111111';
const SERVER_COVER = '22222222-2222-4222-8222-222222222222';
const SERVER_ORNAMENT = '33333333-3333-4333-8333-333333333333';
const UPLOADED = '44444444-4444-4444-8444-444444444444';

type Handler = (init: RequestInit | undefined) => { status: number; body: unknown };
let routes: Map<string, Handler>;
let calls: { method: string; url: string; body: unknown }[];
let signedIn: boolean;
let idb: FakeIndexedDb;

function on(method: string, url: string, handler: Handler): void {
  routes.set(`${method} ${url}`, handler);
}

function site(overrides: Record<string, unknown> = {}) {
  return { id: SITE_ID, name: 'minh-thao', template: 'wedding', status: 'draft', published: false, createdAt: NOW, updatedAt: NOW, cover: null, job: null, newOrders: 0, ...overrides };
}

class FakeXhr {
  static sent: Blob[] = [];
  status = 0;
  responseText = '';
  upload: { onprogress: ((event: ProgressEvent) => void) | null } = { onprogress: null };
  onload: (() => void) | null = null;
  onerror: (() => void) | null = null;
  onabort: (() => void) | null = null;
  url = '';
  open(_method: string, url: string): void {
    this.url = url;
  }
  setRequestHeader(): void {}
  abort(): void {}
  send(body: Blob): void {
    FakeXhr.sent.push(body);
    calls.push({ method: 'POST', url: this.url, body: undefined });
    this.status = 201;
    this.responseText = JSON.stringify({ image: { id: UPLOADED, width: 1200, height: 900, widths: [480, 960, 1200], sample: false } });
    setTimeout(() => this.onload?.(), 0);
  }
}

beforeEach(() => {
  document.cookie = 'hd_lang=vi; Path=/';
  localStorage.clear();
  sessionStorage.clear();
  routes = new Map();
  calls = [];
  signedIn = false;
  FakeXhr.sent = [];
  vi.mocked(leaveTo).mockClear();
  idb = fakeIndexedDb();
  vi.stubGlobal('indexedDB', idb.factory);
  vi.stubGlobal('XMLHttpRequest', FakeXhr);
  on('GET', '/api/me', () => (signedIn ? { status: 200, body: { account: { id: 'a1', createdAt: NOW } } } : { status: 401, body: { error: 'sign-in-required' } }));
  vi.stubGlobal(
    'fetch',
    vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const method = init?.method ?? 'GET';
      const url = String(input);
      calls.push({ method, url, body: typeof init?.body === 'string' ? JSON.parse(init.body) : undefined });
      const handler = routes.get(`${method} ${url}`);
      const answer = handler ? handler(init) : { status: 404, body: { error: 'not-found' } };
      return new Response(answer.status === 204 ? null : JSON.stringify(answer.body), { status: answer.status, headers: { 'Content-Type': 'application/json' } });
    }),
  );
});

afterEach(() => {
  cleanup();
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

function frame(): HTMLIFrameElement {
  const element = document.querySelector('[data-id="preview"]');
  if (!(element instanceof HTMLIFrameElement)) throw new Error('no preview');
  return element;
}

describe('picking a template, no account needed', () => {
  it('offers every template with its picture, the developer deploy as a link below, and no address field', async () => {
    renderAt('/new');
    const profile = await screen.findByRole('button', { name: /Hồ sơ cá nhân/ });
    expect(profile.querySelector('img')).toBeTruthy();
    expect(screen.queryByRole('link', { name: /Cho lập trình viên/ })).toBeNull();
    expect(screen.getByRole('link', { name: /Bạn là lập trình viên/ }).getAttribute('href')).toBe('/new/developer');

    fireEvent.click(screen.getByRole('button', { name: /Thiệp cưới/ }));
    fireEvent.click(screen.getByLabelText('Vintage'));
    expect(screen.queryByLabelText('Địa chỉ website')).toBeNull();
    expect(screen.getByRole('link', { name: 'Sửa mẫu này' }).getAttribute('href')).toBe('/new/edit?template=wedding&variant=vintage');
    expect(calls.filter((call) => call.url !== '/api/me')).toEqual([]);
  });

  it('opens a look from the address an ad or the landing links to', async () => {
    renderAt('/new?template=shop&variant=my-pham');
    expect((await screen.findByRole('button', { name: /Bán hàng nhận đơn/ })).getAttribute('aria-pressed')).toBe('true');
    expect(screen.getByRole('link', { name: 'Sửa mẫu này' }).getAttribute('href')).toBe('/new/edit?template=shop&variant=my-pham');
  });
});

describe('a visitor edits, signs up when publishing, and the site is made with what they edited', () => {
  it('goes from the template to a published site in the account, sending nothing before sign-in', async () => {
    // The ad they came from: each tag once, its first value.
    rememberSignUpSource('?utm_source=fb&utm_source=zalo&utm_medium=cpc&utm_campaign=thiep-cuoi');
    renderAt('/new/edit?template=wedding&variant=hoa-pastel');

    // The look's copy, colours and pictures, in the editor and the preview.
    const groom = (await screen.findByLabelText('Tên chú rể')) as HTMLInputElement;
    expect(groom.value).toBe('Huy');
    expect(frame().getAttribute('srcdoc')).toContain('Huy');
    expect(screen.getByRole('status').textContent).toBe('Đã lưu trên máy này');

    fireEvent.change(groom, { target: { value: 'Minh' } });
    fireEvent.change(screen.getByLabelText('Tên cô dâu'), { target: { value: 'Thảo' } });
    await waitFor(() => expect(frame().getAttribute('srcdoc')).toContain('Minh'));

    // A photo of their own replaces the cover: kept in the browser, shown in the preview from a data: URL.
    const coverInput = document.querySelector('[data-id="cover"] input[type="file"]');
    if (!(coverInput instanceof HTMLInputElement)) throw new Error('no cover input');
    fireEvent.change(coverInput, { target: { files: [new File([new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 9])], 'cuoi.jpg', { type: 'image/jpeg' })] } });
    await waitFor(() => expect(frame().getAttribute('srcdoc')).toContain('data:image/jpeg;base64,'));
    expect(frame().getAttribute('srcdoc')).toContain('img-src &#39;self&#39; data:');

    // Publishing checks first: the date and places are still empty.
    fireEvent.click(screen.getByRole('button', { name: 'Đăng website' }));
    expect(await screen.findByRole('alert')).toBeTruthy();
    expect(vi.mocked(leaveTo)).not.toHaveBeenCalled();
    fireEvent.change(screen.getByLabelText('Ngày cưới'), { target: { value: '2027-01-09' } });
    for (const venue of screen.getAllByLabelText('Nơi tổ chức')) fireEvent.change(venue, { target: { value: 'Nhà hàng Hoa Sen' } });

    fireEvent.click(screen.getByRole('button', { name: 'Đăng website' }));
    await waitFor(() => expect(vi.mocked(leaveTo)).toHaveBeenCalledTimes(1));
    const signUp = new URL(vi.mocked(leaveTo).mock.calls[0]?.[0] ?? '', 'https://webnhanh.hoandat.com');
    expect(signUp.pathname).toBe('/auth/login');
    expect(signUp.searchParams.get('signup')).toBe('1');
    expect(signUp.searchParams.get('return')).toBe('/new/publish');
    expect(signUp.searchParams.getAll('utm_source')).toEqual(['fb']);
    expect(signUp.searchParams.get('utm_medium')).toBe('cpc');
    expect(signUp.searchParams.get('utm_campaign')).toBe('thiep-cuoi');
    // Nothing went to the server but the session check.
    expect(calls.filter((call) => call.url !== '/api/me')).toEqual([]);
    expect(FakeXhr.sent).toHaveLength(0);
    cleanup();

    // Back from sign-up: pick the address, then the draft goes into the account once.
    signedIn = true;
    on('POST', '/api/sites', () => ({ status: 201, body: { site: site(), slotImages: { cover: SERVER_COVER, ornament: SERVER_ORNAMENT } } }));
    on('PUT', `/api/sites/${SITE_ID}/draft`, () => ({ status: 204, body: null }));
    on('POST', `/api/sites/${SITE_ID}/publish`, () => ({
      status: 202,
      body: { job: { id: 'j1', siteId: SITE_ID, type: 'publish', status: 'queued', steps: [], error: null, createdAt: NOW, startedAt: null, finishedAt: null } },
    }));
    on('GET', `/api/sites/${SITE_ID}`, () => ({ status: 200, body: { site: site(), draft: null, images: [], usedBytes: 0 } }));
    renderAt('/new/publish');
    const address = await screen.findByLabelText('Địa chỉ website');
    fireEvent.change(address, { target: { value: 'Minh-Thao' } });
    fireEvent.click(screen.getByRole('button', { name: 'Đăng website' }));

    await waitFor(() => expect(calls.some((call) => call.method === 'POST' && call.url === `/api/sites/${SITE_ID}/publish`)).toBe(true));
    expect(calls.find((call) => call.method === 'POST' && call.url === '/api/sites')?.body).toEqual({ name: 'minh-thao', template: 'wedding', variant: 'hoa-pastel' });
    // Their photo uploaded to the new site, once; the look's pictures are the site's own copies.
    expect(FakeXhr.sent).toHaveLength(1);
    expect(calls.filter((call) => call.url === `/api/sites/${SITE_ID}/images`)).toHaveLength(1);
    const saved = calls.find((call) => call.method === 'PUT')?.body as { draft: Record<string, unknown> };
    expect(saved.draft).toMatchObject({ groom: 'Minh', bride: 'Thảo', date: '2027-01-09', cover: UPLOADED, ornaments: [SERVER_ORNAMENT] });
    // Moved: the browser keeps no draft any more.
    await waitFor(() => expect(localStorage.getItem('webnhanh.guest-draft')).toBeNull());
    expect(localStorage.getItem('webnhanh.guest-transfer')).toBeNull();
  });

  it('opens the template fresh when the kept draft cannot be read', async () => {
    localStorage.setItem('webnhanh.guest-draft', '{not json');
    renderAt('/new/edit?template=wedding&variant=hoa-pastel');
    expect(((await screen.findByLabelText('Tên chú rể')) as HTMLInputElement).value).toBe('Huy');
  });

  it('opens again the draft kept in this browser', async () => {
    renderAt('/new/edit?template=wedding&variant=hoa-pastel');
    fireEvent.change(await screen.findByLabelText('Tên chú rể'), { target: { value: 'Quang' } });
    await waitFor(() => expect(localStorage.getItem('webnhanh.guest-draft')).toContain('Quang'));
    cleanup();
    renderAt('/new');
    const notice = await screen.findByText(/bản nháp sửa dở/);
    expect(within(notice).getByRole('link', { name: 'Sửa tiếp' }).getAttribute('href')).toBe('/new/edit');
    cleanup();
    renderAt('/new/edit');
    expect(((await screen.findByLabelText('Tên chú rể')) as HTMLInputElement).value).toBe('Quang');
  });

  it('says when the address is taken and keeps the draft for another try', async () => {
    renderAt('/new/edit?template=wedding&variant=hoa-pastel');
    await screen.findByLabelText('Tên chú rể');
    await waitFor(() => expect(localStorage.getItem('webnhanh.guest-draft')).not.toBeNull());
    cleanup();
    signedIn = true;
    on('POST', '/api/sites', () => ({ status: 409, body: { error: 'name-taken' } }));
    renderAt('/new/publish');
    fireEvent.change(await screen.findByLabelText('Địa chỉ website'), { target: { value: 'minh-thao' } });
    fireEvent.click(screen.getByRole('button', { name: 'Đăng website' }));
    expect((await screen.findByRole('alert')).textContent).toContain('đã có người dùng');
    expect(localStorage.getItem('webnhanh.guest-draft')).not.toBeNull();
  });

  it('asks a visitor who came back without signing up to sign up, carrying where they came from', async () => {
    rememberSignUpSource('?utm_source=tiktok');
    renderAt('/new/publish');
    const cta = await screen.findByRole('link', { name: 'Đăng ký bằng hoandat.com' });
    const url = new URL(cta.getAttribute('href') ?? '', 'https://webnhanh.hoandat.com');
    expect(url.searchParams.get('signup')).toBe('1');
    expect(url.searchParams.get('return')).toBe('/new/publish');
    expect(url.searchParams.get('utm_source')).toBe('tiktok');
  });
});

describe('the visitor draft when things go wrong', () => {
  async function chooseCover(): Promise<void> {
    const coverInput = document.querySelector('[data-id="cover"] input[type="file"]');
    if (!(coverInput instanceof HTMLInputElement)) throw new Error('no cover input');
    fireEvent.change(coverInput, { target: { files: [new File([new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 9])], 'cuoi.jpg', { type: 'image/jpeg' })] } });
    await waitFor(() => expect(frame().getAttribute('srcdoc')).toContain('data:image/jpeg;base64,'));
  }

  function fillRequired(): void {
    fireEvent.change(screen.getByLabelText('Ngày cưới'), { target: { value: '2027-01-09' } });
    for (const venue of screen.getAllByLabelText('Nơi tổ chức')) fireEvent.change(venue, { target: { value: 'Nhà hàng Hoa Sen' } });
  }

  it('deletes no photo when the kept draft cannot be read, nor when another template opens', async () => {
    renderAt('/new/edit?template=wedding&variant=hoa-pastel');
    await screen.findByLabelText('Tên chú rể');
    await chooseCover();
    await waitFor(() => expect(idb.data.size).toBe(1));
    cleanup();
    // Another tab opens another template: the first draft's photo stays.
    renderAt('/new/edit?template=tet&variant=clay-do-vang');
    await waitFor(() => expect(document.querySelector('[data-id="guest-editor"]')).toBeTruthy());
    cleanup();
    localStorage.setItem('webnhanh.guest-draft', '{broken');
    renderAt('/new/edit?template=wedding&variant=vintage');
    await screen.findByLabelText('Tên chú rể');
    expect(idb.data.size).toBe(1);
  });

  it('stops saving and says so when another tab changes the draft', async () => {
    renderAt('/new/edit?template=wedding&variant=hoa-pastel');
    const groom = await screen.findByLabelText('Tên chú rể');
    await waitFor(() => expect(localStorage.getItem('webnhanh.guest-draft')).not.toBeNull());
    const other = '{"v":2,"from":"other tab"}';
    localStorage.setItem('webnhanh.guest-draft', other);
    window.dispatchEvent(new StorageEvent('storage', { key: 'webnhanh.guest-draft', newValue: other }));
    expect((await screen.findByText(/sửa bản nháp ở một tab khác/)).closest('[role="alert"]')).toBeTruthy();
    fireEvent.change(groom, { target: { value: 'Quang' } });
    await new Promise((resolve) => setTimeout(resolve, 600));
    expect(localStorage.getItem('webnhanh.guest-draft')).toBe(other);
    // Keeping this tab's draft saves it again.
    fireEvent.click(screen.getByRole('button', { name: 'Giữ bản ở tab này' }));
    await waitFor(() => expect(localStorage.getItem('webnhanh.guest-draft')).toContain('Quang'));
  });

  it('warns before sign-up when the browser could not keep the draft', async () => {
    renderAt('/new/edit?template=wedding&variant=hoa-pastel');
    await screen.findByLabelText('Tên chú rể');
    idb.failWrites = true;
    await chooseCover();
    fillRequired();
    fireEvent.click(screen.getByRole('button', { name: 'Đăng website' }));
    expect((await screen.findByText(/chưa lưu được bản nháp. Đi đăng ký/)).closest('[role="alert"]')).toBeTruthy();
    expect(vi.mocked(leaveTo)).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: 'Vẫn đi đăng ký' }));
    expect(vi.mocked(leaveTo)).toHaveBeenCalledTimes(1);
  });

  it('renders the preview a moment after typing, not at every key', async () => {
    renderAt('/new/edit?template=wedding&variant=hoa-pastel');
    const groom = await screen.findByLabelText('Tên chú rể');
    fireEvent.change(groom, { target: { value: 'Quang' } });
    expect(frame().getAttribute('srcdoc')).not.toContain('Quang');
    await waitFor(() => expect(frame().getAttribute('srcdoc')).toContain('Quang'));
  });

  it('offers a way out when the site was made but its draft keeps being refused', async () => {
    renderAt('/new/edit?template=wedding&variant=hoa-pastel');
    await screen.findByLabelText('Tên chú rể');
    await waitFor(() => expect(localStorage.getItem('webnhanh.guest-draft')).not.toBeNull());
    cleanup();
    signedIn = true;
    on('POST', '/api/sites', () => ({ status: 201, body: { site: site(), slotImages: { cover: SERVER_COVER, ornament: SERVER_ORNAMENT } } }));
    on('PUT', `/api/sites/${SITE_ID}/draft`, () => ({ status: 400, body: { error: 'invalid-draft' } }));
    renderAt('/new/publish');
    fireEvent.change(await screen.findByLabelText('Địa chỉ website'), { target: { value: 'minh-thao' } });
    fireEvent.click(screen.getByRole('button', { name: 'Đăng website' }));
    // The site is made: the way out shows, and trying again carries on with the same site.
    const escape = await screen.findByText(/Website đã nằm trong tài khoản/);
    const box = escape.closest('[data-id="guest-publish-escape"]');
    if (!(box instanceof HTMLElement)) throw new Error('no way out');
    expect(within(box).getByRole('link', { name: 'Mở website đã tạo' }).getAttribute('href')).toBe(`/sites/${SITE_ID}`);
    fireEvent.click(screen.getByRole('button', { name: 'Tiếp tục đăng' }));
    await waitFor(() => expect(calls.filter((call) => call.method === 'PUT')).toHaveLength(2));
    expect(calls.filter((call) => call.method === 'POST' && call.url === '/api/sites')).toHaveLength(1);
    fireEvent.click(await screen.findByRole('button', { name: 'Làm lại với địa chỉ khác' }));
    expect(await screen.findByLabelText('Địa chỉ website')).toBeTruthy();
    expect(localStorage.getItem('webnhanh.guest-transfer')).toBeNull();
  });
});
