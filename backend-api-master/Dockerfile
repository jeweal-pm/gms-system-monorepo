FROM node:24.11.0-bookworm-slim
WORKDIR /app
RUN apt-get update && apt-get install -y --no-install-recommends openssl ca-certificates \
  && rm -rf /var/lib/apt/lists/*
RUN corepack enable
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY frontend/package.json frontend/package.json
COPY backend-api-auth/package.json backend-api-auth/package.json
COPY backend-api-master/package.json backend-api-master/package.json
COPY packages/gms-storage/package.json packages/gms-storage/package.json
RUN pnpm install --frozen-lockfile
COPY . .
RUN pnpm --filter @gms/storage build
RUN pnpm --filter @gem-crm/backend-api-master db:generate
RUN pnpm --filter @gem-crm/backend-api-master build
WORKDIR /app/backend-api-master
# Existing company logo storage remains on the preserved partner-storage volume; the named
# volume mounted here is created writable for uid 1000 (everything else stays root-owned, read-only).
RUN mkdir -p storage/company-profile && chown -R 1000:1000 storage
ENV NODE_ENV=production CHECKPOINT_DISABLE=1 PRISMA_HIDE_UPDATE_MESSAGE=1
# uid/gid 1000 = "node" user of the official image; runtime needs read access only.
USER 1000:1000
EXPOSE 3201
# No pnpm at runtime (corepack would try to download it as uid 1000 without egress).
CMD ["sh", "-c", "./node_modules/.bin/prisma migrate deploy && exec node dist/main.js"]
