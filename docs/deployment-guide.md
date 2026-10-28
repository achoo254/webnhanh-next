# Triển khai Trang Của Tôi lên `.65`

Trang Của Tôi chạy trên edge `.65` dùng chung (CentOS Stream 9, 4 CPU, 7,5 GB RAM, có production của app khác) sau
Cloudflare và nginx. Repo public: không ghi IP, cổng SSH hay user máy chủ vào đây; dùng `<SERVER_65_IP>`, `<SSH_PORT>`.

Gồm hai phần: **phát site người dùng** (`*.hoandat.io.vn`, lệnh `hosting`) và **app** `trang.hoandat.com` (server,
worker đăng site và web, lệnh `release`).

## Thành phần trên máy chủ

| Thứ | Ở đâu |
|---|---|
| Site người dùng | `/var/www/trang/sites/<tên>/releases/<id>/`, `current -> releases/<id>` (user `trang`, nhóm `trang`, `2750`: mọi thứ tạo bên trong giữ nhóm `trang`; nginx thuộc nhóm `trang` để đọc) |
| Trang dùng chung | `/var/www/trang/static/404.html` (từ `infra/static/`) |
| nginx | `/etc/nginx/conf.d/hoandat.io.vn.conf` (từ `infra/nginx/`): HTTP → HTTPS, tên miền gốc → `trang.hoandat.com`, mỗi tên hợp lệ một site, tên khác dưới `hoandat.io.vn` trả 404 thay vì rơi sang server block của app khác |
| Chứng chỉ gốc | `/etc/pki/nginx/server.{crt,key}` như các app khác; Cloudflare SSL "full", Universal SSL phủ `hoandat.io.vn` và `*.hoandat.io.vn` |
| App | `/var/www/trang/app` (bản phát hành hiện tại, `root:trang`), `app.prev` (bản trước); web tĩnh ở `app/apps/web/dist`, server `app/apps/server/dist/server.mjs` |
| Server | systemd `trang-server` (user `trang`, `127.0.0.1:4860`, `MemoryMax=512M` vì ffmpeg làm sạch ảnh chạy trong giới hạn này, ghi được `uploads/`), Node `/opt/node22`; migration của `packages/db` tự chạy khi server khởi động |
| Worker | systemd `trang-worker` (user `trang`, `MemoryMax=512M` vì mỗi lần đăng chạy một Chrome headless chụp ảnh xem trước, chỉ nói chuyện với loopback, ghi được `sites/` và `uploads/`): đăng site từ hàng đợi `jobs` (kèm form đặt hàng có token ký và ảnh `og-<bản>.jpg` 1200×630), mỗi giờ dọn phiên hết hạn, tên giữ chỗ và mã liên kết Chat hết hạn, bản ghi báo đơn quá 30 ngày, ảnh không còn dùng quá 1 ngày |
| Báo đơn | `trang-server` nhận đơn ở `POST /f/<tên>` và gửi báo đơn (Web Push, bot Chat) từ bảng `notification_deliveries`: mỗi dòng một máy hoặc một chat, thử lại riêng sau 30 giây, 2, 10, 30 phút, 2 rồi 6 giờ; đăng ký push hết hạn (404/410) và chat chặn bot (403) bị xoá |
| Ảnh tải lên | `/var/www/trang/uploads/<site id>/<ảnh>-<rộng>.webp` (`trang:trang`, `750`, nginx không phát; trình sửa đọc qua `/api/sites/<id>/images/…` có kiểm chủ) |
| nginx app | `/etc/nginx/conf.d/trang.hoandat.com.conf` (từ `infra/nginx/`): HTTP → HTTPS, phát web tĩnh, chuyển `/api`, `/auth`, `/healthz` vào server; CSP có hash của script theme |
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
4. **Env:** ghi `/etc/trang/production.env` từ iCloud (`install -m 640 -o root -g trang`). Server cần:

   | Biến | Ý nghĩa |
   |---|---|
   | `NODE_ENV` | `production` |
   | `PORT` | `4860` (nginx trỏ vào cổng này) |
   | `PUBLIC_URL` | `https://trang.hoandat.com`; callback đăng nhập là `PUBLIC_URL/auth/callback` |
   | `DATABASE_URL` | Postgres, database và role `trang` |
   | `AUTH_ISSUER` | `https://auth.hoandat.com` |
   | `AUTH_CLIENT_ID` | `trang-web` (mặc định) |
   | `AUTH_CLIENT_SECRET` | Secret của client `trang-web` ở `auth-next`, ≥ 32 ký tự |
   | `UPLOADS_DIR` | `/var/www/trang/uploads` (server ghi, worker đọc) |
   | `SITES_DIR` | `/var/www/trang/sites` (chỉ worker ghi) |
   | `FFMPEG_PATH`, `FFPROBE_PATH` | ffmpeg có libwebp để làm sạch ảnh, ví dụ bản tĩnh `/opt/ffmpeg-static/` đã cài cho Clip. Bỏ trống: ffmpeg trong PATH; nếu bản đó không có libwebp, server ghi cảnh báo khi khởi động và tải ảnh sẽ lỗi |
   | `SITES_PER_ACCOUNT` | Số trang từ mẫu mỗi tài khoản, mặc định 5 |
   | `SITE_MAX_MB` | Dung lượng một trang (ảnh khi sửa, và mỗi bản phát hành), mặc định 20 |
   | `POLL_MS` | Worker xem hàng đợi mỗi bao nhiêu ms, mặc định 1000 |
   | `FORM_SECRET` | Ký token form đặt hàng của mỗi trang (worker) và kiểm khi nhận đơn (server); ≥ 32 ký tự, một giá trị cho cả hai. Bắt buộc. Đổi giá trị thì form của các trang đã đăng báo "Trang đã cũ" cho tới khi đăng lại |
   | `VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY` | Khoá Web Push, sinh một lần trên máy chủ: `npx web-push generate-vapid-keys` (không bao giờ trong repo). Đổi khoá thì mọi máy đã bật thông báo phải bật lại |
   | `VAPID_SUBJECT` | `mailto:noreply@hoandat.com`. Ba biến VAPID có đủ thì bật push, thiếu cả ba thì tắt, thiếu một phần thì server dừng khi khởi động |
   | `CHAT_URL` | `https://chat.hoandat.com` (deep link `CHAT_URL/b/<bot>?start=<mã>`, Bot API `CHAT_URL/bot/v1`) |
   | `CHAT_BOT_USERNAME`, `CHAT_BOT_TOKEN` | Username (kết thúc bằng `bot`) và token `<bot_id>:<secret>` của bot báo đơn |
   | `CHAT_BOT_WEBHOOK_SECRET` | Secret webhook của bot (≥ 32 ký tự). Bốn biến Chat đủ thì hiện nút "Nhận báo đơn qua Chat", thiếu cả bốn thì ẩn |
   | `CHROME_PATH` | Chrome headless cho ảnh xem trước `og:image` của trang (worker), ví dụ `/usr/bin/google-chrome` đã cài cho Clip. Bỏ trống: trang vẫn đăng, không có ảnh, log ghi "no CHROME_PATH" |

   Server và worker đọc chung file này. Thiếu `DATABASE_URL`, `AUTH_CLIENT_SECRET`, `PUBLIC_URL`, `UPLOADS_DIR` hoặc
   `FORM_SECRET` thì server dừng ngay khi khởi động; worker dừng nếu thiếu `DATABASE_URL`, `SITES_DIR`, `UPLOADS_DIR`,
   `PUBLIC_URL` hoặc `FORM_SECRET`.
   Kiểm ffmpeg trước: `/opt/ffmpeg-static/ffmpeg -hide_banner -encoders | grep libwebp`.
