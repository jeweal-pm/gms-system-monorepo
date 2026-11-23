import { describe, expect, it } from "vitest";
import { loadToStockHref } from "@/features/load-to-stock/api";
import { memoOutHref } from "@/features/memo-out/api";
import { memoOutReturnHref } from "@/features/memo-out-return/api";
import { showingText } from "@/features/memo-outstanding-vendor/model";
import { saleHref } from "@/features/sale/form";
import {
  activeListSort,
  activeTxnSort,
  cardName,
  clearFilters,
  DEFAULT_PAGE_SIZE,
  detailLine,
  docHref,
  filterSummary,
  formatShortDate,
  hasFilters,
  pageToClamp,
  parseListState,
  parseTxnState,
  pcsCell,
  rangeProblem,
  rowNumber,
  specLine,
  stateToSearch,
  stockCardHref,
  stockIdText,
  toggleSort,
  toQuery,
  vendorLine,
  weightCell,
  withFilters,
} from "@/features/stock-card/model";

/** UT-SC-01…06 and UT-SC-08 (query building) (FE-SC-002): URL state, formatters, doc routes, spec line, row numbers, date range. */
const params = (query: string) => new URLSearchParams(query);

describe("UT-SC-01 URL state", () => {
  it("defaults: no sort, page 1, 25 / page; a plain visit keeps a clean URL", () => {
    const state = parseListState(params(""));
    expect(state).toEqual({ q: "", location: "", from: "", to: "", sort: null, dir: "asc", page: 1, pageSize: DEFAULT_PAGE_SIZE });
    expect(DEFAULT_PAGE_SIZE).toBe(25);
    expect(stateToSearch(state)).toBe("");
  });

  it("parses and serialises every list parameter", () => {
    const state = parseListState(params("q=ruby&location=Vault&from=2026-09-01&to=2026-09-30&sort=balanceWeightCt&dir=desc&page=3&size=50"));
    expect(state).toMatchObject({ q: "ruby", location: "Vault", from: "2026-09-01", to: "2026-09-30", sort: "balanceWeightCt", dir: "desc", page: 3, pageSize: 50 });
    const search = stateToSearch(state);
    expect(parseListState(params(search))).toEqual(state);
    expect(search).toBe("q=ruby&location=Vault&from=2026-09-01&to=2026-09-30&sort=balanceWeightCt&dir=desc&page=3&size=50");
  });

  it("invalid values fall back to the defaults, never an error; text is clamped", () => {
    const state = parseListState(params(`q=${"x".repeat(300)}&location=${"y".repeat(99)}&from=31/12/2026&to=nope&sort=docNo&page=0&size=7`));
    expect(state.q).toHaveLength(100);
    expect(state.location).toHaveLength(40);
    expect(state).toMatchObject({ from: "", to: "", sort: null, page: 1, pageSize: 25 });
    expect(parseListState(params("page=201")).page).toBe(1);
    expect(parseListState(params("page=200")).page).toBe(200);
    expect(parseListState(params("page=1.5")).page).toBe(1);
    expect(parseListState(params("size=10")).pageSize).toBe(10);
  });

  it("the detail page has its own sort keys and no location", () => {
    const state = parseTxnState(params("q=MO&location=Vault&sort=docNo&dir=desc"));
    expect(state).toMatchObject({ q: "MO", location: "", sort: "docNo", dir: "desc" });
    expect(parseTxnState(params("sort=balancePcs")).sort).toBeNull();
    expect(parseListState(params("sort=docNo")).sort).toBeNull();
  });

  it("filter changes go back to page 1; clear filters keeps sort and page size", () => {
    const state = parseListState(params("q=a&location=Vault&from=2026-09-01&sort=lot&size=10&page=4"));
    expect(withFilters(state, { q: "b" }).page).toBe(1);
    expect(hasFilters(state)).toBe(true);
    const cleared = clearFilters(state);
    expect(hasFilters(cleared)).toBe(false);
    expect(cleared).toMatchObject({ sort: "lot", pageSize: 10, page: 1 });
  });

  it("header click: another column starts ascending, the same column flips; the default sort counts as active", () => {
    const state = parseListState(params(""));
    expect(activeListSort(state)).toEqual({ key: "stoneCode", dir: "asc" });
    expect(toggleSort(state, activeListSort(state), "stoneCode")).toMatchObject({ sort: "stoneCode", dir: "desc", page: 1 });
    expect(toggleSort(state, activeListSort(state), "lot")).toMatchObject({ sort: "lot", dir: "asc" });
    const txn = parseTxnState(params("page=3"));
    expect(activeTxnSort(txn)).toEqual({ key: "date", dir: "asc" });
    expect(toggleSort(txn, activeTxnSort(txn), "date")).toMatchObject({ sort: "date", dir: "desc", page: 1 });
  });

  it("the page is clamped to 1 when a filter leaves fewer pages", () => {
    expect(pageToClamp(3, 20, 25)).toBe(1);
    expect(pageToClamp(2, 26, 25)).toBeNull();
    expect(pageToClamp(1, 0, 25)).toBeNull();
    expect(pageToClamp(2, 0, 25)).toBe(1);
  });

  it("the card route keeps the opaque key as one path segment", () => {
    expect(stockCardHref(`SC${"a".repeat(32)}`)).toBe(`/report/stock-movement/stock-card/SC${"a".repeat(32)}`);
    expect(stockCardHref("a/b")).toBe("/report/stock-movement/stock-card/a%2Fb");
  });
});

