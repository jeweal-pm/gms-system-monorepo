import { z } from "zod";
import { cardHeaderSchema, cardRowSchema, optionsSchema, totalsSchema, txnSchema } from "@/features/stock-card/types";

/**
 * stock-value FE-SV-005 (SA revision 1 api-contract, ADR-0057): response schemas of `/api/inventory/v1/stock-value`.
 * Cards, header and transaction rows are the Stock Card shapes plus the value fields. Money is a decimal string the UI only
 * formats; unknown keys are dropped and the open enums (`priceSource`, `priceUnit`) stay strings so a value added by a newer
 * server still renders.
 */
const decimal = z.string().regex(/^-?\d+(\.\d+)?$/);
const nullableDecimal = decimal.nullable().optional().transform((value) => value ?? null);
const nullableText = z.string().nullable().optional().transform((value) => value ?? null);
const text = z.string().nullable().optional().transform((value) => value ?? "");

export const priceRefSchema = z
  .object({ docId: text, docNo: text, docDate: text })
  .nullable()
  .optional()
  .transform((value) => value ?? null);
export type PriceRef = z.output<typeof priceRefSchema>;

/** The value fields shared by list rows, the header, transaction rows and the detail totals. */
export const valuedShape = {
  price: nullableDecimal,
  priceUnit: nullableText,
  priceSource: z.string().nullable().optional().transform((value) => value ?? "NONE"),
  priceSourceLabel: nullableText,
  priceRef: priceRefSchema,
  amount: nullableDecimal,
  profitLoss: nullableDecimal,
};

export { optionsSchema };
export type StockValueOptions = z.infer<typeof optionsSchema>;

export const valueRowSchema = cardRowSchema.extend(valuedShape);
export type ValueRow = z.output<typeof valueRowSchema>;

export const valueTotalsSchema = z.object({
  balancePcs: z.number().int(),
  balanceWeightCt: decimal,
  amount: decimal,
  profitLoss: nullableDecimal,
  pricedCards: z.number().int().min(0),
  unpricedCards: z.number().int().min(0),
  noCostCards: z.number().int().min(0),
});
export type ValueTotals = z.output<typeof valueTotalsSchema>;

export const valueCardsPageSchema = z.object({
  items: z.array(valueRowSchema),
  total: z.number().int().min(0),
  page: z.number().int().min(1),
  pageSize: z.number().int().min(1),
  mode: z.enum(["CURRENT", "RANGE"]),
  asOf: z.string().nullable(),
  totals: valueTotalsSchema,
});
export type ValueCardsPage = z.output<typeof valueCardsPageSchema>;

export const valueHeaderSchema = cardHeaderSchema.extend(valuedShape);
export type ValueHeader = z.output<typeof valueHeaderSchema>;

export const valueTxnSchema = txnSchema.extend(valuedShape);
export type ValueTxn = z.output<typeof valueTxnSchema>;

export const valueTxnTotalsSchema = totalsSchema.extend(valuedShape);
export type ValueTxnTotals = z.output<typeof valueTxnTotalsSchema>;

export const valueTransactionsPageSchema = z.object({
  items: z.array(valueTxnSchema),
  total: z.number().int().min(0),
  page: z.number().int().min(1),
  pageSize: z.number().int().min(1),
  opening: z.object({ pcs: z.number().int(), weightCt: decimal, amount: nullableDecimal, profitLoss: nullableDecimal }),
  totals: valueTxnTotalsSchema,
});
export type ValueTransactionsPage = z.output<typeof valueTransactionsPageSchema>;

/** The price fields every valued record carries. */
export type Valued = Pick<ValueRow, "price" | "priceUnit" | "priceSource" | "priceSourceLabel" | "priceRef" | "amount" | "profitLoss">;
