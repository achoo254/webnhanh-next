#!/usr/bin/env bash
# The network of the install step of developer builds, and the firewall around it. Idempotent: run as root at every
# boot and Docker restart (systemd webnhanh-build-network, after docker.service), and by `deploy.sh release`.
#
#   build-network.sh <public IPv4 of this server>
#
# The install step (npm/pnpm/yarn) may reach the internet over HTTP(S) and nothing else:
#   - forwarded traffic from the bridge (DOCKER-USER, chain WEBNHANH-BUILD): no loopback, private, link-local or tailnet
#     range (127/8, 10/8, 172.16/12, 192.168/16, 169.254/16, 100.64/10), not this server's public address, and beyond
#     that only TCP 80 and 443;
#   - traffic from the bridge to this server itself (INPUT, chain WEBNHANH-BUILD-IN): nothing at all (Postgres, nginx,
#     the other apps). Name resolution still works: Docker answers it inside the container and asks upstream from the
#     host.
# The build step runs with --network none and needs none of this.
set -euo pipefail

PUBLIC_IP=${1:-}
if ! [[ $PUBLIC_IP =~ ^([0-9]{1,3})\.([0-9]{1,3})\.([0-9]{1,3})\.([0-9]{1,3})$ ]]; then
	echo "usage: $0 <public IPv4 of this server>" >&2
	exit 2
fi
for octet in "${BASH_REMATCH[@]:1}"; do
	((octet <= 255)) || { echo "not an IPv4 address: $PUBLIC_IP" >&2; exit 2; }
done

NETWORK=webnhanh-build
BRIDGE=wn-build0
SUBNET=${BUILD_SUBNET:-172.30.254.0/24}
BLOCKED=(127.0.0.0/8 10.0.0.0/8 172.16.0.0/12 192.168.0.0/16 169.254.0.0/16 100.64.0.0/10 "$PUBLIC_IP/32")

if ! docker network inspect "$NETWORK" >/dev/null 2>&1; then
	docker network create --driver bridge --subnet "$SUBNET" \
		--opt com.docker.network.bridge.name="$BRIDGE" \
		--opt com.docker.network.bridge.enable_icc=false \
		"$NETWORK" >/dev/null
	echo "docker network $NETWORK created ($SUBNET, bridge $BRIDGE)"
fi
actual=$(docker network inspect -f '{{index .Options "com.docker.network.bridge.name"}}' "$NETWORK")
if [ "$actual" != "$BRIDGE" ]; then
	echo "docker network $NETWORK uses bridge '$actual', not $BRIDGE: remove it (docker network rm $NETWORK) and run again" >&2
	exit 1
fi
iptables -n -L DOCKER-USER >/dev/null 2>&1 || { echo 'no DOCKER-USER chain: is Docker running?' >&2; exit 1; }

# Forwarded traffic of the bridge: the chain is rebuilt from scratch each time.
iptables -N WEBNHANH-BUILD 2>/dev/null || true
iptables -F WEBNHANH-BUILD
for cidr in "${BLOCKED[@]}"; do
	iptables -A WEBNHANH-BUILD -d "$cidr" -j REJECT --reject-with icmp-net-prohibited
done
iptables -A WEBNHANH-BUILD -p tcp -m multiport --dports 80,443 -j RETURN
iptables -A WEBNHANH-BUILD -j REJECT --reject-with icmp-port-unreachable
iptables -C DOCKER-USER -i "$BRIDGE" -j WEBNHANH-BUILD 2>/dev/null || iptables -I DOCKER-USER 1 -i "$BRIDGE" -j WEBNHANH-BUILD

# Traffic of the bridge to this server itself is not forwarded, so DOCKER-USER never sees it: refused in INPUT.
iptables -N WEBNHANH-BUILD-IN 2>/dev/null || true
iptables -F WEBNHANH-BUILD-IN
iptables -A WEBNHANH-BUILD-IN -j REJECT --reject-with icmp-port-unreachable
iptables -C INPUT -i "$BRIDGE" -j WEBNHANH-BUILD-IN 2>/dev/null || iptables -I INPUT 1 -i "$BRIDGE" -j WEBNHANH-BUILD-IN

echo "build network rules in place (bridge $BRIDGE):"
iptables -S WEBNHANH-BUILD
iptables -S WEBNHANH-BUILD-IN
