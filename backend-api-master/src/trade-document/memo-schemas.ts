import { z } from "zod";
import { Prisma } from "../generated/prisma/client";
import { lineAmount, lineGross } from "../quotation/quotation.calculate";
import { LINES_MAX, decimal, lineInputSchema, tradeDocumentFields, tradeDocumentRules } from "../quotation/quotation.schemas";
import { documentListFields } from "./document-engine";

/**
 * Inputs of memo out and memo out return (both customer + shipping/invoice address since memo-out-return rev 4), ADR-0033:
 * the quotation trade-document fields and rules. Photos are not available on these documents yet, so a line
 * can't carry photo ids.
 */
const uuid = z.uuid();
const memoLineSchema = lineInputSchema.extend({ photoIds: z.array(uuid).max(0) });
const memoFields = { ...tradeDocumentFields, lines: z.array(memoLineSchema).min(1).max(LINES_MAX) };
const versioned = { id: uuid, expectedVersion: z.number().int().min(1) };

/**
 * memo-out SA revision 2 (SA-MO-12/13, owner 2026-10-31): a line may name a Memo Stock item (From Stock). Such a stock
 * line needs pcs or weight > 0 and a Sale Price > 0 (Q-MO-10/11), and an item appears once per document. The server
 * checks pending and copies the item fields on save. Since memo-out rev 3 every line needs `memoStockId` (no manual
 * lines); manual lines stored before it stay readable and cut nothing.
 */
const memoOutLineSchema = memoLineSchema.extend({ memoStockId: uuid.nullish() });
const memoOutFields = { ...memoFields, lines: z.array(memoOutLineSchema).min(1).max(LINES_MAX), customerId: uuid, shippingAddressId: uuid, invoiceAddressId: uuid };
type MemoOutValues = Omit<Parameters<typeof tradeDocumentRules>[0], "lines"> & { lines: z.output<typeof memoOutLineSchema>[] };
function memoOutRules(value: MemoOutValues, ctx: z.RefinementCtx) {
  tradeDocumentRules(value, ctx);
  const issue = (path: (string | number)[], code: string) => ctx.addIssue({ code: "custom", path, params: { code }, message: code });
  const seen = new Set<string>();
  value.lines.forEach((line, index) => {
    // memo-out rev 3 (owner 2026-10-31, Q-MOR-13): every row comes from From Stock; rows can't be keyed in by hand.
    if (!line.memoStockId) return issue(["lines", index, "memoStockId"], "required");
    if (seen.has(line.memoStockId)) issue(["lines", index, "memoStockId"], "duplicate");
    seen.add(line.memoStockId);
    if (line.pcs <= 0 && Number(line.weightCt) <= 0) issue(["lines", index, "pcs"], "required");
    if (Number(line.unitPrice) <= 0) issue(["lines", index, "unitPrice"], "required");
  });
}
export const createMemoOutSchema = z.object(memoOutFields).strict().superRefine(memoOutRules);
export const updateMemoOutSchema = z.object({ ...memoOutFields, ...versioned }).strict().superRefine(memoOutRules);
export type MemoOutInput = z.output<typeof createMemoOutSchema>;

/**
 * memo-out-return UI rev 3 (owner 2026-10-28): a line carries its Outstanding quantity; pcs / weightCt are the
 * Return quantity (the only part the user edits) and may not exceed it.
 */
const returnLineSchema = memoLineSchema.extend({ outstandingPcs: z.number().int().min(0).max(999_999), outstandingWeightCt: decimal(5, 3) });
/**
 * memo-out-return SA rev 2 (owner 2026-10-31, SA-MOR-11/13/16): the customer + Shipping / Invoice address of Memo Out,
 * and each line names the approved Memo Out From Stock line it brings back, once per document, with pcs or weight > 0.
 * The server copies the item fields, price and Outstanding from that line on save.
 */
