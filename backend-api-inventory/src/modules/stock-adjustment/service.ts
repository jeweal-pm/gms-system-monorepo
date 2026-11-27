import { uuidV7 } from "@gms/storage";
import type { NotificationHub } from "../../platform/notification/hub";
import { recordNotification } from "../../platform/notification/store";
import type { NotificationSignal } from "../../platform/notification/store";
import { AppError } from "../../platform/errors";
import { Decimal, type Db, WRITE_TX, type Tx } from "../../platform/db";
import type { MasterApi } from "../../platform/master-api";
import type { Principal } from "../../platform/auth/principal";
import { adjustStocks, reverseAdjust, type AdjustmentHeader, type AdjustmentStockLine } from "../stock/adjust";
import type { AdjustmentInput } from "./schemas";

export type StockAdjustmentServiceDeps = { db: Db; master: MasterApi; hub: NotificationHub; approvers(leaf: string): Promise<string[]> };
type Header = { id: string; doc_no: string; doc_date: string; location: string; ref: string; note: string; status: string; auto_approved: boolean; version: number; revision_count: number; deleted_at: Date | null };
type StockMeta = { id: string; stock_id: string; lot_key: string; stock_price: string; location: string; status: string; on_hand_pcs: number; on_hand_weight_ct: string };
type ApplyRow = AdjustmentStockLine;
type CurrentStock = { id: string; status: string; location: string; on_hand_pcs: number; on_hand_weight_ct: string };
type Result = { id: string; docNo: string; version: number; status: string; submittedAt?: string };

function noDoc() { throw new AppError(404, "STOCK_ADJUSTMENT_NOT_FOUND"); }
function statusError(status: string) { throw new AppError(409, "STOCK_ADJUSTMENT_STATUS", { status }); }
function versionError(currentVersion: number) { throw new AppError(409, "VERSION_CONFLICT", { currentVersion }); }
const docHeader = (id: string, docNo: string, docDate: string, location: string, actorId: string, revision = 1): AdjustmentHeader => ({ id, docNo, docDate, location, actorId, revision });

async function readStockMeta(tx: Tx, lines: AdjustmentInput["lines"], location: string): Promise<StockMeta[]> {
  const rows = await tx.$queryRaw<StockMeta[]>`
    SELECT "id", "stock_id", "lot_key", "stock_price"::text AS "stock_price", "location", "status", "on_hand_pcs", "on_hand_weight_ct"::text AS "on_hand_weight_ct"
    FROM "inventory"."stock" WHERE "id" = ANY(${lines.map((line) => line.stockUuid)}::uuid[]) ORDER BY "id"`;
  const byId = new Map(rows.map((row) => [row.id, row]));
  const invalid = lines.flatMap((line, i) => {
    const row = byId.get(line.stockUuid);
    return !row || row.status !== "ACTIVE" || (row.on_hand_pcs <= 0 && new Decimal(row.on_hand_weight_ct).lte(0)) || row.location.toLowerCase() !== location.toLowerCase() ? [{ path: `lines.${i}.stockUuid`, code: "unavailable" }] : [];
  });
  if (invalid.length) throw new AppError(422, "STOCK_ADJUSTMENT_LINE_UNAVAILABLE", { lineIds: invalid.map((e) => { const index = Number(e.path.split(".")[1]); return lines[index]?.id ?? lines[index]?.stockUuid ?? ""; }) });
  return lines.map((line) => byId.get(line.stockUuid)!);
}

function persistLines(input: AdjustmentInput, meta: StockMeta[]) {
  const byId = new Map(meta.map((row) => [row.id, row]));
  return input.lines.map((line, index) => {
    const stock = byId.get(line.stockUuid)!;
    return { id: line.id ?? uuidV7(), adjustment_id: "", position: index + 1, stock_uuid: stock.id, stock_id: stock.stock_id,
      lot_key: stock.lot_key, stock_pcs: line.stockPcs, stock_weight_ct: line.stockWeightCt, stock_price: stock.stock_price,
      physical_pcs: line.physicalPcs, physical_weight_ct: line.physicalWeightCt, physical_price: line.physicalPrice, remark: line.remark };
  });
}

