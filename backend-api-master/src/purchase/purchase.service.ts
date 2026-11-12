import { Injectable } from "@nestjs/common";
import { validationException, type FieldError } from "../common/errors";
import type { Tx } from "../common/persistence";
import type { FlowPrincipal } from "../approval-setting/approval-flow";
import { prisma } from "../database/prisma-client";
import { Prisma } from "../generated/prisma/client";
import { TradeDocumentEngine, type DocumentActor, type DocumentEffects, type LineHook, type TradeDocumentInput } from "../trade-document/document-engine";
import { vendorDocumentOptions, vendorParty, type VendorOut } from "../trade-document/memo-out-return.service";
import { issueStockIds } from "../trade-document/memo-receive.service";
import { purchaseMemoStock, purchaseOrderLines } from "./purchase-pickers";
import { lockSourceHeaders } from "../trade-document/source-lock";
import { completeSourceLines, giveBackForPurchase, memoLineRange, purchaseOrderAvailable, takeForPurchase, type PreparedInput, type SoldPart } from "./purchase-stock";
import { purchaseErrors, purchasePendingShort, purchaseStockIdExhausted } from "./purchase.errors";
import type { LineMemoGroup, PurchaseInput, PurchaseLineSource, PurchaseListInput, PurchaseMemoStockInput, PurchaseOrderLinesInput, PurchaseStatus } from "./purchase.schemas";
import { LINE_PHOTO_DOCUMENTS, withLinePhotos } from "../trade-document/line-photos";

/** Statuses in which the lines show their current range (`limit*` / `min*`): the purchase can still be saved. */
const LIMITED: readonly string[] = ["DRAFT", "REVISION_REQUESTED"];
type Row = Record<string, unknown>;
type Dec = Prisma.Decimal;

/**
 * The engine's shared input shape. The engine types every line as a MANUAL quotation line, but it writes `line.source`
 * as given, so Purchase lines (STOCK / PURCHASE_ORDER / MANUAL) pass through it at run time unchanged.
 */
type EngineInput = TradeDocumentInput & { vendorId: string; addressId: string };
const asEngine = (input: PurchaseInput) => input as unknown as EngineInput;

type StoredMemoStock = { receivedDocNo: string; pendingPcs: number; pendingWeightCt: Dec; soldPcs: number; soldWeightCt: Dec; purchasedPcs: number; purchasedWeightCt: Dec };
type StoredPoLine = { position: number; pcs: number; weightCt: Dec; purchasedPcs: number; purchasedWeightCt: Dec; document: { id: string; docNo: string } };

/**
 * purchase SA rev 1 / ADR-0042 (owner 2026-11-04): a vendor document shaped like Purchase Order whose lines come from
 * Memo Stock, an approved PO line or are keyed in. Document Setup key `purchase` (`PU`). With approval ON, Save checks
 * availability and moves no stock (SA default D2) and Approve cuts it under row locks (`takeForPurchase`); with approval
 * OFF, Save cuts it at once (auto-approved, ADR-0050 D4).
 */
@Injectable()
export class PurchaseService {
  /** Server clock for the Stock ID year; replaced in tests only. */
  clock: () => Date = () => new Date();

