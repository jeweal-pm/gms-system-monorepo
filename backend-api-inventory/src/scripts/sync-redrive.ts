import { loadConfig } from "../config";
import { createDb } from "../platform/db";
import { createLogger } from "../platform/logger";
import { MasterApi } from "../platform/master-api";
import { createMasterTransport, readMasterToken } from "../platform/master-client";
import { NotificationHub } from "../platform/notification/hub";
import { LoadToStockService } from "../modules/load-to-stock/service";

/**
 * Operator command (architecture.md "Saga state machine"): `pnpm --filter @gem-crm/backend-api-inventory sync:redrive <loadId>`.
 * Moves the load's STUCK (or due) op back to PREPARED with a fresh attempt budget and drives it once with the stored
 * revision and payload. Prints the outcome only (no document data).
 */
async function run() {
  const loadId = process.argv[2];
  if (!loadId || !/^[0-9a-f-]{36}$/.test(loadId)) throw new Error("usage: sync:redrive <loadId>");
  const config = loadConfig();
  const logger = createLogger("info");
  const db = createDb(config.databaseUrl, { pool: { max: 1 } });
  const master = new MasterApi(createMasterTransport(config.masterInternalUrl, readMasterToken(config.masterTokenFile), logger));
  const service = new LoadToStockService({ db, master, logger, hub: new NotificationHub(), approvers: async () => [] });
  try {
    const outcome = await service.sync.unstick(loadId);
    console.log(JSON.stringify({ loadId, outcome: outcome?.outcome ?? "NO_OPEN_OP" }));
  } finally {
    await db.$disconnect();
  }
}

run().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : "redrive failed");
  process.exit(1);
});
