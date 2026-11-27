import { uuidV7 } from "@gms/storage";
import { AppError } from "../../platform/errors";
import { Decimal, WRITE_TX, type Db, type Tx } from "../../platform/db";
import type { Logger } from "../../platform/logger";
import type { MasterApi } from "../../platform/master-api";
import type { Principal } from "../../platform/auth/principal";
import { readSettingForShare } from "../../platform/approval/settings";
import type { NotificationHub } from "../../platform/notification/hub";
import { recordNotification, type NotificationSignal } from "../../platform/notification/store";
import { applyTransfer, checkTransferLines, readSources, reverseTransfer, TRANSFER_DOCUMENT_TYPE, type SourceRow, type TransferLine } from "../stock/transfer";
import { APPROVED_AUTO, explainMiss, formatDocNo, headerFields, insertLines, nextRunningNo, replaceLines, type NormalizedLine, type NormalizedTransfer } from "./repository";
import type { TransferInput } from "./schemas";

/**
 * Stock Transfer Location writes (ADR-0060 D6–D10, ADR-0050 flow). Inventory owns both the document and the stock, so the
 * stock moves in the SAME transaction as the document; the only master calls (numbering, location resolve, Stock ID issue)
 * run BEFORE that transaction, never inside it.
 * - Approval OFF: Save applies at once (APPROVED, auto) with Stock IDs issued for revision `applied_revision + 1`; an
 *   auto-approved document can be edited (reverse + re-apply in one transaction) or deleted (reverse) while its new stock
 *   is untouched (D9).
 * - Approval ON: Save → DRAFT; Submit (read-only re-check) → PENDING_APPROVAL; Approve applies; Revise once; Reject is final.
 * - A Stock ID issue replays for the same revision, so a retry after a failed transaction gets the same ids (D6).
 */
export type ServiceDeps = { db: Db; master: MasterApi; logger: Logger; hub: NotificationHub; approvers(leaf: string): Promise<string[]> };
export type WriteResult = { id: string; docNo?: string; version: number; status: string; submittedAt?: string };

type Header = {
  id: string; doc_no: string; status: string; version: number; auto_approved: boolean; applied_revision: number; deleted_at: Date | null; created_by: string; ref: string;
};

const LEAF = "stock-transfer-location";
const sameLocation = (a: string, b: string) => a.trim().toUpperCase() === b.trim().toUpperCase();

/**
 * Details of a line refusal (api-contract "Errors", frontend alignment 2026-11-27): `lineIds` and `lines[].lineId` name the saved
 * line id, or the line's `fromStockUuid` when it is not saved yet; `rowPath` is `lines.N` in the order the lines were sent.
 */
function refusal(status: number, code: string, lineIds: string[], lines: readonly NormalizedLine[]) {
  const byId = new Map(lines.map((line) => [line.id, line]));
  const refs = lineIds.map((id) => byId.get(id)).filter((line): line is NormalizedLine => Boolean(line));
  return new AppError(status, code, { lineIds: refs.map((line) => line.clientId), lines: refs.map((line) => ({ lineId: line.clientId, rowPath: `lines.${line.position - 1}` })) });
}

function exceeds(lines: readonly NormalizedLine[], entries: readonly { lineId: string; onHandPcs: number; onHandWeightCt: string }[]) {
  const byId = new Map(lines.map((line) => [line.id, line]));
  return new AppError(409, "STOCK_TRANSFER_EXCEEDS_ON_HAND", {
    lines: entries.map((entry) => { const line = byId.get(entry.lineId); return { lineId: line?.clientId ?? entry.lineId, rowPath: line ? `lines.${line.position - 1}` : undefined, onHandPcs: entry.onHandPcs, onHandWeightCt: entry.onHandWeightCt }; }),
  });
}

export class StockTransferService {
  constructor(private readonly deps: ServiceDeps) {}

