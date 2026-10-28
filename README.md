# trang-next

**Trang Của Tôi** (`trang.hoandat.com`): tạo trang web và đăng ra `https://<tên>.hoandat.io.vn`. Người không rành kỹ
thuật chọn mẫu và điền form; lập trình viên gán link git công khai hoặc upload zip mã nguồn, hệ thống build và phát
site tĩnh. Plan: `hoandat-app/plans/dattqh/261028-0944-trang-cua-toi/`.

Đang có: hạ tầng phát site, app ở `trang.hoandat.com` (đăng nhập bằng tài khoản hoandat.com), **tạo trang từ mẫu
"Bán hàng nhận đơn"** (chọn mẫu, đặt địa chỉ, sửa chữ, thêm/bớt/xếp sản phẩm, tải ảnh, chọn màu, xem trước ngay trong
app, bấm Đăng, theo dõi từng bước và nhận link) và **nhận đơn**: trang đăng ra có form đặt hàng (chạy cả khi trình
duyệt tắt JavaScript), chủ trang xem đơn trong app (số đơn mới trên danh sách trang, đánh dấu đã xử lý) và được báo
qua thông báo trên máy (Web Push) và tin nhắn bot trong app Chat; link dán vào Zalo, Facebook có ảnh xem trước. Chưa
có: các mẫu khác (đang hiện "Sắp có"), deploy cho lập trình viên.

## Cấu trúc

| Thư mục | Vai trò |
|---|---|
| `apps/server` (`@trang/server`) | API Express 5: đăng nhập BFF với `auth.hoandat.com` (Code + PKCE, client `trang-web`), phiên cookie `__Host-trang_session`, `/api/me`, `/healthz`, API site của chủ trang (danh sách, tạo, nháp, đổi tên, ảnh, đăng, trạng thái job); làm sạch ảnh bằng ffmpeg; nhận đơn từ trang đã đăng (`POST /f/<tên>`: CORS đúng origin của trang, token ký, trường bẫy, thời gian điền tối thiểu, giới hạn theo IP và theo trang), hộp đơn, cài đặt báo đơn, webhook bot Chat (`/hooks/chat`), gửi báo đơn từ hàng đợi `notification_deliveries` (Web Push, Chat; mỗi kênh thử lại riêng); chạy migration khi mở database |
| `apps/worker` (`@trang/worker`) | Hàng đợi job (`FOR UPDATE SKIP LOCKED`), job `publish`: render nháp bằng `@trang/templates` (kèm form đặt hàng có token ký), chụp ảnh xem trước `og:image` 1200×630 bằng Chrome headless (`CHROME_PATH`; không có thì đăng không kèm ảnh), chép ảnh, đăng qua `@trang/publish`, gỡ tên cũ sau khi đổi tên; dọn phiên, tên giữ chỗ, mã liên kết Chat hết hạn, bản ghi báo đơn cũ, ảnh không dùng |
| `apps/web` (`@trang/web`) | React 19 + Vite; khung `@achoo254/app-shell`; danh sách trang (kèm số đơn mới), chọn mẫu, trình sửa có xem trước (`iframe srcdoc`, cùng hàm render với trang thật), tiến độ đăng, hộp đơn `/sites/<id>/orders` với cài đặt báo đơn; service worker `public/sw.js` (chỉ hiện thông báo, không cache), manifest sinh từ `brand.config.json` |
| `packages/templates` (`@trang/templates`) | Mẫu "Bán hàng nhận đơn": schema zod, kiểm liên hệ (Zalo, điện thoại, Facebook), `renderShop` ra HTML tĩnh (CSS inline, ảnh WebP `srcset`, CSP trong thẻ meta; script duy nhất là script nhỏ cố định của form đặt hàng, cho phép bằng hash), form đặt hàng và schema đơn (`order-form.ts`), thẻ chia sẻ `og:*`, HTML ảnh chia sẻ (`share-card.ts`), ảnh mẫu trong `samples/` |
| `packages/db` (`@trang/db`) | Schema Drizzle (tài khoản, phiên, site và nháp, ảnh, tên giữ chỗ, bản phát hành, hàng đợi job, đơn `submissions`, đăng ký push, liên kết Chat, hàng đợi báo đơn), token form (`form-token.ts`), migration, quy tắc tên site (`checkSiteName`), bố cục file ảnh, dọn dẹp |
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
test đó chạy ở CI). Báo đơn qua Web Push và Chat tắt khi chưa có khoá (nút tương ứng không hiện); đơn vẫn vào hộp đơn. Ảnh chia sẻ ở
máy dev cần `CHROME_PATH` (ví dụ `/Applications/Google Chrome.app/Contents/MacOS/Google Chrome`); test chụp ảnh thật
chỉ chạy khi có biến này. Muốn đăng nhập thật thì chép `.env.example` thành `.env` và đặt `AUTH_CLIENT_SECRET`, rồi chạy server với
env đó (`pnpm --filter @trang/server exec tsx --env-file=../../.env src/server.ts`). Test database chạy trên PGlite trong bộ nhớ, không cần Postgres.

Dấu app trong `brand/icon.svg` là hình vector tạm, chưa phải icon AI; chưa có manifest PWA và icon PNG. Khi có icon AI
thì thay hai file trong `brand/` và thêm bước sinh icon theo cách của `clip-next`.

## Giấy phép

MIT (xem `LICENSE`).
