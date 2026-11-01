import { cleanup, render, screen, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { AccountProvider } from '../account';
import { App } from '../app';
import { I18nProvider } from '../i18n';
import { GUIDE_PATHS } from './guide-paths';

/** A visitor: /api/me answers 401. */
function stubSignedOut(): void {
  vi.stubGlobal(
    'fetch',
    vi.fn(async () => new Response(JSON.stringify({ error: 'sign-in-required' }), { status: 401, headers: { 'Content-Type': 'application/json' } })),
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

beforeEach(() => {
  document.cookie = 'hd_lang=vi; Path=/';
  stubSignedOut();
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  document.cookie = 'hd_lang=; Max-Age=0; Path=/';
});

describe('guide pages in the app', () => {
  it('opens the wedding guide with its looks, each leading into /new with that look picked, and sets the tab title', async () => {
    renderAt(GUIDE_PATHS.wedding);
    expect((await screen.findByRole('heading', { level: 1 })).textContent).toBe('Thiệp cưới online miễn phí');
    expect(document.title).toMatch(/^Thiệp cưới online miễn phí/);
    const ctas = screen.getAllByRole('link', { name: 'Chọn mẫu thiệp cưới' });
    expect(ctas.map((link) => link.getAttribute('href'))).toEqual(['/new?template=wedding', '/new?template=wedding']);
    const looks = within(screen.getByRole('region', { name: 'Bốn kiểu thiệp cưới để bắt đầu' })).getAllByRole('link');
    expect(looks).toHaveLength(4);
    expect(looks.map((link) => link.getAttribute('href'))).toContain('/new?template=wedding&variant=truyen-thong');
    const related = within(screen.getByRole('navigation', { name: 'Gợi ý khác' }));
    expect(related.getByRole('link', { name: 'Làm website bán hàng miễn phí' }).getAttribute('href')).toBe(GUIDE_PATHS.shop);
    expect(related.getByRole('link', { name: 'Thiệp Tết 2027 online' }).getAttribute('href')).toBe(GUIDE_PATHS.tet);
  });

  it('keeps the guide in Vietnamese for an English visitor, the frame in English', async () => {
    document.cookie = 'hd_lang=en; Path=/';
    renderAt(GUIDE_PATHS.tet);
    expect((await screen.findByRole('heading', { level: 1 })).textContent).toBe('Thiệp Tết 2027 online');
    expect(document.querySelector('[data-id="guide-tet"]')?.getAttribute('lang')).toBe('vi');
    expect(screen.getByRole('link', { name: 'An app from hoandat.com' })).toBeTruthy();
    expect(screen.getAllByRole('link', { name: 'Chọn mẫu thiệp Tết' })[0]?.getAttribute('href')).toBe('/new?template=tet');
  });

  it('opens the shop guide leading to the shop template', async () => {
    renderAt(`${GUIDE_PATHS.shop}/`);
    expect((await screen.findByRole('heading', { level: 1 })).textContent).toBe('Làm website bán hàng miễn phí trên điện thoại');
    expect(screen.getAllByRole('link', { name: 'Chọn mẫu website bán hàng' })[0]?.getAttribute('href')).toBe('/new?template=shop');
  });

  it('links the landing to the three guides', async () => {
    renderAt('/');
    const ideas = await screen.findByRole('heading', { level: 2, name: 'Bạn đang cần' });
    const section = within(ideas.closest('section') ?? document.body);
    expect(section.getByRole('link', { name: 'Thiệp cưới online miễn phí' }).getAttribute('href')).toBe(GUIDE_PATHS.wedding);
    expect(section.getByRole('link', { name: 'Website bán hàng miễn phí trên điện thoại' }).getAttribute('href')).toBe(GUIDE_PATHS.shop);
    expect(section.getByRole('link', { name: 'Thiệp Tết 2027 online' }).getAttribute('href')).toBe(GUIDE_PATHS.tet);
  });
});
