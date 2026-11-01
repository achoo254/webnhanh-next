#!/bin/bash
# Switches Web Nhanh to an uploaded release. Root-owned; installed as /usr/local/sbin/webnhanh-activate-incoming by
# setup-deploy-user.sh and refreshed by every `infra/deploy.sh release`, which runs it too: CI and the manual deploy
# share this one switch. It is the only command the CI user `webnhanh-deploy` may run through sudo.
#
#   webnhanh-activate-incoming <release-id>          (id: YYYYMMDD-HHMMSS-<sha12>)
#
# The release (infra/pack-release.sh) waits in /var/www/webnhanh-deploy/incoming/<id>, writable by the deploy user.
# It is moved out of that user's reach before any check, must hold only plain files and directories with the bundles
# and the web app, then replaces /var/www/webnhanh/app (the previous one kept as app.prev). webnhanh-server is
# restarted and must answer /healthz, else app.prev comes back and the script exits 1; then webnhanh-worker, and
# webnhanh-builder when developer builds are on. Nothing of the upload reaches nginx, systemd or a root script: those
# change only through infra/deploy.sh, from the root-owned copy in /var/www/webnhanh-deploy/infra. Published sites,
# uploads and the database are never touched here.
set -euo pipefail
APP_ROOT=/var/www/webnhanh
DEPLOY_ROOT=/var/www/webnhanh-deploy
PORT=4860
ID="${1:?usage: webnhanh-activate-incoming <release-id>}"
[[ "$ID" =~ ^[0-9]{8}-[0-9]{6}-[0-9a-f]{12}$ ]] || { echo "bad release id" >&2; exit 2; }
SRC="$DEPLOY_ROOT/incoming/$ID"
STAGE="$DEPLOY_ROOT/staging"

# One switch at a time (CI and a manual deploy may meet).
exec 9>/run/webnhanh-activate.lock
flock -w 600 9 || { echo "another activation is still running" >&2; exit 1; }

[ -s /etc/webnhanh/production.env ] || { echo 'no /etc/webnhanh/production.env: run setup and write it first' >&2; exit 1; }
[ -d "$APP_ROOT/uploads" ] || { echo "no $APP_ROOT/uploads: run setup first" >&2; exit 1; }
[ -d "$SRC" ] && [ ! -L "$SRC" ] || { echo "incoming release $ID missing" >&2; exit 2; }

# Checks run only once the tree is root-owned in a root-only directory, so the deploy user cannot swap a checked file
# for a link in between.
install -d -m 700 -o root -g root "$STAGE"
rm -rf "${STAGE:?}/$ID"
mv "$SRC" "$STAGE/$ID"
NEW="$STAGE/$ID"
chown -R root:root "$NEW"
reject() {
	rm -rf "${NEW:?}"
	echo "incoming release $ID $1" >&2
	exit 2
}
[ -z "$(find "$NEW" ! -type f ! -type d -print -quit)" ] || reject "holds links or special files"
for f in apps/server/dist/server.mjs apps/worker/dist/main.mjs apps/worker/dist/builder.mjs apps/web/dist/index.html \
	packages/db/package.json; do
	[ -f "$NEW/$f" ] || reject "is incomplete: no $f"
done
# The app never reads infra/ (nginx, units and root scripts come from the root-owned copy); drop any that came along.
rm -rf "${NEW:?}/infra"
printf '%s\n' "$ID" >"$NEW/RELEASE"
printf '%s\n' "$ID" >"$NEW/apps/web/dist/RELEASE"
# The services and nginx (both in group webnhanh) read it; nobody but root writes it; no set-id bit survives.
chown -R root:webnhanh "$NEW"
chmod -R u=rwX,g=rX,o= "$NEW"
find "$NEW" -type f -perm /6000 -exec chmod ug-s {} +

cd "$APP_ROOT"
rm -rf app.prev
if [ -d app ]; then mv app app.prev; fi
mv "$NEW" app

healthy() {
	for _ in $(seq 1 20); do
		curl -fsS "http://127.0.0.1:$PORT/healthz" >/dev/null && return 0
		sleep 1
	done
	return 1
}
systemctl enable webnhanh-server >/dev/null
systemctl restart webnhanh-server
if ! healthy; then
	journalctl -u webnhanh-server -n 40 --no-pager || true
	if [ -d app.prev ]; then
		echo "release $ID failed /healthz: switching back to the previous release" >&2
		rm -rf app.failed && mv app app.failed && mv app.prev app
		systemctl restart webnhanh-server
		if systemctl is-enabled --quiet webnhanh-worker; then systemctl restart webnhanh-worker; fi
		if healthy; then echo 'previous release is back and healthy' >&2; else echo 'previous release is not healthy either' >&2; fi
	fi
	exit 1
fi
echo healthz ok
systemctl enable webnhanh-worker >/dev/null
systemctl restart webnhanh-worker
sleep 3
systemctl is-active --quiet webnhanh-worker || { journalctl -u webnhanh-worker -n 40 --no-pager || true; echo 'webnhanh-worker is not running' >&2; exit 1; }
echo worker ok

if [ ! -s /etc/webnhanh/builder.env ]; then
	echo 'no /etc/webnhanh/builder.env: developer builds stay off (docs/deployment-guide.md)'
else
	# The builder is not in group webnhanh (that would let it read production.env): an ACL lets it read the app.
	setfacl -m u:webnhanh-builder:x "$APP_ROOT"
	setfacl -R -m u:webnhanh-builder:rX "$APP_ROOT/app"
	systemctl enable webnhanh-builder >/dev/null
	systemctl restart webnhanh-builder
	sleep 3
	systemctl is-active --quiet webnhanh-builder || { journalctl -u webnhanh-builder -n 40 --no-pager || true; echo 'webnhanh-builder is not running' >&2; exit 1; }
	echo builder ok
fi
echo "webnhanh now runs $ID"
