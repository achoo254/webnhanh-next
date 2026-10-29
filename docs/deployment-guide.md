# Triển khai Web Nhanh lên `.65`

Web Nhanh chạy trên edge `.65` dùng chung (CentOS Stream 9, 4 CPU, 7,5 GB RAM, có production của app khác) sau
Cloudflare và nginx. Repo public: không ghi IP, cổng SSH hay user máy chủ vào đây; dùng `<SERVER_65_IP>`, `<SSH_PORT>`.

Gồm hai phần: **phát site người dùng** (`*.hoandat.io.vn`, lệnh `hosting`) và **app** `webnhanh.hoandat.com` (server,
worker đăng site, builder build site lập trình viên và web, lệnh `release`).

Trước 28/10/2026 sản phẩm tên là Trang Của Tôi ở `trang.hoandat.com`, và mọi tên nội bộ là `trang` (user và nhóm hệ
thống, `/var/www/trang`, `/etc/trang`, unit `trang-server`/`trang-worker`, database và role, client `trang-web`, cookie
`__Host-trang_session`, gói `@trang/*`, repo `trang-next`). Xem "Đổi tên sang Web Nhanh" bên dưới.

## Thành phần trên máy chủ

| Thứ | Ở đâu |
|---|---|
| Site người dùng | `/var/www/webnhanh/sites/<tên>/releases/<id>/`, `current -> releases/<id>` (user `webnhanh`, nhóm `webnhanh`, `2750`: mọi thứ tạo bên trong giữ nhóm `webnhanh`; nginx thuộc nhóm `webnhanh` để đọc) |
| Trang dùng chung | `/var/www/webnhanh/static/404.html` (từ `infra/static/`) |
| nginx | `/etc/nginx/conf.d/hoandat.io.vn.conf` (từ `infra/nginx/`): HTTP → HTTPS, tên miền gốc → `webnhanh.hoandat.com`, mỗi tên hợp lệ một site, tên khác dưới `hoandat.io.vn` trả 404 thay vì rơi sang server block của app khác; `/.well-known/report` của mọi site 302 về form báo cáo `https://webnhanh.hoandat.com/bao-cao?site=<tên>` (không đụng file của site) |
| Chứng chỉ gốc | `/etc/pki/nginx/server.{crt,key}` như các app khác; Cloudflare SSL "full", Universal SSL phủ `hoandat.io.vn` và `*.hoandat.io.vn` |
| App | `/var/www/webnhanh/app` (bản phát hành hiện tại, `root:webnhanh`), `app.prev` (bản trước); web tĩnh ở `app/apps/web/dist`, server `app/apps/server/dist/server.mjs` |
| Server | systemd `webnhanh-server` (user `webnhanh`, `127.0.0.1:4860`, `MemoryMax=512M` vì ffmpeg làm sạch ảnh chạy trong giới hạn này, ghi được `uploads/`), Node `/opt/node22`; migration của `packages/db` tự chạy khi server khởi động |
| Worker | systemd `webnhanh-worker` (user `webnhanh`, `MemoryMax=512M` vì mỗi lần đăng chạy một Chrome headless chụp ảnh xem trước, chỉ nói chuyện với loopback, ghi được `sites/` và `uploads/`): đăng site của mọi mẫu từ hàng đợi `jobs` (trang bán hàng kèm form đặt hàng, thiệp cưới kèm form xác nhận tham dự, cả hai có token ký; ảnh `og-<bản>.jpg` 1200×630), lưu trang đang chạy vào `sites.live_page`; khi hàng đợi trống, mỗi ngày (giờ Việt Nam) render lại thiệp cưới chưa qua ngày cưới để đếm ngược đúng ngày (`wedding-refresh.ts`: chép bản đang chạy, chỉ viết lại `index.html`, không Chrome, không báo, không tạo job), mỗi giờ dọn phiên hết hạn, tên giữ chỗ và mã liên kết Chat hết hạn, bản ghi báo đơn quá 30 ngày, ảnh không còn dùng quá 1 ngày |
| Báo đơn | `webnhanh-server` nhận đơn và xác nhận tham dự của thiệp cưới (`kind=rsvp`) ở `POST /f/<tên>` (cùng token, trường bẫy, thời gian điền, giới hạn theo IP và theo trang) và gửi báo (Web Push, bot Chat) từ bảng `notification_deliveries`: mỗi dòng một máy hoặc một chat, thử lại riêng sau 30 giây, 2, 10, 30 phút, 2 rồi 6 giờ; đăng ký push hết hạn (404/410) và chat chặn bot (403) bị xoá |
| Ảnh tải lên | `/var/www/webnhanh/uploads/<site id>/<ảnh>-<rộng>.webp` (`webnhanh:webnhanh`, `750`, nginx không phát; trình sửa đọc qua `/api/sites/<id>/images/…` có kiểm chủ) |
| nginx app | `/etc/nginx/conf.d/webnhanh.hoandat.com.conf` (từ `infra/nginx/`): HTTP → HTTPS, phát web tĩnh, chuyển `/api`, `/auth`, `/healthz` vào server; CSP không cho script inline nào (web không có script inline). Cùng file phục vụ tên cũ `trang.hoandat.com`: 301 về cùng đường dẫn trên `webnhanh.hoandat.com` |
| Builder | systemd `webnhanh-builder` (user và nhóm `webnhanh-builder`, uid/gid **10001** như user build trong container, thêm nhóm `docker`; không thuộc nhóm `webnhanh` nên không đọc được `production.env`, đọc app qua ACL). Mỗi lần một build: `git clone --depth 1` (chỉ github.com/gitlab.com, HTTPS) hoặc giải zip, rồi hai container `--rm` từ image `webnhanh-build:node22` (`infra/builder/Dockerfile`, Node 22 ghim digest): bước cài trên network `webnhanh-build`, bước build `--network none`; cờ giới hạn và lý do ở `apps/worker/src/build/run-build.ts`. Chỉ bắt đầu khi RAM trống ≥ 1,5 GB và ổ trống ≥ 5 GB. Output vào `/var/lib/webnhanh/builds/out/<job>` rồi trả job về hàng đợi: `webnhanh-worker` phát hành như trang mẫu |
| Thư mục build | `/var/lib/webnhanh/builds/inbox` (zip tải lên: `webnhanh:webnhanh-builder` `2770`), `builds/out` (output chờ phát hành: `webnhanh-builder:webnhanh` `2750`), `work/` và `cache/<site id>/` (chỉ builder, `700`; cache thư viện theo từng site, tối đa 500 MB, xoá sau 30 ngày không build) |
| Mạng build | systemd `webnhanh-build-network` (oneshot, chạy lại theo Docker và khi khởi động máy): network `webnhanh-build` (bridge `wn-build0`, mặc định `172.30.254.0/24`, đổi bằng `BUILD_SUBNET`), chuỗi `WEBNHANH-BUILD` trong `DOCKER-USER` (chặn 127/8, 10/8, 172.16/12, 192.168/16, 169.254/16, 100.64/10, IP công khai của `.65`; ngoài ra chỉ TCP 80/443) và `WEBNHANH-BUILD-IN` trong `INPUT` (container không gọi được dịch vụ nào trên chính `.65`) |
| Database | Postgres đang chạy trên `.65`, database `webnhanh`, role `webnhanh`; `pg_hba.conf` có hai dòng `host webnhanh webnhanh 127.0.0.1/32` và `::1/128` `scram-sha-256` đặt trên dòng `ident` chung |
| Env | `/etc/webnhanh/production.env` (640 `root:webnhanh`), nguồn ở thư mục env iCloud `ENV production/webnhanh-next/.env.production` |

