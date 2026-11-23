import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { ItemTable, itemColumns } from "@/features/quotation/components/items/ItemTable";
import { DocumentKindContext, QUOTATION_KIND, QUOTATION_LOT_KIND } from "@/features/quotation/document-kind";
import { calculateTotals } from "@/features/quotation/lib/calculate";
import { emptyLine, emptyQuotation } from "@/features/quotation/lib/defaults";
import { SALE_KIND } from "@/features/sale/components/SalePage";
import { customerStockConfig } from "@/features/trade-document/customer-stock-config";
import {
  isLotDocumentType,
  lotPendingShortText,
  lotReferenceText,
  lotShortText,
  lotTooLargeMessage,
  sentLotLines,
  shortLotLines,
} from "@/features/trade-document/lot-stock";
import { mapPurchaseSaveError } from "@/features/purchase/api";
import { gatewayError } from "../partner/helpers";
import { LotCell, lotSelectLabel } from "@/features/trade-document/picker-ui";
import { stockRowMessage } from "@/features/trade-document/stock-row-errors";
import { MEMO_LOT, OWN_LOT } from "./lot-fixture";

/** UT-LOT-FE-01…08 (lot-based-stock round 1, FE-LOT-001/006/007): the Lot cell, item tables and per-row error texts. */

const html = (element: ReturnType<typeof createElement>) => renderToStaticMarkup(element);
const row = (cell: ReturnType<typeof createElement>) => html(createElement("table", null, createElement("tbody", null, createElement("tr", null, cell))));

describe("UT-LOT-FE-01 LotCell (FE-LOT-001)", () => {
  it("Lot chip then the bold Stone Code; '—' without a lot; the note below; never a Stock ID", () => {
    const withLot = row(createElement(LotCell, { lot: "L-7", stoneCode: "RU-OV", note: "heated" }));
    expect(withLot).toMatch(/L-7<\/span><span class="font-medium">RU-OV<\/span>/);
    expect(withLot).toContain("heated");
    const none = row(createElement(LotCell, { lot: "", stoneCode: "", detail: "V001" }));
    expect(none).toContain('<span class="text-gms-text-muted">—</span><span class="font-medium">—</span>');
    expect(none).toContain("V001");
    expect(withLot + none).not.toMatch(/Stock ID/);
  });

  it("checkbox labels: 'Select lot {lot} {stone code}', or 'Select {stone code} from {ref doc no}' without a lot", () => {
    expect(lotSelectLabel("L-7", "RU-OV", "MR-1")).toBe("Select lot L-7 RU-OV");
    expect(lotSelectLabel("L-7", "", "MR-1")).toBe("Select lot L-7");
    expect(lotSelectLabel("", "RU-OV", "LS-1")).toBe("Select RU-OV from LS-1");
  });
});

describe("UT-LOT-FE-02 which documents hide the Stock ID this round (owner Q3)", () => {
  it("Quotation, Reserve, Memo Out, Purchase, Memo Return hide it; Sale, Memo Out Return, Memo Receive and Load to Stock show it again (owner Q3)", () => {
    expect(["quotation", "reserve", "memo-out", "purchase", "memo-return"].every(isLotDocumentType)).toBe(true);
    expect(["sale", "memo-out-return", "memo-receive", "load-to-stock", "purchase-order"].some(isLotDocumentType)).toBe(false);
  });

  it("the Reserve / Memo Out form uses the lot kind; the default, Sale and Purchase kinds still show the Stock ID", () => {
    const config = customerStockConfig({ noun: "reserve", title: "Reserve", newHref: "/r", detailHref: (id) => id, useApi: () => ({}) as never, mapSaveError: () => ({ fieldErrors: [], message: "" }),
      mapRestoreError: () => ({ message: "", refetch: false }), pickerTitle: "Add From Stock", approvalType: "reserve", notePlaceholder: "", noteHint: "", daybook: null, photos: { upload: null, url: (id: string) => id } as never });
    expect(config.kind?.stockId).toBe("lot");
    expect(QUOTATION_LOT_KIND.stockId).toBe("lot");
    expect(QUOTATION_KIND.stockId).toBe("from-stock");
    expect(SALE_KIND.stockId).toBe("from-stock");
  });
});

