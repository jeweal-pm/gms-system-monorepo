import { z } from "zod";
import { LINES_MAX, lineInputSchema, tradeDocumentFields, tradeDocumentRules } from "../quotation/quotation.schemas";
import { documentListFields } from "../trade-document/document-engine";
import { discountBoundRules } from "../trade-document/memo-schemas";

/**
 * purchase SA rev 1 / ADR-0042 (api-contract.md "Input rules"): the Purchase Order header (vendor + address, SA-PO-07)
 * with lines that come from Memo Stock (STOCK), an approved PO line (PURCHASE_ORDER) or are keyed in (MANUAL). Strict:
 * unknown keys are refused. The server replaces every copied field of a picked line from the database (SA-PU-14); the
 * schema only enforces the shape rules below. Each refusal carries `{path, code}` (`required`, `not_allowed`, `duplicate`).
 */
const uuid = z.uuid();
export const PURCHASE_LINE_SOURCES = ["STOCK", "PURCHASE_ORDER", "MANUAL"] as const;
export type PurchaseLineSource = (typeof PURCHASE_LINE_SOURCES)[number];
export const MEMO_GROUPS = ["IN_STOCK", "SOLD"] as const;
export type MemoGroup = (typeof MEMO_GROUPS)[number];

const purchaseLineSchema = lineInputSchema.extend({
  id: uuid.optional(),
  source: z.enum(PURCHASE_LINE_SOURCES),
  memoStockId: uuid.nullish(),
  memoGroup: z.enum(MEMO_GROUPS).nullish(),
  purchaseOrderLineId: uuid.nullish(),
  // Q-PU-11: no photos in revision 1.
  photoIds: z.array(uuid).max(0),
}).strict();
const createLineSchema = purchaseLineSchema.omit({ id: true }).strict();

const purchaseFields = { ...tradeDocumentFields, lines: z.array(purchaseLineSchema).min(1).max(LINES_MAX), vendorId: uuid, addressId: uuid };
type PurchaseValues = z.output<z.ZodObject<typeof purchaseFields>>;

/** SA-PU-03 / D8 source rules, duplicates, quantities and price (api-contract "Input rules"). */
export function purchaseLineRules(value: Pick<PurchaseValues, "lines">, ctx: z.RefinementCtx) {
  const issue = (index: number, field: string, code: string) => ctx.addIssue({ code: "custom", path: ["lines", index, field], params: { code }, message: code });
  const memoKeys = new Set<string>();
  const poLines = new Set<string>();
  const lineIds = new Set<string>();
  value.lines.forEach((line, index) => {
    const needs = (field: "memoStockId" | "memoGroup" | "purchaseOrderLineId", wanted: boolean) => {
      const present = line[field] !== null && line[field] !== undefined;
      if (wanted && !present) issue(index, field, "required");
      if (!wanted && present) issue(index, field, "not_allowed");
    };
    needs("memoStockId", line.source === "STOCK");
    needs("memoGroup", line.source === "STOCK");
    needs("purchaseOrderLineId", line.source === "PURCHASE_ORDER");
    if (line.pcs <= 0 && Number(line.weightCt) <= 0) issue(index, "pcs", "required");
    if (Number(line.unitPrice) <= 0) issue(index, "unitPrice", "required");
    // D8 / R2-D-07: a picked line takes no line discount.
    if (line.source !== "MANUAL" && line.discount.type !== "NONE") issue(index, "discount", "not_allowed");
    if (line.source === "STOCK" && line.memoStockId && line.memoGroup) {
      const key = `${line.memoStockId}:${line.memoGroup}`;
      if (memoKeys.has(key)) issue(index, "memoStockId", "duplicate");
      memoKeys.add(key);
    }
    if (line.source === "PURCHASE_ORDER" && line.purchaseOrderLineId) {
      if (poLines.has(line.purchaseOrderLineId)) issue(index, "purchaseOrderLineId", "duplicate");
      poLines.add(line.purchaseOrderLineId);
    }
    if (line.id) {
      if (lineIds.has(line.id)) issue(index, "id", "duplicate");
      lineIds.add(line.id);
    }
  });
}

