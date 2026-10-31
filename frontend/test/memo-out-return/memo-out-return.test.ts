import { createElement, type ReactNode } from "react";
import { FormProvider, useForm } from "react-hook-form";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { navigationHref } from "@/features/home/navigation";
import {
  emptyMemoOutReturn,
  fromMemoOutReturn,
  mapMemoOutReturnSaveError,
  MEMO_OUT_RETURN_HREF,
  MEMO_OUT_RETURN_NOTE_MAX,
  memoOutReturnHref,
  memoOutReturnSchema,
  memoOutstandingInput,
  outstandingToLine,
  pickedOutLineIds,
  toMemoOutReturnInput,
  type MemoOutReturnDetail,
  type MemoOutstandingItem,
  type MemoOutReturnFormValues,
  type MemoOutReturnLine,
} from "@/features/memo-out-return/api";
import { ReturnItemTable } from "@/features/memo-out-return/components/ReturnItemTable";
import { ItemTable } from "@/features/quotation/components/items/ItemTable";
import { calculateTotals } from "@/features/quotation/lib/calculate";
import { emptyLine, emptyQuotation } from "@/features/quotation/lib/defaults";
import { documentAccess } from "@/features/trade-document/document-api";
import { gatewayError } from "../partner/helpers";

/** UT-MOR-01…06, UT-MOR-21…23: memo-out-return UI rev 3 (table) + rev 4 / SA rev 2 (owner 2026-10-31: customer, Memo Outstanding, Approve). */

const ID = "11111111-1111-4111-8111-111111111111";
const noop = () => undefined;
const blank = (): MemoOutReturnLine => ({ ...emptyLine(), memoOutLineId: "", memoOutNo: "", outstandingPcs: "", outstandingWeightCt: "" });
const filled: MemoOutReturnLine = { ...emptyLine(), stone: "Ruby", stoneCode: "RU-1", lot: "L7", pcs: "2", weightCt: "1.5", unitPrice: "1000", memoOutLineId: ID, memoOutNo: "MO-1", outstandingPcs: "3", outstandingWeightCt: "2.25" };
const props = (lines: MemoOutReturnLine[] = [blank(), blank()], emptyRowText?: string) => ({
  lines,
  currency: "THB",
  totals: calculateTotals({ ...emptyQuotation(), lines }),
  selectedIndex: null,
  checkedKeys: new Set<string>(),
  readOnly: false,
  onSelectRow: noop,
  onToggleCheck: noop,
  onToggleAll: noop,
  onRowAction: noop,
  onAddRow: () => 0,
  ...(emptyRowText ? { emptyRowText } : {}),
});
const values = (patch: Partial<MemoOutReturnFormValues> = {}): MemoOutReturnFormValues => ({ ...emptyMemoOutReturn(), dueDate: "2026-11-28", currency: "THB", customerId: ID, shippingAddressId: ID, invoiceAddressId: ID, lines: [filled, blank()], ...patch });

/** The Return cells register with the document form, so the table renders inside one. */
function InForm({ lines, children }: { lines: MemoOutReturnLine[]; children?: ReactNode }) {
  const form = useForm<MemoOutReturnFormValues>({ defaultValues: values({ lines }) });
  return createElement(FormProvider<MemoOutReturnFormValues>, form as Parameters<typeof FormProvider<MemoOutReturnFormValues>>[0], children);
}
const renderTable = (lines?: MemoOutReturnLine[], emptyRowText?: string) => {
  const p = props(lines, emptyRowText);
  return renderToStaticMarkup(createElement(InForm, { lines: p.lines }, createElement(ReturnItemTable, p)));
};

describe("navigation and access (UT-MOR-01)", () => {
  it("links Memo Out Return to its pages and reads the memo-out-return leaf", () => {
    expect(navigationHref({ label: "Memo Out Return", slug: "memo-out-return" })).toBe("/memo/memo-out-return");
    expect(MEMO_OUT_RETURN_HREF).toBe("/memo/memo-out-return");
    expect(memoOutReturnHref(ID)).toBe(`/memo/memo-out-return/${ID}`);
    expect(documentAccess({ isSuperAdmin: false, permissions: ["memo-out-return:VIEW", "memo-out-return:ADD"] }, "memo-out-return")).toEqual({ view: true, add: true, edit: false, delete: false, approve: false });
    expect(documentAccess({ isSuperAdmin: false, permissions: ["memo-out:VIEW"] }, "memo-out-return").view).toBe(false);
  });
});

