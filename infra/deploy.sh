#!/usr/bin/env bash
# Deploys Web Nhanh to the shared server (.65). Run from a dev machine at any path inside the repo.
#
#   SSH_TARGET=<user>@<SERVER_65_IP> SSH_OPTS="-p <SSH_PORT> -i <key>" bash infra/deploy.sh setup
#   SSH_TARGET=... SSH_OPTS=... bash infra/deploy.sh hosting
#   SSH_TARGET=... SSH_OPTS=... bash infra/deploy.sh release
#
# setup    one-time and idempotent: system user `webnhanh` (nginx joins its group to read the sites and the web app),
#          /var/www/webnhanh with sites/ (setgid, so everything published inside stays readable by the group),
#          uploads/ (photos of the editor, never served by nginx) and static/, /etc/webnhanh, the systemd units. It writes no secret: /etc/webnhanh/production.env comes from the
#          iCloud env folder "ENV production/webnhanh-next/" (see docs/deployment-guide.md). The database is a separate
#          step of that guide. Developer builds: system user and group `webnhanh-builder` with uid/gid 10001 (the uid
#          of the build user inside the containers) in group `docker`, /var/lib/webnhanh/builds/inbox (zips: server
#          writes, builder reads), builds/out (outputs: builder writes, worker reads), work/ and cache/ (builder only).
#          /etc/webnhanh/builder.env is written by hand too.
# hosting  installs the shared pages (infra/static) and the nginx site for *.hoandat.io.vn: nginx -t first, the
#          previous config restored if it fails, reload only when the config changed.
# release  gates and build here, upload, `pnpm install --prod` for the server and the worker on the server, switch
#          app/ (the previous one kept as app.prev), install changed units and the nginx site of webnhanh.hoandat.com
#          (nginx -t first; it replaces the old trang.hoandat.com.conf, whose name it also serves), restart
#          webnhanh-server and check /healthz (on failure switch back to app.prev, restart, exit 1), then restart
#          webnhanh-worker. With /etc/webnhanh/builder.env present: let webnhanh-builder read the app (ACL), build the
#          image infra/builder as webnhanh-build:node22, (re)apply the build network and its firewall
#          (webnhanh-build-network), restart webnhanh-builder.
#
# Rollback of the app: ssh in, `cd /var/www/webnhanh && rm -rf app && mv app.prev app && systemctl restart webnhanh-server
# webnhanh-worker`.
# The database only ever gains migrations that keep the previous release working. Published sites are never
# touched here.
set -euo pipefail

: "${SSH_TARGET:?set SSH_TARGET to the ssh target of the server}"
read -r -a ssh_opts <<<"${SSH_OPTS:-}"
REMOTE=/var/www/webnhanh
PORT=4860
PNPM="npx --yes pnpm@11.9.0"
export COPYFILE_DISABLE=1

cd "$(git rev-parse --show-toplevel)"

remote() { ssh "${ssh_opts[@]}" "$SSH_TARGET" "$@"; }

# Installs nginx/<conf> of the uploaded tree in $1 as /etc/nginx/conf.d/<conf>: nginx -t first, the previous config
# restored if it fails, reload only when the config changed. An optional third argument names a file in conf.d that
# the new one replaces (it claims the same server_name): it is taken out in the same step, so nginx never sees both,
# and put back if nginx -t fails. Expanded into the remote scripts below.
install_nginx_site='install_nginx_site() {
		src=$1/nginx/$2
		conf=/etc/nginx/conf.d/$2
		retired=
		[ -n "${3:-}" ] && [ -f /etc/nginx/conf.d/$3 ] && retired=/etc/nginx/conf.d/$3
		if cmp -s $src $conf && [ -z "$retired" ]; then
			echo "nginx $2 unchanged"
			return 0
		fi
		[ -f $conf ] && cp $conf $conf.prev
		cp $src $conf
		[ -n "$retired" ] && mv $retired $retired.retired
		if ! nginx -t; then
			if [ -f $conf.prev ]; then mv $conf.prev $conf; else rm -f $conf; fi
			[ -n "$retired" ] && mv $retired.retired $retired
			echo "nginx -t failed: $2 restored, nothing reloaded" >&2
			exit 1
		fi
		[ -n "$retired" ] && rm -f $retired.retired && echo "nginx $3 removed"
		systemctl reload nginx
		echo "nginx $2 installed and reloaded"
	}'

