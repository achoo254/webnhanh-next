#!/usr/bin/env bash
# Packs a built checkout (after `pnpm build`) into a self-contained release tree, the one thing both deploy paths
# upload (CI: .github/workflows/deploy.yml, by hand: infra/deploy.sh release):
#
#   bash infra/pack-release.sh <out-dir>
#
# The tree keeps the workspace layout: the bundles find the migrations through @webnhanh/db, the template's sample
# photos through @webnhanh/templates and the fonts through @fontsource. Its node_modules holds the production
# dependencies of the server and the worker, installed here (hoisted, no install scripts) and copied with every link
# resolved, so the server never runs a package manager on an upload and the root switch can refuse any link
# (infra/activate-incoming.sh). No infra/: the server keeps its own reviewed copy, installed by infra/deploy.sh.
set -euo pipefail

OUT="${1:?usage: pack-release.sh <out-dir>}"
PNPM="${PNPM:-pnpm}"
export COPYFILE_DISABLE=1

cd "$(git rev-parse --show-toplevel)"
for f in apps/server/dist/server.mjs apps/worker/dist/main.mjs apps/worker/dist/builder.mjs apps/web/dist/index.html; do
	[ -f "$f" ] || { echo "missing $f: run pnpm build first" >&2; exit 1; }
done
[ ! -e "$OUT" ] || { echo "$OUT already exists" >&2; exit 1; }

work="$(mktemp -d)"
trap 'rm -rf "$work"' EXIT

# Tracked and built files only: no node_modules or local leftovers from this checkout.
tar --no-xattrs -cf - --exclude=node_modules --exclude='*.test.ts' --exclude='*.test.tsx' \
	package.json pnpm-lock.yaml pnpm-workspace.yaml packages \
	apps/server/package.json apps/server/dist apps/worker/package.json apps/worker/dist apps/web/package.json apps/web/dist |
	tar -xf - -C "$work"

(
	cd "$work"
	$PNPM install --prod --frozen-lockfile --ignore-scripts --config.node-linker=hoisted \
		--filter '@webnhanh/server...' --filter '@webnhanh/worker...' --reporter=silent
)
# Command shims only (links into the packages); nothing at run time calls them.
find "$work" -type d -name .bin -prune -exec rm -rf {} +

mkdir -p "$(dirname "$OUT")"
cp -RL "$work" "$OUT"
links="$(find "$OUT" ! -type f ! -type d -print | head -5)"
[ -z "$links" ] || { echo "release still holds links or special files:" >&2; echo "$links" >&2; exit 1; }
echo "packed $OUT ($(du -sh "$OUT" | cut -f1))"
