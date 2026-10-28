# CLAUDE.md

Web Nhanh, repo `webnhanh-next`. Đọc `README.md`, `docs/deployment-guide.md` và plan
`hoandat-app/plans/dattqh/261028-0944-trang-cua-toi/` trước khi làm. Trước 28/10/2026 tên là Trang Của Tôi
(`trang.hoandat.com`, tên nội bộ `trang`); tên nội bộ nay là `webnhanh`, chỉ `infra/nginx/webnhanh.hoandat.com.conf` và
`infra/deploy.sh` còn nhắc tên miền cũ (chuyển hướng, gỡ file nginx cũ).

- Gate trước khi báo xong: `pnpm lint && pnpm typecheck && pnpm test && pnpm build` (`lint` gồm `check:brand`).
- Repo public: không ghi IP, cổng SSH, user máy chủ hay secret; env production ở iCloud `ENV production/webnhanh-next/`.
- Site người dùng chỉ đi qua `@webnhanh/publish` (worker); không ghi thẳng vào `SITES_DIR`. Server không ghi `SITES_DIR`.
- Route nào chạm một site đều lấy site qua `ownedSite` (`apps/server/src/sites/site-access.ts`): site của tài khoản
  khác trả 404 như site không tồn tại.
- Mọi chữ người dùng gõ vào trang đều qua `escapeHtml` trong `@webnhanh/templates`; link chỉ được dựng bởi
  `zaloLink`/`phoneLink`/`facebookLink` (`contact-links.ts`) và `mapLink`/`webLink`/`emailLink`/... (`web-links.ts`).
  Mọi mẫu đi qua `parseDraft`/`publishIssues`/`renderDraft` (`templates.ts`); xem trước trong app dùng đúng `renderDraft`
  trong `iframe` `sandbox` không có `allow-scripts`.
- Ảnh tải lên không bao giờ lưu nguyên bản: kiểm magic bytes, ffmpeg làm sạch ra WebP không metadata
  (`apps/server/src/sites/image-processing.ts`).
- Tên site kiểm bằng `checkSiteName`; regex `server_name` trong `infra/nginx/hoandat.io.vn.conf` phải cùng hình với
  `SITE_NAME_PATTERN`.
- Không đặt cookie nào trên `hoandat.io.vn`: site người dùng chạy JavaScript tuỳ ý ở đó. Trang mẫu không gọi bên thứ
  ba; form đặt hàng chỉ gửi về app (`POST /f/<tên>`), CSP trong trang cho phép đúng origin đó.
- Script của form đặt hàng (`ORDER_SCRIPT` trong `packages/templates/src/order-form.ts`) được CSP cho phép bằng hash
  `ORDER_SCRIPT_HASH`; sửa script thì `order-form.test.ts` báo hash mới. Form xác nhận tham dự của thiệp cưới
  (`rsvp-form.ts`, `kind=rsvp`) dùng nguyên script đó. Không thêm script nào khác vào trang mẫu.
- `/f/:site`, `/hooks/chat` và `/hooks/git/:site` gắn trước `requireAllowedOrigin` và tự kiểm (CORS theo origin của
  site + token ký; HMAC của bot; secret webhook của từng site). Route mới của app đặt sau, như cũ.
- Build của lập trình viên chạy trong `webnhanh-builder` (nhóm `docker`); mọi lệnh `docker` chỉ đi qua
  `apps/worker/src/build/run-build.ts` với mảng tham số đã kiểm, không ghép chuỗi lệnh từ input. Builder không ghi
  `SITES_DIR`: output vào `BUILD_OUTPUT_DIR`, worker phát hành.
- Thiệp cưới được worker render lại mỗi ngày từ `sites.live_page` (bản đã đăng, không phải nháp đang sửa) để đếm
  ngược đúng ngày (`apps/worker/src/wedding-refresh.ts`), chỉ khi hàng đợi trống, không tạo job, không báo.
- Báo đơn (và xác nhận tham dự, báo admin về báo cáo lạm dụng và bản chờ duyệt) đi qua outbox `notification_deliveries` ghi cùng transaction với đơn (`orders/order-store.ts`); mỗi dòng gửi
  và thử lại riêng (`notifications/deliveries.ts`), một kênh lỗi không chặn kênh khác. Gửi từ `webnhanh-server`
  (worker chỉ nói chuyện loopback). Endpoint push chỉ nhận host dịch vụ push của trình duyệt (`isPushEndpoint`).
- Migration là SQL sinh bằng `pnpm --filter @webnhanh/db db:generate`, commit và review như code; không `drizzle-kit push`.
- Không viết cứng tên sản phẩm: đọc từ `apps/web/src/brand.ts` (chữ giao diện dùng `{app}` trong `messages.ts`).
- Trang công khai và khung app dùng `@achoo254/app-shell` (header, footer, thẻ đăng nhập, đổi giao diện và ngôn ngữ);
  không viết tay. Nâng gói thì hash CSP của script theme trong `infra/nginx/webnhanh.hoandat.com.conf` có thể đổi:
  `apps/web/src/theme-bootstrap.test.ts` báo hash mới.
- Không truyền `linkComponent` cho `SignInCard`: `/auth/login` là route của server.
- Route admin (`/api/admin/*`) không đi qua `ownedSite`: cổng duy nhất là `requireAdmin` (`apps/server/src/admin/admin-guard.ts`,
  `sub` trong `ADMIN_SUBS`, người khác kể cả chưa đăng nhập nhận 404). Mỗi thao tác admin ghi một dòng `admin_actions`
  trong cùng transaction; thao tác chạm file (gỡ, khôi phục, duyệt, từ chối) chỉ xếp hàng, worker áp dụng.
- Tài khoản bị khoá hoặc site bị gỡ thì không đăng, không build: `publishBlock` trong `enqueueJob`/`enqueueBuild`, và
  worker kiểm lại trước khi phát (`assertPublishable`). Route mới xếp job phải đi qua hai hàm đó.
- Mọi lần phát (trang mẫu, build) qua `review.ts` của worker: có ô mật khẩu hay mang tên ngân hàng, ví, cơ quan nhà
  nước thì giữ chờ duyệt (`holdRelease`), không đổi `current`. Trang mẫu có link "Báo cáo vi phạm" ở chân trang
  (`reportUrl`), không thêm script.
