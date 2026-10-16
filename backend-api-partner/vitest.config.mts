import { defineConfig } from "vitest/config";

/** backend-api-partner unit tests live in test/ (company-profile, 2026-10-16). Two workers keep the 8 GB host bounded. */
export default defineConfig({
  test: {
    include: ["test/**/*.test.ts"],
    setupFiles: ["test/setup.ts"],
    environment: "node",
    pool: "forks",
    maxWorkers: 2,
  },
});
