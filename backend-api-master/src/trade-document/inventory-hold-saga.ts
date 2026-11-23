import { AsyncLocalStorage } from "node:async_hooks";
import { createHash } from "node:crypto";
import { HttpStatus, Logger } from "@nestjs/common";
import { uuidV7 } from "@gms/storage";
import { partnerException, type FieldError } from "../common/errors";
import { WRITE_TX, type Tx } from "../common/persistence";
import { prisma } from "../database/prisma-client";
import { Prisma } from "../generated/prisma/client";
import { inventoryClient, InventoryRefusal, InventoryUnavailable, type HoldDocType, type HoldEntry } from "../inventory-client/inventory-client";
import type { DocumentErrors } from "./document-errors";
import type { EngineWriteAction } from "./document-engine";
import { inventoryUnavailable, type Qty } from "./own-stock-lines";
import { settleOldestFirst } from "./lot-allocation";

/**
 * ADR-0052 D19 / SA-LS-P2-05/06/09: master saga "acquire → local → release" that keeps inventory's holds of a Reserve,
 * Memo Out or Memo Out Return equal to the document's APPLIED own-stock lines (status APPROVED, not deleted).
 *
 *   1. Pre: on-access re-drive; refuse a SYNCING document (`<CODE>_BUSY`); H_old = applied set (from the lines), H_new =
 *      the caller's prediction. Split per stock and dimension: acquire = changes inventory can refuse (RESERVED /
 *      MEMO_OUT up, MEMO_OUT_RETURN down); H_mid = H_old + acquire.
 *   2. Acquire (only when H_mid ≠ H_old): tx0 sets SYNCING and stores the op (ACQUIRE, revision r), then `PUT r = H_mid`.
 *      Refused → op REFUSED, IDLE, error mapped per row. Unknown → 503 INVENTORY_UNAVAILABLE; the op stays PREPARED and is
 *      abandoned by re-drive (`PUT r+1 = H_old`).
 *   3. tx1 = the engine body unchanged; its `afterWrite` hook (same transaction) computes the final applied set F, checks
 *      it is covered by H_mid (else `<CODE>_BUSY`: something changed meanwhile, e.g. the approval setting), and either
 *      finishes the op (F = H_mid) or turns it into RELEASE (r' = next) with the document still SYNCING. A business
 *      failure of tx1 after an acquire → compensation `PUT r+1 = H_old` (release-only), op ABANDONED.
 *   4. Release after commit: `PUT r' = F`; success → DONE, IDLE; unknown → re-driven forward (same revision) on access, at
 *      start and every 60 s (≤ 20 ops, 15 s lease, backoff ≤ 60 s, STUCK after 10 attempts).
 * No HTTP call runs inside a database transaction. STALE / EXCEEDS_MEMO_OUT → STUCK + `master.inventory_sync_stuck`.
 */
const Decimal = Prisma.Decimal;
export type HoldSet = Map<string, Qty>;
export const LEASE_MS = 15_000;
export const MAX_ATTEMPTS = 10;
export const SWEEP_BATCH = 20;
export const BUSY_RETRY_SECONDS = 5;

type DocSpec = { table: Prisma.Sql; code: string; acquireUp: boolean; lines: (client: Tx | typeof prisma, id: string, appliedOnly: boolean) => Promise<HoldSet> };

async function sums(client: Tx | typeof prisma, sql: Prisma.Sql): Promise<HoldSet> {
  const rows = await client.$queryRaw<{ stock: string; pcs: bigint | number; weight: Prisma.Decimal | string }[]>(sql);
  return new Map(rows.map((row) => [row.stock, { pcs: Number(row.pcs), weight: new Decimal(row.weight.toString()) }]));
}
const applied = (appliedOnly: boolean, alias: string) => (appliedOnly ? Prisma.sql`AND ${Prisma.raw(alias)}.status = 'APPROVED' AND ${Prisma.raw(alias)}.deleted_at IS NULL` : Prisma.empty);

