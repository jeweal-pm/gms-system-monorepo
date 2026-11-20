import { createHash } from "node:crypto";
import { uuidV7 } from "@gms/storage";
import { AppError, type FieldError } from "../../platform/errors";
import { WRITE_TX, type Db, type Tx } from "../../platform/db";
import type { Logger } from "../../platform/logger";
import type { MasterApi, SaleConsumptionRequest, SaleConsumptionResponse } from "../../platform/master-api";
import { MasterRefusal } from "../../platform/master-client";
import type { Principal } from "../../platform/auth/principal";
import { readSettingForShare } from "../../platform/approval/settings";
import type { NotificationHub } from "../../platform/notification/hub";
import { recordNotification, type NotificationSignal } from "../../platform/notification/store";
import { SyncDriver, LEASE_MS, type BaseOp, type DriveOutcome, type MasterPort, type OpKind } from "../../platform/sync/saga";
import { consumptionLines, normalizeSale, prepareRequest, type NormalizedSale } from "./prepare";
import { readHeader, readLines, isEditable, type HeaderRow } from "./read";
import { APPROVED_AUTO, checkPhotos, explainMiss, formatDocNo, headerFields, insertParts, nextRunningNo, replaceParts } from "./repository";
import type { SaleInput } from "./schemas";

/**
 * Sale writes (sale SA rev 1 architecture.md "Write paths", ADR-0050 flow, ADR-0054 D6/D7):
 * - approval ON: Save → DRAFT (nothing applied); Send to approve → PENDING_APPROVAL after a prepare re-check; Approve
 *   applies through the saga; Revise (once) / Reject are guarded local updates with a notification to the creator.
 * - approval OFF: Save applies at once (provisional until master confirms; a refusal deletes it); the auto-approved
 *   Sale stays editable / deletable until used (master refuses a release below `purchased` → SALE_IN_USE).
 * - Restore (SQ-SL-03) returns a deleted Sale as DRAFT with nothing applied (its number is kept).
 * Every master read happens BEFORE the local transaction (Save ≤ 2 calls: prepare + numbering); the approval switch is
 * read FOR SHARE inside it; no HTTP call runs while a transaction is open.
 */
export type SaleServiceDeps = { db: Db; master: MasterApi; logger: Logger; hub: NotificationHub; approvers(leaf: string): Promise<string[]> };
export type SaleWriteResult = { id: string; docNo?: string; version: number; status: string; submittedAt?: string };
export type SaleOpPayload = { consumption: SaleConsumptionRequest; actor: { id: string; name: string | null }; document?: NormalizedSale };
export type SaleOpRow = BaseOp & { sale_id: string; payload: SaleOpPayload };

const EXCEEDS = "SALE_CONSUMPTION_EXCEEDS_AVAILABLE";
const UNAVAILABLE = "SALE_CONSUMPTION_LINE_UNAVAILABLE";
const IN_USE = "SALE_CONSUMPTION_IN_USE";

/** Business refusals of master's sale consumption (error-handling.md "Master internal codes mapped by inventory"). */
export function isSaleRefusal(error: unknown): error is MasterRefusal {
  return error instanceof MasterRefusal && ((error.status === 409 && (error.code === EXCEEDS || error.code === IN_USE)) || (error.status === 422 && error.code === UNAVAILABLE));
}

/** ADR-0054 D6 port: `PUT/GET /sale-consumptions/{saleId}`. */
export function salePort(master: MasterApi): MasterPort<SaleOpRow, SaleConsumptionResponse> {
  return {
    put: (op, options) => master.putSaleConsumption(op.sale_id, op.revision, op.payload.consumption, options),
    recover: async (op, options) => {
      const current = await master.getSaleConsumption(op.sale_id, options);
      return current.revision === op.revision ? { revision: current.revision, replayed: true, lines: current.lines } : null;
    },
    isRefusal: isSaleRefusal,
    staleCode: "SALE_CONSUMPTION_STALE",
    resultOf: (response) => ({ revision: response.revision, replayed: response.replayed }),
  };
}

