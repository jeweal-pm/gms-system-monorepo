import { describe, expect, it } from "vitest";
import {
  activeListSort,
  activeTxnSort,
  asOfNote,
  moneyText,
  noCostNote,
  parseListState,
  parseTxnState,
  priceCaption,
  priceTooltip,
  profitTone,
  stateToSearch,
  stockValueHref,
  STOCK_VALUE_HREF,
  toggleSort,
  toQuery,
  unitLabel,
  unpricedNote,
} from "@/features/stock-value/model";
import { numberFormatFor } from "@/features/decimal-setup/number-format-provider";

/** UT-SV-01…06, 08 (FE-SV-002/003): URL state with the Stock Value sort keys, routes, value-cell rules. Pure functions. */
const params = (query: string) => new URLSearchParams(query);

describe("UT-SV-01 URL state", () => {
  it("defaults: Stone Code ascending on the list, Date ascending on the detail", () => {
    expect(activeListSort(parseListState(params("")))).toEqual({ key: "stoneCode", dir: "asc" });
    expect(activeTxnSort(parseTxnState(params("")))).toEqual({ key: "date", dir: "asc" });
  });

  it("the list accepts the contract sorts; the detail accepts profitLoss; anything else falls back", () => {
    for (const key of ["stoneCode", "location", "lot", "profitLoss", "price", "amount", "balancePcs", "balanceWeightCt"]) expect(parseListState(params(`sort=${key}`)).sort).toBe(key);
    expect(parseListState(params("sort=date")).sort).toBeNull();
    expect(parseTxnState(params("sort=profitLoss&dir=desc"))).toMatchObject({ sort: "profitLoss", dir: "desc" });
    expect(parseTxnState(params("sort=location")).sort).toBeNull();
  });

  it("the location filter exists on the list only; page, size and dates are bounded", () => {
    expect(parseListState(params("location=Vault%20A")).location).toBe("Vault A");
    expect(parseTxnState(params("location=Vault")).location).toBe("");
    expect(parseListState(params("page=99999&size=1000&from=bad"))).toMatchObject({ page: 1, pageSize: 25, from: "" });
  });

  it("state round-trips through the URL and a sort click flips or restarts, back to page 1", () => {
    const state = parseListState(params("q=ruby&sort=profitLoss&dir=desc&page=3&size=10"));
    expect(parseListState(params(stateToSearch(state)))).toEqual(state);
    const next = toggleSort(state, activeListSort(state), "profitLoss");
    expect(next).toMatchObject({ sort: "profitLoss", dir: "asc", page: 1 });
    expect(toggleSort(state, activeListSort(state), "lot")).toMatchObject({ sort: "lot", dir: "asc", page: 1 });
  });

  it("the API query carries only set values, the sort, the page and a bounded page size", () => {
    expect(toQuery(parseListState(params("")))).toEqual({ page: 1, pageSize: 25 });
    expect(toQuery(parseListState(params("q=x&location=Vault&sort=profitLoss&dir=desc&size=50")))).toEqual({ q: "x", location: "Vault", sort: "profitLoss", dir: "desc", page: 1, pageSize: 50 });
  });
});

describe("UT-SV-07 routes", () => {
  it("the list and a card route; the card key is encoded", () => {
    expect(STOCK_VALUE_HREF).toBe("/report/stock-movement/stock-value");
    expect(stockValueHref("SCabc")).toBe("/report/stock-movement/stock-value/SCabc");
    expect(stockValueHref("a/b")).toBe("/report/stock-movement/stock-value/a%2Fb");
  });
});

