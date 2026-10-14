FROM node:24.11.0-bookworm-slim
WORKDIR /app
RUN corepack enable
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY frontend/package.json frontend/package.json
COPY backend-api-gateway/package.json backend-api-gateway/package.json
COPY backend-api-auth/package.json backend-api-auth/package.json
COPY backend-api-partner/package.json backend-api-partner/package.json
RUN pnpm install --frozen-lockfile
COPY . .
RUN pnpm --filter frontend build
EXPOSE 3000
CMD ["pnpm", "--filter", "frontend", "start"]
