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
# release  gates and build here, pack the release (infra/pack-release.sh, the same tree CI uploads: bundles, web app
#          and production node_modules, no links), upload it to /var/www/webnhanh-deploy/incoming/<id> and infra/ as
#          the root-owned /var/www/webnhanh-deploy/infra. From that copy: refresh /usr/local/sbin/webnhanh-activate-
#          incoming, install changed units (the replaced one kept in /var/www/webnhanh-deploy/systemd.prev), the nginx
#          site of webnhanh.hoandat.com (nginx -t first; it replaces the old trang.hoandat.com.conf, whose name it also
#          serves) and, with /etc/webnhanh/builder.env present, build the image webnhanh-build:node22 and (re)apply the
#          build network and its firewall (webnhanh-build-network). Then switch with webnhanh-activate-incoming
#          (infra/activate-incoming.sh), the same switch every push to main runs through CI
#          (.github/workflows/deploy.yml): app/ replaced (the previous one kept as app.prev), webnhanh-server restarted
#          and checked on /healthz (on failure app.prev comes back, exit 1), then webnhanh-worker and webnhanh-builder.
#          CI never changes nginx, units or root scripts: deploy by hand after changing anything under infra/.
#
# Rollback of the app: ssh in, `cd /var/www/webnhanh && rm -rf app && mv app.prev app && systemctl restart webnhanh-server
# webnhanh-worker` (and webnhanh-builder when developer builds are on).
# The database only ever gains migrations that keep the previous release working. Published sites are never
# touched here.
set -euo pipefail

: "${SSH_TARGET:?set SSH_TARGET to the ssh target of the server}"
read -r -a ssh_opts <<<"${SSH_OPTS:-}"
REMOTE=/var/www/webnhanh
DEPLOY_ROOT=/var/www/webnhanh-deploy
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
	# The release id names the commit; a tree with uncommitted changes would ship something else under its name.
	git diff --quiet HEAD -- || { echo 'uncommitted changes: commit them first' >&2; exit 1; }
	git fetch --quiet origin main
	if ! git merge-base --is-ancestor HEAD origin/main; then
		echo "HEAD $(git rev-parse --short HEAD) is not on origin/main: push it first" >&2
		exit 1
	fi
	echo "== gates and build"
	$PNPM install --frozen-lockfile
	$PNPM lint
	$PNPM typecheck
	$PNPM test
	$PNPM build

	echo "== pack"
	id="$(date -u +%Y%m%d-%H%M%S)-$(git rev-parse --short=12 HEAD)"
	pack_dir="$(mktemp -d)"
	trap 'rm -rf "$pack_dir"' EXIT
	PNPM="$PNPM" bash infra/pack-release.sh "$pack_dir/release"

	echo "== upload $id"
	# The reviewed infra copy (nginx, units, builder image, the root scripts): root-owned, replaced whole.
	tar --no-xattrs -czf - infra | remote "set -euo pipefail
		install -d -m 755 -o root -g root $DEPLOY_ROOT
		[ -d $DEPLOY_ROOT/incoming ] || install -d -m 750 -o root -g root $DEPLOY_ROOT/incoming
		rm -rf $DEPLOY_ROOT/infra.new && install -d -m 700 -o root -g root $DEPLOY_ROOT/infra.new
		tar xzf - --no-same-owner --strip-components=1 -C $DEPLOY_ROOT/infra.new
		chown -R root:root $DEPLOY_ROOT/infra.new && chmod -R go-w $DEPLOY_ROOT/infra.new
		rm -rf $DEPLOY_ROOT/infra.old
		[ -d $DEPLOY_ROOT/infra ] && mv $DEPLOY_ROOT/infra $DEPLOY_ROOT/infra.old
		mv $DEPLOY_ROOT/infra.new $DEPLOY_ROOT/infra && rm -rf $DEPLOY_ROOT/infra.old"
	tar --no-xattrs -czf - -C "$pack_dir/release" . | remote "set -euo pipefail
		rm -rf $DEPLOY_ROOT/incoming/$id && mkdir -p $DEPLOY_ROOT/incoming/$id
		tar xzf - --no-same-owner -C $DEPLOY_ROOT/incoming/$id"

	echo "== infra"
	remote "set -euo pipefail
		infra=$DEPLOY_ROOT/infra
		install -m 755 -o root -g root \$infra/activate-incoming.sh /usr/local/sbin/webnhanh-activate-incoming

		# Changed units are installed; the replaced file is kept in $DEPLOY_ROOT/systemd.prev.
		changed=0
		for unit in \$infra/systemd/*; do
			name=\$(basename \$unit)
			if ! cmp -s \$unit /etc/systemd/system/\$name; then
				if [ -f /etc/systemd/system/\$name ]; then
					install -d -m 700 $DEPLOY_ROOT/systemd.prev
					cp /etc/systemd/system/\$name $DEPLOY_ROOT/systemd.prev/\$name
				fi
				install -m 644 \$unit /etc/systemd/system/\$name
				changed=1
				echo \"unit \$name installed\"
			fi
		done
		[ \$changed = 1 ] && systemctl daemon-reload

		$install_nginx_site
		# The app moved from trang.hoandat.com (28/10/2026); the new file serves both names and replaces the old one.
		install_nginx_site \$infra webnhanh.hoandat.com.conf trang.hoandat.com.conf

		if [ -s /etc/webnhanh/builder.env ]; then
			docker build --pull=false -t webnhanh-build:node22 \$infra/builder
			systemctl enable webnhanh-build-network >/dev/null
			systemctl restart webnhanh-build-network
			echo 'build image and network ok'
		fi"

	echo "== switch"
	remote "/usr/local/sbin/webnhanh-activate-incoming $id"
}

case "${1:-}" in
	setup) setup ;;
	hosting) hosting ;;
	release) release ;;
	*) echo "usage: $0 setup|hosting|release" >&2; exit 2 ;;
esac
