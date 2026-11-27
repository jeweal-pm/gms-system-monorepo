import { AppError } from "../../platform/errors";
import type { Tx } from "../../platform/db";

/**
 * Set-based writes of a Stock Transfer Location document (ADR-0060 D2/D13) and its guarded-update helpers: the lines are one
 * INSERT (≤ 200 rows) and a replace is one DELETE + one INSERT, whatever the line count.
 */
export type NormalizedLine = {
  id: string; position: number; fromStockUuid: string; fromLocation: string; onHandPcs: number; onHandWeightCt: string;
  toLocation: string; pcs: number; weightCt: string; remark: string;
  /** The id the client knows in error details: the saved line id, or `fromStockUuid` for a line not saved yet. */
  clientId: string;
};
export type NormalizedTransfer = {
  docDate: string; ref: string; note: string; lines: NormalizedLine[];
  totals: { lineCount: number; pcs: number; weightCt: string };
};

export async function insertLines(tx: Tx, transferId: string, lines: readonly NormalizedLine[]) {
  await tx.stock_transfer_line.createMany({
    data: lines.map((line) => ({
      id: line.id, transfer_id: transferId, position: line.position, from_stock_uuid: line.fromStockUuid, from_location: line.fromLocation.slice(0, 40),
      on_hand_pcs: line.onHandPcs, on_hand_weight_ct: line.onHandWeightCt, to_location: line.toLocation.slice(0, 40), pcs: line.pcs, weight_ct: line.weightCt,
      remark: line.remark.slice(0, 250),
    })),
  });
}

/** Replaces every line (the caller reversed an applied document first, so no line holds a new stock). */
export async function replaceLines(tx: Tx, transferId: string, lines: readonly NormalizedLine[]) {
  await tx.$executeRaw`DELETE FROM "inventory"."stock_transfer_line" WHERE "transfer_id" = ${transferId}::uuid`;
  await insertLines(tx, transferId, lines);
}

export const headerFields = (doc: NormalizedTransfer) => ({
  doc_date: new Date(`${doc.docDate}T00:00:00Z`), ref: doc.ref.slice(0, 100), note: doc.note.slice(0, 250),
  line_count: doc.totals.lineCount, total_pcs: doc.totals.pcs, total_weight_ct: doc.totals.weightCt,
});

/** Running number per Document Setup row: max + 1 under a transaction advisory lock (ADR-0052 D10 pattern, ADR-0060 D10). */
export async function nextRunningNo(tx: { $queryRaw: Tx["$queryRaw"] }, numbering: { id: string; startNo: number } | null, lock: boolean): Promise<number> {
  const key = `inventory.stock_transfer.numbering:${numbering?.id ?? "plain"}`;
  if (lock) await tx.$queryRaw`SELECT 1 AS locked FROM (SELECT pg_advisory_xact_lock(hashtext(${key}))) AS l`;
  const rows = numbering
    ? await tx.$queryRaw<{ max: number | null }[]>`SELECT max("running_no") AS "max" FROM "inventory"."stock_transfer" WHERE "numbering_id" = ${numbering.id}::uuid`
    : await tx.$queryRaw<{ max: number | null }[]>`SELECT max("running_no") AS "max" FROM "inventory"."stock_transfer" WHERE "numbering_id" IS NULL`;
  const max = rows[0]?.max ?? null;
  if (!numbering) return (max ?? 0) + 1;
  return max === null ? numbering.startNo : Math.max(max + 1, numbering.startNo);
}

export const formatDocNo = (numbering: { prefix: string; separator: string } | null, runningNo: number) => (numbering ? `${numbering.prefix}${numbering.separator}${runningNo}` : String(runningNo));

/** `APPROVED_AUTO` in an allowed list = an auto-approved APPROVED document (edit / delete while its new stock is unused). */
export const APPROVED_AUTO = "APPROVED_AUTO";

type MissRow = { status: string; version: number; deleted_at: Date | null; auto_approved: boolean };

/**
 * Explains a guarded-update miss: not found → 404 STOCK_TRANSFER_NOT_FOUND; deleted (or, for restore, not deleted) and a status
 * outside `allowed` → 409 STOCK_TRANSFER_STATUS {status}; otherwise the version moved → 409 VERSION_CONFLICT {currentVersion}.
 */
export async function explainMiss(tx: { $queryRaw: Tx["$queryRaw"] }, id: string, allowed: readonly string[], options: { deleted?: boolean } = {}): Promise<never> {
  const [row] = await tx.$queryRaw<MissRow[]>`SELECT "status", "version", "deleted_at", "auto_approved" FROM "inventory"."stock_transfer" WHERE "id" = ${id}::uuid`;
  if (!row) throw new AppError(404, "STOCK_TRANSFER_NOT_FOUND");
  if (options.deleted && !row.deleted_at) throw new AppError(409, "STOCK_TRANSFER_STATUS", { status: row.status });
  if (!options.deleted && row.deleted_at) throw new AppError(409, "STOCK_TRANSFER_STATUS", { status: "DELETED" });
  const permitted = options.deleted || allowed.includes(row.status) || (row.status === "APPROVED" && row.auto_approved && allowed.includes(APPROVED_AUTO));
  if (!permitted) throw new AppError(409, "STOCK_TRANSFER_STATUS", { status: row.status });
  throw new AppError(409, "VERSION_CONFLICT", { currentVersion: row.version });
}