/** Fixed identifiers per document type (never input). */
export const DOC_SPECS: Record<HoldDocType, DocSpec> = {
  // ADR-0055 D7: legacy own lines by their stock + own-lot lines by their stored allocation rows.
  reserve: {
    table: Prisma.raw(`"partner"."reserve"`), code: "RESERVE", acquireUp: true,
    lines: (client, id, appliedOnly) => sums(client, Prisma.sql`
      SELECT x.stock, sum(x.pcs) AS pcs, sum(x.weight) AS weight FROM (
        SELECT l.own_stock_id::text AS stock, l.pcs, l.weight_ct AS weight FROM "partner"."reserve_line" l JOIN "partner"."reserve" h ON h.id = l.reserve_id
        WHERE h.id = ${id}::uuid AND l.own_stock_id IS NOT NULL ${applied(appliedOnly, "h")}
        UNION ALL
        SELECT a.own_stock_id::text, a.pcs, a.weight_ct FROM "partner"."reserve_line_alloc" a JOIN "partner"."reserve_line" l ON l.id = a.line_id JOIN "partner"."reserve" h ON h.id = l.reserve_id
        WHERE h.id = ${id}::uuid AND l.lot_key LIKE 'O%' AND a.own_stock_id IS NOT NULL ${applied(appliedOnly, "h")}
      ) x GROUP BY x.stock`),
  },
  "memo-out": {
    table: Prisma.raw(`"partner"."memo_out"`), code: "MEMO_OUT", acquireUp: true,
    lines: (client, id, appliedOnly) => sums(client, Prisma.sql`
      SELECT x.stock, sum(x.pcs) AS pcs, sum(x.weight) AS weight FROM (
        SELECT l.own_stock_id::text AS stock, l.pcs, l.weight_ct AS weight FROM "partner"."memo_out_line" l JOIN "partner"."memo_out" h ON h.id = l.memo_out_id
        WHERE h.id = ${id}::uuid AND l.own_stock_id IS NOT NULL ${applied(appliedOnly, "h")}
        UNION ALL
        SELECT a.own_stock_id::text, a.pcs, a.weight_ct FROM "partner"."memo_out_line_alloc" a JOIN "partner"."memo_out_line" l ON l.id = a.line_id JOIN "partner"."memo_out" h ON h.id = l.memo_out_id
        WHERE h.id = ${id}::uuid AND l.lot_key LIKE 'O%' AND a.own_stock_id IS NOT NULL ${applied(appliedOnly, "h")}
      ) x GROUP BY x.stock`),
  },
  "memo-out-return": {
    // Applied: what the return recorded per own stock; not applied: the oldest-first settlement it would make now.
    table: Prisma.raw(`"partner"."memo_out_return"`), code: "MEMO_OUT_RETURN", acquireUp: false,
    lines: (client, id, appliedOnly) => (appliedOnly
      ? sums(client, Prisma.sql`
        SELECT a.own_stock_id::text AS stock, sum(r.pcs) AS pcs, sum(r.weight_ct) AS weight FROM "partner"."memo_out_return_line" l
        JOIN "partner"."memo_out_return_line_alloc" r ON r.line_id = l.id JOIN "partner"."memo_out_line_alloc" a ON a.id = r.memo_out_line_alloc_id
        JOIN "partner"."memo_out_return" h ON h.id = l.memo_out_return_id
        WHERE h.id = ${id}::uuid AND a.own_stock_id IS NOT NULL ${applied(true, "h")} GROUP BY a.own_stock_id`)
      : predictedReturnHolds(client, id)),
  },
};

/** The own-stock holds a Memo Out Return would settle now (oldest seq first over its Memo Out lines' own allocation). */
export async function predictedReturnHolds(client: Tx | typeof prisma, id: string): Promise<HoldSet> {
  const lines = await client.$queryRaw<{ memo_out_line_id: string; pcs: number; weight_ct: string }[]>(Prisma.sql`
    SELECT memo_out_line_id::text AS memo_out_line_id, pcs, weight_ct::text AS weight_ct FROM "partner"."memo_out_return_line" WHERE memo_out_return_id = ${id}::uuid ORDER BY position`);
  return returnHoldsOf(client, lines.map((line) => ({ memoOutLineId: line.memo_out_line_id, pcs: line.pcs, weightCt: line.weight_ct })));
}

/** Simulated settlement of return lines over the Memo Out lines' unsettled own-stock allocation rows (one read). */
export async function returnHoldsOf(client: Tx | typeof prisma, lines: readonly { memoOutLineId: string; pcs: number; weightCt: string | Prisma.Decimal }[]): Promise<HoldSet> {
  const set: HoldSet = new Map();
  if (lines.length === 0) return set;
  const rows = await client.$queryRaw<{ id: string; line_id: string; seq: number; own_stock_id: string; pcs: number; weight_ct: string; settled_pcs: number; settled_weight_ct: string }[]>(Prisma.sql`
    SELECT id::text AS id, line_id::text AS line_id, seq, own_stock_id::text AS own_stock_id, pcs, weight_ct::text AS weight_ct, settled_pcs, settled_weight_ct::text AS settled_weight_ct
    FROM "partner"."memo_out_line_alloc" WHERE line_id = ANY(${lines.map((line) => line.memoOutLineId)}::uuid[]) AND own_stock_id IS NOT NULL`);
  for (const line of lines) {
    const own = rows.filter((row) => row.line_id === line.memoOutLineId).map((row) => ({
      id: row.id, seq: row.seq, pcs: row.pcs, weight: new Decimal(row.weight_ct), settledPcs: row.settled_pcs, settledWeight: new Decimal(row.settled_weight_ct), stock: row.own_stock_id,
    }));
    if (own.length === 0) continue;
    const parts = settleOldestFirst(own, { pcs: line.pcs, weight: new Decimal(line.weightCt.toString()) }) ?? [];
    for (const part of parts) {
      const stock = own.find((row) => row.id === part.id)!.stock;
      const qty = set.get(stock) ?? zero();
      set.set(stock, { pcs: qty.pcs + part.pcs, weight: qty.weight.plus(part.weight) });
    }
  }
  return set;
}

