import { z } from "zod";

/**
 * load-to-stock FE-LS-016: response schemas of the approved SA rev 1 api-contract (`/api/inventory/v1`). Money and
 * quantities are decimal strings; pcs are integers. Unknown keys are dropped (the server may add fields).
 */
const dec = z.string().regex(/^-?\d+(\.\d+)?$/);
const nullableText = z.string().nullable().optional().transform((value) => value ?? "");

export const STATUSES = ["DRAFT", "PENDING_APPROVAL", "REVISION_REQUESTED", "APPROVED", "REJECTED"] as const;
export const statusSchema = z.enum(STATUSES);
export type LoadStatus = z.infer<typeof statusSchema>;
export const MODES = ["NONE", "SPLIT", "MERGE"] as const;
export const modeSchema = z.enum(MODES);
export type LoadMode = z.infer<typeof modeSchema>;
export const priceUnitSchema = z.enum(["PER_CT", "PER_PCS"]);
export type PriceUnit = z.infer<typeof priceUnitSchema>;

export const stoneAttrsSchema = z.object({
  stoneCodeId: z.string().nullable(),
  stoneCode: nullableText,
  stone: nullableText,
  shape: nullableText,
  size: nullableText,
  color: nullableText,
  clarity: nullableText,
  cutting: nullableText,
  quality: nullableText,
  lot: nullableText,
  cerType: nullableText,
  cerNo: nullableText,
});
export type StoneAttrs = z.infer<typeof stoneAttrsSchema>;

export const purchaseLineRefSchema = stoneAttrsSchema.extend({
  purchaseLineId: z.string(),
  purchase: z.object({ id: z.string(), docNo: z.string(), docDate: z.string(), currency: z.string(), rate: dec }),
  location: nullableText,
  priceUnit: priceUnitSchema,
  unitPrice: dec,
  netUnitPrice: dec,
  unitCostBase: dec,
  pcs: z.number().int(),
  weightCt: dec,
  remainingPcs: z.number().int(),
  remainingWeightCt: dec,
  remainingAmountBase: dec,
  photoCount: z.number().int().min(0).max(5),
  itemNote: nullableText,
});
export type PurchaseLineRef = z.infer<typeof purchaseLineRefSchema>;

const stoneOptionPart = z.object({ name: z.string(), code: z.string() });
export const stoneLineOptionsSchema = z.object({
  codes: z.array(
    z.object({
      id: z.string(),
      code: z.string(),
      partOrder: z.unknown().optional(),
      stone: z.string(),
      shape: z.string(),
      size: z.string(),
      color: z.string(),
      clarity: z.string(),
      cutting: z.string(),
      quality: z.string(),
    }),
  ),
  stones: z.array(stoneOptionPart),
  shapes: z.array(stoneOptionPart),
  sizes: z.array(stoneOptionPart),
  colors: z.array(stoneOptionPart),
  clarities: z.array(stoneOptionPart),
  cuttings: z.array(stoneOptionPart),
  qualities: z.array(stoneOptionPart),
});
export type StoneLineOptions = z.infer<typeof stoneLineOptionsSchema>;

export const optionsSchema = z.object({
  /** null while Company Profile has no currency: Save is refused (VALIDATION_ERROR at `currency`). */
  companyCurrency: z.string().nullable(),
  stone: stoneLineOptionsSchema,
  locations: z.array(z.string()).max(500),
});
export type LoadOptions = z.infer<typeof optionsSchema>;

export const vendorSchema = z.object({ id: z.string(), code: z.string(), name: z.string() });
export type LoadVendor = z.infer<typeof vendorSchema>;
export const vendorsPageSchema = z.object({ items: z.array(vendorSchema), nextCursor: z.string().nullable() });

export const nextNumberSchema = z.object({ docNo: z.string() });

export const searchOutputSchema = z.object({ items: z.array(purchaseLineRefSchema), nextCursor: z.string().nullable(), total: z.number().int() });
export type SearchOutput = z.infer<typeof searchOutputSchema>;

const actorSchema = z.object({ at: z.string(), by: z.string() });
const approvalSchema = z.object({
  requireApproval: z.boolean(),
  autoApproved: z.boolean(),
  revisionCount: z.number().int(),
  submitted: z.object({ at: z.string(), by: z.string(), byName: z.string().nullable() }).nullable(),
  review: z.object({ action: z.enum(["REJECT", "REVISE"]), note: z.string(), at: z.string(), by: z.string(), byName: z.string().nullable() }).nullable(),
});

