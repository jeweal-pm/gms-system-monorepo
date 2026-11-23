import { describe, expect, it, vi } from "vitest";
import { InventoryApiError } from "@/lib/inventory-client";
import { retryTransient } from "@/lib/trpc-error";
import { CARD_MISSING, isCardMissing, isPermissionDenied, LIST_ERROR, loadErrorMessage, stockCardCalls, stockCardKeys, TXN_ERROR } from "@/features/stock-card/api";
import { parseListState, parseTxnState } from "@/features/stock-card/model";
import { cardHeaderSchema, cardsPageSchema, optionsSchema, transactionsPageSchema } from "@/features/stock-card/types";
import { controlledInventory, envelope } from "../load-to-stock/fixtures";
import { CARD_A, cardsPage, HEADER_A, KEY_A, txnPage } from "./fixtures";

/** UT-SC-08 (FE-SC-004/005/006): request building, bounds, response validation and error mapping of the Stock Card adapter. */
const params = (query: string) => new URLSearchParams(query);
const renew = vi.fn(async () => true);

describe("UT-SC-08 requests", () => {
  it("options: GET /api/inventory/v1/stock-card/options, cookie only", async () => {
    const server = controlledInventory(() => ({ body: { locations: ["Showroom", "Vault"] } }));
    await expect(stockCardCalls({ fetch: server.fetch, renew }).options()).resolves.toEqual({ locations: ["Showroom", "Vault"] });
    expect(server.calls[0]).toMatchObject({ method: "GET", path: "/api/inventory/v1/stock-card/options", credentials: "same-origin", body: undefined });
  });

  it("cards: only set filters, the sort, the page and one of the three page sizes", async () => {
    const server = controlledInventory(() => ({ body: cardsPage() }));
    const calls = stockCardCalls({ fetch: server.fetch, renew });
    await calls.cards(parseListState(params("")));
    await calls.cards(parseListState(params("q=ruby&location=Vault&from=2026-09-01&to=2026-09-30&sort=balancePcs&dir=desc&page=2&size=10")));
    expect(server.calls[0]).toMatchObject({ path: "/api/inventory/v1/stock-card/cards", query: { page: "1", pageSize: "25" } });
    expect(server.calls[1].query).toEqual({ q: "ruby", location: "Vault", from: "2026-09-01", to: "2026-09-30", sort: "balancePcs", dir: "desc", page: "2", pageSize: "10" });
  });

  it("an out-of-range page size or page in the URL never reaches the server", async () => {
    const server = controlledInventory(() => ({ body: cardsPage() }));
    await stockCardCalls({ fetch: server.fetch, renew }).cards(parseListState(params("size=1000&page=99999&sort=drop%20table")));
    expect(server.calls[0].query).toEqual({ page: "1", pageSize: "25" });
  });

  it("a reversed range is not sent", async () => {
    const server = controlledInventory(() => ({ body: cardsPage() }));
    await stockCardCalls({ fetch: server.fetch, renew }).cards(parseListState(params("from=2026-10-01&to=2026-09-01")));
    expect(server.calls[0].query).toEqual({ page: "1", pageSize: "25" });
  });

  it("header and transactions use the encoded card key and the detail sort keys", async () => {
    const server = controlledInventory((call) => ({ body: call.path.endsWith("/transactions") ? txnPage() : HEADER_A }));
    const calls = stockCardCalls({ fetch: server.fetch, renew });
    await calls.header(KEY_A);
    await calls.transactions(KEY_A, parseTxnState(params("q=MO&from=2026-09-01&sort=docNo&dir=desc&page=2&size=50&location=ignored")));
    expect(server.calls[0].path).toBe(`/api/inventory/v1/stock-card/cards/${KEY_A}`);
    expect(server.calls[1]).toMatchObject({ path: `/api/inventory/v1/stock-card/cards/${KEY_A}/transactions`, query: { q: "MO", from: "2026-09-01", sort: "docNo", dir: "desc", page: "2", pageSize: "50" } });
    await calls.header("a/b");
    expect(server.calls[2].path).toBe("/api/inventory/v1/stock-card/cards/a%2Fb");
  });

  it("query keys carry the whole state so a stale response is dropped by its key", () => {
    const a = parseListState(params("q=a"));
    const b = parseListState(params("q=b"));
    expect(stockCardKeys.list(a)).not.toEqual(stockCardKeys.list(b));
    expect(stockCardKeys.list(a)[0]).toBe("inventory");
    expect(stockCardKeys.txn(KEY_A, parseTxnState(params(""))).slice(0, 3)).toEqual(["inventory", "stock-card", "txn"]);
  });
});

