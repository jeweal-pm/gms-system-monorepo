import { Injectable, Logger } from "@nestjs/common";
import { validationException, type FieldError } from "../common/errors";
import { WRITE_TX } from "../common/persistence";
import { prisma } from "../database/prisma-client";
import { Prisma } from "../generated/prisma/client";
import { TradeDocumentEngine, type LineHook, type TradeDocumentInput } from "../trade-document/document-engine";
import { vendorDocumentOptions, vendorParty, type VendorOut } from "../trade-document/memo-out-return.service";
import { issueStockIds } from "../trade-document/memo-receive.service";
import { purchaseMemoStock, purchaseOrderLines } from "./purchase-pickers";
import { completeSourceLines, memoLineRange, purchaseOrderAvailable, takeForPurchase, type PreparedInput, type SoldPart } from "./purchase-stock";
import { purchaseErrors, purchasePendingShort, purchaseStockIdExhausted } from "./purchase.errors";
import type { LineMemoGroup, PurchaseInput, PurchaseLineSource, PurchaseListInput, PurchaseMemoStockInput, PurchaseOrderLinesInput, PurchaseStatus } from "./purchase.schemas";

const PENDING: PurchaseStatus = "PENDING_APPROVAL";
const APPROVED: PurchaseStatus = "APPROVED";
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
 * Memo Stock, an approved PO line or are keyed in. Document Setup key `purchase` (`PU`). Save checks availability and
 * moves no stock (SA default D2); Approve cuts it under row locks (`takeForPurchase`). Delete is the engine delete.
 */
@Injectable()
export class PurchaseService {
  private readonly logger = new Logger("purchase");
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
    createStatus: PENDING,
    editableStatuses: [PENDING],
    prepare: async (tx, input) => (await completeSourceLines(tx, input as unknown as PurchaseInput)) as unknown as EngineInput,
    lineHook: this.lines,
    detailExtra: (row: Row) => ({
      approvedAt: row.approvedAt ? (row.approvedAt as Date).toISOString() : null,
      approvedBy: (row.approvedBy as string | null) ?? null,
    }),
  });

  list(input: PurchaseListInput) {
    return this.engine.list(input);
  }

  /** SA-PU-16/26: `limit*` / `min*` only while PENDING_APPROVAL (null once approved and for manual lines). */
  async get(id: string): Promise<PurchaseDetail> {
    const detail = (await this.engine.get(id)) as unknown as PurchaseDetail;
    if (detail.status === PENDING) return detail;
    return { ...detail, lines: detail.lines.map((line) => ({ ...line, limitPcs: null, limitWeightCt: null, minPcs: null, minWeightCt: null })) };
  }

  nextNumber(docDate: string) {
    return this.engine.nextNumber(docDate);
  }
  create(actorId: string, input: PurchaseInput) {
    return this.engine.create(actorId, asEngine(input)) as Promise<{ id: string; docNo: string; version: number; stockIds: string[] }>;
  }
  update(actorId: string, id: string, expectedVersion: number, input: PurchaseInput) {
    return this.engine.update(actorId, id, expectedVersion, asEngine(input)) as Promise<{ id: string; version: number; stockIds: string[] }>;
  }
  /** SA-PU-08: pending only, guarded by version; lines and charges CASCADE; no stock change (nothing was cut). */
  delete(actorId: string, id: string, expectedVersion: number) {
    return this.engine.delete(actorId, id, expectedVersion);
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

  /**
   * SA-PU-09 in one `WRITE_TX`: the guarded status update (0 rows → NOT_FOUND / STATUS_INVALID / CHANGED), then
   * `takeForPurchase` (lock memo_stock, then purchase_order_line, in id order; guard; ≤ 2 bulk UPDATEs). A short →
   * `PURCHASE_PENDING_SHORT` with every short line and the whole transaction rolls back (the purchase stays pending).
   */
  async approve(actorId: string, id: string, expectedVersion: number) {
    try {
      const approved = await prisma.$transaction(async (tx) => {
        const now = new Date();
        const updated = await tx.purchase.updateMany({
          where: { id, version: expectedVersion, status: PENDING },
          data: { status: APPROVED, approvedAt: now, approvedBy: actorId, version: { increment: 1 }, updatedAt: now, updatedBy: actorId },
        });
        if (updated.count === 0) {
          const row = await tx.purchase.findUnique({ where: { id }, select: { status: true } });
          if (!row) throw purchaseErrors.notFound();
          if (row.status !== PENDING) throw purchaseErrors.statusInvalid();
          throw purchaseErrors.changed();
        }
        const document = await tx.purchase.findUniqueOrThrow({
          where: { id },
          select: {
            docNo: true, vendorId: true, currencyCode: true,
            lines: { orderBy: { position: "asc" }, select: { id: true, source: true, memoStockId: true, memoGroup: true, purchaseOrderLineId: true, pcs: true, weightCt: true } },
          },
        });
        const takes = document.lines.map((line, index) => ({ ...line, index }));
        const { soldParts, ...moved } = await takeForPurchase(tx, { vendorId: document.vendorId, currency: document.currencyCode }, takes, purchasePendingShort, now);
        await writeSoldParts(tx, document.lines.map((line) => line.id), soldParts);
        return { docNo: document.docNo, lineCount: document.lines.length, ...moved };
      }, WRITE_TX);
      this.logger.log({ event: "purchase.approved", actorId, id, docNo: approved.docNo, lineCount: approved.lineCount, memoStockKeys: approved.memoStockKeys, purchaseOrderKeys: approved.purchaseOrderKeys });
      return { id, version: expectedVersion + 1, status: APPROVED as "APPROVED", lineCount: approved.lineCount };
    } catch (error) {
      throw purchaseErrors.map(error, "approve");
    }
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
  photoIds: [];
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
