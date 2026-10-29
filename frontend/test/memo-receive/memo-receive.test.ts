import { beforeEach, describe, expect, it, vi } from "vitest";
import { navigationHref } from "@/features/home/navigation";
import { emptyMemoReceive, MEMO_RECEIVE_KIND } from "@/features/memo-receive/defaults";
import { nextDocNumber, rowInEffect, type NumberingRow } from "@/features/memo-receive/numbering";
import { isEditableMemo, memoReceiveSchema, type MemoReceiveFormValues } from "@/features/memo-receive/schema";
import {
  createMemoReceive,
  deleteMemoReceive,
  getMemoReceive,
  listMemoReceives,
  MAX_DOCUMENTS,
  parseState,
  resetMemoReceiveStore,
  STORAGE_KEY,
  updateMemoReceive,
} from "@/features/memo-receive/store";
import { QUOTATION_KIND } from "@/features/quotation/document-kind";
import { calculateTotals } from "@/features/quotation/lib/calculate";
import { toFixed } from "@/features/quotation/lib/decimal";
import { emptyLine } from "@/features/quotation/lib/defaults";

/** UT-MR-01…06: memo-receive UI rev 1 (ADR-0033, owner 2026-10-28). */

const storage = new Map<string, string>();
vi.stubGlobal("window", {
  localStorage: {
    getItem: (key: string) => storage.get(key) ?? null,
    setItem: (key: string, value: string) => void storage.set(key, value),
  },
});

const ROWS: NumberingRow[] = [
  { id: "row-a", effectiveDate: "2026-01-01", prefix: "MR", separator: "-", startNo: 100 },
  { id: "row-b", effectiveDate: "2026-10-01", prefix: "MI", separator: "", startNo: 1 },
];

function memo(overrides: Partial<MemoReceiveFormValues> = {}): MemoReceiveFormValues {
  const filled = { ...emptyLine(), stone: "Ruby", pcs: "2", weightCt: "1.5", unitPrice: "100", photos: [{ id: "p1", name: "a.jpg", url: "blob:a" }] };
  return {
    ...emptyMemoReceive(),
    docDate: "2026-10-28",
    dueDate: "2026-11-28",
    vendorId: "vendor-1",
    addressId: "address-1",
    currency: "THB",
    lines: [filled, emptyLine(), { ...filled, key: "second", stone: "Sapphire" }],
    ...overrides,
  };
}

beforeEach(() => {
  storage.clear();
  resetMemoReceiveStore();
});

describe("document number from Document Setup (UT-MR-01, Q-MR-02)", () => {
  it("uses the row in effect on the doc date: start number, then highest + 1; plain 1, 2, 3 without a row", () => {
    expect(rowInEffect(ROWS, "2026-09-30")?.id).toBe("row-a");
    expect(rowInEffect(ROWS, "2026-10-01")?.id).toBe("row-b");
    expect(rowInEffect(ROWS, "2025-12-31")).toBeNull();
    expect(nextDocNumber(ROWS, "2026-05-01", []).docNo).toBe("MR-100");
    expect(nextDocNumber(ROWS, "2026-05-01", [{ numberingId: "row-a", runningNo: 104 }, { numberingId: "row-b", runningNo: 9 }]).docNo).toBe("MR-105");
    expect(nextDocNumber(ROWS, "2026-10-28", [{ numberingId: "row-b", runningNo: 9 }]).docNo).toBe("MI10");
    expect(nextDocNumber([], "2026-10-28", [{ numberingId: null, runningNo: 2 }])).toEqual({ numberingId: null, runningNo: 3, docNo: "3" });
  });
});