export const rowOutSchema = z.object({
  id: z.string(),
  position: z.number().int(),
  stockId: z.string().nullable(),
  sources: z.array(z.object({ purchaseLineId: z.string(), pcs: z.number().int(), weightCt: dec, costAmountBase: dec })),
  location: z.string(),
  parcel: nullableText,
  attrs: stoneAttrsSchema,
  stockPrice: dec,
  salePrice: dec,
  itemNote: nullableText,
  photoIds: z.array(z.string()).max(5),
  priceUnit: priceUnitSchema,
  pcs: z.number().int(),
  weightCt: dec,
  unitCostBase: dec,
  costAmountBase: dec,
});
export type RowOut = z.infer<typeof rowOutSchema>;

/** SA rev 2 (ADR-0052 D18): who holds stock of this load (≤ 5), for the in-use message. */
export const holderSchema = z.object({ documentType: z.string(), documentNo: z.string().nullable() });
export type LoadHolder = z.infer<typeof holderSchema>;

export const loadOutSchema = z.object({
  id: z.string(),
  docNo: z.string(),
  status: statusSchema,
  version: z.number().int(),
  docDate: z.string(),
  vendor: vendorSchema,
  currency: z.string(),
  ref: nullableText,
  documentNote: nullableText,
  mode: modeSchema,
  sources: z.array(purchaseLineRefSchema),
  rows: z.array(rowOutSchema),
  totals: z.object({ rowCount: z.number().int(), pcs: z.number().int(), weightCt: dec, costAmountBase: dec }),
  approval: approvalSchema,
  inUse: z.boolean(),
  holders: z.array(holderSchema).max(20).optional().transform((value) => value ?? []),
  syncing: z.boolean(),
  deleted: actorSchema.nullable(),
  created: actorSchema,
  updated: actorSchema,
});
export type LoadOut = z.infer<typeof loadOutSchema>;

export const listItemSchema = z.object({
  id: z.string(),
  docNo: z.string(),
  docDate: z.string(),
  status: statusSchema,
  reviewNote: z.string().nullable().optional(),
  vendorName: nullableText,
  rowCount: z.number().int(),
  totalPcs: z.number().int(),
  totalWeightCt: dec,
  autoApproved: z.boolean(),
  deleted: z.boolean(),
});
export type LoadListItem = z.infer<typeof listItemSchema>;
export const listPageSchema = z.object({ items: z.array(listItemSchema), nextCursor: z.string().nullable() });
export type LoadListPage = z.infer<typeof listPageSchema>;

export const writeResultSchema = z.object({
  id: z.string(),
  docNo: z.string().optional(),
  version: z.number().int(),
  status: statusSchema,
  stockIds: z.array(z.string().nullable()).optional(),
});
export type WriteResult = z.infer<typeof writeResultSchema>;
export const submitResultSchema = z.object({ id: z.string(), version: z.number().int(), status: statusSchema, submittedAt: z.string().optional() });
export const deleteResultSchema = z.object({ id: z.string(), version: z.number().int() });

export const photoIdSchema = z.object({ id: z.string() });
export const photoIdsSchema = z.object({ ids: z.array(z.string()).max(5) });

// ---- approval platform (FE-LS-009/011/014) ----

export const INVENTORY_APPROVAL_TYPES = ["load-to-stock", "merge-split", "stock-transfer-location"] as const;
export type InventoryApprovalType = (typeof INVENTORY_APPROVAL_TYPES)[number];

export const approvalSettingsSchema = z.object({
  items: z.array(
    z.object({
      type: z.string(),
      requireApproval: z.boolean(),
      version: z.number().int(),
      waitingCount: z.object({ pending: z.number().int(), revision: z.number().int() }).nullable().optional(),
    }),
  ),
});
export type InventoryApprovalSettings = z.infer<typeof approvalSettingsSchema>;
export const approvalSettingUpdateSchema = z.object({ type: z.string(), requireApproval: z.boolean(), version: z.number().int() });

export const approvalSummarySchema = z.object({ items: z.array(z.object({ type: z.string(), count: z.number().int() })), countCap: z.number().int() });
export type InventoryApprovalSummary = z.infer<typeof approvalSummarySchema>;

export const pendingItemSchema = z.object({
  id: z.string(),
  docNo: z.string(),
  docDate: z.string(),
  partyName: nullableText,
  submittedAt: z.string(),
  submittedByName: z.string().nullable(),
  totalPcs: z.number().int(),
  totalWeightCt: dec,
  valueBase: dec,
  revisionCount: z.number().int(),
  /** Not in SA rev 1 (version is read with `get` before an approve); taken when the server adds it. */
  version: z.number().int().optional(),
});
export type InventoryPendingItem = z.infer<typeof pendingItemSchema>;
export const pendingPageSchema = z.object({ items: z.array(pendingItemSchema), nextCursor: z.string().nullable() });

export const reviewResultSchema = z.object({ id: z.string(), version: z.number().int(), status: statusSchema, stockIds: z.array(z.string().nullable()).optional() });
