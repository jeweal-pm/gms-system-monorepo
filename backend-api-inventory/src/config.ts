/**
 * Runtime configuration of backend-api-inventory (ADR-0052 D1/D14, infra handoff load-to-stock-infra-devops.md
 * "Environment" / "Secrets"). Fail fast before opening the port; messages never contain secret values.
 */
export type InventoryConfig = {
  port: number;
  nodeEnv: string;
  /** gms_inventory_app, schema `inventory` (the `schema` parameter is removed for the driver). */
  databaseUrl: string;
  /** gms_inventory_authz_reader (auth views only). */
  authzDatabaseUrl: string;
  authServiceUrl: string;
  accessIssuer: string;
  frontendUrl: string;
  /** Extra trusted origins for cookie mutations (same list as master's). */
  trustedOrigins: string[];
  masterInternalUrl: string;
  storageRoot: string;
  masterTokenFile: string | undefined;
  authTokenFile: string | undefined;
};

function required(env: NodeJS.ProcessEnv, key: string): string {
  const value = env[key]?.trim();
  if (!value) throw new Error(`${key} is required`);
  return value;
}

function httpUrl(env: NodeJS.ProcessEnv, key: string): string {
  const value = required(env, key);
  let url: URL;
  try { url = new URL(value); } catch { throw new Error(`${key} must be an absolute URL`); }
  if (!/^https?:$/.test(url.protocol) || url.username || url.password || url.hash || url.search) throw new Error(`${key} must be a plain http(s) URL`);
  return url.toString().replace(/\/$/, "");
}

/** A credentialed PostgreSQL URL; the `schema` query parameter is dropped (the driver uses the adapter's schema). */
export function postgresUrl(env: NodeJS.ProcessEnv, key: string): string {
  const raw = required(env, key);
  let url: URL;
  try { url = new URL(raw); } catch { throw new Error(`${key} must be a valid PostgreSQL URL`); }
  if ((url.protocol !== "postgresql:" && url.protocol !== "postgres:") || !url.hostname || !url.username || url.hash) {
    throw new Error(`${key} must be a credentialed PostgreSQL URL`);
  }
  url.searchParams.delete("schema");
  return url.toString();
}

export function originList(value: string | undefined): string[] {
  if (!value) return [];
  return value.split(",").map((item) => item.trim()).filter(Boolean).map((item) => {
    let url: URL;
    try { url = new URL(item); } catch { throw new Error("INVENTORY_TRUSTED_ORIGINS must list absolute origins"); }
    if (!/^https?:$/.test(url.protocol)) throw new Error("INVENTORY_TRUSTED_ORIGINS must list http(s) origins");
    return url.origin;
  });
}

export function loadConfig(env: NodeJS.ProcessEnv = process.env): InventoryConfig {
  const port = Number(env.PORT ?? 3301);
  if (!Number.isInteger(port) || port < 1 || port > 65_535) throw new Error("PORT must be a TCP port");
  return {
    port,
    nodeEnv: env.NODE_ENV ?? "development",
    databaseUrl: postgresUrl(env, "INVENTORY_DATABASE_URL"),
    authzDatabaseUrl: postgresUrl(env, "INVENTORY_AUTHZ_DATABASE_URL"),
    authServiceUrl: httpUrl(env, "AUTH_SERVICE_URL"),
    accessIssuer: required(env, "AUTH_ACCESS_JWT_ISSUER"),
    frontendUrl: httpUrl(env, "FRONTEND_URL"),
    trustedOrigins: originList(env.INVENTORY_TRUSTED_ORIGINS),
    masterInternalUrl: httpUrl(env, "MASTER_INTERNAL_URL"),
    storageRoot: env.GMS_STORAGE_ROOT?.trim() || `${process.cwd()}/storage`,
    masterTokenFile: env.INVENTORY_MASTER_SERVICE_TOKEN_FILE,
    authTokenFile: env.INVENTORY_AUTH_SERVICE_TOKEN_FILE,
  };
}
