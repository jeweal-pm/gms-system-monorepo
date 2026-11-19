import { createHash } from "node:crypto";
import { uuidV7 } from "@gms/storage";
import { AppError } from "../../platform/errors";
import { Decimal, Prisma, type Client, type Dec, type Tx } from "../../platform/db";

/**
 * Holds of master documents on our stock (ADR-0052 D18, SA-LS-P2-04; error-handling "Inventory internal codes").
 * `applyHolds` sets a document's WHOLE hold set at a revision in one transaction (the caller's), with ≤ 7 statements for
 * ≤ 200 stocks (NP-LS-P2-03):
 *   1. upsert-lock the `stock_hold_document` row (revision + request hash check: higher applies, same + same hash replays,
 *      anything else → 409 STOCK_HOLD_STALE);
 *   2. lock the stocks of the old ∪ new set `FOR UPDATE` in id order, with this document's current hold and the load's
 *      sync_state (a SYNCING load → 409 STOCK_HOLD_BUSY, SA-LS-18);
 *   3. per-stock delta checks (per dimension: pcs and weight), then one set-based bucket UPDATE (the phase-1 CHECK keeps
 *      pcs = Σ buckets), 4–5. replace the hold rows, 6. append movements (on-hand deltas, cost 0), 7. store the revision.
 * Kinds: reserve → RESERVED (on-hand → reserved), memo-out → MEMO_OUT (on-hand → memo_out), memo-out-return →
 * MEMO_OUT_RETURN (memo_out → on-hand).
 */
export const HOLD_DOCUMENT_TYPES = ["reserve", "memo-out", "memo-out-return"] as const;
export type HoldDocumentType = (typeof HOLD_DOCUMENT_TYPES)[number];
export const HOLD_MAX_STOCKS = 200;

const KIND: Record<HoldDocumentType, string> = { reserve: "RESERVED", "memo-out": "MEMO_OUT", "memo-out-return": "MEMO_OUT_RETURN" };
const MOVEMENT: Record<HoldDocumentType, { up: string; down: string }> = {
  reserve: { up: "HOLD_RESERVE", down: "RELEASE_RESERVE" },
  "memo-out": { up: "MEMO_OUT", down: "MEMO_OUT_REVERSAL" },
  "memo-out-return": { up: "MEMO_OUT_RETURN", down: "MEMO_OUT_RETURN_REVERSAL" },
};

export type HoldInput = { stockUuid: string; pcs: number; weightCt: string };
export type HoldRequest = { documentType: HoldDocumentType; documentId: string; revision: number; documentNo: string | null; holds: HoldInput[]; actorId: string };
type Qty = { pcs: number; weight: Dec };

/** Canonical request hash: document number + the non-zero holds sorted by stock (weight at 3 dp). */
export function holdRequestHash(documentNo: string | null, holds: readonly HoldInput[]): string {
  const canonical = normalizeHolds(holds).map((hold) => `${hold.stockUuid}:${hold.pcs}:${hold.weightCt}`).join(",");
  return createHash("sha256").update(`${documentNo ?? ""}|${canonical}`, "utf8").digest("hex");
}

/** Zero rows are dropped (a zero hold is no hold), weights normalized to 3 dp, sorted by stock id. */
export function normalizeHolds(holds: readonly HoldInput[]): HoldInput[] {
  return holds
    .map((hold) => ({ stockUuid: hold.stockUuid.toLowerCase(), pcs: hold.pcs, weightCt: new Decimal(hold.weightCt).toFixed(3) }))
    .filter((hold) => hold.pcs > 0 || new Decimal(hold.weightCt).gt(0))
    .sort((a, b) => (a.stockUuid < b.stockUuid ? -1 : a.stockUuid > b.stockUuid ? 1 : 0));
}

type LockedStock = {
  id: string; stock_id: string; status: string; on_hand_pcs: number; on_hand_weight_ct: string; reserved_pcs: number; reserved_weight_ct: string;
  memo_out_pcs: number; memo_out_weight_ct: string; load_syncing: boolean; held_pcs: number | null; held_weight_ct: string | null;
};

type Delta = { stock: LockedStock | undefined; stockUuid: string; pcs: number; weight: Dec; next: Qty };

const short = (stock: LockedStock) => ({ stockUuid: stock.id, stockId: stock.stock_id, availablePcs: stock.on_hand_pcs, availableWeightCt: new Decimal(stock.on_hand_weight_ct).toFixed(3) });

/**
 * Pure delta checks (UT-LS-P2-03). Returns the refusal to throw, or null. Order: unavailable (422) → busy → exceeds
 * available → exceeds memo out (drift) → in use.
 */
