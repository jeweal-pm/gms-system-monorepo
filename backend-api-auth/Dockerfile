FROM node:24.11.0-bookworm-slim
WORKDIR /app
RUN apt-get update && apt-get install -y --no-install-recommends openssl ca-certificates \
  && rm -rf /var/lib/apt/lists/*
RUN corepack enable
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY frontend/package.json frontend/package.json
COPY backend-api-gateway/package.json backend-api-gateway/package.json
COPY backend-api-auth/package.json backend-api-auth/package.json
COPY backend-api-partner/package.json backend-api-partner/package.json
RUN pnpm install --frozen-lockfile
COPY . .
RUN pnpm --filter @gem-crm/backend-api-auth db:generate
RUN pnpm --filter @gem-crm/backend-api-auth build
EXPOSE 3101
CMD ["sh", "-c", "pnpm --filter @gem-crm/backend-api-auth db:migrate && pnpm --filter @gem-crm/backend-api-auth start"]
