import { describe, expect, it } from "vitest";
import { parseStored } from "@/features/decimal-setup/api";
import { applyToAll, DECIMAL_PAGES, defaultDecimalSetup, differsFromDefaults, exampleText, filterPages } from "@/features/decimal-setup/pages";

/** UT-DEC-01…04: decimal-setup UI rev 1 (owner 2026-10-27), mock data only. */

describe("pages and defaults (UT-DEC-01)", () => {
  it("lists the 15 pages; only Payable and Receivable have no weight; defaults are 2 / 2", () => {
    expect(DECIMAL_PAGES).toHaveLength(15);
    expect(DECIMAL_PAGES.filter((page) => !page.hasWeight).map((page) => page.key)).toEqual(["payable", "receivable"]);
    const setup = defaultDecimalSetup();
    expect(setup.defaults).toEqual({ weight: 2, price: 2 });
    expect(setup.pages.quotation).toEqual({ weight: 2, price: 2 });
    expect(setup.pages.payable).toEqual({ weight: null, price: 2 });
  });
});

describe("apply to all (UT-DEC-02)", () => {
  it("copies the defaults to every page (weight only where it exists) and detects differences", () => {
    const setup = { ...defaultDecimalSetup(), defaults: { weight: 3, price: 0 } };
    expect(differsFromDefaults(setup)).toBe(true);
    const applied = applyToAll(setup);
    expect(applied.pages.sale).toEqual({ weight: 3, price: 0 });
    expect(applied.pages.receivable).toEqual({ weight: null, price: 0 });
    expect(differsFromDefaults(applied)).toBe(false);
  });
});

describe("examples and search (UT-DEC-03)", () => {
  it("rounds half-up and formats weight in ct and price with thousands separators", () => {
    expect(exampleText("weight", 2)).toBe("1.23 ct");
    expect(exampleText("weight", 4)).toBe("1.2346 ct");
    expect(exampleText("weight", 0)).toBe("1 ct");
    expect(exampleText("price", 2)).toBe("12,345.68");
    expect(exampleText("price", 0)).toBe("12,346");
  });

  it("filters by page or section name", () => {
    expect(filterPages("memo").map((page) => page.key)).toEqual(["memo-receive", "memo-return", "memo-out", "memo-out-return"]);
    expect(filterPages("account").map((page) => page.key)).toEqual(["payable", "receivable"]);
    expect(filterPages("  ")).toHaveLength(15);
    expect(filterPages("nothing")).toEqual([]);
  });
});

describe("mock storage (UT-DEC-04)", () => {
  it("accepts only well-formed stored values and ignores bad entries", () => {
    expect(parseStored(null)).toBeNull();
    expect(parseStored("not json")).toBeNull();
    expect(parseStored(JSON.stringify({ defaults: { weight: 9, price: 2 }, pages: {} }))).toBeNull();
    const stored = parseStored(JSON.stringify({ defaults: { weight: 3, price: 1 }, pages: { quotation: { weight: 4, price: 0 }, payable: { weight: 3, price: 3 }, sale: { weight: "x", price: 2 } } }));
    expect(stored?.defaults).toEqual({ weight: 3, price: 1 });
    expect(stored?.pages.quotation).toEqual({ weight: 4, price: 0 });
    expect(stored?.pages.payable).toEqual({ weight: null, price: 3 });
    expect(stored?.pages.sale).toEqual({ weight: 2, price: 2 });
  });
});