export function checkDeltas(type: HoldDocumentType, deltas: readonly Delta[]): AppError | null {
  const changed = deltas.filter((delta) => delta.pcs !== 0 || !delta.weight.isZero());
  const increases = (delta: Delta) => delta.pcs > 0 || delta.weight.gt(0);
  const unavailable = changed.filter((delta) => increases(delta) && (!delta.stock || (type !== "memo-out-return" && delta.stock.status !== "ACTIVE")));
  if (unavailable.length > 0) return new AppError(422, "STOCK_HOLD_UNAVAILABLE", { stockUuids: unavailable.map((delta) => delta.stockUuid).slice(0, HOLD_MAX_STOCKS) });
  const missing = changed.filter((delta) => !delta.stock);
  if (missing.length > 0) return new AppError(409, "STOCK_HOLD_IN_USE", { items: missing.map((delta) => ({ stockUuid: delta.stockUuid })) });
  const present = changed as (Delta & { stock: LockedStock })[];
  const busy = present.filter((delta) => delta.stock.load_syncing);
  if (busy.length > 0) return new AppError(409, "STOCK_HOLD_BUSY", { stockIds: busy.map((delta) => delta.stock.stock_id) });
  const exceeds: LockedStock[] = [];
  const memoOutShort: LockedStock[] = [];
  const inUse: LockedStock[] = [];
  for (const delta of present) {
    const stock = delta.stock;
    const onHand = { pcs: stock.on_hand_pcs, weight: new Decimal(stock.on_hand_weight_ct) };
    const memoOut = { pcs: stock.memo_out_pcs, weight: new Decimal(stock.memo_out_weight_ct) };
    const reserved = { pcs: stock.reserved_pcs, weight: new Decimal(stock.reserved_weight_ct) };
    const dims = [{ d: new Decimal(delta.pcs), key: "pcs" as const }, { d: delta.weight, key: "weight" as const }];
    for (const { d, key } of dims) {
      if (d.isZero()) continue;
      const amount = d.abs();
      if (type === "memo-out-return") {
        if (d.gt(0) && amount.gt(memoOut[key])) memoOutShort.push(stock);
        if (d.lt(0) && amount.gt(onHand[key])) inUse.push(stock);
      } else if (d.gt(0)) {
        if (amount.gt(onHand[key])) exceeds.push(stock);
      } else if (amount.gt((type === "reserve" ? reserved : memoOut)[key])) {
        inUse.push(stock);
      }
    }
  }
  const unique = (list: LockedStock[]) => [...new Map(list.map((stock) => [stock.id, stock])).values()].map(short);
  if (exceeds.length > 0) return new AppError(409, "STOCK_HOLD_EXCEEDS_AVAILABLE", { items: unique(exceeds) });
  if (memoOutShort.length > 0) return new AppError(409, "STOCK_HOLD_EXCEEDS_MEMO_OUT", { items: unique(memoOutShort) });
  if (inUse.length > 0) return new AppError(409, "STOCK_HOLD_IN_USE", { items: unique(inUse) });
  return null;
}

export type HoldResult = {
  revision: number; replayed: boolean;
  holds: HoldInput[];
  stocks: { stockUuid: string; stockId: string; availablePcs: number; availableWeightCt: string }[];
};

