import { uuidV7 } from "@gms/storage";
import { AppError, validationError, type FieldError } from "../../platform/errors";
import { Decimal, WRITE_TX, type Db, type Tx } from "../../platform/db";
import type { Logger } from "../../platform/logger";
import type { MasterApi, PriceUnit } from "../../platform/master-api";
import type { Principal } from "../../platform/auth/principal";
import { readSettingForShare } from "../../platform/approval/settings";
import type { NotificationHub } from "../../platform/notification/hub";
import { recordNotification, type NotificationSignal } from "../../platform/notification/store";
import { applyConversion, checkStockFacts, MERGE_SPLIT_DOCUMENT_TYPE, planCosts, readStockFacts, reverseConversion, type ConversionMode, type StockFact } from "../stock/convert";
import { MS_PHOTO_SOURCE } from "./photos";
import {
  APPROVED_ANY, APPROVED_AUTO, explainMiss, formatDocNo, headerFields, insertLines, LEAF, nextRunningNo, numberingOrDefault, replaceLines, toConversionResult, toConversionSource,
  type NormalizedDoc, type NormalizedResult, type NormalizedSource,
} from "./repository";
import type { MergeSplitInput } from "./schemas";

/**
 * Merge/Split writes (merge-split ADR D4/D7/D8/D11/D13, SA-MS-04…13; ADR-0050 flow). Inventory owns the document and the stock, so
 * the conversion happens in the SAME transaction as the document; the master calls (master-data resolve, numbering, Stock ID issue)
 * run BEFORE that transaction, never inside it.
 * - Approval OFF: Save applies at once (APPROVED, auto) with Stock IDs issued for `apply_seq + 1`; an auto-approved document can be
 *   edited (reverse + re-apply with new Stock IDs) while its results are untouched. Any APPROVED document can be deleted (reverse).
 * - Approval ON: Save → DRAFT (no Stock IDs, no effect); Submit (read-only checks incl. the Pending exclusion) → PENDING; Approve
 *   applies; Revise once; Reject is final.
 * - A Stock ID issue replays for the same apply sequence, so a retry after a failed transaction gets the same ids.
 */
export type ServiceDeps = { db: Db; master: MasterApi; logger: Logger; hub: NotificationHub; approvers(leaf: string): Promise<string[]> };
export type WriteResult = { id: string; docNo?: string; version: number; status: string; submittedAt?: string; stockIds?: (string | null)[] };

type Header = { id: string; doc_no: string; mode: ConversionMode; status: string; version: number; auto_approved: boolean; apply_seq: number; deleted_at: Date | null; created_by: string; ref: string };

const upper = (value: string) => value.trim().toUpperCase();
const invalid = (fieldErrors: FieldError[]) => validationError(fieldErrors);

export class MergeSplitService {
  constructor(private readonly deps: ServiceDeps) {}

  private async header(client: Db | Tx, id: string): Promise<Header | null> {
    const rows = await client.$queryRaw<Header[]>`
      SELECT "id", "doc_no", "mode", "status", "version", "auto_approved", "apply_seq", "deleted_at", "created_by", "ref" FROM "inventory"."merge_split" WHERE "id" = ${id}::uuid`;
    return rows[0] ?? null;
  }

  private async peekApproval(): Promise<boolean> {
    const rows = await this.deps.db.$queryRaw<{ require_approval: boolean }[]>`SELECT "require_approval" FROM "inventory"."approval_setting" WHERE "type" = ${LEAF}`;
    return rows[0]?.require_approval ?? true;
  }

