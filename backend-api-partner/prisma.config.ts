import { resolve } from "node:path";
import { config } from "dotenv";
import { defineConfig } from "prisma/config";

config({ path: resolve(process.cwd(), "../.env") });

// D-01: the `?schema=partner` URL parameter makes Prisma Migrate keep its history in
// `partner._prisma_migrations` (auth keeps `public._prisma_migrations`).
// Production has no credential fallback (infra backend-api-partner/1 requirement 3).
const devUrl = "postgresql://f1_user:f1_dev_password@127.0.0.1:5432/f1_system?schema=partner";
const url = process.env.PARTNER_DATABASE_URL ?? (process.env.NODE_ENV === "production" ? undefined : devUrl);

export default defineConfig({
  schema: "prisma/schema.prisma",
  migrations: { path: "prisma/migrations" },
  ...(url ? { datasource: { url } } : {}),
});