  private async header(client: Db | Tx, id: string): Promise<Header | null> {
    const rows = await client.$queryRaw<Header[]>`
      SELECT "id", "doc_no", "status", "version", "auto_approved", "applied_revision", "deleted_at", "created_by", "ref" FROM "inventory"."stock_transfer" WHERE "id" = ${id}::uuid`;
    return rows[0] ?? null;
  }

  private async peekApproval(): Promise<boolean> {
    const rows = await this.deps.db.$queryRaw<{ require_approval: boolean }[]>`SELECT "require_approval" FROM "inventory"."approval_setting" WHERE "type" = ${LEAF}`;
    return rows[0]?.require_approval ?? true;
  }

  /** Active Location Master spelling of each name (one master call); an unknown / inactive name is absent. */
  private async resolveLocations(names: readonly string[], requestId: string): Promise<Map<string, string>> {
    const unique = [...new Set(names.map((name) => name.trim()))];
    if (unique.length === 0) return new Map();
    const resolved = await this.deps.master.resolve([], unique, { requestId });
    return new Map(resolved.locations.map((entry) => [entry.input.trim().toUpperCase(), entry.name]));
  }

  /**
   * Normalizes a Save: line ids (kept only when they belong to this document), source location snapshot, canonical New
   * Location; refuses unknown / inactive / unchanged locations (422 LOCATION_INVALID) and, when `checkOnHand`, lines the
   * live stock can't cover (read-only; the apply re-checks under lock).
   */
  private async prepare(input: TransferInput, existingIds: ReadonlySet<string>, checkOnHand: boolean, requestId: string): Promise<{ doc: NormalizedTransfer; sources: Map<string, SourceRow> }> {
    const [locations, sources] = await Promise.all([
      this.resolveLocations(input.lines.map((line) => line.toLocation), requestId),
      readSources(this.deps.db, input.lines.map((line) => line.fromStockUuid)),
    ]);
    const lines: NormalizedLine[] = input.lines.map((line, index) => {
      const source = sources.get(line.fromStockUuid);
      const saved = Boolean(line.id && existingIds.has(line.id));
      return {
        id: saved ? line.id! : uuidV7(), clientId: saved ? line.id! : line.fromStockUuid, position: index + 1, fromStockUuid: line.fromStockUuid,
        fromLocation: source?.location ?? "", onHandPcs: line.onHandPcs, onHandWeightCt: new Decimal(line.onHandWeightCt).toFixed(3),
        toLocation: locations.get(line.toLocation.trim().toUpperCase()) ?? line.toLocation.trim(), pcs: line.pcs, weightCt: new Decimal(line.weightCt).toFixed(3),
        remark: line.remark ?? "",
      };
    });
    const unavailable = lines.filter((line) => { const source = sources.get(line.fromStockUuid); return !source || source.status !== "ACTIVE"; }).map((line) => line.id);
    if (unavailable.length > 0) throw refusal(422, "STOCK_TRANSFER_LINE_UNAVAILABLE", unavailable, lines);
    const badLocation = lines.filter((line, index) => !locations.has(input.lines[index].toLocation.trim().toUpperCase()) || sameLocation(line.toLocation, line.fromLocation)).map((line) => line.id);
    if (badLocation.length > 0) throw refusal(422, "LOCATION_INVALID", badLocation, lines);
    if (checkOnHand) this.throwCheck(lines, sources);
    const doc: NormalizedTransfer = {
      docDate: input.docDate, ref: input.ref ?? "", note: input.note ?? "", lines,
      totals: { lineCount: lines.length, pcs: lines.reduce((sum, line) => sum + line.pcs, 0), weightCt: lines.reduce((sum, line) => sum.plus(line.weightCt), new Decimal(0)).toFixed(3) },
    };
    return { doc, sources };
  }

  private throwCheck(lines: readonly NormalizedLine[], sources: ReadonlyMap<string, SourceRow>) {
    const check = checkTransferLines(lines.map(toTransferLine), sources);
    if (check.ok) return;
    if (check.code === "STOCK_TRANSFER_EXCEEDS_ON_HAND") throw exceeds(lines, check.details.lines);
    throw refusal(check.status, check.code, check.details.lineIds, lines);
  }

