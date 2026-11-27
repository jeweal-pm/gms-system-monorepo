import { uuidV7 } from "@gms/storage";
import { AppError } from "../../platform/errors";
import { Decimal, Prisma, type Client, type Dec, type Tx } from "../../platform/db";

/**
 * Stock Transfer Location in the stock component (ADR-0060 D3/D4/D7/D9; stock rows are written only here and in stock.ts):
 * a transfer never changes `stock.location` (it is part of the Stock Card key). Every line moves on-hand quantity from its
 * source stock to a NEW stock row with a new Stock ID at the new location, and the ledger shows TRANSFER_OUT on the old card
 * and TRANSFER_IN on the new one.
 *
 * - `checkTransferLines`: the D7 checks (ACTIVE, location unchanged, to ≠ from, on hand ≥ moved) over rows read by the caller.
 * - `applyTransfer`: in the caller's transaction, 6 statements for any number of lines (≤ 200): lock sources FOR UPDATE in
 *   id order, one UPDATE of the sources, one INSERT … SELECT of the new rows, one photo-reference copy, one ledger insert,
 *   one write-back of `new_stock_uuid` / `applied_from_version` to the lines. A failed check throws before any write.
 * - `reverseTransfer`: D9, 6 statements: read the applied lines, lock sources + new rows in id order with their in-use facts,
 *   ledger reversal, sources back, new rows REVERSED (on hand 0, pcs 0, as `reverseStocks`), lines detached.
 *
 * Only on-hand moves; reserved / memo-out / sold / consumed never move. Cost moves with the quantity (exact split).
 */
export const TRANSFER_DOCUMENT_TYPE = "stock-transfer-location";

export type TransferLine = {
  lineId: string; fromStockUuid: string; fromLocation: string; toLocation: string; pcs: number; weightCt: string;
};
export type TransferContext = { transferId: string; revision: number; actorId: string };

export type SourceRow = {
  id: string; stock_id: string; status: string; location: string; price_unit: string; pcs: number; weight_ct: string;
  on_hand_pcs: number; on_hand_weight_ct: string; cost_amount_base: string; version: number;
};

const sameLocation = (a: string, b: string) => a.trim().toUpperCase() === b.trim().toUpperCase();

/**
 * Cost share of a move (ADR-0060 D3): cost × moved ÷ the row's quantity in its price unit (weight for PER_CT, pcs for PER_PCS),
 * 2 dp half-up, capped at the row's cost. Moving the whole row (both dimensions) takes the remainder, so the total never changes.
 */
export function costShare(source: Pick<SourceRow, "price_unit" | "pcs" | "weight_ct" | "cost_amount_base">, pcs: number, weightCt: string): Dec {
  const cost = new Decimal(source.cost_amount_base);
  if (pcs === source.pcs && new Decimal(weightCt).equals(source.weight_ct)) return cost;
  const total = source.price_unit === "PER_PCS" ? new Decimal(source.pcs) : new Decimal(source.weight_ct);
  const moved = source.price_unit === "PER_PCS" ? new Decimal(pcs) : new Decimal(weightCt);
  if (total.lte(0) || moved.lte(0)) return new Decimal(0);
  return Decimal.min(cost, cost.times(moved).dividedBy(total).toDecimalPlaces(2, Decimal.ROUND_HALF_UP));
}

export type TransferCheck =
  | { ok: true }
  | { ok: false; status: 422; code: "STOCK_TRANSFER_LINE_UNAVAILABLE"; details: { lineIds: string[] } }
  | { ok: false; status: 422; code: "LOCATION_INVALID"; details: { lineIds: string[] } }
  | { ok: false; status: 409; code: "STOCK_TRANSFER_EXCEEDS_ON_HAND"; details: { lines: { lineId: string; onHandPcs: number; onHandWeightCt: string }[] } };

/** The D7 checks, pure (UT): unavailable first, then location, then quantity. */
export function checkTransferLines(lines: readonly TransferLine[], sources: ReadonlyMap<string, SourceRow>): TransferCheck {
  const unavailable = lines.filter((line) => {
    const source = sources.get(line.fromStockUuid);
    return !source || source.status !== "ACTIVE" || !sameLocation(source.location, line.fromLocation);
  }).map((line) => line.lineId);
  if (unavailable.length > 0) return { ok: false, status: 422, code: "STOCK_TRANSFER_LINE_UNAVAILABLE", details: { lineIds: unavailable } };
  const badLocation = lines.filter((line) => !line.toLocation.trim() || sameLocation(line.toLocation, sources.get(line.fromStockUuid)!.location)).map((line) => line.lineId);
  if (badLocation.length > 0) return { ok: false, status: 422, code: "LOCATION_INVALID", details: { lineIds: badLocation } };
  const short = lines.filter((line) => {
    const source = sources.get(line.fromStockUuid)!;
    return line.pcs > source.on_hand_pcs || new Decimal(line.weightCt).greaterThan(source.on_hand_weight_ct);
  }).map((line) => {
    const source = sources.get(line.fromStockUuid)!;
    return { lineId: line.lineId, onHandPcs: source.on_hand_pcs, onHandWeightCt: new Decimal(source.on_hand_weight_ct).toFixed(3) };
  });
  if (short.length > 0) return { ok: false, status: 409, code: "STOCK_TRANSFER_EXCEEDS_ON_HAND", details: { lines: short } };
  return { ok: true };
}