setup() {
	tar --no-xattrs -czf - infra/systemd | remote "set -euo pipefail
		rm -rf /tmp/webnhanh-setup && mkdir -p /tmp/webnhanh-setup && tar xzf - --no-same-owner -C /tmp/webnhanh-setup
		id webnhanh >/dev/null 2>&1 || useradd --system --home-dir $REMOTE --shell /sbin/nologin webnhanh
		usermod -aG webnhanh nginx
		mkdir -p $REMOTE/sites $REMOTE/uploads $REMOTE/static /etc/webnhanh
		chown webnhanh:webnhanh $REMOTE $REMOTE/sites $REMOTE/uploads && chmod 2750 $REMOTE/sites && chmod 750 $REMOTE $REMOTE/uploads
		chown root:webnhanh $REMOTE/static && chmod 750 $REMOTE/static
		chown root:webnhanh /etc/webnhanh && chmod 750 /etc/webnhanh

		# Developer builds. The builder's uid must be 10001: the containers run as 10001 and own what they write.
		getent group webnhanh-builder >/dev/null || groupadd --system --gid 10001 webnhanh-builder
		id webnhanh-builder >/dev/null 2>&1 || useradd --system --uid 10001 --gid webnhanh-builder --home-dir /var/lib/webnhanh --shell /sbin/nologin webnhanh-builder
		[ \"\$(id -u webnhanh-builder):\$(id -g webnhanh-builder)\" = 10001:10001 ] || { echo 'webnhanh-builder must be uid and gid 10001' >&2; exit 1; }
		if getent group docker >/dev/null; then usermod -aG docker webnhanh-builder; else echo 'no docker group: install Docker, then run setup again'; fi
		mkdir -p /var/lib/webnhanh/builds/inbox /var/lib/webnhanh/builds/out /var/lib/webnhanh/work /var/lib/webnhanh/cache
		chown root:root /var/lib/webnhanh /var/lib/webnhanh/builds && chmod 755 /var/lib/webnhanh /var/lib/webnhanh/builds
		chown webnhanh:webnhanh-builder /var/lib/webnhanh/builds/inbox && chmod 2770 /var/lib/webnhanh/builds/inbox
		chown webnhanh-builder:webnhanh /var/lib/webnhanh/builds/out && chmod 2750 /var/lib/webnhanh/builds/out
		chown webnhanh-builder:webnhanh-builder /var/lib/webnhanh/work /var/lib/webnhanh/cache && chmod 700 /var/lib/webnhanh/work /var/lib/webnhanh/cache
		[ -s /etc/webnhanh/builder.env ] || echo 'next: write /etc/webnhanh/builder.env (docs/deployment-guide.md, developer builds)'

		install -m 644 /tmp/webnhanh-setup/infra/systemd/* /etc/systemd/system/
		systemctl daemon-reload
		rm -rf /tmp/webnhanh-setup
		[ -s /etc/webnhanh/production.env ] || echo 'next: write /etc/webnhanh/production.env (docs/deployment-guide.md)'
		echo setup done"
}

hosting() {
	tar --no-xattrs -czf - infra/static infra/nginx | remote "set -euo pipefail
		rm -rf /tmp/webnhanh-hosting && mkdir -p /tmp/webnhanh-hosting && tar xzf - --no-same-owner -C /tmp/webnhanh-hosting
		cd /tmp/webnhanh-hosting/infra
		install -m 640 -o root -g webnhanh static/* $REMOTE/static/
		$install_nginx_site
		install_nginx_site /tmp/webnhanh-hosting/infra hoandat.io.vn.conf
		rm -rf /tmp/webnhanh-hosting"
}

release() {
	echo "== gates and build"
	$PNPM install --frozen-lockfile
	$PNPM lint
	$PNPM typecheck
	$PNPM test
	$PNPM build

	echo "== upload"
	# The release keeps the workspace layout: the bundles find the migrations through @webnhanh/db and the template's
	# sample photos through @webnhanh/templates.
	tar --no-xattrs -czf - package.json pnpm-lock.yaml pnpm-workspace.yaml infra packages \
		apps/server/package.json apps/server/dist apps/worker/package.json apps/worker/dist apps/web/package.json apps/web/dist |
		remote "set -euo pipefail; rm -rf $REMOTE/incoming; mkdir -p $REMOTE/incoming; tar xzf - --no-same-owner -C $REMOTE/incoming"

	echo "== install, switch, restart"
	remote "set -euo pipefail
		[ -s /etc/webnhanh/production.env ] || { echo 'no /etc/webnhanh/production.env: run setup and write it first' >&2; exit 1; }
		[ -d $REMOTE/uploads ] || { echo 'no $REMOTE/uploads: run setup first' >&2; exit 1; }
		export PATH=/opt/node22/bin:\$PATH
		cd $REMOTE/incoming
		$PNPM install --prod --frozen-lockfile --filter '@webnhanh/server...' --filter '@webnhanh/worker...' --reporter=silent
		chown -R root:webnhanh $REMOTE/incoming && chmod -R g+rX,o-rwx $REMOTE/incoming
		cd $REMOTE
		rm -rf app.prev
		[ -d app ] && mv app app.prev
		mv incoming app

		changed=0
		for unit in app/infra/systemd/*; do
			name=\$(basename \$unit)
			cmp -s \$unit /etc/systemd/system/\$name || { install -m 644 \$unit /etc/systemd/system/\$name; changed=1; }
		done
		[ \$changed = 1 ] && systemctl daemon-reload

		$install_nginx_site
		# The app moved from trang.hoandat.com (28/10/2026); the new file serves both names and replaces the old one.
		install_nginx_site $REMOTE/app/infra webnhanh.hoandat.com.conf trang.hoandat.com.conf

		healthy() {
			for i in \$(seq 1 20); do
				curl -fsS http://127.0.0.1:$PORT/healthz >/dev/null && return 0
				sleep 1
			done
			return 1
		}
		systemctl enable webnhanh-server >/dev/null
		systemctl restart webnhanh-server
		if ! healthy; then
			journalctl -u webnhanh-server -n 40 --no-pager
			if [ -d app.prev ]; then
				echo 'healthz failed: switching back to the previous release' >&2
				rm -rf app.failed && mv app app.failed && mv app.prev app
				systemctl restart webnhanh-server
				systemctl is-enabled --quiet webnhanh-worker && systemctl restart webnhanh-worker
				healthy && echo 'previous release is back and healthy' >&2 || echo 'previous release is not healthy either' >&2
			fi
			exit 1
		fi
		echo healthz ok
		systemctl enable webnhanh-worker >/dev/null
		systemctl restart webnhanh-worker
		sleep 3
		systemctl is-active --quiet webnhanh-worker || { journalctl -u webnhanh-worker -n 40 --no-pager; echo 'webnhanh-worker is not running' >&2; exit 1; }
		echo worker ok

		if [ ! -s /etc/webnhanh/builder.env ]; then
			echo 'no /etc/webnhanh/builder.env: developer builds stay off (docs/deployment-guide.md)'
			exit 0
		fi
		# The builder is not in group webnhanh (that would let it read production.env): an ACL lets it read the app.
		setfacl -m u:webnhanh-builder:x $REMOTE
		setfacl -R -m u:webnhanh-builder:rX $REMOTE/app
		docker build --pull=false -t webnhanh-build:node22 $REMOTE/app/infra/builder
		systemctl enable webnhanh-build-network >/dev/null
		systemctl restart webnhanh-build-network
		systemctl enable webnhanh-builder >/dev/null
		systemctl restart webnhanh-builder
		sleep 3
		systemctl is-active --quiet webnhanh-builder || { journalctl -u webnhanh-builder -n 40 --no-pager; echo 'webnhanh-builder is not running' >&2; exit 1; }
		echo builder ok"
}

case "${1:-}" in
	setup) setup ;;
	hosting) hosting ;;
	release) release ;;
	*) echo "usage: $0 setup|hosting|release" >&2; exit 2 ;;
esac
