import { createHash } from "node:crypto";
import { uuidV7 } from "@gms/storage";
import { AppError, validationError } from "../../platform/errors";
import { Decimal, Prisma, WRITE_TX, type Db, type Tx } from "../../platform/db";
import type { Logger } from "../../platform/logger";
import type { MasterApi, AllocationRequest, BatchLine } from "../../platform/master-api";
import type { MasterRefusal } from "../../platform/master-client";
import type { Principal } from "../../platform/auth/principal";
import { readSettingForShare } from "../../platform/approval/settings";
import type { NotificationHub } from "../../platform/notification/hub";
import { recordNotification, type NotificationSignal } from "../../platform/notification/store";
import { SyncDriver, SyncHold, LEASE_MS, type DriveOutcome, type OpKind, type OpRow } from "../../platform/sync/saga";
import { applyStockEdit, createStocks, lockLoadStocks, reverseStocks, type StockHeader, type StockSource } from "../stock/stock";
import { allocationLines, prepareDocument, type NormalizedDocument, type StoredRowRef } from "./prepare";
import { checkPhotos, explainMiss, formatDocNo, headerFields, insertParts, nextRunningNo, replaceParts } from "./repository";
import type { LoadInput } from "./schemas";

/**
 * Load to Stock writes (load-to-stock SA rev 1 architecture.md "Write paths", ADR-0050 flow, ADR-0052 D4/D5/D9/D10):
 * - Save with approval ON → DRAFT, nothing applied; Submit → PENDING; Approve applies through the saga; Revise (once) /
 *   Reject are guarded updates. Approval OFF → Save applies at once (provisional until master confirms) and the
 *   auto-approved load stays editable / deletable until its stock is used. No Restore (Q-LS-33).
 * - Every master read happens BEFORE the local transaction; the approval switch is read FOR SHARE inside it.
 */
export type ServiceDeps = {
  db: Db;
  master: MasterApi;
  logger: Logger;
  hub: NotificationHub;
  approvers(leaf: string): Promise<string[]>;
};
export type WriteResult = { id: string; docNo?: string; version: number; status: string; stockIds?: (string | null)[]; submittedAt?: string };

type DocPayload = NormalizedDocument & { stockIds: Record<string, string | null> };
type Header = {
  id: string; doc_no: string; status: string; version: number; vendor_id: string; vendor_name_snapshot: string; currency_code: string; created_by: string;
  applied_revision: number; auto_approved: boolean; deleted_at: Date | null; sync_state: string; mode: string; total_cost_base: string; provisional: boolean;
};
type RowWithSources = StockSource & { id: string; position: number; sources: { purchaseLineId: string; pcs: number; weightCt: string }[]; stockIdOrNull: string | null };

const opHash = (allocation: AllocationRequest) => createHash("sha256").update(JSON.stringify(allocation)).digest("hex");
const syncPending = (id: string) => new AppError(503, "SYNC_PENDING", { id, retryAfterSeconds: 5 }, { "Retry-After": "5" });

export class LoadToStockService {
  readonly sync: SyncDriver<WriteResult>;

  constructor(private readonly deps: ServiceDeps) {
    this.sync = new SyncDriver<WriteResult>(deps.db, deps.master, deps.logger, {
      apply: (tx, op, response) => this.applyOp(tx, op, response.stockIds),
      refuse: (tx, op) => this.refuseOp(tx, op),
      mapRefusal: (op, refusal) => this.mapRefusal(op, refusal),
      afterCommit: (result) => this.flushSignals(result),
    });
  }

  // ---------- shared ----------

  private pendingSignals = new Map<string, NotificationSignal[]>();
  private flushSignals(result: WriteResult) {
    const signals = this.pendingSignals.get(result.id);
    this.pendingSignals.delete(result.id);
    if (signals) this.deps.hub.emit(signals);
  }

