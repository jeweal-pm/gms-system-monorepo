import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { stockValueCalls } from "@/features/stock-value/api";
import { listReturnHref } from "@/features/stock-value/components/back-link";
import { StockValueTable } from "@/features/stock-value/components/stock-value-table";
import { StockValueTransactionsTable } from "@/features/stock-value/components/stock-value-transactions-table";
import { activeListSort, cardName, pageToClamp, parseListState, parseTxnState, stateToSearch, stockValueHref, toggleSort, withFilters } from "@/features/stock-value/model";
import type { ValueRow, ValueTxn } from "@/features/stock-value/types";
import { DEFAULT_VIEW } from "@/features/stock-value/view-prefs";
import { controlledInventory, envelope } from "../load-to-stock/fixtures";
import { HEADER_A, KEY_A, KEY_B, LIST_TOTALS, ROW_LAST_SALE, ROW_LIST, ROW_NO_PRICE, TXN_LOAD, TXN_NEW_TYPE, TXN_OUT, TXN_TOTALS } from "./fixtures";

/**
 * IT-SV-01 (FE-SV-005/006/007/008): list -> open a card -> header and transactions against a typed in-memory service that
 * follows the SA revision 1 api-contract (paging, search, sort with nulls last, totals, 403 / 404). The live service check
 * follows once backend BE-SV-006 hands its verified contract over.
 */
const noop = () => {};
const renew = vi.fn(async () => true);

function rowFixture(index: number): ValueRow {
  return { ...ROW_LIST, stoneCode: `ST-${String(index).padStart(3, "0")}`, cardKey: `SC${index.toString(16).padStart(32, "0")}`, balancePcs: index, amount: `${index}00.00`, profitLoss: index % 2 ? `${index}.00` : null };
}

/** A tiny contract server: 60 cards plus the three named ones, one ledger for KEY_A. */
function contractServer(options: { denied?: boolean } = {}) {
  const cards = [ROW_LIST, ROW_LAST_SALE, ROW_NO_PRICE, ...Array.from({ length: 60 }, (_, index) => rowFixture(index + 1))];
  const ledger: ValueTxn[] = [TXN_LOAD, TXN_OUT, TXN_NEW_TYPE];
  return controlledInventory((call) => {
    if (options.denied) return { status: 403, body: envelope("PERMISSION_DENIED", { required: "stock-value:VIEW" }) };
    const base = "/api/inventory/v1/stock-value";
    if (call.path === `${base}/options`) return { body: { locations: ["Vault A", "Vault B"] } };
    if (call.path === `${base}/cards`) {
      const q = (call.query.q ?? "").toLowerCase();
      let rows = cards.filter((card) => (!call.query.location || card.location === call.query.location) && (!q || `${card.stoneCode} ${card.lot} ${card.vendorName}`.toLowerCase().includes(q)));
      if (call.query.sort === "profitLoss") {
        const sign = call.query.dir === "desc" ? -1 : 1;
        const valued = rows.filter((card) => card.profitLoss !== null).sort((a, b) => sign * (Number(a.profitLoss) - Number(b.profitLoss)));
        rows = [...valued, ...rows.filter((card) => card.profitLoss === null)];
      }
      const pageSize = Number(call.query.pageSize);
      const page = Number(call.query.page);
      return { body: { items: rows.slice((page - 1) * pageSize, page * pageSize), total: rows.length, page, pageSize, mode: call.query.from || call.query.to ? "RANGE" : "CURRENT", asOf: call.query.to ?? null, totals: LIST_TOTALS } };
    }
    const match = /\/cards\/([^/]+)(\/transactions)?$/.exec(call.path);
    if (!match || decodeURIComponent(match[1]) !== KEY_A) return { status: 404, body: envelope("STOCK_VALUE_NOT_FOUND") };
    if (!match[2]) return { body: HEADER_A };
    const q = (call.query.q ?? "").toLowerCase();
    const items = ledger.filter((txn) => !q || `${txn.docNo} ${txn.accountName}`.toLowerCase().includes(q));
    return { body: { items, total: items.length, page: 1, pageSize: 25, opening: { pcs: 0, weightCt: "0.000", amount: "0.00", profitLoss: "0.00" }, totals: TXN_TOTALS } };
  });
}