async function linesForApply(tx: Tx, id: string): Promise<AdjustmentStockLine[]> {
  const lines = await tx.$queryRaw<ApplyRow[]>`
    SELECT "id" AS "lineId", "stock_uuid" AS "stockUuid", "stock_id" AS "stockId", "position", "stock_pcs" AS "stockPcs",
      "stock_weight_ct"::text AS "stockWeightCt", "stock_price"::text AS "stockPrice", "physical_pcs" AS "physicalPcs",
      "physical_weight_ct"::text AS "physicalWeightCt", "physical_price"::text AS "physicalPrice"
    FROM "inventory"."stock_adjustment_line" WHERE "adjustment_id" = ${id}::uuid ORDER BY "position"`;
  return lines;
}

async function assertSnapshots(tx: Tx, lines: readonly AdjustmentStockLine[], location: string): Promise<void> {
  const stocks = await tx.$queryRaw<CurrentStock[]>`
    SELECT "id", "status", "location", "on_hand_pcs", "on_hand_weight_ct"::text AS "on_hand_weight_ct"
    FROM "inventory"."stock" WHERE "id" = ANY(${lines.map((line) => line.stockUuid)}::uuid[]) ORDER BY "id" FOR UPDATE`;
  const byId = new Map(stocks.map((stock) => [stock.id, stock]));
  const stale = lines.filter((line) => {
    const stock = byId.get(line.stockUuid);
    return !stock || stock.status !== "ACTIVE" || stock.location.toLowerCase() !== location.toLowerCase() || stock.on_hand_pcs !== line.stockPcs || !new Decimal(stock.on_hand_weight_ct).equals(line.stockWeightCt);
  });
  if (stale.length) throw new AppError(409, "STOCK_ADJUSTMENT_STOCK_CHANGED", { lines: stale.map((line) => {
    const stock = byId.get(line.stockUuid);
    return { lineId: line.lineId, onHandPcs: stock?.on_hand_pcs ?? 0, onHandWeightCt: stock?.on_hand_weight_ct ?? "0.000" };
  }) });
}

async function activeLocation(master: MasterApi, name: string, requestId: string) {
  const ref = await master.reference({ requestId });
  const location = ref.locations.find((item) => item.toLowerCase() === name.toLowerCase());
  if (!location) throw new AppError(422, "LOCATION_INVALID");
  return location;
}

export class StockAdjustmentService {
  constructor(private readonly deps: StockAdjustmentServiceDeps) {}

  async create(principal: Principal, input: AdjustmentInput, requestId: string): Promise<Result> {
    const location = await activeLocation(this.deps.master, input.location, requestId);
    const numbering = (await this.deps.master.numbering(input.docDate, true, { requestId }, "stock-adjustment")).numbering;
    if (!numbering) throw new AppError(422, "NUMBERING_NOT_CONFIGURED");
    const id = uuidV7();
    let result!: Result;
    await this.deps.db.$transaction(async (tx) => {
      const [setting] = await tx.$queryRaw<{ require_approval: boolean }[]>`SELECT "require_approval" FROM "inventory"."approval_setting" WHERE "type" = 'stock-adjustment' FOR SHARE`;
      const requireApproval = setting?.require_approval ?? true;
      const key = `inventory.stock_adjustment.numbering:${numbering.id}`;
      await tx.$queryRaw`SELECT 1 AS locked FROM (SELECT pg_advisory_xact_lock(hashtext(${key}))) AS l`;
      const [max] = await tx.$queryRaw<{ max: number | null }[]>`SELECT max("running_no") AS "max" FROM "inventory"."stock_adjustment" WHERE "numbering_id" = ${numbering.id}::uuid`;
      const runningNo = max?.max === null || max?.max === undefined ? numbering.startNo : Math.max(max.max + 1, numbering.startNo);
      const docNo = `${numbering.prefix}${numbering.separator}${runningNo}`;
      const meta = await readStockMeta(tx, input.lines, location);
      const parts = persistLines(input, meta).map((line) => ({ ...line, adjustment_id: id }));
      await tx.stock_adjustment.create({ data: { id, numbering_id: numbering.id, running_no: runningNo, doc_no: docNo, doc_date: new Date(`${input.docDate}T00:00:00Z`), location,
        ref: input.ref, note: input.note, status: requireApproval ? "DRAFT" : "APPROVED", auto_approved: !requireApproval,
        approved_at: requireApproval ? null : new Date(), approved_by: requireApproval ? null : principal.userId, applied_at: requireApproval ? null : new Date(),
        created_by: principal.userId } });
      await tx.stock_adjustment_line.createMany({ data: parts });
      if (!requireApproval) await adjustStocks(tx, docHeader(id, docNo, input.docDate, location, principal.userId), await linesForApply(tx, id));
      result = { id, docNo, version: 1, status: requireApproval ? "DRAFT" : "APPROVED" };
    }, WRITE_TX);
    return result;
  }