  /** Master reads of a Save (3 calls: batch, resolve, numbering when asked; + company currency from a 60 s copy). */
  private async prepare(input: LoadInput, loadId: string | undefined, storedRows: ReadonlyMap<string, StoredRowRef>, requestId: string) {
    const lineIds = [...new Set(input.rows.flatMap((row) => row.sources.map((source) => source.purchaseLineId)))];
    const stoneCodeIds = [...new Set(input.rows.flatMap((row) => (row.attrs.stoneCodeId ? [row.attrs.stoneCodeId] : [])))];
    const locationNames = [...new Set(input.rows.map((row) => row.location))];
    const [batch, resolved, currency] = await Promise.all([
      this.deps.master.batch(lineIds, loadId, { requestId }),
      this.deps.master.resolve(stoneCodeIds, locationNames, { requestId }),
      this.deps.master.companyCurrency({ requestId }),
    ]);
    if (!currency) throw validationError([{ path: "currency", code: "required" }]);
    const vendorLine = batch.items.find((line: BatchLine) => line.vendorId === input.vendorId);
    return prepareDocument(input, {
      lines: batch.items, stoneCodes: resolved.stoneCodes, locations: resolved.locations, storedRows, companyCurrency: currency,
      vendor: vendorLine ? { code: (vendorLine as BatchLine & { vendorCode?: string }).vendorCode ?? "", name: (vendorLine as BatchLine & { vendorName?: string }).vendorName ?? "" } : null,
    });
  }

  private async insertOp(tx: Tx, loadId: string, revision: number, kind: OpKind, allocation: AllocationRequest, actor: Principal, document?: DocPayload) {
    const id = uuidV7();
    const payload = { allocation, actor: { id: actor.userId, name: actor.displayName }, ...(document ? { document } : {}) };
    await tx.$executeRaw`
      INSERT INTO "inventory"."master_sync_op" ("id", "load_id", "revision", "kind", "state", "request_hash", "payload", "next_attempt_at", "created_by")
      VALUES (${id}::uuid, ${loadId}::uuid, ${revision}::int, ${kind}, 'PREPARED', ${opHash(allocation)}, ${JSON.stringify(payload)}::jsonb, now() + make_interval(secs => ${LEASE_MS / 1000}), ${actor.userId})`;
    return { id, load_id: loadId, revision, kind, state: "PREPARED", payload, attempts: 0, created_by: actor.userId } as OpRow;
  }

  private async driveOrThrow(op: OpRow, requestId: string): Promise<WriteResult> {
    const outcome: DriveOutcome<WriteResult> = await this.sync.drive(op, requestId);
    if (outcome.outcome === "DONE") return outcome.result;
    if (outcome.outcome === "REFUSED") throw outcome.error;
    throw syncPending(op.load_id);
  }

  /** Re-drives a stale op of this load inline (lease expired, i.e. older than 15 s); bounded to this load. */
  async redriveIfStale(loadId: string, requestId: string): Promise<void> {
    const ops = await this.deps.db.$queryRaw<{ id: string }[]>`
      SELECT "id" FROM "inventory"."master_sync_op" WHERE "load_id" = ${loadId}::uuid AND "state" IN ('PREPARED', 'CONFIRMED') AND "next_attempt_at" <= now() LIMIT 1`;
    if (ops[0]) {
      try { await this.sync.redrive(ops[0].id, requestId); } catch (error) {
        this.deps.logger.warn({ event: "inventory.sync_redrive_failed", loadId, errorName: error instanceof Error ? error.name : "unknown" });
      }
    }
  }

  private async storedRows(loadId: string): Promise<Map<string, StoredRowRef & { stockId: string | null }>> {
    const rows = await this.deps.db.load_to_stock_row.findMany({ where: { load_id: loadId }, select: { id: true, location: true, stone_code_id: true, stock_id: true } });
    return new Map(rows.map((row) => [row.id, { location: row.location, stoneCodeId: row.stone_code_id, stockId: row.stock_id }]));
  }