describe("UT-SV-02 price caption and tooltip", () => {
  it("captions follow the server label, else the source words; NONE is 'No price'; a new source has none", () => {
    expect(priceCaption("PRICE_LIST", "Price list")).toBe("Price list");
    expect(priceCaption("LAST_SALE", null)).toBe("Last sale");
    expect(priceCaption("MIXED", null)).toBe("Mixed");
    expect(priceCaption("NONE", null)).toBe("No price");
    expect(priceCaption("FUTURE", null)).toBe("");
    expect(priceCaption("FUTURE", "Contract")).toBe("Contract");
  });

  it("tooltips: Price list, Last sale with the Sale and its date, none for an unknown source", () => {
    expect(priceTooltip("PRICE_LIST", null)).toBe("Price list: sell price of the Stock ID");
    expect(priceTooltip("LAST_SALE", { docNo: "SL2611003", docDate: "2026-11-12" })).toBe("Last sale: latest Sale price (SL2611003, 12/11/2026)");
    expect(priceTooltip("LAST_SALE", null)).toBe("Last sale: latest Sale price");
    expect(priceTooltip("NONE", null)).toBe("No price list and no sale yet");
    expect(priceTooltip("MIXED", { docNo: "SL1", docDate: "" })).toContain("(SL1)");
    expect(priceTooltip("FUTURE", null)).toBeUndefined();
  });
});

describe("UT-SV-03 unit", () => {
  it("CT is Cts, PCS is Pcs, MIXED is Mixed; null or unknown is a dash", () => {
    expect([unitLabel("CT"), unitLabel("PCS"), unitLabel("MIXED"), unitLabel(null), unitLabel("KG")]).toEqual(["Cts", "Pcs", "Mixed", "—", "—"]);
  });
});

describe("UT-SV-04 Profit/Loss tone", () => {
  it("only a non-zero negative amount is negative", () => {
    expect(profitTone("-47120.00")).toBe("negative");
    expect(profitTone("-0.01")).toBe("negative");
    expect(profitTone("-0.00")).toBe("normal");
    expect(profitTone("120.50")).toBe("normal");
    expect(profitTone("0.00")).toBe("normal");
    expect(profitTone(null)).toBe("normal");
  });
});

describe("UT-SV-05 money text", () => {
  it("formats the server string with the Decimal Setup places and never calculates; null is a dash", () => {
    const two = numberFormatFor({ weightPlaces: 2, pricePlaces: 2 }).money;
    const four = numberFormatFor({ weightPlaces: 2, pricePlaces: 4 }).money;
    expect(moneyText("15500.00", two)).toBe("15,500.00");
    expect(moneyText("12500.0000", two)).toBe("12,500.00");
    expect(moneyText("12500.0000", four)).toBe("12,500.0000");
    expect(moneyText("-47120.00", two)).toBe("-47,120.00");
    expect(moneyText(null, two)).toBe("—");
  });
});

describe("UT-SV-06 Total notes and the as-at line", () => {
  it("notes appear only for a count above zero", () => {
    expect(unpricedNote(0)).toBe("");
    expect(unpricedNote(2)).toBe("2 without price");
    expect(noCostNote(1)).toBe("1 without cost");
    expect(noCostNote(0)).toBe("");
  });

  it("the as-at line uses the Due date", () => {
    expect(asOfNote("2026-09-30")).toBe("Balance as at 30/09/2026 at current prices");
  });
});

describe("UT-SV-12 tokens (FE-SV-001)", () => {
  it("globals.css defines the blue group trio, its hover and the purple ticked tint with the design hex values", async () => {
    const { readFileSync } = await import("node:fs");
    const css = readFileSync("src/app/globals.css", "utf8");
    for (const [name, hex] of [
      ["blue-head", "#c5d7f4"],
      ["blue-sub", "#dce7f8"],
      ["blue-cell", "#f0f4fc"],
      ["blue-hover", "#e7eef6"],
      ["purple-active", "#e6e7f0"],
    ]) expect(css).toContain(`--color-gms-group-${name}: ${hex};`);
    // The shipped Stock Card tokens are untouched.
    expect(css).toContain("--color-gms-group-purple-hover: #ddd7e4;");
    expect(css).toContain("--color-gms-group-purple-cell: #f6f2fb;");
  });
});
