import type { Hono } from "hono";
import { AppError } from "../../../platform/errors";
import type { Db } from "../../../platform/db";
import { requireGrant } from "../../../platform/auth/principal";
import { parse, queryObject, type AppEnv } from "../../../platform/http";
import { readOptions } from "../../stock/card";
import { readValueCards, readValueHeader, readValueTransactions } from "../../stock/value";
import { STOCK_VALUE_CODES, ReportGuard, runReport, type ReportOptions } from "../guard";
import { cardKeyParam, valueCardsQuerySchema, valueTransactionsQuerySchema } from "./schemas";

/**
 * `/api/inventory/v1/stock-value*` (stock-value SA rev 1 api-contract.md, authorization.md): GET only, every route checks
 * `stock-value:VIEW` on the server before any query (`stock-card:VIEW` does not grant it), `Cache-Control: no-store` (platform
 * middleware). A malformed card key and an unknown one return the same 404 (no oracle). The guard is the ONE instance shared with
 * Stock Card (composition root), so both reports together keep at most two queries in flight.
 */
export type StockValueDeps = { db: Db; guard?: ReportGuard; statementTimeoutMs?: number };

export function registerStockValueRoutes(api: Hono<AppEnv>, deps: StockValueDeps) {
  const guard = deps.guard ?? new ReportGuard();
  const options = (extra: ReportOptions = {}): ReportOptions => ({ ...extra, codes: STOCK_VALUE_CODES, ...(deps.statementTimeoutMs ? { statementTimeoutMs: deps.statementTimeoutMs } : {}) });
  const cardKey = (value: string) => {
    if (!cardKeyParam(value)) throw new AppError(404, "STOCK_VALUE_NOT_FOUND");
    return value;
  };

  api.get("/stock-value/options", async (c) => {
    requireGrant(c.get("principal"), "stock-value", "VIEW");
    return c.json(await runReport(deps.db, guard, options(), (tx) => readOptions(tx)));
  });
  api.get("/stock-value/cards", async (c) => {
    requireGrant(c.get("principal"), "stock-value", "VIEW");
    const query = parse(valueCardsQuerySchema, queryObject(c));
    return c.json(await runReport(deps.db, guard, options(), (tx) => readValueCards(tx, query)));
  });
  api.get("/stock-value/cards/:cardKey", async (c) => {
    requireGrant(c.get("principal"), "stock-value", "VIEW");
    const key = cardKey(c.req.param("cardKey"));
    return c.json(await runReport(deps.db, guard, options(), (tx) => readValueHeader(tx, key)));
  });
  api.get("/stock-value/cards/:cardKey/transactions", async (c) => {
    requireGrant(c.get("principal"), "stock-value", "VIEW");
    const key = cardKey(c.req.param("cardKey"));
    const query = parse(valueTransactionsQuerySchema, queryObject(c));
    return c.json(await runReport(deps.db, guard, options({ isolation: "RepeatableRead" }), (tx) => readValueTransactions(tx, key, query)));
  });
}