const opHash = (consumption: SaleConsumptionRequest) => createHash("sha256").update(JSON.stringify(consumption)).digest("hex");
const syncPending = (id: string) => new AppError(503, "SYNC_PENDING", { id, retryAfterSeconds: 5 }, { "Retry-After": "5" });
const summaryOf = (header: Pick<HeaderRow, "customer_name_snapshot" | "grand_total" | "currency_code">, reason?: string) =>
  ({ partyName: header.customer_name_snapshot, amount: header.grand_total, currency: header.currency_code, ...(reason ? { reason } : {}) });

/** Refusal details → row field errors (`lines.N.*`, N = stored position − 1). */
export function refusalError(refusal: MasterRefusal, indexOf: ReadonlyMap<string, number>): AppError {
  const details = refusal.details ?? {};
  if (refusal.code === UNAVAILABLE) {
    const ids = Array.isArray(details.lineIds) ? (details.lineIds as string[]) : [];
    const fieldErrors: FieldError[] = ids.flatMap((lineId) => (indexOf.has(lineId) ? [{ path: `lines.${indexOf.get(lineId)}.reference`, code: "unavailable" }] : []));
    return new AppError(422, "SALE_REFERENCE_INVALID", { fieldErrors: fieldErrors.slice(0, 50) });
  }
  if (refusal.code === IN_USE) {
    const stockIds = Array.isArray(details.stockIds) ? (details.stockIds as string[]).slice(0, 20) : [];
    return new AppError(409, "SALE_IN_USE", { stockIds });
  }
  const lines = Array.isArray(details.lines) ? (details.lines as { lineId: string; field: string; code: string; availablePcs: number; availableWeightCt: string }[]) : [];
  const fieldErrors: FieldError[] = lines.flatMap((line) => (indexOf.has(line.lineId) && (line.field === "pcs" || line.field === "weightCt")
    ? [{ path: `lines.${indexOf.get(line.lineId)}.${line.field}`, code: line.code === "exceeds_pending" ? "exceeds_pending" : "exceeds_open", params: { availablePcs: Number(line.availablePcs), availableWeightCt: String(line.availableWeightCt) } }]
    : []));
  return new AppError(409, "SALE_SOURCE_SHORT", { fieldErrors: fieldErrors.slice(0, 50) });
}

/** Stored rows → the Sale input shape (Submit re-validates a saved document with the Save rules). */
function storedInput(header: HeaderRow, lines: Awaited<ReturnType<typeof readLines>>, charges: { charge_type: string; amount: string }[]): SaleInput {
  return {
    docDate: header.doc_date, dueDate: header.due_date, customerId: header.customer_id,
    shippingAddressId: header.shipping_address_id ?? "", invoiceAddressId: header.invoice_address_id ?? "",
    currency: header.currency_code, exchangeRate: header.exchange_rate, ref: header.ref, documentNote: header.document_note,
    discount: { type: header.discount_type as "NONE", value: header.discount_value },
    tax: { enabled: header.tax_enabled, rate: header.tax_rate, includeInPrice: header.tax_included },
    labor: header.labor_work === null ? null : { work: header.labor_work, basis: header.labor_basis as "PCS", qty: header.labor_qty ?? "0", rate: header.labor_rate ?? "0" },
    serviceCharges: charges.map((charge) => ({ type: charge.charge_type as "SHIPPING", amount: charge.amount })),
    lines: lines.map((line) => ({
      id: line.id, source: line.source, ...(line.reserve_line_id ? { reserveLineId: line.reserve_line_id } : {}), memoStockId: line.memo_stock_id,
      pcs: line.pcs, weightCt: line.weight_ct, unitPrice: line.unit_price, discount: { type: line.discount_type as "NONE", value: line.discount_value },
      itemNote: line.item_note, photoIds: line.photo_ids,
    })),
  };
}

export class SaleService {
  readonly sync: SyncDriver<SaleWriteResult, SaleOpRow, SaleConsumptionResponse>;
  private pendingSignals = new Map<string, NotificationSignal[]>();