  /**
   * SA-PU-02/10: writes the source columns, keeps a saved line's id (and its issued Stock ID when the saved line was not a
   * STOCK line), issues new Stock IDs for MANUAL / PURCHASE_ORDER lines from the shared counter, and sets the PO line's
   * stone code id after the engine's stone-code check.
   */
  private readonly lines: LineHook<EngineInput> = {
    storedSelect: { id: true, stockId: true, source: true },
    assign: async (tx, engineInput, stored) => {
      const input = engineInput as unknown as PreparedInput;
      const kept = new Map((stored ?? []).map((line) => [line.id as string, { stockId: line.stockId as string, source: line.source as string }]));
      const errors: FieldError[] = input.lines.flatMap((line, index) => (line.id && !kept.has(line.id) ? [{ path: `lines.${index}.id`, code: "unknown_line" }] : []));
      if (errors.length > 0) throw validationException(errors);
      const keepsIssued = (line: PreparedInput["lines"][number]) => {
        const saved = line.id ? kept.get(line.id) : undefined;
        return saved !== undefined && saved.source !== "STOCK" && line.source !== "STOCK";
      };
      const needed = input.lines.filter((line) => line.source !== "STOCK" && !keepsIssued(line)).length;
      const fresh = await issueStockIds(tx, needed, this.clock(), purchaseStockIdExhausted);
      let next = 0;
      return input.lines.map((line) => {
        const stockId = line.source === "STOCK" ? line.sourceStockId : keepsIssued(line) ? kept.get(line.id!)!.stockId : fresh[next++];
        return {
          ...(line.id ? { id: line.id } : {}),
          memoStockId: line.source === "STOCK" ? line.memoStockId : null,
          memoGroup: line.source === "STOCK" ? line.memoGroup : null,
          purchaseOrderLineId: line.source === "PURCHASE_ORDER" ? line.purchaseOrderLineId : null,
          stockId,
          ...(line.source === "PURCHASE_ORDER" ? { stoneCodeId: line.copiedStoneCodeId ?? null } : {}),
        };
      });
    },
    output: (line, base) => {
      const { outstandingPcs: _pcs, outstandingWeightCt: _weight, ...rest } = base;
      const memoStock = line.memoStock as StoredMemoStock | null | undefined;
      const poLine = line.purchaseOrderLine as StoredPoLine | null | undefined;
      const group = line.memoGroup as LineMemoGroup | null;
      // SA-PU-26: the row range while pending (min = the Sold part for SOLD / MERGED lines, ADR-0043).
      const range = memoStock && group ? memoLineRange(memoStock, group) : poLine ? { min: null, max: purchaseOrderAvailable(poLine) } : null;
      const limit = range?.max ?? null;
      const min = range?.min ?? null;
      const soldPartWeight = line.soldPartWeightCt as Dec | null | undefined;
      return {
        ...rest,
        source: line.source as PurchaseLineSource,
        memoStockId: (line.memoStockId as string | null) ?? null,
        memoGroup: group ?? null,
        purchaseOrderLineId: (line.purchaseOrderLineId as string | null) ?? null,
        stockId: line.stockId as string,
        photoIds: [],
        memoReceive: memoStock ? { docNo: memoStock.receivedDocNo } : null,
        purchaseOrder: poLine ? { id: poLine.document.id, docNo: poLine.document.docNo, position: poLine.position } : null,
        limitPcs: limit ? limit.pcs : null,
        limitWeightCt: limit ? limit.weightCt.toFixed(3) : null,
        minPcs: min ? min.pcs : null,
        minWeightCt: min ? min.weightCt.toFixed(3) : null,
        soldPartPcs: (line.soldPartPcs as number | null | undefined) ?? null,
        soldPartWeightCt: soldPartWeight ? soldPartWeight.toFixed(3) : null,
      };
    },
    result: (assigned) => ({ stockIds: assigned.map((line) => line.stockId as string) }),
    // SA-PU-16: the sources' current availability, read with the lines (one batched primary-key query per relation).
    lineInclude: {
      memoStock: { select: { receivedDocNo: true, pendingPcs: true, pendingWeightCt: true, soldPcs: true, soldWeightCt: true, purchasedPcs: true, purchasedWeightCt: true } },
      purchaseOrderLine: { select: { position: true, pcs: true, weightCt: true, purchasedPcs: true, purchasedWeightCt: true, document: { select: { id: true, docNo: true } } } },
    },
  };

