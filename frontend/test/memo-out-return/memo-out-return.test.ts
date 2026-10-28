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
  toMemoOutReturnInput,
  type MemoOutReturnDetail,
  type MemoOutReturnFormValues,
  type MemoOutReturnLine,
} from "@/features/memo-out-return/api";
import { ReturnItemTable } from "@/features/memo-out-return/components/ReturnItemTable";
import { ItemTable } from "@/features/quotation/components/items/ItemTable";
import { calculateTotals } from "@/features/quotation/lib/calculate";
import { emptyLine, emptyQuotation } from "@/features/quotation/lib/defaults";
import { documentAccess } from "@/features/trade-document/document-api";
import { gatewayError } from "../partner/helpers";

/** UT-MOR-01…06: memo-out-return UI rev 3 + SA rev 1 (owner 2026-10-28). */

const ID = "11111111-1111-4111-8111-111111111111";
const noop = () => undefined;
const blank = (): MemoOutReturnLine => ({ ...emptyLine(), outstandingPcs: "", outstandingWeightCt: "" });
const filled: MemoOutReturnLine = { ...emptyLine(), stone: "Ruby", stoneCode: "RU-1", lot: "L7", pcs: "2", weightCt: "1.5", unitPrice: "1000", outstandingPcs: "3", outstandingWeightCt: "2.25" };
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
const values = (patch: Partial<MemoOutReturnFormValues> = {}): MemoOutReturnFormValues => ({ ...emptyMemoOutReturn(), dueDate: "2026-11-28", currency: "THB", vendorId: ID, addressId: ID, lines: [filled, blank()], ...patch });

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
    expect(documentAccess({ isSuperAdmin: false, permissions: ["memo-out-return:VIEW", "memo-out-return:ADD"] }, "memo-out-return")).toEqual({ view: true, add: true, edit: false, delete: false });
    expect(documentAccess({ isSuperAdmin: false, permissions: ["memo-out:VIEW"] }, "memo-out-return").view).toBe(false);
  });
});

describe("return item table (UT-MOR-02/03, design rev 3)", () => {
  it("has the design headers (STOCK ID · LOT, Outstanding and Return, Memo PRICE) and no More, checkbox or remove", () => {
    const html = renderTable(undefined, "Empty row · click to pick from Memo Stock");
    for (const title of ["STOCK ID", "LOT", "LOCATION", "SHAPE · SIZE", "COLOR · CLARITY", "CUTTING · QUALITY", "CER TYPE", "CER NO.", "Memo PRICE", "UNIT", "Amount"]) expect(html).toContain(`>${title}<`);
    expect(html).toMatch(/colSpan="2"[^>]*>Outstanding<\/th>/i);
    expect(html).toMatch(/colSpan="2"[^>]*>Return<\/th>/i);
    expect(html).not.toMatch(/>More<|>Pending<|>SALE PRICE<|Stone Code|type="checkbox"|Remove row|#E3F0F0/);
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
  it("needs a vendor and an address; note up to 250", () => {
    const paths = (v: MemoOutReturnFormValues) => (memoOutReturnSchema.safeParse(v).error?.issues ?? []).map((issue) => issue.path.join("."));
    expect(paths(values())).toEqual([]);
    expect(paths(values({ vendorId: "", addressId: "" }))).toEqual(["vendorId", "addressId"]);
    expect(paths(values({ documentNote: "x".repeat(MEMO_OUT_RETURN_NOTE_MAX + 1) }))).toEqual(["documentNote"]);
  });

  it("UT-MOR-06 the Return quantity may not exceed the Outstanding one; empty rows are ignored", () => {
    const paths = (v: MemoOutReturnFormValues) => (memoOutReturnSchema.safeParse(v).error?.issues ?? []).map((issue) => issue.path.join("."));
    expect(paths(values({ lines: [{ ...filled, pcs: "3", weightCt: "2.25" }, blank()] }))).toEqual([]);
    expect(paths(values({ lines: [{ ...filled, pcs: "4", weightCt: "2.3" }, blank()] }))).toEqual(["lines.0.pcs", "lines.0.weightCt"]);
  });

  it("sends vendor + address, drops empty rows and never sends photos; loads a saved document back", () => {
    const input = toMemoOutReturnInput(values());
    expect(input).toMatchObject({ vendorId: ID, addressId: ID });
    expect(input).not.toHaveProperty("customerId");
    expect(input.lines).toHaveLength(1);
    expect(input.lines[0]).toMatchObject({ stone: "Ruby", pcs: 2, weightCt: "1.5", outstandingPcs: 3, outstandingWeightCt: "2.25", photoIds: [] });
    const detail = {
      id: ID, docNo: "MOR-1", status: "DRAFT", version: 3, docDate: "2026-10-28", dueDate: "2026-11-28",
      vendorId: ID, vendor: { code: "V001", name: "Bangkok Gems" }, addressId: null, addressText: "A",
      currency: "THB", exchangeRate: null, ref: "", documentNote: "",
      lines: [{
        id: ID, source: "MANUAL", stoneCodeId: null, stoneCode: "RU-1", stone: "Ruby", shape: "", size: "", color: "", clarity: "", cutting: "", quality: "", lot: "",
        location: "", cerType: "", cerNo: "", pcs: 1, weightCt: "1.000", priceUnit: "PER_CT", unitPrice: "100.00", discount: { type: "NONE", value: "0" },
        discountAmount: "0.00", amount: "100.00", itemNote: "", photoIds: [], outstandingPcs: 2, outstandingWeightCt: "1.500",
      }],
      discount: { type: "NONE", value: "0" },
      tax: { enabled: false, rate: "7", includeInPrice: false }, serviceCharges: [], labor: null,
      totals: { subtotal: "0.00", discountAmount: "0.00", priceBeforeTax: "0.00", taxAmount: "0.00", chargesAmount: "0.00", laborAmount: "0.00", grandTotal: "0.00" },
      createdAt: "", createdBy: "", updatedAt: "",
    } satisfies MemoOutReturnDetail;
    expect(fromMemoOutReturn(detail)).toMatchObject({ id: ID, docNo: "MOR-1", version: 3, status: "DRAFT", vendorId: ID, addressId: "", lines: [{ pcs: "1", outstandingPcs: "2", outstandingWeightCt: "1.500" }] });
  });
});

describe("errors (UT-MOR-05)", () => {
  it("maps MEMO_OUT_RETURN_* codes to fields and messages", () => {
    expect(mapMemoOutReturnSaveError(gatewayError({ domainCode: "MEMO_OUT_RETURN_REFERENCE_INVALID", httpStatus: 422, fieldErrors: [{ path: "addressId", code: "invalid_reference" }] })))
      .toMatchObject({ fieldErrors: [{ name: "addressId", message: "Choose an active option" }] });
    expect(mapMemoOutReturnSaveError(gatewayError({ domainCode: "MEMO_OUT_RETURN_CHANGED", httpStatus: 409, code: "CONFLICT" })).message).toContain("Someone else changed this memo out return");
  });
});