describe("IT-SV-01 list to card", () => {
  it("the list page loads 25 of 63 with the options and the server totals; page 3 holds the rest; each request is one bounded page", async () => {
    const server = contractServer();
    const calls = stockValueCalls({ fetch: server.fetch, renew });
    expect((await calls.options()).locations).toEqual(["Vault A", "Vault B"]);
    const first = await calls.cards(parseListState(new URLSearchParams("")));
    expect(first).toMatchObject({ total: 63, page: 1, pageSize: 25, mode: "CURRENT", asOf: null });
    expect(first.items).toHaveLength(25);
    expect(first.totals).toMatchObject({ amount: "59600.00", unpricedCards: 1, noCostCards: 1 });
    expect((await calls.cards(parseListState(new URLSearchParams("page=3")))).items).toHaveLength(13);
    for (const call of server.calls) expect(Number(call.query.pageSize ?? 25)).toBeLessThanOrEqual(50);
  });

  it("search, location and dates narrow the list and reset the page; a date makes it a RANGE read", async () => {
    const calls = stockValueCalls({ fetch: contractServer().fetch, renew });
    const state = withFilters(parseListState(new URLSearchParams("page=3")), { q: "st-00" });
    expect(state.page).toBe(1);
    expect((await calls.cards(state)).total).toBe(9);
    expect((await calls.cards(withFilters(state, { q: "", location: "Vault B" }))).items.map((card) => card.cardKey)).toEqual([ROW_NO_PRICE.cardKey].filter(Boolean));
    expect(await calls.cards(withFilters(state, { q: "", from: "2026-09-01", to: "2026-09-30" }))).toMatchObject({ mode: "RANGE", asOf: "2026-09-30" });
  });

  it("a filter that leaves fewer pages than the URL asks for is clamped back to page 1", async () => {
    const state = parseListState(new URLSearchParams("q=st-00&page=3"));
    const result = await stockValueCalls({ fetch: contractServer().fetch, renew }).cards(state);
    expect(result.items).toHaveLength(0);
    expect(pageToClamp(state.page, result.total, state.pageSize)).toBe(1);
  });

  it("sorting by Profit/Loss goes to the server (priced first, '—' last) and the table marks the sort", async () => {
    const calls = stockValueCalls({ fetch: contractServer().fetch, renew });
    const state = parseListState(new URLSearchParams(""));
    const next = toggleSort(state, activeListSort(state), "profitLoss");
    const page = await calls.cards(next);
    expect(page.items[0].profitLoss).not.toBeNull();
    const desc = await calls.cards(toggleSort(next, activeListSort(next), "profitLoss"));
    expect(Number(desc.items[0].profitLoss)).toBeGreaterThanOrEqual(Number(desc.items[1].profitLoss));
    const markup = renderToStaticMarkup(
      createElement(StockValueTable, { rows: page.items, totals: page.totals, page: 1, pageSize: 25, prefs: DEFAULT_VIEW, sort: activeListSort(next), onSort: noop, selected: new Set<string>(), onToggle: noop, onOpen: noop }),
    );
    expect(markup).toContain('aria-sort="ascending"');
    expect(markup.match(/<tr [^>]*group\/row/g)).toHaveLength(25);
  });

  it("opening a row uses its card key: the header and the transactions of that card, with the server totals", async () => {
    const server = contractServer();
    const calls = stockValueCalls({ fetch: server.fetch, renew });
    const list = await calls.cards(parseListState(new URLSearchParams("q=SAP-OV")));
    const row = list.items[0];
    expect(stockValueHref(row.cardKey)).toBe(`/report/stock-movement/stock-value/${KEY_A}`);
    const header = await calls.header(row.cardKey);
    expect(cardName(header)).toBe("SAP-OV-6x4");
    expect(header).toMatchObject({ amount: "15500.00", profitLoss: "5580.00" });
    const page = await calls.transactions(row.cardKey, parseTxnState(new URLSearchParams("")));
    expect(page.items.map((txn) => txn.docNo)).toEqual(["LS2609014", "MO2609021", ""]);
    expect(page.totals).toMatchObject({ balancePcs: 3, amount: "9000.00", priceSource: "PRICE_LIST" });
    const markup = renderToStaticMarkup(createElement(StockValueTransactionsTable, { rows: page.items, totals: page.totals, page: 1, pageSize: 25, sort: { key: "date", dir: "asc" }, onSort: noop }));
    expect(markup).toContain('href="/inventory/load-to-stock/0192a"');
    expect(markup).toContain("9,000.00");
    expect(markup).toContain("-47,120.00");
  });

  it("the detail search narrows the rows; Back returns to the list with its filters", async () => {
    const calls = stockValueCalls({ fetch: contractServer().fetch, renew });
    expect((await calls.transactions(KEY_A, parseTxnState(new URLSearchParams("q=khun")))).items.map((txn) => txn.docNo)).toEqual(["MO2609021"]);
    const listState = parseListState(new URLSearchParams("q=SAP&location=Vault%20A&sort=profitLoss&page=2"));
    expect(listReturnHref(stateToSearch(listState))).toBe("/report/stock-movement/stock-value?q=SAP&location=Vault+A&sort=profitLoss&page=2");
  });

  it("an unknown card key is a 404 that the page shows as 'no longer exists'", async () => {
    const calls = stockValueCalls({ fetch: contractServer().fetch, renew });
    await expect(calls.header(KEY_B)).rejects.toMatchObject({ status: 404, code: "STOCK_VALUE_NOT_FOUND" });
    await expect(calls.transactions(KEY_B, parseTxnState(new URLSearchParams("")))).rejects.toMatchObject({ status: 404 });
  });

  it("without stock-value VIEW every read is a 403 PERMISSION_DENIED", async () => {
    const calls = stockValueCalls({ fetch: contractServer({ denied: true }).fetch, renew });
    for (const read of [() => calls.options(), () => calls.cards(parseListState(new URLSearchParams(""))), () => calls.header(KEY_A)]) {
      await expect(read()).rejects.toMatchObject({ status: 403, code: "PERMISSION_DENIED" });
    }
  });
});
