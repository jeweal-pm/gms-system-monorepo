import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { RefCell } from "@/features/trade-document/memo-stock-modal";
import { stockRef, stockRefLabel } from "@/features/trade-document/stock-ref";

/** UT-SR-01..03 (owner 2026-11-04, picker Ref. column): the stock item's source transaction. */

const memoReceive = { docNo: "MR-1002", docDate: "2026-10-29" };
const cell = (item: Parameters<typeof RefCell>[0]["item"]) =>
  renderToStaticMarkup(createElement("table", null, createElement("tbody", null, createElement("tr", null, createElement(RefCell, { item })))));

describe("UT-SR-01 stockRef / stockRefLabel", () => {
  it("uses the API's ref when present", () => {
    expect(stockRef({ ref: { type: "MEMO_RECEIVE", docNo: "MR-1003", docDate: "2026-11-01" }, memoReceive })).toEqual({ type: "MEMO_RECEIVE", docNo: "MR-1003", docDate: "2026-11-01", dateText: "01/11/2026" });
  });

  it("falls back to the memo receive before the backend sends ref", () => {
    expect(stockRef({ memoReceive })).toEqual({ type: "MEMO_RECEIVE", docNo: "MR-1002", docDate: "2026-10-29", dateText: "29/10/2026" });
    expect(stockRef({ ref: null, memoReceive })?.docNo).toBe("MR-1002");
    expect(stockRefLabel({ memoReceive })).toBe("MR-1002");
  });

  it("a Load source (future) keeps its type; no source → null / empty label", () => {
    expect(stockRef({ ref: { type: "LOAD", docNo: "LD-0001", docDate: "2026-11-04" } })?.type).toBe("LOAD");
    expect(stockRef({})).toBeNull();
    expect(stockRef({ ref: { type: "LOAD", docNo: "", docDate: "" } })).toBeNull();
    expect(stockRefLabel({ memoReceive: null })).toBe("");
  });
});

describe("UT-SR-02 RefCell", () => {
  it("bold transaction no. with the Doc Date under it", () => {
    expect(cell({ memoReceive })).toContain('<div class="font-medium">MR-1002</div><div class="mt-1 text-xs text-[#6B7480]">29/10/2026</div>');
    expect(cell({ memoReceive })).not.toContain("Load");
  });

  it("a Load no. renders the same way with a small Load hint; no source shows a dash", () => {
    expect(cell({ ref: { type: "LOAD", docNo: "LD-0001", docDate: "2026-11-04" } })).toContain('LD-0001<span class="ml-1.5 text-[11px] font-normal text-[#6B7480]">Load</span>');
    expect(cell({})).toContain("<td class=\"px-3 py-4\">—</td>");
  });
});

describe("UT-SR-03 From Stock column order", () => {
  it("Ref. comes right after Location (owner 2026-11-05)", async () => {
    const { readFileSync } = await import("node:fs");
    const source = readFileSync("src/features/trade-document/memo-stock-modal.tsx", "utf8");
    const at = (text: string) => source.indexOf(text);
    expect(at('<Th title="Location" />')).toBeGreaterThan(-1);
    expect(at('<Th title="Ref." sub="Doc Date" />')).toBeGreaterThan(at('<Th title="Location" />'));
    expect(at('<Th title="Ref." sub="Doc Date" />')).toBeLessThan(at('<Th title="Stone" sub="Shape · Size" />'));
    expect(at("<RefCell item={item} />")).toBeGreaterThan(at("{item.location}</td>"));
    expect(source).not.toContain("from {item.memoReceive.docNo}");
  });
});

describe("UT-SR-04 From Stock first column", () => {
  it("is Stone Code (bold) over Stock ID · Lot (owner 2026-11-05)", async () => {
    const { readFileSync } = await import("node:fs");
    const source = readFileSync("src/features/trade-document/memo-stock-modal.tsx", "utf8");
    expect(source).toContain('<Th title="Stone Code" sub="Stock ID · Lot" />');
    expect(source).not.toContain('<Th title="Stock ID" sub="Lot" />');
    expect(source).toContain('<div className="font-medium">{item.stoneCode || "—"}</div>');
    expect(source).toContain('{item.lot && <Badge variant="lot">{item.lot}</Badge>}');
  });
});
