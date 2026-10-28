import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { AccountProvider } from './account';
import { App } from './app';
import { I18nProvider } from './i18n';

const SITE_ID = '11111111-1111-4111-8111-111111111111';
const ORDER_ID = '55555555-5555-4555-8555-555555555555';
const NOW = '2026-10-28T03:00:00.000Z';

const order = { id: ORDER_ID, kind: 'order', createdAt: NOW, handledAt: null, name: '<b>Lan</b>', phone: '0912345678', address: '12 Lý Thường Kiệt', product: 'Bánh tráng', quantity: 2, note: 'Ít cay' };

type Answer = { status: number; body: unknown };
let routes: Map<string, (body: unknown) => Answer>;
let calls: { method: string; url: string; body: unknown }[];

function json(status: number, body: unknown): Response {
  return new Response(status === 204 ? null : JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });
}

beforeEach(() => {
  document.cookie = 'hd_lang=vi; Path=/';
  calls = [];
  routes = new Map<string, (body: unknown) => Answer>([
    ['GET /api/me', () => ({ status: 200, body: { account: { id: 'a1', createdAt: NOW } } })],
    [`GET /api/sites/${SITE_ID}/orders`, () => ({ status: 200, body: { site: { name: 'tiem-bo', template: 'shop', published: true }, orders: [order], more: false, open: 1, rsvp: null } })],
    [`PATCH /api/sites/${SITE_ID}/orders/${ORDER_ID}`, () => ({ status: 200, body: { order: { ...order, handledAt: NOW } } })],
    ['GET /api/notifications', () => ({ status: 200, body: { push: null, chat: { linked: false } } })],
  ]);
  vi.stubGlobal(
    'fetch',
    vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const method = init?.method ?? 'GET';
      const url = String(input);
      const body: unknown = typeof init?.body === 'string' ? JSON.parse(init.body) : undefined;
      calls.push({ method, url, body });
      const handler = routes.get(`${method} ${url}`);
      if (!handler) return json(404, { error: 'not-found' });
      const answer = handler(body);
      return json(answer.status, answer.body);
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

describe('order inbox', () => {
  it('shows the open orders as text, and marks one handled', async () => {
    renderAt(`/sites/${SITE_ID}/orders`);
    expect(await screen.findByText('<b>Lan</b>')).toBeTruthy();
    expect(screen.getByText('Bánh tráng × 2')).toBeTruthy();
    expect(screen.getByText('tiem-bo.hoandat.io.vn')).toBeTruthy();
    expect(screen.getByText('Chưa xử lý (1)')).toBeTruthy();
    expect(document.querySelector('a[href="tel:0912345678"]')).not.toBeNull();

    fireEvent.click(screen.getByText('Đánh dấu đã xử lý'));
    await waitFor(() => expect(screen.queryByText('<b>Lan</b>')).toBeNull());
    expect(calls.find((c) => c.method === 'PATCH')?.body).toEqual({ handled: true });
    expect(screen.getByText('Chưa xử lý (0)')).toBeTruthy();
  });

  it('offers only the channels the server has: Chat here, no push', async () => {
    renderAt(`/sites/${SITE_ID}/orders`);
    expect(await screen.findByText('Nhận báo đơn qua Chat')).toBeTruthy();
    expect(screen.queryByText('Thông báo trên máy này')).toBeNull();
  });

  it('hides the Chat button when the bot is not set up', async () => {
    routes.set('GET /api/notifications', () => ({ status: 200, body: { push: null, chat: null } }));
    renderAt(`/sites/${SITE_ID}/orders`);
    expect(await screen.findByText('<b>Lan</b>')).toBeTruthy();
    await waitFor(() => expect(calls.some((c) => c.url === '/api/notifications')).toBe(true));
    expect(screen.queryByText('Nhận báo đơn qua Chat')).toBeNull();
  });
});

describe('reply inbox of a wedding', () => {
  const reply = { id: ORDER_ID, kind: 'rsvp', createdAt: NOW, handledAt: null, name: 'Hà', phone: '', attending: 'yes', guests: 3, note: 'Chúc mừng!' };

  it('words the inbox for replies, counts the guests, and marks one seen', async () => {
    routes.set(`GET /api/sites/${SITE_ID}/orders`, () => ({
      status: 200,
      body: { site: { name: 'minh-thao', template: 'wedding', published: true }, orders: [reply], more: false, open: 1, rsvp: { yes: 1, guests: 3, no: 2 } },
    }));
    routes.set(`PATCH /api/sites/${SITE_ID}/orders/${ORDER_ID}`, () => ({ status: 200, body: { order: { ...reply, handledAt: NOW } } }));
    renderAt(`/sites/${SITE_ID}/orders`);
    expect(await screen.findByRole('heading', { name: 'Xác nhận tham dự', level: 1 })).toBeTruthy();
    expect(screen.getByText('Sẽ đến · 3 người')).toBeTruthy();
    expect(screen.getByText('1 khách sẽ đến · 3 người')).toBeTruthy();
    expect(screen.getByText('2 khách không đến được')).toBeTruthy();
    expect(screen.getByText('Chúc mừng!')).toBeTruthy();
    // No phone given: no call link; no address for a reply.
    expect(document.querySelector('a[href^="tel:"]')).toBeNull();
    expect(screen.queryByText('Địa chỉ')).toBeNull();
    expect(await screen.findByText('Báo khi có người xác nhận')).toBeTruthy();
    fireEvent.click(screen.getByText('Đánh dấu đã xem'));
    await waitFor(() => expect(screen.queryByText('Hà')).toBeNull());
  });

  it('shows new replies on the wedding card, with a link named for them', async () => {
    const site = { id: SITE_ID, name: 'minh-thao', kind: 'template', template: 'wedding', status: 'published', published: true, createdAt: NOW, updatedAt: NOW, cover: null, job: null, newOrders: 2 };
    const card = { ...site, id: '66666666-6666-4666-8666-666666666666', name: 'lan-anh', template: 'profile', newOrders: 0 };
    routes.set('GET /api/sites', () => ({ status: 200, body: { sites: [site, card], limits: { sites: 5, siteBytes: 1 } } }));
    renderAt('/');
    expect(await screen.findByText('2 xác nhận mới')).toBeTruthy();
    expect(document.querySelector(`a[href="/sites/${SITE_ID}/orders"]`)?.textContent).toBe('Xác nhận tham dự');
    // A profile page takes nothing in: no inbox link.
    expect(document.querySelector('a[href="/sites/66666666-6666-4666-8666-666666666666/orders"]')).toBeNull();
  });
});

describe('home badge', () => {
  it('shows new orders on the site card with a link to the inbox', async () => {
    const site = { id: SITE_ID, name: 'tiem-bo', template: 'shop', status: 'published', published: true, createdAt: NOW, updatedAt: NOW, cover: null, job: null, newOrders: 3 };
    routes.set('GET /api/sites', () => ({ status: 200, body: { sites: [site], limits: { sites: 5, siteBytes: 1 } } }));
    renderAt('/');
    expect(await screen.findByText('3 đơn mới')).toBeTruthy();
    expect(document.querySelector(`a[href="/sites/${SITE_ID}/orders"]`)?.textContent).toBe('Đơn hàng');
  });
});