  constructor(private readonly deps: SaleServiceDeps) {
    this.sync = new SyncDriver<SaleWriteResult, SaleOpRow, SaleConsumptionResponse>(deps.db, deps.master, deps.logger, {
      apply: (tx, op) => this.applyOp(tx, op),
      refuse: (tx, op) => this.refuseOp(tx, op),
      mapRefusal: (op, refusal) => this.mapRefusal(op, refusal),
      afterCommit: (result) => this.flushSignals(result),
    }, { store: "sale", port: salePort(deps.master) });
  }

  private flushSignals(result: SaleWriteResult) {
    const signals = this.pendingSignals.get(result.id);
    this.pendingSignals.delete(result.id);
    if (signals) this.deps.hub.emit(signals);
  }

  /**
   * tx0: records the op. Its revision is above the applied one AND above every earlier op of this Sale: a refused op
   * (master rolled back, its revision never applied) keeps its row, so the next attempt takes the next number instead
   * of colliding with `sale_sync_op_sale_revision_key` (master accepts any revision above its applied one).
   */
  private async insertOp(tx: Tx, saleId: string, appliedRevision: number, kind: OpKind, consumption: SaleConsumptionRequest, actor: Principal, document?: NormalizedSale): Promise<SaleOpRow> {
    const id = uuidV7();
    const payload: SaleOpPayload = { consumption, actor: { id: actor.userId, name: actor.displayName }, ...(document ? { document } : {}) };
    const [row] = await tx.$queryRaw<{ revision: number }[]>`
      INSERT INTO "inventory"."sale_sync_op" ("id", "sale_id", "revision", "kind", "state", "request_hash", "payload", "next_attempt_at", "created_by")
      SELECT ${id}::uuid, ${saleId}::uuid, GREATEST(${appliedRevision}::int, COALESCE(max(o."revision"), 0)) + 1, ${kind}, 'PREPARED', ${opHash(consumption)}, ${JSON.stringify(payload)}::jsonb,
        now() + make_interval(secs => ${LEASE_MS / 1000}), ${actor.userId}
      FROM "inventory"."sale_sync_op" o WHERE o."sale_id" = ${saleId}::uuid
      RETURNING "revision"`;
    return { id, sale_id: saleId, revision: row.revision, kind, state: "PREPARED", payload, attempts: 0, created_by: actor.userId };
  }

  private async driveOrThrow(op: SaleOpRow, requestId: string): Promise<SaleWriteResult> {
    const outcome: DriveOutcome<SaleWriteResult> = await this.sync.drive(op, requestId);
    if (outcome.outcome === "DONE") return outcome.result;
    if (outcome.outcome === "REFUSED") throw outcome.error;
    throw syncPending(op.sale_id);
  }

  /** Re-drives a stale op of this Sale inline (lease expired, i.e. older than 15 s); bounded to this Sale. */
  async redriveIfStale(saleId: string, requestId: string): Promise<void> {
    const ops = await this.deps.db.$queryRaw<{ id: string }[]>`
      SELECT "id" FROM "inventory"."sale_sync_op" WHERE "sale_id" = ${saleId}::uuid AND "state" IN ('PREPARED', 'CONFIRMED') AND "next_attempt_at" <= now() LIMIT 1`;
    if (ops[0]) {
      try { await this.sync.redrive(ops[0].id, requestId); } catch (error) {
        this.deps.logger.warn({ event: "inventory.sync_redrive_failed", saleId, errorName: error instanceof Error ? error.name : "unknown" });
      }
    }
  }

  // ---------- saga handlers ----------