export function throwIfFailed(check: TransferCheck): void {
  if (!check.ok) throw new AppError(check.status, check.code, check.details);
}

const SOURCE_COLUMNS = Prisma.sql`s."id", s."stock_id", s."status", s."location", s."price_unit", s."pcs", s."weight_ct"::text AS "weight_ct", s."on_hand_pcs",
  s."on_hand_weight_ct"::text AS "on_hand_weight_ct", s."cost_amount_base"::text AS "cost_amount_base", s."version"`;

/** Read-only source rows (draft Save / Submit re-check): one statement, no lock. */
export async function readSources(client: Client | Tx, ids: readonly string[]): Promise<Map<string, SourceRow>> {
  if (ids.length === 0) return new Map();
  const rows = await client.$queryRaw<SourceRow[]>(Prisma.sql`SELECT ${SOURCE_COLUMNS} FROM "inventory"."stock" s WHERE s."id" = ANY(${[...ids]}::uuid[])`);
  return new Map(rows.map((row) => [row.id, row]));
}

/**
 * D7: applies the lines with the Stock IDs master issued for this revision (`stockIds[i]` for `lines[i]`). Nothing is written
 * when a check fails (the caller's transaction rolls back on the throw).
 */
export async function applyTransfer(tx: Tx, context: TransferContext, lines: readonly TransferLine[], stockIds: readonly string[]): Promise<{ newStockUuids: string[] }> {
  if (lines.length === 0) return { newStockUuids: [] };
  if (stockIds.length < lines.length) throw new Error(`stock id count mismatch: ${lines.length} lines, ${stockIds.length} ids`);
  // 1. Lock the sources in id order (the lock order of holds / Sale own stock).
  const locked = await tx.$queryRaw<SourceRow[]>(Prisma.sql`
    SELECT ${SOURCE_COLUMNS} FROM "inventory"."stock" s
    WHERE s."id" = ANY(${lines.map((line) => line.fromStockUuid)}::uuid[]) ORDER BY s."id" FOR UPDATE OF s`);
  const sources = new Map(locked.map((row) => [row.id, row]));
  throwIfFailed(checkTransferLines(lines, sources));

  const moves = lines.map((line, index) => {
    const source = sources.get(line.fromStockUuid)!;
    const weight = new Decimal(line.weightCt).toFixed(3);
    return { line, source, newId: uuidV7(), stockId: stockIds[index], pcs: line.pcs, weight, cost: costShare(source, line.pcs, weight).toFixed(2), toLocation: line.toLocation.trim() };
  });
  const sorted = [...moves].sort((a, b) => (a.source.id < b.source.id ? -1 : a.source.id > b.source.id ? 1 : 0));
  // 2. Sources: quantity and cost leave the row; the version moves (D9 compares it).
  const sourceValues = sorted.map((move) => Prisma.sql`(${move.source.id}::uuid, ${move.pcs}::int, ${move.weight}::numeric, ${move.cost}::numeric)`);
  const updated = await tx.$queryRaw<{ id: string; version: number }[]>(Prisma.sql`
    UPDATE "inventory"."stock" AS s SET
      "pcs" = s."pcs" - v.p, "weight_ct" = s."weight_ct" - v.w, "on_hand_pcs" = s."on_hand_pcs" - v.p, "on_hand_weight_ct" = s."on_hand_weight_ct" - v.w,
      "cost_amount_base" = s."cost_amount_base" - v.c, "first_used_at" = COALESCE(s."first_used_at", now()), "version" = s."version" + 1, "updated_at" = now()
    FROM (VALUES ${Prisma.join(sourceValues)}) AS v(id, p, w, c) WHERE s."id" = v.id
    RETURNING s."id", s."version"`);
  const versionOf = new Map(updated.map((row) => [row.id, row.version]));
  // 3. New rows copy every stone attribute of the source (incl. load, ref date / number = the lot's FIFO age).
  const newValues = moves.map((move) => Prisma.sql`(${move.newId}::uuid, ${move.stockId}::varchar, ${move.source.id}::uuid, ${move.toLocation}::varchar, ${move.pcs}::int, ${move.weight}::numeric, ${move.cost}::numeric)`);
  await tx.$executeRaw(Prisma.sql`
    INSERT INTO "inventory"."stock" ("id", "stock_id", "load_row_id", "load_id", "status", "location", "parcel", "stone_code_id", "stone_code", "stone", "shape", "size",
      "color", "clarity", "cutting", "quality", "lot", "cer_type", "cer_no", "price_unit", "pcs", "weight_ct", "on_hand_pcs", "on_hand_weight_ct", "unit_cost_base",
      "cost_amount_base", "stock_price", "sale_price", "currency_code", "vendor_id", "vendor_name_snapshot", "item_note", "ref_doc_date", "ref_doc_no", "transferred_from_uuid")
    SELECT v.id, v.stock_id, NULL, s."load_id", 'ACTIVE', v.location, s."parcel", s."stone_code_id", s."stone_code", s."stone", s."shape", s."size",
      s."color", s."clarity", s."cutting", s."quality", s."lot", s."cer_type", s."cer_no", s."price_unit", v.p, v.w, v.p, v.w, s."unit_cost_base",
      v.c, s."stock_price", s."sale_price", s."currency_code", s."vendor_id", s."vendor_name_snapshot", s."item_note", s."ref_doc_date", s."ref_doc_no", s."id"
    FROM (VALUES ${Prisma.join(newValues)}) AS v(id, stock_id, source, location, p, w, c) JOIN "inventory"."stock" s ON s."id" = v.source`);
  // 4. Photos by reference (ADR-0048: the stored file is shared, never copied).
  await tx.$executeRaw(Prisma.sql`
    INSERT INTO "inventory"."stock_photo" ("stock_uuid", "position", "file_id")
    SELECT v.id, p."position", p."file_id" FROM (VALUES ${Prisma.join(moves.map((move) => Prisma.sql`(${move.newId}::uuid, ${move.source.id}::uuid)`))}) AS v(id, source)
    JOIN "inventory"."stock_photo" p ON p."stock_uuid" = v.source`);
  // 5. Ledger: one OUT (source) and one IN (new row) per line.
  await tx.stock_movement.createMany({
    data: moves.flatMap((move) => [
      { id: uuidV7(), stock_uuid: move.source.id, kind: "TRANSFER_OUT", document_type: TRANSFER_DOCUMENT_TYPE, document_id: context.transferId, revision: context.revision,
        pcs_delta: -move.pcs, weight_delta: new Decimal(move.weight).negated().toFixed(3), cost_delta_base: new Decimal(move.cost).negated().toFixed(2), created_by: context.actorId },
      { id: uuidV7(), stock_uuid: move.newId, kind: "TRANSFER_IN", document_type: TRANSFER_DOCUMENT_TYPE, document_id: context.transferId, revision: context.revision,
        pcs_delta: move.pcs, weight_delta: move.weight, cost_delta_base: move.cost, created_by: context.actorId },
    ]),
  });
  // 6. Lines remember the new row and the source version they left (D9).
  const lineValues = moves.map((move) => Prisma.sql`(${move.line.lineId}::uuid, ${move.newId}::uuid, ${versionOf.get(move.source.id)!}::int)`);
  await tx.$executeRaw(Prisma.sql`
    UPDATE "inventory"."stock_transfer_line" AS l SET "new_stock_uuid" = v.stock, "applied_from_version" = v.version
    FROM (VALUES ${Prisma.join(lineValues)}) AS v(id, stock, version) WHERE l."id" = v.id AND l."transfer_id" = ${context.transferId}::uuid`);
  return { newStockUuids: moves.map((move) => move.newId) };
}

