import { FLOW_DETAIL } from "../trade-document/flow-fixture";
import { readFileSync } from "node:fs";
import { createElement, type ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { FormProvider, useForm } from "react-hook-form";
import { describe, expect, it } from "vitest";
import { navigationHref } from "@/features/home/navigation";
import {
  emptyMemoReturn,
  fromMemoReturn,
  mapMemoReturnSaveError,
  MEMO_RETURN_HREF,
  MEMO_RETURN_NOTE_MAX,
  memoReturnHref,
  memoReturnSchema,
  lotToLine,
  pickedStockIds,
  toMemoReturnInput,
  type MemoReturnDetail,
  type MemoReturnFormValues,
  type MemoReturnLine,
  type MemoStockItem,
} from "@/features/memo-return/api";
import { MemoReturnItemTable } from "@/features/memo-return/components/MemoReturnPage";
import { calculateTotals } from "@/features/quotation/lib/calculate";
import { emptyQuotation } from "@/features/quotation/lib/defaults";
import { documentAccess } from "@/features/trade-document/document-api";
import { VendorDocumentDetails } from "@/features/trade-document/vendor-info-form";
import { lotShortText } from "@/features/trade-document/lot-stock";
import { gatewayError } from "../partner/helpers";

/** UT-MRT-01…08: memo-return UI rev 1 + SA rev 2 (owner 2026-10-29): rows from Memo Stock, approval step. */

const ID = "11111111-1111-4111-8111-111111111111";
const SOURCE = "22222222-2222-4222-8222-222222222222";
const noop = () => undefined;

/** A Memo Stock item whose memo receive line had 10% off 20,000 per ct: PRICE = 18,000 (Q-MR-13). */
const LOT = `ML${"d".repeat(32)}`;
const stockItem: MemoStockItem = {
  lotKey: LOT, source: "MEMO_STOCK", merged: false, lot: "L-2608-003", location: "Memo", itemNote: "Unheated", stoneCode: "",
  stone: "Ruby", shape: "Oval", size: "7.2×5.4 mm", color: "Red", clarity: "VVS", cutting: "Excellent", quality: "AAA", cerType: "GIA", cerNo: "GRS2024-081233",
  refCount: 1, pendingPcs: 10, pendingWeightCt: "3.200", priceUnit: "PER_CT", unitPrice: "20000.00", netUnitPrice: "18000.0000",
  currency: "THB", amount: "57600.00", vendor: { id: ID, code: "V001", name: "BC Stone Shop" },
  ref: { type: "MEMO_RECEIVE" as const, id: ID, docNo: "MR-1", docDate: "2026-10-01" },
};
const blank = () => emptyMemoReturn().lines[0];
const picked = (patch: Partial<MemoReturnLine> = {}): MemoReturnLine => ({ ...lotToLine(stockItem), pcs: "7", weightCt: "2.24", ...patch });
const values = (patch: Partial<MemoReturnFormValues> = {}): MemoReturnFormValues => ({ ...emptyMemoReturn(), dueDate: "2026-11-29", currency: "THB", vendorId: ID, addressId: ID, lines: [picked(), blank()], ...patch });

const props = (lines: MemoReturnLine[], readOnly: boolean) => ({
  lines,
  currency: "THB",
  totals: calculateTotals({ ...emptyQuotation(), lines }),
  selectedIndex: null,
  checkedKeys: new Set<string>(),
  readOnly,
  emptyRowText: "Empty row · click to pick from Memo Stock",
  onSelectRow: noop,
  onToggleCheck: noop,
  onToggleAll: noop,
  onRowAction: noop,
  onAddRow: () => 0,
});
function InForm({ lines, children }: { lines: MemoReturnLine[]; children?: ReactNode }) {
  const form = useForm<MemoReturnFormValues>({ defaultValues: values({ lines }) });
  return createElement(FormProvider<MemoReturnFormValues>, form as Parameters<typeof FormProvider<MemoReturnFormValues>>[0], children);
}
const renderTable = (lines: MemoReturnLine[], readOnly = false) => renderToStaticMarkup(createElement(InForm, { lines }, createElement(MemoReturnItemTable, props(lines, readOnly))));

describe("navigation and access (UT-MRT-01)", () => {
  it("links Memo Return to its pages and reads the memo-return leaf", () => {
    expect(navigationHref({ label: "Memo Return", slug: "memo-return" })).toBe("/memo/memo-return");
    expect(MEMO_RETURN_HREF).toBe("/memo/memo-return");
    expect(memoReturnHref(ID)).toBe(`/memo/memo-return/${ID}`);
    expect(documentAccess({ isSuperAdmin: false, permissions: ["memo-return:VIEW"] }, "memo-return")).toEqual({ view: true, add: false, edit: false, delete: false, approve: false });
    expect(documentAccess({ isSuperAdmin: false, permissions: ["memo-receive:VIEW"] }, "memo-return").view).toBe(false);
    expect(documentAccess({ isSuperAdmin: false, permissions: ["memo-return:VIEW", "memo-return:APPROVE"] }, "memo-return").approve).toBe(true);
  });
});

describe("item table (UT-MRT-02, design)", () => {
  it("edit mode: checkbox, remove, Lot / Stone Code, Outstanding / Return, Memo Price, Add row; only Return Pcs / Weight are inputs", () => {
    const html = renderTable([picked(), blank()]);
    for (const title of ["Lot / Stone Code", "Location", "Color · Clarity", "Cer Type", "Memo Price", "Unit", "Amount", "Totals"]) expect(html).toContain(`>${title}<`);
    expect(html).toMatch(/colSpan="2"[^>]*>Outstanding<\/th>/);
    expect(html).toMatch(/colSpan="2"[^>]*>Return<\/th>/);
    expect(html).toContain('aria-label="Select all rows"');
    expect(html).toContain('aria-label="Remove row 1"');
    expect(html).toContain("Add row");
    expect(html).toContain("Empty row · click to pick from Memo Stock");
    expect(html).toContain('aria-label="Return pcs, row 1"');
    expect(html).toContain('aria-label="Return weight, row 1"');
    // UT-MRT-10: numbers only, with a 0 placeholder (owner 2026-10-29).
    expect(html).toMatch(/aria-label="Return pcs, row 1"[^>]*placeholder="0"[^>]*inputMode="numeric"|placeholder="0"[^>]*aria-label="Return pcs, row 1"/);
    expect(html).toMatch(/placeholder="0.00"/);
    expect(html.match(/<input(?![^>]*type="checkbox")/g)).toHaveLength(2);
    expect(html).toContain("18,000.00 THB");
    expect(html).toContain("per cts");
    expect(html).toContain("40,320.00"); // 2.24 ct × 18,000
    expect(html).not.toContain("Stock ID");
    expect(html).toContain("L-2608-003");
  });

  it("view mode: the Lot leads (no Stock ID), Return as text, no checkbox, remove, inputs or Add row", () => {
    const html = renderTable([picked()], true);
    expect(html).not.toContain("Stock ID");
    expect(html).toContain(">Lot / Stone Code<");
    expect(html).toContain("L-2608-003");
    expect(html).not.toContain("260001");
    expect(html).not.toMatch(/<input|Remove row|Add row/);
    expect(html).toMatch(/>7<\/td>/);
    expect(html).toContain(">10<");
  });
});

describe("Memo Stock and form rules (UT-MRT-03/04)", () => {
  it("UT-MRT-03 a Memo Stock lot becomes a return row with an empty Return, its lotKey (no Stock ID), net price and Outstanding", () => {
    expect(lotToLine(stockItem)).toMatchObject({
      lotKey: LOT, memoStockId: "", stockId: "", stoneCode: "", lot: "L-2608-003", locationId: "Memo", unitPrice: "18000.00", priceUnit: "PER_CT",
      itemNote: "Unheated", pcs: "", weightCt: "", outstandingPcs: "10", outstandingWeightCt: "3.200",
    });
    expect(lotToLine({ ...stockItem, priceUnit: "PER_PCS", netUnitPrice: "333.3350" })).toMatchObject({ priceUnit: "PER_PCS", unitPrice: "333.34" });
    expect([...pickedStockIds([picked(), blank()])]).toEqual([LOT]);
  });

  it("UT-MRT-04 needs a vendor and an address, a return quantity above 0 and not above Outstanding; note up to 250", () => {
    const paths = (v: MemoReturnFormValues) => (memoReturnSchema.safeParse(v).error?.issues ?? []).map((issue) => issue.path.join("."));
    expect(paths(values())).toEqual([]);
    expect(paths(values({ vendorId: "", addressId: "" }))).toEqual(["vendorId", "addressId"]);
    expect(paths(values({ lines: [picked({ pcs: "0", weightCt: "0.00" })] }))).toEqual(["lines.0.pcs"]);
    expect(paths(values({ lines: [picked({ pcs: "", weightCt: "" })] }))).toEqual(["lines.0.pcs"]);
    expect(paths(values({ lines: [picked({ pcs: "", weightCt: "1.5" })] }))).toEqual([]);
    expect(paths(values({ lines: [picked({ pcs: "11", weightCt: "3.3" })] }))).toEqual(["lines.0.pcs", "lines.0.weightCt"]);
    expect(paths(values({ documentNote: "x".repeat(MEMO_RETURN_NOTE_MAX + 1) }))).toEqual(["documentNote"]);
    expect(emptyMemoReturn().status).toBe("DRAFT");
    expect(paths(values({ status: "REVISION_REQUESTED" }))).toEqual([]);
    expect(paths(values({ status: "BOGUS" as never }))).toEqual(["status"]);
  });
});

describe("mapping and errors (UT-MRT-05/06)", () => {
  it("UT-MRT-05 sends the lotKey with the Return quantity, drops empty rows; loads a saved document back", () => {
    const input = toMemoReturnInput(values());
    expect(input).toMatchObject({ vendorId: ID, addressId: ID });
    expect(input.lines).toHaveLength(1);
    expect(input.lines[0]).toMatchObject({ lotKey: LOT, memoStockId: null, pcs: 7, weightCt: "2.24", outstandingPcs: 10, outstandingWeightCt: "3.200", photoIds: [] });
    const detail = {
      id: ID, docNo: "MRT-1", status: "PENDING_APPROVAL", version: 2, docDate: "2026-10-29", dueDate: "2026-11-29",
      vendorId: ID, vendor: { code: "V001", name: "BC Stone Shop" }, addressId: ID, addressText: "A",
      currency: "THB", exchangeRate: null, ref: "", documentNote: "",
      lines: [{
        id: ID, source: "MANUAL", stoneCode: "", stone: "Ruby", shape: "", size: "", color: "", clarity: "", cutting: "", quality: "", lot: "",
        location: "Memo", cerType: "", cerNo: "", pcs: 7, weightCt: "2.240", priceUnit: "PER_CT", unitPrice: "18000.00", discount: { type: "NONE", value: "0" },
        discountAmount: "0.00", amount: "40320.00", itemNote: "", photoIds: [], outstandingPcs: 10, outstandingWeightCt: "3.200", memoStockId: null, stockId: null, lotKey: LOT, allocated: true,
      }],
      discount: { type: "NONE", value: "0" }, tax: { enabled: false, rate: "7", includeInPrice: false }, serviceCharges: [], labor: null,
      totals: { subtotal: "40320.00", discountAmount: "0.00", priceBeforeTax: "40320.00", taxAmount: "0.00", chargesAmount: "0.00", laborAmount: "0.00", grandTotal: "40320.00" },
      approvedAt: null, approvedBy: null, createdAt: "", createdBy: "", updatedAt: "", deletedAt: null, deletedBy: null, ...FLOW_DETAIL,
    } satisfies MemoReturnDetail;
    // ADR-0048 (owner 2026-11-11): saved photos load back in order, read from this document's own photo route.
    expect(fromMemoReturn({ ...detail, lines: detail.lines.map((line) => ({ ...line, photoIds: ["p1", "p2"] })) } as typeof detail).lines[0]?.photos).toEqual([
      { id: "p1", name: "Photo 1", url: "/api/v1/memo-return/photos/p1" },
      { id: "p2", name: "Photo 2", url: "/api/v1/memo-return/photos/p2" },
    ]);
    expect(fromMemoReturn(detail)).toMatchObject({
      docNo: "MRT-1", version: 2, status: "PENDING_APPROVAL", vendorId: ID,
      lines: [{ pcs: "7", memoStockId: "", lotKey: LOT, stockId: "", outstandingPcs: "10", outstandingWeightCt: "3.200" }],
    });
    expect(fromMemoReturn({ ...detail, status: "APPROVED" }).status).toBe("APPROVED");
    // A legacy line (saved before lots) keeps its item id, sends it unchanged, and still shows no Stock ID.
    const legacy = fromMemoReturn({ ...detail, lines: [{ ...detail.lines[0]!, memoStockId: SOURCE, lotKey: null }] });
    expect(legacy.lines[0]).toMatchObject({ memoStockId: SOURCE, lotKey: "", stockId: "" });
    expect(toMemoReturnInput({ ...legacy }).lines[0]).toMatchObject({ memoStockId: SOURCE, lotKey: null });
  });

  it("UT-MRT-06b lot errors name the row and the lot: short (approve), unavailable, vendor / currency mismatch, too large", () => {
    const form = values({ lines: [picked(), picked({ key: "k2", lotKey: `ML${"e".repeat(32)}`, lot: "L-9" })] });
    const withDetails = gatewayError({ domainCode: "MEMO_RETURN_PENDING_SHORT", httpStatus: 409, code: "CONFLICT", details: { lines: [{ index: 1, lotKey: `ML${"e".repeat(32)}`, availablePcs: 2, availableWeightCt: "0.500" }] } });
    expect(mapMemoReturnSaveError(withDetails, form).message).toBe(`${lotShortText(2, { pcs: 2, weightCt: "0.500" }, "L-9")}. Nothing was saved.`);
    const code = (domainCode: string, path: string, errorCode: string) => mapMemoReturnSaveError(gatewayError({ domainCode, httpStatus: 422, fieldErrors: [{ path, code: errorCode }] }), form).message;
    expect(code("STOCK_LOT_UNAVAILABLE", "lines.0.reference", "unavailable")).toBe("Row 1: this lot has nothing left");
    expect(code("VALIDATION_ERROR", "lines.1.reference", "vendor_mismatch")).toBe("Row 2: This lot is from another vendor. Remove the row.");
    expect(code("VALIDATION_ERROR", "lines.1.reference", "currency_mismatch")).toBe("Row 2: This lot is in another currency. Remove the row.");
    expect(mapMemoReturnSaveError(gatewayError({ domainCode: "STOCK_LOT_TOO_LARGE", httpStatus: 422, details: { lotKey: LOT, limit: 500 } }), form).message).toBe("Lot L-2608-003 is too large to pick in one document; contact admin");
  });

  it("UT-MRT-06 maps MEMO_RETURN_* codes", () => {
    expect(mapMemoReturnSaveError(gatewayError({ domainCode: "MEMO_RETURN_REFERENCE_INVALID", httpStatus: 422, fieldErrors: [{ path: "lines.0.memoStockId", code: "invalid_reference" }] })))
      .toMatchObject({ fieldErrors: [{ name: "lines", message: "Check item row 1" }] });
    expect(mapMemoReturnSaveError(gatewayError({ domainCode: "MEMO_RETURN_CHANGED", httpStatus: 409, code: "CONFLICT" })).message).toContain("Someone else changed this memo return");
    expect(mapMemoReturnSaveError(gatewayError({ domainCode: "MEMO_RETURN_STATUS_INVALID", httpStatus: 409, code: "CONFLICT" })).message).toContain("can't be changed in its current status");
    // UT-MRT-08: approval found less pending than a row returns.
    expect(mapMemoReturnSaveError(gatewayError({ domainCode: "MEMO_RETURN_PENDING_SHORT", httpStatus: 409, code: "CONFLICT" })).message).toContain("no longer have enough pending");
  });
});

describe("view header (UT-MRT-07, design view)", () => {
  it("shows the saved header as text in a Memo Return Details card", () => {
    const options = { vendors: [{ id: ID, code: "V001", name: "BC Stone Shop Co., Ltd.", active: true, currency: "THB", addresses: [{ id: ID, label: "BC Stone Shop, Silom Rd.", isDefault: true }] }] };
    const html = renderToStaticMarkup(createElement(VendorDocumentDetails, { title: "Memo Return Details", values: { ...values(), docDate: "2026-10-03", dueDate: "2026-10-03", exchangeRate: "", ref: "" }, options }));
    expect(html).toContain("Memo Return Details");
    for (const label of ["Doc Date", "Due Date", "Vendor", "Address", "Currency", "Exchange Rate", "Ref."]) expect(html).toContain(`>${label}<`);
    expect(html).toContain("V001 · BC Stone Shop Co., Ltd.");
    expect(html).toContain("BC Stone Shop, Silom Rd.");
    expect(html).toContain("03/10/2026");
  });
});

describe("no Due Date on Memo Return (UT-MRT-08, owner 2026-11-16)", () => {
  it("the view card drops Due Date for Memo Return only; other vendor documents keep it", () => {
    const options = { vendors: [{ id: ID, code: "V001", name: "BC Stone Shop Co., Ltd.", active: true, currency: "THB", addresses: [{ id: ID, label: "A", isDefault: true }] }] };
    const card = (showDueDate?: boolean) =>
      renderToStaticMarkup(createElement(VendorDocumentDetails, { title: "T", values: { ...values(), docDate: "2026-10-03", dueDate: "2026-10-09" }, options, showDueDate }));
    expect(card(false)).not.toContain(">Due Date<");
    expect(card(false)).not.toContain("09/10/2026");
    expect(card(false)).toContain(">Doc Date<");
    expect(card()).toContain(">Due Date<");
    const page = readFileSync("src/features/memo-return/components/MemoReturnPage.tsx", "utf8");
    expect(page).toContain("<VendorDocumentInfoForm options={options} onVendorChange={onVendorChange} showDueDate={false} />");
    expect(page).toContain('title="Memo Return Details" values={values} options={options} showDueDate={false}');
  });

  it("the API gets the Doc Date as its required Due Date, and a hidden empty or older Due Date never blocks Save", () => {
    expect(toMemoReturnInput(values({ docDate: "2026-11-16", dueDate: "" })).dueDate).toBe("2026-11-16");
    expect(toMemoReturnInput(values({ docDate: "2026-11-16", dueDate: "2026-12-31" })).dueDate).toBe("2026-11-16");
    for (const dueDate of ["", "2026-01-01"]) {
      const result = memoReturnSchema.safeParse(values({ docDate: "2026-11-16", dueDate }));
      expect(result.success ? [] : result.error.issues.filter((issue) => issue.path[0] === "dueDate")).toEqual([]);
    }
  });
});

describe("table headers (owner 2026-10-29: Title Case)", () => {
  it("UT-MRT-09 no all-caps header words except acronyms", () => {
    const headers = [...renderTable([picked(), blank()]).matchAll(/<th[^>]*>([\s\S]*?)<\/th>/g)].map((m) => m[1].replace(/<[^>]+>/g, " ")).join(" ");
    const caps = (headers.match(/\b[A-Z]{2,}\b/g) ?? []).filter((word) => word !== "ID");
    expect(caps).toEqual([]);
  });
});

describe("Return cells accept numbers only (UT-MRT-10, owner 2026-10-29)", () => {
  it("drops letters and symbols and keeps the server limits", async () => {
    const { sanitizeQuantity } = await import("@/features/quotation/lib/number");
    expect(sanitizeQuantity("dfgfdgdf", 6, 0)).toBe("");
    expect(sanitizeQuantity("1a2b3", 6, 0)).toBe("123");
    expect(sanitizeQuantity("7.5", 6, 0)).toBe("75");
    expect(sanitizeQuantity("12345678", 6, 0)).toBe("123456");
    expect(sanitizeQuantity("1000000", 5, 3)).toBe("10000");
    expect(sanitizeQuantity("2.2456", 5, 3)).toBe("2.245");
    expect(sanitizeQuantity("1,234.5x", 5, 3)).toBe("1234.5");
    expect(sanitizeQuantity(".5", 5, 3)).toBe("0.5");
    expect(sanitizeQuantity("-3", 5, 3)).toBe("3");
  });
});
