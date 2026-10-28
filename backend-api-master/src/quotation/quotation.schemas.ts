import { z } from "zod";

/**
 * quotation api-contract.md (SA quotation rev 1, SA-QT-06/07/08): strict inputs; the server re-checks
 * every bound the browser checks. Money/weight travel as decimal strings, never JS numbers.
 */
export const QUOTATION_STATUSES = ["DRAFT", "PENDING_APPROVAL", "APPROVED", "REJECTED", "CANCELLED"] as const;
export type QuotationStatus = (typeof QUOTATION_STATUSES)[number];
export const CHARGE_TYPES = ["SHIPPING", "HANDLING", "INSURANCE", "CERTIFICATE"] as const;
export const LINES_MAX = 200;
/** Owner 2026-10-26 (Figma "Up to 5 photos per item"). */
export const PHOTOS_PER_LINE_MAX = 5;
export const QUOTATION_LIST_LIMIT = 50;

/** Non-negative decimal string with at most `whole` integer digits and `scale` decimals. */
const decimal = (whole: number, scale: number) =>
  z.string().trim().regex(new RegExp(`^\\d{1,${whole}}(\\.\\d{1,${scale}})?$`));
const text = (max: number) => z.string().trim().max(max);
const isoDate = z.iso.date();
const uuid = z.uuid();

export const lineInputSchema = z.object({
  // Owner 2026-10-26: STOCK lines wait for the inventory service (SA-QT-07).
  source: z.literal("MANUAL"),
  stoneCodeId: uuid.nullable(),
  stoneCode: text(60),
  stone: text(60),
  shape: text(60),
  size: text(60),
  color: text(60),
  clarity: text(60),
  cutting: text(60),
  quality: text(60),
  lot: text(40),
  location: text(40),
  cerType: text(20),
  cerNo: text(60),
  pcs: z.number().int().min(0).max(999_999),
  weightCt: decimal(5, 3),
  priceUnit: z.enum(["PER_CT", "PER_PCS"]),
  unitPrice: decimal(16, 2),
  // Owner 2026-10-26: a per-line discount, either a percent or an amount (never both).
  discount: z.object({ type: z.enum(["NONE", "PERCENT", "AMOUNT"]), value: decimal(14, 4) }).strict(),
  itemNote: text(500),
  photoIds: z.array(uuid).max(PHOTOS_PER_LINE_MAX).refine((ids) => new Set(ids).size === ids.length, { params: { code: "duplicate" } }),
}).strict();

/**
 * Fields every trade document shares (quotation ADR-0032; memo out, memo out return ADR-0033): dates, currency,
 * lines and the summary. Each document adds its own party fields (and may narrow the lines).
 */
export const tradeDocumentFields = {
  docDate: isoDate,
  dueDate: isoDate,
  currency: z.string().regex(/^[A-Z]{3}$/),
  exchangeRate: decimal(12, 6).nullable(),
  ref: text(100),
  documentNote: text(500),
  lines: z.array(lineInputSchema).min(1).max(LINES_MAX),
  // DECIMAL(18,4): at most 14 integer digits.
  discount: z.object({ type: z.enum(["NONE", "PERCENT", "AMOUNT"]), value: decimal(14, 4) }).strict(),
  tax: z.object({ enabled: z.boolean(), rate: decimal(3, 4), includeInPrice: z.boolean() }).strict(),
  serviceCharges: z.array(z.object({ type: z.enum(CHARGE_TYPES), amount: decimal(16, 2) }).strict()).max(CHARGE_TYPES.length),
  labor: z.object({ work: text(120), basis: z.enum(["PCS", "WEIGHT"]), qty: decimal(15, 3), rate: decimal(16, 2) }).strict().nullable(),
};

const quotationFields = { ...tradeDocumentFields, customerId: uuid, shippingAddressId: uuid, invoiceAddressId: uuid };

type TradeDocumentValues = z.output<z.ZodObject<typeof tradeDocumentFields>>;

/** Cross-field rules every trade document shares, reported on their fields (`VALIDATION_ERROR`). */
export function tradeDocumentRules(value: TradeDocumentValues, ctx: z.RefinementCtx) {
  const issue = (path: (string | number)[], code: string) => ctx.addIssue({ code: "custom", path, params: { code }, message: code });
  if (value.dueDate < value.docDate) issue(["dueDate"], "before_doc_date");
  if (value.discount.type === "PERCENT" && Number(value.discount.value) > 100) issue(["discount", "value"], "too_big");
  if (Number(value.tax.rate) > 100) issue(["tax", "rate"], "too_big");
  if (value.exchangeRate !== null && Number(value.exchangeRate) <= 0) issue(["exchangeRate"], "too_small");
  value.lines.forEach((line, index) => {
    if (line.discount.type === "PERCENT" && Number(line.discount.value) > 100) issue(["lines", index, "discount", "value"], "too_big");
  });
  const types = value.serviceCharges.map((charge) => charge.type);
  if (new Set(types).size !== types.length) issue(["serviceCharges"], "duplicate");
}

export const createQuotationSchema = z.object(quotationFields).strict().superRefine(tradeDocumentRules);
export const updateQuotationSchema = z.object({ ...quotationFields, id: uuid, expectedVersion: z.number().int().min(1) }).strict().superRefine(tradeDocumentRules);
export const versionedIdSchema = z.object({ id: uuid, expectedVersion: z.number().int().min(1) }).strict();
export const reasonedIdSchema = z.object({ id: uuid, expectedVersion: z.number().int().min(1), reason: z.string().trim().min(1).max(500) }).strict();
export const nextNumberSchema = z.object({ docDate: isoDate }).strict();
export const quotationListSchema = z.object({
  q: z.string().trim().max(100).optional(),
  status: z.enum(QUOTATION_STATUSES).optional(),
  customerId: uuid.optional(),
  from: isoDate.optional(),
  to: isoDate.optional(),
  cursor: z.string().max(200).nullish(),
  limit: z.number().int().min(1).max(QUOTATION_LIST_LIMIT).default(QUOTATION_LIST_LIMIT),
}).strict();

export type QuotationInput = z.output<typeof createQuotationSchema>;
export type LineInput = z.output<typeof lineInputSchema>;
export type QuotationListInput = z.output<typeof quotationListSchema>;
