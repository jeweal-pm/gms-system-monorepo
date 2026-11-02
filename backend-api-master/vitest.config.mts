import { defineConfig } from "vitest/config";

/** api-master unit tests live in test/. Keep worker count bounded for local development. */
export default defineConfig({
  test: {
    include: ["test/**/*.test.ts"],
    setupFiles: ["test/setup.ts"],
    environment: "node",
    pool: "forks",
    maxWorkers: 2,
    // The opt-in DB integrations share one disposable database and its single-row settings (company profile id 1 and
    // its home currency, Document Setup keys). Files then run one at a time so one file's fixtures can't change another
    // file's assumptions mid-run; without that database every file runs in parallel as before.
    fileParallelism: !process.env.PARTNER_TEST_DATABASE_URL,
  },
});