type AppliedRow = { line_id: string; from_stock_uuid: string; new_stock_uuid: string; applied_from_version: number };
type LockedRow = {
  id: string; stock_id: string; status: string; version: number; pcs: number; weight_ct: string; on_hand_pcs: number; on_hand_weight_ct: string;
  cost_amount_base: string; held: boolean; other_movement: boolean;
};

/**
 * D9: reverses every applied line of the transfer (edit / delete after effect). Refuses with 409 STOCK_TRANSFER_IN_USE
 * {stockIds} when a new row was touched (version ≠ 1, on hand ≠ pcs, a hold or any movement besides TRANSFER_IN) or a source
 * changed since the apply (version ≠ applied_from_version). Returns false when nothing was applied.
 */
export async function reverseTransfer(tx: Tx, context: TransferContext): Promise<boolean> {
  const applied = await tx.$queryRaw<AppliedRow[]>`
    SELECT "id" AS "line_id", "from_stock_uuid", "new_stock_uuid", "applied_from_version" FROM "inventory"."stock_transfer_line"
    WHERE "transfer_id" = ${context.transferId}::uuid AND "new_stock_uuid" IS NOT NULL`;
  if (applied.length === 0) return false;
  const ids = [...new Set(applied.flatMap((row) => [row.from_stock_uuid, row.new_stock_uuid]))];
  const locked = await tx.$queryRaw<LockedRow[]>`
    SELECT s."id", s."stock_id", s."status", s."version", s."pcs", s."weight_ct"::text AS "weight_ct", s."on_hand_pcs", s."on_hand_weight_ct"::text AS "on_hand_weight_ct",
      s."cost_amount_base"::text AS "cost_amount_base",
      EXISTS (SELECT 1 FROM "inventory"."stock_hold" h WHERE h."stock_uuid" = s."id") AS "held",
      EXISTS (SELECT 1 FROM "inventory"."stock_movement" m WHERE m."stock_uuid" = s."id" AND m."kind" <> 'TRANSFER_IN') AS "other_movement"
    FROM "inventory"."stock" s WHERE s."id" = ANY(${ids}::uuid[]) ORDER BY s."id" FOR UPDATE OF s`;
  const byId = new Map(locked.map((row) => [row.id, row]));
  const inUse = new Set<string>();
  for (const row of applied) {
    const created = byId.get(row.new_stock_uuid);
    const source = byId.get(row.from_stock_uuid);
    if (!created || created.status !== "ACTIVE" || created.version !== 1 || created.on_hand_pcs !== created.pcs || !new Decimal(created.on_hand_weight_ct).equals(created.weight_ct)
      || created.held || created.other_movement) inUse.add(created?.stock_id ?? row.new_stock_uuid);
    if (!source || source.status !== "ACTIVE" || source.version !== row.applied_from_version) inUse.add(source?.stock_id ?? row.from_stock_uuid);
  }
  if (inUse.size > 0) throw new AppError(409, "STOCK_TRANSFER_IN_USE", { stockIds: [...inUse].sort().slice(0, 20) });

  const moves = applied.map((row) => ({ row, created: byId.get(row.new_stock_uuid)! })).sort((a, b) => (a.row.from_stock_uuid < b.row.from_stock_uuid ? -1 : 1));
  await tx.stock_movement.createMany({
    data: moves.flatMap(({ row, created }) => [
      { id: uuidV7(), stock_uuid: row.from_stock_uuid, kind: "TRANSFER_OUT_REVERSAL", document_type: TRANSFER_DOCUMENT_TYPE, document_id: context.transferId, revision: context.revision,
        pcs_delta: created.pcs, weight_delta: new Decimal(created.weight_ct).toFixed(3), cost_delta_base: new Decimal(created.cost_amount_base).toFixed(2), created_by: context.actorId },
      { id: uuidV7(), stock_uuid: created.id, kind: "TRANSFER_IN_REVERSAL", document_type: TRANSFER_DOCUMENT_TYPE, document_id: context.transferId, revision: context.revision,
        pcs_delta: -created.pcs, weight_delta: new Decimal(created.weight_ct).negated().toFixed(3), cost_delta_base: new Decimal(created.cost_amount_base).negated().toFixed(2), created_by: context.actorId },
    ]),
  });
  const back = moves.map(({ row, created }) => Prisma.sql`(${row.from_stock_uuid}::uuid, ${created.pcs}::int, ${new Decimal(created.weight_ct).toFixed(3)}::numeric, ${new Decimal(created.cost_amount_base).toFixed(2)}::numeric)`);
  await tx.$executeRaw(Prisma.sql`
    UPDATE "inventory"."stock" AS s SET
      "pcs" = s."pcs" + v.p, "weight_ct" = s."weight_ct" + v.w, "on_hand_pcs" = s."on_hand_pcs" + v.p, "on_hand_weight_ct" = s."on_hand_weight_ct" + v.w,
      "cost_amount_base" = s."cost_amount_base" + v.c, "version" = s."version" + 1, "updated_at" = now()
    FROM (VALUES ${Prisma.join(back)}) AS v(id, p, w, c) WHERE s."id" = v.id`);
  // The new rows: REVERSED with every bucket 0 (the balance CHECK holds); the Stock ID stays retired (never reused).
  await tx.$executeRaw`
    UPDATE "inventory"."stock" SET "status" = 'REVERSED', "pcs" = 0, "weight_ct" = 0, "on_hand_pcs" = 0, "on_hand_weight_ct" = 0, "cost_amount_base" = 0,
      "version" = "version" + 1, "updated_at" = now()
    WHERE "id" = ANY(${moves.map(({ created }) => created.id)}::uuid[])`;
  await tx.$executeRaw`
    UPDATE "inventory"."stock_transfer_line" SET "new_stock_uuid" = NULL, "applied_from_version" = NULL
    WHERE "transfer_id" = ${context.transferId}::uuid AND "new_stock_uuid" IS NOT NULL`;
  return true;
}