/** Own stocks per Memo Out line (its own allocation rows), for row errors and the fast-path decision. */
export async function ownStocksOfOutLines(client: Tx | typeof prisma, outLineIds: readonly string[]): Promise<Map<string, string[]>> {
  const map = new Map<string, string[]>();
  if (outLineIds.length === 0) return map;
  const rows = await client.$queryRaw<{ line_id: string; stock: string }[]>(Prisma.sql`
    SELECT line_id::text AS line_id, own_stock_id::text AS stock FROM "partner"."memo_out_line_alloc" WHERE line_id = ANY(${[...outLineIds]}::uuid[]) AND own_stock_id IS NOT NULL
    UNION
    SELECT id::text, own_stock_id::text FROM "partner"."memo_out_line" WHERE id = ANY(${[...outLineIds]}::uuid[]) AND own_stock_id IS NOT NULL`);
  for (const row of rows) map.set(row.line_id, [...(map.get(row.line_id) ?? []), row.stock]);
  return map;
}

// ---------- pure set helpers (UT-LS-P2-02) ----------

const zero = (): Qty => ({ pcs: 0, weight: new Decimal(0) });
const isZero = (qty: Qty) => qty.pcs === 0 && qty.weight.isZero();
const clean = (set: HoldSet): HoldSet => new Map([...set].filter(([, qty]) => !isZero(qty)));

export function holdsEqual(a: HoldSet, b: HoldSet): boolean {
  const x = clean(a);
  const y = clean(b);
  if (x.size !== y.size) return false;
  for (const [stock, qty] of x) {
    const other = y.get(stock);
    if (!other || other.pcs !== qty.pcs || !other.weight.equals(qty.weight)) return false;
  }
  return true;
}

/** H_mid per stock and dimension: max(old, new) when increases are refusable (RESERVED / MEMO_OUT), else min. */
export function splitHolds(acquireUp: boolean, old: HoldSet, next: HoldSet) {
  const mid: HoldSet = new Map();
  for (const stock of new Set([...old.keys(), ...next.keys()])) {
    const a = old.get(stock) ?? zero();
    const b = next.get(stock) ?? zero();
    const pick = (x: number, y: number) => (acquireUp ? Math.max(x, y) : Math.min(x, y));
    const weight = acquireUp ? Decimal.max(a.weight, b.weight) : Decimal.min(a.weight, b.weight);
    const qty = { pcs: pick(a.pcs, b.pcs), weight };
    if (!isZero(qty)) mid.set(stock, qty);
  }
  return { mid, acquire: !holdsEqual(mid, old), release: !holdsEqual(mid, next) };
}

/** F is safe against what inventory holds (H_mid): never more held than acquired (up kinds), never less returned (MOR). */
export function covered(acquireUp: boolean, final: HoldSet, mid: HoldSet): boolean {
  for (const stock of new Set([...final.keys(), ...mid.keys()])) {
    const f = final.get(stock) ?? zero();
    const m = mid.get(stock) ?? zero();
    const ok = acquireUp ? f.pcs <= m.pcs && f.weight.lte(m.weight) : f.pcs >= m.pcs && f.weight.gte(m.weight);
    if (!ok) return false;
  }
  return true;
}

export function toEntries(set: HoldSet): HoldEntry[] {
  return [...clean(set)].sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0)).map(([stockUuid, qty]) => ({ stockUuid, pcs: qty.pcs, weightCt: qty.weight.toFixed(3) }));
}
export function fromEntries(entries: readonly HoldEntry[]): HoldSet {
  return new Map(entries.map((entry) => [entry.stockUuid, { pcs: entry.pcs, weight: new Decimal(entry.weightCt) }]));
}
/** Sum of own-stock line quantities per stock. */
export function sumLines(lines: readonly { stock: string | null | undefined; pcs: number; weightCt: string | Prisma.Decimal }[]): HoldSet {
  const set: HoldSet = new Map();
  for (const line of lines) {
    if (!line.stock) continue;
    const qty = set.get(line.stock) ?? zero();
    set.set(line.stock, { pcs: qty.pcs + line.pcs, weight: qty.weight.plus(new Decimal(line.weightCt.toString())) });
  }
  return set;
}
const hashOf = (docNo: string | null, holds: HoldEntry[]) => createHash("sha256").update(`${docNo ?? ""}|${holds.map((h) => `${h.stockUuid}:${h.pcs}:${h.weightCt}`).join(",")}`, "utf8").digest("hex");