describe("UT-SC-08 response validation", () => {
  it("accepts the contract shapes and drops unknown keys", () => {
    expect(cardsPageSchema.parse({ ...cardsPage(), extra: 1 })).not.toHaveProperty("extra");
    expect(cardHeaderSchema.parse(HEADER_A).currentBalanceWeightCt).toBe("0.620");
    expect(optionsSchema.parse({ locations: [] })).toEqual({ locations: [] });
    expect(transactionsPageSchema.parse(txnPage()).totals.balancePcs).toBe(3);
  });

  it("an unknown document type is accepted (open set); null text becomes empty", () => {
    const parsed = transactionsPageSchema.parse(txnPage([{ ...txnPage().items[2], docTypeLabel: null as unknown as string }]));
    expect(parsed.items[0]).toMatchObject({ docType: "stock-adjustment", docTypeLabel: "" });
  });

  it("a malformed answer is refused as INVALID_RESPONSE", async () => {
    const server = controlledInventory(() => ({ body: { items: [{ ...CARD_A, balanceWeightCt: "1,24" }], total: 1, page: 1, pageSize: 25, mode: "CURRENT", asOf: null } }));
    const error = await stockCardCalls({ fetch: server.fetch, renew }).cards(parseListState(params(""))).catch((caught: unknown) => caught);
    expect(error).toBeInstanceOf(InventoryApiError);
    expect((error as InventoryApiError).code).toBe("INVALID_RESPONSE");
    const badKey = controlledInventory(() => ({ body: cardsPage([{ ...CARD_A, cardKey: "x" }]) }));
    expect(await stockCardCalls({ fetch: badKey.fetch, renew }).cards(parseListState(params(""))).catch((caught: InventoryApiError) => caught.code)).toBe("INVALID_RESPONSE");
  });
});

describe("UT-SC-08 error mapping", () => {
  const fail = async (status: number, body?: unknown) => {
    const server = controlledInventory(() => ({ status, body }));
    return stockCardCalls({ fetch: server.fetch, renew: async () => false }).cards(parseListState(params(""))).catch((caught: unknown) => caught);
  };

  it("PERMISSION_DENIED shows the no-access text, not a banner", async () => {
    const error = await fail(403, envelope("PERMISSION_DENIED", { required: "stock-card:VIEW" }));
    expect(isPermissionDenied(error)).toBe(true);
    expect(isCardMissing(error)).toBe(false);
  });

  it("an unknown or malformed card key is the same not-found; the page says the card no longer exists", async () => {
    const error = await fail(404, envelope("STOCK_CARD_NOT_FOUND"));
    expect(isCardMissing(error)).toBe(true);
    expect(isCardMissing(await fail(404))).toBe(true);
    expect(isCardMissing(await fail(500, envelope("INTERNAL_ERROR")))).toBe(false);
    expect(CARD_MISSING).toBe("This stock card no longer exists.");
  });

  it("banner texts name the cause without ids, SQL or stack", async () => {
    expect(loadErrorMessage(await fail(500, envelope("INTERNAL_ERROR")))).toBe(LIST_ERROR);
    expect(loadErrorMessage(await fail(500, envelope("INTERNAL_ERROR")), TXN_ERROR)).toBe("Couldn't load transactions.");
    expect(loadErrorMessage(await fail(422, envelope("STOCK_CARD_TOO_LARGE", { entries: 6000, limit: 5000 })))).toBe("Too many transactions; narrow the date range.");
    expect(loadErrorMessage(await fail(503, envelope("STOCK_CARD_TIMEOUT")))).toBe("Took too long. Narrow the date range or search.");
    expect(loadErrorMessage(await fail(503, envelope("STOCK_CARD_BUSY")))).toBe("The report is busy right now. Try again in a moment.");
    expect(loadErrorMessage(await fail(422, envelope("VALIDATION_ERROR")))).toBe("Some filters aren't valid. Check them and try again.");
    expect(loadErrorMessage(await fail(401, envelope("UNAUTHENTICATED")))).toBe("Your session has ended. Sign in again.");
    expect(loadErrorMessage(await fail(503, envelope("AUTH_UNAVAILABLE")))).toBe("Couldn't check your access right now. Try again.");
    expect(loadErrorMessage(await fail(403, envelope("LICENSE_DENIED")))).toBe("Your license doesn't allow this page right now.");
    expect(loadErrorMessage(await fail(502))).toBe("Couldn't load Stock Card. The inventory service can't be reached.");
    const text = loadErrorMessage(await fail(500, envelope("INTERNAL_ERROR", { requestId: "req-9" })));
    expect(text).not.toMatch(/req-|SQL|stack/i);
  });

  it("reads retry only transient failures (no 4xx)", async () => {
    expect(retryTransient(0, await fail(404, envelope("STOCK_CARD_NOT_FOUND")))).toBe(false);
    expect(retryTransient(0, await fail(403, envelope("PERMISSION_DENIED")))).toBe(false);
    expect(retryTransient(0, await fail(503, envelope("STOCK_CARD_BUSY")))).toBe(true);
    expect(retryTransient(2, await fail(503, envelope("STOCK_CARD_BUSY")))).toBe(false);
  });
});