describe("return item table (UT-MOR-02/03, design rev 3)", () => {
  it("has the design headers (Stock ID · Lot, Outstanding and Return, Memo Price) in Title Case and no More, checkbox or remove", () => {
    const html = renderTable(undefined, "Empty row · click to pick from Memo Stock");
    for (const title of ["Stock ID", "Lot", "Location", "Shape · Size", "Color · Clarity", "Cutting · Quality", "Cer Type", "Cer No.", "Memo Price", "Unit", "Amount"]) expect(html).toContain(`>${title}<`);
    expect(html).toMatch(/colSpan="2"[^>]*>Outstanding<\/th>/i);
    expect(html).toMatch(/colSpan="2"[^>]*>Return<\/th>/i);
    expect(html).not.toMatch(/>More<|>Pending<|>Sale Price<|Stone Code|type="checkbox"|Remove row|#E3F0F0|Add row/);
    expect(html.match(/Empty row · click to pick from Memo Stock/g)).toHaveLength(2);
    expect(html).not.toContain("<input");
  });

  it("a picked row shows its item and Outstanding as text; only Return Pcs / Weight are inputs; amount uses the return", () => {
    const html = renderTable([filled]);
    expect(html).toContain("RU-1");
    expect(html).toContain("L7");
    expect(html).toMatch(/>3<\/td>/);
    expect(html).toContain("2.25");
    expect(html.match(/<input/g)).toHaveLength(2);
    expect(html).toContain(`aria-label="Return pcs, row 1"`);
    expect(html).toContain(`aria-label="Return weight, row 1"`);
    expect(html).toContain("1,000.00 THB");
    expect(renderToStaticMarkup(createElement(ItemTable, props()))).toContain("Empty row · click to key in, or use From Stock to fill it");
  });
});

describe("form and mapping (UT-MOR-04)", () => {
  it("needs a customer and both addresses (rev 4, Q-MOR-11/12); note up to 250", () => {
    const paths = (v: MemoOutReturnFormValues) => (memoOutReturnSchema.safeParse(v).error?.issues ?? []).map((issue) => issue.path.join("."));
    expect(paths(values())).toEqual([]);
    expect(paths(values({ customerId: "", shippingAddressId: "", invoiceAddressId: "" }))).toEqual(["customerId", "shippingAddressId", "invoiceAddressId"]);
    expect(paths(values({ documentNote: "x".repeat(MEMO_OUT_RETURN_NOTE_MAX + 1) }))).toEqual(["documentNote"]);
  });

  it("UT-MOR-06 the Return quantity may not exceed the Outstanding one; empty rows are ignored", () => {
    const paths = (v: MemoOutReturnFormValues) => (memoOutReturnSchema.safeParse(v).error?.issues ?? []).map((issue) => issue.path.join("."));
    expect(paths(values({ lines: [{ ...filled, pcs: "3", weightCt: "2.25" }, blank()] }))).toEqual([]);
    expect(paths(values({ lines: [{ ...filled, pcs: "4", weightCt: "2.3" }, blank()] }))).toEqual(["lines.0.pcs", "lines.0.weightCt"]);
    expect(paths(values({ lines: [{ ...filled, pcs: "0", weightCt: "0" }] }))).toEqual(["lines.0.pcs"]);
  });

  it("sends the customer + both addresses and each row's Memo Out line, drops empty rows, never sends photos; loads a saved document back", () => {
    const input = toMemoOutReturnInput(values());
    expect(input).toMatchObject({ customerId: ID, shippingAddressId: ID, invoiceAddressId: ID });
    expect(input).not.toHaveProperty("vendorId");
    expect(input.lines).toHaveLength(1);
    expect(input.lines[0]).toMatchObject({ stone: "Ruby", pcs: 2, weightCt: "1.5", memoOutLineId: ID, outstandingPcs: 3, outstandingWeightCt: "2.25", photoIds: [] });
    const detail = {
      id: ID, docNo: "MOR-1", status: "APPROVED", version: 3, docDate: "2026-10-28", dueDate: "2026-11-28",
      customerId: ID, customer: { code: "C001", name: "Siam Gems" }, shippingAddressId: null, shippingAddressText: "A", invoiceAddressId: ID, invoiceAddressText: "B",
      currency: "THB", exchangeRate: null, ref: "", documentNote: "", approvedAt: "2026-10-31T03:00:00.000Z", approvedBy: "u1",
      lines: [{
        id: ID, source: "STOCK", stoneCode: "", stone: "Ruby", shape: "", size: "", color: "", clarity: "", cutting: "", quality: "", lot: "",
        location: "Memo", cerType: "", cerNo: "", pcs: 1, weightCt: "1.000", priceUnit: "PER_CT", unitPrice: "100.00", discount: { type: "NONE", value: "0" },
        discountAmount: "0.00", amount: "100.00", itemNote: "", photoIds: [], outstandingPcs: 2, outstandingWeightCt: "1.500",
        memoOutLineId: ID, memoOut: { id: ID, docNo: "MO-1" }, memoStockId: ID, stockId: "260002",
      }],
      discount: { type: "NONE", value: "0" },
      tax: { enabled: false, rate: "7", includeInPrice: false }, serviceCharges: [], labor: null,
      totals: { subtotal: "0.00", discountAmount: "0.00", priceBeforeTax: "0.00", taxAmount: "0.00", chargesAmount: "0.00", laborAmount: "0.00", grandTotal: "0.00" },
      createdAt: "", createdBy: "", updatedAt: "",
    } satisfies MemoOutReturnDetail;
    expect(fromMemoOutReturn(detail)).toMatchObject({
      id: ID, docNo: "MOR-1", version: 3, status: "APPROVED", customerId: ID, shippingAddressId: "", invoiceAddressId: ID,
      lines: [{ pcs: "1", stockId: "260002", memoOutLineId: ID, memoOutNo: "MO-1", outstandingPcs: "2", outstandingWeightCt: "1.500" }],
    });
  });
});

describe("Memo Outstanding picker (UT-MOR-21/22, rev 4)", () => {
  const item: MemoOutstandingItem = {
    memoOutLineId: ID, memoOut: { id: ID, docNo: "MO-7", docDate: "2026-10-31", dueDate: "2026-11-30" },
    memoStockId: ID, stockId: "260003", lot: "LOT-R", location: "Memo", stone: "Sapphire", shape: "Cushion", size: "", color: "Blue", clarity: "", cutting: "", quality: "",
    cerType: "GIA", cerNo: "C-9", itemNote: "viewing", outPcs: 4, outWeightCt: "2.000", returnedPcs: 1, returnedWeightCt: "0.500",
    outstandingPcs: 3, outstandingWeightCt: "1.500", priceUnit: "PER_CT", unitPrice: "2700.00", amount: "4050.00", currency: "THB",
  };

  it("a picked row copies the Memo Out line: Stock ID, stone, Memo price, Outstanding; Return starts empty", () => {
    const line = outstandingToLine(item);
    expect(line).toMatchObject({ stockId: "260003", lot: "LOT-R", locationId: "Memo", stone: "Sapphire", priceUnit: "PER_CT", unitPrice: "2700.00", memoOutLineId: ID, memoOutNo: "MO-7", outstandingPcs: "3", outstandingWeightCt: "1.500", pcs: "", weightCt: "" });
    expect(pickedOutLineIds([line, blank()])).toEqual(new Set([ID]));
  });

  it("asks for nothing until a customer and a currency are chosen; sends only set filters", () => {
    expect(memoOutstandingInput({ customerId: "", currency: "THB", q: "", from: "", to: "" })).toBeNull();
    expect(memoOutstandingInput({ customerId: ID, currency: "", q: "", from: "", to: "" })).toBeNull();
    expect(memoOutstandingInput({ customerId: ID, currency: "THB", q: " 26 ", from: "2026-10-01", to: "", excludeReturnId: ID }))
      .toEqual({ customerId: ID, currency: "THB", limit: 50, q: "26", from: "2026-10-01", excludeReturnId: ID });
  });
});

describe("errors (UT-MOR-05)", () => {
  it("maps MEMO_OUT_RETURN_* codes to fields and messages", () => {
    expect(mapMemoOutReturnSaveError(gatewayError({ domainCode: "MEMO_OUT_RETURN_REFERENCE_INVALID", httpStatus: 422, fieldErrors: [{ path: "shippingAddressId", code: "invalid_reference" }] })))
      .toMatchObject({ fieldErrors: [{ name: "shippingAddressId", message: "Choose an active option" }] });
    // UT-MOR-23: another return took the quantity first at Approve.
    expect(mapMemoOutReturnSaveError(gatewayError({ domainCode: "MEMO_OUT_RETURN_OUTSTANDING_SHORT", httpStatus: 409, code: "CONFLICT" })).message).toContain("already returned by another document");
    expect(mapMemoOutReturnSaveError(gatewayError({ domainCode: "MEMO_OUT_RETURN_CHANGED", httpStatus: 409, code: "CONFLICT" })).message).toContain("Someone else changed this memo out return");
  });
});