// ---------- saga ----------

type OpPayload = { holds: HoldEntry[]; old: HoldEntry[]; docNo: string | null };
type OpRow = { id: string; document_type: HoldDocType; document_id: string; stage: "ACQUIRE" | "RELEASE" | "COMPENSATE"; state: string; revision: number; payload: OpPayload; attempts: number };
type Ctx = {
  type: HoldDocType; id: string; actorId: string; old: HoldSet; mid: HoldSet;
  op: { id: string; revision: number; docNo: string | null } | null;
  release: { opId: string; revision: number; holds: HoldEntry[]; docNo: string | null } | null;
};
const storage = new AsyncLocalStorage<Ctx>();

/**
 * Thrown inside the engine transaction when a write that bypassed the saga (fast path: no own-stock line in the input)
 * meets a document that holds or held our stock; the transaction rolls back and `withHolds` re-runs it through the saga.
 */
export class SagaRequired extends Error {
  constructor() {
    super("saga_required");
    this.name = "SagaRequired";
  }
}

export type RunSpec<T> = {
  type: HoldDocType;
  id: string;
  isCreate: boolean;
  actorId: string;
  expectedVersion?: number;
  /** Predicted applied set after the call (null = the call does not change holds). */
  next: (old: HoldSet) => Promise<HoldSet | null> | HoldSet | null;
  /** Already-read applied set (saves the read). */
  old?: HoldSet;
  /** Line positions per stock, for row errors (computed lazily on the saga path). */
  lineIndex?: ReadonlyMap<string, number[]> | (() => Promise<ReadonlyMap<string, number[]>>);
  call: () => Promise<T>;
  requestId?: string;
};

export class InventoryHoldSaga {
  private readonly logger = new Logger("InventoryHoldSaga");
  constructor(private readonly errorsOf: (type: HoldDocType) => DocumentErrors) {}

  busy(type: HoldDocType) {
    return partnerException(`${DOC_SPECS[type].code}_BUSY`, HttpStatus.CONFLICT, null, { retryAfterSeconds: BUSY_RETRY_SECONDS });
  }

  async run<T>(spec: RunSpec<T>): Promise<T> {
    const doc = DOC_SPECS[spec.type];
    let header: { sync_state: string; hold_revision: number; doc_no: string; version: number } | undefined;
    if (!spec.isCreate) {
      await this.redriveDocument(spec.type, spec.id);
      header = await this.header(prisma, spec.type, spec.id);
      if (header?.sync_state === "SYNCING") throw this.busy(spec.type);
    }
    const old: HoldSet = spec.old ?? (spec.isCreate ? new Map() : await doc.lines(prisma, spec.id, true));
    const next = await spec.next(old);
    const { mid, acquire } = next ? splitHolds(doc.acquireUp, old, next) : { mid: old, acquire: false };
    const ctx: Ctx = { type: spec.type, id: spec.id, actorId: spec.actorId, old, mid, op: null, release: null };

    if (acquire) {
      const revision = (header?.hold_revision ?? 0) + 1;
      const docNo = header?.doc_no ?? null;
      const opId = uuidV7();
      const holds = toEntries(mid);
      const started = await prisma.$transaction(async (tx) => {
        if (header) {
          const marked = await tx.$executeRaw(Prisma.sql`UPDATE ${doc.table} SET sync_state = 'SYNCING'
            WHERE id = ${spec.id}::uuid AND sync_state = 'IDLE'
            ${spec.expectedVersion === undefined ? Prisma.empty : Prisma.sql`AND version = ${spec.expectedVersion}::int`}`);
          if (marked === 0) return false;
        }
        await this.insertOp(tx, { id: opId, type: spec.type, docId: spec.id, stage: "ACQUIRE", revision, payload: { holds, old: toEntries(old), docNo }, actorId: spec.actorId });
        return true;
      }, WRITE_TX).catch((error: unknown) => {
        if ((error as { code?: string }).code === "P2002") throw this.busy(spec.type);
        throw error;
      });
      if (!started) {
        // Version moved or the document is SYNCING: the engine reports the version / status error; never hold here.
        const fresh = await this.header(prisma, spec.type, spec.id);
        if (fresh?.sync_state === "SYNCING") throw this.busy(spec.type);
        return storage.run({ ...ctx, mid: old }, spec.call);
      }
      ctx.op = { id: opId, revision, docNo };
      try {
        await inventoryClient().putHolds(spec.type, spec.id, { revision, documentNo: docNo, holds }, { requestId: spec.requestId, actorId: spec.actorId });
      } catch (error) {
        if (error instanceof InventoryRefusal) {
          const lineIndex = typeof spec.lineIndex === "function" ? await spec.lineIndex() : spec.lineIndex;
          const mapped = await this.refused(ctx, error, lineIndex);
          throw mapped;
        }
        this.logger.warn({ event: "master.inventory_acquire_unknown", documentType: spec.type, documentId: spec.id, revision, reason: error instanceof Error ? error.message.slice(0, 40) : "unknown" });
        throw inventoryUnavailable();
      }
    }

    let result: T;
    try {
      result = await storage.run(ctx, spec.call);
    } catch (error) {
      if (ctx.op) await this.compensate(ctx);
      throw error;
    }
    // The document is saved: a release that fails here is re-driven later and never fails the request.
    if (ctx.release) await this.driveRelease(ctx.release.opId).catch(() => this.logger.warn({ event: "master.inventory_release_deferred", documentType: ctx.type, documentId: ctx.id }));
    return result;
  }

