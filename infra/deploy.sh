#!/usr/bin/env bash
# Deploys Trang Của Tôi to the shared server (.65). Run from a dev machine at any path inside the repo.
#
#   SSH_TARGET=<user>@<SERVER_65_IP> SSH_OPTS="-p <SSH_PORT> -i <key>" bash infra/deploy.sh setup
#   SSH_TARGET=... SSH_OPTS=... bash infra/deploy.sh hosting
#   SSH_TARGET=... SSH_OPTS=... bash infra/deploy.sh release
#
# setup    one-time and idempotent: system user `trang` (nginx joins its group to read the sites and the web app),
#          /var/www/trang with sites/ (setgid, so everything published inside stays readable by the group),
#          uploads/ (photos of the editor, never served by nginx) and static/, /etc/trang, the systemd units. It writes no secret: /etc/trang/production.env comes from the
#          iCloud env folder "ENV production/trang-next/" (see docs/deployment-guide.md). The database is a separate
#          step of that guide.
# hosting  installs the shared pages (infra/static) and the nginx site for *.hoandat.io.vn: nginx -t first, the
#          previous config restored if it fails, reload only when the config changed.
# release  gates and build here, upload, `pnpm install --prod` for the server and the worker on the server, switch
#          app/ (the previous one kept as app.prev), install changed units and the nginx site of trang.hoandat.com
#          (nginx -t first), restart trang-server and check /healthz (on failure switch back to app.prev, restart,
#          exit 1), then restart trang-worker.
#
# Rollback of the app: ssh in, `cd /var/www/trang && rm -rf app && mv app.prev app && systemctl restart trang-server
# trang-worker`.
# The database only ever gains migrations that keep the previous release working. Published sites are never
# touched here.
set -euo pipefail

: "${SSH_TARGET:?set SSH_TARGET to the ssh target of the server}"
read -r -a ssh_opts <<<"${SSH_OPTS:-}"
REMOTE=/var/www/trang
PORT=4860
PNPM="npx --yes pnpm@11.9.0"
export COPYFILE_DISABLE=1

cd "$(git rev-parse --show-toplevel)"

remote() { ssh "${ssh_opts[@]}" "$SSH_TARGET" "$@"; }

# Installs nginx/<conf> of the uploaded tree in $1 as /etc/nginx/conf.d/<conf>: nginx -t first, the previous config
# restored if it fails, reload only when the config changed. Expanded into the remote scripts below.
install_nginx_site='install_nginx_site() {
		src=$1/nginx/$2
		conf=/etc/nginx/conf.d/$2
		if cmp -s $src $conf; then
			echo "nginx $2 unchanged"
			return 0
		fi
		[ -f $conf ] && cp $conf $conf.prev
		cp $src $conf
		if ! nginx -t; then
			if [ -f $conf.prev ]; then mv $conf.prev $conf; else rm -f $conf; fi
			echo "nginx -t failed: $2 restored, nothing reloaded" >&2
			exit 1
		fi
		systemctl reload nginx
		echo "nginx $2 installed and reloaded"
	}'

setup() {
	tar --no-xattrs -czf - infra/systemd | remote "set -euo pipefail
		rm -rf /tmp/trang-setup && mkdir -p /tmp/trang-setup && tar xzf - --no-same-owner -C /tmp/trang-setup
		id trang >/dev/null 2>&1 || useradd --system --home-dir $REMOTE --shell /sbin/nologin trang
		usermod -aG trang nginx
		mkdir -p $REMOTE/sites $REMOTE/uploads $REMOTE/static /etc/trang
		chown trang:trang $REMOTE $REMOTE/sites $REMOTE/uploads && chmod 2750 $REMOTE/sites && chmod 750 $REMOTE $REMOTE/uploads
		chown root:trang $REMOTE/static && chmod 750 $REMOTE/static
		chown root:trang /etc/trang && chmod 750 /etc/trang
		install -m 644 /tmp/trang-setup/infra/systemd/* /etc/systemd/system/
		systemctl daemon-reload
		rm -rf /tmp/trang-setup
		[ -s /etc/trang/production.env ] || echo 'next: write /etc/trang/production.env (docs/deployment-guide.md)'
		echo setup done"
}

hosting() {
	tar --no-xattrs -czf - infra/static infra/nginx | remote "set -euo pipefail
		rm -rf /tmp/trang-hosting && mkdir -p /tmp/trang-hosting && tar xzf - --no-same-owner -C /tmp/trang-hosting
		cd /tmp/trang-hosting/infra
		install -m 640 -o root -g trang static/* $REMOTE/static/
		$install_nginx_site
		install_nginx_site /tmp/trang-hosting/infra hoandat.io.vn.conf
		rm -rf /tmp/trang-hosting"
}

release() {
	echo "== gates and build"
	$PNPM install --frozen-lockfile
	$PNPM lint
	$PNPM typecheck
	$PNPM test
	$PNPM build

	echo "== upload"
	# The release keeps the workspace layout: the bundles find the migrations through @trang/db and the template's
	# sample photos through @trang/templates.
	tar --no-xattrs -czf - package.json pnpm-lock.yaml pnpm-workspace.yaml infra packages \
		apps/server/package.json apps/server/dist apps/worker/package.json apps/worker/dist apps/web/package.json apps/web/dist |
		remote "set -euo pipefail; rm -rf $REMOTE/incoming; mkdir -p $REMOTE/incoming; tar xzf - --no-same-owner -C $REMOTE/incoming"

	echo "== install, switch, restart"
	remote "set -euo pipefail
		[ -s /etc/trang/production.env ] || { echo 'no /etc/trang/production.env: run setup and write it first' >&2; exit 1; }
		[ -d $REMOTE/uploads ] || { echo 'no $REMOTE/uploads: run setup first' >&2; exit 1; }
		export PATH=/opt/node22/bin:\$PATH
		cd $REMOTE/incoming
		$PNPM install --prod --frozen-lockfile --filter '@trang/server...' --filter '@trang/worker...' --reporter=silent
		chown -R root:trang $REMOTE/incoming && chmod -R g+rX,o-rwx $REMOTE/incoming
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
		install_nginx_site $REMOTE/app/infra trang.hoandat.com.conf

		healthy() {
			for i in \$(seq 1 20); do
				curl -fsS http://127.0.0.1:$PORT/healthz >/dev/null && return 0
				sleep 1
			done
			return 1
		}
		systemctl enable trang-server >/dev/null
		systemctl restart trang-server
		if ! healthy; then
			journalctl -u trang-server -n 40 --no-pager
			if [ -d app.prev ]; then
				echo 'healthz failed: switching back to the previous release' >&2
				rm -rf app.failed && mv app app.failed && mv app.prev app
				systemctl restart trang-server
				systemctl is-enabled --quiet trang-worker && systemctl restart trang-worker
				healthy && echo 'previous release is back and healthy' >&2 || echo 'previous release is not healthy either' >&2
			fi
			exit 1
		fi
		echo healthz ok
		systemctl enable trang-worker >/dev/null
		systemctl restart trang-worker
		sleep 3
		systemctl is-active --quiet trang-worker || { journalctl -u trang-worker -n 40 --no-pager; echo 'trang-worker is not running' >&2; exit 1; }
		echo worker ok"
}

case "${1:-}" in
	setup) setup ;;
	hosting) hosting ;;
	release) release ;;
	*) echo "usage: $0 setup|hosting|release" >&2; exit 2 ;;
esac
