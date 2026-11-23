import { prisma } from "../database/prisma-client";
import { Prisma } from "../generated/prisma/client";
import { DOC_SPECS, metadataOf } from "../trade-document/inventory-hold-saga";
import { inventoryClient, InventoryRefusal, type HoldDocType, type InventoryClient } from "../inventory-client/inventory-client";

/**
 * One-off, re-runnable Stock Card metadata backfill (stock-card ADR-0056 D7, SQ-SC-13, BE-SC-006):
 * `pnpm --filter backend-api-master stock-card:backfill [--dry-run]`.
 * For every Reserve / Memo Out / Memo Out Return that holds or held our stock (`hold_revision > 0`) it sends the document date
 * and customer to inventory (`PATCH /internal/v1/master/stock-holds/{type}/{id}/metadata`) so documents applied before the
 * metadata existed show their date and account on the Stock Card. Idempotent (the same values again change nothing); a
 * document inventory knows nothing about (404) is skipped; bounded to 200 documents per minute (one call per 300 ms, one call at
 * a time, keyset pages of 200 ids); never touches stock quantities. `--dry-run` counts and sends nothing.
 * Prints counts only (no names, numbers or ids of customers).
 */
export const BACKFILL_TYPES: readonly HoldDocType[] = ["reserve", "memo-out", "memo-out-return"];
export const BACKFILL_PAGE = 200;
export const BACKFILL_DELAY_MS = 300;
const ZERO_UUID = "00000000-0000-0000-0000-000000000000";

export type BackfillCounts = { type: HoldDocType; seen: number; patched: number; skipped: number; failed: number; withoutMetadata: number };
export type BackfillOptions = { client?: Pick<InventoryClient, "patchMetadata">; dryRun?: boolean; delayMs?: number; types?: readonly HoldDocType[]; log?: (line: string) => void };

const sleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

export async function backfillStockCardMetadata(options: BackfillOptions = {}): Promise<BackfillCounts[]> {
  const client = options.client ?? inventoryClient();
  const delayMs = options.delayMs ?? BACKFILL_DELAY_MS;
  const log = options.log ?? ((line: string) => console.log(line));
  const results: BackfillCounts[] = [];
  for (const type of options.types ?? BACKFILL_TYPES) {
    const counts: BackfillCounts = { type, seen: 0, patched: 0, skipped: 0, failed: 0, withoutMetadata: 0 };
    let last = ZERO_UUID;
    for (;;) {
      const rows = await prisma.$queryRaw<{ id: string; doc_date: string | null; customer_id: string | null; customer_name_snapshot: string | null }[]>(Prisma.sql`
        SELECT id::text AS id, doc_date::text AS doc_date, customer_id::text AS customer_id, customer_name_snapshot FROM ${DOC_SPECS[type].table}
        WHERE hold_revision > 0 AND id > ${last}::uuid ORDER BY id LIMIT ${BACKFILL_PAGE}`);
      if (rows.length === 0) break;
      for (const row of rows) {
        counts.seen += 1;
        const meta = metadataOf(row);
        if (!meta) { counts.withoutMetadata += 1; continue; }
        if (options.dryRun) continue;
        try {
          await client.patchMetadata(type, row.id, meta, { actorId: "stock-card-backfill" });
          counts.patched += 1;
        } catch (error) {
          if (error instanceof InventoryRefusal && error.status === 404) counts.skipped += 1;
          else { counts.failed += 1; log(`stock-card:backfill ${type} ${row.id}: ${error instanceof Error ? error.name : "error"}`); }
        }
        if (delayMs > 0) await sleep(delayMs);
      }
      last = rows[rows.length - 1].id;
      if (rows.length < BACKFILL_PAGE) break;
    }
    results.push(counts);
    log(`stock-card:backfill ${type}: seen ${counts.seen}, patched ${counts.patched}, skipped (no hold document) ${counts.skipped}, failed ${counts.failed}, without metadata ${counts.withoutMetadata}${options.dryRun ? " (dry run)" : ""}`);
  }
  return results;
}

async function main() {
  const dryRun = process.argv.slice(2).includes("--dry-run");
  const results = await backfillStockCardMetadata({ dryRun });
  if (results.some((result) => result.failed > 0)) process.exitCode = 1;
}

if (require.main === module) {
  main().then(
    () => prisma.$disconnect().then(() => process.exit(process.exitCode ?? 0)),
    (error: unknown) => {
      console.error(`stock-card:backfill failed: ${error instanceof Error ? error.name : "unknown"}`);
      void prisma.$disconnect().then(() => process.exit(1));
    },
  );
}