  /**
   * Fast path first: a write whose input names no own stock calls the engine directly; when the document turns out to
   * hold (or have held) our stock, the engine transaction is rolled back by `SagaRequired` and the write re-runs through
   * the saga. Memo-Stock-only documents therefore keep today's statements (+ the in-transaction header check).
   */
  async withHolds<T>(ownInInput: boolean, spec: RunSpec<T> | (() => Promise<RunSpec<T>>), plain?: () => Promise<T>): Promise<T> {
    const resolve = () => (typeof spec === "function" ? spec() : Promise.resolve(spec));
    if (!ownInInput) {
      try {
        return await (plain ?? (spec as RunSpec<T>).call)();
      } catch (error) {
        if (!(error instanceof SagaRequired)) throw error;
      }
    }
    return this.run(await resolve());
  }

  /** Engine `afterWrite` (inside tx1). */
  async inTx(type: HoldDocType, tx: Tx, id: string, action: EngineWriteAction): Promise<void> {
    const ctx = storage.getStore();
    const doc = DOC_SPECS[type];
    const [header] = await tx.$queryRaw<{ sync_state: string; hold_revision: number; doc_no: string }[]>(Prisma.sql`
      SELECT sync_state, hold_revision, doc_no FROM ${doc.table} WHERE id = ${id}::uuid FOR UPDATE`);
    if (!header) return;
    if (!ctx || ctx.type !== type || ctx.id !== id) {
      if (action === "submit" || action === "review") {
        if (header.sync_state === "SYNCING") throw this.busy(type);
        return;
      }
      // Fast path (no saga): only a document that never held our stock and holds none after this write passes.
      if (header.sync_state === "SYNCING" || header.hold_revision > 0 || (await doc.lines(tx, id, true)).size > 0) throw new SagaRequired();
      return;
    }
    if (ctx.op) {
      const [op] = await tx.$queryRaw<{ stage: string; state: string; revision: number }[]>`
        SELECT stage, state, revision FROM "partner"."inventory_sync_op" WHERE id = ${ctx.op.id}::uuid FOR UPDATE`;
      if (!op || op.stage !== "ACQUIRE" || op.state !== "PREPARED" || op.revision !== ctx.op.revision) throw this.busy(type);
    } else if (header.sync_state !== "IDLE") {
      throw this.busy(type);
    }
    const final = await doc.lines(tx, id, true);
    if (!covered(doc.acquireUp, final, ctx.mid)) throw this.busy(type);
    const docNo = header.doc_no;
    const needRelease = !holdsEqual(final, ctx.mid) || (ctx.op !== null && ctx.op.docNo !== docNo && final.size > 0);
    const base = ctx.op ? ctx.op.revision : header.hold_revision;
    if (!needRelease) {
      if (ctx.op) {
        await tx.$executeRaw`UPDATE "partner"."inventory_sync_op" SET state = 'DONE', updated_at = now() WHERE id = ${ctx.op.id}::uuid`;
        await tx.$executeRaw(Prisma.sql`UPDATE ${doc.table} SET sync_state = 'IDLE', hold_revision = ${base}::int WHERE id = ${id}::uuid`);
      }
      return;
    }
    const revision = base + 1;
    const holds = toEntries(final);
    const payload: OpPayload = { holds, old: toEntries(ctx.old), docNo };
    let opId: string;
    if (ctx.op) {
      opId = ctx.op.id;
      await tx.$executeRaw`UPDATE "partner"."inventory_sync_op" SET stage = 'RELEASE', revision = ${revision}::int, request_hash = ${hashOf(docNo, holds)},
        payload = ${JSON.stringify(payload)}::jsonb, next_attempt_at = now() + interval '15 seconds', updated_at = now() WHERE id = ${opId}::uuid`;
    } else {
      opId = uuidV7();
      await this.insertOp(tx, { id: opId, type, docId: id, stage: "RELEASE", revision, payload, actorId: ctx.actorId });
    }
    await tx.$executeRaw(Prisma.sql`UPDATE ${doc.table} SET sync_state = 'SYNCING' WHERE id = ${id}::uuid`);
    ctx.release = { opId, revision, holds, docNo };
  }