  private async rowsForApply(tx: Tx, loadId: string): Promise<RowWithSources[]> {
    const rows = await tx.$queryRaw<{ id: string; position: number; location: string; parcel: string; stone_code_id: string | null; stone_code: string; stone: string; shape: string; size: string; color: string; clarity: string; cutting: string; quality: string; lot: string; cer_type: string; cer_no: string; price_unit: string; pcs: number; weight_ct: string; unit_cost_base: string; cost_amount_base: string; stock_price: string; sale_price: string; item_note: string; stock_id: string | null; sources: { purchaseLineId: string; pcs: number; weightCt: string }[]; photo_ids: string[] }[]>`
      SELECT r."id", r."position", r."location", r."parcel", r."stone_code_id", r."stone_code", r."stone", r."shape", r."size", r."color", r."clarity", r."cutting", r."quality",
        r."lot", r."cer_type", r."cer_no", r."price_unit", r."pcs", r."weight_ct"::text AS "weight_ct", r."unit_cost_base"::text AS "unit_cost_base",
        r."cost_amount_base"::text AS "cost_amount_base", r."stock_price"::text AS "stock_price", r."sale_price"::text AS "sale_price", r."item_note", r."stock_id",
        COALESCE((SELECT json_agg(json_build_object('purchaseLineId', s."purchase_line_id", 'pcs', rs."pcs", 'weightCt', rs."weight_ct"::text) ORDER BY s."position")
          FROM "inventory"."load_to_stock_row_source" rs JOIN "inventory"."load_to_stock_source" s ON s."id" = rs."source_id" WHERE rs."row_id" = r."id"), '[]'::json) AS "sources",
        COALESCE((SELECT array_agg(p."file_id"::text ORDER BY p."position") FROM "inventory"."load_to_stock_row_photo" p WHERE p."row_id" = r."id"), ARRAY[]::text[]) AS "photo_ids"
      FROM "inventory"."load_to_stock_row" r WHERE r."load_id" = ${loadId}::uuid ORDER BY r."position"`;
    return rows.map((row) => ({
      id: row.id, position: row.position, loadRowId: row.id, stockId: row.stock_id ?? "", stockIdOrNull: row.stock_id, location: row.location, parcel: row.parcel,
      attrs: { stoneCodeId: row.stone_code_id, stoneCode: row.stone_code, stone: row.stone, shape: row.shape, size: row.size, color: row.color, clarity: row.clarity, cutting: row.cutting, quality: row.quality, lot: row.lot, cerType: row.cer_type, cerNo: row.cer_no },
      priceUnit: row.price_unit, pcs: row.pcs, weightCt: row.weight_ct, unitCostBase: row.unit_cost_base, costAmountBase: row.cost_amount_base,
      stockPrice: row.stock_price, salePrice: row.sale_price, itemNote: row.item_note, photoIds: row.photo_ids, sources: row.sources,
    }));
  }

  private async header(tx: Tx | Db, id: string): Promise<Header | null> {
    const rows = await tx.$queryRaw<Header[]>`
      SELECT "id", "doc_no", "status", "version", "vendor_id", "vendor_name_snapshot", "currency_code", "created_by", "applied_revision", "auto_approved", "deleted_at",
        "sync_state", "mode", "total_cost_base"::text AS "total_cost_base", "provisional"
      FROM "inventory"."load_to_stock" WHERE "id" = ${id}::uuid`;
    return rows[0] ?? null;
  }

  private stockHeader(header: Header, revision: number, actorId: string): StockHeader {
    return { loadId: header.id, currency: header.currency_code, vendorId: header.vendor_id, vendorName: header.vendor_name_snapshot, revision, actorId };
  }

  /** Assigns the new Stock IDs (in row order) to rows without one; returns the stock sources of those rows. */
  private async assignStockIds(tx: Tx, rows: RowWithSources[], stockIds: readonly string[]) {
    const fresh = rows.filter((row) => !row.stockIdOrNull);
    if (fresh.length !== stockIds.length) throw new Error(`stock id count mismatch: ${fresh.length} rows, ${stockIds.length} ids`);
    if (fresh.length > 0) {
      const values = fresh.map((row, index) => Prisma.sql`(${row.id}::uuid, ${stockIds[index]}::varchar)`);
      await tx.$executeRaw(Prisma.sql`UPDATE "inventory"."load_to_stock_row" AS r SET "stock_id" = v.stock_id FROM (VALUES ${Prisma.join(values)}) AS v(id, stock_id) WHERE r."id" = v.id`);
    }
    fresh.forEach((row, index) => { row.stockId = stockIds[index]; row.stockIdOrNull = stockIds[index]; });
    return fresh;
  }

  // ---------- saga handlers ----------