const memoOutReturnLineSchema = returnLineSchema.extend({ memoOutLineId: uuid });
const memoOutReturnFields = { ...memoFields, lines: z.array(memoOutReturnLineSchema).min(1).max(LINES_MAX), customerId: uuid, shippingAddressId: uuid, invoiceAddressId: uuid };
type ReturnValues = Omit<Parameters<typeof tradeDocumentRules>[0], "lines"> & { lines: z.output<typeof returnLineSchema>[] };
function returnRules(value: ReturnValues, ctx: z.RefinementCtx) {
  tradeDocumentRules(value, ctx);
  value.lines.forEach((line, index) => {
    const issue = (field: string) => ctx.addIssue({ code: "custom", path: ["lines", index, field], params: { code: "exceeds_outstanding" }, message: "exceeds_outstanding" });
    if (line.pcs > line.outstandingPcs) issue("pcs");
    if (Number(line.weightCt) > Number(line.outstandingWeightCt)) issue("weightCt");
  });
}
function memoOutReturnRules(value: Omit<ReturnValues, "lines"> & { lines: z.output<typeof memoOutReturnLineSchema>[] }, ctx: z.RefinementCtx) {
  returnRules(value, ctx);
  const seen = new Set<string>();
  value.lines.forEach((line, index) => {
    const issue = (field: string, code: string) => ctx.addIssue({ code: "custom", path: ["lines", index, field], params: { code }, message: code });
    if (seen.has(line.memoOutLineId)) issue("memoOutLineId", "duplicate");
    seen.add(line.memoOutLineId);
    if (line.pcs <= 0 && Number(line.weightCt) <= 0) issue("pcs", "required");
  });
}
export const createMemoOutReturnSchema = z.object(memoOutReturnFields).strict().superRefine(memoOutReturnRules);
export const updateMemoOutReturnSchema = z.object({ ...memoOutReturnFields, ...versioned }).strict().superRefine(memoOutReturnRules);
export type MemoOutReturnInput = z.output<typeof createMemoOutReturnSchema>;

export const memoVersionedIdSchema = z.object(versioned).strict();
export const memoNextNumberSchema = z.object({ docDate: z.iso.date() }).strict();

/**
 * memo-receive SA rev 1 / ADR-0034: the vendor fields of memo out return, lines without stone code id and location
 * (SA-MR-07). A line may carry the `id` of a saved line so it keeps its Stock ID (SA-MR-04). SA rev 2 (SA-MR-17): up to
 * 5 distinct photo ids per line in order, the quotation rule (the first is the main photo). Server discount bounds
 * (SA-MR-09): line % ≤ 100 (shared rule), line amount discount ≤ the line gross, document amount discount ≤ subtotal.
 */
const receiveLineSchema = memoLineSchema.omit({ stoneCodeId: true, location: true }).extend({ id: uuid.optional(), photoIds: lineInputSchema.shape.photoIds });
const memoReceiveFields = { ...memoFields, lines: z.array(receiveLineSchema).min(1).max(LINES_MAX), vendorId: uuid, addressId: uuid };
type ReceiveValues = z.output<z.ZodObject<typeof memoReceiveFields>>;
function receiveRules(value: ReceiveValues, ctx: z.RefinementCtx) {
  tradeDocumentRules(value as unknown as Parameters<typeof tradeDocumentRules>[0], ctx);
  const issue = (path: (string | number)[], code: string) => ctx.addIssue({ code: "custom", path, params: { code }, message: code });
  value.lines.forEach((line, index) => {
    if (line.discount.type === "AMOUNT" && new Prisma.Decimal(line.discount.value).greaterThan(lineGross(line))) issue(["lines", index, "discount", "value"], "exceeds_gross");
  });
  if (value.discount.type === "AMOUNT") {
    const subtotal = value.lines.reduce((total, line) => total.plus(lineAmount(line)), new Prisma.Decimal(0));
    if (new Prisma.Decimal(value.discount.value).greaterThan(subtotal)) issue(["discount", "value"], "exceeds_subtotal");
  }
  const ids = value.lines.flatMap((line) => (line.id ? [line.id] : []));
  if (new Set(ids).size !== ids.length) {
    const seen = new Set<string>();
    value.lines.forEach((line, index) => {
      if (!line.id) return;
      if (seen.has(line.id)) issue(["lines", index, "id"], "duplicate");
      seen.add(line.id);
    });
  }
}
export const createMemoReceiveSchema = z.object({ ...memoReceiveFields, lines: z.array(receiveLineSchema.omit({ id: true }).strict()).min(1).max(LINES_MAX) })
  .strict().superRefine((value, ctx) => receiveRules(value, ctx));
export const updateMemoReceiveSchema = z.object({ ...memoReceiveFields, ...versioned }).strict().superRefine(receiveRules);
export type MemoReceiveInput = z.output<typeof updateMemoReceiveSchema> extends infer U ? Omit<U, "id" | "expectedVersion"> : never;
export type MemoReceiveLineInput = z.output<typeof receiveLineSchema>;

