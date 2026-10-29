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
  memoStockToLine,
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
import { gatewayError } from "../partner/helpers";

/** UT-MRT-01…08: memo-return UI rev 1 + SA rev 2 (owner 2026-10-29): rows from Memo Stock, approval step. */

const ID = "11111111-1111-4111-8111-111111111111";
const SOURCE = "22222222-2222-4222-8222-222222222222";
const noop = () => undefined;

/** A Memo Stock item whose memo receive line had 10% off 20,000 per ct: PRICE = 18,000 (Q-MR-13). */
const stockItem: MemoStockItem = {
  id: SOURCE, stockId: "260001", lot: "L-2608-003", location: "Memo", itemNote: "Unheated",
  stone: "Ruby", shape: "Oval", size: "7.2×5.4 mm", color: "Red", clarity: "VVS", cutting: "Excellent", quality: "AAA", cerType: "GIA", cerNo: "GRS2024-081233",
  receivedPcs: 10, receivedWeightCt: "3.200", pendingPcs: 10, pendingWeightCt: "3.200", priceUnit: "CTS", unitPrice: "20000.00", netUnitPrice: "18000.0000",
  currency: "THB", amount: "57600.00", vendor: { id: ID, code: "V001", name: "BC Stone Shop" },
  memoReceive: { id: ID, docNo: "MR-1", docDate: "2026-10-01", dueDate: "2026-11-01" },
};
const blank = () => emptyMemoReturn().lines[0];
const picked = (patch: Partial<MemoReturnLine> = {}): MemoReturnLine => ({ ...memoStockToLine(stockItem), pcs: "7", weightCt: "2.24", ...patch });
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
  it("edit mode: checkbox, remove, STOCK ID · LOT, Outstanding / Return, Memo PRICE, Add row; only Return Pcs / Weight are inputs", () => {
    const html = renderTable([picked(), blank()]);
    for (const title of ["STOCK ID", "LOT", "LOCATION", "COLOR · CLARITY", "CER TYPE", "Memo PRICE", "UNIT", "Amount", "Totals"]) expect(html).toContain(`>${title}<`);
    expect(html).toMatch(/colSpan="2"[^>]*>Outstanding<\/th>/);
    expect(html).toMatch(/colSpan="2"[^>]*>Return<\/th>/);
    expect(html).toContain('aria-label="Select all rows"');
    expect(html).toContain('aria-label="Remove row 1"');
    expect(html).toContain("Add row");
    expect(html).toContain("Empty row · click to pick from Memo Stock");
    expect(html).toContain('aria-label="Return pcs, row 1"');
    expect(html).toContain('aria-label="Return weight, row 1"');
    expect(html.match(/<input(?![^>]*type="checkbox")/g)).toHaveLength(2);
    expect(html).toContain("18,000.00 THB");
    expect(html).toContain("per cts");
    expect(html).toContain("40,320.00"); // 2.24 ct × 18,000
  });

  it("view mode: STOCK ID · LOT first (Memo Stock has no stone code), Return as text, no checkbox, remove, inputs or Add row", () => {
    const html = renderTable([picked()], true);
    expect(html).toContain(">STOCK ID<");
    expect(html).not.toContain(">Stone Code<");
    expect(html).toContain("260001");
    expect(html).not.toMatch(/<input|Remove row|Add row/);
    expect(html).toMatch(/>7<\/td>/);
    expect(html).toContain(">10<");
  });
});

