import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { FormProvider, useForm } from "react-hook-form";
import { describe, expect, it } from "vitest";
import { navigationHref } from "@/features/home/navigation";
import {
  fromMemoReceive,
  LEGACY_STORAGE_KEY,
  mapMemoReceiveError,
  memoReceiveAccess,
  memoReceiveLoadError,
  removeLegacyStore,
  savedLineIds,
  stoneChoices,
  toMemoReceiveInput,
  type MemoReceiveDetail,
  type MemoReceiveOptions,
} from "@/features/memo-receive/api";
import { approveMessage, canApproveMemo, MEMO_RECEIVE_HREF, memoReceiveHref, STATUS_LABELS } from "@/features/memo-receive/components/MemoReceiveForm";
import { emptyMemoReceive, MEMO_RECEIVE_KIND } from "@/features/memo-receive/defaults";
import { isEditableMemo, memoReceiveSchema, type MemoReceiveFormValues } from "@/features/memo-receive/schema";
import { QuotationHeader } from "@/features/quotation/components/header/QuotationHeader";
import { ItemTable, itemColumns } from "@/features/quotation/components/items/ItemTable";
import { DocumentKindContext, QUOTATION_KIND, type DocumentKind } from "@/features/quotation/document-kind";
import { calculateTotals } from "@/features/quotation/lib/calculate";
import { toFixed } from "@/features/quotation/lib/decimal";
import { emptyLine } from "@/features/quotation/lib/defaults";
import type { QuotationLine } from "@/features/quotation/schema";
import { gatewayError } from "../partner/helpers";

/**
 * memo-receive UI rev 3 + SA rev 1 (owner 2026-10-29, ADR-0034).
 * UT-MR-F1: api mapping, errors, access, legacy store removal. UT-MR-F2: Stock ID / Location / Approve UI.
 * UT-MR-05/06 (rev 1/2) are kept for the schema, totals and page setting.
 */

const ID = "11111111-1111-4111-8111-111111111111";
const LINE_A = "22222222-2222-4222-8222-222222222222";
const LINE_B = "33333333-3333-4333-8333-333333333333";
const noop = () => undefined;

function memo(overrides: Partial<MemoReceiveFormValues> = {}): MemoReceiveFormValues {
  const filled = { ...emptyLine(), stone: "Ruby", pcs: "2", weightCt: "1.5", unitPrice: "100", locationId: "Vault", stoneCodeId: "sc", photos: [{ id: "p1", name: "a.jpg", url: "blob:a" }] };
  return {
    ...emptyMemoReceive(),
    docDate: "2026-10-28",
    dueDate: "2026-11-28",
    vendorId: ID,
    addressId: ID,
    currency: "THB",
    lines: [filled, emptyLine(), { ...filled, key: "second", stone: "Sapphire" }],
    ...overrides,
  };
}

const totals = { subtotal: "0.00", discountAmount: "0.00", priceBeforeTax: "0.00", taxAmount: "0.00", chargesAmount: "0.00", laborAmount: "0.00", grandTotal: "0.00" };
const detailLine = (id: string, stockId: string, stone: string) => ({
  id, stockId, source: "MANUAL", stoneCode: "", stone, shape: "Oval", size: "", color: "", clarity: "", cutting: "", quality: "", lot: "L-1",
  cerType: "", cerNo: "", pcs: 2, weightCt: "1.500", priceUnit: "PER_CT", unitPrice: "100.0000", discount: { type: "NONE", value: "0" },
  amount: "150.00", itemNote: "", photoIds: [], position: 0,
});

function detail(status: "PENDING_APPROVAL" | "APPROVED" = "PENDING_APPROVAL"): MemoReceiveDetail {
  return {
    id: ID, docNo: "MR-1", status, version: 3, docDate: "2026-10-29", dueDate: "2026-11-29",
    vendorId: ID, vendor: { code: "V001", name: "Gem Co" }, addressId: ID, addressText: "Bangkok",
    currency: "THB", exchangeRate: null, ref: "", documentNote: "",
    lines: [detailLine(LINE_A, "260001", "Ruby"), detailLine(LINE_B, "260002", "Sapphire")],
    discount: { type: "NONE", value: "0" }, tax: { enabled: false, rate: "7", includeInPrice: false }, serviceCharges: [], labor: null,
    totals, approvedAt: status === "APPROVED" ? "2026-10-29T03:00:00.000Z" : null, approvedBy: null,
    createdAt: "", createdBy: "", updatedAt: "",
  } as unknown as MemoReceiveDetail;
}