describe("UT-SC-08 query building (bounds)", () => {
  it("sends only set values, the page and one of 10 / 25 / 50", () => {
    expect(toQuery(parseListState(params("")))).toEqual({ page: 1, pageSize: 25 });
    expect(toQuery(parseListState(params("q=%20ruby%20&location=Vault&from=2026-09-01&to=2026-09-30&sort=lot&dir=desc&page=2&size=10")))).toEqual({
      q: "ruby",
      location: "Vault",
      from: "2026-09-01",
      to: "2026-09-30",
      sort: "lot",
      dir: "desc",
      page: 2,
      pageSize: 10,
    });
  });

  it("a reversed range is not sent (the fields show the problem instead)", () => {
    expect(toQuery(parseListState(params("from=2026-10-01&to=2026-09-01")))).toEqual({ page: 1, pageSize: 25 });
  });

  it("a whitespace-only search is dropped", () => {
    expect(toQuery({ ...parseListState(params("")), q: "   " })).not.toHaveProperty("q");
  });
});

describe("UT-SC-02 formatters", () => {
  it("dates read dd/MM/yy on the detail table and stay as written when not a date", () => {
    expect(formatShortDate("2026-09-04")).toBe("04/09/26");
    expect(formatShortDate("2026-12-31T00:00:00Z")).toBe("31/12/26");
    expect(formatShortDate("soon")).toBe("soon");
  });

  it("the other direction's cells are blank; weight follows the Decimal Setup places", () => {
    expect(pcsCell(null)).toBe("");
    expect(pcsCell(4)).toBe("4");
    expect(pcsCell(1200)).toBe("1,200");
    expect(weightCell(null, 2)).toBe("");
    expect(weightCell("1.240", 2)).toBe("1.24");
    expect(weightCell("1.245", 2)).toBe("1.25");
    expect(weightCell("1.240", 3)).toBe("1.240");
    expect(weightCell("0.620", 0)).toBe("1");
  });

  it("Stock ID: the first visible one with +n; a hidden or missing one is a dash", () => {
    expect(stockIdText("260214", 0)).toBe("260214");
    expect(stockIdText("260214", 2)).toBe("260214 +2");
    expect(stockIdText(null, 0)).toBe("—");
    expect(stockIdText("", 0)).toBe("—");
  });

  it("vendor line: the newest vendor, +n when the card has more", () => {
    expect(vendorLine("Siam Fine", 1)).toBe("Siam Fine");
    expect(vendorLine("Siam Fine", 3)).toBe("Siam Fine +2");
    expect(vendorLine("", 2)).toBe("");
    expect(vendorLine("  ", 0)).toBe("");
  });
});

