import { describe, expect, it, vi } from "vitest";
import { InventoryApiError } from "@/lib/inventory-client";
import { retryTransient } from "@/lib/trpc-error";
import { isCardMissing, isPermissionDenied, loadErrorMessage, stockValueCalls, stockValueKeys } from "@/features/stock-value/api";
import { CARD_MISSING, LIST_ERROR, parseListState, parseTxnState, TXN_ERROR } from "@/features/stock-value/model";
import { valueCardsPageSchema, valueHeaderSchema, valueTransactionsPageSchema } from "@/features/stock-value/types";
import { controlledInventory, envelope } from "../load-to-stock/fixtures";
import { HEADER_A, KEY_A, ROW_LAST_SALE, ROW_LIST, ROW_NO_PRICE, txnPage, valuePage } from "./fixtures";

/** UT-SV-10 (FE-SV-005): request building, bounds, response validation and error mapping of the Stock Value adapter. */
const params = (query: string) => new URLSearchParams(query);
const renew = vi.fn(async () => true);

describe("UT-SV-10 requests", () => {
  it("options: GET /api/inventory/v1/stock-value/options, cookie only", async () => {
    const server = controlledInventory(() => ({ body: { locations: ["Vault A"] } }));
    await expect(stockValueCalls({ fetch: server.fetch, renew }).options()).resolves.toEqual({ locations: ["Vault A"] });
    expect(server.calls[0]).toMatchObject({ method: "GET", path: "/api/inventory/v1/stock-value/options", credentials: "same-origin", body: undefined });
  });

  it("cards: only set filters, the sort, the page and one of the three page sizes", async () => {
    const server = controlledInventory(() => ({ body: valuePage() }));
    const calls = stockValueCalls({ fetch: server.fetch, renew });
    await calls.cards(parseListState(params("")));
    await calls.cards(parseListState(params("q=ruby&location=Vault&from=2026-09-01&to=2026-09-30&sort=profitLoss&dir=desc&page=2&size=10")));
    expect(server.calls[0]).toMatchObject({ path: "/api/inventory/v1/stock-value/cards", query: { page: "1", pageSize: "25" } });
    expect(server.calls[1].query).toEqual({ q: "ruby", location: "Vault", from: "2026-09-01", to: "2026-09-30", sort: "profitLoss", dir: "desc", page: "2", pageSize: "10" });
  });

  it("an out-of-range page size, page or sort in the URL never reaches the server; a reversed range is not sent", async () => {
    const server = controlledInventory(() => ({ body: valuePage() }));
    const calls = stockValueCalls({ fetch: server.fetch, renew });
    await calls.cards(parseListState(params("size=1000&page=99999&sort=drop%20table")));
    await calls.cards(parseListState(params("from=2026-10-01&to=2026-09-01")));
    expect(server.calls[0].query).toEqual({ page: "1", pageSize: "25" });
    expect(server.calls[1].query).toEqual({ page: "1", pageSize: "25" });
  });

  it("header and transactions use the encoded card key and the detail sort keys incl. profitLoss", async () => {
    const server = controlledInventory((call) => ({ body: call.path.endsWith("/transactions") ? txnPage() : HEADER_A }));
    const calls = stockValueCalls({ fetch: server.fetch, renew });
    await calls.header(KEY_A);
    await calls.transactions(KEY_A, parseTxnState(params("q=MO&sort=profitLoss&dir=desc&page=2&size=50&location=ignored")));
    expect(server.calls[0].path).toBe(`/api/inventory/v1/stock-value/cards/${KEY_A}`);
    expect(server.calls[1]).toMatchObject({ path: `/api/inventory/v1/stock-value/cards/${KEY_A}/transactions`, query: { q: "MO", sort: "profitLoss", dir: "desc", page: "2", pageSize: "50" } });
    await calls.header("a/b");
    expect(server.calls[2].path).toBe("/api/inventory/v1/stock-value/cards/a%2Fb");
  });

  it("query keys carry the whole state and sit under the inventory cache", () => {
    const a = parseListState(params("q=a"));
    const b = parseListState(params("q=b"));
    expect(stockValueKeys.list(a)).not.toEqual(stockValueKeys.list(b));
    expect(stockValueKeys.list(a).slice(0, 3)).toEqual(["inventory", "stock-value", "list"]);
    expect(stockValueKeys.txn(KEY_A, parseTxnState(params(""))).slice(0, 3)).toEqual(["inventory", "stock-value", "txn"]);
    expect(stockValueKeys.options()).not.toEqual(stockValueKeys.all);
  });
});