const header = (props: Record<string, unknown> = {}) =>
  renderToStaticMarkup(createElement(QuotationHeader, {
    docNo: "MR-1", isPreview: false, mode: "view", saving: false, canSave: true, canCreate: true, canEdit: true, canDelete: true,
    actions: { onCancel: noop, onSave: noop, onEdit: noop, onDelete: noop, onDuplicate: noop, onRefresh: noop },
    ...props,
  }));

function table(kind: DocumentKind, lines: QuotationLine[]) {
  function Harness() {
    const form = useForm({ defaultValues: { lines } });
    return createElement(FormProvider, form as never, createElement(DocumentKindContext.Provider, { value: kind },
      createElement(ItemTable, {
        lines, currency: "THB", totals: calculateTotals({ ...memo(), lines }), selectedIndex: null, checkedKeys: new Set<string>(), readOnly: false,
        onSelectRow: noop, onToggleCheck: noop, onToggleAll: noop, onRowAction: noop, onAddRow: noop,
      })));
  }
  return renderToStaticMarkup(createElement(Harness));
}

describe("contract mapping (UT-MR-F1)", () => {
  it("drops empty rows, Stone Code id and Location; sends photo ids (rev 4); a new document sends no line ids", () => {
    const input = toMemoReceiveInput(memo());
    expect(input).toMatchObject({ vendorId: ID, addressId: ID, currency: "THB" });
    expect(input.lines).toHaveLength(2);
    for (const line of input.lines) {
      expect(line).not.toHaveProperty("stoneCodeId");
      expect(line).not.toHaveProperty("location");
      expect(line).not.toHaveProperty("id");
      expect(line.photoIds).toEqual(["p1"]);
    }
  });

  it("loads a saved document with its Stock IDs and sends each saved line id back on edit; new rows omit id", () => {
    const values = fromMemoReceive(detail());
    expect(values).toMatchObject({ id: ID, docNo: "MR-1", version: 3, status: "PENDING_APPROVAL", vendorId: ID, addressId: ID });
    expect(values.lines.map((line) => [line.key, line.stockId])).toEqual([[LINE_A, "260001"], [LINE_B, "260002"]]);
    expect(values.lines.every((line) => line.locationId === "" && line.photos.length === 0)).toBe(true);

    const ids = savedLineIds(values);
    const edited = { ...values, lines: [values.lines[1], emptyLine(), { ...emptyLine(), stone: "Emerald", pcs: "1" }, values.lines[0]] };
    const input = toMemoReceiveInput(edited, ids);
    expect(input.lines.map((line) => ("id" in line ? line.id : undefined))).toEqual([LINE_B, undefined, LINE_A]);
    expect(savedLineIds(emptyMemoReceive()).size).toBe(0);
  });

  it("gives the row panel the stone lists without codes", () => {
    const stone = { stones: [{ name: "Ruby", code: "RB" }], shapes: [], sizes: [], colors: [], clarities: [], cuttings: [], qualities: [] };
    expect(stoneChoices({ stone } as unknown as MemoReceiveOptions)).toMatchObject({ codes: [], stones: [{ name: "Ruby" }] });
    expect(stoneChoices(undefined)).toBeUndefined();
  });

  it("maps MEMO_RECEIVE_* errors per error-handling.md", () => {
    const err = (domainCode: string, fieldErrors?: { path: string; code: string }[]) => mapMemoReceiveError(gatewayError({ domainCode, fieldErrors }));
    expect(err("MEMO_RECEIVE_STATUS_INVALID")).toMatchObject({ message: "Already approved", reload: true });
    expect(err("MEMO_RECEIVE_CHANGED").message).toContain("Someone changed this document");
    expect(err("MEMO_RECEIVE_NOT_FOUND")).toMatchObject({ message: "This Memo Receive no longer exists.", gone: true });
    expect(err("MEMO_RECEIVE_STOCK_ID_EXHAUSTED").message).toBe("Stock ID limit reached for this year. Contact the administrator.");
    expect(err("MEMO_RECEIVE_REFERENCE_INVALID", [{ path: "addressId", code: "invalid_reference" }]).fieldErrors).toEqual([{ name: "addressId", message: "Choose an active option" }]);
    expect(err("VALIDATION_ERROR", [{ path: "lines.1.discount.value", code: "exceeds_gross" }])).toMatchObject({ message: "Item row 2: the discount is more than the line amount.", fieldErrors: [{ name: "lines", message: "Check item row 2" }] });
    expect(err("VALIDATION_ERROR", [{ path: "discount.value", code: "exceeds_subtotal" }]).message).toBe("The document discount is more than the subtotal.");
    expect(err("VALIDATION_ERROR", [{ path: "lines.0.id", code: "unknown_line" }]).message).toContain("Refresh");
    expect(err("PERMISSION_DENIED").message).toContain("permission");
    expect(mapMemoReceiveError(new Error("raw")).message).toBe("Couldn't save. Try again.");
    expect(memoReceiveLoadError(gatewayError({ domainCode: "MEMO_RECEIVE_NOT_FOUND", httpStatus: 404 }))).toBe("This Memo Receive no longer exists.");
  });

  it("reads memo-receive:APPROVE as a separate grant", () => {
    expect(memoReceiveAccess({ isSuperAdmin: false, permissions: ["memo-receive:VIEW", "memo-receive:EDIT"] })).toMatchObject({ view: true, edit: true, approve: false });
    expect(memoReceiveAccess({ isSuperAdmin: false, permissions: ["memo-receive:APPROVE"] }).approve).toBe(true);
    expect(memoReceiveAccess({ isSuperAdmin: false, permissions: "ALL" }).approve).toBe(true);
  });

  it("removes the rev 1/2 mock store key, and survives blocked storage", () => {
    const removed: string[] = [];
    removeLegacyStore({ removeItem: (key) => void removed.push(key) });
    expect(removed).toEqual([LEGACY_STORAGE_KEY]);
    expect(LEGACY_STORAGE_KEY).toBe("gms.memo-receive.v1");
    expect(() => removeLegacyStore({ removeItem: () => { throw new Error("blocked"); } })).not.toThrow();
    expect(() => removeLegacyStore(undefined)).not.toThrow();
  });
});