describe("UT-LOT-FE-03 item table (FE-LOT-006)", () => {
  it("the first column is 'Lot / Stone Code' (no Stock ID title) in lot mode; other modes unchanged", () => {
    expect(itemColumns(true, true, "lot")[0]).toMatchObject({ title: "Lot / Stone Code" });
    expect(itemColumns(true, true, "lot")[0]?.sub).toBeUndefined();
    expect(itemColumns(true)[0]).toMatchObject({ title: "Stone Code", sub: "Stock ID · Lot" });
    expect(itemColumns(true, true, false)[0]).toMatchObject({ title: "Stone Code", sub: "Lot" });
  });

  const table = (kind: typeof QUOTATION_KIND, lines: ReturnType<typeof emptyLine>[]) =>
    html(
      createElement(DocumentKindContext.Provider, { value: kind },
        createElement(ItemTable, {
          lines, currency: "THB", totals: calculateTotals(emptyQuotation()), selectedIndex: null, checkedKeys: new Set<string>(), readOnly: true,
          onSelectRow: () => undefined, onToggleCheck: () => undefined, onToggleAll: () => undefined, onRowAction: () => undefined, onAddRow: () => undefined,
        })),
    );
  const filled = { ...emptyLine(), stockId: "", lot: "L-7", stoneCode: "RU-OV", stone: "Ruby", pcs: "1", weightCt: "1" };

  it("shows the lot chip and stone code and never reads the Stock ID, for a lot line and a legacy line without a lot", () => {
    const markup = table(QUOTATION_LOT_KIND, [filled, { ...filled, key: "b", lot: "", stockId: "" }]);
    expect(markup).toContain("Lot / Stone Code");
    expect(markup).toContain("L-7");
    expect(markup).toContain("RU-OV");
    expect(markup).not.toContain("Stock ID");
    expect(markup).toContain('<span class="text-[#A9B1B9]">—</span>');
  });

  it("the default kind still prints the Stock ID (Sale / Purchase / Memo Return rows, next round)", () => {
    const markup = table(QUOTATION_KIND, [{ ...filled, stockId: "260010" }]);
    expect(markup).toContain("260010");
    expect(markup).toContain("Stock ID");
  });
});

describe("UT-LOT-FE-04 row panel (FE-LOT-006)", () => {
  it("the editor has no Stock ID field or heading in lot mode and words the cap 'Max x pcs / y ct in lot L'", async () => {
    const { readFileSync } = await import("node:fs");
    const source = readFileSync("src/features/quotation/components/items/ItemEditorPanel.tsx", "utf8");
    expect(source).toContain('kind.stockId === "lot" ? null : kind.stockId === "from-stock"');
    expect(source).toContain('kind.stockId === "lot" ? line.stoneCode || line.lot || "Item"');
    expect(source).toContain("ct${line.lot ? ` in lot ${line.lot}` : \" in this lot\"}`");
  });
});

describe("UT-LOT-FE-11 Purchase lot errors (FE-LOT-007)", () => {
  const lines = [{ ...emptyQuotation().lines[0]!, stone: "Ruby", lot: "L-7", lotKey: MEMO_LOT }];
  const form = { lines };
  it("a refused lot reference, a short lot at approve (details.lines), a nothing-left lot and a too-large lot name the row and lot", () => {
    const ref = mapPurchaseSaveError(gatewayError({ domainCode: "VALIDATION_ERROR", fieldErrors: [{ path: "lines.0.reference", code: "vendor_mismatch" }] }), form);
    expect(ref.message).toBe("Row 1: This lot is from another vendor. Remove the row.");
    expect(ref.fieldErrors).toEqual([{ name: "lines.0.pcs", message: "This lot is from another vendor. Remove the row." }]);
    const short = mapPurchaseSaveError(gatewayError({ domainCode: "PURCHASE_PENDING_SHORT", httpStatus: 409, fieldErrors: [{ path: "lines.0.pcs", code: "exceeds_pending" }], details: { lines: [{ index: 0, lotKey: MEMO_LOT, availablePcs: 1, availableWeightCt: "0.500" }] } }), form);
    expect(short.message).toBe("Row 1: only 1 pcs / 0.500 ct left in lot L-7. Lower the quantity or remove the row, then save again. Nothing was saved.");
    expect(short.fieldErrors).toEqual([{ name: "lines.0.pcs", message: "More than the available quantity" }]);
    expect(mapPurchaseSaveError(gatewayError({ domainCode: "STOCK_LOT_UNAVAILABLE", httpStatus: 422, fieldErrors: [{ path: "lines.0.reference", code: "unavailable" }] }), form).message).toBe("Row 1: this lot has nothing left");
    expect(mapPurchaseSaveError(gatewayError({ domainCode: "STOCK_LOT_TOO_LARGE", httpStatus: 422, details: { lotKey: MEMO_LOT, limit: 500 } }), form).message).toBe("Lot L-7 is too large to pick in one document; contact admin");
  });
});

