# Triển khai Trang Của Tôi lên `.65`

Trang Của Tôi chạy trên edge `.65` dùng chung (CentOS Stream 9, 4 CPU, 7,5 GB RAM, có production của app khác) sau
Cloudflare và nginx. Repo public: không ghi IP, cổng SSH hay user máy chủ vào đây; dùng `<SERVER_65_IP>`, `<SSH_PORT>`.

Hiện có phần **phát site người dùng** (`*.hoandat.io.vn`) và database. App (`trang.hoandat.com`: server, worker, web)
thêm lệnh `release` khi có code.

## Thành phần trên máy chủ

| Thứ | Ở đâu |
|---|---|
| Site người dùng | `/var/www/trang/sites/<tên>/releases/<id>/`, `current -> releases/<id>` (user `trang`, nhóm `trang`, `2750`: mọi thứ tạo bên trong giữ nhóm `trang`; nginx thuộc nhóm `trang` để đọc) |
| Trang dùng chung | `/var/www/trang/static/404.html` (từ `infra/static/`) |
| nginx | `/etc/nginx/conf.d/hoandat.io.vn.conf` (từ `infra/nginx/`): HTTP → HTTPS, tên miền gốc → `hoandat.com` (tạm, tới khi có app), mỗi tên hợp lệ một site, tên khác dưới `hoandat.io.vn` trả 404 thay vì rơi sang server block của app khác |
| Chứng chỉ gốc | `/etc/pki/nginx/server.{crt,key}` như các app khác; Cloudflare SSL "full", Universal SSL phủ `hoandat.io.vn` và `*.hoandat.io.vn` |
| Database | Postgres đang chạy trên `.65`, database `trang`, role `trang`; `pg_hba.conf` có hai dòng `host trang trang 127.0.0.1/32` và `::1/128` `scram-sha-256` đặt trên dòng `ident` chung |
| Env | `/etc/trang/production.env` (640 `root:trang`), nguồn ở thư mục env iCloud `ENV production/trang-next/.env.production` |

## Phát hành một site

`packages/publish` (`publishRelease`) chép bản build vào `releases/.incoming-<id>`, đổi tên thành `releases/<id>`,
tạo symlink tạm rồi `rename` đè lên `current`: người xem nhận bản cũ hoặc bản mới, không bao giờ bản dở. Giữ 3 bản gần
nhất; `rollbackRelease` đưa bản trước lên lại. Từ chối output có symlink, file đặc biệt, quá dung lượng hoặc số file,
thiếu `index.html`.

Đo ngày 28/10/2026: đăng lại 20 lần trong lúc gửi 300 request liên tục qua Cloudflare, 300/300 trả 200.

**Quay lại bản trước bằng tay:** `cd /var/www/trang/sites/<tên> && ls -t releases` rồi
`sudo -u trang ln -s releases/<id> .current-tmp && sudo -u trang mv -T .current-tmp current`.

## Lần đầu

1. **DNS** (Cloudflare, zone `hoandat.io.vn`): `A hoandat.io.vn` và `A *.hoandat.io.vn` trỏ `<SERVER_65_IP>`, proxied.
2. **Máy chủ:** `SSH_TARGET=<user>@<SERVER_65_IP> SSH_OPTS="-p <SSH_PORT> -i <key>" bash infra/deploy.sh setup`.
3. **Database** (trên `.65`, chạy từ `/tmp`):
   ```bash
   cd /tmp && sudo -u postgres psql -v ON_ERROR_STOP=1 -c "CREATE ROLE trang LOGIN PASSWORD '<mật khẩu>'"
   cd /tmp && sudo -u postgres createdb -O trang trang
   ```
   Thêm hai dòng `scram-sha-256` cho `trang` vào `pg_hba.conf` (sao lưu file trước), `select pg_reload_conf()`.
   Migration (`packages/db/drizzle`) sẽ tự chạy khi server mở Postgres.
4. **Env:** ghi `/etc/trang/production.env` từ iCloud (`install -m 640 -o root -g trang`).
5. **Phát site:** `bash infra/deploy.sh hosting`.

## Kiểm sau khi đổi

```bash
curl -sI https://kiem-tra.hoandat.io.vn/            # 200, không Set-Cookie (site kiểm tra, tên giữ chỗ)
curl -sI https://khong-co-trang.hoandat.io.vn/      # 404, trang 404 chung
curl -sI https://hoandat.io.vn/                     # 302 về hoandat.com
```

## Lịch sử

- 28/10/2026: `/etc/nginx/conf.d/openapi.conf` (trang OpenAPI cũ từ 12/2025, chỉ cổng 80, cho `hoandat.io.vn`) đổi
  tên thành `openapi.conf.retired-20261028` vì trùng `server_name`; `/var/www/openapi` giữ nguyên.
