import { z } from "zod";

/**
 * sale FE-SL-006: response schemas of the verified inventory contract (`document/apps/backend/inventory/sale/
 * api-contract.md`, "Implementation notes" 2026-11-19/20). Decimals are strings, pcs integers; unknown keys are dropped
 * so the server may add fields.
 */
const dec = z.string().regex(/^-?\d+(\.\d+)?$/);
const text = z.string().nullable().optional().transform((value) => value ?? "");

export const SALE_STATUSES = ["DRAFT", "PENDING_APPROVAL", "REVISION_REQUESTED", "APPROVED", "REJECTED"] as const;
export const saleStatusSchema = z.enum(SALE_STATUSES);
const priceUnit = z.enum(["PER_CT", "PER_PCS"]);
const discount = z.object({ type: z.enum(["NONE", "PERCENT", "AMOUNT"]), value: dec });

const address = z.object({ id: z.string(), type: z.string(), label: z.string(), isDefault: z.boolean() });
const customer = z.object({ id: z.string(), code: z.string(), name: z.string(), active: z.boolean(), currency: z.string().nullable(), addresses: z.array(address) }).passthrough();

/** `GET /sale/options`: master `sale/reference` unchanged (the Quotation options shape). */
export const saleOptionsSchema = z
  .object({
    customers: z.array(customer),
    currencies: z.array(z.unknown()).optional(),
    companyCurrency: z.string().nullable(),
    chargeTypes: z.array(z.unknown()).optional(),
    numbering: z.object({ configured: z.boolean() }).passthrough().optional(),
    stone: z.unknown(),
  })
  .passthrough();

export const nextNumberSchema = z.object({ docNo: z.string() });

export const saleListItemSchema = z.object({
  id: z.string(),
  docNo: z.string(),
  docDate: z.string(),
  status: saleStatusSchema,
  reviewNote: z.string().nullable().optional(),
  customerName: text,
  lineCount: z.number().int(),
  totalPcs: z.number().int(),
  totalWeightCt: dec,
  grandTotal: dec,
  currency: z.string(),
  autoApproved: z.boolean(),
  deleted: z.boolean().optional(),
});
export type SaleListItem = z.infer<typeof saleListItemSchema>;
export const saleListPageSchema = z.object({ items: z.array(saleListItemSchema), nextCursor: z.string().nullable() });

export const reserveLineRefSchema = z.object({
  reserveLineId: z.string(),
  reserveId: z.string(),
  reserveNo: z.string(),
  reserveDate: z.string(),
  dueDate: z.string(),
  memoStockId: text,
  stockId: text,
  lotKey: z.string().nullable().optional().transform((value) => value ?? ""),
  priceUnit,
  netUnitPrice: dec,
  openPcs: z.number().int(),
  openWeightCt: dec,
  openAmount: dec,
  stoneCode: text,
  stone: text,
  shape: text,
  size: text,
  color: text,
  clarity: text,
  cutting: text,
  quality: text,
  lot: text,
  location: text,
  cerType: text,
  cerNo: text,
});
export const reserveLinesPageSchema = z.object({ items: z.array(reserveLineRefSchema), nextCursor: z.string().nullable() });

export const saleLineOutSchema = z.object({
  id: z.string(),
  position: z.number().int(),
  source: z.enum(["RESERVE", "STOCK", "OWN_STOCK"]),
  reserveLineId: z.string().nullable(),
  memoStockId: text,
  stockId: text,
  lotKey: z.string().nullable().optional().transform((value) => value ?? ""),
  allocated: z.boolean().optional(),
  sourceDoc: z.object({ type: z.enum(["RESERVE", "MEMO_RECEIVE", "LOAD"]), id: z.string(), docNo: z.string() }),
  stoneCode: text,
  stone: text,
  shape: text,
  size: text,
  color: text,
  clarity: text,
  cutting: text,
  quality: text,
  lot: text,
  location: text,
  cerType: text,
  cerNo: text,
  priceUnit,
  pcs: z.number().int(),
  weightCt: dec,
  capPcs: z.number().int(),
  capWeightCt: dec,
  reservePrice: dec.nullable(),
  unitPrice: dec,
  discount,
  discountAmount: dec,
  amount: dec,
  itemNote: text,
  photoIds: z.array(z.string()),
});
export type SaleLineOut = z.infer<typeof saleLineOutSchema>;

export const saleOutSchema = z.object({
  id: z.string(),
  docNo: z.string(),
  status: saleStatusSchema,
  version: z.number().int(),
  docDate: z.string(),
  dueDate: z.string(),
  customerId: z.string(),
  customer: z.object({ code: text, name: text }),
  shippingAddressId: z.string().nullable(),
  invoiceAddressId: z.string().nullable(),
  currency: z.string(),
  exchangeRate: dec.nullable(),
  ref: text,
  documentNote: text,
  discount,
  tax: z.object({ enabled: z.boolean(), rate: dec, includeInPrice: z.boolean() }),
  labor: z.object({ work: z.string(), basis: z.enum(["PCS", "WEIGHT"]), qty: dec, rate: dec }).nullable(),
  serviceCharges: z.array(z.object({ type: z.string(), amount: dec })),
  lines: z.array(saleLineOutSchema),
  approval: z.object({
    requireApproval: z.boolean(),
    autoApproved: z.boolean(),
    revisionCount: z.number().int(),
    review: z.object({ action: z.enum(["REJECT", "REVISE"]), note: z.string(), at: z.string().nullable(), by: z.string(), byName: z.string().nullable() }).nullable(),
  }).passthrough(),
  flow: z.object({ canEdit: z.boolean(), canDelete: z.boolean(), canSubmit: z.boolean(), canRestore: z.boolean(), usedBy: z.string().nullable() }),
  syncing: z.boolean(),
  deleted: z.object({ at: z.string(), by: z.string() }).nullable(),
  totals: z.object({ grandTotal: dec }).passthrough(),
});
export type SaleOut = z.infer<typeof saleOutSchema>;

export const createResultSchema = z.object({ id: z.string(), docNo: z.string(), version: z.number().int(), status: saleStatusSchema });
export const writeResultSchema = z.object({ id: z.string(), version: z.number().int(), status: saleStatusSchema.optional() });
export const photoIdSchema = z.object({ id: z.string() });