  private async applyOp(tx: Tx, op: SaleOpRow): Promise<SaleWriteResult> {
    const header = (await readHeader(tx, op.sale_id))!;
    const actor = op.payload.actor;
    if (op.kind === "DELETE") {
      await tx.$executeRaw`
        UPDATE "inventory"."sale" SET "sync_state" = 'IDLE', "applied_revision" = ${op.revision}::int, "deleted_at" = now(), "deleted_by" = ${actor.id}, "updated_at" = now(), "updated_by" = ${actor.id}
        WHERE "id" = ${op.sale_id}::uuid`;
      this.deps.logger.info({ event: "sale.released", id: op.sale_id, revision: op.revision });
      return { id: header.id, version: header.version, status: header.status };
    }
    if (op.kind === "UPDATE") {
      const doc = op.payload.document!;
      await replaceParts(tx, op.sale_id, doc);
      await tx.sale.update({ where: { id: op.sale_id }, data: { ...headerFields(doc), sync_state: "IDLE", applied_revision: op.revision, updated_at: new Date(), updated_by: actor.id } });
      this.deps.logger.info({ event: "sale.reapplied", id: op.sale_id, revision: op.revision, lineCount: doc.lines.length });
      return { id: header.id, version: header.version, status: "APPROVED" };
    }
    // CREATE / APPLY_DRAFT (auto-approved) / APPROVE.
    const auto = op.kind !== "APPROVE";
    await tx.$executeRaw`
      UPDATE "inventory"."sale" SET "status" = 'APPROVED', "provisional" = false, "auto_approved" = ${auto}, "approved_at" = now(), "approved_by" = ${actor.id},
        "sync_state" = 'IDLE', "applied_revision" = ${op.revision}::int, "updated_at" = now(), "updated_by" = ${actor.id}
      WHERE "id" = ${op.sale_id}::uuid`;
    if (op.kind === "APPROVE") {
      const signal = await recordNotification(tx, { type: "document.approved", documentType: "sale", documentId: header.id, docNo: header.doc_no, actorId: actor.id, recipients: [header.created_by], summary: summaryOf(header) });
      this.pendingSignals.set(header.id, [signal]);
    }
    this.deps.logger.info({ event: auto ? "sale.created" : "sale.approved", id: header.id, docNo: header.doc_no, version: header.version, revision: op.revision, lineCount: header.line_count });
    return { id: header.id, docNo: header.doc_no, version: header.version, status: "APPROVED" };
  }

  private async refuseOp(tx: Tx, op: SaleOpRow): Promise<void> {
    if (op.kind === "CREATE") {
      // Never visible (lists filter provisional): the provisional Sale, its lines and ops go (CASCADE). Photo files stay.
      await tx.$executeRaw`DELETE FROM "inventory"."sale" WHERE "id" = ${op.sale_id}::uuid AND "provisional"`;
      return;
    }
    await tx.$executeRaw`UPDATE "inventory"."sale" SET "sync_state" = 'IDLE', "updated_at" = now() WHERE "id" = ${op.sale_id}::uuid`;
  }

  private async mapRefusal(op: SaleOpRow, refusal: MasterRefusal): Promise<AppError> {
    const lines = op.kind === "UPDATE"
      ? op.payload.document!.lines.map((line) => ({ id: line.id, position: line.position }))
      : await this.deps.db.$queryRaw<{ id: string; position: number }[]>`SELECT "id", "position" FROM "inventory"."sale_line" WHERE "sale_id" = ${op.sale_id}::uuid`;
    return refusalError(refusal, new Map(lines.map((line) => [line.id, line.position - 1])));
  }

  // ---------- operations ----------

