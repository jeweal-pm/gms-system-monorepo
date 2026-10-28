import { createElement } from "react";
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
  toMemoOutReturnInput,
  type MemoOutReturnDetail,
  type MemoOutReturnFormValues,
} from "@/features/memo-out-return/api";
import { ReturnItemTable } from "@/features/memo-out-return/components/ReturnItemTable";
import { ItemTable } from "@/features/quotation/components/items/ItemTable";
import { calculateTotals } from "@/features/quotation/lib/calculate";
import { emptyLine, emptyQuotation } from "@/features/quotation/lib/defaults";
import { documentAccess } from "@/features/trade-document/document-api";
import { gatewayError } from "../partner/helpers";

/** UT-MOR-01…05: memo-out-return UI rev 2 + SA rev 1 (owner 2026-10-28). */

const ID = "11111111-1111-4111-8111-111111111111";
const noop = () => undefined;
const filled = { ...emptyLine(), stone: "Ruby", stoneCode: "RU-1", pcs: "2", weightCt: "1.5", unitPrice: "1000" };
const props = (lines = [emptyLine(), emptyLine()], emptyRowText?: string) => ({
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
const values = (patch: Partial<MemoOutReturnFormValues> = {}): MemoOutReturnFormValues => ({ ...emptyMemoOutReturn(), dueDate: "2026-11-28", currency: "THB", vendorId: ID, addressId: ID, lines: [filled, emptyLine()], ...patch });

describe("navigation and access (UT-MOR-01)", () => {
  it("links Memo Out Return to its pages and reads the memo-out-return leaf", () => {
    expect(navigationHref({ label: "Memo Out Return", slug: "memo-out-return" })).toBe("/memo/memo-out-return");
    expect(MEMO_OUT_RETURN_HREF).toBe("/memo/memo-out-return");
    expect(memoOutReturnHref(ID)).toBe(`/memo/memo-out-return/${ID}`);
    expect(documentAccess({ isSuperAdmin: false, permissions: ["memo-out-return:VIEW", "memo-out-return:ADD"] }, "memo-out-return")).toEqual({ view: true, add: true, edit: false, delete: false });
    expect(documentAccess({ isSuperAdmin: false, permissions: ["memo-out:VIEW"] }, "memo-out-return").view).toBe(false);
  });
});

describe("return item table (UT-MOR-02/03, source 01)", () => {
  it("groups Pending and Return (Pcs, Weight) with the tinted Return columns and the design empty-row text", () => {
    const html = renderToStaticMarkup(createElement(ReturnItemTable, props(undefined, "Empty row · click to pick from Memo Outstanding")));
    expect(html).toMatch(/colSpan="2"[^>]*>Pending<\/th>/i);
    expect(html).toMatch(/colSpan="2"[^>]*bg-\[#E3F0F0\][^>]*>Return<\/th>/i);
    expect(html.match(/Empty row · click to pick from Memo Outstanding/g)).toHaveLength(2);
  });

  it("shows a typed row under Return with its price and amount; totals count the returned pieces", () => {
    const html = renderToStaticMarkup(createElement(ReturnItemTable, props([filled])));
    expect(html).toContain("RU-1");
    expect(html).toMatch(/bg-\[#E3F0F0\][^>]*>2<\/td>/);
    expect(html).toContain("1,000.00 THB");
    expect(renderToStaticMarkup(createElement(ItemTable, props()))).toContain("Empty row · click to key in, or use From Stock to fill it");
  });
});

describe("form and mapping (UT-MOR-04)", () => {
  it("needs a vendor and an address; note up to 250", () => {
    const paths = (v: MemoOutReturnFormValues) => (memoOutReturnSchema.safeParse(v).error?.issues ?? []).map((issue) => issue.path.join("."));
    expect(paths(values())).toEqual([]);
    expect(paths(values({ vendorId: "", addressId: "" }))).toEqual(["vendorId", "addressId"]);
    expect(paths(values({ documentNote: "x".repeat(MEMO_OUT_RETURN_NOTE_MAX + 1) }))).toEqual(["documentNote"]);
  });

  it("sends vendor + address, drops empty rows and never sends photos; loads a saved document back", () => {
    const input = toMemoOutReturnInput(values());
    expect(input).toMatchObject({ vendorId: ID, addressId: ID });
    expect(input).not.toHaveProperty("customerId");
    expect(input.lines).toHaveLength(1);
    expect(input.lines[0]).toMatchObject({ stone: "Ruby", pcs: 2, photoIds: [] });
    const detail = {
      id: ID, docNo: "MOR-1", status: "DRAFT", version: 3, docDate: "2026-10-28", dueDate: "2026-11-28",
      vendorId: ID, vendor: { code: "V001", name: "Bangkok Gems" }, addressId: null, addressText: "A",
      currency: "THB", exchangeRate: null, ref: "", documentNote: "", lines: [], discount: { type: "NONE", value: "0" },
      tax: { enabled: false, rate: "7", includeInPrice: false }, serviceCharges: [], labor: null,
      totals: { subtotal: "0.00", discountAmount: "0.00", priceBeforeTax: "0.00", taxAmount: "0.00", chargesAmount: "0.00", laborAmount: "0.00", grandTotal: "0.00" },
      createdAt: "", createdBy: "", updatedAt: "",
    } satisfies MemoOutReturnDetail;
    expect(fromMemoOutReturn(detail)).toMatchObject({ id: ID, docNo: "MOR-1", version: 3, status: "DRAFT", vendorId: ID, addressId: "" });
  });
});

describe("errors (UT-MOR-05)", () => {
  it("maps MEMO_OUT_RETURN_* codes to fields and messages", () => {
    expect(mapMemoOutReturnSaveError(gatewayError({ domainCode: "MEMO_OUT_RETURN_REFERENCE_INVALID", httpStatus: 422, fieldErrors: [{ path: "addressId", code: "invalid_reference" }] })))
      .toMatchObject({ fieldErrors: [{ name: "addressId", message: "Choose an active option" }] });
    expect(mapMemoOutReturnSaveError(gatewayError({ domainCode: "MEMO_OUT_RETURN_CHANGED", httpStatus: 409, code: "CONFLICT" })).message).toContain("Someone else changed this memo out return");
  });
});