  /** Applies inside the caller's transaction, mapping a refusal to request paths. */
  private async apply(tx: Tx, transferId: string, revision: number, actorId: string, lines: readonly NormalizedLine[], stockIds: readonly string[]) {
    try {
      await applyTransfer(tx, { transferId, revision, actorId }, lines.map(toTransferLine), stockIds);
    } catch (error) {
      if (error instanceof AppError && error.code === "STOCK_TRANSFER_EXCEEDS_ON_HAND") {
        throw exceeds(lines, (error.details as { lines: { lineId: string; onHandPcs: number; onHandWeightCt: string }[] }).lines);
      }
      if (error instanceof AppError && (error.code === "STOCK_TRANSFER_LINE_UNAVAILABLE" || error.code === "LOCATION_INVALID")) {
        throw refusal(error.status, error.code, (error.details as { lineIds: string[] }).lineIds, lines);
      }
      throw error;
    }
  }

  private issue(id: string, revision: number, count: number, principal: Principal, requestId: string) {
    return this.deps.master.issueStockIds(TRANSFER_DOCUMENT_TYPE, id, revision, count, { requestId, actorId: principal.userId });
  }

  private async storedLines(client: Db | Tx, id: string): Promise<NormalizedLine[]> {
    const rows = await client.$queryRaw<{ id: string; position: number; from_stock_uuid: string; from_location: string; on_hand_pcs: number; on_hand_weight_ct: string; to_location: string; pcs: number; weight_ct: string; remark: string }[]>`
      SELECT "id", "position", "from_stock_uuid", "from_location", "on_hand_pcs", "on_hand_weight_ct"::text AS "on_hand_weight_ct", "to_location", "pcs", "weight_ct"::text AS "weight_ct", "remark"
      FROM "inventory"."stock_transfer_line" WHERE "transfer_id" = ${id}::uuid ORDER BY "position"`;
    return rows.map((row) => ({
      id: row.id, clientId: row.id, position: row.position, fromStockUuid: row.from_stock_uuid, fromLocation: row.from_location, onHandPcs: row.on_hand_pcs,
      onHandWeightCt: row.on_hand_weight_ct, toLocation: row.to_location, pcs: row.pcs, weightCt: row.weight_ct, remark: row.remark,
    }));
  }

  // ---------- operations ----------

  /** POST /stock-transfer-location (ADD): approval OFF → applied (APPROVED, auto); ON → DRAFT. */
  async create(principal: Principal, input: TransferInput, requestId: string): Promise<WriteResult> {
    const id = uuidV7();
    const [{ doc }, numbering, requireApprovalPeek] = await Promise.all([
      this.prepare(input, new Set(), true, requestId),
      this.deps.master.numbering(input.docDate, true, { requestId }, "stock-transfer-location").then((result) => result.numbering),
      this.peekApproval(),
    ]);
    const issued = requireApprovalPeek ? null : await this.issue(id, 1, doc.lines.length, principal, requestId);
    let docNo = "";
    let status = "DRAFT";
    await this.deps.db.$transaction(async (tx) => {
      const requireApproval = await readSettingForShare(tx, LEAF);
      const runningNo = await nextRunningNo(tx, numbering, true);
      docNo = formatDocNo(numbering, runningNo);
      // A switch turned OFF between the peek and this transaction leaves a DRAFT (Save again applies it).
      const applyNow = !requireApproval && issued !== null;
      await tx.stock_transfer.create({
        data: {
          id, numbering_id: numbering?.id ?? null, running_no: runningNo, doc_no: docNo, ...headerFields(doc),
          status: applyNow ? "APPROVED" : "DRAFT", auto_approved: applyNow, applied_revision: applyNow ? 1 : 0,
          approved_at: applyNow ? new Date() : null, approved_by: applyNow ? principal.userId : null, applied_at: applyNow ? new Date() : null,
          created_by: principal.userId, updated_by: principal.userId,
        },
      });
      await insertLines(tx, id, doc.lines);
      if (applyNow) await this.apply(tx, id, 1, principal.userId, doc.lines, issued!.stockIds);
      status = applyNow ? "APPROVED" : "DRAFT";
    }, WRITE_TX);
    this.deps.logger.info({ event: status === "APPROVED" ? "stock_transfer.applied" : "stock_transfer.created", requestId, actorId: principal.userId, id, docNo, lineCount: doc.lines.length });
    return { id, docNo, version: 1, status };
  }

