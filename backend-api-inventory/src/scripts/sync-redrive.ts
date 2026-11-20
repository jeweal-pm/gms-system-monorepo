import { loadConfig } from "../config";
import { createDb } from "../platform/db";
import { createLogger } from "../platform/logger";
import { MasterApi } from "../platform/master-api";
import { createMasterTransport, readMasterToken } from "../platform/master-client";
import { NotificationHub } from "../platform/notification/hub";
import { LoadToStockService } from "../modules/load-to-stock/service";
import { SaleService } from "../modules/sale/service";

/**
 * Operator command (architecture.md "Saga state machine"):
 *   `pnpm --filter @gem-crm/backend-api-inventory sync:redrive <loadId>`            (Load to Stock, unchanged)
 *   `pnpm --filter @gem-crm/backend-api-inventory sync:redrive sale <saleId>`        (Sale, ADR-0054 D6)
 * Moves the document's STUCK (or due) op back to PREPARED with a fresh attempt budget and drives it once with the stored
 * revision and payload. Prints the outcome only (no document data).
 */
export function parseArgs(argv: readonly string[]): { type: "load-to-stock" | "sale"; id: string } {
  const [first, second] = argv;
  const uuid = /^[0-9a-f-]{36}$/;
  if ((first === "sale" || first === "load-to-stock") && second && uuid.test(second)) return { type: first, id: second };
  if (first && uuid.test(first) && second === undefined) return { type: "load-to-stock", id: first };
  throw new Error("usage: sync:redrive [load-to-stock|sale] <documentId>");
}

async function run() {
  const { type, id } = parseArgs(process.argv.slice(2));
  const config = loadConfig();
  const logger = createLogger("info");
  const db = createDb(config.databaseUrl, { pool: { max: 1 } });
  const master = new MasterApi(createMasterTransport(config.masterInternalUrl, readMasterToken(config.masterTokenFile), logger));
  const deps = { db, master, logger, hub: new NotificationHub(), approvers: async () => [] };
  try {
    const outcome = type === "sale" ? await new SaleService(deps).sync.unstick(id) : await new LoadToStockService(deps).sync.unstick(id);
    console.log(JSON.stringify(type === "sale" ? { saleId: id, outcome: outcome?.outcome ?? "NO_OPEN_OP" } : { loadId: id, outcome: outcome?.outcome ?? "NO_OPEN_OP" }));
  } finally {
    await db.$disconnect();
  }
}

if (require.main === module) {
  run().catch((error: unknown) => {
    console.error(error instanceof Error ? error.message : "redrive failed");
    process.exit(1);
  });
}