  private async header(client: Tx | typeof prisma, type: HoldDocType, id: string) {
    const [row] = await client.$queryRaw<{ sync_state: string; hold_revision: number; doc_no: string; version: number }[]>(Prisma.sql`
      SELECT sync_state, hold_revision, doc_no, version FROM ${DOC_SPECS[type].table} WHERE id = ${id}::uuid`);
    return row;
  }

  private async insertOp(tx: Tx, op: { id: string; type: HoldDocType; docId: string; stage: string; revision: number; payload: OpPayload; actorId: string }) {
    await tx.$executeRaw`
      INSERT INTO "partner"."inventory_sync_op" (id, document_type, document_id, stage, state, revision, request_hash, payload, attempts, next_attempt_at, created_by)
      VALUES (${op.id}::uuid, ${op.type}, ${op.docId}::uuid, ${op.stage}, 'PREPARED', ${op.revision}::int, ${hashOf(op.payload.docNo, op.payload.holds)},
        ${JSON.stringify(op.payload)}::jsonb, 0, now() + interval '15 seconds', ${op.actorId.slice(0, 64)})`;
  }

  /** Acquire refused: op REFUSED (or STUCK), document IDLE, error per row (error-handling "Inventory internal codes"). */
  private async refused(ctx: Ctx, error: InventoryRefusal, lineIndex: ReadonlyMap<string, number[]> | undefined): Promise<unknown> {
    const errors = this.errorsOf(ctx.type);
    const stuck = error.code === "STOCK_HOLD_STALE" || error.code === "STOCK_HOLD_EXCEEDS_MEMO_OUT";
    // The refused revision is consumed (gaps are allowed in inventory), so the next op uses a fresh one.
    await this.finish(ctx.type, ctx.id, ctx.op!.id, ctx.op!.revision, stuck ? "STUCK" : "REFUSED", error.code, !stuck, true);
    if (stuck) {
      this.logger.error({ event: "master.inventory_sync_stuck", documentType: ctx.type, documentId: ctx.id, revision: ctx.op!.revision, code: error.code });
      return this.busy(ctx.type);
    }
    const items = Array.isArray(error.details?.items) ? (error.details!.items as { stockUuid: string; availablePcs?: number; availableWeightCt?: string }[]) : [];
    const paths = (stock: string) => lineIndex?.get(stock) ?? [];
    switch (error.code) {
      case "STOCK_HOLD_EXCEEDS_AVAILABLE": {
        const fields: FieldError[] = items.flatMap((item) => paths(item.stockUuid).flatMap((index) => {
          // Available for this document = free on-hand + what it already holds.
          const held = ctx.old.get(item.stockUuid) ?? zero();
          const params = { availablePcs: (item.availablePcs ?? 0) + held.pcs, availableWeightCt: new Decimal(item.availableWeightCt ?? "0").plus(held.weight).toFixed(3) };
          return [{ path: `lines.${index}.pcs`, code: "exceeds_pending", params }, { path: `lines.${index}.weightCt`, code: "exceeds_pending", params }];
        }));
        return partnerException(`${DOC_SPECS[ctx.type].code}_PENDING_SHORT`, HttpStatus.CONFLICT, fields);
      }
      case "STOCK_HOLD_UNAVAILABLE": {
        const stocks = Array.isArray(error.details?.stockUuids) ? (error.details!.stockUuids as string[]) : [];
        const field = ctx.type === "memo-out-return" ? "memoOutLineId" : "ownStockId";
        return errors.referenceInvalid(stocks.flatMap((stock) => paths(stock).map((index) => ({ path: `lines.${index}.${field}`, code: "invalid_reference" }))));
      }
      case "STOCK_HOLD_IN_USE":
        return errors.inUse(null);
      case "STOCK_HOLD_BUSY":
        return this.busy(ctx.type);
      default:
        this.logger.error({ event: "master.inventory_refused_unexpected", documentType: ctx.type, documentId: ctx.id, code: error.code.slice(0, 64) });
        return inventoryUnavailable();
    }
  }

