import { z } from "zod";
import { LINES_MAX, lineInputSchema, tradeDocumentFields, tradeDocumentRules } from "../quotation/quotation.schemas";
import { documentListFields } from "../trade-document/document-engine";
import { discountBoundRules } from "../trade-document/memo-schemas";

/**
 * purchase-order SA rev 1 / ADR-0041 (owner 2026-11-04): the vendor fields of memo receive with keyed-in quotation lines.
 * `lineInputSchema` is strict and MANUAL only, so `source: "STOCK"` and `memoStockId` are refused (SA-PO-06, Q-PO-05);
 * lines keep stone code and free-text location (Q-PO-06) and up to 5 photos (Q-PO-09). Discount bounds as SA-MR-09.
 */
const uuid = z.uuid();
const purchaseOrderFields = { ...tradeDocumentFields, lines: z.array(lineInputSchema).min(1).max(LINES_MAX), vendorId: uuid, addressId: uuid };
type PurchaseOrderValues = z.output<z.ZodObject<typeof purchaseOrderFields>>;
function purchaseOrderRules(value: PurchaseOrderValues, ctx: z.RefinementCtx) {
  tradeDocumentRules(value, ctx);
  discountBoundRules(value, ctx);
}
export const createPurchaseOrderSchema = z.object(purchaseOrderFields).strict().superRefine(purchaseOrderRules);
export const updatePurchaseOrderSchema = z.object({ ...purchaseOrderFields, id: uuid, expectedVersion: z.number().int().min(1) }).strict().superRefine(purchaseOrderRules);
export type PurchaseOrderInput = z.output<typeof createPurchaseOrderSchema>;

export const PURCHASE_ORDER_STATUSES = ["PENDING_APPROVAL", "APPROVED"] as const;
export type PurchaseOrderStatus = (typeof PURCHASE_ORDER_STATUSES)[number];
export const purchaseOrderListSchema = z.object({ ...documentListFields, status: z.enum(PURCHASE_ORDER_STATUSES).optional() }).strict();
export type PurchaseOrderListInput = z.output<typeof purchaseOrderListSchema>;
