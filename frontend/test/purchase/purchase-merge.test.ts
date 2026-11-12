import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { createElement, type ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { FormProvider, useForm } from "react-hook-form";
import { describe, expect, it } from "vitest";
import {
  applyMerge,
  emptyPurchase,
  findMergePairs,
  fromPurchase,
  mapPurchaseSaveError,
  memoStockToPurchaseLine,
  mergedPurchaseLine,
  mergePartAmount,
  MERGED_TAG,
  pickedRowCount,
  pickedSourceKeys,
  purchaseSchema,
  purchaseStockNote,
  purchaseTableLine,
  toPurchaseInput,
  vendorChangeConfirm,
  type PurchaseFormValues,
  type PurchaseLine,
} from "@/features/purchase/api";
import { PURCHASE_KIND } from "@/features/purchase/components/PurchasePage";
import { MERGE_BODY, MergeDialog, mergeTitle } from "@/features/purchase/components/merge-dialog";
import { ItemEditorPanel, stockQuantityBound } from "@/features/quotation/components/items/ItemEditorPanel";
import { DocumentKindContext } from "@/features/quotation/document-kind";
import { emptyQuotation } from "@/features/quotation/lib/defaults";
import type { QuotationLine } from "@/features/quotation/schema";
import { gatewayError } from "../partner/helpers";
import { ID, memoRow, savedLine, savedPurchase, STOCK } from "./fixtures";

/**
 * UT-PU-12…16: purchase UI rev 3 + SA rev 2 (owner 2026-11-05/06, ADR-0043): the Sold and In-stock parts of one Memo
 * Stock item merge into one row (Sold part first), and a Sold row edits only its Price.
 */

const OTHER = "99999999-9999-4999-8999-999999999999";
const noop = () => undefined;
// Owner example: Sold 1 pc / 0.76 ct + In stock 1 pc / 0.76 ct of one Stock ID.
const sold = (memoStockId = STOCK) => memoStockToPurchaseLine(memoRow({ key: `${memoStockId}:SOLD`, memoStockId, status: "SOLD", availablePcs: 1, availableWeightCt: "0.760", netUnitPrice: "1450.0000" }));
const inStock = (memoStockId = STOCK) => memoStockToPurchaseLine(memoRow({ key: `${memoStockId}:IN_STOCK`, memoStockId, status: "IN_STOCK", availablePcs: 1, availableWeightCt: "0.760", netUnitPrice: "1450.0000" }));

const valid = (lines: PurchaseLine[]): PurchaseFormValues => ({ ...emptyPurchase(), docDate: "2026-11-06", dueDate: "2026-12-06", vendorId: ID, addressId: ID, currency: "USD", lines });
const issues = (values: PurchaseFormValues) => {
  const result = purchaseSchema.safeParse(values);
  return result.success ? [] : result.error.issues.map((issue) => `${issue.path.join(".")}: ${issue.message}`);
};

function panel(line: QuotationLine) {
  function Form({ children }: { children: ReactNode }) {
    const form = useForm({ defaultValues: { ...emptyQuotation(), lines: [line] } });
    return createElement(FormProvider, form as never, children);
  }
  return renderToStaticMarkup(createElement(QueryClientProvider, { client: new QueryClient() }, createElement(DocumentKindContext.Provider, { value: PURCHASE_KIND },
    createElement(Form, null, createElement(ItemEditorPanel, { index: 0, total: 1, readOnly: false, onPrev: noop, onNext: noop, onNextRow: noop, onRemove: noop, onClose: noop })))));
}
const input = (html: string, field: string) => new RegExp(`<input[^>]*name="lines\\.0\\.${field}"[^>]*>`).exec(html)?.[0] ?? "";

describe("UT-PU-12 finding pairs (R3-01, Q-PU-24/27)", () => {
  it("a pair is the SOLD and the IN_STOCK row of one Memo Stock item, ticked together", () => {
    const picked = [inStock(), sold(), inStock(OTHER)];
    const pairs = findMergePairs(picked, []);
    expect(pairs).toHaveLength(1);
    expect(pairs[0]).toMatchObject({ memoStockId: STOCK, stockId: "260003", sold: { line: picked[1], existingIndex: null }, inStock: { line: picked[0], existingIndex: null } });
    expect(findMergePairs([sold(), inStock(OTHER)], [])).toEqual([]);
    expect(findMergePairs([sold()], [])).toEqual([]);
  });

  it("a ticked row pairs with the other part already on the form (Q-PU-27), not with a merged row", () => {
    const onForm = [emptyPurchase().lines[0]!, inStock()];
    expect(findMergePairs([sold()], onForm)).toMatchObject([{ memoStockId: STOCK, inStock: { existingIndex: 1 }, sold: { existingIndex: null } }]);
    const mergedOnForm = [mergedPurchaseLine(sold(), inStock())];
    expect(findMergePairs([sold()], mergedOnForm)).toEqual([]);
  });

  it("the merged row leaves both picker rows out; a single row leaves only its own", () => {
    expect([...pickedSourceKeys([mergedPurchaseLine(sold(), inStock())])]).toEqual([`${STOCK}:SOLD`, `${STOCK}:IN_STOCK`]);
    expect([...pickedSourceKeys([sold()])]).toEqual([`${STOCK}:SOLD`]);
  });
});

describe("UT-PU-13 merge and don't merge (R3-01/02)", () => {
  it("Merge: one row per pair, Pcs / Weight = Sold + In stock, min = the Sold part, one Price; other rows stay in order", () => {
    const picked = [inStock(OTHER), sold(), inStock()];
    const { rows, replace } = applyMerge(picked, findMergePairs(picked, []));
    expect(replace.size).toBe(0);
    expect(rows).toHaveLength(2);
    expect(rows[0]).toBe(picked[0]);
    expect(rows[1]).toMatchObject({
      memoStockId: STOCK, memoGroup: "MERGED", pcs: "2", weightCt: "1.520", stockPendingPcs: "2", stockPendingWeightCt: "1.520",
      stockMinPcs: "1", stockMinWeightCt: "0.760", unitPrice: "1450.00", stockId: "260003", source: "STOCK",
    });
  });

  it("Merge with the other part on the form replaces that row in place and keeps its key; nothing new is added", () => {
    const onForm = [inStock()];
    const picked = [sold()];
    const { rows, replace } = applyMerge(picked, findMergePairs(picked, onForm));
    expect(rows).toEqual([]);
    expect(replace.get(0)).toMatchObject({ key: onForm[0]!.key, memoGroup: "MERGED", pcs: "2", stockMinPcs: "1" });
  });

  it("the question (design 09/10): title, both parts with amounts, total to buy, Merge preselected, Back to list", () => {
    const pairs = findMergePairs([sold(), inStock()], []);
    const html = renderToStaticMarkup(createElement(MergeDialog, { pairs, currency: "USD", separateCount: 2, onMerge: noop, onSplit: noop, onBack: noop }));
    expect(mergeTitle(pairs)).toBe("260003 is both sold and in stock");
    expect(html).toContain(">260003 is both sold and in stock</h2>");
    expect(html).toContain(MERGE_BODY);
    expect(mergePartAmount(sold())).toBe("1102.00");
    expect(html).toContain("1,102.00 USD");
    expect(html).toContain("Total to buy");
    expect(html).toContain("2,204.00 USD");
    expect(html).toContain("MR-1001 · L-2607-007");
    expect(html).toMatch(/<input type="radio"[^>]*checked=""[^>]*>[\s\S]*Merge into one row/);
    expect(html).toContain("Recommended if you buy it all");
    expect(html).toContain("Don&#x27;t merge · keep separate rows");
    expect(html).toContain(">Back to list</button>");
    expect(html).toContain(">Merge</button>");
    expect(mergeTitle([...pairs, ...pairs])).toBe("2 items are both sold and in stock");
  });
});

describe("UT-PU-14 merged-row limits (R3-02, Q-PU-31)", () => {
  const merged = () => mergedPurchaseLine(sold(), inStock());

  it("between the Sold part and Sold + In stock, pcs and weight each on their own", () => {
    expect(issues(valid([merged()]))).toEqual([]);
    expect(issues(valid([{ ...merged(), pcs: "1", weightCt: "0.760" }]))).toEqual([]);
    expect(issues(valid([{ ...merged(), pcs: "0", weightCt: "0.5" }]))).toEqual([
      "lines.0.pcs: At least 1 pcs (already sold to customers)",
      "lines.0.weightCt: At least 0.760 ct (already sold to customers)",
    ]);
    expect(issues(valid([{ ...merged(), pcs: "3", weightCt: "1.521" }]))).toEqual([
      "lines.0.pcs: More than the available 2 pcs",
      "lines.0.weightCt: More than the available 1.520 ct",
    ]);
  });

  it("leaving Pcs or Weight snaps it back into the Sold part…Sold + In stock (owner 2026-11-06)", () => {
    expect(stockQuantityBound("1", "5", "10")).toBe("5");
    expect(stockQuantityBound("", "5", "10")).toBe("5");
    expect(stockQuantityBound("4.999", "5.000", "10.000")).toBe("5.000");
    expect(stockQuantityBound("12", "5", "10")).toBe("10");
    expect(stockQuantityBound("7", "5", "10")).toBeNull();
    expect(stockQuantityBound("5", "5", "10")).toBeNull();
    // Rows without a minimum (In stock, PO, other pages) never snap.
    expect(stockQuantityBound("0", "", "10")).toBeNull();
    expect(stockQuantityBound("0", undefined, "10")).toBeNull();
  });

  it("the table tags it and the row panel explains the parts; Pcs / Weight stay editable", () => {
    expect(purchaseTableLine(merged()).stockId).toBe(`260003 · ${MERGED_TAG}`);
    expect(purchaseStockNote(merged())).toBe("Sold 1 pcs / 0.760 cts must be purchased. Up to 1 pcs / 0.760 cts more from stock.");
    const html = panel(merged());
    expect(input(html, "pcs")).not.toMatch(/ readOnly=""/);
    expect(input(html, "weightCt")).not.toMatch(/ readOnly=""/);
    expect(html).toContain("Up to 1 pcs / 0.760 cts more from stock.");
  });
});

describe("UT-PU-15 Sold rows edit only Price (R3-03, Q-PU-29/30)", () => {
  it("Pcs and Weight are fixed at the Sold part; Price and Item Note stay editable; In-stock rows are unchanged", () => {
    const html = panel(sold());
    expect(input(html, "pcs")).toMatch(/ readOnly=""/);
    expect(input(html, "weightCt")).toMatch(/ readOnly=""/);
    expect(input(html, "unitPrice")).not.toMatch(/ (readOnly|disabled)=""/);
    expect(input(html, "itemNote")).not.toMatch(/ (readOnly|disabled)=""/);
    expect(html).toContain("Sold to customers: 1 pcs / 0.760 cts must be purchased whole.");
    const stockHtml = panel(inStock());
    expect(input(stockHtml, "pcs")).not.toMatch(/ readOnly=""/);
    expect(stockHtml).toContain("Pending 1 pcs");
    expect(issues(valid([{ ...sold(), pcs: "0", weightCt: "0" }]))).toContain("lines.0.pcs: At least 1 pcs (already sold to customers)");
  });
});

describe("UT-PU-16 contract mapping and errors (SA-PU-26)", () => {
  it("a merged row is sent as memoGroup MERGED; a saved one comes back with its min and cap", () => {
    const sent = toPurchaseInput(valid([mergedPurchaseLine(sold(), inStock())]));
    expect(sent.lines[0]).toMatchObject({ source: "STOCK", memoStockId: STOCK, memoGroup: "MERGED", pcs: 2, weightCt: "1.520", discount: { type: "NONE" } });
    const detail = savedPurchase({
      lines: [savedLine({ source: "STOCK", memoStockId: STOCK, memoGroup: "MERGED", stockId: "260003", stoneCodeId: null, discount: { type: "NONE", value: "0" }, memoReceive: { docNo: "MR-1001" }, pcs: 2, weightCt: "1.520", limitPcs: 2, limitWeightCt: "1.520", minPcs: 1, minWeightCt: "0.760", soldPartPcs: null, soldPartWeightCt: null })],
    });
    // ADR-0048 (owner 2026-11-11): saved photos load back in order, read from this document's own photo route.
    expect(fromPurchase({ ...detail, lines: detail.lines.map((line) => ({ ...line, photoIds: ["p1", "p2"] })) } as typeof detail).lines[0]?.photos).toEqual([
      { id: "p1", name: "Photo 1", url: "/api/v1/purchase/photos/p1" },
      { id: "p2", name: "Photo 2", url: "/api/v1/purchase/photos/p2" },
    ]);
    expect(fromPurchase(detail).lines[0]).toMatchObject({ memoGroup: "MERGED", stockPendingPcs: "2", stockPendingWeightCt: "1.520", stockMinPcs: "1", stockMinWeightCt: "0.760" });
  });

  it("save and approve errors of the Sold rules land on the row", () => {
    const err = (domainCode: string, fieldErrors: { path: string; code: string }[]) => mapPurchaseSaveError(gatewayError({ domainCode, fieldErrors }));
    expect(err("VALIDATION_ERROR", [{ path: "lines.1.pcs", code: "below_sold" }])).toEqual({
      fieldErrors: [{ name: "lines.1.pcs", message: "At least the quantity already sold to customers" }],
      message: "Row 2: the quantity already sold to customers must be purchased. Nothing was saved.",
    });
    expect(err("VALIDATION_ERROR", [{ path: "lines.0.weightCt", code: "must_equal_sold" }]).fieldErrors).toEqual([{ name: "lines.0.weightCt", message: "A sold item is purchased whole" }]);
    expect(err("VALIDATION_ERROR", [{ path: "lines.0.memoStockId", code: "not_mergeable" }]).message).toBe("Row 1: this item has nothing left in stock to merge. Remove the row and choose again.");
    const short = err("PURCHASE_PENDING_SHORT", [{ path: "lines.1.pcs", code: "exceeds_available" }, { path: "lines.2.pcs", code: "below_sold" }]);
    expect(short.message).toBe("Rows 2, 3: not enough is available any more. Lower the quantity or remove the row, then save and approve again.");
    expect(short.fieldErrors).toEqual([
      { name: "lines.1.pcs", message: "More than the available quantity" },
      { name: "lines.2.pcs", message: "At least the quantity already sold to customers" },
    ]);
  });
});

describe("INV-20261107-002/003 vendor change and row tags", () => {
  it("counts only picked rows and asks with the row count and any currency switch", () => {
    const manual = { ...emptyPurchase().lines[0]!, stone: "Ruby", pcs: "1", weightCt: "1", unitPrice: "10" };
    expect(pickedRowCount([sold(), inStock(), manual, emptyPurchase().lines[0]!])).toBe(2);
    expect(pickedRowCount([manual])).toBe(0);
    expect(vendorChangeConfirm(2, null)).toEqual({
      title: "Change the vendor?", body: "This removes the 2 rows taken from Memo Stock and Purchase Orders. Rows you keyed in stay.",
      cancelLabel: "Keep vendor", confirmLabel: "Change vendor",
    });
    expect(vendorChangeConfirm(1, "AED").body).toBe("This removes the 1 row taken from Memo Stock and Purchase Orders. Rows you keyed in stay. The currency changes to AED.");
  });

  it("separate Sold and In-stock rows of one Stock ID show their part in the table", () => {
    expect(purchaseTableLine(sold()).stockId).toBe("260003 · Sold");
    expect(purchaseTableLine(inStock()).stockId).toBe("260003 · In stock");
    expect(purchaseTableLine(mergedPurchaseLine(sold(), inStock())).stockId).toBe(`260003 · ${MERGED_TAG}`);
  });
});

