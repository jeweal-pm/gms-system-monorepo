import { defineConfig } from "vitest/config";

/** backend-api-inventory tests (load-to-stock SA rev 1 testing.md). Two workers keep the host bounded; DB integrations share one disposable database and run one file at a time. */
export default defineConfig({
  test: {
    include: ["test/**/*.test.ts"],
    environment: "node",
    pool: "forks",
    maxWorkers: 2,
    fileParallelism: !process.env.INVENTORY_TEST_DATABASE_URL,
  },
});
