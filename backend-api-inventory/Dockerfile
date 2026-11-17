# backend-api-inventory production image (ADR-0052 D1/D14, infra bundle document/infra/services/backend-api-inventory/1).
# Same Debian bookworm-slim Node 24 LTS family as backend-api-master; pinned to the 24.22.3 security release
# (2026-11-11) by multi-arch index digest. Build context is the repository root (see .dockerignore).
FROM node:24.22.3-bookworm-slim@sha256:dc26ae92c9fb15cf6b1d63e20f0944b2efe0f115b20e00be48fb23fceb061c54
WORKDIR /app
RUN apt-get update && apt-get install -y --no-install-recommends openssl ca-certificates \
  && rm -rf /var/lib/apt/lists/*
RUN corepack enable
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY packages/gms-storage/package.json packages/gms-storage/package.json
COPY backend-api-inventory/package.json backend-api-inventory/package.json
# Only this workspace and its workspace dependencies (@gms/storage).
RUN pnpm install --frozen-lockfile --filter "@gem-crm/backend-api-inventory..."
COPY packages/gms-storage packages/gms-storage
COPY backend-api-inventory backend-api-inventory
RUN pnpm --filter @gms/storage build
# Contract with backend (BE-LS-006): `build` runs `prisma generate` + `tsc` and emits dist/main.js.
RUN pnpm --filter @gem-crm/backend-api-inventory build
WORKDIR /app/backend-api-inventory
# Upload root mount point (host bind in Compose); everything else stays root-owned and read-only for uid 1000.
RUN mkdir -p storage/files/load-to-stock && chown -R 1000:1000 storage
ENV NODE_ENV=production CHECKPOINT_DISABLE=1 PRISMA_HIDE_UPDATE_MESSAGE=1
# uid/gid 1000 = "node" user of the official image.
USER 1000:1000
EXPOSE 3301
# No pnpm at runtime (corepack would try to download it without egress). Migrations run in the separate
# one-off backend-api-inventory-migrate job: ./node_modules/.bin/prisma migrate deploy.
CMD ["node", "dist/main.js"]