describe("mock store (UT-MR-02)", () => {
  it("saves as Pending Approval, drops empty rows and gives Stock IDs 1, 2, 3 that are never reused", async () => {
    const first = await createMemoReceive(memo(), ROWS, "V001 · Gem Co");
    expect(first).toMatchObject({ docNo: "MI1", status: "PENDING_APPROVAL" });
    expect(first.lines.map((line) => line.stockId)).toEqual(["1", "2"]);
    const second = await createMemoReceive(memo(), ROWS, "V001 · Gem Co");
    expect(second.docNo).toBe("MI2");
    expect(second.lines.map((line) => line.stockId)).toEqual(["3", "4"]);

    await deleteMemoReceive(second.id);
    const third = await createMemoReceive(memo(), ROWS, "V001 · Gem Co");
    expect(third.lines.map((line) => line.stockId)).toEqual(["5", "6"]);
    expect((await listMemoReceives()).map((entry) => entry.docNo)).toEqual([third.docNo, "MI1"]);
  });

  it("keeps Stock IDs on update, numbers new rows, and stores no photos in localStorage", async () => {
    const created = await createMemoReceive(memo(), [], "Vendor");
    expect(created.docNo).toBe("1");
    const lines = [...created.lines, { ...emptyLine(), stone: "Emerald" }];
    const updated = await updateMemoReceive(created.id, { ...created, lines }, "Vendor");
    expect(updated.lines.map((line) => line.stockId)).toEqual(["1", "2", "3"]);
    const raw = JSON.parse(storage.get(STORAGE_KEY) ?? "{}") as { docs: { values: MemoReceiveFormValues }[] };
    expect(raw.docs[0].values.lines.every((line) => line.photos.length === 0)).toBe(true);
    expect((await getMemoReceive(created.id))?.lines[0].photos).toHaveLength(1);
  });
});

describe("stored data (UT-MR-03)", () => {
  it("ignores invalid documents and never lowers the Stock ID counter", async () => {
    const created = await createMemoReceive(memo(), [], "Vendor");
    const raw = JSON.parse(storage.get(STORAGE_KEY) ?? "{}") as { nextStockId: number; docs: unknown[] };
    const state = parseState(JSON.stringify({ nextStockId: 1, docs: [...raw.docs, { id: "bad" }, "x"] }));
    expect(state.docs.map((doc) => doc.id)).toEqual([created.id]);
    expect(state.nextStockId).toBe(3);
    expect(parseState("not json")).toEqual({ nextStockId: 1, docs: [] });
    expect(parseState(JSON.stringify({ docs: Array.from({ length: MAX_DOCUMENTS + 5 }, () => raw.docs[0]) })).docs).toHaveLength(MAX_DOCUMENTS);
  });
});

describe("approval (UT-MR-04, Q-MR-05)", () => {
  it("can edit and delete until approved", async () => {
    expect(isEditableMemo("PENDING_APPROVAL")).toBe(true);
    expect(isEditableMemo("APPROVED")).toBe(false);
    const created = await createMemoReceive(memo(), [], "Vendor");
    const raw = JSON.parse(storage.get(STORAGE_KEY) ?? "{}") as { nextStockId: number; docs: { status: string }[] };
    raw.docs[0].status = "APPROVED";
    storage.set(STORAGE_KEY, JSON.stringify(raw));
    resetMemoReceiveStore();
    await expect(updateMemoReceive(created.id, memo(), "Vendor")).rejects.toThrow("approved");
    await expect(deleteMemoReceive(created.id)).rejects.toThrow("approved");
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
    const totals = calculateTotals(values);
    expect(toFixed(totals.subtotal, 2)).toBe("335.00"); // 1.5 ct × 100 − 10% + 2 pcs × 100
    expect(toFixed(totals.discountAmount, 2)).toBe("50.00");
    expect(toFixed(totals.grandTotal, 2)).toBe("304.95"); // (335 − 50) × 1.07
  });
});

describe("page setting and menu (UT-MR-06)", () => {
  it("Stock ID is automatic and replaces the Stone Code, location is a list; Quotation keeps its own setting; the menu opens the page", () => {
    expect(MEMO_RECEIVE_KIND).toMatchObject({ stockId: "auto", stoneCode: false });
    expect(MEMO_RECEIVE_KIND.locations?.length).toBeGreaterThan(0);
    expect(MEMO_RECEIVE_KIND.documentNote.max).toBe(250);
    expect(QUOTATION_KIND).toMatchObject({ stockId: "from-stock", stoneCode: true, locations: null });
    expect(QUOTATION_KIND.documentNote.max).toBe(500);
    expect(navigationHref({ label: "Memo Receive", slug: "memo-receive" })).toBe("/memo/memo-receive");
  });
});