describe("Stock ID, Location and Approve (UT-MR-F2)", () => {
  it("Memo Receive has no Location column; Quotation keeps it", () => {
    expect(itemColumns(false, false).map((c) => c.title)).not.toContain("Location");
    expect(itemColumns(true).map((c) => c.title)).toContain("Location");
    const lines = [{ ...emptyLine(), stone: "Ruby", pcs: "1", weightCt: "1", unitPrice: "10", locationId: "Vault" }, { ...emptyLine(), stockId: "260001", stone: "Opal", pcs: "1", weightCt: "1", unitPrice: "10" }];
    const receive = table({ ...MEMO_RECEIVE_KIND }, lines);
    expect(receive).not.toContain("Location");
    expect(receive).not.toContain("Vault");
    expect(receive).toContain("Auto");
    expect(receive).toContain("260001");
    const quotation = table(QUOTATION_KIND, lines);
    expect(quotation).toContain("Location");
    expect(quotation).toContain("Vault");
  });

  it("shows Approve only for a saved Pending Approval document with no unsaved changes and the grant", () => {
    const base = { saved: true, status: "PENDING_APPROVAL" as const, editing: false, dirty: false, approve: true };
    expect(canApproveMemo(base)).toBe(true);
    expect(canApproveMemo({ ...base, saved: false })).toBe(false);
    expect(canApproveMemo({ ...base, status: "APPROVED" })).toBe(false);
    expect(canApproveMemo({ ...base, editing: true })).toBe(false);
    expect(canApproveMemo({ ...base, dirty: true })).toBe(false);
    expect(canApproveMemo({ ...base, approve: false })).toBe(false);
    expect(approveMessage(3)).toBe("Approve this Memo Receive? Its 3 items move to Memo Stock and it can no longer be edited.");
  });

  it("an Approved document shows its badge and hides Edit and Delete; Quotation's header is unchanged", () => {
    const approved = header({ statusLabels: STATUS_LABELS, status: "APPROVED", hideEditDelete: true, noLabel: "Memo Receive No.:" });
    expect(approved).toContain("Approved");
    expect(approved).not.toContain("Edit");
    expect(approved).not.toContain("Delete");
    const pending = header({ statusLabels: STATUS_LABELS, status: "PENDING_APPROVAL", extraActions: createElement("button", null, "Approve") });
    expect(pending).toContain("Pending Approval");
    expect(pending).toContain("Approve");
    expect(pending).toContain("Edit");
    const quotation = header();
    expect(quotation).toContain("Edit");
    expect(quotation).toContain("Delete");
    expect(quotation).not.toContain("Approve");
  });

  it("an approved memo receive can't be edited; the loaded copy keeps APPROVED", () => {
    expect(isEditableMemo("PENDING_APPROVAL")).toBe(true);
    expect(isEditableMemo("APPROVED")).toBe(false);
    expect(fromMemoReceive(detail("APPROVED")).status).toBe("APPROVED");
  });
});

