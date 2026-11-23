import type { Hono } from "hono";
import { AppError } from "../../../platform/errors";
import type { Db } from "../../../platform/db";
import { requireGrant } from "../../../platform/auth/principal";
import { parse, queryObject, type AppEnv } from "../../../platform/http";
import { readCards, readHeader, readOptions, readTransactions } from "../../stock/card";
import { ReportGuard, runReport, type ReportOptions } from "./guard";
import { cardKeyParam, cardsQuerySchema, transactionsQuerySchema } from "./schemas";

/**
 * `/api/inventory/v1/stock-card*` (stock-card SA rev 1 api-contract.md, authorization.md): GET only, every route checks
 * `stock-card:VIEW` on the server before any query, `Cache-Control: no-store` (platform middleware). A malformed card key and an
 * unknown one return the same 404 (no oracle).
 */
export type StockCardDeps = { db: Db; guard?: ReportGuard; statementTimeoutMs?: number };

export function registerStockCardRoutes(api: Hono<AppEnv>, deps: StockCardDeps) {
  const guard = deps.guard ?? new ReportGuard();
  const options = (extra: ReportOptions = {}): ReportOptions => ({ ...extra, ...(deps.statementTimeoutMs ? { statementTimeoutMs: deps.statementTimeoutMs } : {}) });
  const cardKey = (value: string) => {
    if (!cardKeyParam(value)) throw new AppError(404, "STOCK_CARD_NOT_FOUND");
    return value;
  };

  api.get("/stock-card/options", async (c) => {
    requireGrant(c.get("principal"), "stock-card", "VIEW");
    return c.json(await runReport(deps.db, guard, options(), (tx) => readOptions(tx)));
  });
  api.get("/stock-card/cards", async (c) => {
    requireGrant(c.get("principal"), "stock-card", "VIEW");
    const query = parse(cardsQuerySchema, queryObject(c));
    return c.json(await runReport(deps.db, guard, options(), (tx) => readCards(tx, query)));
  });
  api.get("/stock-card/cards/:cardKey", async (c) => {
    requireGrant(c.get("principal"), "stock-card", "VIEW");
    const key = cardKey(c.req.param("cardKey"));
    return c.json(await runReport(deps.db, guard, options(), (tx) => readHeader(tx, key)));
  });
  api.get("/stock-card/cards/:cardKey/transactions", async (c) => {
    requireGrant(c.get("principal"), "stock-card", "VIEW");
    const key = cardKey(c.req.param("cardKey"));
    const query = parse(transactionsQuerySchema, queryObject(c));
    return c.json(await runReport(deps.db, guard, options({ isolation: "RepeatableRead" }), (tx) => readTransactions(tx, key, query)));
  });
}