  private async applyOp(tx: Tx, op: OpRow, stockIds: readonly string[]): Promise<WriteResult> {
    const header = (await this.header(tx, op.load_id))!;
    const actor = op.payload.actor;
    const stock = this.stockHeader(header, op.revision, actor.id);
    if (op.kind === "DELETE") {
      const { stocks } = await this.lockUnused(tx, op);
      await reverseStocks(tx, stock, stocks);
      await tx.$executeRaw`
        UPDATE "inventory"."load_to_stock" SET "sync_state" = 'IDLE', "applied_revision" = ${op.revision}::int, "deleted_at" = now(), "deleted_by" = ${actor.id}, "updated_at" = now(), "updated_by" = ${actor.id}
        WHERE "id" = ${op.load_id}::uuid`;
      this.deps.logger.info({ event: "load_to_stock.released", id: op.load_id, revision: op.revision, rowCount: stocks.length });
      return { id: header.id, version: header.version, status: header.status, stockIds: [] };
    }
    if (op.kind === "UPDATE") {
      const doc = op.payload.document as DocPayload;
      const { stocks } = await this.lockUnused(tx, op);
      await replaceParts(tx, op.load_id, doc, new Map(Object.entries(doc.stockIds)));
      await tx.$executeRaw`
        UPDATE "inventory"."load_to_stock" SET "doc_date" = ${doc.docDate}::date, "ref" = ${doc.ref}, "document_note" = ${doc.documentNote}, "mode" = ${doc.mode},
          "row_count" = ${doc.totals.rowCount}::smallint, "total_pcs" = ${doc.totals.pcs}::int, "total_weight_ct" = ${doc.totals.weightCt}::numeric,
          "total_cost_base" = ${doc.totals.costAmountBase}::numeric, "sync_state" = 'IDLE', "applied_revision" = ${op.revision}::int, "updated_at" = now(), "updated_by" = ${actor.id}
        WHERE "id" = ${op.load_id}::uuid`;
      const rows = await this.rowsForApply(tx, op.load_id);
      await this.assignStockIds(tx, rows, stockIds);
      await applyStockEdit(tx, stock, rows, stocks);
      return { id: header.id, version: header.version, status: "APPROVED", stockIds: rows.map((row) => row.stockIdOrNull) };
    }
    // CREATE / APPLY_DRAFT / APPROVE: every row gets a new Stock ID and a stock.
    const rows = await this.rowsForApply(tx, op.load_id);
    const fresh = await this.assignStockIds(tx, rows, stockIds);
    await createStocks(tx, stock, fresh);
    const auto = op.kind !== "APPROVE";
    await tx.$executeRaw`
      UPDATE "inventory"."load_to_stock" SET "status" = 'APPROVED', "provisional" = false, "auto_approved" = ${auto}, "approved_at" = now(), "approved_by" = ${actor.id},
        "sync_state" = 'IDLE', "applied_revision" = ${op.revision}::int, "updated_at" = now(), "updated_by" = ${actor.id}
      WHERE "id" = ${op.load_id}::uuid`;
    if (op.kind === "APPROVE") {
      const signal = await recordNotification(tx, { type: "document.approved", documentId: header.id, docNo: header.doc_no, actorId: actor.id, recipients: [header.created_by], summary: { partyName: header.vendor_name_snapshot } });
      this.pendingSignals.set(header.id, [signal]);
    }
    this.deps.logger.info({ event: auto ? "load_to_stock.created" : "load_to_stock.approved", id: header.id, docNo: header.doc_no, version: header.version, revision: op.revision, rowCount: rows.length });
    return { id: header.id, docNo: header.doc_no, version: header.version, status: "APPROVED", stockIds: rows.map((row) => row.stockIdOrNull) };
  }

  /**
   * INV-20261117-003 F2: re-asserts "not in use" under the stock row locks inside tx1, before any stock is reversed or
   * overwritten. tx0 checked it too, but the master call runs between the two transactions.
   */
  private async lockUnused(tx: Tx, op: OpRow) {
    const locked = await lockLoadStocks(tx, op.load_id);
    if (locked.inUse.length > 0) {
      this.deps.logger.error({ event: "load_to_stock.apply_in_use", opId: op.id, loadId: op.load_id, revision: op.revision, stockIdCount: locked.inUse.length });
      throw new SyncHold(new AppError(409, "LOAD_TO_STOCK_IN_USE", { stockIds: locked.inUse.slice(0, 20) }), "in_use");
    }
    return locked;
  }

  private async refuseOp(tx: Tx, op: OpRow): Promise<void> {
    if (op.kind === "CREATE") {
      // Never visible (lists filter provisional): the provisional document and its op go (CASCADE).
      await tx.$executeRaw`DELETE FROM "inventory"."load_to_stock" WHERE "id" = ${op.load_id}::uuid AND "provisional"`;
      return;
    }
    await tx.$executeRaw`UPDATE "inventory"."load_to_stock" SET "sync_state" = 'IDLE', "updated_at" = now() WHERE "id" = ${op.load_id}::uuid`;
  }

