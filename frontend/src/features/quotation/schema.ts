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
});
export type QuotationLine = z.infer<typeof lineSchema>;

export const serviceChargeSchema = z.object({
  chargeId: z.string(),
  amount: decimalString,
});
export type ServiceChargeValue = z.infer<typeof serviceChargeSchema>;

export const quotationSchema = z
  .object({
    id: z.string().optional(),
    docNo: z.string().optional(),
    /** Server optimistic version of a saved quotation (SA-QT-09). */
    version: z.number().optional(),
    statusReason: z.string().optional(),
    status: z.enum(QUOTATION_STATUSES),
    docDate: z.string().min(1, "Required"),
    dueDate: z.string().min(1, "Required"),
    customerId: z.string().min(1, "Required"),
    shippingAddressId: z.string().min(1, "Required"),
    invoiceAddressId: z.string().min(1, "Required"),
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
  })
  .superRefine((value, ctx) => {
    if (value.dueDate && value.docDate && value.dueDate < value.docDate) {
      ctx.addIssue({ code: "custom", path: ["dueDate"], message: "Due date must be on or after doc date" });
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

export type QuotationFormValues = z.infer<typeof quotationSchema>;

/** แถวว่าง (ยังไม่ key ข้อมูล) ไม่นับใน validation และยอดรวม */
export function isFilledLine(line: QuotationLine): boolean {
  return Boolean(line.stockId || line.stoneCode || line.stone);
}
