import { z } from "zod";

/**
 * stock-card FE-SC-004/005/006 (SA revision 1 api-contract, ADR-0056): response schemas of
 * `/api/inventory/v1/stock-card`. Weights are decimal strings, pieces are integers. Unknown keys are dropped (the server
 * may add fields); `docType` stays an open string so a document type added later still renders.
 */
const weight = z.string().regex(/^-?\d+(\.\d+)?$/);
const text = z.string().nullable().optional().transform((value) => value ?? "");

const stoneAttrs = {
  stoneCode: text,
  stone: text,
  shape: text,
  size: text,
  color: text,
  clarity: text,
  cutting: text,
  quality: text,
};

const cardKey = z.string().regex(/^SC[0-9a-f]{32}$/);

export const optionsSchema = z.object({ locations: z.array(z.string()) });
export type StockCardOptions = z.infer<typeof optionsSchema>;

export const cardRowSchema = z.object({
  ...stoneAttrs,
  cardKey,
  location: text,
  lot: text,
  vendorName: text,
  vendorCount: z.number().int().min(0),
  balancePcs: z.number().int(),
  balanceWeightCt: weight,
});
export type CardRow = z.infer<typeof cardRowSchema>;

export const cardsPageSchema = z.object({
  items: z.array(cardRowSchema),
  total: z.number().int().min(0),
  page: z.number().int().min(1),
  pageSize: z.number().int().min(1),
  mode: z.enum(["CURRENT", "RANGE"]),
  asOf: z.string().nullable(),
});
export type CardsPage = z.infer<typeof cardsPageSchema>;

export const cardHeaderSchema = z.object({
  ...stoneAttrs,
  cardKey,
  location: text,
  lot: text,
  vendorName: text,
  vendorCount: z.number().int().min(0),
  currentBalancePcs: z.number().int(),
  currentBalanceWeightCt: weight,
});
export type CardHeader = z.infer<typeof cardHeaderSchema>;

export const txnSchema = z.object({
  id: z.string(),
  docType: z.string(),
  docTypeLabel: text,
  docId: z.string(),
  docNo: text,
  docDate: z.string(),
  stockId: z.string().nullable(),
  stockIdExtra: z.number().int().min(0),
  accountId: z.string().nullable().optional().transform((value) => value ?? null),
  accountName: text,
  inPcs: z.number().int().nullable(),
  inWeightCt: weight.nullable(),
  outPcs: z.number().int().nullable(),
  outWeightCt: weight.nullable(),
  balancePcs: z.number().int(),
  balanceWeightCt: weight,
});
export type Txn = z.infer<typeof txnSchema>;

export const totalsSchema = z.object({
  inPcs: z.number().int(),
  inWeightCt: weight,
  outPcs: z.number().int(),
  outWeightCt: weight,
  balancePcs: z.number().int(),
  balanceWeightCt: weight,
});
export type Totals = z.infer<typeof totalsSchema>;

export const transactionsPageSchema = z.object({
  items: z.array(txnSchema),
  total: z.number().int().min(0),
  page: z.number().int().min(1),
  pageSize: z.number().int().min(1),
  opening: z.object({ pcs: z.number().int(), weightCt: weight }),
  totals: totalsSchema,
});
export type TransactionsPage = z.infer<typeof transactionsPageSchema>;