export async function applyHolds(tx: Tx, request: HoldRequest): Promise<HoldResult> {
  const holds = normalizeHolds(request.holds);
  const hash = holdRequestHash(request.documentNo, holds);
  const [doc] = await tx.$queryRaw<{ applied_revision: number; request_hash: string; inserted: boolean }[]>`
    INSERT INTO "inventory"."stock_hold_document" ("document_type", "document_id", "applied_revision", "request_hash", "document_no", "result", "updated_at")
    VALUES (${request.documentType}, ${request.documentId}::uuid, ${request.revision}::int, ${hash}, ${request.documentNo}, '{}'::jsonb, now())
    ON CONFLICT ("document_type", "document_id") DO UPDATE SET "updated_at" = "stock_hold_document"."updated_at"
    RETURNING "applied_revision", "request_hash", (xmax = 0) AS "inserted"`;
  if (!doc.inserted) {
    if (request.revision === doc.applied_revision && hash === doc.request_hash) return replay(tx, request);
    if (request.revision <= doc.applied_revision) throw new AppError(409, "STOCK_HOLD_STALE", { appliedRevision: doc.applied_revision });
  }
  const wanted = new Map(holds.map((hold) => [hold.stockUuid, hold]));
  const locked = await tx.$queryRaw<LockedStock[]>`
    SELECT s."id", s."stock_id", s."status", s."on_hand_pcs", s."on_hand_weight_ct"::text AS "on_hand_weight_ct", s."reserved_pcs", s."reserved_weight_ct"::text AS "reserved_weight_ct",
      s."memo_out_pcs", s."memo_out_weight_ct"::text AS "memo_out_weight_ct", (l."sync_state" = 'SYNCING') AS "load_syncing",
      h."pcs" AS "held_pcs", h."weight_ct"::text AS "held_weight_ct"
    FROM "inventory"."stock" s
    JOIN "inventory"."load_to_stock" l ON l."id" = s."load_id"
    LEFT JOIN "inventory"."stock_hold" h ON h."stock_uuid" = s."id" AND h."document_type" = ${request.documentType} AND h."document_id" = ${request.documentId}::uuid
    WHERE s."id" = ANY(${[...wanted.keys()]}::uuid[])
      OR s."id" IN (SELECT x."stock_uuid" FROM "inventory"."stock_hold" x WHERE x."document_type" = ${request.documentType} AND x."document_id" = ${request.documentId}::uuid)
    ORDER BY s."id" FOR UPDATE OF s`;
  const byId = new Map(locked.map((stock) => [stock.id, stock]));
  const ids = new Set([...wanted.keys(), ...locked.filter((stock) => stock.held_pcs !== null).map((stock) => stock.id)]);
  const deltas: Delta[] = [...ids].sort().map((stockUuid) => {
    const stock = byId.get(stockUuid);
    const want = wanted.get(stockUuid);
    const next = { pcs: want?.pcs ?? 0, weight: new Decimal(want?.weightCt ?? 0) };
    const heldPcs = stock?.held_pcs ?? 0;
    const heldWeight = new Decimal(stock?.held_weight_ct ?? 0);
    return { stock, stockUuid, pcs: next.pcs - heldPcs, weight: next.weight.minus(heldWeight), next };
  });
  const refusal = checkDeltas(request.documentType, deltas);
  if (refusal) throw refusal;

  const moved = deltas.filter((delta) => delta.stock && (delta.pcs !== 0 || !delta.weight.isZero()));
  if (moved.length > 0) {
    // On-hand change per stock: −d for RESERVED / MEMO_OUT, +d for MEMO_OUT_RETURN; the bucket gets the opposite.
    const sign = request.documentType === "memo-out-return" ? 1 : -1;
    const values = moved.map((delta) => {
      const onHandPcs = sign * delta.pcs;
      const onHandWeight = delta.weight.times(sign);
      const reserved = request.documentType === "reserve";
      return Prisma.sql`(${delta.stockUuid}::uuid, ${onHandPcs}::int, ${onHandWeight.toFixed(3)}::numeric, ${reserved ? -onHandPcs : 0}::int, ${(reserved ? onHandWeight.negated() : new Decimal(0)).toFixed(3)}::numeric,
        ${reserved ? 0 : -onHandPcs}::int, ${(reserved ? new Decimal(0) : onHandWeight.negated()).toFixed(3)}::numeric, ${delta.pcs > 0 || delta.weight.gt(0)}::boolean)`;
    });
    await tx.$executeRaw(Prisma.sql`
      UPDATE "inventory"."stock" AS s SET
        "on_hand_pcs" = s."on_hand_pcs" + v.oh_pcs, "on_hand_weight_ct" = s."on_hand_weight_ct" + v.oh_weight,
        "reserved_pcs" = s."reserved_pcs" + v.rs_pcs, "reserved_weight_ct" = s."reserved_weight_ct" + v.rs_weight,
        "memo_out_pcs" = s."memo_out_pcs" + v.mo_pcs, "memo_out_weight_ct" = s."memo_out_weight_ct" + v.mo_weight,
        "first_used_at" = CASE WHEN v.up THEN COALESCE(s."first_used_at", now()) ELSE s."first_used_at" END,
        "version" = s."version" + 1, "updated_at" = now()
      FROM (VALUES ${Prisma.join(values)}) AS v(id, oh_pcs, oh_weight, rs_pcs, rs_weight, mo_pcs, mo_weight, up)
      WHERE s."id" = v.id`);
  }
  await tx.$executeRaw`DELETE FROM "inventory"."stock_hold" WHERE "document_type" = ${request.documentType} AND "document_id" = ${request.documentId}::uuid`;
  if (holds.length > 0) {
    await tx.stock_hold.createMany({
      data: holds.map((hold) => ({
        id: uuidV7(), document_type: request.documentType, document_id: request.documentId, stock_uuid: hold.stockUuid, kind: KIND[request.documentType],
        pcs: hold.pcs, weight_ct: hold.weightCt, revision: request.revision, document_no: request.documentNo,
      })),
    });
  }
  const movements = moved.flatMap((delta) => movementRows(request, delta));
  if (movements.length > 0) await tx.stock_movement.createMany({ data: movements });
  await tx.$executeRaw`
    UPDATE "inventory"."stock_hold_document" SET "applied_revision" = ${request.revision}::int, "request_hash" = ${hash}, "document_no" = ${request.documentNo},
      "result" = ${JSON.stringify({ stockCount: holds.length, movedCount: moved.length })}::jsonb, "updated_at" = now()
    WHERE "document_type" = ${request.documentType} AND "document_id" = ${request.documentId}::uuid`;
  const after = (delta: Delta) => {
    const stock = delta.stock!;
    const sign = request.documentType === "memo-out-return" ? 1 : -1;
    return { stockUuid: stock.id, stockId: stock.stock_id, availablePcs: stock.on_hand_pcs + sign * delta.pcs, availableWeightCt: new Decimal(stock.on_hand_weight_ct).plus(delta.weight.times(sign)).toFixed(3) };
  };
  return { revision: request.revision, replayed: false, holds, stocks: deltas.filter((delta) => delta.stock).map(after) };
}

