import { z } from "zod";

export const QUOTATION_STATUSES = ["DRAFT", "PENDING_APPROVAL", "APPROVED", "REJECTED", "CANCELLED"] as const;
export type QuotationStatus = (typeof QUOTATION_STATUSES)[number];

/** Owner 2026-10-26 (Figma "Up to 5 photos per item"). */
export const MAX_LINE_PHOTOS = 5;
export const MAX_DOCUMENT_NOTE = 500;

const decimalString = z.string().regex(/^\d*(\.\d*)?$/, "Invalid number");

export const photoSchema = z.object({
  id: z.string(),
  name: z.string(),
  url: z.string(),
});
export type PhotoRef = z.infer<typeof photoSchema>;

export const lineSchema = z.object({
  key: z.string(),
  source: z.enum(["MANUAL", "STOCK"]),
  stockId: z.string(),
  lot: z.string(),
  /** Stone master stone code id ("" = typed by hand); `stoneCode` is its text snapshot. */
  stoneCodeId: z.string(),
  stoneCode: z.string(),
  locationId: z.string(),
  stone: z.string(),
  shape: z.string(),
  size: z.string(),
  color: z.string(),
  clarity: z.string(),
  cutting: z.string(),
  quality: z.string(),
  cerType: z.string(),
  cerNo: z.string(),
  pcs: decimalString,
  weightCt: decimalString,
  priceUnit: z.enum(["PER_CT", "PER_PCS"]),
  unitPrice: decimalString,
  /**
   * Owner 2026-10-27: per-line discount — the field typed last (percent or amount) is the source; the
   * other is shown computed. `discountValue` "" = no discount.
   */
  discountType: z.enum(["PERCENT", "AMOUNT"]),
  discountValue: decimalString,
  /** Part order of the chosen master stone code, used to rebuild the code when a part changes (not saved). */
  stonePartOrder: z.array(z.string()),
  photos: z.array(photoSchema).max(MAX_LINE_PHOTOS),
  itemNote: z.string(),
  /**
   * From Stock (memo-out rev 2, reserve rev 1, quotation rev 2): the Memo Stock item and the pending it was picked with
   * (the row's maximum). Typed rows and empty rows have none.
   */
  memoStockId: z.string().optional(),
  stockPendingPcs: z.string().optional(),
  stockPendingWeightCt: z.string().optional(),
});
export type QuotationLine = z.infer<typeof lineSchema>;

export const serviceChargeSchema = z.object({
  chargeId: z.string(),
  amount: decimalString,
});
export type ServiceChargeValue = z.infer<typeof serviceChargeSchema>;

/**
 * Fields every trade document form shares (quotation; memo out, memo out return ADR-0033): number/version,
 * dates, currency, lines and the summary. Each document adds its own party fields and status.
 */
export const tradeDocumentShape = {
  id: z.string().optional(),
  docNo: z.string().optional(),
  /** Server optimistic version of a saved document (SA-QT-09). */
  version: z.number().optional(),
  docDate: z.string().min(1, "Required"),
  dueDate: z.string().min(1, "Required"),
  currency: z.string().min(1, "Required"),
  exchangeRate: decimalString,
  ref: z.string().max(100, "Up to 100 characters"),
  lines: z.array(lineSchema),
  discount: z.object({
    enabled: z.boolean(),
    type: z.enum(["PERCENT", "AMOUNT"]),
    value: decimalString,
  }),
  tax: z.object({
    enabled: z.boolean(),
    /** อัตราภาษีเป็น % เช่น "7" */
    rate: decimalString,
    includeInPrice: z.boolean(),
  }),
  serviceCharges: z.array(serviceChargeSchema),
  labor: z.object({
    enabled: z.boolean(),
    work: z.string(),
    basis: z.enum(["PCS", "WEIGHT"]),
    qty: decimalString,
    rate: decimalString,
  }),
  documentNote: z.string().max(MAX_DOCUMENT_NOTE),
};

type TradeDocumentValues = z.infer<z.ZodObject<typeof tradeDocumentShape>>;

/** Due Date may not be before Doc Date (every transaction page; the server refuses it too, `before_doc_date`). */
export const DUE_BEFORE_DOC_MESSAGE = "Due date must be on or after doc date";

/** Cross-field rules every trade document form shares. */
export function tradeDocumentRules(value: TradeDocumentValues, ctx: z.RefinementCtx) {
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
}

/**
 * From Stock rows (Q-MO-10/11, Q-QTS-03/04): pcs or weight > 0, never above the pending they were picked with, and a
 * typed Sale Price. Typed rows are not checked here.
 */
export function stockLineRules(lines: readonly QuotationLine[], ctx: z.RefinementCtx) {
  lines.forEach((line, index) => {
    if (!isFilledLine(line) || !line.memoStockId) return;
    const issue = (field: "pcs" | "weightCt" | "unitPrice", message: string) => ctx.addIssue({ code: "custom", path: ["lines", index, field], message });
    const pcs = Number(line.pcs || 0);
    const weight = Number(line.weightCt || 0);
    if (pcs <= 0 && weight <= 0) issue("pcs", "Enter the quantity");
    if (pcs > Number(line.stockPendingPcs || 0)) issue("pcs", "More than pending");
    if (weight > Number(line.stockPendingWeightCt || 0)) issue("weightCt", "More than pending");
    if (Number(line.unitPrice || 0) <= 0) issue("unitPrice", "Enter the sale price");
  });
}

export const quotationSchema = z
  .object({
    ...tradeDocumentShape,
    statusReason: z.string().optional(),
    status: z.enum(QUOTATION_STATUSES),
    customerId: z.string().min(1, "Required"),
    shippingAddressId: z.string().min(1, "Required"),
    invoiceAddressId: z.string().min(1, "Required"),
  })
  .superRefine((value, ctx) => {
    tradeDocumentRules(value, ctx);
    // quotation rev 2 (ADR-0038): From Stock rows only copy the item; their quantity stays within its pending.
    stockLineRules(value.lines, ctx);
  });

export type QuotationFormValues = z.infer<typeof quotationSchema>;

/** แถวว่าง (ยังไม่ key ข้อมูล) ไม่นับใน validation และยอดรวม */
export function isFilledLine(line: QuotationLine): boolean {
  return Boolean(line.stockId || line.stoneCode || line.stone);
}