  /** Photo ids a result may use: this module's ready uploads, a picked source stock's photos, or ones already on this document. One statement. */
  private async allowedPhotos(ids: readonly string[], stockUuids: readonly string[], docId: string | null): Promise<Set<string>> {
    if (ids.length === 0) return new Set();
    const rows = await this.deps.db.$queryRaw<{ id: string }[]>`
      SELECT f."id" FROM "inventory"."stored_file" f
      WHERE f."id" = ANY(${[...ids]}::uuid[]) AND f."status" = 'ready'
        AND (f."source_type" = ${MS_PHOTO_SOURCE}
          OR EXISTS (SELECT 1 FROM "inventory"."stock_photo" p WHERE p."file_id" = f."id" AND p."stock_uuid" = ANY(${[...stockUuids]}::uuid[]))
          OR EXISTS (SELECT 1 FROM "inventory"."merge_split_result_photo" rp JOIN "inventory"."merge_split_result" r ON r."id" = rp."result_id"
            WHERE rp."file_id" = f."id" AND r."merge_split_id" IS NOT DISTINCT FROM ${docId}::uuid))`;
    return new Set(rows.map((row) => row.id));
  }

  /**
   * Normalizes a Save (SA-MS-03/05/06): validates stone codes / locations through master (one call), photos and the picked stocks
   * (one statement each), computes cost server-side. `checkOnHand` refuses a stale snapshot (409 STOCK_CHANGED) read-only; the
   * apply re-checks everything under lock.
   */
  private async prepare(input: MergeSplitInput, docId: string | null, existingResultIds: ReadonlySet<string>, checkOnHand: boolean, requestId: string): Promise<NormalizedDoc> {
    const stockUuids = input.sources.map((source) => source.stockUuid);
    const codeIds = [...new Set(input.results.map((result) => result.attrs.stoneCodeId).filter((value): value is string => value !== null))];
    const [resolved, facts, photos] = await Promise.all([
      this.deps.master.resolve(codeIds, [...new Set(input.results.map((result) => result.location.trim()))], { requestId }),
      readStockFacts(this.deps.db, stockUuids, docId, false),
      this.allowedPhotos([...new Set(input.results.flatMap((result) => result.photoIds))], stockUuids, docId),
    ]);
    const sourceIds = new Map(input.sources.map((source) => [source.key, uuidV7()]));
    const conversionSources = input.sources.map((source) => ({ sourceId: sourceIds.get(source.key)!, key: source.key, stockUuid: source.stockUuid, availPcs: source.availPcs, availWeightCt: source.availWeightCt }));
    // Save-time rules: unknown / REVERSED, mixed currency, and (optionally) a stale snapshot. Busy / Pending wait for submit / apply.
    const saveFacts = new Map<string, StockFact>([...facts].map(([key, fact]) => [key, { ...fact, load_syncing: false, pending_doc_no: null }]));
    const refusal = checkStockFacts(input.mode, conversionSources, checkOnHand ? saveFacts : new Map([...saveFacts].map(([key, fact]) => {
      const source = input.sources.find((entry) => entry.stockUuid === key)!;
      return [key, { ...fact, on_hand_pcs: source.availPcs, on_hand_weight_ct: source.availWeightCt }];
    })));
    if (refusal) throw refusal;

    const codes = new Map(resolved.stoneCodes.filter((code) => code.active).map((code) => [code.id, code.code]));
    const locations = new Map(resolved.locations.map((entry) => [upper(entry.input), entry.name]));
    const codeErrors: FieldError[] = [];
    const locationErrors: FieldError[] = [];
    const photoErrors: FieldError[] = [];
    input.results.forEach((result, index) => {
      if (result.attrs.stoneCodeId && !codes.has(result.attrs.stoneCodeId)) codeErrors.push({ path: `results.${index}.attrs.stoneCodeId`, code: "inactive" });
      if (!locations.has(upper(result.location))) locationErrors.push({ path: `results.${index}.location`, code: "inactive" });
      if (result.photoIds.some((fileId) => !photos.has(fileId))) photoErrors.push({ path: `results.${index}.photoIds`, code: "invalid" });
    });
    if (photoErrors.length > 0) throw invalid(photoErrors);
    if (codeErrors.length > 0) throw new AppError(422, "MASTER_DATA_INVALID", { fieldErrors: codeErrors.slice(0, 50) });
    if (locationErrors.length > 0) throw new AppError(422, "LOCATION_INVALID", { fieldErrors: locationErrors.slice(0, 50) });

    const sources: NormalizedSource[] = input.sources.map((source, index) => {
      const fact = facts.get(source.stockUuid)!;
      return {
        id: sourceIds.get(source.key)!, key: source.key, position: index + 1, stockUuid: source.stockUuid, stockId: fact.stock_id, availPcs: source.availPcs,
        availWeightCt: new Decimal(source.availWeightCt).toFixed(3), priceUnit: fact.price_unit, unitCostBase: new Decimal(fact.unit_cost_base).toFixed(4), takeCostBase: "0.00",
      };
    });
    const results: NormalizedResult[] = input.results.map((result, index) => ({
      id: result.id && existingResultIds.has(result.id) ? result.id : uuidV7(), position: index + 1,
      sourceId: input.mode === "SPLIT" && result.sourceKey ? sourceIds.get(result.sourceKey)! : null,
      attrs: { ...result.attrs, stoneCode: result.attrs.stoneCodeId ? codes.get(result.attrs.stoneCodeId)! : result.attrs.stoneCode },
      location: locations.get(upper(result.location))!, lot: result.lot, parcel: result.parcel, priceUnit: "PER_CT" as PriceUnit, pcs: result.pcs,
      weightCt: new Decimal(result.weightCt).toFixed(3), unitCostBase: "0", costAmountBase: "0", stockPrice: new Decimal(result.stockPrice).toFixed(2),
      salePrice: new Decimal(result.salePrice).toFixed(2), itemNote: result.itemNote, photoIds: result.photoIds,
    }));
    const plan = planCosts(input.mode, sources.map((source) => ({ sourceId: source.id, priceUnit: source.priceUnit, unitCostBase: source.unitCostBase, availPcs: source.availPcs, availWeightCt: source.availWeightCt })), results.map((result) => ({ resultId: result.id, position: result.position, sourceId: result.sourceId, pcs: result.pcs, weightCt: result.weightCt })));
    for (const source of sources) source.takeCostBase = plan.takes.get(source.id)!.toFixed(2);
    for (const result of results) {
      const cost = plan.results.get(result.id)!;
      Object.assign(result, { priceUnit: cost.priceUnit, unitCostBase: cost.unitCostBase, costAmountBase: cost.cost.toFixed(2) });
    }
    return {
      docDate: input.docDate, mode: input.mode, ref: input.ref ?? "", note: input.note ?? "", sources, results,
      totals: { pcs: sources.reduce((sum, source) => sum + source.availPcs, 0), weightCt: sources.reduce((sum, source) => sum.plus(source.availWeightCt), new Decimal(0)).toFixed(3) },
    };
  }