/** One movement per stock; two when pcs and weight move in opposite directions (an edit that adds pcs but trims weight). */
function movementRows(request: HoldRequest, delta: Delta) {
  const sign = request.documentType === "memo-out-return" ? 1 : -1;
  const base = { stock_uuid: delta.stockUuid, document_type: request.documentType, document_id: request.documentId, revision: request.revision, cost_delta_base: "0", created_by: request.actorId };
  const row = (pcs: number, weight: Dec) => ({ ...base, id: uuidV7(), kind: (pcs > 0 || weight.gt(0) ? MOVEMENT[request.documentType].up : MOVEMENT[request.documentType].down), pcs_delta: sign * pcs, weight_delta: weight.times(sign).toFixed(3) });
  const opposite = (delta.pcs > 0 && delta.weight.lt(0)) || (delta.pcs < 0 && delta.weight.gt(0));
  return opposite ? [row(delta.pcs, new Decimal(0)), row(0, delta.weight)] : [row(delta.pcs, delta.weight)];
}

async function replay(tx: Tx, request: HoldRequest): Promise<HoldResult> {
  const rows = await tx.$queryRaw<{ stock_uuid: string; pcs: number; weight_ct: string; stock_id: string; on_hand_pcs: number; on_hand_weight_ct: string }[]>`
    SELECT h."stock_uuid", h."pcs", h."weight_ct"::text AS "weight_ct", s."stock_id", s."on_hand_pcs", s."on_hand_weight_ct"::text AS "on_hand_weight_ct"
    FROM "inventory"."stock_hold" h JOIN "inventory"."stock" s ON s."id" = h."stock_uuid"
    WHERE h."document_type" = ${request.documentType} AND h."document_id" = ${request.documentId}::uuid ORDER BY h."stock_uuid"`;
  return {
    revision: request.revision, replayed: true,
    holds: rows.map((row) => ({ stockUuid: row.stock_uuid, pcs: row.pcs, weightCt: new Decimal(row.weight_ct).toFixed(3) })),
    stocks: rows.map((row) => ({ stockUuid: row.stock_uuid, stockId: row.stock_id, availablePcs: row.on_hand_pcs, availableWeightCt: new Decimal(row.on_hand_weight_ct).toFixed(3) })),
  };
}

export async function readHolds(client: Client, documentType: HoldDocumentType, documentId: string) {
  const [doc] = await client.$queryRaw<{ applied_revision: number; document_no: string | null }[]>`
    SELECT "applied_revision", "document_no" FROM "inventory"."stock_hold_document" WHERE "document_type" = ${documentType} AND "document_id" = ${documentId}::uuid`;
  if (!doc) return null;
  const rows = await client.$queryRaw<{ stock_uuid: string; pcs: number; weight_ct: string }[]>`
    SELECT "stock_uuid", "pcs", "weight_ct"::text AS "weight_ct" FROM "inventory"."stock_hold"
    WHERE "document_type" = ${documentType} AND "document_id" = ${documentId}::uuid ORDER BY "stock_uuid" LIMIT ${HOLD_MAX_STOCKS}`;
  return { revision: doc.applied_revision, documentNo: doc.document_no, holds: rows.map((row) => ({ stockUuid: row.stock_uuid, pcs: row.pcs, weightCt: new Decimal(row.weight_ct).toFixed(3) })) };
}

/** Who holds stock of a load (≤ 5, for `holders` on the load detail and LOAD_TO_STOCK_IN_USE). One statement. */
export async function loadHolders(client: Client, loadId: string): Promise<{ documentType: HoldDocumentType; documentNo: string | null }[]> {
  const rows = await client.$queryRaw<{ document_type: HoldDocumentType; document_no: string | null }[]>`
    SELECT DISTINCT h."document_type", h."document_no" FROM "inventory"."stock_hold" h JOIN "inventory"."stock" s ON s."id" = h."stock_uuid"
    WHERE s."load_id" = ${loadId}::uuid ORDER BY 1, 2 LIMIT 5`;
  return rows.map((row) => ({ documentType: row.document_type, documentNo: row.document_no }));
}