  /** POST /sale (ADD): ON → DRAFT; OFF → applied through the saga (provisional until master confirms). */
  async create(principal: Principal, input: SaleInput, requestId: string): Promise<SaleWriteResult> {
    const prepared = await this.deps.master.salePrepare(prepareRequest(input), { requestId });
    const lineIds = input.lines.map(() => uuidV7());
    const doc = normalizeSale(input, prepared, { lineId: (index) => lineIds[index] });
    const numbering = (await this.deps.master.numbering(input.docDate, true, { requestId }, "sale")).numbering;
    const id = uuidV7();
    let op: SaleOpRow | null = null;
    let docNo = "";
    await this.deps.db.$transaction(async (tx) => {
      const requireApproval = await readSettingForShare(tx, "sale");
      await checkPhotos(tx, null, principal.userId, doc.lines);
      const runningNo = await nextRunningNo(tx, numbering, true);
      docNo = formatDocNo(numbering, runningNo);
      await tx.sale.create({
        data: {
          id, numbering_id: numbering?.id ?? null, running_no: runningNo, doc_no: docNo, ...headerFields(doc),
          status: requireApproval ? "DRAFT" : "APPROVED", provisional: !requireApproval, sync_state: requireApproval ? "IDLE" : "SYNCING",
          created_by: principal.userId, updated_by: principal.userId,
        },
      });
      await insertParts(tx, id, doc);
      if (!requireApproval) op = await this.insertOp(tx, id, 0, "CREATE", { saleDocNo: docNo, customerId: doc.customerId, currency: doc.currency, lines: consumptionLines(doc.lines) }, principal);
    }, WRITE_TX);
    if (!op) {
      this.deps.logger.info({ event: "sale.created", requestId, actorId: principal.userId, id, docNo, version: 1, lineCount: doc.lines.length });
      return { id, docNo, version: 1, status: "DRAFT" };
    }
    const result = await this.driveOrThrow(op, requestId);
    return { id, docNo, version: 1, status: result.status };
  }

  /** PUT /sale/{id} (EDIT): DRAFT / REVISION_REQUESTED, or auto-approved and not used (re-apply with the delta). */
  async update(principal: Principal, id: string, input: SaleInput, expectedVersion: number, requestId: string): Promise<SaleWriteResult> {
    await this.redriveIfStale(id, requestId);
    const current = await readHeader(this.deps.db, id);
    if (!current || current.provisional) throw new AppError(404, "SALE_NOT_FOUND");
    if (!isEditable(current)) await explainMiss(this.deps.db, id, ["DRAFT", "REVISION_REQUESTED", APPROVED_AUTO]);
    const stored = new Set((await this.deps.db.sale_line.findMany({ where: { sale_id: id }, select: { id: true } })).map((line) => line.id));
    const prepared = await this.deps.master.salePrepare(prepareRequest(input, { saleId: id, keepCustomerId: current.customer_id }), { requestId });
    const fresh = input.lines.map((line) => (line.id && stored.has(line.id) ? line.id : uuidV7()));
    const doc = normalizeSale(input, prepared, { lineId: (index) => fresh[index], storedCurrency: current.currency_code });
    let op: SaleOpRow | null = null;
    let status = current.status;
    await this.deps.db.$transaction(async (tx) => {
      const requireApproval = await readSettingForShare(tx, "sale");
      await checkPhotos(tx, id, principal.userId, doc.lines);
      const locked = await tx.$executeRaw`
        UPDATE "inventory"."sale" SET "version" = "version" + 1, "updated_at" = now(), "updated_by" = ${principal.userId}
        WHERE "id" = ${id}::uuid AND "version" = ${expectedVersion}::int AND "deleted_at" IS NULL AND "sync_state" = 'IDLE' AND NOT "provisional"
          AND ("status" IN ('DRAFT', 'REVISION_REQUESTED') OR ("status" = 'APPROVED' AND "auto_approved"))`;
      if (locked === 0) await explainMiss(tx, id, ["DRAFT", "REVISION_REQUESTED", APPROVED_AUTO]);
      const header = (await readHeader(tx, id))!;
      const consumption = { saleDocNo: header.doc_no, customerId: doc.customerId, currency: doc.currency, lines: consumptionLines(doc.lines) };
      if (header.status === "APPROVED") {
        await tx.$executeRaw`UPDATE "inventory"."sale" SET "sync_state" = 'SYNCING' WHERE "id" = ${id}::uuid`;
        op = await this.insertOp(tx, id, header.applied_revision, "UPDATE", consumption, principal, doc);
        return;
      }
      await replaceParts(tx, id, doc);
      await tx.sale.update({ where: { id }, data: { ...headerFields(doc) } });
      if (header.status === "DRAFT" && !requireApproval) {
        // ADR-0050 saveStatus: a DRAFT saved while approval is OFF is applied now (e.g. after Restore, SQ-SL-03).
        await tx.$executeRaw`UPDATE "inventory"."sale" SET "sync_state" = 'SYNCING' WHERE "id" = ${id}::uuid`;
        op = await this.insertOp(tx, id, header.applied_revision, "APPLY_DRAFT", consumption, principal);
      }
      status = header.status;
    }, WRITE_TX);
    if (!op) {
      this.deps.logger.info({ event: "sale.updated", requestId, actorId: principal.userId, id, version: expectedVersion + 1, lineCount: doc.lines.length });
      return { id, version: expectedVersion + 1, status };
    }
    const result = await this.driveOrThrow(op, requestId);
    return { id, version: expectedVersion + 1, status: result.status };
  }