  /** Stored lines of a document (apply on approve / submit re-check): 2 statements. */
  private async stored(client: Db | Tx, id: string): Promise<{ sources: NormalizedSource[]; results: NormalizedResult[] }> {
    const sources = await client.$queryRaw<{ id: string; client_key: string; position: number; stock_uuid: string; stock_id: string; avail_pcs: number; avail_weight_ct: string; price_unit: PriceUnit; unit_cost_base: string; take_cost_base: string }[]>`
      SELECT "id", "client_key", "position", "stock_uuid", "stock_id", "avail_pcs", "avail_weight_ct"::text AS "avail_weight_ct", "price_unit", "unit_cost_base"::text AS "unit_cost_base", "take_cost_base"::text AS "take_cost_base"
      FROM "inventory"."merge_split_source" WHERE "merge_split_id" = ${id}::uuid ORDER BY "position"`;
    const results = await client.$queryRaw<{ id: string; position: number; source_id: string | null; stone_code_id: string | null; stone_code: string; stone: string; shape: string; size: string; color: string; clarity: string; cutting: string; quality: string; cer_type: string; cer_no: string; location: string; lot: string; parcel: string; price_unit: PriceUnit; pcs: number; weight_ct: string; unit_cost_base: string; cost_amount_base: string; stock_price: string; sale_price: string; item_note: string; photo_ids: string[] }[]>`
      SELECT r."id", r."position", r."source_id", r."stone_code_id", r."stone_code", r."stone", r."shape", r."size", r."color", r."clarity", r."cutting", r."quality", r."cer_type", r."cer_no",
        r."location", r."lot", r."parcel", r."price_unit", r."pcs", r."weight_ct"::text AS "weight_ct", r."unit_cost_base"::text AS "unit_cost_base", r."cost_amount_base"::text AS "cost_amount_base",
        r."stock_price"::text AS "stock_price", r."sale_price"::text AS "sale_price", r."item_note",
        COALESCE((SELECT array_agg(p."file_id"::text ORDER BY p."position") FROM "inventory"."merge_split_result_photo" p WHERE p."result_id" = r."id"), '{}') AS "photo_ids"
      FROM "inventory"."merge_split_result" r WHERE r."merge_split_id" = ${id}::uuid ORDER BY r."position"`;
    return {
      sources: sources.map((row) => ({ id: row.id, key: row.client_key, position: row.position, stockUuid: row.stock_uuid, stockId: row.stock_id, availPcs: row.avail_pcs, availWeightCt: row.avail_weight_ct, priceUnit: row.price_unit, unitCostBase: row.unit_cost_base, takeCostBase: row.take_cost_base })),
      results: results.map((row) => ({
        id: row.id, position: row.position, sourceId: row.source_id, location: row.location, lot: row.lot, parcel: row.parcel, priceUnit: row.price_unit, pcs: row.pcs, weightCt: row.weight_ct,
        unitCostBase: row.unit_cost_base, costAmountBase: row.cost_amount_base, stockPrice: row.stock_price, salePrice: row.sale_price, itemNote: row.item_note, photoIds: row.photo_ids,
        attrs: { stoneCodeId: row.stone_code_id, stoneCode: row.stone_code, stone: row.stone, shape: row.shape, size: row.size, color: row.color, clarity: row.clarity, cutting: row.cutting, quality: row.quality, cerType: row.cer_type, cerNo: row.cer_no },
      })),
    };
  }