## Phát hành một site

`packages/publish` (`publishRelease`) chép bản build vào `releases/.incoming-<id>`, đổi tên thành `releases/<id>`,
tạo symlink tạm rồi `rename` đè lên `current`: người xem nhận bản cũ hoặc bản mới, không bao giờ bản dở. Giữ 3 bản gần
nhất; `rollbackRelease` đưa bản trước lên lại. Từ chối output có symlink, file đặc biệt, quá dung lượng hoặc số file,
thiếu `index.html`.

Đo ngày 28/10/2026: đăng lại 20 lần trong lúc gửi 300 request liên tục qua Cloudflare, 300/300 trả 200.

**Quay lại bản trước bằng tay:** `cd /var/www/webnhanh/sites/<tên> && ls -t releases` rồi
`sudo -u webnhanh ln -s releases/<id> .current-tmp && sudo -u webnhanh mv -T .current-tmp current`.

## Lần đầu

1. **DNS** (Cloudflare, zone `hoandat.io.vn`): `A hoandat.io.vn` và `A *.hoandat.io.vn` trỏ `<SERVER_65_IP>`, proxied.
2. **Máy chủ:** `SSH_TARGET=<user>@<SERVER_65_IP> SSH_OPTS="-p <SSH_PORT> -i <key>" bash infra/deploy.sh setup`.
3. **Database** (trên `.65`, chạy từ `/tmp`):
   ```bash
   cd /tmp && sudo -u postgres psql -v ON_ERROR_STOP=1 -c "CREATE ROLE webnhanh LOGIN PASSWORD '<mật khẩu>'"
   cd /tmp && sudo -u postgres createdb -O webnhanh webnhanh
   ```
   Thêm hai dòng `scram-sha-256` cho `webnhanh` vào `pg_hba.conf` (sao lưu file trước), `select pg_reload_conf()`.
   Migration (`packages/db/drizzle`) sẽ tự chạy khi server mở Postgres.