  private async mapRefusal(op: OpRow, refusal: MasterRefusal): Promise<AppError> {
    const rows = op.kind === "UPDATE"
      ? (op.payload.document as DocPayload).rows.map((row) => ({ position: row.position, sources: row.sources }))
      : await this.deps.db.$queryRaw<{ position: number; sources: { purchaseLineId: string }[] }[]>`
          SELECT r."position", COALESCE((SELECT json_agg(json_build_object('purchaseLineId', s."purchase_line_id")) FROM "inventory"."load_to_stock_row_source" rs
            JOIN "inventory"."load_to_stock_source" s ON s."id" = rs."source_id" WHERE rs."row_id" = r."id"), '[]'::json) AS "sources"
          FROM "inventory"."load_to_stock_row" r WHERE r."load_id" = ${op.load_id}::uuid ORDER BY r."position"`;
    const pathsOf = (lineId: string) => rows.filter((row) => row.sources.some((source) => source.purchaseLineId === lineId)).map((row) => `rows.${row.position - 1}`);
    if (refusal.code === "LOAD_ALLOCATION_LINE_UNAVAILABLE") {
      const ids = Array.isArray(refusal.details?.purchaseLineIds) ? (refusal.details!.purchaseLineIds as string[]) : [];
      return new AppError(422, "LOAD_TO_STOCK_LINE_UNAVAILABLE", { purchaseLineIds: ids, rowPaths: ids.flatMap(pathsOf) });
    }
    const lines = Array.isArray(refusal.details?.lines) ? (refusal.details!.lines as { purchaseLineId: string; remainingPcs: number; remainingWeightCt: string }[]) : [];
    return new AppError(409, "LOAD_TO_STOCK_EXCEEDS_REMAINING", { lines: lines.map((line) => ({ purchaseLineId: line.purchaseLineId, rowPaths: pathsOf(line.purchaseLineId), remainingPcs: line.remainingPcs, remainingWeightCt: line.remainingWeightCt })) });
  }

  // ---------- operations ----------

  /** POST /load-to-stock (ADD): ON → DRAFT; OFF → applied through the saga (201 APPROVED with Stock IDs). */
  async create(principal: Principal, input: LoadInput, requestId: string): Promise<WriteResult> {
    const doc = await this.prepare(input, undefined, new Map(), requestId);
    const numbering = (await this.deps.master.numbering(input.docDate, true, { requestId })).numbering;
    const id = uuidV7();
    const allocation: AllocationRequest = { vendorId: doc.vendorId, lines: allocationLines(doc.rows), newStockIdCount: doc.rows.length };
    let op: OpRow | null = null;
    let docNo = "";
    await this.deps.db.$transaction(async (tx) => {
      const requireApproval = await readSettingForShare(tx, "load-to-stock");
      await checkPhotos(tx, doc.rows);
      const runningNo = await nextRunningNo(tx, numbering, true);
      docNo = formatDocNo(numbering, runningNo);
      await tx.load_to_stock.create({
        data: {
          id, numbering_id: numbering?.id ?? null, running_no: runningNo, doc_no: docNo, ...headerFields(doc),
          status: requireApproval ? "DRAFT" : "APPROVED", provisional: !requireApproval, sync_state: requireApproval ? "IDLE" : "SYNCING",
          created_by: principal.userId, updated_by: principal.userId,
        },
      });
      await insertParts(tx, id, doc);
      if (!requireApproval) op = await this.insertOp(tx, id, 1, "CREATE", allocation, principal);
    }, WRITE_TX);
    if (!op) {
      this.deps.logger.info({ event: "load_to_stock.created", requestId, actorId: principal.userId, id, docNo, version: 1, rowCount: doc.rows.length, sourceCount: doc.sources.length });
      return { id, docNo, version: 1, status: "DRAFT", stockIds: doc.rows.map(() => null) };
    }
    return this.driveOrThrow(op, requestId);
  }