  /** POST /{id}/submit (ADD or EDIT): DRAFT / REVISION → PENDING while approval is ON; re-checks the Save rules (no lock). */
  async submit(principal: Principal, id: string, expectedVersion: number, requestId: string): Promise<SaleWriteResult> {
    const current = await readHeader(this.deps.db, id);
    if (!current || current.provisional) throw new AppError(404, "SALE_NOT_FOUND");
    if (current.deleted_at || current.sync_state === "SYNCING" || !["DRAFT", "REVISION_REQUESTED"].includes(current.status)) await explainMiss(this.deps.db, id, ["DRAFT", "REVISION_REQUESTED"]);
    const [lines, charges] = await Promise.all([
      readLines(this.deps.db, id),
      this.deps.db.$queryRaw<{ charge_type: string; amount: string }[]>`SELECT "charge_type", "amount"::text AS "amount" FROM "inventory"."sale_charge" WHERE "sale_id" = ${id}::uuid`,
    ]);
    const input = storedInput(current, lines, charges);
    const prepared = await this.deps.master.salePrepare(prepareRequest(input, { saleId: id, keepCustomerId: current.customer_id }), { requestId });
    normalizeSale(input, prepared, { lineId: (index) => lines[index].id, storedCurrency: current.currency_code });
    const approvers = await this.deps.approvers("sale").catch(() => [] as string[]);
    let signal: NotificationSignal | null = null;
    const submittedAt = new Date();
    await this.deps.db.$transaction(async (tx) => {
      const requireApproval = await readSettingForShare(tx, "sale");
      if (!requireApproval) throw new AppError(409, "SALE_STATUS_INVALID", { status: "APPROVAL_OFF" });
      const updated = await tx.$executeRaw`
        UPDATE "inventory"."sale" SET "status" = 'PENDING_APPROVAL', "version" = "version" + 1, "submitted_at" = ${submittedAt}, "submitted_by" = ${principal.userId},
          "submitted_by_name" = ${principal.displayName}, "updated_at" = now(), "updated_by" = ${principal.userId}
        WHERE "id" = ${id}::uuid AND "version" = ${expectedVersion}::int AND "status" IN ('DRAFT', 'REVISION_REQUESTED') AND "deleted_at" IS NULL AND "sync_state" = 'IDLE' AND NOT "provisional"`;
      if (updated === 0) await explainMiss(tx, id, ["DRAFT", "REVISION_REQUESTED"]);
      signal = await recordNotification(tx, { type: "approval.pending", documentType: "sale", documentId: id, docNo: current.doc_no, actorId: principal.userId, recipients: approvers, summary: summaryOf(current) });
    }, WRITE_TX);
    this.deps.hub.emit([signal!]);
    this.deps.logger.info({ event: "sale.submitted", requestId, actorId: principal.userId, id, version: expectedVersion + 1 });
    return { id, version: expectedVersion + 1, status: "PENDING_APPROVAL", submittedAt: submittedAt.toISOString() };
  }