  async update(principal: Principal, id: string, input: AdjustmentInput, expectedVersion: number, requestId: string): Promise<Result> {
    const location = await activeLocation(this.deps.master, input.location, requestId);
    const current = await this.requireHeader(this.deps.db, id);
    if (current.deleted_at) statusError(current.status);
    if (!(current.status === "DRAFT" || current.status === "REVISION_REQUESTED" || (current.status === "APPROVED" && current.auto_approved))) statusError(current.status);
    let result!: Result;
    await this.deps.db.$transaction(async (tx) => {
      const locked = await tx.$executeRaw`UPDATE "inventory"."stock_adjustment" SET "version" = "version" + 1, "updated_at" = now() WHERE "id" = ${id}::uuid AND "version" = ${expectedVersion}::int AND "deleted_at" IS NULL AND ("status" IN ('DRAFT','REVISION_REQUESTED') OR ("status" = 'APPROVED' AND "auto_approved"))`;
      if (!locked) { const row = await this.requireHeader(tx, id); versionError(row.version); }
      const header = await this.requireHeader(tx, id);
      const applied = header.status === "APPROVED";
      if (applied) await reverseAdjust(tx, docHeader(id, header.doc_no, header.doc_date, header.location, principal.userId, header.version));
      const [setting] = await tx.$queryRaw<{ require_approval: boolean }[]>`SELECT "require_approval" FROM "inventory"."approval_setting" WHERE "type" = 'stock-adjustment' FOR SHARE`;
      const shouldApply = applied || setting?.require_approval === false;
      const meta = await readStockMeta(tx, input.lines, location);
      await tx.$executeRaw`DELETE FROM "inventory"."stock_adjustment_line" WHERE "adjustment_id" = ${id}::uuid`;
      const parts = persistLines(input, meta).map((line) => ({ ...line, adjustment_id: id }));
      await tx.stock_adjustment_line.createMany({ data: parts });
      const status = shouldApply ? "APPROVED" : header.status;
      await tx.$executeRaw`UPDATE "inventory"."stock_adjustment" SET "doc_date" = ${input.docDate}::date, "location" = ${location}, "ref" = ${input.ref}, "note" = ${input.note},
        "status" = ${status}, "auto_approved" = ${shouldApply && (header.auto_approved || !applied)},
        "approved_at" = CASE WHEN ${shouldApply} THEN now() ELSE "approved_at" END,
        "approved_by" = CASE WHEN ${shouldApply} THEN ${principal.userId} ELSE "approved_by" END,
        "applied_at" = CASE WHEN ${shouldApply} THEN now() ELSE "applied_at" END, "updated_at" = now() WHERE "id" = ${id}::uuid`;
      if (shouldApply) await adjustStocks(tx, docHeader(id, header.doc_no, input.docDate, location, principal.userId, header.version), await linesForApply(tx, id));
      result = { id, docNo: header.doc_no, version: expectedVersion + 1, status };
    }, WRITE_TX);
    return result;
  }

