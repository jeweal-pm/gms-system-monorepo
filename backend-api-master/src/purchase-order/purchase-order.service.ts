import { HttpStatus, Injectable } from "@nestjs/common";
import { partnerException } from "../common/errors";
import type { Tx } from "../common/persistence";
import type { FlowPrincipal } from "../approval-setting/approval-flow";
import { prisma } from "../database/prisma-client";
import { Prisma } from "../generated/prisma/client";
import { TradeDocumentEngine, type DocumentActor, type DocumentEffects, type LineHook } from "../trade-document/document-engine";
import { documentErrors } from "../trade-document/document-errors";
import { vendorDocumentOptions, vendorParty, type VendorOut } from "../trade-document/memo-out-return.service";
import type { PurchaseOrderInput, PurchaseOrderListInput, PurchaseOrderStatus } from "./purchase-order.schemas";

export const purchaseOrderErrors = documentErrors("PURCHASE_ORDER", "PurchaseOrder", "purchase_order");
/** SA-PO-11: an upload that isn't a JPEG/PNG ≤ 5 MB, or a saved photo id that isn't a ready Purchase Order photo. */
export const purchaseOrderPhotoInvalid = (path: string) => partnerException("PURCHASE_ORDER_PHOTO_INVALID", HttpStatus.UNPROCESSABLE_ENTITY, [{ path, code: "invalid_photo" }]);
/** `stored_files.source_type` of Purchase Order line photos (SA-PO-11); `source_id` is the photo id itself. */
export const PURCHASE_ORDER_PHOTO_SOURCE = "purchase_order.line-photo";


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
 * An auto-approved Purchase Order is used once any Purchase line names one of its lines (any status; soft-deleted
 * purchases too, because their lines keep the RESTRICT foreign key the edit would break) or a line has purchased > 0.
 * Live documents first, oldest first. One indexed query.
 */
export async function purchaseOrderUsedBy(client: Tx | typeof prisma, id: string): Promise<string | null> {
  const [row] = await client.$queryRaw<{ doc_no: string }[]>(Prisma.sql`
    SELECT CASE WHEN deleted_at IS NOT NULL THEN doc_no || ' (deleted)' ELSE doc_no END AS doc_no FROM (
      SELECT h.doc_no, h.deleted_at, h.created_at FROM "partner"."purchase_line" l
        JOIN "partner"."purchase_order_line" o ON o.id = l.purchase_order_line_id
        JOIN "partner"."purchase" h ON h.id = l.purchase_id
        WHERE o.purchase_order_id = ${id}::uuid
      UNION ALL
      SELECT d.doc_no, NULL::timestamp, NULL::timestamp FROM "partner"."purchase_order_line" o JOIN "partner"."purchase_order" d ON d.id = o.purchase_order_id
        WHERE o.purchase_order_id = ${id}::uuid AND (o.purchased_pcs > 0 OR o.purchased_weight_ct > 0)
    ) u
    ORDER BY (deleted_at IS NOT NULL), created_at NULLS LAST
    LIMIT 1`);
  return row?.doc_no ?? null;
}

/** SA-PO-04: approval writes no stock (lines wait for Purchase); nothing to reverse; used per `purchaseOrderUsedBy`. */
const purchaseOrderEffects: DocumentEffects = {
  apply: async (tx, doc) => {
    const lineCount = await tx.purchaseOrderLine.count({ where: { purchaseOrderId: doc.id } });
    return { result: { lineCount }, log: { lineCount } };
  },
  reverse: async () => undefined,
  usedBy: purchaseOrderUsedBy,
};

/**
 * purchase-order SA rev 1 / ADR-0041: Document Setup key `purchase-order`, vendor + address like Memo Receive, keyed-in
 * lines with stone code and location, the approval flow of ADR-0050. Approval writes no stock: each line then
 * waits to be purchased for its full quantity (`purchased_*` = 0, written later by Purchase only, SA-PO-04/05).
 */
@Injectable()
export class PurchaseOrderService {
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
    approvalType: "purchase-order",
    effects: purchaseOrderEffects,
    lineHook: this.photos,
    detailExtra: (row) => ({
      approvedAt: row.approvedAt ? (row.approvedAt as Date).toISOString() : null,
      approvedBy: (row.approvedBy as string | null) ?? null,
    }),
  });

  list(input: PurchaseOrderListInput) {
    return this.engine.list(input);
  }
  get(id: string, viewer: FlowPrincipal | null = null) {
    return this.engine.get(id, viewer) as Promise<unknown> as Promise<PurchaseOrderDetail>;
  }
  nextNumber(docDate: string) {
    return this.engine.nextNumber(docDate);
  }
  create(actorId: string, input: PurchaseOrderInput, viewer: FlowPrincipal | null = null) {
    return this.engine.create(actorId, input, viewer) as Promise<{ id: string; docNo: string; version: number; status: string; autoApproved: boolean }>;
  }
  update(actorId: string, id: string, expectedVersion: number, input: PurchaseOrderInput, viewer: FlowPrincipal | null = null) {
    return this.engine.update(actorId, id, expectedVersion, input, viewer) as Promise<{ id: string; version: number; status: string; autoApproved: boolean }>;
  }
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
  /**
   * SA-PO-04: PENDING_APPROVAL → APPROVED (approved_at/by, version + 1) in one guarded UPDATE, which also serializes
   * concurrent approvals. No stock, Stock ID or Memo Stock row is written; the lines keep `purchased_*` = 0.
   */
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
}

type EngineDetail = Awaited<ReturnType<TradeDocumentEngine<PurchaseOrderInput, VendorOut, PurchaseOrderStatus>["get"]>>;
type PurchaseOrderLineOut = Omit<EngineDetail["lines"][number], "outstandingPcs" | "outstandingWeightCt"> & { purchasedPcs: number; purchasedWeightCt: string };
/** api-contract `PurchaseOrder` (the line hook and `detailExtra` shape the engine output at run time). */
export type PurchaseOrderDetail = Omit<EngineDetail, "lines"> & { lines: PurchaseOrderLineOut[]; approvedAt: string | null; approvedBy: string | null };
