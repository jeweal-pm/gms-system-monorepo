import { z } from "zod";

/**
 * Inputs of the master internal API for backend-api-inventory (load-to-stock SA rev 1 api-contract "Master internal API",
 * ADR-0052 D3/D4/D10/D11, BE-LS-004/013). Every object is strict; bodies are ≤ 256 KiB (main.ts JSON parser).
 */

export const LOADABLE_PAGE_MAX = 50;
export const BATCH_MAX = 200;
export const SEARCH_TOTAL_CAP = 1_000;
export const DATE_RANGE_MAX_DAYS = 366;
export const CURSOR_MAX = 300;

const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/).refine((value) => {
  const date = new Date(`${value}T00:00:00Z`);
  return !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === value;
}, { params: { code: "invalid_date" } });

/** Weight: ≥ 0, ≤ 3 dp, as a decimal string (never a float). */
export const weightString = z.string().regex(/^\d{1,9}(\.\d{1,3})?$/);

const daysBetween = (from: string, to: string) => (Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / 86_400_000;

export const loadableSearchSchema = z.object({
  vendorId: z.uuid().optional(),
  q: z.string().trim().max(100).optional(),
  from: isoDate.optional(),
  to: isoDate.optional(),
  excludeLineIds: z.array(z.uuid()).max(BATCH_MAX).optional(),
  excludeAllocationOf: z.uuid().optional(),
  cursor: z.string().max(CURSOR_MAX).nullish(),
  limit: z.number().int().min(1).max(LOADABLE_PAGE_MAX).default(LOADABLE_PAGE_MAX),
}).strict().superRefine((value, ctx) => {
  if (value.from && value.to) {
    const days = daysBetween(value.from, value.to);
    if (days < 0) ctx.addIssue({ code: "custom", path: ["to"], params: { code: "before_from" }, message: "to < from" });
    else if (days > DATE_RANGE_MAX_DAYS) ctx.addIssue({ code: "custom", path: ["to"], params: { code: "range_too_long" }, message: "range > 366 days" });
  }
  if (value.excludeLineIds && new Set(value.excludeLineIds).size !== value.excludeLineIds.length) {
    ctx.addIssue({ code: "custom", path: ["excludeLineIds"], params: { code: "duplicate" }, message: "duplicate" });
  }
});
export type LoadableSearchInput = z.output<typeof loadableSearchSchema>;

export const vendorsQuerySchema = z.object({
  q: z.string().trim().max(100).optional(),
  cursor: z.string().max(CURSOR_MAX).optional(),
  limit: z.coerce.number().int().min(1).max(LOADABLE_PAGE_MAX).default(LOADABLE_PAGE_MAX),
}).strict();
export type VendorsQuery = z.output<typeof vendorsQuerySchema>;

export const lineBatchSchema = z.object({
  ids: z.array(z.uuid()).min(1).max(BATCH_MAX),
  excludeAllocationOf: z.uuid().optional(),
}).strict();
export type LineBatchInput = z.output<typeof lineBatchSchema>;

export const masterDataResolveSchema = z.object({
  stoneCodeIds: z.array(z.uuid()).max(BATCH_MAX),
  locationNames: z.array(z.string().min(1).max(40)).max(BATCH_MAX),
}).strict();
export type MasterDataResolveInput = z.output<typeof masterDataResolveSchema>;

/** Document Setup keys an inventory document may resolve (ADR-0052 D10; sale ADR-0054 D10 widens the allow-list). */
export const INVENTORY_NUMBERING_KEYS = ["load-to-stock", "sale"] as const;

export const numberingResolveSchema = z.object({
  transactionKey: z.enum(INVENTORY_NUMBERING_KEYS),
  docDate: isoDate,
  markUsed: z.boolean(),
}).strict();
export type NumberingResolveInput = z.output<typeof numberingResolveSchema>;

export const allocationLineSchema = z.object({
  purchaseLineId: z.uuid(),
  pcs: z.number().int().min(0).max(1_000_000_000),
  weightCt: weightString,
}).strict();

/** ADR-0052 D4: the load's full desired allocation (set semantics). An empty `lines` releases everything. */
export const allocationPutSchema = z.object({
  revision: z.number().int().min(1).max(2_000_000_000),
  vendorId: z.uuid(),
  lines: z.array(allocationLineSchema).max(BATCH_MAX),
  newStockIdCount: z.number().int().min(0).max(BATCH_MAX),
}).strict().superRefine((value, ctx) => {
  const seen = new Set<string>();
  value.lines.forEach((line, index) => {
    if (seen.has(line.purchaseLineId)) ctx.addIssue({ code: "custom", path: ["lines", index, "purchaseLineId"], params: { code: "duplicate" }, message: "duplicate" });
    seen.add(line.purchaseLineId);
    if (line.pcs === 0 && Number(line.weightCt) === 0) ctx.addIssue({ code: "custom", path: ["lines", index, "pcs"], params: { code: "too_small" }, message: "empty line" });
  });
});
export type AllocationPutInput = z.output<typeof allocationPutSchema>;

// ---------- sale SA rev 1 / ADR-0054 (BE-SL-002) ----------

export const SALE_LINES_MAX = 200;
const currencyCode = z.string().regex(/^[A-Z]{3}$/);

export const saleReferenceQuerySchema = z.object({ includeCustomerId: z.uuid().optional() }).strict();
export type SaleReferenceQuery = z.output<typeof saleReferenceQuerySchema>;

export const saleReserveLineSearchSchema = z.object({
  customerId: z.uuid(),
  currency: currencyCode,
  q: z.string().trim().max(100).optional(),
  from: isoDate.optional(),
  to: isoDate.optional(),
  exclude: z.array(z.uuid()).max(BATCH_MAX).default([]),
  cursor: z.string().max(CURSOR_MAX).nullish(),
  limit: z.number().int().min(1).max(LOADABLE_PAGE_MAX).default(LOADABLE_PAGE_MAX),
}).strict().superRefine((value, ctx) => {
  if (value.from && value.to && daysBetween(value.from, value.to) < 0) ctx.addIssue({ code: "custom", path: ["to"], params: { code: "before_from" }, message: "to < from" });
});
export type SaleReserveLineSearchInput = z.output<typeof saleReserveLineSearchSchema>;

export const salePrepareSchema = z.object({
  party: z.object({ customerId: z.uuid(), shippingAddressId: z.uuid(), invoiceAddressId: z.uuid(), keepCustomerId: z.uuid().optional() }).strict().optional(),
  currency: currencyCode,
  reserveLineIds: z.array(z.uuid()).max(SALE_LINES_MAX),
  memoStockIds: z.array(z.uuid()).max(SALE_LINES_MAX),
  saleId: z.uuid().optional(),
}).strict();
export type SalePrepareInput = z.output<typeof salePrepareSchema>;

export const saleConsumptionLineSchema = z.object({
  lineId: z.uuid(),
  source: z.enum(["RESERVE", "STOCK"]),
  reserveLineId: z.uuid().nullish(),
  memoStockId: z.uuid(),
  pcs: z.number().int().min(0).max(1_000_000_000),
  weightCt: weightString,
}).strict();

/** ADR-0054 D6: the Sale's full desired consumption (set semantics). An empty `lines` releases everything. */
export const saleConsumptionPutSchema = z.object({
  revision: z.number().int().min(1).max(2_000_000_000),
  saleDocNo: z.string().trim().min(1).max(40),
  customerId: z.uuid(),
  currency: currencyCode,
  lines: z.array(saleConsumptionLineSchema).max(SALE_LINES_MAX),
}).strict().superRefine((value, ctx) => {
  const issue = (path: (string | number)[], code: string) => ctx.addIssue({ code: "custom", path, params: { code }, message: code });
  const lineIds = new Set<string>();
  const reserveLines = new Set<string>();
  const stocks = new Set<string>();
  value.lines.forEach((line, index) => {
    if (lineIds.has(line.lineId)) issue(["lines", index, "lineId"], "duplicate");
    lineIds.add(line.lineId);
    if (line.source === "RESERVE") {
      if (!line.reserveLineId) issue(["lines", index, "reserveLineId"], "required");
      else if (reserveLines.has(line.reserveLineId)) issue(["lines", index, "reserveLineId"], "duplicate");
      else reserveLines.add(line.reserveLineId);
    } else {
      if (line.reserveLineId) issue(["lines", index, "reserveLineId"], "invalid");
      if (stocks.has(line.memoStockId)) issue(["lines", index, "memoStockId"], "duplicate");
      stocks.add(line.memoStockId);
    }
    if (line.pcs === 0 && Number(line.weightCt) === 0) issue(["lines", index, "pcs"], "too_small");
  });
});
export type SaleConsumptionPutInput = z.output<typeof saleConsumptionPutSchema>;