  /** PUT /{id} (EDIT): DRAFT / REVISION_REQUESTED, or auto-approved (reverse + re-apply in one transaction). */
  async update(principal: Principal, id: string, input: TransferInput, expectedVersion: number, requestId: string): Promise<WriteResult> {
    const current = await this.header(this.deps.db, id);
    if (!current) throw new AppError(404, "STOCK_TRANSFER_NOT_FOUND");
    const applied = current.status === "APPROVED" && current.auto_approved && !current.deleted_at;
    const existing = new Set((await this.storedLines(this.deps.db, id)).map((line) => line.id));
    // An applied document gets its own quantities back first (inside the transaction), so the on-hand check waits for the lock.
    const { doc } = await this.prepare(input, existing, !applied, requestId);
    const willApply = applied || (current.status === "DRAFT" && !(await this.peekApproval()));
    const revision = current.applied_revision + 1;
    const issued = willApply && !current.deleted_at ? await this.issue(id, revision, doc.lines.length, principal, requestId) : null;
    let status = current.status;
    await this.deps.db.$transaction(async (tx) => {
      const requireApproval = await readSettingForShare(tx, LEAF);
      const locked = await tx.$executeRaw`
        UPDATE "inventory"."stock_transfer" SET "version" = "version" + 1, "updated_at" = now(), "updated_by" = ${principal.userId}
        WHERE "id" = ${id}::uuid AND "version" = ${expectedVersion}::int AND "deleted_at" IS NULL AND "applied_revision" = ${current.applied_revision}::int
          AND ("status" IN ('DRAFT', 'REVISION_REQUESTED') OR ("status" = 'APPROVED' AND "auto_approved"))`;
      if (locked === 0) await explainMiss(tx, id, ["DRAFT", "REVISION_REQUESTED", APPROVED_AUTO]);
      const header = (await this.header(tx, id))!;
      if (header.status === "APPROVED") {
        await reverseTransfer(tx, { transferId: id, revision, actorId: principal.userId });
        await replaceLines(tx, id, doc.lines);
        await tx.stock_transfer.update({ where: { id }, data: { ...headerFields(doc), applied_revision: revision, applied_at: new Date() } });
        await this.apply(tx, id, revision, principal.userId, doc.lines, issued!.stockIds);
        status = "APPROVED";
        return;
      }
      await replaceLines(tx, id, doc.lines);
      await tx.stock_transfer.update({ where: { id }, data: { ...headerFields(doc) } });
      if (header.status === "DRAFT" && !requireApproval && issued) {
        // ADR-0050 saveStatus: a DRAFT saved while approval is OFF is applied now.
        await tx.stock_transfer.update({ where: { id }, data: { status: "APPROVED", auto_approved: true, applied_revision: revision, approved_at: new Date(), approved_by: principal.userId, applied_at: new Date() } });
        await this.apply(tx, id, revision, principal.userId, doc.lines, issued.stockIds);
        status = "APPROVED";
      }
    }, WRITE_TX);
    this.deps.logger.info({ event: "stock_transfer.updated", requestId, actorId: principal.userId, id, version: expectedVersion + 1, status, lineCount: doc.lines.length });
    return { id, version: expectedVersion + 1, status };
  }