4. **Env:** ghi `/etc/webnhanh/production.env` từ iCloud (`install -m 640 -o root -g webnhanh`). Server cần:

   | Biến | Ý nghĩa |
   |---|---|
   | `NODE_ENV` | `production` |
   | `PORT` | `4860` (nginx trỏ vào cổng này) |
   | `PUBLIC_URL` | `https://webnhanh.hoandat.com`; callback đăng nhập là `PUBLIC_URL/auth/callback` |
   | `DATABASE_URL` | Postgres, database và role `webnhanh` |
   | `AUTH_ISSUER` | `https://auth.hoandat.com` |
   | `AUTH_CLIENT_ID` | `webnhanh-web` (mặc định) |
   | `AUTH_CLIENT_SECRET` | Secret của client `webnhanh-web` ở `auth-next`, ≥ 32 ký tự |
   | `UPLOADS_DIR` | `/var/www/webnhanh/uploads` (server ghi, worker đọc) |
   | `SITES_DIR` | `/var/www/webnhanh/sites` (chỉ worker ghi) |
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
   | `ADMIN_SUBS` | `sub` (mã định danh ở `auth.hoandat.com`) của các admin, cách nhau bằng dấu phẩy. Admin có công cụ `/admin` (báo cáo lạm dụng, gỡ site, khoá tài khoản, duyệt bản chờ) và nhận báo qua bot Chat/Web Push khi có báo cáo hoặc bản bị giữ chờ duyệt (server và worker cùng đọc). Admin phải đăng nhập app một lần (có tài khoản) và bật thông báo trên máy hoặc "Nhận báo qua Chat" ở `/admin` (cùng cài đặt với báo đơn) thì mới nhận được tin. Bỏ trống: không ai là admin, báo cáo vẫn được lưu |
   | `CHROME_PATH` | Chrome headless cho ảnh xem trước `og:image` của trang (worker), ví dụ `/usr/bin/google-chrome` đã cài cho Clip. Bỏ trống: trang vẫn đăng, không có ảnh, log ghi "no CHROME_PATH" |
   | `BUILD_INBOX_DIR` | `/var/lib/webnhanh/builds/inbox` (server ghi zip của site lập trình viên). Bỏ trống: tải zip tắt, deploy từ git vẫn chạy |
   | `BUILD_OUTPUT_DIR` | `/var/lib/webnhanh/builds/out` (worker đọc output của build để phát hành). Bỏ trống: build xong sẽ lỗi ở bước Phát hành |

   Server và worker đọc chung file này. Thiếu `DATABASE_URL`, `AUTH_CLIENT_SECRET`, `PUBLIC_URL`, `UPLOADS_DIR` hoặc
   `FORM_SECRET` thì server dừng ngay khi khởi động; worker dừng nếu thiếu `DATABASE_URL`, `SITES_DIR`, `UPLOADS_DIR`,
   `PUBLIC_URL` hoặc `FORM_SECRET`.
   Kiểm ffmpeg trước: `/opt/ffmpeg-static/ffmpeg -hide_banner -encoders | grep libwebp`.
