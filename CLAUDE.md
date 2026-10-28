# CLAUDE.md

Trang Của Tôi, repo `trang-next`. Đọc `README.md`, `docs/deployment-guide.md` và plan
`hoandat-app/plans/dattqh/261028-0944-trang-cua-toi/` trước khi làm.

- Gate trước khi báo xong: `pnpm lint && pnpm typecheck && pnpm test`.
- Repo public: không ghi IP, cổng SSH, user máy chủ hay secret; env production ở iCloud `ENV production/trang-next/`.
- Site người dùng chỉ đi qua `@trang/publish`; không ghi thẳng vào `SITES_DIR`.
- Tên site kiểm bằng `checkSiteName`; regex `server_name` trong `infra/nginx/hoandat.io.vn.conf` phải cùng hình với
  `SITE_NAME_PATTERN`.
- Không đặt cookie nào trên `hoandat.io.vn`: site người dùng chạy JavaScript tuỳ ý ở đó.
- Migration là SQL sinh bằng `pnpm --filter @trang/db db:generate`, commit và review như code; không `drizzle-kit push`.
