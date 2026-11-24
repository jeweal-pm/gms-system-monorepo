import { z } from "zod";
import { date, dir, page, pageSize, range, text } from "../stock-card/schemas";

/**
 * Query schemas of Stock Value (stock-value api-contract.md "Types"): Stock Card's strict query (unknown keys refused, numbered
 * paging, `YYYY-MM-DD`, `from <= to`, `q` <= 100) with the value sorts added: `price`, `amount`, `profitLoss` on the list and
 * `profitLoss` on the detail.
 */
export { cardKeyParam } from "../stock-card/schemas";

export const valueCardsQuerySchema = z.object({
  q: text(100), location: text(40), from: date, to: date,
  sort: z.enum(["stoneCode", "location", "lot", "balancePcs", "balanceWeightCt", "price", "amount", "profitLoss"]).default("stoneCode"), dir, page, pageSize,
}).strict().superRefine(range);

export const valueTransactionsQuerySchema = z.object({
  q: text(100), from: date, to: date, sort: z.enum(["date", "docNo", "stockId", "account", "profitLoss"]).default("date"), dir, page, pageSize,
}).strict().superRefine(range);