  /** PUT /load-to-stock/{id} (EDIT): DRAFT / REVISION_REQUESTED, or auto-approved and not used (re-apply). */
  async update(principal: Principal, id: string, input: LoadInput, expectedVersion: number, requestId: string): Promise<WriteResult> {
    await this.redriveIfStale(id, requestId);
    const current = await this.header(this.deps.db, id);
    if (!current || current.provisional) throw new AppError(404, "LOAD_TO_STOCK_NOT_FOUND");
    const applied = current.status === "APPROVED" && current.auto_approved;
    if (applied && input.mode !== current.mode) throw validationError([{ path: "mode", code: "mode_shape" }]);
    const stored = await this.storedRows(id);
    const doc = await this.prepare(input, applied ? id : undefined, stored, requestId);
    const stockIds: Record<string, string | null> = Object.fromEntries(doc.rows.map((row) => [row.id, stored.get(row.id)?.stockId ?? null]));
    let op: OpRow | null = null;
    let version = expectedVersion + 1;
    let status = current.status;
    await this.deps.db.$transaction(async (tx) => {
      const requireApproval = await readSettingForShare(tx, "load-to-stock");
      await checkPhotos(tx, doc.rows);
      const allowed = ["DRAFT", "REVISION_REQUESTED", "APPROVED"];
      const locked = await tx.$executeRaw`
        UPDATE "inventory"."load_to_stock" SET "version" = "version" + 1, "updated_at" = now(), "updated_by" = ${principal.userId}
        WHERE "id" = ${id}::uuid AND "version" = ${expectedVersion}::int AND "deleted_at" IS NULL AND "sync_state" = 'IDLE' AND NOT "provisional"
          AND ("status" IN ('DRAFT', 'REVISION_REQUESTED') OR ("status" = 'APPROVED' AND "auto_approved"))`;
      if (locked === 0) await explainMiss(tx, id, allowed.slice(0, 2));
      const header = (await this.header(tx, id))!;
      if (header.status === "APPROVED") {
        const { inUse } = await lockLoadStocks(tx, id);
        if (inUse.length > 0) throw new AppError(409, "LOAD_TO_STOCK_IN_USE", { stockIds: inUse.slice(0, 20) });
        const newRows = doc.rows.filter((row) => !stockIds[row.id]).length;
        await tx.$executeRaw`UPDATE "inventory"."load_to_stock" SET "sync_state" = 'SYNCING' WHERE "id" = ${id}::uuid`;
        op = await this.insertOp(tx, id, header.applied_revision + 1, "UPDATE", { vendorId: header.vendor_id, lines: allocationLines(doc.rows), newStockIdCount: newRows }, principal, { ...doc, stockIds });
        return;
      }
      await replaceParts(tx, id, doc, new Map());
      await tx.load_to_stock.update({ where: { id }, data: { ...headerFields(doc) } });
      if (header.status === "DRAFT" && !requireApproval) {
        // ADR-0050 saveStatus: a DRAFT saved while approval is OFF is applied now.
        await tx.$executeRaw`UPDATE "inventory"."load_to_stock" SET "sync_state" = 'SYNCING' WHERE "id" = ${id}::uuid`;
        op = await this.insertOp(tx, id, header.applied_revision + 1, "APPLY_DRAFT", { vendorId: doc.vendorId, lines: allocationLines(doc.rows), newStockIdCount: doc.rows.length }, principal);
      }
      status = header.status;
      version = header.version;
    }, WRITE_TX);
    if (!op) {
      this.deps.logger.info({ event: "load_to_stock.updated", requestId, actorId: principal.userId, id, version, rowCount: doc.rows.length });
      return { id, version, status, stockIds: doc.rows.map(() => null) };
    }
    const result = await this.driveOrThrow(op, requestId);
    return { ...result, version: expectedVersion + 1 };
  }

