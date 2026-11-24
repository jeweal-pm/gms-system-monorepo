import { z } from "zod";
import { isoDate } from "../load-to-stock/schemas";

/**
 * Sale inputs (sale SA rev 1 api-contract "Shared types", ADR-0054 D3): strict objects, decimals as strings with scale
 * limits, 1–200 pick-only lines. The header money fields mirror master `tradeDocumentFields` / the Reserve input exactly
 * (`discount`, `tax {enabled, rate, includeInPrice}`, `serviceCharges [{type, amount}]`, `labor`), so the shared
 * QuotationInfoForm posts the same shape. Item fields, Stock ID, source document and caps come from master at Save.
 */
export const LINES_MAX = 200;
export const PAGE_MAX = 50;
export const PHOTOS_PER_LINE_MAX = 5;
export const EXCLUDE_MAX = 200;
/** As master `quotation.schemas.ts` CHARGE_TYPES (the options list comes from master `sale/reference`). */
export const CHARGE_TYPES = ["SHIPPING", "HANDLING", "INSURANCE", "CERTIFICATE"] as const;
/** STOCK = Memo Stock (name unchanged); OWN_STOCK = own stock loaded by Load to Stock (ADR-0058 D1). */
export const SOURCES = ["RESERVE", "STOCK", "OWN_STOCK"] as const;
export const STATUSES = ["DRAFT", "PENDING_APPROVAL", "REVISION_REQUESTED", "APPROVED", "REJECTED"] as const;
export type SaleSource = (typeof SOURCES)[number];
export type SaleStatus = (typeof STATUSES)[number];

/** Non-negative decimal string with at most `whole` integer digits and `scale` decimals. */
const decimal = (whole: number, scale: number) => z.string().trim().regex(new RegExp(`^\\d{1,${whole}}(\\.\\d{1,${scale}})?$`), { error: "invalid_decimal" });
const text = (max: number) => z.string().trim().max(max);
const uuid = z.uuid();
const discountSchema = z.object({ type: z.enum(["NONE", "PERCENT", "AMOUNT"]), value: decimal(14, 4) }).strict();