function purchaseRules(value: PurchaseValues, ctx: z.RefinementCtx) {
  tradeDocumentRules(value as unknown as Parameters<typeof tradeDocumentRules>[0], ctx);
  // The SA-MR-09 bounds read only the price fields every line has.
  discountBoundRules(value as unknown as Parameters<typeof discountBoundRules>[0], ctx);
  purchaseLineRules(value, ctx);
}

const versioned = { id: uuid, expectedVersion: z.number().int().min(1) };
/** `create` refuses `lines.N.id` (strict line without `id`), as Memo Receive does. */
export const createPurchaseSchema = z.object({ ...purchaseFields, lines: z.array(createLineSchema).min(1).max(LINES_MAX) })
  .strict().superRefine((value, ctx) => purchaseRules(value as PurchaseValues, ctx));
export const updatePurchaseSchema = z.object({ ...purchaseFields, ...versioned }).strict().superRefine(purchaseRules);
export type PurchaseInput = z.output<typeof updatePurchaseSchema> extends infer U ? Omit<U, "id" | "expectedVersion"> : never;
export type PurchaseLineInput = PurchaseInput["lines"][number];

export const purchaseVersionedIdSchema = z.object(versioned).strict();
export const purchaseNextNumberSchema = z.object({ docDate: z.iso.date() }).strict();
export const purchaseOptionsSchema = z.object({ vendorId: uuid.optional() }).strict();

export const PURCHASE_STATUSES = ["PENDING_APPROVAL", "APPROVED"] as const;
export type PurchaseStatus = (typeof PURCHASE_STATUSES)[number];

const DAY_MS = 86_400_000;
/** `from ≤ to` (`to` / `before_from`) and a range of ≤ 366 days (`to` / `range_too_long`). */
function dateRange(value: { from?: string; to?: string }, ctx: z.RefinementCtx) {
  if (!value.from || !value.to) return;
  const days = (Date.parse(value.to) - Date.parse(value.from)) / DAY_MS;
  if (days < 0) ctx.addIssue({ code: "custom", path: ["to"], params: { code: "before_from" }, message: "before_from" });
  else if (days > 366) ctx.addIssue({ code: "custom", path: ["to"], params: { code: "range_too_long" }, message: "range_too_long" });
}

/** SA-PU-16: the engine keyset list with status, vendor, dates (≤ 366 days) and search. */
export const purchaseListSchema = z.object({ ...documentListFields, status: z.enum(PURCHASE_STATUSES).optional() }).strict().superRefine(dateRange);
export type PurchaseListInput = z.output<typeof purchaseListSchema>;

const pickerFields = {
  vendorId: uuid,
  currency: z.string().regex(/^[A-Z]{3}$/),
  q: z.string().trim().max(100).optional(),
  from: z.iso.date().optional(),
  to: z.iso.date().optional(),
  cursor: z.string().max(200).nullish(),
  /** Sent by tRPC infinite queries; pages only go forward. */
  direction: z.enum(["forward", "backward"]).optional(),
  limit: z.number().int().min(1).max(50).default(50),
};
/** SA-PU-12 `purchase.memoStock`: vendor + currency, status ALL / SOLD / IN_STOCK, Memo Receive Doc Date range (D13). */
export const purchaseMemoStockSchema = z.object({ ...pickerFields, status: z.enum(["ALL", ...MEMO_GROUPS]).default("ALL") }).strict().superRefine(dateRange);
export type PurchaseMemoStockInput = z.output<typeof purchaseMemoStockSchema>;
/** SA-PU-13 `purchase.purchaseOrderLines`: vendor + currency, status ALL / OPEN / PARTLY_PURCHASED, PO Doc Date range. */
export const purchaseOrderLinesSchema = z.object({ ...pickerFields, status: z.enum(["ALL", "OPEN", "PARTLY_PURCHASED"]).default("ALL") }).strict().superRefine(dateRange);
export type PurchaseOrderLinesInput = z.output<typeof purchaseOrderLinesSchema>;
