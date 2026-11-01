#!/bin/bash
# Creates the restricted `webnhanh-deploy` user that GitHub Actions deploys with (run as root on the server, after one
# `infra/deploy.sh release` has put the root-owned infra copy in place; the public key comes on stdin):
#   bash /var/www/webnhanh-deploy/infra/setup-deploy-user.sh < webnhanh-deploy.pub
# With empty stdin (`< /dev/null`) it keeps the installed key and only reinstalls the sudo command. The user can only
# write /var/www/webnhanh-deploy/incoming and run one root-owned command through sudo:
# /usr/local/sbin/webnhanh-activate-incoming <release-id> (infra/activate-incoming.sh).
set -euo pipefail
USER_NAME=webnhanh-deploy
DEPLOY_ROOT=/var/www/webnhanh-deploy
[ "$(id -u)" -eq 0 ] || { echo "run as root" >&2; exit 1; }
[ -f "$DEPLOY_ROOT/infra/activate-incoming.sh" ] || { echo "no $DEPLOY_ROOT/infra: run infra/deploy.sh release first" >&2; exit 1; }

pub="$(cat)"
id "$USER_NAME" >/dev/null 2>&1 || useradd --create-home --shell /bin/bash "$USER_NAME"
home="$(getent passwd "$USER_NAME" | cut -d: -f6)"
if [ -n "$pub" ]; then
	[[ "$pub" =~ ^ssh-ed25519\ [A-Za-z0-9+/=]+(\ .*)?$ ]] || { echo "expected one ssh-ed25519 public key on stdin" >&2; exit 2; }
	install -d -m 700 -o "$USER_NAME" -g "$USER_NAME" "$home/.ssh"
	# `restrict`: no port/agent/X11 forwarding and no pty.
	printf 'restrict %s\n' "$pub" >"$home/.ssh/authorized_keys"
	chown "$USER_NAME:$USER_NAME" "$home/.ssh/authorized_keys"
	chmod 600 "$home/.ssh/authorized_keys"
elif [ ! -s "$home/.ssh/authorized_keys" ]; then
	echo "no key installed yet; pass the public key on stdin" >&2
	exit 2
fi

install -d -m 755 -o root -g root "$DEPLOY_ROOT"
install -d -m 750 -o "$USER_NAME" -g "$USER_NAME" "$DEPLOY_ROOT/incoming"
install -m 755 -o root -g root "$DEPLOY_ROOT/infra/activate-incoming.sh" /usr/local/sbin/webnhanh-activate-incoming
printf '%s ALL=(root) NOPASSWD: /usr/local/sbin/webnhanh-activate-incoming\n' "$USER_NAME" >/etc/sudoers.d/webnhanh-deploy
chmod 440 /etc/sudoers.d/webnhanh-deploy
visudo -cf /etc/sudoers.d/webnhanh-deploy
echo "setup-deploy-user: done"
