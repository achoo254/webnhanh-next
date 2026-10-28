import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import type { ReactElement } from 'react';
import { MemoryRouter } from 'react-router';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { AccountProvider } from './account';
import { App } from './app';
import type { Build, BuildDetail, BuildSettings } from './builds-api';
import { BuildProgressView } from './deploy/build-progress';
import { SettingsPanel } from './deploy/settings-form';
import { ApiError } from './api';
import { I18nProvider } from './i18n';

const SITE_ID = '11111111-1111-4111-8111-111111111111';
const BUILD_ID = '55555555-5555-4555-8555-555555555555';
const T0 = Date.parse('2026-10-28T03:00:00.000Z');
const at = (s: number): string => new Date(T0 + s * 1000).toISOString();

function build(overrides: Partial<Build> = {}): Build {
  return {
    id: BUILD_ID,
    siteId: SITE_ID,
    status: 'running',
    phase: 'building',
    trigger: 'manual',
    commitSha: 'c'.repeat(40),
    framework: 'vite',
    steps: [
      { name: 'fetch', startedAt: at(12), finishedAt: at(15) },
      { name: 'install', startedAt: at(15), finishedAt: at(15), note: 'cached' },
      { name: 'build', startedAt: at(15) },
    ],
    progress: { code: 'build-modules', n: 38 },
    error: null,
    errorLines: [],
    report: null,
    notify: false,
    createdAt: at(0),
    startedAt: at(12),
    finishedAt: null,
    ...overrides,
  };
}

function detail(overrides: Partial<BuildDetail> = {}, b: Partial<Build> = {}): BuildDetail {
  return { build: build(b), siteName: 'shop', estimate: { ms: 80_000, basis: 'site' }, queue: null, previousMs: null, ...overrides };
}

function show(value: BuildDetail, now = T0 + 40_000): void {
  render(
    <I18nProvider>
      <BuildProgressView detail={value} lines={['> vite build', '✓ 38 modules transformed.']} now={now} logUrl="/log" onChange={() => undefined} />
    </I18nProvider>,
  );
}

type Handler = (init: RequestInit | undefined) => { status: number; body: unknown };
let routes: Map<string, Handler>;
let calls: { method: string; url: string; body: unknown }[];

const json = (status: number, body: unknown): Response => new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });
const on = (method: string, url: string, handler: Handler): void => {
  routes.set(`${method} ${url}`, handler);
};

beforeEach(() => {
  document.cookie = 'hd_lang=vi; Path=/';
  routes = new Map();
  calls = [];
  on('GET', '/api/me', () => ({ status: 200, body: { account: { id: 'a1', createdAt: at(0) } } }));
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
  vi.unstubAllGlobals();
  document.cookie = 'hd_lang=; Max-Age=0; Path=/';
});