describe("UT-SC-03 document route map", () => {
  it("known types link to the document route and match the module's own href helper", () => {
    expect(docHref("load-to-stock", "abc")).toBe(loadToStockHref("abc"));
    expect(docHref("memo-out", "abc")).toBe(memoOutHref("abc"));
    expect(docHref("memo-out-return", "abc")).toBe(memoOutReturnHref("abc"));
    expect(docHref("sale", "abc")).toBe(saleHref("abc"));
    expect(docHref("memo-receive", "abc")).toBe("/memo/memo-receive/abc");
    expect(docHref("memo-return", "abc")).toBe("/memo/memo-return/abc");
  });

  it("an unknown type (or no id) has no link; the number then renders as text", () => {
    expect(docHref("stock-adjustment", "abc")).toBeUndefined();
    expect(docHref("toString", "abc")).toBeUndefined();
    expect(docHref("memo-out", "")).toBeUndefined();
  });

  it("the id is encoded", () => {
    expect(docHref("memo-out", "a/b?c")).toBe("/memo/memo-out/a%2Fb%3Fc");
  });
});

describe("UT-SC-04 spec line and names", () => {
  const attrs = { stone: "Alexandrite", shape: "Cushion", size: "3.0 x 4.0 mm", color: "Light Blue", clarity: "VS1", cutting: "", quality: "AAA" };

  it("stone, shape size, color, clarity, cutting, quality joined by dots, empty parts dropped", () => {
    expect(specLine(attrs)).toBe("Alexandrite · Cushion 3.0 x 4.0 mm · Light Blue · VS1 · AAA");
    expect(specLine({ ...attrs, shape: "", size: "", color: " ", clarity: "", quality: "" })).toBe("Alexandrite");
    expect(specLine({ stone: "", shape: "", size: "", color: "", clarity: "", cutting: "", quality: "" })).toBe("");
  });

  it("an empty stone code falls back to the attributes, then to a dash", () => {
    expect(cardName({ ...attrs, stoneCode: "AL-1" })).toBe("AL-1");
    expect(cardName({ ...attrs, stoneCode: " " })).toBe("Alexandrite · Cushion 3.0 x 4.0 mm · Light Blue · VS1 · AAA");
    expect(cardName({ stoneCode: "", stone: "", shape: "", size: "", color: "", clarity: "", cutting: "", quality: "" })).toBe("—");
  });

  it("the detail line is not repeated when the name already is the attributes", () => {
    expect(detailLine({ ...attrs, stoneCode: "AL-1" })).toBe("Alexandrite · Cushion 3.0 x 4.0 mm · Light Blue · VS1 · AAA");
    expect(detailLine({ ...attrs, stoneCode: "" })).toBe("");
  });
});

describe("UT-SC-05 row numbers and the Showing text", () => {
  it("numbers run across pages", () => {
    expect(rowNumber(1, 25, 0)).toBe(1);
    expect(rowNumber(3, 25, 4)).toBe(55);
    expect(rowNumber(2, 10, 9)).toBe(20);
  });

  it("Showing a–b out of n items (the shared pager text)", () => {
    expect(showingText(1, 25, 4)).toBe("Showing 1–4 out of 4 items");
    expect(showingText(2, 25, 60)).toBe("Showing 26–50 out of 60 items");
    expect(showingText(1, 25, 0)).toBe("Showing 0 out of 0 items");
  });
});

describe("UT-SC-06 date range", () => {
  it("only Due before Start is a problem; open ranges and long ranges are fine", () => {
    expect(rangeProblem("2026-10-01", "2026-09-01")).toBe("The end date is before the start date.");
    expect(rangeProblem("2026-09-01", "2026-09-01")).toBeNull();
    expect(rangeProblem("2026-09-01", "")).toBeNull();
    expect(rangeProblem("", "2026-09-01")).toBeNull();
    expect(rangeProblem("2020-01-01", "2026-12-31")).toBeNull();
  });
});

describe("print header summary", () => {
  it("lists search, location and the dates as dd/MM/yyyy", () => {
    expect(filterSummary(parseListState(params("q=ruby&location=Vault&from=2026-09-01&to=2026-09-30")))).toEqual(["Search: ruby", "Location: Vault", "Date: 01/09/2026 – 30/09/2026"]);
    expect(filterSummary(parseListState(params("from=2026-09-01")))).toEqual(["Date: 01/09/2026 – …"]);
    expect(filterSummary(parseListState(params("")))).toEqual([]);
  });
});