  /** POST /{id}/approve (APPROVE + VIEW): applies through the saga; a short source → SALE_SOURCE_SHORT, back to PENDING. */
  async approve(principal: Principal, id: string, expectedVersion: number, requestId: string): Promise<SaleWriteResult> {
    let op: SaleOpRow | null = null;
    await this.deps.db.$transaction(async (tx) => {
      const locked = await tx.$executeRaw`
        UPDATE "inventory"."sale" SET "sync_state" = 'SYNCING', "version" = "version" + 1, "updated_at" = now(), "updated_by" = ${principal.userId}
        WHERE "id" = ${id}::uuid AND "version" = ${expectedVersion}::int AND "status" = 'PENDING_APPROVAL' AND "deleted_at" IS NULL AND "sync_state" = 'IDLE'`;
      if (locked === 0) await explainMiss(tx, id, ["PENDING_APPROVAL"]);
      const header = (await readHeader(tx, id))!;
      const lines = await readLines(tx, id);
      const consumption = { saleDocNo: header.doc_no, customerId: header.customer_id, currency: header.currency_code, lines: consumptionLines(lines.map((line) => ({ id: line.id, source: line.source, reserveLineId: line.reserve_line_id, memoStockId: line.memo_stock_id, pcs: line.pcs, weightCt: line.weight_ct }))) };
      op = await this.insertOp(tx, id, header.applied_revision, "APPROVE", consumption, principal);
    }, WRITE_TX);
    await this.driveOrThrow(op!, requestId);
    return { id, version: expectedVersion + 1, status: "APPROVED" };
  }

  /** Revise (once) / Reject: one guarded update + a notification to the creator, in one transaction. */
  async review(principal: Principal, id: string, expectedVersion: number, action: "REVISE" | "REJECT", note: string, requestId: string): Promise<SaleWriteResult> {
    const status = action === "REVISE" ? "REVISION_REQUESTED" : "REJECTED";
    let signal: NotificationSignal | null = null;
    await this.deps.db.$transaction(async (tx) => {
      const updated = action === "REVISE"
        ? await tx.$executeRaw`
            UPDATE "inventory"."sale" SET "status" = 'REVISION_REQUESTED', "revision_count" = "revision_count" + 1, "review_action" = 'REVISE', "review_note" = ${note},
              "reviewed_at" = now(), "reviewed_by" = ${principal.userId}, "reviewed_by_name" = ${principal.displayName}, "version" = "version" + 1, "updated_at" = now(), "updated_by" = ${principal.userId}
            WHERE "id" = ${id}::uuid AND "version" = ${expectedVersion}::int AND "status" = 'PENDING_APPROVAL' AND "revision_count" = 0 AND "deleted_at" IS NULL AND "sync_state" = 'IDLE'`
        : await tx.$executeRaw`
            UPDATE "inventory"."sale" SET "status" = 'REJECTED', "review_action" = 'REJECT', "review_note" = ${note},
              "reviewed_at" = now(), "reviewed_by" = ${principal.userId}, "reviewed_by_name" = ${principal.displayName}, "version" = "version" + 1, "updated_at" = now(), "updated_by" = ${principal.userId}
            WHERE "id" = ${id}::uuid AND "version" = ${expectedVersion}::int AND "status" = 'PENDING_APPROVAL' AND "deleted_at" IS NULL AND "sync_state" = 'IDLE'`;
      if (updated === 0) {
        const [row] = await tx.$queryRaw<{ status: string; revision_count: number; version: number; deleted_at: Date | null; sync_state: string }[]>`
          SELECT "status", "revision_count", "version", "deleted_at", "sync_state" FROM "inventory"."sale" WHERE "id" = ${id}::uuid`;
        if (action === "REVISE" && row && !row.deleted_at && row.sync_state === "IDLE" && row.status === "PENDING_APPROVAL" && row.version === expectedVersion && row.revision_count >= 1) throw new AppError(409, "SALE_REVISE_LIMIT");
        await explainMiss(tx, id, ["PENDING_APPROVAL"]);
      }
      const header = (await readHeader(tx, id))!;
      signal = await recordNotification(tx, { type: action === "REVISE" ? "document.revision_requested" : "document.rejected", documentType: "sale", documentId: id, docNo: header.doc_no, actorId: principal.userId, recipients: [header.created_by], summary: summaryOf(header, note) });
    }, WRITE_TX);
    this.deps.hub.emit([signal!]);
    this.deps.logger.info({ event: action === "REVISE" ? "sale.revision_requested" : "sale.rejected", requestId, actorId: principal.userId, id, version: expectedVersion + 1, noteLength: note.length });
    return { id, version: expectedVersion + 1, status };
  }

