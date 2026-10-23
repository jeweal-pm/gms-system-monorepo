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
RUN pnpm --filter @gem-crm/backend-api-auth db:generate
RUN pnpm --filter @gem-crm/backend-api-auth build
# Infra bundle backend-api-auth/1 (user-photo SA PH-10): user photo folder under the runtime working
# directory (/app/backend-api-auth via pnpm --filter), owned by uid/gid 1000 so the named volume
# mounted here is created ready for a future non-root runtime. The image currently runs as root
# (no USER); see INV-20261017-004.
RUN mkdir -p /app/backend-api-auth/storage/user-photos && chown -R 1000:1000 /app/backend-api-auth/storage
EXPOSE 3101
CMD ["sh", "-c", "pnpm --filter @gem-crm/backend-api-auth db:migrate && pnpm --filter @gem-crm/backend-api-auth start"]
