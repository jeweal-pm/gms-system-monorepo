import { serve } from "@hono/node-server";
import { createApp } from "./app";
import { loadConfig } from "./config";
import { createDb } from "./platform/db";
import { createLogger } from "./platform/logger";
import { MasterApi } from "./platform/master-api";
import { createMasterTransport, readMasterToken } from "./platform/master-client";
import { AuthzDatabase } from "./platform/auth/authz-db";
import { JwksCache } from "./platform/auth/jwks";
import { createLicenseClient } from "./platform/auth/license-client";
import { purgeExpired } from "./platform/notification/store";
import { sweepAll } from "./platform/sync/saga";
import { readTokenDigest } from "./internal/master-routes";

/**
 * backend-api-inventory process (ADR-0052 D1/D14): Hono on @hono/node-server, port 3301. Migrations are NOT run here
 * (one-off job). Start-up: DB reachable within 2 min (exponential backoff), then the saga start-up sweep; a 60 s
 * single-flight sweep (≤ 20 ops); a daily bounded retention job. Graceful close on SIGTERM / SIGINT.
 */
const STARTUP_RETRY_MS = 120_000;
const SWEEP_MS = 60_000;

async function main() {
  const config = loadConfig();
  const logger = createLogger();
  const db = createDb(config.databaseUrl);
  const authz = new AuthzDatabase(config.authzDatabaseUrl);
  const masterToken = readMasterToken(config.masterTokenFile);
  if (!masterToken) logger.error({ event: "inventory.master_token_missing" });
  const master = new MasterApi(createMasterTransport(config.masterInternalUrl, masterToken, logger));

  const started = Date.now();
  for (let attempt = 0; ; attempt += 1) {
    try { await db.$queryRaw`SELECT 1`; break; } catch {
      if (Date.now() - started > STARTUP_RETRY_MS) throw new Error("database not reachable after 2 minutes");
      await new Promise((resolve) => setTimeout(resolve, Math.min(1_000 * 2 ** attempt, 15_000)));
    }
  }

  const trusted = new Set([new URL(config.frontendUrl).origin, ...config.trustedOrigins]);
  const { app, service, saleService } = createApp({
    db, master, logger, storageRoot: config.storageRoot, trustedOrigins: trusted,
    internal: { tokenDigest: readTokenDigest(config.masterInventoryTokenFile), otherTokenDigest: readTokenDigest(config.masterTokenFile) },
    approvers: (leaf) => authz.approvers(leaf),
    auth: {
      issuer: config.accessIssuer,
      jwks: new JwksCache(new URL(`${config.authServiceUrl}/api/auth/jwks`)),
      readAuthorization: (userId, sessionId) => authz.read(userId, sessionId),
      checkLicense: createLicenseClient(config.authServiceUrl, config.authTokenFile),
    },
  });

  const server = serve({ fetch: app.fetch, port: config.port, hostname: "0.0.0.0" });
  logger.info({ event: "inventory.started", port: config.port });

  let sweeping = false;
  const sweep = async () => {
    if (sweeping) return;
    sweeping = true;
    // ADR-0054 D6: Load to Stock and Sale share one ≤ 20-op budget per sweep (oldest due first).
    try { await sweepAll([service.sync, saleService.sync]); } catch (error) {
      logger.warn({ event: "inventory.sweep_failed", errorName: error instanceof Error ? error.name : "unknown" });
    } finally { sweeping = false; }
  };
  void sweep();
  const sweepTimer = setInterval(() => void sweep(), SWEEP_MS);
  const retention = () => void purgeExpired(db).then(
    ({ deleted, ops }) => (deleted + ops > 0 ? logger.info({ event: "notification.purged", deleted, ops }) : undefined),
    () => logger.warn({ event: "notification.purge_failed" }),
  );
  const firstPurge = setTimeout(retention, 60_000);
  const dailyPurge = setInterval(retention, 86_400_000);
  for (const timer of [sweepTimer, firstPurge, dailyPurge]) timer.unref();

  const shutdown = () => {
    clearInterval(sweepTimer);
    clearTimeout(firstPurge);
    clearInterval(dailyPurge);
    server.close(() => {
      void Promise.allSettled([db.$disconnect(), authz.disconnect()]).then(() => process.exit(0));
    });
    setTimeout(() => process.exit(0), 10_000).unref();
  };
  process.once("SIGTERM", shutdown);
  process.once("SIGINT", shutdown);
}

main().catch((error: unknown) => {
  console.error(`backend-api-inventory failed to start: ${error instanceof Error ? error.message : "unknown error"}`);
  process.exit(1);
});
