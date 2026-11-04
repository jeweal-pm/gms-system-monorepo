import { z } from "zod";
import { DUE_BEFORE_DOC_MESSAGE, isFilledLine, lineSchema, MAX_DOCUMENT_NOTE, serviceChargeSchema } from "@/features/quotation/schema";

/**
 * Purchase Order (purchase-order UI rev 1 / ADR-0041): the vendor header of Memo Receive with the Quotation lines,
 * discounts and totals. Rows are keyed in only (Q-PO-05).
 */
export const PURCHASE_ORDER_STATUSES = ["PENDING_APPROVAL", "APPROVED"] as const;
export type PurchaseOrderStatus = (typeof PURCHASE_ORDER_STATUSES)[number];

/** Server bounds (SA-PO-06/07): 1–200 filled rows, ref ≤ 100, document note ≤ 500. */
export const MAX_PURCHASE_ORDER_LINES = 200;
export const MAX_REF = 100;

const decimalString = z.string().regex(/^\d*(\.\d*)?$/, "Invalid number");

export const purchaseOrderSchema = z
  .object({
    id: z.string().optional(),
    docNo: z.string().optional(),
    status: z.enum(PURCHASE_ORDER_STATUSES).optional(),
    /** Server optimistic version of a saved document. */
    version: z.number().optional(),
    docDate: z.string().min(1, "Required"),
    dueDate: z.string().min(1, "Required"),
    vendorId: z.string().min(1, "Required"),
    addressId: z.string().min(1, "Required"),
    currency: z.string().min(1, "Required"),
    exchangeRate: decimalString,
    ref: z.string().max(MAX_REF, `Up to ${MAX_REF} characters`),
    lines: z.array(lineSchema).max(MAX_PURCHASE_ORDER_LINES, `Up to ${MAX_PURCHASE_ORDER_LINES} rows`),
    discount: z.object({ enabled: z.boolean(), type: z.enum(["PERCENT", "AMOUNT"]), value: decimalString }),
    tax: z.object({ enabled: z.boolean(), rate: decimalString, includeInPrice: z.boolean() }),
    serviceCharges: z.array(serviceChargeSchema),
    labor: z.object({ enabled: z.boolean(), work: z.string(), basis: z.enum(["PCS", "WEIGHT"]), qty: decimalString, rate: decimalString }),
    documentNote: z.string().max(MAX_DOCUMENT_NOTE),
  })
  .superRefine((value, ctx) => {
    if (value.dueDate && value.docDate && value.dueDate < value.docDate) {
      ctx.addIssue({ code: "custom", path: ["dueDate"], message: DUE_BEFORE_DOC_MESSAGE });
    }
    value.lines.forEach((line, index) => {
      if (line.discountType === "PERCENT" && line.discountValue !== "" && Number(line.discountValue) > 100) {
        ctx.addIssue({ code: "custom", path: ["lines", index, "discountValue"], message: "Up to 100%" });
      }
    });
    if (!value.lines.some(isFilledLine)) {
      ctx.addIssue({ code: "custom", path: ["lines"], message: "Add at least one item" });
    }
  });

export type PurchaseOrderFormValues = z.infer<typeof purchaseOrderSchema>;

/** A pending PO can still be edited, deleted or approved; an approved one is read-only (Q-PO-12). */
export const isEditablePurchaseOrder = (status: PurchaseOrderStatus | undefined) => status !== "APPROVED";
