import { defineConfig } from "vitest/config";

/** backend-api-auth unit tests live in test/ (delegated admin, 2026-10-17). Two workers keep the 8 GB host bounded. */
export default defineConfig({
  test: {
    include: ["test/**/*.test.ts"],
    setupFiles: ["test/setup.ts"],
    environment: "node",
    pool: "forks",
    maxWorkers: 2,
  },
});
