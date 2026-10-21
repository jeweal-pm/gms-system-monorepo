import { defineConfig } from "vitest/config";

/** api-master unit tests live in test/. Keep worker count bounded for local development. */
export default defineConfig({
  test: {
    include: ["test/**/*.test.ts"],
    setupFiles: ["test/setup.ts"],
    environment: "node",
    pool: "forks",
    maxWorkers: 2,
  },
});