describe("schema and totals (UT-MR-05, Q-MR-04)", () => {
  it("needs a vendor, address and one item; line % up to 100", () => {
    const lines = [{ ...memo().lines[0], discountType: "PERCENT" as const, discountValue: "101" }];
    const result = memoReceiveSchema.safeParse({ ...memo(), vendorId: "", addressId: "", lines: [emptyLine()] });
    expect(result.success).toBe(false);
    expect(result.error?.issues.map((issue) => issue.path.join("."))).toEqual(expect.arrayContaining(["vendorId", "addressId", "lines"]));
    expect(memoReceiveSchema.safeParse(memo({ lines })).error?.issues.map((issue) => issue.path.join("."))).toEqual(["lines.0.discountValue"]);
  });

  it("amounts, line and document discounts follow Quotation (rev 2)", () => {
    const values = memo({ tax: { enabled: true, rate: "7", includeInPrice: false }, discount: { enabled: true, type: "AMOUNT", value: "50" } });
    values.lines[0] = { ...values.lines[0], discountType: "PERCENT", discountValue: "10" };
    values.lines[2] = { ...values.lines[2], priceUnit: "PER_PCS" };
    expect(memoReceiveSchema.safeParse(values).success).toBe(true);
    const result = calculateTotals(values);
    expect(toFixed(result.subtotal, 2)).toBe("335.00"); // 1.5 ct × 100 − 10% + 2 pcs × 100
    expect(toFixed(result.discountAmount, 2)).toBe("50.00");
    expect(toFixed(result.grandTotal, 2)).toBe("304.95"); // (335 − 50) × 1.07
  });
});

describe("page setting and menu (UT-MR-06, rev 3)", () => {
  it("Stock ID is automatic and replaces the Stone Code, no Location; Quotation keeps its own setting; the menu opens the page", () => {
    expect(MEMO_RECEIVE_KIND).toMatchObject({ stockId: "auto", stoneCode: false, location: false, locations: null });
    expect(MEMO_RECEIVE_KIND.documentNote.max).toBe(250);
    expect(QUOTATION_KIND).toMatchObject({ stockId: "from-stock", stoneCode: true, location: true, locations: null });
    expect(QUOTATION_KIND.documentNote.max).toBe(500);
    expect(navigationHref({ label: "Memo Receive", slug: "memo-receive" })).toBe("/memo/memo-receive");
    expect(MEMO_RECEIVE_HREF).toBe("/memo/memo-receive");
    expect(memoReceiveHref(ID)).toBe(`/memo/memo-receive/${ID}`);
  });
});
