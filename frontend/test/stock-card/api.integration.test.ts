import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { stockCardCalls } from "@/features/stock-card/api";
import { listReturnHref } from "@/features/stock-card/components/back-link";
import { StockCardTable } from "@/features/stock-card/components/stock-card-table";
import { StockCardTransactionsTable } from "@/features/stock-card/components/stock-card-transactions-table";
import { cardName, pageToClamp, parseListState, parseTxnState, stateToSearch, stockCardHref, toggleSort, activeListSort, withFilters } from "@/features/stock-card/model";
import type { CardRow, Totals, Txn } from "@/features/stock-card/types";
import { DEFAULT_VIEW } from "@/features/stock-card/view-prefs";
import { controlledInventory, envelope } from "../load-to-stock/fixtures";
import { CARD_A, CARD_B, HEADER_A, KEY_A, KEY_B, TXN_LOAD, TXN_NEW_TYPE, TXN_OUT } from "./fixtures";

/**
 * IT-SC-01 (FE-SC-004/005/006/009): list -> open a card -> header and transactions against a typed in-memory service that
 * follows the SA revision 1 api-contract (paging, search, sort, running balance, totals, 403 / 404). The live service
 * check follows once backend BE-SC-009 hands its verified contract over.
 */
const noop = () => {};
const renew = vi.fn(async () => true);

function cardFixture(index: number): CardRow {
  return { ...CARD_A, stoneCode: `ST-${String(index).padStart(3, "0")}`, cardKey: `SC${index.toString(16).padStart(32, "0")}`, balancePcs: index, balanceWeightCt: `${index}.500` };
}

/** A tiny contract server: 60 cards plus the two named ones, one ledger for KEY_A. */
function contractServer(options: { denied?: boolean } = {}) {
  const cards = [CARD_A, CARD_B, ...Array.from({ length: 60 }, (_, index) => cardFixture(index + 1))];
  const ledger: Txn[] = [TXN_LOAD, TXN_OUT, TXN_NEW_TYPE];
  return controlledInventory((call) => {
    if (options.denied) return { status: 403, body: envelope("PERMISSION_DENIED", { required: "stock-card:VIEW" }) };
    const base = "/api/inventory/v1/stock-card";
    if (call.path === `${base}/options`) return { body: { locations: ["Showroom", "Vault"] } };
    if (call.path === `${base}/cards`) {
      const q = (call.query.q ?? "").toLowerCase();
      let rows = cards.filter((card) => (!call.query.location || card.location.toLowerCase() === call.query.location.toLowerCase()) && (!q || `${card.stoneCode} ${card.lot} ${card.vendorName}`.toLowerCase().includes(q)));
      if (call.query.sort === "balancePcs") rows = [...rows].sort((a, b) => (call.query.dir === "desc" ? b.balancePcs - a.balancePcs : a.balancePcs - b.balancePcs));
      const pageSize = Number(call.query.pageSize);
      const page = Number(call.query.page);
      return { body: { items: rows.slice((page - 1) * pageSize, page * pageSize), total: rows.length, page, pageSize, mode: call.query.from || call.query.to ? "RANGE" : "CURRENT", asOf: call.query.to ?? null } };
    }
    const match = /\/cards\/([^/]+)(\/transactions)?$/.exec(call.path);
    if (!match || decodeURIComponent(match[1]) !== KEY_A) return { status: 404, body: envelope("STOCK_CARD_NOT_FOUND") };
    if (!match[2]) return { body: HEADER_A };
    const q = (call.query.q ?? "").toLowerCase();
    const items = ledger.filter((txn) => !q || `${txn.docNo} ${txn.accountName}`.toLowerCase().includes(q));
    const sum = (key: "inPcs" | "outPcs") => items.reduce((total, txn) => total + (txn[key] ?? 0), 0);
    const totals: Totals = { inPcs: sum("inPcs"), inWeightCt: "1.340", outPcs: sum("outPcs"), outWeightCt: "0.620", balancePcs: 3, balanceWeightCt: "0.720" };
    return { body: { items, total: items.length, page: 1, pageSize: 25, opening: { pcs: 0, weightCt: "0.000" }, totals } };
  });
}