  /** Read-only submit / approve checks of stored lines (unavailable, busy, stale, Pending elsewhere, currency). */
  private async recheck(id: string, mode: ConversionMode, sources: readonly NormalizedSource[]) {
    const facts = await readStockFacts(this.deps.db, sources.map((source) => source.stockUuid), id, false);
    const refusal = checkStockFacts(mode, sources.map(toConversionSource), facts);
    if (refusal) throw refusal;
  }

  private issue(id: string, applySeq: number, count: number, principal: Principal, requestId: string) {
    return this.deps.master.issueStockIds(MERGE_SPLIT_DOCUMENT_TYPE, id, applySeq, count, { requestId, actorId: principal.userId });
  }

  private apply(tx: Tx, id: string, mode: ConversionMode, applySeq: number, actorId: string, doc: { sources: readonly NormalizedSource[]; results: readonly NormalizedResult[] }, stockIds: readonly string[]) {
    return applyConversion(tx, { documentId: id, mode, applySeq, actorId }, doc.sources.map(toConversionSource), doc.results.map(toConversionResult), stockIds);
  }

  // ---------- operations ----------

  /** POST /merge-split (ADD): approval OFF → applied (APPROVED, auto); ON → DRAFT. */
  async create(principal: Principal, input: MergeSplitInput, requestId: string): Promise<WriteResult> {
    const id = uuidV7();
    const [doc, numbering, requireApprovalPeek] = await Promise.all([
      this.prepare(input, null, new Set(), true, requestId),
      this.deps.master.numbering(input.docDate, true, { requestId }, LEAF).then((result) => numberingOrDefault(result.numbering)),
      this.peekApproval(),
    ]);
    const issued = requireApprovalPeek ? null : await this.issue(id, 1, doc.results.length, principal, requestId);
    let docNo = "";
    let status = "DRAFT";
    let stockIds: (string | null)[] = doc.results.map(() => null);
    await this.deps.db.$transaction(async (tx) => {
      const requireApproval = await readSettingForShare(tx, LEAF);
      const runningNo = await nextRunningNo(tx, numbering, true);
      docNo = formatDocNo(numbering, runningNo);
      // A switch turned OFF between the peek and this transaction leaves a DRAFT (Save again applies it).
      const applyNow = !requireApproval && issued !== null;
      const now = new Date();
      await tx.merge_split.create({
        data: {
          id, numbering_id: numbering.id, running_no: runningNo, doc_no: docNo, ...headerFields(doc),
          status: applyNow ? "APPROVED" : "DRAFT", auto_approved: applyNow, apply_seq: applyNow ? 1 : 0,
          approved_at: applyNow ? now : null, approved_by: applyNow ? principal.userId : null, applied_at: applyNow ? now : null,
          created_by: principal.userId, updated_by: principal.userId,
        },
      });
      await insertLines(tx, id, doc);
      if (applyNow) stockIds = (await this.apply(tx, id, doc.mode, 1, principal.userId, doc, issued!.stockIds)).stockIds;
      status = applyNow ? "APPROVED" : "DRAFT";
    }, WRITE_TX);
    this.deps.logger.info({ event: status === "APPROVED" ? "merge_split.applied" : "merge_split.created", requestId, actorId: principal.userId, id, docNo, mode: doc.mode, sourceCount: doc.sources.length, resultCount: doc.results.length });
    return { id, docNo, version: 1, status, stockIds };
  }

