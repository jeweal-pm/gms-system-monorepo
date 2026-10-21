FROM node:24.11.0-bookworm-slim
WORKDIR /app
RUN corepack enable
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY frontend/package.json frontend/package.json
COPY backend-api-auth/package.json backend-api-auth/package.json
COPY backend-api-master/package.json backend-api-master/package.json
RUN pnpm install --frozen-lockfile
COPY . .
RUN pnpm --filter frontend build
EXPOSE 3000
CMD ["pnpm", "--filter", "frontend", "start"]