5. **Deploy cho lập trình viên** (làm sau khi app đã chạy):
   - Cài Docker CE trên `.65` (repo chính thức cho CentOS Stream 9), `systemctl enable --now docker`, rồi chạy lại
     `setup` (tạo `webnhanh-builder` uid/gid 10001 trong nhóm `docker` và các thư mục `/var/lib/webnhanh`).
   - Ghi `/etc/webnhanh/builder.env` (`install -m 640 -o root -g webnhanh-builder`; systemd đọc bằng root):

     | Biến | Ý nghĩa |
     |---|---|
     | `DATABASE_URL` | Như của server |
     | `BUILD_INBOX_DIR`, `BUILD_OUTPUT_DIR` | Như trên |
     | `BUILD_WORK_DIR`, `BUILD_CACHE_DIR` | `/var/lib/webnhanh/work`, `/var/lib/webnhanh/cache` (cùng ổ: cache chuyển bằng rename) |
     | `SERVER_PUBLIC_IP` | IPv4 công khai của `.65` (`<SERVER_65_IP>`), bị chặn trong mạng build |
     | `BUILD_IMAGE`, `BUILD_MIN_FREE_MB`, `BUILD_MIN_DISK_MB` | Tuỳ chọn: mặc định `webnhanh-build:node22`, 1536, 5120 |
   - Thêm `BUILD_INBOX_DIR`, `BUILD_OUTPUT_DIR` vào `production.env`, rồi `release`: nó build image, dựng mạng và tường
     lửa, khởi động `webnhanh-builder`. Kiểm theo mục "Kiểm máy build" bên dưới.
6. **Bot Chat báo đơn** (tuỳ chọn, làm lúc nào cũng được): ở app Chat, Cài đặt → Developer Console → Tạo bot
   (username kết thúc bằng `bot`), cấp token; đặt webhook `https://webnhanh.hoandat.com/hooks/chat` với secret mới (tab
   Nhận update, hoặc `PUT $API/webhook` theo `chat-next/docs/bot-api/README.md`); ghi bốn biến `CHAT_*` vào env rồi
   khởi động lại `webnhanh-server`. Bot chỉ cần nhận `message` (mặc định); nó trả lời `/start <mã>` (liên kết chat),
   `/stop` (tắt) ngay trong response của webhook và gửi mỗi đơn mới bằng `POST $API/messages`.
7. **IdP:** client `webnhanh-web` ở `auth-next` (Code + PKCE, `client_secret_basic`, scope `openid`, redirect
   `https://webnhanh.hoandat.com/auth/callback`, đăng xuất về `https://webnhanh.hoandat.com/`).
8. **DNS:** `webnhanh.hoandat.com` trỏ `<SERVER_65_IP>`, proxied (zone `hoandat.com`, SSL "full").
9. **Phát site:** `bash infra/deploy.sh hosting`.
10. **App:** `bash infra/deploy.sh release`.

## Phát hành app

`bash infra/deploy.sh release` chạy gate (`lint`, `typecheck`, `test`, `build`) ở máy dev, đẩy bản build lên
`/var/www/webnhanh/incoming`, `pnpm install --prod` cho server và worker, đổi `incoming` thành `app` (bản cũ thành
`app.prev`), cài unit systemd và nginx nếu đổi (`nginx -t` trước, hỏng thì trả file cũ, không reload), khởi động lại
`webnhanh-server` và chờ `/healthz` (không lên trong 20 giây thì tự đổi về `app.prev`), rồi bật và khởi động lại
`webnhanh-worker`. Lần đầu có worker: chạy `setup` trước để tạo `/var/www/webnhanh/uploads` (`release` dừng nếu thiếu).