  /** PUT /{id} (EDIT): DRAFT / REVISION_REQUESTED, or auto-approved (reverse + re-apply with new Stock IDs, one transaction). */
  async update(principal: Principal, id: string, input: MergeSplitInput, expectedVersion: number, requestId: string): Promise<WriteResult> {
    const current = await this.header(this.deps.db, id);
    if (!current) throw new AppError(404, "MERGE_SPLIT_NOT_FOUND");
    const applied = current.status === "APPROVED" && current.auto_approved && !current.deleted_at;
    // Status first (PENDING / REJECTED / approver-approved / deleted → 409 MERGE_SPLIT_STATUS) before any stock check.
    if (current.deleted_at || !(applied || current.status === "DRAFT" || current.status === "REVISION_REQUESTED")) await explainMiss(this.deps.db, id, ["DRAFT", "REVISION_REQUESTED", APPROVED_AUTO]);
    const existing = new Set((await this.deps.db.merge_split_result.findMany({ where: { merge_split_id: id }, select: { id: true } })).map((row) => row.id));
    // An applied document gets its own sources back first (inside the transaction), so the on-hand check waits for the lock.
    const doc = await this.prepare(input, id, existing, !applied, requestId);
    const willApply = applied || (current.status === "DRAFT" && !current.deleted_at && !(await this.peekApproval()));
    const applySeq = current.apply_seq + 1;
    const issued = willApply ? await this.issue(id, applySeq, doc.results.length, principal, requestId) : null;
    let status = current.status;
    let stockIds: (string | null)[] = doc.results.map(() => null);
    await this.deps.db.$transaction(async (tx) => {
      const requireApproval = await readSettingForShare(tx, LEAF);
      const locked = await tx.$executeRaw`
        UPDATE "inventory"."merge_split" SET "version" = "version" + 1, "updated_at" = now(), "updated_by" = ${principal.userId}
        WHERE "id" = ${id}::uuid AND "version" = ${expectedVersion}::int AND "deleted_at" IS NULL AND "apply_seq" = ${current.apply_seq}::int
          AND ("status" IN ('DRAFT', 'REVISION_REQUESTED') OR ("status" = 'APPROVED' AND "auto_approved"))`;
      if (locked === 0) await explainMiss(tx, id, ["DRAFT", "REVISION_REQUESTED", APPROVED_AUTO]);
      const header = (await this.header(tx, id))!;
      if (header.status === "APPROVED") {
        await reverseConversion(tx, { documentId: id, mode: header.mode, applySeq, actorId: principal.userId });
        await replaceLines(tx, id, doc);
        await tx.merge_split.update({ where: { id }, data: { ...headerFields(doc), apply_seq: applySeq, applied_at: new Date() } });
        stockIds = (await this.apply(tx, id, doc.mode, applySeq, principal.userId, doc, issued!.stockIds)).stockIds;
        status = "APPROVED";
        return;
      }
      await replaceLines(tx, id, doc);
      await tx.merge_split.update({ where: { id }, data: { ...headerFields(doc) } });
      if (header.status === "DRAFT" && !requireApproval && issued) {
        // ADR-0050 saveStatus: a DRAFT saved while approval is OFF is applied now.
        await tx.merge_split.update({ where: { id }, data: { status: "APPROVED", auto_approved: true, apply_seq: applySeq, approved_at: new Date(), approved_by: principal.userId, applied_at: new Date() } });
        stockIds = (await this.apply(tx, id, doc.mode, applySeq, principal.userId, doc, issued.stockIds)).stockIds;
        status = "APPROVED";
      }
    }, WRITE_TX);
    this.deps.logger.info({ event: "merge_split.updated", requestId, actorId: principal.userId, id, version: expectedVersion + 1, status, resultCount: doc.results.length });
    return { id, version: expectedVersion + 1, status, stockIds };
  }

