import { z } from "zod";

/**
 * stock-transfer-location FE-STL-004 (ADR-0060, SA rev 1 api-contract `/api/inventory/v1/stock-transfer-location*`):
 * response schemas. Decimals are strings, pcs integers; unknown keys are dropped so the server may add fields.
 */
const dec = z.string().regex(/^-?\d+(\.\d+)?$/);
const text = z.string().nullable().optional().transform((value) => value ?? "");

export const TRANSFER_STATUSES = ["DRAFT", "PENDING_APPROVAL", "REVISION_REQUESTED", "APPROVED", "REJECTED"] as const;
export const transferStatusSchema = z.enum(TRANSFER_STATUSES);
export type TransferStatus = z.infer<typeof transferStatusSchema>;
export const priceUnitSchema = z.enum(["PER_CT", "PER_PCS"]);
export type PriceUnit = z.infer<typeof priceUnitSchema>;

export const stoneAttrsSchema = z.object({
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
export type StoneAttrs = z.infer<typeof stoneAttrsSchema>;

/** From Stock picker row: one own lot = one Stock ID (ADR-0055). */
export const stockLotSchema = z.object({
  stockUuid: z.string(),
  stockId: text,
  lotKey: text,
  refDocNo: text,
  refDocDate: text,
  location: text,
  priceUnit: priceUnitSchema,
  stockPrice: dec,
  currency: text,
  onHandPcs: z.number().int(),
  onHandWeightCt: dec,
  attrs: stoneAttrsSchema,
});
export type StockLot = z.infer<typeof stockLotSchema>;
export const stockLotPageSchema = z.object({ items: z.array(stockLotSchema), nextCursor: z.string().nullable() });
export type StockLotPage = z.infer<typeof stockLotPageSchema>;

export const optionsSchema = z.object({
  locations: z.array(z.string()),
  numbering: z.object({ configured: z.boolean() }).passthrough().optional(),
});
export type TransferOptions = z.infer<typeof optionsSchema>;

export const nextNumberSchema = z.object({ docNo: z.string() });

export const listItemSchema = z.object({
  id: z.string(),
  docNo: z.string().nullable().transform((value) => value ?? ""),
  docDate: z.string(),
  ref: text,
  status: transferStatusSchema,
  reviewNote: z.string().nullable().optional(),
  lineCount: z.number().int(),
  totalPcs: z.number().int(),
  totalWeightCt: dec,
  autoApproved: z.boolean(),
  deleted: z.boolean().optional(),
});
export type TransferListItem = z.infer<typeof listItemSchema>;
export const listPageSchema = z.object({ items: z.array(listItemSchema), nextCursor: z.string().nullable() });

const approvalSchema = z
  .object({
    requireApproval: z.boolean(),
    autoApproved: z.boolean(),
    revisionCount: z.number().int(),
    submitted: z.object({ at: z.string(), by: z.string(), byName: z.string().nullable() }).nullable().optional(),
    review: z.object({ action: z.enum(["REJECT", "REVISE"]), note: z.string(), at: z.string(), by: z.string(), byName: z.string().nullable() }).nullable(),
  })
  .passthrough();

export const lineOutSchema = z.object({
  id: z.string(),
  position: z.number().int(),
  fromStockUuid: z.string(),
  stockId: text,
  newStockId: z.string().nullable(),
  lotKey: text,
  refDocNo: text,
  fromLocation: text,
  toLocation: text,
  onHandPcs: z.number().int(),
  onHandWeightCt: dec,
  pcs: z.number().int(),
  weightCt: dec,
  priceUnit: priceUnitSchema,
  stockPrice: dec,
  currency: text,
  remark: text,
  attrs: stoneAttrsSchema,
});
export type TransferLineOut = z.infer<typeof lineOutSchema>;

export const transferOutSchema = z.object({
  id: z.string(),
  docNo: z.string().nullable(),
  docDate: z.string(),
  ref: text,
  note: text,
  status: transferStatusSchema,
  autoApproved: z.boolean(),
  version: z.number().int(),
  deleted: z.boolean(),
  approval: approvalSchema,
  lines: z.array(lineOutSchema),
});
export type TransferOut = z.infer<typeof transferOutSchema>;

export const createResultSchema = z.object({ id: z.string(), docNo: z.string().nullable().optional(), version: z.number().int(), status: transferStatusSchema });
export const writeResultSchema = z.object({ id: z.string(), version: z.number().int(), status: transferStatusSchema.optional(), submittedAt: z.string().optional() });
export type TransferWriteResult = z.infer<typeof writeResultSchema>;
