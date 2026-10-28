# CLAUDE.md

Trang Của Tôi, repo `trang-next`. Đọc `README.md`, `docs/deployment-guide.md` và plan
`hoandat-app/plans/dattqh/261028-0944-trang-cua-toi/` trước khi làm.

- Gate trước khi báo xong: `pnpm lint && pnpm typecheck && pnpm test && pnpm build` (`lint` gồm `check:brand`).
- Repo public: không ghi IP, cổng SSH, user máy chủ hay secret; env production ở iCloud `ENV production/trang-next/`.
- Site người dùng chỉ đi qua `@trang/publish` (worker); không ghi thẳng vào `SITES_DIR`. Server không ghi `SITES_DIR`.
- Route nào chạm một site đều lấy site qua `ownedSite` (`apps/server/src/sites/site-access.ts`): site của tài khoản
  khác trả 404 như site không tồn tại.
- Mọi chữ người dùng gõ vào trang đều qua `escapeHtml` trong `@trang/templates`; link liên hệ chỉ được dựng bởi
  `zaloLink`/`phoneLink`/`facebookLink`. Xem trước trong app dùng đúng `renderShop` trong `iframe` `sandbox` không có
  `allow-scripts`.
- Ảnh tải lên không bao giờ lưu nguyên bản: kiểm magic bytes, ffmpeg làm sạch ra WebP không metadata
  (`apps/server/src/sites/image-processing.ts`).
- Tên site kiểm bằng `checkSiteName`; regex `server_name` trong `infra/nginx/hoandat.io.vn.conf` phải cùng hình với
  `SITE_NAME_PATTERN`.
- Không đặt cookie nào trên `hoandat.io.vn`: site người dùng chạy JavaScript tuỳ ý ở đó. Trang mẫu không gọi bên thứ
  ba; form đặt hàng chỉ gửi về app (`POST /f/<tên>`), CSP trong trang cho phép đúng origin đó.
- Script của form đặt hàng (`ORDER_SCRIPT` trong `packages/templates/src/order-form.ts`) được CSP cho phép bằng hash
  `ORDER_SCRIPT_HASH`; sửa script thì `order-form.test.ts` báo hash mới. Không thêm script nào khác vào trang mẫu.
- `/f/:site` và `/hooks/chat` gắn trước `requireAllowedOrigin` và tự kiểm (CORS theo origin của site + token ký;
  HMAC của bot). Route mới của app đặt sau, như cũ.
- Báo đơn đi qua outbox `notification_deliveries` ghi cùng transaction với đơn (`orders/order-store.ts`); mỗi dòng gửi
  và thử lại riêng (`notifications/deliveries.ts`), một kênh lỗi không chặn kênh khác. Gửi từ `trang-server`
  (worker chỉ nói chuyện loopback). Endpoint push chỉ nhận host dịch vụ push của trình duyệt (`isPushEndpoint`).
- Migration là SQL sinh bằng `pnpm --filter @trang/db db:generate`, commit và review như code; không `drizzle-kit push`.
- Không viết cứng tên sản phẩm: đọc từ `apps/web/src/brand.ts` (chữ giao diện dùng `{app}` trong `messages.ts`).
- Trang công khai và khung app dùng `@achoo254/app-shell` (header, footer, thẻ đăng nhập, đổi giao diện và ngôn ngữ);
  không viết tay. Nâng gói thì hash CSP của script theme trong `infra/nginx/trang.hoandat.com.conf` có thể đổi:
  `apps/web/src/theme-bootstrap.test.ts` báo hash mới.
- Không truyền `linkComponent` cho `SignInCard`: `/auth/login` là route của server.
