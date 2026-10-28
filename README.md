# trang-next

**Trang Của Tôi** (`trang.hoandat.com`): tạo trang web và đăng ra `https://<tên>.hoandat.io.vn`. Người không rành kỹ
thuật chọn mẫu và điền form; lập trình viên gán link git công khai hoặc upload zip mã nguồn, hệ thống build và phát
site tĩnh. Plan: `hoandat-app/plans/dattqh/261028-0944-trang-cua-toi/`.

Đang có: hạ tầng phát site, khung app ở `trang.hoandat.com` (trang giới thiệu, đăng nhập bằng tài khoản hoandat.com,
trang chủ sau đăng nhập còn trống). Tạo trang từ mẫu và deploy cho lập trình viên chưa làm.

## Cấu trúc

| Thư mục | Vai trò |
|---|---|
| `apps/server` (`@trang/server`) | API Express 5: đăng nhập BFF với `auth.hoandat.com` (Code + PKCE, client `trang-web`), phiên cookie `__Host-trang_session`, `/api/me`, `/healthz`; chạy migration khi mở database |
| `apps/web` (`@trang/web`) | React 19 + Vite; header, footer, thẻ đăng nhập, đổi giao diện và ngôn ngữ (vi, en) từ `@achoo254/app-shell` |
| `packages/db` (`@trang/db`) | Schema Drizzle (tài khoản, phiên, site, bản phát hành, hàng đợi job), migration, quy tắc tên site (`checkSiteName`) |
| `packages/publish` (`@trang/publish`) | Phát hành nguyên tử vào `SITES_DIR/<tên>/releases/<id>` và đổi `current`, giữ 3 bản, quay lại bản trước |
| `infra/` | nginx cho `trang.hoandat.com` và `*.hoandat.io.vn`, trang 404 chung, systemd `trang-server`, `deploy.sh` (`setup`, `hosting`, `release`) |
| `brand.config.json`, `brand/` | Tên, mô tả, màu, dấu app (`@achoo254/brand`); `pnpm check:brand` chặn viết cứng tên sản phẩm |
| `docs/deployment-guide.md` | Triển khai lên `.65` |

## Chạy ở máy dev

Cần Node ≥ 22.12, pnpm 11.9 (`packageManager`).

```bash
pnpm install
pnpm dev                  # server 127.0.0.1:5296 + web http://localhost:5297 (proxy /api, /auth, /healthz)
pnpm lint && pnpm typecheck && pnpm test && pnpm build
```

Ở máy dev không cần env nào: database là PGlite trong `.data/pglite`, đăng nhập tắt (bấm đăng nhập sẽ báo "chưa dùng
được"). Muốn đăng nhập thật thì chép `.env.example` thành `.env` và đặt `AUTH_CLIENT_SECRET`, rồi chạy server với
env đó (`pnpm --filter @trang/server exec tsx --env-file=../../.env src/server.ts`). Test database chạy trên PGlite trong bộ nhớ, không cần Postgres.

Dấu app trong `brand/icon.svg` là hình vector tạm, chưa phải icon AI; chưa có manifest PWA và icon PNG. Khi có icon AI
thì thay hai file trong `brand/` và thêm bước sinh icon theo cách của `clip-next`.

## Giấy phép

MIT (xem `LICENSE`).