5. **Bot Chat báo đơn** (tuỳ chọn, làm lúc nào cũng được): ở app Chat, Cài đặt → Developer Console → Tạo bot
   (username kết thúc bằng `bot`), cấp token; đặt webhook `https://trang.hoandat.com/hooks/chat` với secret mới (tab
   Nhận update, hoặc `PUT $API/webhook` theo `chat-next/docs/bot-api/README.md`); ghi bốn biến `CHAT_*` vào env rồi
   khởi động lại `trang-server`. Bot chỉ cần nhận `message` (mặc định); nó trả lời `/start <mã>` (liên kết chat),
   `/stop` (tắt) ngay trong response của webhook và gửi mỗi đơn mới bằng `POST $API/messages`.
6. **IdP:** client `trang-web` ở `auth-next` (Code + PKCE, `client_secret_basic`, scope `openid`, redirect
   `https://trang.hoandat.com/auth/callback`, đăng xuất về `https://trang.hoandat.com/`).
7. **DNS:** `trang.hoandat.com` trỏ `<SERVER_65_IP>`, proxied (zone `hoandat.com`, SSL "full").
8. **Phát site:** `bash infra/deploy.sh hosting`.
9. **App:** `bash infra/deploy.sh release`.

## Phát hành app

`bash infra/deploy.sh release` chạy gate (`lint`, `typecheck`, `test`, `build`) ở máy dev, đẩy bản build lên
`/var/www/trang/incoming`, `pnpm install --prod` cho server và worker, đổi `incoming` thành `app` (bản cũ thành
`app.prev`), cài unit systemd và nginx nếu đổi (`nginx -t` trước, hỏng thì trả file cũ, không reload), khởi động lại
`trang-server` và chờ `/healthz` (không lên trong 20 giây thì tự đổi về `app.prev`), rồi bật và khởi động lại
`trang-worker`. Lần đầu có worker: chạy `setup` trước để tạo `/var/www/trang/uploads` (`release` dừng nếu thiếu).

