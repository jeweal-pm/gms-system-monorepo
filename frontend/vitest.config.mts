import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

/** Frontend unit tests live in test/ (company-profile, 2026-10-16); `@/` resolves to src/ as in tsconfig. */
export default defineConfig({
  resolve: { alias: { "@": fileURLToPath(new URL("./src", import.meta.url)) } },
  test: {
    include: ["test/**/*.test.ts"],
    environment: "node",
    pool: "forks",
    maxWorkers: 2,
  },
});