  /** POST /{id}/submit (ADD or EDIT): DRAFT / REVISION → PENDING while approval is ON; re-checks remaining (no lock). */
  async submit(principal: Principal, id: string, expectedVersion: number, requestId: string): Promise<WriteResult> {
    const rows = await this.rowsForApply(this.deps.db as unknown as Tx, id);
    const lines = allocationLines(rows);
    if (lines.length > 0) {
      const batch = await this.deps.master.batch(lines.map((line) => line.purchaseLineId), undefined, { requestId });
      const byId = new Map(batch.items.map((line) => [line.purchaseLineId, line]));
      const bad = lines.filter((line) => { const found = byId.get(line.purchaseLineId); return !found || found.status === "UNAVAILABLE"; }).map((line) => line.purchaseLineId);
      if (bad.length > 0) throw new AppError(422, "LOAD_TO_STOCK_LINE_UNAVAILABLE", { purchaseLineIds: bad, rowPaths: [] });
      const short = lines.filter((line) => { const found = byId.get(line.purchaseLineId)!; return line.pcs > found.remainingPcs || new Decimal(line.weightCt).greaterThan(found.remainingWeightCt); });
      if (short.length > 0) {
        throw new AppError(409, "LOAD_TO_STOCK_EXCEEDS_REMAINING", { lines: short.map((line) => ({ purchaseLineId: line.purchaseLineId, rowPaths: rows.filter((row) => row.sources.some((source) => source.purchaseLineId === line.purchaseLineId)).map((row) => `rows.${row.position - 1}`), remainingPcs: byId.get(line.purchaseLineId)!.remainingPcs, remainingWeightCt: byId.get(line.purchaseLineId)!.remainingWeightCt })) });
      }
    }
    const approvers = await this.deps.approvers("load-to-stock").catch(() => [] as string[]);
    let signal: NotificationSignal | null = null;
    const submittedAt = new Date();
    await this.deps.db.$transaction(async (tx) => {
      const requireApproval = await readSettingForShare(tx, "load-to-stock");
      if (!requireApproval) throw new AppError(409, "LOAD_TO_STOCK_STATUS_INVALID", { status: "APPROVAL_OFF" });
      const updated = await tx.$executeRaw`
        UPDATE "inventory"."load_to_stock" SET "status" = 'PENDING_APPROVAL', "version" = "version" + 1, "submitted_at" = ${submittedAt}, "submitted_by" = ${principal.userId},
          "submitted_by_name" = ${principal.displayName}, "updated_at" = now(), "updated_by" = ${principal.userId}
        WHERE "id" = ${id}::uuid AND "version" = ${expectedVersion}::int AND "status" IN ('DRAFT', 'REVISION_REQUESTED') AND "deleted_at" IS NULL AND "sync_state" = 'IDLE' AND NOT "provisional"`;
      if (updated === 0) await explainMiss(tx, id, ["DRAFT", "REVISION_REQUESTED"]);
      const header = (await this.header(tx, id))!;
      signal = await recordNotification(tx, { type: "approval.pending", documentId: id, docNo: header.doc_no, actorId: principal.userId, recipients: approvers, summary: { partyName: header.vendor_name_snapshot } });
    }, WRITE_TX);
    this.deps.hub.emit([signal]);
    this.deps.logger.info({ event: "load_to_stock.submitted", requestId, actorId: principal.userId, id, version: expectedVersion + 1 });
    return { id, version: expectedVersion + 1, status: "PENDING_APPROVAL", submittedAt: submittedAt.toISOString() };
  }

  /** POST /{id}/approve (APPROVE + VIEW): applies through the saga; a concurrent approve gets CHANGED / BUSY. */
  async approve(principal: Principal, id: string, expectedVersion: number, requestId: string): Promise<WriteResult> {
    let op: OpRow | null = null;
    await this.deps.db.$transaction(async (tx) => {
      const locked = await tx.$executeRaw`
        UPDATE "inventory"."load_to_stock" SET "sync_state" = 'SYNCING', "version" = "version" + 1, "updated_at" = now(), "updated_by" = ${principal.userId}
        WHERE "id" = ${id}::uuid AND "version" = ${expectedVersion}::int AND "status" = 'PENDING_APPROVAL' AND "deleted_at" IS NULL AND "sync_state" = 'IDLE'`;
      if (locked === 0) await explainMiss(tx, id, ["PENDING_APPROVAL"]);
      const header = (await this.header(tx, id))!;
      const rows = await this.rowsForApply(tx, id);
      op = await this.insertOp(tx, id, header.applied_revision + 1, "APPROVE", { vendorId: header.vendor_id, lines: allocationLines(rows), newStockIdCount: rows.length }, principal);
    }, WRITE_TX);
    const result = await this.driveOrThrow(op!, requestId);
    return { id, version: expectedVersion + 1, status: "APPROVED", stockIds: result.stockIds };
  }