nginx của app nhận thân request tới 6 MB chỉ ở route tải ảnh `/api/sites/<id>/images`; mọi chỗ khác vẫn 64 KB
(form đặt hàng `/f/` 16 KB). `/f/` và `/hooks/chat` đi vào server như `/api/`. Giới hạn đơn theo IP dùng
`$remote_addr` mà nginx chuyển trong `X-Forwarded-For`: nó phải là IP của khách (real_ip từ Cloudflare), không phải IP
của Cloudflare.

**Quay lại bản trước bằng tay:** `cd /var/www/trang && rm -rf app && mv app.prev app && systemctl restart trang-server
trang-worker`.
Migration chỉ thêm, bản trước vẫn chạy được trên schema mới.

## Kiểm sau khi đổi

```bash
curl -s https://trang.hoandat.com/healthz            # ok
curl -s -o /dev/null -w '%{http_code}\n' https://trang.hoandat.com/api/me   # 401 khi chưa đăng nhập
curl -sI https://kiem-tra.hoandat.io.vn/            # 200, không Set-Cookie (site kiểm tra, tên giữ chỗ)
curl -sI https://khong-co-trang.hoandat.io.vn/      # 404, trang 404 chung
curl -sI https://hoandat.io.vn/                     # 302 về trang.hoandat.com
systemctl is-active trang-worker                    # active
journalctl -u trang-server -n 20 | grep -i webp     # không có dòng "cannot write WebP"
journalctl -u trang-server -n 20 | grep 'order notifications'   # push on/off, chat on/off như env
curl -s -o /dev/null -w '%{http_code}\n' -X POST https://trang.hoandat.com/f/khong-co-trang   # 404
journalctl -u trang-worker -n 50 | grep -i 'share picture'      # không có "no share picture" sau một lần đăng
```

Đổi tên một trang đã đăng: tên cũ được giữ 7 ngày (`site_name_holds`), lần đăng dưới tên mới gỡ thư mục tên cũ nên tên
cũ trả 404 chung; trang chưa từng đăng thì đổi tên không giữ chỗ.

## Lịch sử

- 28/10/2026: `/etc/nginx/conf.d/openapi.conf` (trang OpenAPI cũ từ 12/2025, chỉ cổng 80, cho `hoandat.io.vn`) đổi
  tên thành `openapi.conf.retired-20261028` vì trùng `server_name`; `/var/www/openapi` giữ nguyên.