  /** POST /{id}/submit (ADD or EDIT): DRAFT / REVISION → PENDING while approval is ON, after a read-only re-check. */
  async submit(principal: Principal, id: string, expectedVersion: number, requestId: string): Promise<WriteResult> {
    const lines = await this.storedLines(this.deps.db, id);
    if (lines.length > 0) await this.recheck(lines, requestId);
    const approvers = await this.deps.approvers(LEAF).catch(() => [] as string[]);
    let signal: NotificationSignal | null = null;
    const submittedAt = new Date();
    await this.deps.db.$transaction(async (tx) => {
      const requireApproval = await readSettingForShare(tx, LEAF);
      if (!requireApproval) throw new AppError(409, "STOCK_TRANSFER_APPROVAL_OFF");
      const updated = await tx.$executeRaw`
        UPDATE "inventory"."stock_transfer" SET "status" = 'PENDING_APPROVAL', "version" = "version" + 1, "submitted_at" = ${submittedAt}, "submitted_by" = ${principal.userId},
          "submitted_by_name" = ${principal.displayName}, "updated_at" = now(), "updated_by" = ${principal.userId}
        WHERE "id" = ${id}::uuid AND "version" = ${expectedVersion}::int AND "status" IN ('DRAFT', 'REVISION_REQUESTED') AND "deleted_at" IS NULL`;
      if (updated === 0) await explainMiss(tx, id, ["DRAFT", "REVISION_REQUESTED"]);
      const header = (await this.header(tx, id))!;
      signal = await recordNotification(tx, { type: "approval.pending", documentType: LEAF, documentId: id, docNo: header.doc_no, actorId: principal.userId, recipients: approvers, summary: { partyName: header.ref } });
    }, WRITE_TX);
    this.deps.hub.emit([signal!]);
    this.deps.logger.info({ event: "stock_transfer.submitted", requestId, actorId: principal.userId, id, version: expectedVersion + 1 });
    return { id, version: expectedVersion + 1, status: "PENDING_APPROVAL", submittedAt: submittedAt.toISOString() };
  }

  /** Read-only D7 checks of stored lines (sources + active New Location). */
  private async recheck(lines: readonly NormalizedLine[], requestId: string) {
    const [locations, sources] = await Promise.all([
      this.resolveLocations(lines.map((line) => line.toLocation), requestId),
      readSources(this.deps.db, lines.map((line) => line.fromStockUuid)),
    ]);
    const unavailable = lines.filter((line) => { const source = sources.get(line.fromStockUuid); return !source || source.status !== "ACTIVE" || !sameLocation(source.location, line.fromLocation); }).map((line) => line.id);
    if (unavailable.length > 0) throw refusal(422, "STOCK_TRANSFER_LINE_UNAVAILABLE", unavailable, lines);
    const badLocation = lines.filter((line) => !locations.has(line.toLocation.trim().toUpperCase())).map((line) => line.id);
    if (badLocation.length > 0) throw refusal(422, "LOCATION_INVALID", badLocation, lines);
    this.throwCheck(lines, sources);
  }