  async submit(principal: Principal, id: string, expectedVersion: number): Promise<Result> {
    const at = new Date(); let docNo = ""; let signal: NotificationSignal | undefined;
    await this.deps.db.$transaction(async (tx) => {
      const h = await this.requireHeader(tx, id); docNo = h.doc_no;
      if (h.deleted_at || !["DRAFT", "REVISION_REQUESTED"].includes(h.status)) statusError(h.status);
      const [setting] = await tx.$queryRaw<{ require_approval: boolean }[]>`SELECT "require_approval" FROM "inventory"."approval_setting" WHERE "type" = 'stock-adjustment' FOR SHARE`;
      if (setting?.require_approval === false) statusError("APPROVAL_OFF");
      const lines = await linesForApply(tx, id);
      // Same lock and snapshot check as apply, without touching stock: use the one bulk lock query here.
      await assertSnapshots(tx, lines, h.location);
      const updated = await tx.$executeRaw`UPDATE "inventory"."stock_adjustment" SET "status" = 'PENDING_APPROVAL', "version" = "version" + 1, "submitted_at" = ${at}, "submitted_by" = ${principal.userId}, "submitted_by_name" = ${principal.displayName}, "updated_at" = now() WHERE "id" = ${id}::uuid AND "version" = ${expectedVersion}::int AND "status" IN ('DRAFT','REVISION_REQUESTED') AND "deleted_at" IS NULL`;
      if (!updated) versionError((await this.requireHeader(tx, id)).version);
      const recipients = await this.deps.approvers("stock-adjustment").catch(() => [] as string[]);
      signal = await recordNotification(tx, { type: "approval.pending", documentType: "stock-adjustment", documentId: id, docNo, actorId: principal.userId, recipients, summary: { partyName: h.location } });
    }, WRITE_TX);
    this.deps.hub.emit([signal]);
    return { id, docNo, version: expectedVersion + 1, status: "PENDING_APPROVAL", submittedAt: at.toISOString() };
  }

  async approve(principal: Principal, id: string, expectedVersion: number): Promise<Result> {
    let result!: Result; let signal: NotificationSignal | undefined;
    await this.deps.db.$transaction(async (tx) => {
      const h = await this.requireHeader(tx, id);
      if (h.status === "APPROVED" && h.version > expectedVersion && !h.deleted_at) {
        await assertSnapshots(tx, await linesForApply(tx, id), h.location);
      }
      if (h.status !== "PENDING_APPROVAL" || h.deleted_at) statusError(h.status);
      if (h.version !== expectedVersion) versionError(h.version);
      const lines = await linesForApply(tx, id);
      await adjustStocks(tx, docHeader(id, h.doc_no, h.doc_date, h.location, principal.userId), lines);
      const updated = await tx.$executeRaw`UPDATE "inventory"."stock_adjustment" SET "status" = 'APPROVED', "auto_approved" = false, "version" = "version" + 1, "approved_at" = now(), "approved_by" = ${principal.userId}, "applied_at" = now(), "updated_at" = now() WHERE "id" = ${id}::uuid AND "version" = ${expectedVersion}::int AND "status" = 'PENDING_APPROVAL' AND "deleted_at" IS NULL`;
      if (!updated) versionError((await this.requireHeader(tx, id)).version);
      signal = await recordNotification(tx, { type: "document.approved", documentType: "stock-adjustment", documentId: id, docNo: h.doc_no, actorId: principal.userId, recipients: [h.created_by], summary: { partyName: h.location } });
      result = { id, docNo: h.doc_no, version: expectedVersion + 1, status: "APPROVED" };
    }, WRITE_TX);
    this.deps.hub.emit([signal]);
    return result;
  }