describe("UT-SV-10 response validation", () => {
  it("a list page keeps money as strings, the sources, the Last-sale reference and the totals", () => {
    const page = valueCardsPageSchema.parse(valuePage());
    expect(page.items[0]).toMatchObject({ price: "12500.0000", priceUnit: "CT", priceSource: "PRICE_LIST", amount: "15500.00", profitLoss: "5580.00" });
    expect(page.items[1].priceRef).toEqual({ docId: "0192", docNo: "SL2611003", docDate: "2026-11-12" });
    expect(page.items[2]).toMatchObject({ price: null, priceSource: "NONE", amount: null, profitLoss: null });
    expect(page.totals).toMatchObject({ amount: "59600.00", pricedCards: 2, unpricedCards: 1, noCostCards: 1 });
  });

  it("absent value fields mean no value; an unknown source or unit still renders; unknown keys are dropped", () => {
    const { price, priceUnit, priceSource, priceSourceLabel, priceRef, amount, profitLoss, ...bare } = ROW_LIST;
    void [price, priceUnit, priceSource, priceSourceLabel, priceRef, amount, profitLoss];
    const parsed = valueCardsPageSchema.parse({ ...valuePage([]), items: [{ ...bare, extra: 1 }, { ...ROW_LAST_SALE, priceSource: "CONTRACT", priceUnit: "KG" }] });
    expect(parsed.items[0]).toMatchObject({ price: null, priceSource: "NONE", priceRef: null, amount: null, profitLoss: null });
    expect(parsed.items[1]).toMatchObject({ priceSource: "CONTRACT", priceUnit: "KG" });
    expect("extra" in parsed.items[0]).toBe(false);
  });

  it("a total without Profit/Loss is null; a money value that is not a decimal is rejected", () => {
    expect(valueCardsPageSchema.parse(valuePage([ROW_NO_PRICE], { totals: { ...valuePage().totals, profitLoss: null } })).totals.profitLoss).toBeNull();
    expect(valueCardsPageSchema.safeParse(valuePage([{ ...ROW_LIST, amount: "15,500" }])).success).toBe(false);
    expect(valueCardsPageSchema.safeParse({ ...valuePage(), mode: "OTHER" }).success).toBe(false);
  });

  it("header and transactions carry the value fields, the valued opening and the closing totals", () => {
    expect(valueHeaderSchema.parse(HEADER_A)).toMatchObject({ amount: "15500.00", profitLoss: "5580.00", priceSource: "PRICE_LIST" });
    const page = valueTransactionsPageSchema.parse(txnPage());
    expect(page.opening).toEqual({ pcs: 0, weightCt: "0.000", amount: "0.00", profitLoss: "0.00" });
    expect(page.totals).toMatchObject({ balanceWeightCt: "0.720", amount: "9000.00", price: "12500.0000", priceSourceLabel: "Price list" });
    expect(page.items[0]).toMatchObject({ amount: "15500.00", profitLoss: "-47120.00" });
    expect(valueTransactionsPageSchema.parse({ ...txnPage(), opening: { pcs: 0, weightCt: "0.000" } }).opening.amount).toBeNull();
  });
});

describe("UT-SV-10 errors", () => {
  it("classifies permission and missing-card failures", () => {
    expect(isPermissionDenied(new InventoryApiError(403, "PERMISSION_DENIED", "no"))).toBe(true);
    expect(isCardMissing(new InventoryApiError(404, "STOCK_VALUE_NOT_FOUND", "no"))).toBe(true);
    expect(isCardMissing(new InventoryApiError(404, "SOMETHING", "no"))).toBe(true);
    expect(isCardMissing(new InventoryApiError(500, "INTERNAL", "no"))).toBe(false);
    expect(CARD_MISSING).toBe("This stock card no longer exists.");
  });

  it("banner texts never carry ids or stacks", () => {
    const message = (code: string, fallback?: string) => loadErrorMessage(new InventoryApiError(503, code, "raw server text"), fallback);
    expect(message("STOCK_VALUE_BUSY")).toBe("The report is busy right now. Try again in a moment.");
    expect(message("STOCK_VALUE_TIMEOUT")).toBe("Took too long. Narrow the date range or search.");
    expect(message("STOCK_VALUE_TOO_LARGE")).toBe("Too many transactions; narrow the date range.");
    expect(message("VALIDATION_ERROR")).toBe("Some filters aren't valid. Check them and try again.");
    expect(message("NETWORK_ERROR", TXN_ERROR)).toBe(`${TXN_ERROR} The inventory service can't be reached.`);
    expect(message("SOMETHING_ELSE")).toBe(LIST_ERROR);
    expect(message("SOMETHING_ELSE")).not.toContain("raw server text");
  });

  it("only transient failures are retried", () => {
    expect(retryTransient(0, new InventoryApiError(503, "STOCK_VALUE_BUSY", "busy"))).toBeTypeOf("boolean");
    expect(retryTransient(0, new InventoryApiError(403, "PERMISSION_DENIED", "no"))).toBe(false);
  });

  it("the server error envelope maps to the adapter error", async () => {
    const server = controlledInventory(() => ({ status: 404, body: envelope("STOCK_VALUE_NOT_FOUND") }));
    await expect(stockValueCalls({ fetch: server.fetch, renew }).header(KEY_A)).rejects.toMatchObject({ status: 404, code: "STOCK_VALUE_NOT_FOUND" });
  });
});