  /** POST /{id}/submit (ADD or EDIT): DRAFT / REVISION → PENDING while approval is ON, after the read-only checks (SA-MS-04). */
  async submit(principal: Principal, id: string, expectedVersion: number, requestId: string): Promise<WriteResult> {
    const current = await this.header(this.deps.db, id);
    if (!current) throw new AppError(404, "MERGE_SPLIT_NOT_FOUND");
    const { sources } = await this.stored(this.deps.db, id);
    if (sources.length > 0) await this.recheck(id, current.mode, sources);
    const approvers = await this.deps.approvers(LEAF).catch(() => [] as string[]);
    let signal: NotificationSignal | null = null;
    const submittedAt = new Date();
    await this.deps.db.$transaction(async (tx) => {
      const requireApproval = await readSettingForShare(tx, LEAF);
      if (!requireApproval) throw new AppError(409, "MERGE_SPLIT_STATUS", { status: current.status, reason: "APPROVAL_OFF" });
      const updated = await tx.$executeRaw`
        UPDATE "inventory"."merge_split" SET "status" = 'PENDING_APPROVAL', "version" = "version" + 1, "submitted_at" = ${submittedAt}, "submitted_by" = ${principal.userId},
          "submitted_by_name" = ${principal.displayName}, "updated_at" = now(), "updated_by" = ${principal.userId}
        WHERE "id" = ${id}::uuid AND "version" = ${expectedVersion}::int AND "status" IN ('DRAFT', 'REVISION_REQUESTED') AND "deleted_at" IS NULL`;
      if (updated === 0) await explainMiss(tx, id, ["DRAFT", "REVISION_REQUESTED"]);
      signal = await recordNotification(tx, { type: "approval.pending", documentType: LEAF, documentId: id, docNo: current.doc_no, actorId: principal.userId, recipients: approvers, summary: { partyName: current.ref } });
    }, WRITE_TX);
    this.deps.hub.emit([signal!]);
    this.deps.logger.info({ event: "merge_split.submitted", requestId, actorId: principal.userId, id, version: expectedVersion + 1 });
    return { id, version: expectedVersion + 1, status: "PENDING_APPROVAL", submittedAt: submittedAt.toISOString() };
  }

