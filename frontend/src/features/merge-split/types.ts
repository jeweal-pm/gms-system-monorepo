import { z } from "zod";

/**
 * merge-split FE-MS-006: response schemas of the SA rev 1 api-contract (`/api/inventory/v1/merge-split`, ADR-0060).
 * Money and quantities are decimal strings; pcs are integers. Unknown keys are dropped (the server may add fields).
 */
const dec = z.string().regex(/^-?\d+(\.\d+)?$/);
const text = z.string().nullable().optional().transform((value) => value ?? "");

export const MS_STATUSES = ["DRAFT", "PENDING_APPROVAL", "REVISION_REQUESTED", "APPROVED", "REJECTED"] as const;
export const msStatusSchema = z.enum(MS_STATUSES);
export type MsStatus = z.infer<typeof msStatusSchema>;
/** Only Split and Merge (owner Q-MS-03: no None). */
export const MS_MODES = ["SPLIT", "MERGE"] as const;
export const msModeSchema = z.enum(MS_MODES);
export type MsMode = z.infer<typeof msModeSchema>;
export const priceUnitSchema = z.enum(["PER_CT", "PER_PCS"]);
export type PriceUnit = z.infer<typeof priceUnitSchema>;

/** Contract `Attrs` (Lot is a separate field). */
export const msAttrsSchema = z.object({
  stoneCodeId: z.string().nullable(),
  stoneCode: text,
  stone: text,
  shape: text,
  size: text,
  color: text,
  clarity: text,
  cutting: text,
  quality: text,
  cerType: text,
  cerNo: text,
});
export type MsAttrs = z.infer<typeof msAttrsSchema>;

/** `GET /merge-split/stock` row: one own Stock ID with its available on hand (Q-MS-01/02). */
export const ownStockRowSchema = z.object({
  stockUuid: z.string(),
  stockId: z.string(),
  lotKey: text,
  location: text,
  attrs: msAttrsSchema,
  lot: text,
  priceUnit: priceUnitSchema,
  unitCostBase: dec,
  availPcs: z.number().int(),
  availWeightCt: dec,
  costAmountBase: dec,
  stockPrice: dec,
  salePrice: dec,
  currency: text,
  photoCount: z.number().int().min(0).max(5),
  loadedFrom: z.object({ docNo: text, docDate: text }),
  syncing: z.boolean().optional().transform((value) => value ?? false),
});
export type OwnStockRow = z.infer<typeof ownStockRowSchema>;
export const ownStockPageSchema = z.object({ items: z.array(ownStockRowSchema), nextCursor: z.string().nullable() });

export const msOptionsSchema = z.object({
  companyCurrency: z.string().nullable(),
  locations: z.array(z.string()).max(500),
  numbering: z.object({ configured: z.boolean() }),
});
export type MsOptions = z.infer<typeof msOptionsSchema>;
export const msNextNumberSchema = z.object({ docNo: z.string() });

const approvalSchema = z.object({
  requireApproval: z.boolean(),
  autoApproved: z.boolean(),
  revisionCount: z.number().int(),
  submitted: z.unknown().nullable().optional(),
  review: z
    .object({ action: z.enum(["REVISE", "REJECT"]), note: z.string(), at: z.string().nullable(), by: z.string().nullable().optional(), byName: z.string().nullable() })
    .nullable()
    .optional()
    .transform((value) => value ?? null),
});

export const msSourceOutSchema = z.object({
  id: z.string(),
  key: z.string(),
  position: z.number().int(),
  stockUuid: z.string(),
  stockId: z.string(),
  location: text,
  attrs: msAttrsSchema,
  lot: text,
  priceUnit: priceUnitSchema,
  unitCostBase: dec,
  availPcs: z.number().int(),
  availWeightCt: dec,
  takeCostBase: dec,
  refDocNo: text,
  refDocDate: text,
});
export type MsSourceOut = z.infer<typeof msSourceOutSchema>;

export const msResultOutSchema = z.object({
  id: z.string(),
  position: z.number().int(),
  sourceKey: z.string().nullable(),
  attrs: msAttrsSchema,
  location: z.string(),
  lot: text,
  parcel: text,
  pcs: z.number().int(),
  weightCt: dec,
  stockPrice: dec,
  salePrice: dec,
  itemNote: text,
  photoIds: z.array(z.string()).max(5),
  priceUnit: priceUnitSchema,
  unitCostBase: dec,
  costAmountBase: dec,
  stockUuid: z.string().nullable(),
  stockId: z.string().nullable(),
  inUse: z.boolean(),
});
export type MsResultOut = z.infer<typeof msResultOutSchema>;

const totalsPart = z.object({ pcs: z.number().int(), weightCt: dec, costBase: dec });
export const msOutSchema = z.object({
  id: z.string(),
  docNo: z.string().nullable(),
  docDate: z.string(),
  mode: msModeSchema,
  ref: text,
  note: text,
  status: msStatusSchema,
  autoApproved: z.boolean(),
  version: z.number().int(),
  deleted: z.boolean(),
  sources: z.array(msSourceOutSchema),
  results: z.array(msResultOutSchema),
  totals: z.object({ source: totalsPart, result: totalsPart }),
  approval: approvalSchema,
});
export type MsOut = z.infer<typeof msOutSchema>;

export const msListItemSchema = z.object({
  id: z.string(),
  docNo: z.string().nullable(),
  docDate: z.string(),
  mode: msModeSchema,
  status: msStatusSchema,
  sourceCount: z.number().int(),
  resultCount: z.number().int(),
  autoApproved: z.boolean(),
  deleted: z.boolean(),
});
export type MsListItem = z.infer<typeof msListItemSchema>;
export const msListPageSchema = z.object({ items: z.array(msListItemSchema), nextCursor: z.string().nullable() });

export const msWriteResultSchema = z.object({
  id: z.string(),
  docNo: z.string().nullable().optional(),
  version: z.number().int(),
  status: msStatusSchema,
  stockIds: z.array(z.string().nullable()).optional(),
});
export type MsWriteResult = z.infer<typeof msWriteResultSchema>;
export const msActionResultSchema = z.object({ id: z.string(), version: z.number().int(), status: msStatusSchema.optional(), stockIds: z.array(z.string().nullable()).optional() });
export const msPhotoIdSchema = z.object({ fileId: z.string() });
export const msFileIdsSchema = z.object({ fileIds: z.array(z.string()).max(5) });