  /** tx1 failed after an acquire: `PUT r+1 = H_old` (release-only); unknown → left PREPARED/COMPENSATE for re-drive. */
  private async compensate(ctx: Ctx): Promise<void> {
    const op = ctx.op!;
    const revision = op.revision + 1;
    const holds = toEntries(ctx.old);
    const claimed = await prisma.$executeRaw`
      UPDATE "partner"."inventory_sync_op" SET stage = 'COMPENSATE', revision = ${revision}::int, request_hash = ${hashOf(op.docNo, holds)},
        payload = ${JSON.stringify({ holds, old: holds, docNo: op.docNo })}::jsonb, next_attempt_at = now() + interval '15 seconds', updated_at = now()
      WHERE id = ${op.id}::uuid AND state = 'PREPARED' AND stage = 'ACQUIRE' AND revision = ${op.revision}::int`;
    if (claimed === 0) return;
    await this.drive({ id: op.id, document_type: ctx.type, document_id: ctx.id, stage: "COMPENSATE", state: "PREPARED", revision, payload: { holds, old: holds, docNo: op.docNo }, attempts: 0 });
  }

  private async driveRelease(opId: string): Promise<void> {
    const [op] = await prisma.$queryRaw<OpRow[]>`SELECT id::text AS id, document_type, document_id::text AS document_id, stage, state, revision, payload, attempts FROM "partner"."inventory_sync_op" WHERE id = ${opId}::uuid`;
    if (op && op.state === "PREPARED") await this.drive(op);
  }

  /**
   * Sends the op's PUT once. ACQUIRE (an unknown acquire) is first turned into COMPENSATE `r+1 = H_old` (abandon).
   * Success → DONE (RELEASE) / ABANDONED (COMPENSATE) and the document IDLE at that revision. Refusal → STUCK + log.
   * Unknown → attempts + 1, backoff ≤ 60 s, STUCK after 10.
   */
  private async drive(op: OpRow): Promise<void> {
    let current = op;
    if (current.stage === "ACQUIRE") {
      const revision = current.revision + 1;
      const holds = current.payload.old;
      const payload: OpPayload = { holds, old: holds, docNo: current.payload.docNo };
      const claimed = await prisma.$executeRaw`
        UPDATE "partner"."inventory_sync_op" SET stage = 'COMPENSATE', revision = ${revision}::int, request_hash = ${hashOf(payload.docNo, holds)},
          payload = ${JSON.stringify(payload)}::jsonb, updated_at = now()
        WHERE id = ${current.id}::uuid AND state = 'PREPARED' AND stage = 'ACQUIRE' AND revision = ${current.revision}::int`;
      if (claimed === 0) return;
      current = { ...current, stage: "COMPENSATE", revision, payload };
    }
    try {
      await inventoryClient().putHolds(current.document_type, current.document_id, { revision: current.revision, documentNo: current.payload.docNo, holds: current.payload.holds });
    } catch (error) {
      if (error instanceof InventoryRefusal) {
        this.logger.error({ event: "master.inventory_sync_stuck", documentType: current.document_type, documentId: current.document_id, revision: current.revision, code: error.code.slice(0, 64) });
        await prisma.$executeRaw`UPDATE "partner"."inventory_sync_op" SET state = 'STUCK', last_error = ${error.code.slice(0, 64)}, updated_at = now() WHERE id = ${current.id}::uuid AND state = 'PREPARED'`;
        return;
      }
      const attempts = current.attempts + 1;
      const reason = error instanceof InventoryUnavailable ? error.reason : "unknown";
      if (attempts >= MAX_ATTEMPTS) {
        this.logger.error({ event: "master.inventory_sync_stuck", documentType: current.document_type, documentId: current.document_id, revision: current.revision, code: reason.slice(0, 64) });
        await prisma.$executeRaw`UPDATE "partner"."inventory_sync_op" SET state = 'STUCK', attempts = ${attempts}::smallint, last_error = ${reason.slice(0, 64)}, updated_at = now() WHERE id = ${current.id}::uuid AND state = 'PREPARED'`;
      } else {
        const backoffMs = Math.min(60_000, 1_000 * 2 ** attempts);
        await prisma.$executeRaw`UPDATE "partner"."inventory_sync_op" SET attempts = ${attempts}::smallint, last_error = ${reason.slice(0, 64)},
          next_attempt_at = now() + make_interval(secs => ${backoffMs / 1000}), updated_at = now() WHERE id = ${current.id}::uuid AND state = 'PREPARED'`;
      }
      return;
    }
    await this.finish(current.document_type, current.document_id, current.id, current.revision, current.stage === "RELEASE" ? "DONE" : "ABANDONED", null, true, true);
  }