describe('the waiting screen', () => {
  it('names each step with its real time, the queue first, says what is happening and what to expect', () => {
    show(detail());
    expect(screen.getByText('Xếp hàng').parentElement?.textContent).toContain('12 giây');
    expect(screen.getByText('Lấy mã').parentElement?.textContent).toContain('3 giây');
    expect(screen.getByText(/dùng lại/)).toBeTruthy();
    expect(screen.getByText('Build').closest('li')?.className).toContain('step-now');
    expect(screen.getByText('Build').closest('li')?.textContent).toContain('25 giây');
    expect(screen.getByText('Phát hành').closest('li')?.className).toContain('step-todo');
    expect(screen.getByText('Đang build 38 file…')).toBeTruthy();
    expect(screen.getByText(/Dự kiến khoảng 1 phút 20 giây/)).toBeTruthy();
    expect(screen.getByText(/các lần build trước của site này/)).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Báo tôi khi xong' })).toBeTruthy();
    // The log is there, folded, and can be downloaded.
    expect(screen.getByText('Log đầy đủ').closest('details')?.open).toBe(false);
    expect(screen.getByRole('link', { name: 'Tải log' }).getAttribute('href')).toBe('/log');
  });

  it('says plainly when it takes longer than usual, and where a waiting build stands', () => {
    show(detail(), T0 + 200_000);
    expect(screen.getByText(/Lâu hơn thường lệ/)).toBeTruthy();
    cleanup();
    show(detail({ queue: { position: 2, startsAt: at(300) }, estimate: { ms: 75_000, basis: 'default' } }, { status: 'queued', startedAt: null, steps: [] }));
    expect(screen.getByText('Có 2 build đang chờ trước bạn')).toBeTruthy();
    expect(screen.getByText(/Dự kiến bắt đầu lúc/)).toBeTruthy();
    expect(screen.getByText(/ước lượng ban đầu cho Vite/)).toBeTruthy();
  });

  it('explains a failure with the log lines that show it, and that the old site still runs', () => {
    show(detail({}, { status: 'failed', error: 'build-failed', errorLines: ["src/App.tsx(3,1): error TS2304: Cannot find name 'x'."], finishedAt: at(60), progress: null }));
    expect(screen.getByRole('alert').textContent).toContain('Lệnh build báo lỗi');
    expect(screen.getByText(/error TS2304/)).toBeTruthy();
    expect(screen.getByText('Site cũ vẫn chạy bình thường.')).toBeTruthy();
    expect(screen.getByText('Build').closest('li')?.className).toContain('step-failed');
    expect(screen.queryByRole('button', { name: 'Báo tôi khi xong' })).toBeNull();
  });

  it('turns an unsupported project into its notes', () => {
    show(detail({}, { status: 'failed', error: 'unsupported', errorLines: ['next-needs-export'], finishedAt: at(20) }));
    expect(screen.getByText(/output: 'export'/)).toBeTruthy();
  });

  it('celebrates a published build with the link, its time and the time before', () => {
    const steps = ['fetch', 'install', 'build', 'check', 'publish'].map((name, i) => ({ name, startedAt: at(12 + i * 10), finishedAt: at(22 + i * 10) }));
    show(detail({ previousMs: 70_000 }, { status: 'done', steps, finishedAt: at(62), progress: null, report: { title: 'Shop', hasDescription: true, ogImage: null, hasOgImage: false, hasFavicon: true, largeImages: [], bytes: 1, fileCount: 1 } }));
    expect(screen.getByText('Đã đăng!')).toBeTruthy();
    expect(screen.getByRole('link', { name: 'Xem như khách' }).getAttribute('href')).toBe('https://shop.hoandat.io.vn/');
    expect(screen.getByText(/Build mất 50 giây\. Nhanh hơn lần trước 20 giây\./)).toBeTruthy();
  });
});