  /** POST /{id}/approve (APPROVE + VIEW): applies in one transaction with the Stock IDs issued before it. */
  async approve(principal: Principal, id: string, expectedVersion: number, requestId: string): Promise<WriteResult> {
    const current = await this.header(this.deps.db, id);
    if (!current) throw new AppError(404, "STOCK_TRANSFER_NOT_FOUND");
    if (current.status !== "PENDING_APPROVAL" || current.deleted_at || current.version !== expectedVersion) await explainMiss(this.deps.db, id, ["PENDING_APPROVAL"]);
    const lines = await this.storedLines(this.deps.db, id);
    await this.recheck(lines, requestId);
    const revision = current.applied_revision + 1;
    const issued = await this.issue(id, revision, lines.length, principal, requestId);
    let signal: NotificationSignal | null = null;
    await this.deps.db.$transaction(async (tx) => {
      const locked = await tx.$executeRaw`
        UPDATE "inventory"."stock_transfer" SET "status" = 'APPROVED', "auto_approved" = false, "approved_at" = now(), "approved_by" = ${principal.userId},
          "applied_at" = now(), "applied_revision" = ${revision}::int, "version" = "version" + 1, "updated_at" = now(), "updated_by" = ${principal.userId}
        WHERE "id" = ${id}::uuid AND "version" = ${expectedVersion}::int AND "status" = 'PENDING_APPROVAL' AND "deleted_at" IS NULL AND "applied_revision" = ${current.applied_revision}::int`;
      if (locked === 0) await explainMiss(tx, id, ["PENDING_APPROVAL"]);
      // The lines can't change while PENDING (update refuses), so the ones read above are the ones applied.
      await this.apply(tx, id, revision, principal.userId, lines, issued.stockIds);
      const header = (await this.header(tx, id))!;
      signal = await recordNotification(tx, { type: "document.approved", documentType: LEAF, documentId: id, docNo: header.doc_no, actorId: principal.userId, recipients: [header.created_by], summary: { partyName: header.ref } });
    }, WRITE_TX);
    this.deps.hub.emit([signal!]);
    this.deps.logger.info({ event: "stock_transfer.approved", requestId, actorId: principal.userId, id, version: expectedVersion + 1, lineCount: lines.length });
    return { id, version: expectedVersion + 1, status: "APPROVED" };
  }

  /** Revise (once) / Reject: one guarded update + a notification to the creator. */
  async review(principal: Principal, id: string, expectedVersion: number, action: "REVISE" | "REJECT", note: string, requestId: string): Promise<WriteResult> {
    const status = action === "REVISE" ? "REVISION_REQUESTED" : "REJECTED";
    let signal: NotificationSignal | null = null;
    await this.deps.db.$transaction(async (tx) => {
      const updated = action === "REVISE"
        ? await tx.$executeRaw`
            UPDATE "inventory"."stock_transfer" SET "status" = 'REVISION_REQUESTED', "revision_count" = "revision_count" + 1, "review_action" = 'REVISE', "review_note" = ${note},
              "reviewed_at" = now(), "reviewed_by" = ${principal.userId}, "reviewed_by_name" = ${principal.displayName}, "version" = "version" + 1, "updated_at" = now(), "updated_by" = ${principal.userId}
            WHERE "id" = ${id}::uuid AND "version" = ${expectedVersion}::int AND "status" = 'PENDING_APPROVAL' AND "revision_count" = 0 AND "deleted_at" IS NULL`
        : await tx.$executeRaw`
            UPDATE "inventory"."stock_transfer" SET "status" = 'REJECTED', "review_action" = 'REJECT', "review_note" = ${note},
              "reviewed_at" = now(), "reviewed_by" = ${principal.userId}, "reviewed_by_name" = ${principal.displayName}, "version" = "version" + 1, "updated_at" = now(), "updated_by" = ${principal.userId}
            WHERE "id" = ${id}::uuid AND "version" = ${expectedVersion}::int AND "status" = 'PENDING_APPROVAL' AND "deleted_at" IS NULL`;
      if (updated === 0) {
        const [row] = await tx.$queryRaw<{ status: string; revision_count: number; version: number; deleted_at: Date | null }[]>`
          SELECT "status", "revision_count", "version", "deleted_at" FROM "inventory"."stock_transfer" WHERE "id" = ${id}::uuid`;
        if (action === "REVISE" && row && !row.deleted_at && row.status === "PENDING_APPROVAL" && row.version === expectedVersion && row.revision_count >= 1) throw new AppError(409, "STOCK_TRANSFER_REVISE_LIMIT");
        await explainMiss(tx, id, ["PENDING_APPROVAL"]);
      }
      const header = (await this.header(tx, id))!;
      signal = await recordNotification(tx, { type: action === "REVISE" ? "document.revision_requested" : "document.rejected", documentType: LEAF, documentId: id, docNo: header.doc_no, actorId: principal.userId, recipients: [header.created_by], summary: { partyName: header.ref, reason: note } });
    }, WRITE_TX);
    this.deps.hub.emit([signal!]);
    this.deps.logger.info({ event: action === "REVISE" ? "stock_transfer.revision_requested" : "stock_transfer.rejected", requestId, actorId: principal.userId, id, version: expectedVersion + 1, noteLength: note.length });
    return { id, version: expectedVersion + 1, status };
  }

