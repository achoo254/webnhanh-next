# trang-next

**Trang Của Tôi** (`trang.hoandat.com`): tạo trang web và đăng ra `https://<tên>.hoandat.io.vn`. Người không rành kỹ
thuật chọn mẫu và điền form; lập trình viên gán link git công khai hoặc upload zip mã nguồn, hệ thống build và phát
site tĩnh. Plan: `hoandat-app/plans/dattqh/261028-0944-trang-cua-toi/`.

Đang có: hạ tầng phát site, app ở `trang.hoandat.com` (đăng nhập bằng tài khoản hoandat.com), và **tạo trang từ mẫu
"Bán hàng nhận đơn"**: chọn mẫu, đặt địa chỉ, sửa chữ, thêm/bớt/xếp sản phẩm, tải ảnh lên, chọn màu, xem trước ngay
trong app, bấm Đăng rồi theo dõi từng bước và nhận link. Chưa có: form đặt hàng trên trang và hộp đơn (bước sau), các
mẫu khác (đang hiện "Sắp có"), deploy cho lập trình viên.

## Cấu trúc

| Thư mục | Vai trò |
|---|---|
| `apps/server` (`@trang/server`) | API Express 5: đăng nhập BFF với `auth.hoandat.com` (Code + PKCE, client `trang-web`), phiên cookie `__Host-trang_session`, `/api/me`, `/healthz`, API site của chủ trang (danh sách, tạo, nháp, đổi tên, ảnh, đăng, trạng thái job); làm sạch ảnh bằng ffmpeg; chạy migration khi mở database |
| `apps/worker` (`@trang/worker`) | Hàng đợi job (`FOR UPDATE SKIP LOCKED`), job `publish`: render nháp bằng `@trang/templates`, chép ảnh, đăng qua `@trang/publish`, gỡ tên cũ sau khi đổi tên; dọn phiên hết hạn, tên giữ chỗ hết hạn, ảnh không dùng |
| `apps/web` (`@trang/web`) | React 19 + Vite; khung `@achoo254/app-shell`; danh sách trang, chọn mẫu, trình sửa có xem trước (`iframe srcdoc`, cùng hàm render với trang thật), tiến độ đăng |
| `packages/templates` (`@trang/templates`) | Mẫu "Bán hàng nhận đơn": schema zod, kiểm liên hệ (Zalo, điện thoại, Facebook), `renderShop` ra HTML tĩnh (không script, CSS inline, ảnh WebP `srcset`), ảnh mẫu trong `samples/` |
| `packages/db` (`@trang/db`) | Schema Drizzle (tài khoản, phiên, site và nháp, ảnh, tên giữ chỗ, bản phát hành, hàng đợi job), migration, quy tắc tên site (`checkSiteName`), bố cục file ảnh, dọn dẹp |
| `packages/publish` (`@trang/publish`) | Phát hành nguyên tử vào `SITES_DIR/<tên>/releases/<id>` và đổi `current`, giữ 3 bản, quay lại bản trước, gỡ site (`removeSite`) |
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
được"), ảnh ở `.data/uploads`, worker chạy ngay trong server dev (PGlite chỉ một tiến trình mở được) và đăng site vào
`.data/sites/<tên>/current/`. Tải ảnh lên cần ffmpeg có libwebp (`FFMPEG_PATH`, `FFPROBE_PATH`); ffmpeg của Homebrew
bản 8 trở lên không có, server báo ngay khi khởi động và test chuyển ảnh thật tự bỏ qua (CI cài ffmpeg của Ubuntu nên
test đó chạy ở CI). Muốn đăng nhập thật thì chép `.env.example` thành `.env` và đặt `AUTH_CLIENT_SECRET`, rồi chạy server với
env đó (`pnpm --filter @trang/server exec tsx --env-file=../../.env src/server.ts`). Test database chạy trên PGlite trong bộ nhớ, không cần Postgres.

Dấu app trong `brand/icon.svg` là hình vector tạm, chưa phải icon AI; chưa có manifest PWA và icon PNG. Khi có icon AI
thì thay hai file trong `brand/` và thêm bước sinh icon theo cách của `clip-next`.

## Giấy phép

MIT (xem `LICENSE`).
