# webnhanh-next

**Web Nhanh** (`webnhanh.hoandat.com`): tạo website và đăng ra `https://<tên>.hoandat.io.vn`. Người không rành kỹ
thuật chọn mẫu và điền form; lập trình viên gán link git công khai hoặc upload zip mã nguồn, hệ thống build và phát
site tĩnh. Plan: `hoandat-app/plans/dattqh/261028-0944-trang-cua-toi/`.

Trước 28/10/2026 tên là Trang Của Tôi (`trang.hoandat.com`, repo `trang-next`, mọi tên nội bộ `trang`); tên miền cũ
chuyển hướng về `webnhanh.hoandat.com` (`docs/deployment-guide.md`, mục "Đổi tên sang Web Nhanh"). GitHub:
`achoo254/webnhanh-next`.

Đang có: hạ tầng phát site, app ở `webnhanh.hoandat.com` (đăng nhập bằng tài khoản hoandat.com), **tạo website từ mẫu
"Bán hàng nhận đơn"** (chọn mẫu, đặt địa chỉ, sửa chữ, thêm/bớt/xếp sản phẩm, tải ảnh, chọn màu, xem trước ngay trong
app, bấm Đăng, theo dõi từng bước và nhận link) và **nhận đơn**: website đăng ra có form đặt hàng (chạy cả khi trình
duyệt tắt JavaScript), chủ website xem đơn trong app (số đơn mới trên danh sách website, đánh dấu đã xử lý) và được báo
qua thông báo trên máy (Web Push) và tin nhắn bot trong app Chat; link dán vào Zalo, Facebook có ảnh xem trước; và **deploy cho lập trình viên**: dán link repo GitHub/GitLab công khai
(kiểm trước vài giây, không chạy code: framework, lệnh build, thư mục output, sửa được trước lần build đầu) hoặc tải
zip mã nguồn; build trong Docker giới hạn trên máy chủ (`webnhanh-builder`), màn hình chờ có các bước kèm đồng hồ thật,
ước lượng từ các lần build trước, "Báo tôi khi xong", log trực tiếp; push lên nhánh đã chọn (webhook có chữ ký) là tự
build lại; lịch sử build. Chưa có: các mẫu khác (đang hiện "Sắp có").

## Cấu trúc