  /** POST /{id}/delete (DELETE): DRAFT / REVISION / REJECTED soft delete; auto-approved → reverse first (D9), then soft delete. */
  async remove(principal: Principal, id: string, expectedVersion: number, requestId: string): Promise<WriteResult> {
    let status = "";
    await this.deps.db.$transaction(async (tx) => {
      const locked = await tx.$executeRaw`
        UPDATE "inventory"."stock_transfer" SET "version" = "version" + 1, "updated_at" = now(), "updated_by" = ${principal.userId}
        WHERE "id" = ${id}::uuid AND "version" = ${expectedVersion}::int AND "deleted_at" IS NULL
          AND ("status" IN ('DRAFT', 'REVISION_REQUESTED', 'REJECTED') OR ("status" = 'APPROVED' AND "auto_approved"))`;
      if (locked === 0) await explainMiss(tx, id, ["DRAFT", "REVISION_REQUESTED", "REJECTED", APPROVED_AUTO]);
      const header = (await this.header(tx, id))!;
      status = header.status;
      if (header.status === "APPROVED") {
        const revision = header.applied_revision + 1;
        await reverseTransfer(tx, { transferId: id, revision, actorId: principal.userId });
        await tx.$executeRaw`UPDATE "inventory"."stock_transfer" SET "applied_revision" = ${revision}::int WHERE "id" = ${id}::uuid`;
      }
      await tx.$executeRaw`UPDATE "inventory"."stock_transfer" SET "deleted_at" = now(), "deleted_by" = ${principal.userId} WHERE "id" = ${id}::uuid`;
    }, WRITE_TX);
    this.deps.logger.info({ event: "stock_transfer.deleted", requestId, actorId: principal.userId, id, version: expectedVersion + 1, status });
    return { id, version: expectedVersion + 1, status };
  }

  /** POST /{id}/restore (DELETE): a deleted document returns as DRAFT with nothing applied; its number is kept. */
  async restore(principal: Principal, id: string, expectedVersion: number, requestId: string): Promise<WriteResult> {
    await this.deps.db.$transaction(async (tx) => {
      const restored = await tx.$executeRaw`
        UPDATE "inventory"."stock_transfer" SET "status" = 'DRAFT', "auto_approved" = false, "approved_at" = NULL, "approved_by" = NULL, "applied_at" = NULL,
          "submitted_at" = NULL, "submitted_by" = NULL, "submitted_by_name" = NULL,
          "review_action" = NULL, "review_note" = NULL, "reviewed_at" = NULL, "reviewed_by" = NULL, "reviewed_by_name" = NULL,
          "deleted_at" = NULL, "deleted_by" = NULL, "version" = "version" + 1, "updated_at" = now(), "updated_by" = ${principal.userId}
        WHERE "id" = ${id}::uuid AND "version" = ${expectedVersion}::int AND "deleted_at" IS NOT NULL`;
      if (restored === 0) await explainMiss(tx, id, [], { deleted: true });
    }, WRITE_TX);
    this.deps.logger.info({ event: "stock_transfer.restored", requestId, actorId: principal.userId, id, version: expectedVersion + 1 });
    return { id, version: expectedVersion + 1, status: "DRAFT" };
  }
}

function toTransferLine(line: NormalizedLine): TransferLine {
  return { lineId: line.id, fromStockUuid: line.fromStockUuid, fromLocation: line.fromLocation, toLocation: line.toLocation, pcs: line.pcs, weightCt: line.weightCt };
}