  /** Revise (once) / Reject: one guarded update + a notification to the creator, in one transaction. */
  async review(principal: Principal, id: string, expectedVersion: number, action: "REVISE" | "REJECT", note: string, requestId: string): Promise<WriteResult> {
    const status = action === "REVISE" ? "REVISION_REQUESTED" : "REJECTED";
    let signal: NotificationSignal | null = null;
    await this.deps.db.$transaction(async (tx) => {
      const updated = action === "REVISE"
        ? await tx.$executeRaw`
            UPDATE "inventory"."load_to_stock" SET "status" = 'REVISION_REQUESTED', "revision_count" = "revision_count" + 1, "review_action" = 'REVISE', "review_note" = ${note},
              "reviewed_at" = now(), "reviewed_by" = ${principal.userId}, "reviewed_by_name" = ${principal.displayName}, "version" = "version" + 1, "updated_at" = now(), "updated_by" = ${principal.userId}
            WHERE "id" = ${id}::uuid AND "version" = ${expectedVersion}::int AND "status" = 'PENDING_APPROVAL' AND "revision_count" = 0 AND "deleted_at" IS NULL AND "sync_state" = 'IDLE'`
        : await tx.$executeRaw`
            UPDATE "inventory"."load_to_stock" SET "status" = 'REJECTED', "review_action" = 'REJECT', "review_note" = ${note},
              "reviewed_at" = now(), "reviewed_by" = ${principal.userId}, "reviewed_by_name" = ${principal.displayName}, "version" = "version" + 1, "updated_at" = now(), "updated_by" = ${principal.userId}
            WHERE "id" = ${id}::uuid AND "version" = ${expectedVersion}::int AND "status" = 'PENDING_APPROVAL' AND "deleted_at" IS NULL AND "sync_state" = 'IDLE'`;
      if (updated === 0) {
        const [row] = await tx.$queryRaw<{ status: string; revision_count: number; version: number; deleted_at: Date | null; sync_state: string }[]>`
          SELECT "status", "revision_count", "version", "deleted_at", "sync_state" FROM "inventory"."load_to_stock" WHERE "id" = ${id}::uuid`;
        if (action === "REVISE" && row && !row.deleted_at && row.status === "PENDING_APPROVAL" && row.version === expectedVersion && row.revision_count >= 1) throw new AppError(409, "LOAD_TO_STOCK_REVISE_LIMIT");
        await explainMiss(tx, id, ["PENDING_APPROVAL"]);
      }
      const header = (await this.header(tx, id))!;
      signal = await recordNotification(tx, { type: action === "REVISE" ? "document.revision_requested" : "document.rejected", documentId: id, docNo: header.doc_no, actorId: principal.userId, recipients: [header.created_by], summary: { partyName: header.vendor_name_snapshot, reason: note } });
    }, WRITE_TX);
    this.deps.hub.emit([signal]);
    this.deps.logger.info({ event: action === "REVISE" ? "load_to_stock.revision_requested" : "load_to_stock.rejected", requestId, actorId: principal.userId, id, version: expectedVersion + 1, noteLength: note.length });
    return { id, version: expectedVersion + 1, status };
  }

  /** POST /{id}/delete (DELETE): DRAFT / REVISION soft delete; auto-approved and not used → release + reverse (saga). */
  async remove(principal: Principal, id: string, expectedVersion: number, requestId: string): Promise<WriteResult> {
    await this.redriveIfStale(id, requestId);
    let op: OpRow | null = null;
    await this.deps.db.$transaction(async (tx) => {
      const locked = await tx.$executeRaw`
        UPDATE "inventory"."load_to_stock" SET "version" = "version" + 1, "updated_at" = now(), "updated_by" = ${principal.userId}
        WHERE "id" = ${id}::uuid AND "version" = ${expectedVersion}::int AND "deleted_at" IS NULL AND "sync_state" = 'IDLE' AND NOT "provisional"
          AND ("status" IN ('DRAFT', 'REVISION_REQUESTED') OR ("status" = 'APPROVED' AND "auto_approved"))`;
      if (locked === 0) await explainMiss(tx, id, ["DRAFT", "REVISION_REQUESTED"]);
      const header = (await this.header(tx, id))!;
      if (header.status !== "APPROVED") {
        await tx.$executeRaw`UPDATE "inventory"."load_to_stock" SET "deleted_at" = now(), "deleted_by" = ${principal.userId} WHERE "id" = ${id}::uuid`;
        return;
      }
      const { inUse } = await lockLoadStocks(tx, id);
      if (inUse.length > 0) throw new AppError(409, "LOAD_TO_STOCK_IN_USE", { stockIds: inUse.slice(0, 20) });
      await tx.$executeRaw`UPDATE "inventory"."load_to_stock" SET "sync_state" = 'SYNCING' WHERE "id" = ${id}::uuid`;
      op = await this.insertOp(tx, id, header.applied_revision + 1, "DELETE", { vendorId: header.vendor_id, lines: [], newStockIdCount: 0 }, principal);
    }, WRITE_TX);
    if (op) await this.driveOrThrow(op, requestId);
    this.deps.logger.info({ event: "load_to_stock.deleted", requestId, actorId: principal.userId, id, version: expectedVersion + 1 });
    return { id, version: expectedVersion + 1, status: "DELETED" };
  }
}