nginx của app nhận thân request tới 6 MB ở route tải ảnh `/api/sites/<id>/images`, 101 MB ở route tải zip
`/api/sites/<id>/zip` (chuyển thẳng cho server, server đếm byte và dừng quá 100 MB), 2 MB ở webhook `/hooks/git/<id>`;
mọi chỗ khác vẫn 64 KB (form đặt hàng `/f/` 16 KB). Luồng sự kiện build (`/api/builds/<id>/events`) là SSE: server gửi
`X-Accel-Buffering: no` và một dòng ping mỗi 15 giây. `/f/` và `/hooks/chat` đi vào server như `/api/`. Giới hạn đơn theo IP dùng
`$remote_addr` mà nginx chuyển trong `X-Forwarded-For` (server tin proxy loopback, `trust proxy`): nó phải là IP của
khách, không phải IP edge của Cloudflare. `.65` không đặt real_ip toàn cục, nên hai server block 443 trong
`webnhanh.hoandat.com.conf` tự khai `real_ip_header CF-Connecting-IP` và `set_real_ip_from` cho mọi dải IP của
Cloudflare (lấy từ https://www.cloudflare.com/ips ngày 28/10/2026). Cloudflare đổi danh sách thì sửa cả hai chỗ. Trước
28/10/2026 chưa có real_ip: giới hạn theo IP của `/f/` đếm theo node Cloudflare.

**Quay lại bản trước bằng tay:** `cd /var/www/webnhanh && rm -rf app && mv app.prev app && systemctl restart webnhanh-server
webnhanh-worker`.
Migration chỉ thêm, bản trước vẫn chạy được trên schema mới.

## Kiểm máy build

```bash
systemctl is-active docker webnhanh-build-network webnhanh-builder      # active ×3
id webnhanh-builder                                                     # uid=10001 gid=10001, nhóm docker
iptables -S WEBNHANH-BUILD; iptables -S WEBNHANH-BUILD-IN               # các dòng REJECT như build-network.sh
iptables -S DOCKER-USER | head -3; iptables -S INPUT | head -3          # jump vào hai chuỗi trên, ở đầu
docker network inspect -f '{{index .Options "com.docker.network.bridge.name"}}' webnhanh-build   # wn-build0
journalctl -u webnhanh-builder -n 20                                    # "webnhanh builder: image ..., needs 1536 MB ..."
sudo -u webnhanh test -r /etc/webnhanh/production.env && sudo -u webnhanh-builder test ! -r /etc/webnhanh/production.env && echo ok
```

Thử độc từ trong mạng build (chạy bằng root, cùng cờ như builder):

```bash
run() { docker run --rm --user 10001:10001 --read-only --tmpfs /tmp:size=256m --cap-drop ALL \
  --security-opt no-new-privileges --pids-limit 256 --memory 1g --memory-swap 1g --cpus 1 "$@"; }
run --network webnhanh-build webnhanh-build:node22 node -e "fetch('https://registry.npmjs.org/').then(r=>console.log('npm', r.status))"   # npm 200
for ip in 127.0.0.1 172.17.0.1 192.168.122.1 <SERVER_65_IP> 100.100.100.100 169.254.169.254; do
  run --network webnhanh-build webnhanh-build:node22 node -e "fetch('http://$ip/',{signal:AbortSignal.timeout(4000)}).then(r=>console.log('$ip OPEN',r.status),e=>console.log('$ip blocked',e.cause?.code??e.name))"
done                                                                   # blocked ×6
run --network webnhanh-build webnhanh-build:node22 node -e "require('net').connect(5432,'172.30.254.1').on('connect',()=>console.log('OPEN')).on('error',e=>console.log('blocked',e.code))"   # blocked
run --network none webnhanh-build:node22 cat /etc/shadow               # Permission denied (không phải root)
run --network none webnhanh-build:node22 node -e "const a=[];for(;;)a.push(Buffer.alloc(1e8,1))"; echo "exit $?"   # exit 137 (hết 1 GB)
run --network none webnhanh-build:node22 sh -c ':(){ :|:& };:'; echo "exit $?"   # bị chặn ở 256 tiến trình, máy không ảnh hưởng
```

Repo độc thật (đẩy lên GitHub công khai rồi deploy trong app): `postinstall`/script build gọi `127.0.0.1`,
`172.17.0.1`, `192.168.122.1`, IP `.65`, đọc `/etc/shadow`, cấp 2 GB RAM, fork bomb, `sleep 400`: mỗi build phải lỗi
(hoặc bị kill sau 5 phút) với câu giải thích tương ứng, site cũ vẫn chạy, `free -m` trong lúc build vẫn còn RAM cho các
app khác. Ghi thời gian build lần đầu và lần có cache (Vite + React, Astro, HTML thuần, monorepo pnpm, Next export, zip).

## Đổi tên sang Web Nhanh (28/10/2026)

App chuyển từ `trang.hoandat.com` sang `webnhanh.hoandat.com`; site người dùng vẫn ở `<tên>.hoandat.io.vn`.

- **nginx:** `release` cài `webnhanh.hoandat.com.conf` và gỡ `/etc/nginx/conf.d/trang.hoandat.com.conf` trong cùng một
  bước (cả hai cùng nhận `server_name trang.hoandat.com`; `nginx -t` hỏng thì trả lại cả hai file, không reload).
  Tên cũ trả 301 về `https://webnhanh.hoandat.com$request_uri` (cổng 80 và 443, cùng chứng chỉ gốc), mọi đường dẫn: chưa trang nào
  đăng dưới tên cũ có form đặt hàng, và bot Chat được tạo sau khi đổi tên. `hoandat.io.vn` (tên miền gốc) chuyển về `https://webnhanh.hoandat.com/`.
- **Thứ tự:** DNS `webnhanh.hoandat.com` (proxied) và redirect URI mới ở IdP trước, rồi `release`, rồi `hosting`.
- **Env:** `PUBLIC_URL=https://webnhanh.hoandat.com`, `AUTH_CLIENT_ID=webnhanh-web` (hoặc bỏ trống), `DATABASE_URL` trỏ
  database và role `webnhanh`. Trang đăng sau khi đổi có footer "Làm bằng Web Nhanh" và form gửi về origin mới.
- **IdP:** client `webnhanh-web` ở `auth-next` với redirect `https://webnhanh.hoandat.com/auth/callback`.
- **Bot Chat:** đặt lại webhook thành `https://webnhanh.hoandat.com/hooks/chat` (secret giữ nguyên).
- **Người dùng:** phiên cũ (cookie `__Host-trang_session` trên tên cũ) không theo sang: đăng nhập lại một lần. Máy đã
  bật Web Push vẫn nhận báo đơn; bấm thông báo mở tên cũ rồi được chuyển sang tên mới.

## Kiểm sau khi đổi

```bash
curl -s https://webnhanh.hoandat.com/healthz            # ok
curl -s -o /dev/null -w '%{http_code}\n' https://webnhanh.hoandat.com/api/me   # 401 khi chưa đăng nhập
curl -sI https://kiem-tra.hoandat.io.vn/            # 200, không Set-Cookie (site kiểm tra, tên giữ chỗ)
curl -sI https://khong-co-trang.hoandat.io.vn/      # 404, trang 404 chung
curl -sI https://hoandat.io.vn/                     # 302 về webnhanh.hoandat.com
curl -sI https://trang.hoandat.com/sites            # 301 về https://webnhanh.hoandat.com/sites
systemctl is-active webnhanh-worker                    # active
journalctl -u webnhanh-server -n 20 | grep -i webp     # không có dòng "cannot write WebP"
journalctl -u webnhanh-server -n 20 | grep 'order notifications'   # push on/off, chat on/off như env
curl -s -o /dev/null -w '%{http_code}\n' -X POST https://webnhanh.hoandat.com/f/khong-co-trang   # 404
journalctl -u webnhanh-worker -n 50 | grep -i 'share picture'      # không có "no share picture" sau một lần đăng
```

Đổi tên một trang đã đăng: tên cũ được giữ 7 ngày (`site_name_holds`), lần đăng dưới tên mới gỡ thư mục tên cũ nên tên
cũ trả 404 chung; trang chưa từng đăng thì đổi tên không giữ chỗ.

## Kiểm sau khi có các mẫu mới

Migration `0005_rsvp-live-page` (chỉ thêm: cột `sites.live_page`, `submissions.kind` nhận thêm `rsvp`) chạy khi server
khởi động. Không có biến env mới.

```bash
# Trong app: tạo một thiệp cưới, đăng, mở trang, gửi một xác nhận tham dự.
journalctl -u webnhanh-server -n 50 | grep -i 'rsvp not stored'   # không có dòng nào
# Hôm sau (sau 0 giờ giờ Việt Nam, khi hàng đợi trống):
journalctl -u webnhanh-worker --since today | grep 'wedding refresh'  # "countdown rendered again" cho mỗi thiệp chưa qua ngày cưới
```

Trang đăng trước bản này chưa có `live_page`: thiệp cưới chỉ được làm mới mỗi ngày sau lần đăng kế tiếp. Mỗi lần làm
mới là một bản phát hành mới (giữ 3 bản), nên với thiệp cưới đang đếm ngược, bản để quay lại tay là các lần làm mới gần
nhất, không phải lần đăng trước của chủ trang. Quay lại bản app trước: bản cũ đọc xác nhận tham dự như đơn hàng (thiếu
địa chỉ, sản phẩm) trong hộp đơn; chỉ ảnh hưởng chủ thiệp cưới.

## Kiểm sau khi có kiểu mẫu (biến thể)

Không migration, không biến env mới: nháp là JSON, trường `ornaments` của thiệp Tết và thiệp cưới là tuỳ chọn. Ảnh của
kiểu mẫu đi cùng mã trong `packages/templates/library/` (deploy chép cả `packages`). Trong app: `/new`, chọn "Thiệp chúc
Tết", chọn một kiểu, tạo, xem trước thấy ảnh và hoạ tiết của kiểu đó, đăng, mở trang. Quay lại bản app trước: schema cũ (strict) không
đọc được nháp có `ornaments`, nên thiệp Tết và thiệp cưới tạo từ kiểu không sửa, không đăng được cho tới khi lên lại bản
này; site khác không ảnh hưởng.

## Chống lạm dụng

Có từ bản thêm migration `0006_abuse-reports-admin` (chỉ thêm: bảng `abuse_reports`, `admin_actions`; cột
`accounts.locked_at`, `sites.pending_release_id`, `pending_review`, `taken_down_at`, `takedown_release_id`;
`notification_deliveries` thêm `report_id`, `review_site_id` và nới ràng buộc "đúng một chủ đề"). Bản app trước vẫn chạy
trên schema này.

- **Báo cáo:** `https://webnhanh.hoandat.com/bao-cao?site=<tên>` (cũng `/report`), không cần đăng nhập; mọi trang mẫu
  đăng sau bản này có link "Báo cáo vi phạm" ở chân trang; mọi site (cả site lập trình viên, không sửa HTML của họ) có
  `https://<tên>.hoandat.io.vn/.well-known/report` (nginx, 302) và trang 404 chung nhắc tới form. Email thay thế:
  `noreply@hoandat.io.vn` (hộp thư chung của tên miền, đọc và trả lời trong 30 ngày). Mỗi IP 5 báo cáo mỗi giờ.
- **Admin:** đặt `ADMIN_SUBS` trong `production.env` (lấy `sub` của tài khoản ở `auth-next`), khởi động lại
  `webnhanh-server` và `webnhanh-worker`. Admin vào `https://webnhanh.hoandat.com/admin` (người khác nhận "Không có
  trang này"; API trả 404).
- **Gỡ site (một thao tác):** ở `/admin`, bấm "Gỡ website" ở báo cáo hoặc sau khi tìm theo địa chỉ. Ngay lúc đó site
  thôi nhận đơn, không đăng hay build được (job đang chờ của site bị huỷ), báo cáo kèm theo thành "Đã xử lý"; trong
  khoảng một giây worker đổi `current` sang trang "Website này đã bị gỡ" (một bản phát hành riêng có `index.html` và
  `404.html`, nên mọi đường dẫn đều hiện trang này). Các bản cũ được giữ 30 ngày để xem lại
  (`/var/www/webnhanh/sites/<tên>/releases/`), sau đó worker xoá, chỉ còn trang "đã bị gỡ". "Khôi phục" đưa bản đang
  chạy trước khi gỡ lên lại; quá 30 ngày thì site thành bản nháp, chủ trang tự đăng lại.
- **Khoá tài khoản:** "Khoá tài khoản" ở `/admin`: website đã đăng vẫn chạy (gỡ riêng nếu cần), nhưng tài khoản không
  đăng, không build được (job đang chờ bị huỷ, push mới bị bỏ); chủ tài khoản thấy thông báo bị khoá. "Mở khoá" trả lại.
- **Chờ duyệt:** worker kiểm mọi lần phát (trang mẫu và output build, kể cả file JS): có ô `<input type="password">`,
  tiêu đề mang tên ngân hàng, ví điện tử, cơ quan nhà nước, hoặc trang nhắc các tên đó (hay thương hiệu lớn) kèm lời
  hỏi đăng nhập, mật khẩu, mã OTP, xác minh. Bản bị giữ được chép vào `releases/` nhưng không đổi `current` (bản đang
  chạy, nếu có, vẫn chạy và vẫn nhận đơn), chủ trang thấy "Đang chờ duyệt", admin được báo. "Duyệt, cho đăng" đưa bản
  đó lên như một lần đăng; "Từ chối" xoá bản đó.
- **Nhật ký:** mọi thao tác admin (kể cả ghi chú) nằm trong bảng `admin_actions`, xem ở `/admin`; thao tác chạm file
  ghi "đang áp dụng" cho tới khi worker làm xong (`journalctl -u webnhanh-worker | grep 'admin '`).

Triển khai: `release` (migration tự chạy, nginx app không đổi), rồi `hosting` (nginx `hoandat.io.vn.conf` có thêm
`/.well-known/report`, trang 404 chung mới). Kiểm:

```bash
curl -sI https://kiem-tra.hoandat.io.vn/.well-known/report | grep -i location   # https://webnhanh.hoandat.com/bao-cao?site=kiem-tra
curl -s -o /dev/null -w '%{http_code}\n' https://webnhanh.hoandat.com/api/admin/reports   # 404 khi chưa đăng nhập
journalctl -u webnhanh-worker -n 50 | grep -E 'held for review|admin '          # sau khi thử một site có ô mật khẩu
```

Thử trọn vòng: báo cáo một site thử ở `/bao-cao` → admin nhận tin Chat → "Gỡ website" → site hiện "Website này đã bị
gỡ" → "Khôi phục". Đăng một site lập trình viên có ô mật khẩu → chủ trang thấy "Đang chờ duyệt", site chưa lên → duyệt.

## Xoá website và phút build

Có từ bản thêm migration `0007_site-deletion` (bảng `site_deletions`; `site_name_holds.site_id` thành tuỳ chọn, khoá
ngoại chuyển từ `cascade` sang `set null` để tên của site đã xoá vẫn được giữ). Bản app trước vẫn chạy trên schema này
(chỉ không đọc bảng mới). Không có biến env mới.

- **Phút build:** mỗi tài khoản 60 phút build mỗi ngày (giờ Việt Nam), thay cho 5 lượt. Tính từ lúc builder bắt đầu
  một build tới lúc nó giao output, lỗi hay hết giờ (build đang chạy tính phần đã chạy); thời gian chờ hàng đợi, build
  bỏ qua vì không đổi gì và build lại do đổi tên không tính. Còn dưới 60 phút thì build mới được bắt đầu và chạy tới
  giới hạn 5 phút của nó. Push khi đã hết phút được ghi vào lịch sử là bỏ qua (mã vẫn là `daily-limit`). API:
  `limits: { buildMinutesPerDay, usedMinutesToday, developerSites }`, hết phút trả `429 { error: 'daily-limit', limit: 60 }`.
- **Xoá website:** `DELETE /api/sites/<id>` với `{ "confirm": "<tên>" }` (site của tài khoản khác 404, tên sai 400
  `confirm-name`). Từ chối khi site còn job đăng hoặc build đang chờ hay đang chạy (409 `job-active`), khi site bị admin
  gỡ (403 `site-removed`) hay tài khoản bị khoá (403 `account-locked`), và khi còn báo cáo vi phạm chưa xử lý (409
  `report-open`): bằng chứng giữ nguyên tới khi admin quyết. Xoá được thì trong một transaction: xoá dòng `sites` (đơn,
  phản hồi, ảnh, job, log build, bản phát hành, nguồn và secret webhook đi theo), trả lại tên ngay (cả tên
  cũ còn giữ do đổi tên; chủ đã chủ động xoá nên không giữ tên, quyết định của user 28/10/2026), `abuse_reports` và `admin_actions` còn nguyên (id site thành null,
  giữ tên), thời gian build hôm nay của site vẫn tính cho tài khoản, chỗ trống trong hạn mức site có ngay. Server xoá zip
  tải lên của site; worker gỡ site khỏi web và xoá ảnh trong vòng một vòng lặp (bỏ qua tên đã thuộc một site khác không còn là nháp); cache build và zip sót của site đã xoá
  được builder dọn trong lần bảo trì mỗi giờ.

Triển khai: `release` (migration tự chạy). Kiểm:

```bash
journalctl -u webnhanh-worker -n 50 | grep 'site deleted'     # "site deleted <tên>: done" sau khi xoá thử một site
ls /var/www/webnhanh/sites/ | grep -x '<tên>'                   # không còn
curl -s -o /dev/null -w '%{http_code}\n' https://<tên>.hoandat.io.vn/   # 404 chung
```

Quay lại bản app trước: site đã xoá vẫn đã xoá; tên của chúng còn được giữ (bản cũ đọc `site_name_holds` như cũ); hàng
đợi `site_deletions` chưa làm thì nằm đó tới khi lên lại bản này.

## Lịch sử

- 28/10/2026: `/etc/nginx/conf.d/openapi.conf` (trang OpenAPI cũ từ 12/2025, chỉ cổng 80, cho `hoandat.io.vn`) đổi
  tên thành `openapi.conf.retired-20261028` vì trùng `server_name`; `/var/www/openapi` giữ nguyên.
- 28/10/2026: đổi tên sản phẩm Trang Của Tôi (`trang.hoandat.com`) thành Web Nhanh (`webnhanh.hoandat.com`), cùng mọi
  tên nội bộ `trang` → `webnhanh` (repo `webnhanh-next`, GitHub `achoo254/webnhanh-next`).