  /** POST /{id}/approve (APPROVE + VIEW): applies in one transaction with the Stock IDs issued before it. */
  async approve(principal: Principal, id: string, expectedVersion: number, requestId: string): Promise<WriteResult> {
    const current = await this.header(this.deps.db, id);
    if (!current) throw new AppError(404, "MERGE_SPLIT_NOT_FOUND");
    if (current.status !== "PENDING_APPROVAL" || current.deleted_at || current.version !== expectedVersion) await explainMiss(this.deps.db, id, ["PENDING_APPROVAL"]);
    const doc = await this.stored(this.deps.db, id);
    await this.recheck(id, current.mode, doc.sources);
    const applySeq = current.apply_seq + 1;
    const issued = await this.issue(id, applySeq, doc.results.length, principal, requestId);
    let signal: NotificationSignal | null = null;
    let stockIds: string[] = [];
    await this.deps.db.$transaction(async (tx) => {
      const locked = await tx.$executeRaw`
        UPDATE "inventory"."merge_split" SET "status" = 'APPROVED', "auto_approved" = false, "approved_at" = now(), "approved_by" = ${principal.userId},
          "applied_at" = now(), "apply_seq" = ${applySeq}::int, "version" = "version" + 1, "updated_at" = now(), "updated_by" = ${principal.userId}
        WHERE "id" = ${id}::uuid AND "version" = ${expectedVersion}::int AND "status" = 'PENDING_APPROVAL' AND "deleted_at" IS NULL AND "apply_seq" = ${current.apply_seq}::int`;
      if (locked === 0) await explainMiss(tx, id, ["PENDING_APPROVAL"]);
      // The lines can't change while PENDING (update refuses), so the ones read above are the ones applied.
      stockIds = (await this.apply(tx, id, current.mode, applySeq, principal.userId, doc, issued.stockIds)).stockIds;
      signal = await recordNotification(tx, { type: "document.approved", documentType: LEAF, documentId: id, docNo: current.doc_no, actorId: principal.userId, recipients: [current.created_by], summary: { partyName: current.ref } });
    }, WRITE_TX);
    this.deps.hub.emit([signal!]);
    this.deps.logger.info({ event: "merge_split.approved", requestId, actorId: principal.userId, id, version: expectedVersion + 1, resultCount: doc.results.length });
    return { id, version: expectedVersion + 1, status: "APPROVED", stockIds };
  }

  /** Revise (once) / Reject: one guarded update + a notification to the creator. */
  async review(principal: Principal, id: string, expectedVersion: number, action: "REVISE" | "REJECT", note: string, requestId: string): Promise<WriteResult> {
    const status = action === "REVISE" ? "REVISION_REQUESTED" : "REJECTED";
    let signal: NotificationSignal | null = null;
    await this.deps.db.$transaction(async (tx) => {
      const updated = action === "REVISE"
        ? await tx.$executeRaw`
            UPDATE "inventory"."merge_split" SET "status" = 'REVISION_REQUESTED', "revision_count" = "revision_count" + 1, "review_action" = 'REVISE', "review_note" = ${note},
              "reviewed_at" = now(), "reviewed_by" = ${principal.userId}, "reviewed_by_name" = ${principal.displayName}, "version" = "version" + 1, "updated_at" = now(), "updated_by" = ${principal.userId}
            WHERE "id" = ${id}::uuid AND "version" = ${expectedVersion}::int AND "status" = 'PENDING_APPROVAL' AND "revision_count" = 0 AND "deleted_at" IS NULL`
        : await tx.$executeRaw`
            UPDATE "inventory"."merge_split" SET "status" = 'REJECTED', "review_action" = 'REJECT', "review_note" = ${note},
              "reviewed_at" = now(), "reviewed_by" = ${principal.userId}, "reviewed_by_name" = ${principal.displayName}, "version" = "version" + 1, "updated_at" = now(), "updated_by" = ${principal.userId}
            WHERE "id" = ${id}::uuid AND "version" = ${expectedVersion}::int AND "status" = 'PENDING_APPROVAL' AND "deleted_at" IS NULL`;
      if (updated === 0) {
        const [row] = await tx.$queryRaw<{ status: string; revision_count: number; version: number; deleted_at: Date | null }[]>`
          SELECT "status", "revision_count", "version", "deleted_at" FROM "inventory"."merge_split" WHERE "id" = ${id}::uuid`;
        if (action === "REVISE" && row && !row.deleted_at && row.status === "PENDING_APPROVAL" && row.version === expectedVersion && row.revision_count >= 1) {
          throw new AppError(409, "MERGE_SPLIT_STATUS", { status: row.status, reason: "REVISE_LIMIT" });
        }
        await explainMiss(tx, id, ["PENDING_APPROVAL"]);
      }
      const header = (await this.header(tx, id))!;
      signal = await recordNotification(tx, { type: action === "REVISE" ? "document.revision_requested" : "document.rejected", documentType: LEAF, documentId: id, docNo: header.doc_no, actorId: principal.userId, recipients: [header.created_by], summary: { partyName: header.ref, reason: note } });
    }, WRITE_TX);
    this.deps.hub.emit([signal!]);
    this.deps.logger.info({ event: action === "REVISE" ? "merge_split.revision_requested" : "merge_split.rejected", requestId, actorId: principal.userId, id, version: expectedVersion + 1, noteLength: note.length });
    return { id, version: expectedVersion + 1, status };
  }

