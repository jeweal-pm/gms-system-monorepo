import { z } from "zod";
import { DUE_BEFORE_DOC_MESSAGE, isFilledLine, lineSchema, serviceChargeSchema } from "@/features/quotation/schema";

/** Memo Receive (ADR-0033, ADR-0034): lines, discounts and totals use the Quotation shape (D6, rev 2). */
export const MEMO_RECEIVE_STATUSES = ["PENDING_APPROVAL", "APPROVED"] as const;
export type MemoReceiveStatus = (typeof MEMO_RECEIVE_STATUSES)[number];

export const MAX_MEMO_NOTE = 250;
export const MAX_MEMO_LINES = 100;
export const MAX_REF = 100;

const decimalString = z.string().regex(/^\d*(\.\d*)?$/, "Invalid number");

export const memoReceiveSchema = z
  .object({
    id: z.string().optional(),
    docNo: z.string().optional(),
    status: z.enum(MEMO_RECEIVE_STATUSES).optional(),
    /** Server optimistic version of a saved document (SA rev 1). */
    version: z.number().optional(),
    docDate: z.string().min(1, "Required"),
    dueDate: z.string().min(1, "Required"),
    vendorId: z.string().min(1, "Required"),
    addressId: z.string().min(1, "Required"),
    currency: z.string().min(1, "Required"),
    exchangeRate: decimalString,
    ref: z.string().max(MAX_REF, `Up to ${MAX_REF} characters`),
    lines: z.array(lineSchema).max(MAX_MEMO_LINES, `Up to ${MAX_MEMO_LINES} rows`),
    /** Document discount as on Quotation (owner 2026-10-28, rev 2). */
    discount: z.object({ enabled: z.boolean(), type: z.enum(["PERCENT", "AMOUNT"]), value: decimalString }),
    tax: z.object({ enabled: z.boolean(), rate: decimalString, includeInPrice: z.boolean() }),
    serviceCharges: z.array(serviceChargeSchema),
    labor: z.object({ enabled: z.boolean(), work: z.string(), basis: z.enum(["PCS", "WEIGHT"]), qty: decimalString, rate: decimalString }),
    documentNote: z.string().max(MAX_MEMO_NOTE),
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

export type MemoReceiveFormValues = z.infer<typeof memoReceiveSchema>;

/** Pending documents can still be edited, deleted or approved; an approved one is read-only (rev 3, Q-MR-12). */
export const isEditableMemo = (status: MemoReceiveStatus | undefined) => status !== "APPROVED";