describe('deploying from a repo', () => {
  const detection = { framework: 'vite', packageManager: 'pnpm', installDir: '', lockfile: 'pnpm-lock.yaml', buildCommand: 'pnpm run build', outputDir: 'dist', supported: true, warnings: [] };
  const developer = { source: 'git', repoUrl: 'https://github.com/acme/shop', branch: 'main', settings: { rootDir: '', buildCommand: 'pnpm run build', outputDir: 'dist' }, detection, webhook: { url: `https://app/hooks/git/${SITE_ID}`, secret: 's3cret' }, hasZip: false, pendingPushAt: null };

  it('checks the repo, shows what will run, then creates the site and follows its first build', async () => {
    on('POST', '/api/developer/check', () => ({ status: 200, body: { repo: { url: 'https://github.com/acme/shop', branch: 'main', commit: 'c'.repeat(40) }, detection, settings: developer.settings } }));
    on('POST', '/api/developer/sites', () => ({ status: 201, body: { site: { id: SITE_ID } } }));
    on('POST', `/api/sites/${SITE_ID}/builds`, () => ({ status: 202, body: detail({ queue: { position: 0, startsAt: at(5) } }, { status: 'queued', startedAt: null, steps: [] }) }));
    on('GET', `/api/sites/${SITE_ID}/builds`, () => ({
      status: 200,
      body: { site: { id: SITE_ID, name: 'shop', published: false, status: 'draft' }, developer, builds: [build({ status: 'queued', steps: [], startedAt: null })], estimate: { ms: 75_000, basis: 'default' }, limits: { buildMinutesPerDay: 60, usedMinutesToday: 12, developerSites: 3 } },
    }));
    on('GET', `/api/builds/${BUILD_ID}`, () => ({ status: 200, body: detail() }));

    render(
      <I18nProvider>
        <AccountProvider>
          <MemoryRouter initialEntries={['/new/developer']}>
            <App />
          </MemoryRouter>
        </AccountProvider>
      </I18nProvider>,
    );
    fireEvent.change(await screen.findByLabelText('Link repo công khai'), { target: { value: 'https://github.com/acme/shop' } });
    fireEvent.click(screen.getByRole('button', { name: 'Kiểm tra repo' }));
    expect(await screen.findByText('Nhận ra: Vite, cài thư viện bằng pnpm')).toBeTruthy();
    expect(screen.getByText('Sẽ chạy pnpm run build, lấy thư mục dist')).toBeTruthy();
    expect((screen.getByLabelText('Địa chỉ website') as HTMLInputElement).value).toBe('shop');

    fireEvent.change(screen.getByLabelText('Thư mục output'), { target: { value: 'build' } });
    fireEvent.click(screen.getByRole('button', { name: 'Tạo và build' }));
    await waitFor(() => expect(calls.some((c) => c.method === 'POST' && c.url === `/api/sites/${SITE_ID}/builds`)).toBe(true));
    const created = calls.find((c) => c.url === '/api/developer/sites');
    expect(created?.body).toMatchObject({ name: 'shop', source: 'git', branch: 'main', settings: { outputDir: 'build' } });
    expect(await screen.findByText('Đang build 38 file…')).toBeTruthy();
    expect(screen.getByText('Hôm nay đã dùng 12/60 phút build.')).toBeTruthy();
    expect(screen.getByText(`https://app/hooks/git/${SITE_ID}`)).toBeTruthy();
    expect(screen.queryByText('s3cret')).toBeNull();
  });

  it('suggests the app folders of a monorepo and checks again for the one picked', async () => {
    const atRoot = { ...detection, framework: 'other', warnings: ['unknown-framework'], apps: [{ dir: 'apps/site', framework: 'astro' }, { dir: 'apps/editor', framework: 'vite' }] };
    const inSite = { ...detection, framework: 'astro', apps: [] };
    on('POST', '/api/developer/check', (init) => {
      const { rootDir } = JSON.parse(String(init?.body)) as { rootDir: string };
      const found = rootDir === 'apps/site' ? inSite : atRoot;
      return { status: 200, body: { repo: { url: 'https://github.com/acme/lop-2', branch: 'main', commit: 'c'.repeat(40) }, detection: found, settings: { rootDir, buildCommand: 'pnpm run build', outputDir: 'dist' } } };
    });
    render(
      <I18nProvider>
        <AccountProvider>
          <MemoryRouter initialEntries={['/new/developer']}>
            <App />
          </MemoryRouter>
        </AccountProvider>
      </I18nProvider>,
    );
    fireEvent.change(await screen.findByLabelText('Link repo công khai'), { target: { value: 'https://github.com/acme/lop-2' } });
    fireEvent.click(screen.getByRole('button', { name: 'Kiểm tra repo' }));
    expect(await screen.findByText('Đây là monorepo, có 2 app nhận ra được framework. Chọn thư mục của app:')).toBeTruthy();
    expect(screen.getByText(/Chưa nhận ra framework ở thư mục này/)).toBeTruthy();
    const choices = screen.getAllByRole('button', { name: /^Dùng / }).map((button) => button.textContent);
    expect(choices).toEqual(['Dùng apps/site (Astro)', 'Dùng apps/editor (Vite)']);

    fireEvent.click(screen.getByRole('button', { name: 'Dùng apps/site (Astro)' }));
    expect(await screen.findByText('Nhận ra: Astro, cài thư viện bằng pnpm')).toBeTruthy();
    const checks = calls.filter((c) => c.url === '/api/developer/check');
    expect(checks.map((c) => (c.body as { rootDir: string }).rootDir)).toEqual(['', 'apps/site']);
    expect(screen.getAllByLabelText('Thư mục của app trong repo').map((input) => (input as HTMLInputElement).value)).toEqual(['apps/site', 'apps/site']);
    expect(screen.queryByText(/Đây là monorepo/)).toBeNull();
  });

  it('says why a repo cannot be used', async () => {
    on('POST', '/api/developer/check', () => ({ status: 404, body: { error: 'repo-not-found' } }));
    render(
      <I18nProvider>
        <AccountProvider>
          <MemoryRouter initialEntries={['/new/developer']}>
            <App />
          </MemoryRouter>
        </AccountProvider>
      </I18nProvider>,
    );
    fireEvent.change(await screen.findByLabelText('Link repo công khai'), { target: { value: 'https://github.com/acme/secret' } });
    fireEvent.click(screen.getByRole('button', { name: 'Kiểm tra repo' }));
    expect((await screen.findByRole('alert')).textContent).toContain('riêng tư');
  });
});

