# trang-next

**Trang Của Tôi** (`trang.hoandat.com`): tạo trang web và đăng ra `https://<tên>.hoandat.io.vn`. Người không rành kỹ
thuật chọn mẫu và điền form; lập trình viên gán link git công khai hoặc upload zip mã nguồn, hệ thống build và phát
site tĩnh. Plan: `hoandat-app/plans/dattqh/261028-0944-trang-cua-toi/`.

Đang làm: hạ tầng phát site (xong), app chưa có.

## Cấu trúc

| Thư mục | Vai trò |
|---|---|
| `packages/db` (`@trang/db`) | Schema Drizzle (tài khoản, site, bản phát hành, hàng đợi job), migration, quy tắc tên site (`checkSiteName`) |
| `packages/publish` (`@trang/publish`) | Phát hành nguyên tử vào `SITES_DIR/<tên>/releases/<id>` và đổi `current`, giữ 3 bản, quay lại bản trước |
| `infra/` | nginx cho `*.hoandat.io.vn`, trang 404 chung, `deploy.sh` (`setup`, `hosting`) |
| `docs/deployment-guide.md` | Triển khai lên `.65` |

## Chạy ở máy dev

Cần Node ≥ 22.12, pnpm 11.9 (`packageManager`).

```bash
pnpm install
pnpm lint && pnpm typecheck && pnpm test
```

Test database chạy trên PGlite trong bộ nhớ, không cần Postgres.

## Giấy phép

MIT (xem `LICENSE`).