describe("UT-LOT-FE-05 row error texts (FE-LOT-007)", () => {
  it("reference codes: unavailable, lot_required, duplicate, anything else", () => {
    expect(lotReferenceText(2, "unavailable", "memo out")).toBe("Row 2: this lot has nothing left");
    expect(lotReferenceText(1, "lot_required", "memo out")).toBe("Row 1: Pick this item again from the list");
    expect(lotReferenceText(3, "duplicate", "reserve")).toBe("Row 3: This lot is already on the reserve.");
    expect(lotReferenceText(3, "not_mergeable", "reserve")).toContain("Row 3: This lot can't be used any more");
  });

  it("short lot: 'only x pcs / y ct left in lot L'; no name → 'in this lot'", () => {
    expect(lotShortText(1, { pcs: 2, weightCt: "1.000" }, "L-7")).toBe("Row 1: only 2 pcs / 1.000 ct left in lot L-7");
    expect(lotShortText(1, { pcs: 2, weightCt: "1.000" }, "")).toBe("Row 1: only 2 pcs / 1.000 ct left in this lot");
  });

  it("stockRowMessage: lot rows read the lot; legacy rows and rows without lots are unchanged", () => {
    const exceeds = [{ path: "lines.1.pcs", code: "exceeds_pending", params: { availablePcs: 1, availableWeightCt: "0.700" } }];
    const lines = [{ lotKey: null, lot: "" }, { lotKey: MEMO_LOT, lot: "L-7" }];
    expect(stockRowMessage(exceeds, "memo out", () => "x", lines)).toBe("Row 2: only 1 pcs / 0.700 ct left in lot L-7");
    expect(stockRowMessage(exceeds, "memo out", () => "only 1 pcs left")).toBe("Row 2: only 1 pcs left");
    expect(stockRowMessage([{ path: "lines.0.reference", code: "duplicate" }], "reserve", () => "x")).toBe("Row 1: This lot is already on the reserve.");
    expect(stockRowMessage([{ path: "lines.0.memoStockId", code: "duplicate" }], "reserve", () => "x")).toBe("Row 1: This stock item is already on the reserve.");
    expect(stockRowMessage([{ path: "lines.0.exceeds", code: "x" }], "reserve", () => "x")).toBeUndefined();
  });

  it("short details lines: read per row; a short own lot without details says it changed", () => {
    expect(shortLotLines({ lines: [{ index: 1, lotKey: MEMO_LOT, availablePcs: 3, availableWeightCt: "1.500" }, { nope: true }] })).toEqual([{ index: 1, lotKey: MEMO_LOT, availablePcs: 3, availableWeightCt: "1.500" }]);
    expect(shortLotLines(null)).toEqual([]);
    const lines = [{ lotKey: MEMO_LOT, lot: "L-7" }, { lotKey: OWN_LOT, lot: "" }];
    expect(lotPendingShortText({ lines: [{ index: 0, lotKey: MEMO_LOT, availablePcs: 3, availableWeightCt: "1.500" }] }, [], lines)).toBe("Row 1: only 3 pcs / 1.500 ct left in lot L-7");
    expect(lotPendingShortText(null, [{ path: "lines.1.pcs", code: "exceeds_pending", params: { availablePcs: 0, availableWeightCt: "0" } }], lines)).toBe("Row 2: this lot changed, refresh and try again");
    expect(lotPendingShortText(null, [], lines)).toBeUndefined();
  });

  it("too large: names the lot when it is on the form", () => {
    const lines = [{ lotKey: MEMO_LOT, lot: "L-7" }];
    expect(lotTooLargeMessage({ lotKey: MEMO_LOT, limit: 500 }, lines)).toBe("Lot L-7 is too large to pick in one document; contact admin");
    expect(lotTooLargeMessage({ limit: 2000 }, lines)).toBe("This lot is too large to pick in one document; contact admin");
  });

  it("sentLotLines numbers the filled rows only, as the server does", () => {
    const base = emptyQuotation();
    expect(sentLotLines({ lines: [emptyLine(), { ...base.lines[0]!, stone: "Ruby", lot: "L-7", lotKey: MEMO_LOT }] })).toEqual([{ lotKey: MEMO_LOT, lot: "L-7" }]);
    expect(sentLotLines(undefined)).toEqual([]);
  });
});
