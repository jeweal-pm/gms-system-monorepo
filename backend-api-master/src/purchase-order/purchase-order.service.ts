import { HttpStatus, Injectable, Logger } from "@nestjs/common";
import { partnerException } from "../common/errors";
import { WRITE_TX, type Tx } from "../common/persistence";
import { prisma } from "../database/prisma-client";
import type { Prisma } from "../generated/prisma/client";
import { explainMiss, MISS_SELECT, TradeDocumentEngine, type LineHook, type MissRow } from "../trade-document/document-engine";
import { documentErrors } from "../trade-document/document-errors";
import { vendorDocumentOptions, vendorParty, type VendorOut } from "../trade-document/memo-out-return.service";
import type { PurchaseOrderInput, PurchaseOrderListInput, PurchaseOrderStatus } from "./purchase-order.schemas";
import { emitNotificationSignals } from "../notification/notification-hub";

export const purchaseOrderErrors = documentErrors("PURCHASE_ORDER", "PurchaseOrder", "purchase_order");
/** SA-PO-11: an upload that isn't a JPEG/PNG ≤ 5 MB, or a saved photo id that isn't a ready Purchase Order photo. */
export const purchaseOrderPhotoInvalid = (path: string) => partnerException("PURCHASE_ORDER_PHOTO_INVALID", HttpStatus.UNPROCESSABLE_ENTITY, [{ path, code: "invalid_photo" }]);
/** `stored_files.source_type` of Purchase Order line photos (SA-PO-11); `source_id` is the photo id itself. */
export const PURCHASE_ORDER_PHOTO_SOURCE = "purchase_order.line-photo";

const PENDING: PurchaseOrderStatus = "PENDING_APPROVAL";
const APPROVED: PurchaseOrderStatus = "APPROVED";

/**
 * SA-PO-11: every photo id must be a ready Purchase Order photo (a Quotation or Memo Receive photo id, an unknown or a
 * pending file is refused) → `PURCHASE_ORDER_PHOTO_INVALID` at `lines.N.photoIds.M`. One bounded query (≤ 5 ids × lines).
 */
async function checkLinePhotos(tx: Tx, lines: { photoIds: string[] }[]): Promise<void> {
  const photoIds = [...new Set(lines.flatMap((line) => line.photoIds))];
  if (photoIds.length === 0) return;
  const files = await tx.storedFile.findMany({ where: { id: { in: photoIds }, sourceType: PURCHASE_ORDER_PHOTO_SOURCE, status: "ready" }, select: { id: true } });
  const known = new Set(files.map((file) => file.id));
  lines.forEach((line, index) => {
    const bad = line.photoIds.findIndex((photoId) => !known.has(photoId));
    if (bad >= 0) throw purchaseOrderPhotoInvalid(`lines.${index}.photoIds.${bad}`);
  });
}

/**
 * purchase-order SA rev 1 / ADR-0041: Document Setup key `purchase-order`, vendor + address like Memo Receive, keyed-in
 * lines with stone code and location, PENDING_APPROVAL → APPROVED on the page. Approval writes no stock: each line then
 * waits to be purchased for its full quantity (`purchased_*` = 0, written later by Purchase only, SA-PO-04/05).
 */
@Injectable()
export class PurchaseOrderService {
  private readonly logger = new Logger("purchase_order");

  private readonly photos: LineHook<PurchaseOrderInput> = {
    storedSelect: {},
    assign: async (tx, input) => {
      await checkLinePhotos(tx, input.lines);
      return input.lines.map(() => ({}));
    },
    output: (line, base) => {
      const { outstandingPcs: _pcs, outstandingWeightCt: _weight, ...rest } = base;
      const photoIds = ((line.photos as { fileId: string }[] | undefined) ?? []).map((photo) => photo.fileId);
      return { ...rest, photoIds, purchasedPcs: line.purchasedPcs as number, purchasedWeightCt: (line.purchasedWeightCt as Prisma.Decimal).toFixed(3) };
    },
    result: () => ({}),
    lineInclude: { photos: { orderBy: { position: "asc" }, select: { fileId: true } } },
    // The save replaced the lines (and their photo links, CASCADE); write each line's photos in order.
    afterLines: async (tx, input, lineIds) => {
      const photos = input.lines.flatMap((line, index) => line.photoIds.map((fileId, position) => ({ lineId: lineIds[index], position: position + 1, fileId })));
      if (photos.length > 0) await tx.purchaseOrderLinePhoto.createMany({ data: photos });
    },
  };