describe("Memo Stock and form rules (UT-MRT-03/04)", () => {
  it("UT-MRT-03 a Memo Stock row becomes a return row with Return 0 / 0.00, its Stock ID, net price and Outstanding", () => {
    expect(memoStockToLine(stockItem)).toMatchObject({
      memoStockId: SOURCE, stockId: "260001", stoneCode: "", lot: "L-2608-003", locationId: "Memo", unitPrice: "18000.00", priceUnit: "PER_CT",
      itemNote: "Unheated", pcs: "0", weightCt: "0.00", outstandingPcs: "10", outstandingWeightCt: "3.200",
    });
    expect(memoStockToLine({ ...stockItem, priceUnit: "PCS", netUnitPrice: "333.3350" })).toMatchObject({ priceUnit: "PER_PCS", unitPrice: "333.34" });
    expect([...pickedStockIds([picked(), blank()])]).toEqual([SOURCE]);
  });

  it("UT-MRT-04 needs a vendor and an address, a return quantity above 0 and not above Outstanding; note up to 250", () => {
    const paths = (v: MemoReturnFormValues) => (memoReturnSchema.safeParse(v).error?.issues ?? []).map((issue) => issue.path.join("."));
    expect(paths(values())).toEqual([]);
    expect(paths(values({ vendorId: "", addressId: "" }))).toEqual(["vendorId", "addressId"]);
    expect(paths(values({ lines: [picked({ pcs: "0", weightCt: "0.00" })] }))).toEqual(["lines.0.pcs"]);
    expect(paths(values({ lines: [picked({ pcs: "11", weightCt: "3.3" })] }))).toEqual(["lines.0.pcs", "lines.0.weightCt"]);
    expect(paths(values({ documentNote: "x".repeat(MEMO_RETURN_NOTE_MAX + 1) }))).toEqual(["documentNote"]);
    expect(emptyMemoReturn().status).toBe("PENDING_APPROVAL");
    expect(paths(values({ status: "DRAFT" as never }))).toEqual(["status"]);
  });
});

describe("mapping and errors (UT-MRT-05/06)", () => {
  it("UT-MRT-05 sends the Memo Stock item with the Return quantity, drops empty rows; loads a saved document back", () => {
    const input = toMemoReturnInput(values());
    expect(input).toMatchObject({ vendorId: ID, addressId: ID });
    expect(input.lines).toHaveLength(1);
    expect(input.lines[0]).toMatchObject({ memoStockId: SOURCE, pcs: 7, weightCt: "2.24", outstandingPcs: 10, outstandingWeightCt: "3.200", photoIds: [] });
    const detail = {
      id: ID, docNo: "MRT-1", status: "PENDING_APPROVAL", version: 2, docDate: "2026-10-29", dueDate: "2026-11-29",
      vendorId: ID, vendor: { code: "V001", name: "BC Stone Shop" }, addressId: ID, addressText: "A",
      currency: "THB", exchangeRate: null, ref: "", documentNote: "",
      lines: [{
        id: ID, source: "MANUAL", stoneCode: "", stone: "Ruby", shape: "", size: "", color: "", clarity: "", cutting: "", quality: "", lot: "",
        location: "Memo", cerType: "", cerNo: "", pcs: 7, weightCt: "2.240", priceUnit: "PER_CT", unitPrice: "18000.00", discount: { type: "NONE", value: "0" },
        discountAmount: "0.00", amount: "40320.00", itemNote: "", photoIds: [], outstandingPcs: 10, outstandingWeightCt: "3.200", memoStockId: SOURCE, stockId: "260001",
      }],
      discount: { type: "NONE", value: "0" }, tax: { enabled: false, rate: "7", includeInPrice: false }, serviceCharges: [], labor: null,
      totals: { subtotal: "40320.00", discountAmount: "0.00", priceBeforeTax: "40320.00", taxAmount: "0.00", chargesAmount: "0.00", laborAmount: "0.00", grandTotal: "40320.00" },
      approvedAt: null, approvedBy: null, createdAt: "", createdBy: "", updatedAt: "",
    } satisfies MemoReturnDetail;
    expect(fromMemoReturn(detail)).toMatchObject({
      docNo: "MRT-1", version: 2, status: "PENDING_APPROVAL", vendorId: ID,
      lines: [{ pcs: "7", memoStockId: SOURCE, stockId: "260001", outstandingPcs: "10", outstandingWeightCt: "3.200" }],
    });
    expect(fromMemoReturn({ ...detail, status: "APPROVED" }).status).toBe("APPROVED");
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