export const MEMO_RECEIVE_STATUSES = ["PENDING_APPROVAL", "APPROVED"] as const;
export type MemoReceiveStatus = (typeof MEMO_RECEIVE_STATUSES)[number];
export const memoReceiveListSchema = z.object({ ...documentListFields, status: z.enum(MEMO_RECEIVE_STATUSES).optional() }).strict();
export type MemoReceiveListInput = z.output<typeof memoReceiveListSchema>;

/**
 * Memo return (memo-return SA rev 2, owner 2026-10-29): each line names the Memo Stock item it sends back. The server
 * copies the item fields, price and Outstanding (= pending) from that item on save; the user keys in only the Return
 * pcs / weightCt (≤ Outstanding) and the item note. Pending is reduced when the memo return is approved (Q-MR-15).
 */
const memoReturnLineSchema = returnLineSchema.extend({ memoStockId: uuid });
const memoReturnFields = { ...memoFields, lines: z.array(memoReturnLineSchema).min(1).max(LINES_MAX), vendorId: uuid, addressId: uuid };
export const createMemoReturnSchema = z.object(memoReturnFields).strict().superRefine(returnRules);
export const updateMemoReturnSchema = z.object({ ...memoReturnFields, ...versioned }).strict().superRefine(returnRules);
export type MemoReturnInput = z.output<typeof createMemoReturnSchema>;
/** Memo return and memo out (SA-MO-11) statuses are the memo receive ones: PENDING_APPROVAL → APPROVED. */
export const memoReturnListSchema = memoReceiveListSchema;
export const memoOutListSchema = memoReceiveListSchema;

/**
 * memoStock.list (SA-MR-11): a vendor's pending items for the Memo Return "Add Memo Stock" dialog. `from`/`to`
 * filter the memo receive Doc Date, from ≤ to, range ≤ 366 days. `currency` (memo-return SA rev 2) keeps the items a
 * memo return in that currency can take.
 */
const DAY_MS = 86_400_000;
function dateRange(value: { from?: string; to?: string }, ctx: z.RefinementCtx) {
  if (value.from && value.to) {
    const days = (Date.parse(value.to) - Date.parse(value.from)) / DAY_MS;
    if (days < 0) ctx.addIssue({ code: "custom", path: ["to"], params: { code: "before_from" }, message: "before_from" });
    else if (days > 366) ctx.addIssue({ code: "custom", path: ["to"], params: { code: "range_too_long" }, message: "range_too_long" });
  }
}
export const memoStockListSchema = z.object({
  /** Memo Return sends its vendor; Memo Out From Stock lists every vendor (SA-MO-15). */
  vendorId: uuid.optional(),
  currency: z.string().regex(/^[A-Z]{3}$/).optional(),
  q: z.string().trim().max(100).optional(),
  from: z.iso.date().optional(),
  to: z.iso.date().optional(),
  cursor: z.string().max(200).nullish(),
  /** Sent by tRPC infinite queries (the Add Memo Stock "Load more"); pages only go forward. */
  direction: z.enum(["forward", "backward"]).optional(),
  limit: z.number().int().min(1).max(50).default(50),
}).strict().superRefine(dateRange);
export type MemoStockListInput = z.output<typeof memoStockListSchema>;

/**
 * memoOutReturn.outstanding (SA-MOR-15): a customer's approved Memo Out From Stock lines not fully returned, in one
 * currency, for the Memo Out Return "Memo Outstanding" dialog. `from` / `to` filter the Memo Out Doc Date (≤ 366 days);
 * `excludeReturnId` leaves out the lines already in the return being edited.
 */
export const memoOutOutstandingSchema = z.object({
  customerId: uuid,
  currency: z.string().regex(/^[A-Z]{3}$/),
  q: z.string().trim().max(100).optional(),
  from: z.iso.date().optional(),
  to: z.iso.date().optional(),
  excludeReturnId: uuid.optional(),
  cursor: z.string().max(200).nullish(),
  direction: z.enum(["forward", "backward"]).optional(),
  limit: z.number().int().min(1).max(50).default(50),
}).strict().superRefine(dateRange);
export type MemoOutOutstandingInput = z.output<typeof memoOutOutstandingSchema>;