describe("IT-SC-01 list to card", () => {
  it("the list page loads 25 of 62 with the options, then page 3 holds the rest; each request is one bounded page", async () => {
    const server = contractServer();
    const calls = stockCardCalls({ fetch: server.fetch, renew });
    const options = await calls.options();
    expect(options.locations).toEqual(["Showroom", "Vault"]);
    const first = await calls.cards(parseListState(new URLSearchParams("")));
    expect(first).toMatchObject({ total: 62, page: 1, pageSize: 25, mode: "CURRENT", asOf: null });
    expect(first.items).toHaveLength(25);
    const third = await calls.cards(parseListState(new URLSearchParams("page=3")));
    expect(third.items).toHaveLength(12);
    for (const call of server.calls) expect(Number(call.query.pageSize ?? 25)).toBeLessThanOrEqual(50);
  });

  it("search, location and dates narrow the list and reset the page; a date makes it a RANGE read", async () => {
    const server = contractServer();
    const calls = stockCardCalls({ fetch: server.fetch, renew });
    const state = withFilters(parseListState(new URLSearchParams("page=3")), { q: "st-00" });
    expect(state.page).toBe(1);
    const found = await calls.cards(state);
    expect(found.total).toBe(9);
    const vault = await calls.cards(withFilters(state, { q: "", location: "Showroom" }));
    expect(vault.items.map((card) => card.cardKey)).toEqual([KEY_B]);
    const range = await calls.cards(withFilters(state, { q: "", from: "2026-09-01", to: "2026-09-30" }));
    expect(range).toMatchObject({ mode: "RANGE", asOf: "2026-09-30" });
  });

  it("a filter that leaves fewer pages than the URL asks for is clamped back to page 1", async () => {
    const calls = stockCardCalls({ fetch: contractServer().fetch, renew });
    const state = parseListState(new URLSearchParams("q=st-00&page=3"));
    const result = await calls.cards(state);
    expect(result.items).toHaveLength(0);
    expect(pageToClamp(state.page, result.total, state.pageSize)).toBe(1);
  });

  it("sorting by balance pcs goes to the server and the table marks the sort", async () => {
    const calls = stockCardCalls({ fetch: contractServer().fetch, renew });
    const state = parseListState(new URLSearchParams(""));
    const next = toggleSort(state, activeListSort(state), "balancePcs");
    const page = await calls.cards(next);
    expect(page.items[0].balancePcs).toBeLessThanOrEqual(page.items[1].balancePcs);
    const markup = renderToStaticMarkup(
      createElement(StockCardTable, { rows: page.items, page: 1, pageSize: 25, prefs: DEFAULT_VIEW, sort: activeListSort(next), onSort: noop, selected: new Set<string>(), onToggle: noop, onOpen: noop }),
    );
    expect(markup).toContain('aria-sort="ascending"');
    expect(markup.match(/<tr [^>]*group\/row/g)).toHaveLength(25);
  });

  it("opening a row uses its card key: the header and the transactions of that card, with the server totals", async () => {
    const server = contractServer();
    const calls = stockCardCalls({ fetch: server.fetch, renew });
    const list = await calls.cards(parseListState(new URLSearchParams("q=AL-CU")));
    const row = list.items[0];
    expect(stockCardHref(row.cardKey)).toBe(`/report/stock-movement/stock-card/${KEY_A}`);
    const header = await calls.header(row.cardKey);
    expect(cardName(header)).toBe("AL-CU-3040-014");
    const page = await calls.transactions(row.cardKey, parseTxnState(new URLSearchParams("")));
    expect(page.items.map((txn) => txn.docNo)).toEqual(["LS2609014", "MO2609021", ""]);
    expect(page.totals).toMatchObject({ inPcs: 5, outPcs: 2, balancePcs: 3, balanceWeightCt: "0.720" });
    const markup = renderToStaticMarkup(createElement(StockCardTransactionsTable, { rows: page.items, totals: page.totals, page: 1, pageSize: 25, sort: { key: "date", dir: "asc" }, onSort: noop }));
    expect(markup).toContain('href="/inventory/load-to-stock/0192a"');
    expect(markup).toContain('href="/memo/memo-out/0192b"');
    expect(markup).toContain(">260215 +2<");
    expect(markup).toContain(">0.72<");
  });

  it("the detail search narrows the rows; Back returns to the list with its filters", async () => {
    const calls = stockCardCalls({ fetch: contractServer().fetch, renew });
    const page = await calls.transactions(KEY_A, parseTxnState(new URLSearchParams("q=khun")));
    expect(page.items.map((txn) => txn.docNo)).toEqual(["MO2609021"]);
    const listState = parseListState(new URLSearchParams("q=AL-CU&location=Vault&sort=lot&page=2"));
    expect(listReturnHref(stateToSearch(listState))).toBe("/report/stock-movement/stock-card?q=AL-CU&location=Vault&sort=lot&page=2");
  });

  it("an unknown card key is a 404 that the page shows as 'no longer exists'; the other card has none", async () => {
    const calls = stockCardCalls({ fetch: contractServer().fetch, renew });
    await expect(calls.header(KEY_B)).rejects.toMatchObject({ status: 404, code: "STOCK_CARD_NOT_FOUND" });
    await expect(calls.transactions(KEY_B, parseTxnState(new URLSearchParams("")))).rejects.toMatchObject({ status: 404 });
  });

  it("without stock-card VIEW every read is a 403 PERMISSION_DENIED", async () => {
    const calls = stockCardCalls({ fetch: contractServer({ denied: true }).fetch, renew });
    for (const read of [() => calls.options(), () => calls.cards(parseListState(new URLSearchParams(""))), () => calls.header(KEY_A)]) {
      await expect(read()).rejects.toMatchObject({ status: 403, code: "PERMISSION_DENIED" });
    }
  });
});
