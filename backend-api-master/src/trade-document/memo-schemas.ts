import { z } from "zod";
import { LINES_MAX, decimal, lineInputSchema, tradeDocumentFields, tradeDocumentRules } from "../quotation/quotation.schemas";

/**
 * Inputs of memo out (customer + shipping/invoice address) and memo out return (vendor + address), ADR-0033:
 * the quotation trade-document fields and rules. Photos are not available on these documents yet, so a line
 * can't carry photo ids.
 */
const uuid = z.uuid();
const memoLineSchema = lineInputSchema.extend({ photoIds: z.array(uuid).max(0) });
const memoFields = { ...tradeDocumentFields, lines: z.array(memoLineSchema).min(1).max(LINES_MAX) };
const versioned = { id: uuid, expectedVersion: z.number().int().min(1) };

const memoOutFields = { ...memoFields, customerId: uuid, shippingAddressId: uuid, invoiceAddressId: uuid };
export const createMemoOutSchema = z.object(memoOutFields).strict().superRefine(tradeDocumentRules);
export const updateMemoOutSchema = z.object({ ...memoOutFields, ...versioned }).strict().superRefine(tradeDocumentRules);
export type MemoOutInput = z.output<typeof createMemoOutSchema>;

/**
 * memo-out-return UI rev 3 (owner 2026-10-28): a line carries its Outstanding quantity; pcs / weightCt are the
 * Return quantity (the only part the user edits) and may not exceed it.
 */
const returnLineSchema = memoLineSchema.extend({ outstandingPcs: z.number().int().min(0).max(999_999), outstandingWeightCt: decimal(5, 3) });
const memoOutReturnFields = { ...memoFields, lines: z.array(returnLineSchema).min(1).max(LINES_MAX), vendorId: uuid, addressId: uuid };
type ReturnValues = Omit<Parameters<typeof tradeDocumentRules>[0], "lines"> & { lines: z.output<typeof returnLineSchema>[] };
function returnRules(value: ReturnValues, ctx: z.RefinementCtx) {
  tradeDocumentRules(value, ctx);
  value.lines.forEach((line, index) => {
    const issue = (field: string) => ctx.addIssue({ code: "custom", path: ["lines", index, field], params: { code: "exceeds_outstanding" }, message: "exceeds_outstanding" });
    if (line.pcs > line.outstandingPcs) issue("pcs");
    if (Number(line.weightCt) > Number(line.outstandingWeightCt)) issue("weightCt");
  });
}
export const createMemoOutReturnSchema = z.object(memoOutReturnFields).strict().superRefine(returnRules);
export const updateMemoOutReturnSchema = z.object({ ...memoOutReturnFields, ...versioned }).strict().superRefine(returnRules);
export type MemoOutReturnInput = z.output<typeof createMemoOutReturnSchema>;

export const memoVersionedIdSchema = z.object(versioned).strict();
export const memoNextNumberSchema = z.object({ docDate: z.iso.date() }).strict();

/** Memo receive (memo-return SA rev 1): vendor + address, lines typed by hand (no photos yet). */
const memoReceiveFields = { ...memoFields, vendorId: uuid, addressId: uuid };
export const createMemoReceiveSchema = z.object(memoReceiveFields).strict().superRefine(tradeDocumentRules);
export const updateMemoReceiveSchema = z.object({ ...memoReceiveFields, ...versioned }).strict().superRefine(tradeDocumentRules);
export type MemoReceiveInput = z.output<typeof createMemoReceiveSchema>;

/**
 * Memo return (memo-return SA rev 1, owner 2026-10-29): each line names the memo receive line it sends back
 * (Memo Stock). The server copies the item fields, price and Outstanding quantity from that line on save; the user
 * keys in only the Return pcs / weightCt (≤ Outstanding) and the item note.
 */
const memoReturnLineSchema = returnLineSchema.extend({ sourceLineId: uuid });
const memoReturnFields = { ...memoFields, lines: z.array(memoReturnLineSchema).min(1).max(LINES_MAX), vendorId: uuid, addressId: uuid };
export const createMemoReturnSchema = z.object(memoReturnFields).strict().superRefine(returnRules);
export const updateMemoReturnSchema = z.object({ ...memoReturnFields, ...versioned }).strict().superRefine(returnRules);
export type MemoReturnInput = z.output<typeof createMemoReturnSchema>;

/** Memo Stock of a vendor in one currency: memo receive lines with a quantity still out. */
export const memoStockSchema = z.object({
  vendorId: uuid,
  currency: z.string().regex(/^[A-Z]{3}$/),
  q: z.string().trim().max(100).optional(),
  from: z.iso.date().optional(),
  to: z.iso.date().optional(),
  /** The memo return being edited: its own lines don't count as returned. */
  excludeReturnId: uuid.optional(),
}).strict();
export type MemoStockInput = z.output<typeof memoStockSchema>;