export const saleLineSchema = z.object({
  id: uuid.optional(),
  source: z.enum(SOURCES),
  reserveLineId: uuid.optional(),
  memoStockId: uuid.optional(),
  /** lot-based-stock (ADR-0055 D4): a From Stock line names a lot: Memo Stock (prefix M, source STOCK) or own stock (prefix O, source OWN_STOCK); item ids stay for stored lines. */
  lotKey: z.string().regex(/^ML[0-9a-f]{32}$|^MS[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$|^OL[0-9a-f]{32}$|^OS[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/).optional(),
  pcs: z.number().int().min(0).max(999_999),
  weightCt: decimal(9, 3),
  unitPrice: decimal(16, 2),
  discount: discountSchema,
  itemNote: text(500).optional(),
  photoIds: z.array(uuid).max(PHOTOS_PER_LINE_MAX).refine((ids) => new Set(ids).size === ids.length, { params: { code: "duplicate" } }),
}).strict();
export type SaleLineInput = z.output<typeof saleLineSchema>;

const saleFields = {
  docDate: isoDate,
  dueDate: isoDate,
  customerId: uuid,
  shippingAddressId: uuid,
  invoiceAddressId: uuid,
  currency: z.string().regex(/^[A-Z]{3}$/),
  exchangeRate: decimal(12, 6).nullable(),
  ref: text(100).optional(),
  documentNote: text(250).optional(),
  discount: discountSchema,
  tax: z.object({ enabled: z.boolean(), rate: decimal(3, 4), includeInPrice: z.boolean() }).strict(),
  labor: z.object({ work: text(120), basis: z.enum(["PCS", "WEIGHT"]), qty: decimal(15, 3), rate: decimal(16, 2) }).strict().nullable(),
  serviceCharges: z.array(z.object({ type: z.enum(CHARGE_TYPES), amount: decimal(16, 2) }).strict()).max(CHARGE_TYPES.length),
  lines: z.array(saleLineSchema).min(1).max(LINES_MAX),
};

type SaleShape = z.output<z.ZodObject<typeof saleFields>>;

/** Cross-field rules (VALIDATION_ERROR on their fields): dates, discount / tax bounds, line shape, one line per reference. */
export function saleRules(value: SaleShape, ctx: z.RefinementCtx) {
  const issue = (path: (string | number)[], code: string) => ctx.addIssue({ code: "custom", path, params: { code }, message: code });
  if (value.dueDate < value.docDate) issue(["dueDate"], "before_doc_date");
  if (value.discount.type === "PERCENT" && Number(value.discount.value) > 100) issue(["discount", "value"], "too_big");
  if (Number(value.tax.rate) > 100) issue(["tax", "rate"], "too_big");
  if (value.exchangeRate !== null && Number(value.exchangeRate) <= 0) issue(["exchangeRate"], "too_small");
  const types = value.serviceCharges.map((charge) => charge.type);
  if (new Set(types).size !== types.length) issue(["serviceCharges"], "duplicate");
  const lineIds = new Set<string>();
  const reserveLines = new Set<string>();
  const stocks = new Set<string>();
  value.lines.forEach((line, index) => {
    if (line.id) {
      if (lineIds.has(line.id)) issue(["lines", index, "id"], "duplicate");
      lineIds.add(line.id);
    }
    if (line.source === "RESERVE") {
      if (!line.reserveLineId) issue(["lines", index, "reserveLineId"], "required");
      else if (reserveLines.has(line.reserveLineId)) issue(["lines", index, "reserveLineId"], "duplicate");
      else reserveLines.add(line.reserveLineId);
    } else if (line.source === "OWN_STOCK") {
      // ADR-0058 D1: an own-stock lot, never a Memo Stock item or a Reserve line.
      if (line.reserveLineId || line.memoStockId) issue(["lines", index, "reference"], "invalid");
      else if (!line.lotKey) issue(["lines", index, "reference"], "required");
      else if (!line.lotKey.startsWith("O")) issue(["lines", index, "reference"], "invalid");
      else if (stocks.has(line.lotKey)) issue(["lines", index, "reference"], "duplicate");
      else stocks.add(line.lotKey);
    } else {
      if (line.reserveLineId) issue(["lines", index, "reserveLineId"], "invalid");
      if (line.lotKey?.startsWith("O")) issue(["lines", index, "reference"], "invalid");
      const ref = line.memoStockId ?? line.lotKey;
      if (line.memoStockId && line.lotKey) issue(["lines", index, "reference"], "invalid");
      else if (!ref) issue(["lines", index, "memoStockId"], "required");
      else if (stocks.has(ref)) issue(["lines", index, line.memoStockId ? "memoStockId" : "reference"], "duplicate");
      else stocks.add(ref);
    }
    if (line.source === "RESERVE" && line.lotKey) issue(["lines", index, "reference"], "invalid");
    if (line.pcs <= 0 && Number(line.weightCt) <= 0) issue(["lines", index, "pcs"], "required");
    if (Number(line.unitPrice) <= 0) issue(["lines", index, "unitPrice"], "required");
    if (line.discount.type === "PERCENT" && Number(line.discount.value) > 100) issue(["lines", index, "discount", "value"], "too_big");
  });
}

export const saleInputSchema = z.object(saleFields).strict().superRefine(saleRules);
export const saleUpdateSchema = z.object({ ...saleFields, expectedVersion: z.number().int().min(1) }).strict().superRefine(saleRules);
export type SaleInput = z.output<typeof saleInputSchema>;

export const versionSchema = z.object({ expectedVersion: z.number().int().min(1) }).strict();
export const reviseSchema = z.object({ expectedVersion: z.number().int().min(1), note: z.string().trim().min(1).max(500) }).strict();
export const rejectSchema = z.object({ expectedVersion: z.number().int().min(1), reason: z.string().trim().min(1).max(500) }).strict();

export const listQuerySchema = z.object({
  status: z.enum(STATUSES).optional(),
  deleted: z.enum(["true", "false"]).optional(),
  q: z.string().trim().max(100).optional(),
  cursor: z.string().max(300).optional(),
  limit: z.coerce.number().int().min(1).max(PAGE_MAX).optional(),
}).strict();

export const optionsQuerySchema = z.object({ customerId: uuid.optional() }).strict();
export const nextNumberSchema = z.object({ docDate: isoDate }).strict();

/** `GET /sale/reserve-lines`: `exclude` as a comma list or repeated (≤ 200 ids). */
export const reserveLinesQuerySchema = z.object({
  customerId: uuid,
  currency: z.string().regex(/^[A-Z]{3}$/),
  q: z.string().trim().max(100).optional(),
  from: isoDate.optional(),
  to: isoDate.optional(),
  exclude: z.array(uuid).max(EXCLUDE_MAX).default([]),
  cursor: z.string().max(300).optional(),
  limit: z.coerce.number().int().min(1).max(PAGE_MAX).default(PAGE_MAX),
}).strict().superRefine((value, ctx) => {
  if (value.from && value.to && value.to < value.from) ctx.addIssue({ code: "custom", path: ["to"], params: { code: "before_from" }, message: "to < from" });
});

export const pendingQuerySchema = z.object({
  type: z.literal("sale"),
  q: z.string().trim().max(100).optional(),
  sort: z.enum(["submittedAt", "docNo", "party", "qty", "value"]).default("submittedAt"),
  dir: z.enum(["asc", "desc"]).default("asc"),
  cursor: z.string().max(300).optional(),
  limit: z.coerce.number().int().min(1).max(PAGE_MAX).default(PAGE_MAX),
}).strict();
