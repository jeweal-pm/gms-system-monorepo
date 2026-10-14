import { createHash } from "node:crypto";

/** Value proposed for `.env.example` by infra bundle backend-api-partner/1; refused in production. */
export const EXAMPLE_SERVICE_TOKEN = "local-development-partner-token-change-before-deploy-0000";
export const MIN_SERVICE_TOKEN_LENGTH = 32;

const DEV_DATABASE_URL = "postgresql://f1_user:f1_dev_password@localhost:5432/f1_system?schema=partner";

/**
 * Fail-fast startup validation (ADR-0018 §1, infra D3). Returns the SHA-256 digest of the
 * configured token; the plain value is not kept or logged.
 */
export function loadServiceTokenDigest(env: NodeJS.ProcessEnv = process.env): Buffer {
  const token = env.PARTNER_SERVICE_TOKEN;
  if (!token || token.length < MIN_SERVICE_TOKEN_LENGTH) {
    throw new Error(`PARTNER_SERVICE_TOKEN must contain at least ${MIN_SERVICE_TOKEN_LENGTH} characters`);
  }
  if (env.NODE_ENV === "production" && token === EXAMPLE_SERVICE_TOKEN) {
    throw new Error("PARTNER_SERVICE_TOKEN must not use the .env.example value in production");
  }
  return createHash("sha256").update(token, "utf8").digest();
}

/** Runtime connection string: no credential fallback in production; `schema` parameter removed (D-01). */
export function loadDatabaseUrl(env: NodeJS.ProcessEnv = process.env): string {
  const raw = env.PARTNER_DATABASE_URL ?? (env.NODE_ENV === "production" ? undefined : DEV_DATABASE_URL);
  if (!raw) throw new Error("PARTNER_DATABASE_URL must be set in production");
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    throw new Error("PARTNER_DATABASE_URL is not a valid URL");
  }
  url.searchParams.delete("schema");
  return url.toString();
}