  /**
   * Effects (SA-PU-09 / ADR-0043; approval-setup "Effects and their reversal"): `takeForPurchase` locks memo_stock then
   * purchase_order_line rows in id order, guards and cuts (`PURCHASE_PENDING_SHORT` rolls back), and each MERGED line
   * records its Sold part. The reversal gives all of it back through `giveBackForPurchase` (same locks, exact inverse,
   * Sold parts cleared). A Purchase is never "used" until Load to Stock exists; the balance checks guard the reversal.
   */
  private readonly effects: DocumentEffects = {
    apply: async (tx, doc, _actorId, now) => {
      const document = await tx.purchase.findUniqueOrThrow({
        where: { id: doc.id },
        select: {
          vendorId: true, currencyCode: true,
          lines: { orderBy: { position: "asc" }, select: { id: true, source: true, memoStockId: true, memoGroup: true, purchaseOrderLineId: true, pcs: true, weightCt: true } },
        },
      });
      const takes = document.lines.map((line, index) => ({ ...line, index }));
      const { soldParts, ...moved } = await takeForPurchase(tx, { vendorId: document.vendorId, currency: document.currencyCode }, takes, purchasePendingShort, now);
      await writeSoldParts(tx, document.lines.map((line) => line.id), soldParts);
      return { result: { lineCount: document.lines.length }, log: { lineCount: document.lines.length, ...moved } };
    },
    reverse: async (tx, doc, now) => {
      const lines = await tx.purchaseLine.findMany({
        where: { purchaseId: doc.id },
        orderBy: { position: "asc" },
        select: { source: true, memoStockId: true, memoGroup: true, purchaseOrderLineId: true, pcs: true, weightCt: true, soldPartPcs: true, soldPartWeightCt: true },
      });
      await giveBackForPurchase(tx, lines.map((line, index) => ({ ...line, index })), () => purchaseErrors.inUse(null), now);
      await tx.purchaseLine.updateMany({ where: { purchaseId: doc.id, memoGroup: "MERGED" }, data: { soldPartPcs: null, soldPartWeightCt: null } });
    },
    usedBy: async () => null,
  };

  private readonly engine = new TradeDocumentEngine<EngineInput, VendorOut, PurchaseStatus>({
    document: "purchase",
    transactionKey: "purchase",
    event: "purchase",
    model: "purchase",
    lineModel: "purchaseLine",
    chargeModel: "purchaseCharge",
    parentKey: "purchaseId",
    errors: purchaseErrors,
    party: vendorParty<EngineInput>(purchaseErrors),
    approvalType: "purchase",
    effects: this.effects,
    prepare: async (tx, input) => (await completeSourceLines(tx, input as unknown as PurchaseInput)) as unknown as EngineInput,
    // INV-20261111-002 F1: the named POs FOR SHARE before prepare / line writes when the Save applies effects.
    lockSources: async (tx, input) => {
      await lockSourceHeaders(tx, "purchaseOrder", (input as unknown as PurchaseInput).lines.flatMap((line) => (line.source === "PURCHASE_ORDER" && line.purchaseOrderLineId ? [line.purchaseOrderLineId] : [])));
    },
    lineHook: withLinePhotos(LINE_PHOTO_DOCUMENTS.purchase, this.lines),
    detailExtra: (row: Row) => ({
      approvedAt: row.approvedAt ? (row.approvedAt as Date).toISOString() : null,
      approvedBy: (row.approvedBy as string | null) ?? null,
    }),
  });

  list(input: PurchaseListInput) {
    return this.engine.list(input);
  }

  /** SA-PU-16/26: `limit*` / `min*` only while the purchase can still be changed (DRAFT / REVISION_REQUESTED). */
  async get(id: string, viewer: FlowPrincipal | null = null): Promise<PurchaseDetail> {
    const detail = (await this.engine.get(id, viewer)) as unknown as PurchaseDetail;
    if (LIMITED.includes(detail.status)) return detail;
    return { ...detail, lines: detail.lines.map((line) => ({ ...line, limitPcs: null, limitWeightCt: null, minPcs: null, minWeightCt: null })) };
  }

  nextNumber(docDate: string) {
    return this.engine.nextNumber(docDate);
  }
  create(actorId: string, input: PurchaseInput, viewer: FlowPrincipal | null = null) {
    return this.engine.create(actorId, asEngine(input), viewer) as Promise<unknown> as Promise<{ id: string; docNo: string; version: number; stockIds: string[]; status: string; autoApproved: boolean }>;
  }
  update(actorId: string, id: string, expectedVersion: number, input: PurchaseInput, viewer: FlowPrincipal | null = null) {
    return this.engine.update(actorId, id, expectedVersion, asEngine(input), viewer) as Promise<unknown> as Promise<{ id: string; version: number; stockIds: string[]; status: string; autoApproved: boolean }>;
  }
  /** SA-PU-08 / ADR-0045 D4 / ADR-0050: soft delete; an auto-approved purchase gives its stock back first. */
  delete(actorId: string, id: string, expectedVersion: number) {
    return this.engine.delete(actorId, id, expectedVersion);
  }
  /** transaction-soft-delete D6 / approval-setup G3. */
  restore(actorId: string, id: string, expectedVersion: number) {
    return this.engine.restore(actorId, id, expectedVersion);
  }
  submit(actor: DocumentActor, id: string, expectedVersion: number) {
    return this.engine.submit(actor, id, expectedVersion);
  }
  /** SA-PU-09 in one `WRITE_TX`: the guarded status update, then the stock cut above. */
  approve(actorId: string, id: string, expectedVersion: number) {
    return this.engine.approve(actorId, id, expectedVersion) as Promise<{ id: string; version: number; status: "APPROVED"; lineCount: number }>;
  }

