import { cleanup, render, screen } from '@testing-library/react';
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
  it('shows a visitor the landing with the shared sign-in card, going through the server sign-in', async () => {
    stubMe(401, { error: 'sign-in-required' });
    renderAt('/');
    const cta = await screen.findByRole('link', { name: 'Đăng nhập bằng hoandat.com' });
    expect(cta.getAttribute('href')).toBe('/auth/login?return=%2F&lang=vi');
    expect(screen.getByRole('heading', { level: 1 }).textContent).toBe('Có trang web riêng mà không cần biết làm web');
    expect(document.querySelector('[data-id="theme-switch"]')).not.toBeNull();
    expect(document.querySelector('[data-id="lang-en"]')).not.toBeNull();
  });

  it('tells why the last sign-in came back', async () => {
    stubMe(401, { error: 'sign-in-required' });
    renderAt('/login?login=unavailable');
    expect((await screen.findByRole('status')).textContent).toContain('Đăng nhập tạm thời chưa dùng được');
  });

  it('shows a signed-in account without pages the way to make one, with sign-out', async () => {
    stubMe(200, { account: { id: 'a1', createdAt: '2026-10-28T03:00:00.000Z' } });
    renderAt('/');
    expect(await screen.findByText('Bạn chưa có trang nào')).toBeTruthy();
    expect(screen.getByRole('link', { name: 'Tạo trang mới' }).getAttribute('href')).toBe('/new');
    expect(screen.getByRole('button', { name: 'Đăng xuất' })).toBeTruthy();
    expect(screen.queryByRole('link', { name: 'Đăng nhập bằng hoandat.com' })).toBeNull();
  });

  it('speaks English when the shared choice is English', async () => {
    document.cookie = 'hd_lang=en; Path=/';
    stubMe(401, { error: 'sign-in-required' });
    renderAt('/');
    expect(await screen.findByText('Your own web page, no web skills needed')).toBeTruthy();
  });
});