  /** POST /{id}/delete (DELETE): DRAFT / REVISION / REJECTED soft delete; auto-approved → release first (saga). */
  async remove(principal: Principal, id: string, expectedVersion: number, requestId: string): Promise<SaleWriteResult> {
    await this.redriveIfStale(id, requestId);
    let op: SaleOpRow | null = null;
    let status = "";
    await this.deps.db.$transaction(async (tx) => {
      const locked = await tx.$executeRaw`
        UPDATE "inventory"."sale" SET "version" = "version" + 1, "updated_at" = now(), "updated_by" = ${principal.userId}
        WHERE "id" = ${id}::uuid AND "version" = ${expectedVersion}::int AND "deleted_at" IS NULL AND "sync_state" = 'IDLE' AND NOT "provisional"
          AND ("status" IN ('DRAFT', 'REVISION_REQUESTED', 'REJECTED') OR ("status" = 'APPROVED' AND "auto_approved"))`;
      if (locked === 0) await explainMiss(tx, id, ["DRAFT", "REVISION_REQUESTED", "REJECTED", APPROVED_AUTO]);
      const header = (await readHeader(tx, id))!;
      status = header.status;
      if (header.status !== "APPROVED") {
        await tx.$executeRaw`UPDATE "inventory"."sale" SET "deleted_at" = now(), "deleted_by" = ${principal.userId} WHERE "id" = ${id}::uuid`;
        return;
      }
      await tx.$executeRaw`UPDATE "inventory"."sale" SET "sync_state" = 'SYNCING' WHERE "id" = ${id}::uuid`;
      op = await this.insertOp(tx, id, header.applied_revision, "DELETE", { saleDocNo: header.doc_no, customerId: header.customer_id, currency: header.currency_code, lines: [] }, principal);
    }, WRITE_TX);
    if (op) await this.driveOrThrow(op, requestId);
    this.deps.logger.info({ event: "sale.deleted", requestId, actorId: principal.userId, id, version: expectedVersion + 1 });
    return { id, version: expectedVersion + 1, status };
  }

  /** POST /{id}/restore (DELETE, SQ-SL-03): a deleted Sale returns as DRAFT with nothing applied; its number is kept. */
  async restore(principal: Principal, id: string, expectedVersion: number, requestId: string): Promise<SaleWriteResult> {
    await this.deps.db.$transaction(async (tx) => {
      const restored = await tx.$executeRaw`
        UPDATE "inventory"."sale" SET "status" = 'DRAFT', "auto_approved" = false, "approved_at" = NULL, "approved_by" = NULL,
          "submitted_at" = NULL, "submitted_by" = NULL, "submitted_by_name" = NULL,
          "review_action" = NULL, "review_note" = NULL, "reviewed_at" = NULL, "reviewed_by" = NULL, "reviewed_by_name" = NULL,
          "deleted_at" = NULL, "deleted_by" = NULL, "version" = "version" + 1, "updated_at" = now(), "updated_by" = ${principal.userId}
        WHERE "id" = ${id}::uuid AND "version" = ${expectedVersion}::int AND "deleted_at" IS NOT NULL AND "sync_state" = 'IDLE' AND NOT "provisional"`;
      if (restored === 0) await explainMiss(tx, id, [], { deleted: true });
    }, WRITE_TX);
    this.deps.logger.info({ event: "sale.restored", requestId, actorId: principal.userId, id, version: expectedVersion + 1 });
    return { id, version: expectedVersion + 1, status: "DRAFT" };
  }
}