  /** Ends an op (guarded on PREPARED + revision) and, when asked, sets the document IDLE (and its applied revision). */
  private async finish(type: HoldDocType, docId: string, opId: string, revision: number, state: string, code: string | null, idle: boolean, applied: boolean) {
    await prisma.$transaction(async (tx) => {
      const ended = await tx.$executeRaw`UPDATE "partner"."inventory_sync_op" SET state = ${state}, last_error = ${code?.slice(0, 64) ?? null}, updated_at = now()
        WHERE id = ${opId}::uuid AND state = 'PREPARED' AND revision = ${revision}::int`;
      if (ended === 0 || !idle) return;
      await tx.$executeRaw(Prisma.sql`UPDATE ${DOC_SPECS[type].table} SET sync_state = 'IDLE'
        ${applied ? Prisma.sql`, hold_revision = GREATEST(hold_revision, ${revision}::int)` : Prisma.empty} WHERE id = ${docId}::uuid`);
    }, WRITE_TX);
  }

  /** On-access re-drive of a document's due op (lease respected). */
  async redriveDocument(type: HoldDocType, id: string): Promise<void> {
    const ops = await prisma.$queryRaw<OpRow[]>`
      UPDATE "partner"."inventory_sync_op" SET next_attempt_at = now() + interval '15 seconds', updated_at = now()
      WHERE document_type = ${type} AND document_id = ${id}::uuid AND state = 'PREPARED' AND next_attempt_at <= now()
      RETURNING id::text AS id, document_type, document_id::text AS document_id, stage, state, revision, payload, attempts`;
    for (const op of ops) await this.drive(op);
  }

  /** One sweep tick (NP-LS-P2-05): claim ≤ 20 due ops in one statement (15 s lease), drive each; purge finished > 30 days. */
  async sweep(): Promise<number> {
    const ops = await prisma.$queryRaw<OpRow[]>`
      UPDATE "partner"."inventory_sync_op" SET next_attempt_at = now() + interval '15 seconds', updated_at = now()
      WHERE id IN (SELECT id FROM "partner"."inventory_sync_op" WHERE state = 'PREPARED' AND next_attempt_at <= now() ORDER BY next_attempt_at LIMIT ${SWEEP_BATCH} FOR UPDATE SKIP LOCKED)
      RETURNING id::text AS id, document_type, document_id::text AS document_id, stage, state, revision, payload, attempts`;
    for (const op of ops) {
      try { await this.drive(op); } catch (error) {
        this.logger.warn({ event: "master.inventory_sync_redrive_failed", opId: op.id, errorName: error instanceof Error ? error.name : "unknown" });
      }
    }
    await prisma.$executeRaw`DELETE FROM "partner"."inventory_sync_op" WHERE id IN (
      SELECT id FROM "partner"."inventory_sync_op" WHERE state IN ('DONE', 'REFUSED', 'ABANDONED') AND updated_at < now() - interval '30 days' LIMIT 500)`;
    return ops.length;
  }

  /** Operator re-drive (`inventory-sync:redrive <type> <id>`): a STUCK / PREPARED op becomes due now and is driven. */
  async operatorRedrive(type: HoldDocType, id: string): Promise<string> {
    const reset = await prisma.$executeRaw`UPDATE "partner"."inventory_sync_op" SET state = 'PREPARED', attempts = 0, next_attempt_at = now(), updated_at = now()
      WHERE document_type = ${type} AND document_id = ${id}::uuid AND state IN ('PREPARED', 'STUCK')`;
    if (reset === 0) return "no active op";
    await this.redriveDocument(type, id);
    const [op] = await prisma.$queryRaw<{ state: string; stage: string }[]>`SELECT state, stage FROM "partner"."inventory_sync_op" WHERE document_type = ${type} AND document_id = ${id}::uuid ORDER BY revision DESC LIMIT 1`;
    return op ? `${op.stage} ${op.state}` : "none";
  }
}

// ---------- process registry ----------

const holdErrors = new Map<HoldDocType, DocumentErrors>();
/** Each holding document type registers its error factory (codes `<CODE>_*`). */
export function registerHoldErrors(type: HoldDocType, errors: DocumentErrors): void {
  holdErrors.set(type, errors);
}
/** The process saga shared by Reserve, Memo Out and Memo Out Return (and the sweep / operator script). */
export const holdSaga = new InventoryHoldSaga((type) => holdErrors.get(type)!);

/** Line positions per own stock (row errors). */
export function lineIndexOf(stocks: readonly (string | null | undefined)[]): Map<string, number[]> {
  const index = new Map<string, number[]>();
  stocks.forEach((stock, position) => {
    if (!stock) return;
    index.set(stock, [...(index.get(stock) ?? []), position]);
  });
  return index;
}
