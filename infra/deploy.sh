#!/usr/bin/env bash
# Deploys Trang Của Tôi's hosting to the shared server (.65). Run from a dev machine at any path inside the repo.
#
#   SSH_TARGET=<user>@<SERVER_65_IP> SSH_OPTS="-p <SSH_PORT> -i <key>" bash infra/deploy.sh setup
#   SSH_TARGET=... SSH_OPTS=... bash infra/deploy.sh hosting
#
# setup    one-time and idempotent: system user `trang` (nginx joins its group to read the sites), /var/www/trang
#          with sites/ (setgid, so everything published inside stays readable by the group) and static/, /etc/trang.
#          It writes no secret: /etc/trang/production.env comes from the iCloud env folder "ENV production/trang-next/"
#          (see docs/deployment-guide.md). The database is a separate step of that guide.
# hosting  installs the shared pages (infra/static) and the nginx site for *.hoandat.io.vn: nginx -t first, the
#          previous config restored if it fails, reload only when the config changed.
#
# The app (server, worker, web) gets a `release` command once it exists; published sites are never touched here.
set -euo pipefail

: "${SSH_TARGET:?set SSH_TARGET to the ssh target of the server}"
read -r -a ssh_opts <<<"${SSH_OPTS:-}"
REMOTE=/var/www/trang
export COPYFILE_DISABLE=1

cd "$(git rev-parse --show-toplevel)"

remote() { ssh "${ssh_opts[@]}" "$SSH_TARGET" "$@"; }

setup() {
	remote "set -euo pipefail
		id trang >/dev/null 2>&1 || useradd --system --home-dir $REMOTE --shell /sbin/nologin trang
		usermod -aG trang nginx
		mkdir -p $REMOTE/sites $REMOTE/static /etc/trang
		chown trang:trang $REMOTE $REMOTE/sites && chmod 2750 $REMOTE/sites && chmod 750 $REMOTE
		chown root:trang $REMOTE/static && chmod 750 $REMOTE/static
		chown root:trang /etc/trang && chmod 750 /etc/trang
		[ -s /etc/trang/production.env ] || echo 'next: write /etc/trang/production.env (docs/deployment-guide.md)'
		echo setup done"
}

hosting() {
	tar --no-xattrs -czf - infra/static infra/nginx | remote "set -euo pipefail
		rm -rf /tmp/trang-hosting && mkdir -p /tmp/trang-hosting && tar xzf - --no-same-owner -C /tmp/trang-hosting
		cd /tmp/trang-hosting/infra
		install -m 640 -o root -g trang static/* $REMOTE/static/

		conf=/etc/nginx/conf.d/hoandat.io.vn.conf
		if cmp -s nginx/hoandat.io.vn.conf \$conf; then
			echo 'nginx config unchanged'
		else
			[ -f \$conf ] && cp \$conf \$conf.prev
			cp nginx/hoandat.io.vn.conf \$conf
			if ! nginx -t; then
				if [ -f \$conf.prev ]; then mv \$conf.prev \$conf; else rm -f \$conf; fi
				echo 'nginx -t failed: config restored, nothing reloaded' >&2
				exit 1
			fi
			systemctl reload nginx
			echo 'nginx config installed and reloaded'
		fi
		rm -rf /tmp/trang-hosting"
}

case "${1:-}" in
	setup) setup ;;
	hosting) hosting ;;
	*) echo "usage: $0 setup|hosting" >&2; exit 2 ;;
esac
