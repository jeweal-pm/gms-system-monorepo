FROM node:24.11.0-bookworm-slim
WORKDIR /app
RUN corepack enable
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY frontend/package.json frontend/package.json
COPY backend-api-gateway/package.json backend-api-gateway/package.json
COPY backend-api-auth/package.json backend-api-auth/package.json
COPY backend-api-master/package.json backend-api-master/package.json
RUN pnpm install --frozen-lockfile
COPY . .
RUN pnpm --filter @gem-crm/backend-api-gateway build
EXPOSE 4000
CMD ["pnpm", "--filter", "@gem-crm/backend-api-gateway", "start"]
