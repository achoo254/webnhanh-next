import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { AccountProvider } from './account';
import { App } from './app';
import { I18nProvider } from './i18n';

type Handler = (init: RequestInit | undefined) => { status: number; body: unknown };

/** fetch answering `METHOD path` from `routes` (404 otherwise); every call is recorded. */
function stubFetch(routes: Record<string, Handler>): { calls: { key: string; body: unknown }[] } {
  const calls: { key: string; body: unknown }[] = [];
  vi.stubGlobal(
    'fetch',
    vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const key = `${init?.method ?? 'GET'} ${String(input)}`;
      calls.push({ key, body: typeof init?.body === 'string' ? JSON.parse(init.body) : null });
      const answer = routes[key]?.(init) ?? { status: 404, body: { error: 'not-found' } };
      return new Response(JSON.stringify(answer.body), { status: answer.status, headers: { 'Content-Type': 'application/json' } });
    }),
  );
  return { calls };
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
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  document.cookie = 'hd_lang=; Max-Age=0; Path=/';
});

describe('the report page', () => {
  it('sends a report without sign-in, with the site from the link, and offers the mailbox instead', async () => {
    const { calls } = stubFetch({
      'GET /api/me': () => ({ status: 401, body: { error: 'sign-in-required' } }),
      'POST /api/reports': () => ({ status: 201, body: { ok: true } }),
    });
    renderAt('/bao-cao?site=lua-dao');
    expect(await screen.findByRole('heading', { level: 1, name: 'Báo cáo vi phạm' })).toBeTruthy();
    expect(screen.getByRole('link', { name: 'noreply@hoandat.io.vn' }).getAttribute('href')).toBe('mailto:noreply@hoandat.io.vn');
    const site = screen.getByLabelText('Địa chỉ website');
    expect((site as HTMLInputElement).value).toBe('lua-dao');

    fireEvent.click(screen.getByRole('button', { name: 'Gửi báo cáo' }));
    expect((await screen.findByRole('alert')).textContent).toContain('chọn loại vi phạm');
    expect(calls.some((call) => call.key === 'POST /api/reports')).toBe(false);

    fireEvent.change(screen.getByLabelText('Loại vi phạm'), { target: { value: 'scam' } });
    fireEvent.change(screen.getByLabelText('Mô tả'), { target: { value: 'Trang giả ngân hàng hỏi mật khẩu' } });
    fireEvent.click(screen.getByRole('button', { name: 'Gửi báo cáo' }));
    expect((await screen.findByRole('status')).textContent).toContain('Đã gửi báo cáo');
    const sent = calls.find((call) => call.key === 'POST /api/reports');
    expect(sent?.body).toMatchObject({ site: 'lua-dao', category: 'scam', details: 'Trang giả ngân hàng hỏi mật khẩu', website: '' });
  });
});

describe('the admin tools', () => {
  it('are not found for an account that is not an admin', async () => {
    stubFetch({ 'GET /api/me': () => ({ status: 200, body: { account: { id: 'a1', createdAt: '2026-10-28T03:00:00.000Z', admin: false, locked: false } } }) });
    renderAt('/admin');
    expect(await screen.findByRole('heading', { level: 1, name: 'Không có trang này' })).toBeTruthy();
  });

  it('list reports for an admin and take a site down from one', async () => {
    const site = { id: 's1', name: 'lua-dao', kind: 'template', template: 'shop', status: 'published', published: true, accountId: 'a2', accountLocked: false, takenDownAt: null, review: null, actionQueued: false };
    const report = { id: 'r1', siteName: 'lua-dao', category: 'scam', details: 'Giả mạo', contact: null, status: 'open', createdAt: '2026-10-28T03:00:00.000Z', handledAt: null, site };
    const { calls } = stubFetch({
      'GET /api/me': () => ({ status: 200, body: { account: { id: 'admin1', createdAt: '2026-10-28T03:00:00.000Z', admin: true, locked: false } } }),
      'GET /api/admin/reports?status=open': () => ({ status: 200, body: { reports: [report] } }),
      'GET /api/admin/reviews': () => ({ status: 200, body: { sites: [] } }),
      'GET /api/admin/actions': () => ({ status: 200, body: { actions: [] } }),
      'POST /api/admin/sites/s1/takedown': () => ({
        status: 202,
        body: { action: { id: 'x', action: 'takedown', adminAccountId: 'admin1', siteId: 's1', siteName: 'lua-dao', accountId: 'a2', reportId: 'r1', note: null, status: 'queued', error: null, createdAt: '2026-10-28T03:00:00.000Z', finishedAt: null } },
      }),
    });
    vi.stubGlobal('confirm', () => true);
    renderAt('/admin');
    expect(await screen.findByText('Giả mạo')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Gỡ website' }));
    await waitFor(() => expect(calls.some((call) => call.key === 'POST /api/admin/sites/s1/takedown')).toBe(true));
    expect(calls.find((call) => call.key === 'POST /api/admin/sites/s1/takedown')?.body).toEqual({ note: '', reportId: 'r1' });
  });
});