  /** Go-live command (ADR-0050 D7): the same approve inside the caller's transaction. */
  approveWithin(tx: Tx, actorId: string, id: string, expectedVersion: number) {
    return this.engine.approveWithin(tx, actorId, id, expectedVersion);
  }
  reject(actor: DocumentActor, id: string, expectedVersion: number, reason: string) {
    return this.engine.reject(actor, id, expectedVersion, reason);
  }
  requestRevision(actor: DocumentActor, id: string, expectedVersion: number, note: string) {
    return this.engine.requestRevision(actor, id, expectedVersion, note);
  }

  /** `purchaseOrder.options` shape (stone lists with codes) plus `numbering` for Document Setup key `purchase`. */
  async options(includeVendorId?: string) {
    try {
      const [options, setup] = await Promise.all([
        vendorDocumentOptions(includeVendorId),
        prisma.documentSetup.findUnique({ where: { transactionKey: "purchase" }, select: { transactionKey: true } }),
      ]);
      return { ...options, numbering: { configured: setup !== null } };
    } catch (error) {
      throw purchaseErrors.map(error, "options");
    }
  }

  memoStock(input: PurchaseMemoStockInput) {
    return purchaseMemoStock(input);
  }
  purchaseOrderLines(input: PurchaseOrderLinesInput) {
    return purchaseOrderLines(input);
  }
}

/**
 * SA-PU-25: records the Sold part each MERGED line took first (one `UPDATE … FROM (VALUES …)`, bound parameters only),
 * inside the approve transaction. `lineIds` are the purchase lines in position order.
 */
async function writeSoldParts(tx: Prisma.TransactionClient, lineIds: string[], soldParts: SoldPart[]) {
  if (soldParts.length === 0) return;
  const rows = soldParts.map((part) => Prisma.sql`(${lineIds[part.index]}::uuid, ${part.pcs}::int, ${part.weightCt.toFixed(3)}::numeric)`);
  await tx.$executeRaw(Prisma.sql`
    UPDATE "partner"."purchase_line" AS l
    SET sold_part_pcs = r.pcs, sold_part_weight_ct = r.weight
    FROM (VALUES ${Prisma.join(rows)}) AS r(id, pcs, weight)
    WHERE l.id = r.id`);
}

type EngineDetail = Awaited<ReturnType<TradeDocumentEngine<EngineInput, VendorOut, PurchaseStatus>["get"]>>;
type EngineLineOut = Omit<EngineDetail["lines"][number], "outstandingPcs" | "outstandingWeightCt" | "source" | "photoIds">;
/** api-contract `PurchaseLine` (the line hook shapes the engine output at run time). */
export type PurchaseLineOut = EngineLineOut & {
  source: PurchaseLineSource;
  memoStockId: string | null;
  memoGroup: LineMemoGroup | null;
  purchaseOrderLineId: string | null;
  stockId: string;
  /** ADR-0048: the line's photos in order (the photo hook replaces the `[]` this hook writes). */
  photoIds: string[];
  memoReceive: { docNo: string } | null;
  purchaseOrder: { id: string; docNo: string; position: number } | null;
  limitPcs: number | null;
  limitWeightCt: string | null;
  minPcs: number | null;
  minWeightCt: string | null;
  soldPartPcs: number | null;
  soldPartWeightCt: string | null;
};
/** api-contract `Purchase`. */
export type PurchaseDetail = Omit<EngineDetail, "lines"> & { lines: PurchaseLineOut[]; approvedAt: string | null; approvedBy: string | null };
