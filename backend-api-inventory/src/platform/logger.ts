import pino, { type Logger } from "pino";

/**
 * Structured logs (load-to-stock architecture.md "Logging and audit"): ids, codes, counts and timings only — never
 * request bodies, prices, costs, vendor names, notes, cookies or tokens.
 */
export function createLogger(level = process.env.LOG_LEVEL ?? (process.env.NODE_ENV === "test" ? "silent" : "info")): Logger {
  return pino({
    level,
    base: { service: "backend-api-inventory" },
    redact: { paths: ["*.authorization", "*.cookie", "*.token", "*.password", "*.databaseUrl", "*.connectionString"], censor: "[REDACTED]" },
  });
}

export type { Logger };
