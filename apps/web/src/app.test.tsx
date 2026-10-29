import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { AccountProvider } from './account';
import { App } from './app';
import { I18nProvider } from './i18n';

/** /api/me answers with this status and body; /api/sites with an empty list. */
function stubMe(status: number, body: unknown): void {
  vi.stubGlobal(
    'fetch',
    vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      const answer = url === '/api/sites' ? { sites: [], limits: { sites: 5, siteBytes: 20971520 } } : body;
      return new Response(JSON.stringify(answer), { status: url === '/api/sites' ? 200 : status, headers: { 'Content-Type': 'application/json' } });
    }),
  );
}

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

// jsdom's browser speaks en-US: start every test from the shared choice of Vietnamese.
beforeEach(() => {
  document.cookie = 'hd_lang=vi; Path=/';
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  document.cookie = 'hd_lang=; Max-Age=0; Path=/';
});

describe('web app', () => {
  it('shows a visitor the landing with the sign-in card, going through the server sign-in', async () => {
    stubMe(401, { error: 'sign-in-required' });
    renderAt('/');
    const cta = await screen.findByRole('link', { name: 'Đăng nhập bằng hoandat.com' });
    expect(cta.getAttribute('href')).toBe('/auth/login?return=%2F&lang=vi');
    expect(screen.getByRole('heading', { level: 1 }).textContent).toBe('Có website riêng mà không cần biết làm web');
    expect(screen.getByText(/App không bao giờ thấy mật khẩu của bạn/)).toBeTruthy();
    // The header's pill leads to /login; the templates' looks fill the wall beside the hero.
    expect(within(screen.getByRole('banner')).getByRole('link', { name: 'Đăng nhập' }).getAttribute('href')).toBe('/login');
    expect(document.querySelectorAll('[data-id="template-wall"] img').length).toBeGreaterThan(0);
  });

  it('frames every page in the app\'s own header and footer: one theme, language in the header, hoandat.com and legal links below', async () => {
    stubMe(401, { error: 'sign-in-required' });
    renderAt('/privacy');
    await screen.findByRole('heading', { level: 1, name: 'Quyền riêng tư' });
    expect(document.querySelector('[data-id="theme-switch"]')).toBeNull();
    expect(screen.getByRole('link', { name: 'Bỏ qua tới nội dung' }).getAttribute('href')).toBe('#main');
    const header = screen.getByRole('banner');
    expect(within(header).getByRole('link', { name: 'Web Nhanh' }).getAttribute('href')).toBe('/');
    expect(within(header).getByRole('button', { name: 'Tiếng Việt' }).getAttribute('aria-pressed')).toBe('true');
    expect(within(header).getByRole('button', { name: 'English' }).getAttribute('aria-pressed')).toBe('false');
    const footer = within(screen.getByRole('contentinfo'));
    expect(footer.getByRole('link', { name: 'Một app của hoandat.com' }).getAttribute('href')).toBe('https://hoandat.com');
    expect(footer.getByRole('link', { name: 'Quyền riêng tư' }).getAttribute('aria-current')).toBe('page');
    expect(footer.getByRole('link', { name: 'Điều khoản' }).getAttribute('href')).toBe('/terms');
  });

  it('switches the language from the header and keeps it for the other hoandat.com apps', async () => {
    stubMe(401, { error: 'sign-in-required' });
    renderAt('/');
    // The landing replaces the frame shown while the session check runs: switch once it is there.
    await screen.findByRole('link', { name: 'Đăng nhập bằng hoandat.com' });
    fireEvent.click(screen.getByRole('button', { name: 'English' }));
    expect(await screen.findByText('Your own website, no web skills needed')).toBeTruthy();
    expect(document.cookie).toContain('hd_lang=en');
    expect(screen.getByRole('link', { name: 'An app from hoandat.com' })).toBeTruthy();
    expect(screen.getByRole('link', { name: 'Sign in with hoandat.com' }).getAttribute('href')).toBe('/auth/login?return=%2F&lang=en');
    expect(document.documentElement.lang).toBe('en');
  });

  it('tells why the last sign-in came back', async () => {
    stubMe(401, { error: 'sign-in-required' });
    renderAt('/login?login=unavailable');
    expect((await screen.findByRole('status')).textContent).toContain('Đăng nhập tạm thời chưa dùng được');
  });

  it('shows a signed-in account without pages the way to make one, with the account menu in the header', async () => {
    const picture = 'https://lh3.googleusercontent.com/a/lan';
    stubMe(200, { account: { id: 'a1', createdAt: '2026-10-28T03:00:00.000Z', name: 'Lan Anh', email: 'lan@example.com', picture } });
    renderAt('/');
    expect(await screen.findByText('Bạn chưa có website nào')).toBeTruthy();
    expect(screen.getByRole('link', { name: 'Tạo website mới' }).getAttribute('href')).toBe('/new');
    const header = screen.getByRole('banner');
    const menu = header.querySelector('[data-id="account-menu"]');
    expect(header.querySelector('[data-id="topbar-account"]')?.getAttribute('aria-label')).toBe('Lan Anh · Tài khoản');
    expect(header.querySelector('.shell-avatar')?.getAttribute('src')).toBe(picture);
    expect(menu?.textContent).toContain('lan@example.com');
    // Not an admin: the menu has the hoandat.com account pages and sign-out, no admin tools.
    expect(menu?.querySelector('[data-id="account-menu-admin"]')).toBeNull();
    expect(menu?.querySelector('[data-id="account-menu-idp-email"]')?.getAttribute('href')).toBe('https://auth.hoandat.com/account#account-email');
    expect(within(header).getByRole('button', { name: 'Đăng xuất' }).getAttribute('data-id')).toBe('account-menu-sign-out');
    expect(screen.queryByRole('link', { name: 'Đăng nhập bằng hoandat.com' })).toBeNull();
    expect(screen.queryByRole('link', { name: 'Đăng nhập' })).toBeNull();
  });

  it('names an account the IdP told nothing about "Tài khoản", lists the admin tools for admins and signs out from the menu', async () => {
    stubMe(200, { account: { id: 'a1', createdAt: '2026-10-28T03:00:00.000Z', admin: true } });
    renderAt('/');
    expect(await screen.findByText('Bạn chưa có website nào')).toBeTruthy();
    const header = screen.getByRole('banner');
    expect(header.querySelector('[data-id="topbar-account"]')?.getAttribute('aria-label')).toBe('Tài khoản · Tài khoản');
    expect(header.querySelector('img.shell-avatar')).toBeNull();
    expect(within(header).getByRole('link', { name: 'Quản trị' }).getAttribute('href')).toBe('/admin');
    fireEvent.click(within(header).getByRole('button', { name: 'Đăng xuất' }));
    expect(await screen.findByRole('link', { name: 'Đăng nhập bằng hoandat.com' })).toBeTruthy();
    const calls = vi.mocked(fetch).mock.calls.map(([input, init]) => `${init?.method ?? 'GET'} ${String(input)}`);
    expect(calls).toContain('POST /auth/logout');
  });

  it('names the templates\' fonts with their licence and who owns the pictures, to anyone', async () => {
    stubMe(401, { error: 'sign-in-required' });
    renderAt('/credits');
    expect(await screen.findByRole('heading', { level: 1, name: 'Nguồn phông chữ và ảnh' })).toBeTruthy();
    const fonts = [...document.querySelectorAll('[data-id="credits-fonts"] li')].map((item) => item.textContent);
    expect(fonts).toEqual(['Bricolage Grotesque', 'Be Vietnam Pro', 'Newsreader', 'Baloo 2', 'Nunito', 'Inter'].map((family) => `${family} (SIL Open Font License 1.1)`));
    expect(screen.getByText(/Ảnh thuộc về hoandat.com, giữ mọi quyền/)).toBeTruthy();
  });

  it('speaks English when the shared choice is English', async () => {
    document.cookie = 'hd_lang=en; Path=/';
    stubMe(401, { error: 'sign-in-required' });
    renderAt('/');
    expect(await screen.findByText('Your own website, no web skills needed')).toBeTruthy();
  });
});