  async review(principal: Principal, id: string, expectedVersion: number, action: "REVISE" | "REJECT", note: string): Promise<Result> {
    let result!: Result; let signal: NotificationSignal | undefined;
    await this.deps.db.$transaction(async (tx) => {
      const h = await this.requireHeader(tx, id);
      if (h.status !== "PENDING_APPROVAL" || h.deleted_at) statusError(h.status);
      if (h.version !== expectedVersion) versionError(h.version);
      if (action === "REVISE" && h.revision_count >= 1) throw new AppError(409, "STOCK_ADJUSTMENT_REVISE_LIMIT");
      const status = action === "REVISE" ? "REVISION_REQUESTED" : "REJECTED";
      const updated = await tx.$executeRaw`UPDATE "inventory"."stock_adjustment" SET "status" = ${status}, "revision_count" = "revision_count" + ${action === "REVISE" ? 1 : 0}, "review_action" = ${action}, "review_note" = ${note}, "reviewed_at" = now(), "reviewed_by" = ${principal.userId}, "reviewed_by_name" = ${principal.displayName}, "version" = "version" + 1, "updated_at" = now() WHERE "id" = ${id}::uuid AND "version" = ${expectedVersion}::int AND "status" = 'PENDING_APPROVAL'`;
      if (!updated) versionError((await this.requireHeader(tx, id)).version);
      signal = await recordNotification(tx, { type: action === "REVISE" ? "document.revision_requested" : "document.rejected", documentType: "stock-adjustment", documentId: id, docNo: h.doc_no, actorId: principal.userId, recipients: [h.created_by], summary: { partyName: h.location, reason: note } });
      result = { id, docNo: h.doc_no, version: expectedVersion + 1, status };
    }, WRITE_TX);
    this.deps.hub.emit([signal]);
    return result;
  }

  async remove(principal: Principal, id: string, expectedVersion: number): Promise<Result> {
    let result!: Result;
    await this.deps.db.$transaction(async (tx) => {
      const h = await this.requireHeader(tx, id);
      if (h.deleted_at || !(h.status === "DRAFT" || h.status === "REVISION_REQUESTED" || h.status === "REJECTED" || (h.status === "APPROVED" && h.auto_approved))) statusError(h.status);
      if (h.version !== expectedVersion) versionError(h.version);
      if (h.status === "APPROVED") await reverseAdjust(tx, docHeader(id, h.doc_no, h.doc_date, h.location, principal.userId, h.version));
      const updated = await tx.$executeRaw`UPDATE "inventory"."stock_adjustment" SET "deleted_at" = now(), "deleted_by" = ${principal.userId}, "version" = "version" + 1, "updated_at" = now() WHERE "id" = ${id}::uuid AND "version" = ${expectedVersion}::int AND "deleted_at" IS NULL`;
      if (!updated) versionError((await this.requireHeader(tx, id)).version);
      result = { id, docNo: h.doc_no, version: expectedVersion + 1, status: h.status };
    }, WRITE_TX);
    return result;
  }

  async restore(principal: Principal, id: string, expectedVersion: number): Promise<Result> {
    let result!: Result;
    await this.deps.db.$transaction(async (tx) => {
      const h = await this.requireHeader(tx, id);
      if (!h.deleted_at) statusError(h.status);
      if (h.version !== expectedVersion) versionError(h.version);
      const updated = await tx.$executeRaw`UPDATE "inventory"."stock_adjustment" SET "deleted_at" = NULL, "deleted_by" = NULL, "status" = 'DRAFT', "auto_approved" = false,
        "approved_at" = NULL, "approved_by" = NULL, "applied_at" = NULL, "submitted_at" = NULL, "submitted_by" = NULL, "submitted_by_name" = NULL,
        "review_action" = NULL, "review_note" = NULL, "reviewed_at" = NULL, "reviewed_by" = NULL, "reviewed_by_name" = NULL,
        "version" = "version" + 1, "updated_at" = now() WHERE "id" = ${id}::uuid AND "version" = ${expectedVersion}::int AND "deleted_at" IS NOT NULL`;
      if (!updated) versionError((await this.requireHeader(tx, id)).version);
      result = { id, docNo: h.doc_no, version: expectedVersion + 1, status: "DRAFT" };
    }, WRITE_TX);
    return result;
  }

  private async requireHeader(db: Db | Tx, id: string): Promise<Header & { created_by: string }> {
    const [header] = await db.$queryRaw<(Header & { created_by: string })[]>`SELECT "id", "doc_no", to_char("doc_date", 'YYYY-MM-DD') AS "doc_date", "location", "ref", "note", "status", "auto_approved", "version", "revision_count", "deleted_at", "created_by" FROM "inventory"."stock_adjustment" WHERE "id" = ${id}::uuid`;
    if (!header) noDoc();
    return header;
  }
}