  private readonly engine = new TradeDocumentEngine<PurchaseOrderInput, VendorOut, PurchaseOrderStatus>({
    document: "purchaseOrder",
    transactionKey: "purchase-order",
    event: "purchase_order",
    model: "purchaseOrder",
    lineModel: "purchaseOrderLine",
    chargeModel: "purchaseOrderCharge",
    parentKey: "purchaseOrderId",
    errors: purchaseOrderErrors,
    party: vendorParty<PurchaseOrderInput>(purchaseOrderErrors),
    createStatus: PENDING,
    editableStatuses: [PENDING],
    lineHook: this.photos,
    detailExtra: (row) => ({
      approvedAt: row.approvedAt ? (row.approvedAt as Date).toISOString() : null,
      approvedBy: (row.approvedBy as string | null) ?? null,
    }),
  });

  list(input: PurchaseOrderListInput) {
    return this.engine.list(input);
  }
  get(id: string) {
    return this.engine.get(id) as Promise<unknown> as Promise<PurchaseOrderDetail>;
  }
  nextNumber(docDate: string) {
    return this.engine.nextNumber(docDate);
  }
  create(actorId: string, input: PurchaseOrderInput) {
    return this.engine.create(actorId, input) as Promise<{ id: string; docNo: string; version: number }>;
  }
  update(actorId: string, id: string, expectedVersion: number, input: PurchaseOrderInput) {
    return this.engine.update(actorId, id, expectedVersion, input) as Promise<{ id: string; version: number }>;
  }
  delete(actorId: string, id: string, expectedVersion: number) {
    return this.engine.delete(actorId, id, expectedVersion);
  }
  /** transaction-soft-delete D6: a deleted document back to its unchanged status. */
  restore(actorId: string, id: string, expectedVersion: number) {
    return this.engine.restore(actorId, id, expectedVersion);
  }

  /** `memoReceive.options` shape with stone codes kept, for the Stone Code field (SA-PO-10). */
  async options(includeVendorId?: string) {
    try {
      const [options, setup] = await Promise.all([
        vendorDocumentOptions(includeVendorId),
        prisma.documentSetup.findUnique({ where: { transactionKey: "purchase-order" }, select: { transactionKey: true } }),
      ]);
      return { ...options, numbering: { configured: setup !== null } };
    } catch (error) {
      throw purchaseOrderErrors.map(error, "options");
    }
  }

  /**
   * SA-PO-04: PENDING_APPROVAL → APPROVED (approved_at/by, version + 1) in one guarded UPDATE, which also serializes
   * concurrent approvals. No stock, Stock ID or Memo Stock row is written; the lines keep `purchased_*` = 0.
   */
  async approve(actorId: string, id: string, expectedVersion: number) {
    const errors = purchaseOrderErrors;
    try {
      const approved = await prisma.$transaction(async (tx) => {
        const now = new Date();
        const updated = await tx.purchaseOrder.updateMany({
          where: { id, version: expectedVersion, status: PENDING, deletedAt: null },
          data: { status: APPROVED, approvedAt: now, approvedBy: actorId, version: { increment: 1 }, updatedAt: now, updatedBy: actorId },
        });
        if (updated.count === 0) {
          // D8: NOT_FOUND → DELETED → STATUS_INVALID → CHANGED.
          explainMiss(errors, (await tx.purchaseOrder.findUnique({ where: { id }, select: MISS_SELECT })) as MissRow, [PENDING]);
        }
        const document = await tx.purchaseOrder.findUniqueOrThrow({ where: { id }, select: { docNo: true, _count: { select: { lines: true } } } });
        // ADR-0049: the creator hears about the approval once this transaction commits.
        const signals = await this.engine.notifyApproved(tx, id, actorId);
        return { signals, docNo: document.docNo, lineCount: document._count.lines };
      }, WRITE_TX);
      emitNotificationSignals(approved.signals);
      this.logger.log({ event: "purchase_order.approved", actorId, id, docNo: approved.docNo, lineCount: approved.lineCount });
      return { id, version: expectedVersion + 1, status: APPROVED as "APPROVED", lineCount: approved.lineCount };
    } catch (error) {
      throw errors.map(error, "approve");
    }
  }
}

type EngineDetail = Awaited<ReturnType<TradeDocumentEngine<PurchaseOrderInput, VendorOut, PurchaseOrderStatus>["get"]>>;
type PurchaseOrderLineOut = Omit<EngineDetail["lines"][number], "outstandingPcs" | "outstandingWeightCt"> & { purchasedPcs: number; purchasedWeightCt: string };
/** api-contract `PurchaseOrder` (the line hook and `detailExtra` shape the engine output at run time). */
export type PurchaseOrderDetail = Omit<EngineDetail, "lines"> & { lines: PurchaseOrderLineOut[]; approvedAt: string | null; approvedBy: string | null };