describe('the build settings of a site', () => {
  const recognized: BuildSettings = { rootDir: '', buildCommand: 'npm run build', outputDir: 'dist' };

  function settings(onSave: (value: BuildSettings) => Promise<BuildSettings>): void {
    render(
      <I18nProvider>
        <SettingsPanel initial={recognized} defaults={recognized} onSave={onSave} />
      </I18nProvider>,
    );
  }

  it('tells recognized values from changed ones, saves only a change, and can undo it', async () => {
    const onSave = vi.fn(async (value: BuildSettings): Promise<BuildSettings> => ({ ...value, outputDir: value.outputDir.trim() }));
    settings(onSave);
    const save = screen.getByRole('button', { name: 'Lưu cách build' }) as HTMLButtonElement;
    expect(save.disabled).toBe(true);
    expect(screen.getAllByText('Tự nhận')).toHaveLength(3);

    fireEvent.change(screen.getByLabelText('Thư mục output'), { target: { value: 'build' } });
    expect(screen.getByText('Đã sửa')).toBeTruthy();
    expect(screen.getByText('Giá trị tự nhận: dist')).toBeTruthy();
    expect(screen.getByText('Có thay đổi chưa lưu.')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Hoàn tác' }));
    expect((screen.getByLabelText('Thư mục output') as HTMLInputElement).value).toBe('dist');
    expect(save.disabled).toBe(true);

    fireEvent.change(screen.getByLabelText('Thư mục output'), { target: { value: 'build' } });
    fireEvent.click(save);
    expect(await screen.findByText('Đã lưu. Áp dụng từ lần build sau.')).toBeTruthy();
    expect(onSave).toHaveBeenCalledWith({ ...recognized, outputDir: 'build' });
    expect(save.disabled).toBe(true);
  });

  it('shows a mistake at its field and does not send it', async () => {
    const onSave = vi.fn(async (value: BuildSettings): Promise<BuildSettings> => value);
    settings(onSave);
    const output = screen.getByLabelText('Thư mục output');
    fireEvent.change(output, { target: { value: '../secret' } });
    // Not while typing: once the field is left.
    expect(output.getAttribute('aria-invalid')).toBeNull();
    fireEvent.blur(output);
    expect(output.getAttribute('aria-invalid')).toBe('true');
    expect(screen.getByText(/Đường dẫn tương đối trong project/)).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Lưu cách build' }));
    expect((await screen.findByRole('alert')).textContent).toContain('sửa các ô báo lỗi');
    expect(onSave).not.toHaveBeenCalled();
    expect(document.activeElement).toBe(output);
  });

  it('follows settings the server changed, without dropping a change being typed', () => {
    const view = (initial: BuildSettings): ReactElement => (
      <I18nProvider>
        <SettingsPanel initial={initial} defaults={recognized} onSave={async (value) => value} />
      </I18nProvider>
    );
    const { rerender } = render(view({ ...recognized, outputDir: 'out' }));
    const output = (): HTMLInputElement => screen.getByLabelText('Thư mục output');
    expect(output().value).toBe('out');
    // A new zip before the first build: the server goes back to what it finds.
    rerender(view(recognized));
    expect(output().value).toBe('dist');
    expect(screen.queryByText('Có thay đổi chưa lưu.')).toBeNull();
    // While the developer types, a change from the server becomes the saved value; the typing stays.
    fireEvent.change(screen.getByLabelText('Lệnh build'), { target: { value: 'pnpm build' } });
    rerender(view({ ...recognized, outputDir: 'public' }));
    expect((screen.getByLabelText('Lệnh build') as HTMLInputElement).value).toBe('pnpm build');
    expect(screen.getByText('Có thay đổi chưa lưu.')).toBeTruthy();
  });

  it("puts the server's refusal at the field it names", async () => {
    settings(async () => {
      throw new ApiError(400, 'build-settings', ['build-command']);
    });
    fireEvent.change(screen.getByLabelText('Lệnh build'), { target: { value: 'npm run build:prod' } });
    fireEvent.click(screen.getByRole('button', { name: 'Lưu cách build' }));
    await waitFor(() => expect(screen.getByLabelText('Lệnh build').getAttribute('aria-invalid')).toBe('true'));
    expect(screen.getByText('Lệnh build chỉ một dòng, tối đa 300 ký tự.')).toBeTruthy();
  });
});