  /** POST /{id}/delete (DELETE): DRAFT / REVISION / REJECTED soft delete; APPROVED → reverse first (SA-MS-11), then soft delete. */
  async remove(principal: Principal, id: string, expectedVersion: number, requestId: string): Promise<WriteResult> {
    let status = "";
    await this.deps.db.$transaction(async (tx) => {
      const locked = await tx.$executeRaw`
        UPDATE "inventory"."merge_split" SET "version" = "version" + 1, "updated_at" = now(), "updated_by" = ${principal.userId}
        WHERE "id" = ${id}::uuid AND "version" = ${expectedVersion}::int AND "deleted_at" IS NULL AND "status" IN ('DRAFT', 'REVISION_REQUESTED', 'REJECTED', 'APPROVED')`;
      if (locked === 0) await explainMiss(tx, id, ["DRAFT", "REVISION_REQUESTED", "REJECTED", APPROVED_ANY]);
      const header = (await this.header(tx, id))!;
      status = header.status;
      if (header.status === "APPROVED") {
        const applySeq = header.apply_seq + 1;
        await reverseConversion(tx, { documentId: id, mode: header.mode, applySeq, actorId: principal.userId });
        await tx.$executeRaw`UPDATE "inventory"."merge_split" SET "apply_seq" = ${applySeq}::int WHERE "id" = ${id}::uuid`;
      }
      await tx.$executeRaw`UPDATE "inventory"."merge_split" SET "deleted_at" = now(), "deleted_by" = ${principal.userId} WHERE "id" = ${id}::uuid`;
    }, WRITE_TX);
    this.deps.logger.info({ event: "merge_split.deleted", requestId, actorId: principal.userId, id, version: expectedVersion + 1, status });
    return { id, version: expectedVersion + 1, status };
  }

  /** POST /{id}/restore (DELETE): a deleted document returns as DRAFT with nothing applied; its number is kept. */
  async restore(principal: Principal, id: string, expectedVersion: number, requestId: string): Promise<WriteResult> {
    await this.deps.db.$transaction(async (tx) => {
      const restored = await tx.$executeRaw`
        UPDATE "inventory"."merge_split" SET "status" = 'DRAFT', "auto_approved" = false, "approved_at" = NULL, "approved_by" = NULL, "applied_at" = NULL,
          "submitted_at" = NULL, "submitted_by" = NULL, "submitted_by_name" = NULL,
          "review_action" = NULL, "review_note" = NULL, "reviewed_at" = NULL, "reviewed_by" = NULL, "reviewed_by_name" = NULL,
          "deleted_at" = NULL, "deleted_by" = NULL, "version" = "version" + 1, "updated_at" = now(), "updated_by" = ${principal.userId}
        WHERE "id" = ${id}::uuid AND "version" = ${expectedVersion}::int AND "deleted_at" IS NOT NULL`;
      if (restored === 0) await explainMiss(tx, id, [], { deleted: true });
    }, WRITE_TX);
    this.deps.logger.info({ event: "merge_split.restored", requestId, actorId: principal.userId, id, version: expectedVersion + 1 });
    return { id, version: expectedVersion + 1, status: "DRAFT" };
  }
}
