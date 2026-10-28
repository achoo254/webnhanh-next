# The image every developer build runs in (apps/worker/src/build/run-build.ts): Node 22 LTS, pnpm and yarn through
# corepack, git (for packages installed from git). Built on the server by `infra/deploy.sh release` as
# webnhanh-build:node22.
#
# Base pinned by digest: node:22-bookworm-slim, Node 22.23.4, index digest of 28/10/2026. To move to a newer Node 22,
# look up the digest of the tag (docker buildx imagetools inspect node:22-bookworm-slim) and change it here.
FROM node:22-bookworm-slim@sha256:4b150b48b4116e2a22f2c39cc27025fbf4f153e2078fd3b14d159fdb5c7279da

# The image's own yarn 1 makes way for corepack's shims (yarn 1 or 4, and pnpm, as each project asks). The build user
# has the same uid and gid as webnhanh-builder on the server, so it owns what it writes in the job's directory.
RUN apt-get update \
 && apt-get install -y --no-install-recommends git ca-certificates \
 && rm -rf /var/lib/apt/lists/* \
 && rm -f /usr/local/bin/yarn /usr/local/bin/yarnpkg \
 && corepack enable \
 && groupadd --gid 10001 builder \
 && useradd --uid 10001 --gid 10001 --home-dir /build/home --no-create-home --shell /usr/sbin/nologin builder

# HOME and every cache live in the job's mounted directory (/build/home, the site's own cache): the rest of the image
# is read-only at run time. No telemetry, no update checks: the build step has no network anyway.
ENV HOME=/build/home \
    XDG_CACHE_HOME=/build/home/.cache \
    COREPACK_HOME=/build/home/.cache/node/corepack \
    COREPACK_ENABLE_DOWNLOAD_PROMPT=0 \
    NPM_CONFIG_UPDATE_NOTIFIER=false \
    NPM_CONFIG_FUND=false \
    NPM_CONFIG_AUDIT=false \
    NEXT_TELEMETRY_DISABLED=1 \
    ASTRO_TELEMETRY_DISABLED=1 \
    NUXT_TELEMETRY_DISABLED=1 \
    DO_NOT_TRACK=1

USER 10001:10001
WORKDIR /build/src