| Thư mục | Vai trò |
|---|---|
| `apps/server` (`@webnhanh/server`) | API Express 5: đăng nhập BFF với `auth.hoandat.com` (Code + PKCE, client `webnhanh-web`), phiên cookie `__Host-webnhanh_session`, `/api/me`, `/healthz`, API site của chủ trang (danh sách, tạo, nháp, đổi tên, ảnh, đăng, trạng thái job); làm sạch ảnh bằng ffmpeg; nhận đơn từ trang đã đăng (`POST /f/<tên>`: CORS đúng origin của trang, token ký, trường bẫy, thời gian điền tối thiểu, giới hạn theo IP và theo trang), hộp đơn, cài đặt báo đơn, webhook bot Chat (`/hooks/chat`), gửi báo đơn từ hàng đợi `notification_deliveries` (Web Push, Chat; mỗi kênh thử lại riêng); chạy migration khi mở database |
| `apps/worker` (`@webnhanh/worker`) | Hai tiến trình. **Builder** (`src/builder-main.ts`, `src/build/`): nhận job `build`, lấy mã (`git clone --depth 1` ngoài container, không hook; giải zip có kiểm), nhận dạng framework, cài và build trong Docker (`run-build.ts` là module duy nhất gọi `docker`, chỉ nhận mảng tham số đã kiểm), chép output vào thư mục chờ, cache thư viện theo từng site, rồi trả job về hàng đợi cho worker phát hành. **Worker**: hàng đợi job (`FOR UPDATE SKIP LOCKED`), phát hành output của build (`build-publish.ts`), job `publish`: render nháp bằng `@webnhanh/templates` (kèm form đặt hàng có token ký), chụp ảnh xem trước `og:image` 1200×630 bằng Chrome headless (`CHROME_PATH`; cửa sổ cao hơn thẻ rồi ffmpeg cắt đúng khung; không có thì đăng không kèm ảnh), chép ảnh và phông của kiểu trang, đăng qua `@webnhanh/publish`, gỡ tên cũ sau khi đổi tên; dọn phiên, tên giữ chỗ, mã liên kết Chat hết hạn, bản ghi báo đơn cũ, ảnh không dùng |
| `apps/web` (`@webnhanh/web`) | React 19 + Vite; khung `@achoo254/app-shell`; danh sách website (kèm số đơn mới), chọn mẫu, trình sửa có xem trước (`iframe srcdoc`, cùng hàm render với trang thật), tiến độ đăng, hộp đơn `/sites/<id>/orders` với cài đặt báo đơn; service worker `public/sw.js` (chỉ hiện thông báo, không cache), manifest sinh từ `brand.config.json` |
| `packages/templates` (`@webnhanh/templates`) | Mẫu "Bán hàng nhận đơn": schema zod, kiểm liên hệ (Zalo, điện thoại, Facebook), `renderShop` ra HTML tĩnh (CSS inline, ảnh WebP `srcset`, CSP trong thẻ meta; script duy nhất là script nhỏ cố định của form đặt hàng, cho phép bằng hash) theo ba kiểu trang "Rực rỡ", "Tinh tế", "Ấm cúng" (`shop-styles.ts`, `shop-style-*.ts`; nháp cũ không có `style` đọc thành "Rực rỡ") với phông tự host trong mỗi bản đăng (`shop-fonts.ts`: Bricolage Grotesque, Newsreader, Baloo 2, Be Vietnam Pro, Nunito từ `@fontsource`, đều OFL-1.1; chỉ tập Latin và tiếng Việt), form đặt hàng và schema đơn (`order-form.ts`), thẻ chia sẻ `og:*`, HTML ảnh chia sẻ (`share-card.ts`), ảnh mẫu trong `samples/` |
| `packages/db` (`@webnhanh/db`) | Schema Drizzle (tài khoản, phiên, site và nháp, ảnh, tên giữ chỗ, bản phát hành, hàng đợi job, đơn `submissions`, đăng ký push, liên kết Chat, hàng đợi báo đơn và báo build, nguồn của site lập trình viên `developer_sites`, log build `job_logs`), hạn mức và hàng đợi build (`builds.ts`), token form (`form-token.ts`), migration, quy tắc tên site (`checkSiteName`), bố cục file ảnh, dọn dẹp |
| `packages/publish` (`@webnhanh/publish`) | Phát hành nguyên tử vào `SITES_DIR/<tên>/releases/<id>` và đổi `current`, giữ 3 bản, quay lại bản trước, gỡ site (`removeSite`) |
| `infra/` | nginx cho `webnhanh.hoandat.com` (kèm chuyển hướng từ tên cũ `trang.hoandat.com`) và `*.hoandat.io.vn`, trang 404 chung, systemd `webnhanh-server`, `webnhanh-worker`, `webnhanh-builder`, `webnhanh-build-network`, `builder/` (image build Node 22 ghim digest, mạng Docker và tường lửa `DOCKER-USER` của bước cài), `deploy.sh` (`setup`, `hosting`, `release`) |
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
được"), ảnh ở `.data/uploads`, worker và builder chạy ngay trong server dev (PGlite chỉ một tiến trình mở được) và đăng site vào
`.data/sites/<tên>/current/`. Build ở máy dev: HTML thuần (repo hoặc zip) chạy không cần gì thêm; project Node cần Docker
với image `webnhanh-build:node22` (`docker build -t webnhanh-build:node22 infra/builder`) và network `webnhanh-build`,
không có thì build báo "Máy build đang bảo trì". Tải ảnh lên cần ffmpeg có libwebp (`FFMPEG_PATH`, `FFPROBE_PATH`); ffmpeg của Homebrew
bản 8 trở lên không có, server báo ngay khi khởi động và test chuyển ảnh thật tự bỏ qua (CI cài ffmpeg của Ubuntu nên
test đó chạy ở CI). Báo đơn qua Web Push và Chat tắt khi chưa có khoá (nút tương ứng không hiện); đơn vẫn vào hộp đơn. Ảnh chia sẻ ở
máy dev cần `CHROME_PATH` (ví dụ `/Applications/Google Chrome.app/Contents/MacOS/Google Chrome`); test chụp ảnh thật
chỉ chạy khi có biến này. Muốn đăng nhập thật thì chép `.env.example` thành `.env` và đặt `AUTH_CLIENT_SECRET`, rồi chạy server với
env đó (`pnpm --filter @webnhanh/server exec tsx --env-file=../../.env src/server.ts`). Test database chạy trên PGlite trong bộ nhớ, không cần Postgres.

Dấu app trong `brand/icon.svg` là hình vector tạm, chưa phải icon AI; chưa có manifest PWA và icon PNG. Khi có icon AI
thì thay hai file trong `brand/` và thêm bước sinh icon theo cách của `clip-next`.

## Giấy phép

MIT (xem `LICENSE`).
