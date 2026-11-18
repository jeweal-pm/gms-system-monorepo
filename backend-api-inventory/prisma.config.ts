import { resolve } from "node:path";
import { config } from "dotenv";
import { defineConfig } from "prisma/config";

config({ path: resolve(process.cwd(), "../.env") });

// ADR-0052 D1: schema `inventory`; `?schema=inventory` keeps the history in `inventory._prisma_migrations`. Migrations run
// only in the one-off migrate job with the migrator role (INVENTORY_MIGRATE_DATABASE_URL); never at app start-up.
const devUrl = "postgresql://f1_user:f1_dev_password@127.0.0.1:5432/f1_system?schema=inventory";
const url = process.env.INVENTORY_MIGRATE_DATABASE_URL ?? process.env.INVENTORY_DATABASE_URL ?? (process.env.NODE_ENV === "production" ? undefined : devUrl);

export default defineConfig({
  schema: "prisma/schema.prisma",
  migrations: { path: "prisma/migrations" },
  ...(url ? { datasource: { url } } : {}),
});
