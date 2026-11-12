import { describe, expect, it, vi } from "vitest";
import {
  createPurchaseSchema,
  purchaseListSchema,
  purchaseMemoStockSchema,
  purchaseOrderLinesSchema,
  updatePurchaseSchema,
} from "../../src/purchase/purchase.schemas";

/**
 * UT-PU-B01 (purchase SA rev 1, api-contract "Input rules"): strict input, the line source rules, duplicates,
 * quantities and price, the picked-line discount lock (D8), no photos (Q-PU-11), create without line ids, 1..200 lines,
 * dates and the two picker inputs.
 */

vi.mock("../../src/database/prisma-client", () => ({ prisma: {} }));

const ID = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
const base = {
  stoneCodeId: null, stoneCode: "", stone: "Ruby", shape: "", size: "", color: "", clarity: "", cutting: "", quality: "",
  lot: "", location: "", cerType: "", cerNo: "", pcs: 2, weightCt: "1.5", priceUnit: "PER_CT", unitPrice: "1000",
  discount: { type: "NONE", value: "0" }, itemNote: "", photoIds: [],
};
const manual = (patch: Record<string, unknown> = {}) => ({ ...base, source: "MANUAL", ...patch });
const stock = (patch: Record<string, unknown> = {}) => ({ ...base, source: "STOCK", memoStockId: ID(5), memoGroup: "IN_STOCK", ...patch });
const fromPo = (patch: Record<string, unknown> = {}) => ({ ...base, source: "PURCHASE_ORDER", purchaseOrderLineId: ID(7), ...patch });
const input = (lines: unknown[], patch: Record<string, unknown> = {}) => ({
  docDate: "2026-11-04", dueDate: "2026-12-04", currency: "THB", exchangeRate: null, ref: "", documentNote: "", lines,
  discount: { type: "NONE", value: "0" }, tax: { enabled: false, rate: "7", includeInPrice: false }, serviceCharges: [], labor: null,
  vendorId: ID(1), addressId: ID(2), ...patch,
});
const paths = (result: { success: boolean; error?: { issues: { path: PropertyKey[]; code: string; params?: unknown }[] } }) =>
  (result.error?.issues ?? []).map((issue) => `${issue.path.join(".")}:${(issue.params as { code?: string } | undefined)?.code ?? issue.code}`);

describe("purchase input (UT-PU-B01)", () => {
  it("accepts the three sources; MANUAL keeps a line discount within bounds", () => {
    expect(createPurchaseSchema.safeParse(input([manual(), stock(), stock({ memoGroup: "SOLD" }), fromPo()])).success).toBe(true);
    expect(createPurchaseSchema.safeParse(input([manual({ discount: { type: "PERCENT", value: "10" } })])).success).toBe(true);
    expect(paths(createPurchaseSchema.safeParse(input([manual({ discount: { type: "AMOUNT", value: "1500.01" } })])))).toEqual(["lines.0.discount.value:exceeds_gross"]);
  });

  it("source rules: STOCK needs memoStockId + memoGroup; PURCHASE_ORDER needs purchaseOrderLineId; MANUAL has neither", () => {
    expect(paths(createPurchaseSchema.safeParse(input([stock({ memoStockId: null })])))).toEqual(["lines.0.memoStockId:required"]);
    expect(paths(createPurchaseSchema.safeParse(input([stock({ memoGroup: undefined })])))).toEqual(["lines.0.memoGroup:required"]);
    expect(paths(createPurchaseSchema.safeParse(input([stock({ purchaseOrderLineId: ID(7) })])))).toEqual(["lines.0.purchaseOrderLineId:not_allowed"]);
    expect(paths(createPurchaseSchema.safeParse(input([fromPo({ purchaseOrderLineId: null })])))).toEqual(["lines.0.purchaseOrderLineId:required"]);
    expect(paths(createPurchaseSchema.safeParse(input([fromPo({ memoStockId: ID(5), memoGroup: "SOLD" })])))).toEqual(["lines.0.memoStockId:not_allowed", "lines.0.memoGroup:not_allowed"]);
    expect(paths(createPurchaseSchema.safeParse(input([manual({ memoGroup: "IN_STOCK", purchaseOrderLineId: ID(7) })])))).toEqual(["lines.0.memoGroup:not_allowed", "lines.0.purchaseOrderLineId:not_allowed"]);
    expect(createPurchaseSchema.safeParse(input([stock({ memoGroup: "RESERVED" })])).success).toBe(false);
    expect(createPurchaseSchema.safeParse(input([stock({ source: "SALE" })])).success).toBe(false);
  });

  it("duplicates: one (memoStockId, group) pair and one PO line per document; the same item may appear once per group", () => {
    expect(paths(createPurchaseSchema.safeParse(input([stock(), stock()])))).toEqual(["lines.1.memoStockId:duplicate"]);
    expect(createPurchaseSchema.safeParse(input([stock(), stock({ memoGroup: "SOLD" })])).success).toBe(true);
    expect(paths(createPurchaseSchema.safeParse(input([fromPo(), manual(), fromPo()])))).toEqual(["lines.2.purchaseOrderLineId:duplicate"]);
  });

  it("quantities and price: pcs or weight > 0, unit price > 0, bounds; a picked line must send discount NONE (D8)", () => {
    expect(paths(createPurchaseSchema.safeParse(input([manual({ pcs: 0, weightCt: "0" })])))).toEqual(["lines.0.pcs:required"]);
    expect(createPurchaseSchema.safeParse(input([manual({ pcs: 0, weightCt: "0.001" })])).success).toBe(true);
    expect(paths(createPurchaseSchema.safeParse(input([fromPo({ unitPrice: "0" })])))).toEqual(["lines.0.unitPrice:required"]);
    expect(paths(createPurchaseSchema.safeParse(input([stock({ discount: { type: "AMOUNT", value: "1" } })])))).toEqual(["lines.0.discount:not_allowed"]);
    expect(paths(createPurchaseSchema.safeParse(input([fromPo({ discount: { type: "PERCENT", value: "0" } })])))).toEqual(["lines.0.discount:not_allowed"]);
    expect(createPurchaseSchema.safeParse(input([manual({ pcs: 1_000_000 })])).success).toBe(false);
    expect(createPurchaseSchema.safeParse(input([manual({ weightCt: "1.2345" })])).success).toBe(false);
    expect(createPurchaseSchema.safeParse(input([manual({ unitPrice: "1.001" })])).success).toBe(false);
    expect(createPurchaseSchema.safeParse(input([manual({ location: "x".repeat(41) })])).success).toBe(false);
    expect(createPurchaseSchema.safeParse(input([manual({ itemNote: "x".repeat(501) })])).success).toBe(false);
  });

  it("strict: unknown keys, more than 5 / duplicate photos, line ids on create, 0 or 201 lines and bad dates are refused", () => {
    expect(createPurchaseSchema.safeParse(input([manual({ pendingPcs: 3 })])).success).toBe(false);
    expect(createPurchaseSchema.safeParse(input([manual()], { customerId: ID(3) })).success).toBe(false);
    // ADR-0048 (owner 2026-11-11): up to 5 distinct photos per line.
    expect(createPurchaseSchema.safeParse(input([manual({ photoIds: [ID(9)] })])).success).toBe(true);
    expect(createPurchaseSchema.safeParse(input([manual({ photoIds: [ID(9), ID(9)] })])).success).toBe(false);
    expect(createPurchaseSchema.safeParse(input([manual({ photoIds: [1, 2, 3, 4, 5, 6].map((n) => ID(n)) })])).success).toBe(false);
    expect(paths(createPurchaseSchema.safeParse(input([manual({ id: ID(9) })])))).toEqual(["lines.0:unrecognized_keys"]);
    expect(createPurchaseSchema.safeParse(input([])).success).toBe(false);
    expect(createPurchaseSchema.safeParse(input(Array.from({ length: 200 }, () => manual()))).success).toBe(true);
    expect(createPurchaseSchema.safeParse(input(Array.from({ length: 201 }, () => manual()))).success).toBe(false);
    expect(paths(createPurchaseSchema.safeParse(input([manual()], { dueDate: "2026-11-03" })))).toEqual(["dueDate:before_doc_date"]);
  });

  it("update keeps saved line ids, which must be distinct, and needs id + expectedVersion", () => {
    const update = (lines: unknown[]) => ({ ...input(lines), id: ID(9), expectedVersion: 2 });
    expect(updatePurchaseSchema.safeParse(update([manual({ id: ID(3) }), fromPo({ id: ID(4) }), stock()])).success).toBe(true);
    expect(paths(updatePurchaseSchema.safeParse(update([manual({ id: ID(3) }), manual({ id: ID(3) })])))).toEqual(["lines.1.id:duplicate"]);
    expect(updatePurchaseSchema.safeParse({ ...input([manual()]), id: ID(9) }).success).toBe(false);
  });

  it("list: status enum, date range ≤ 366 days, limit ≤ 50", () => {
    expect(purchaseListSchema.parse({ status: "APPROVED" })).toMatchObject({ status: "APPROVED", limit: 50 });
    // ADR-0050: DRAFT is a list status (BE-AP-006); a status outside the approval set is refused.
    expect(purchaseListSchema.safeParse({ status: "DRAFT" }).success).toBe(true);
    expect(purchaseListSchema.safeParse({ status: "CANCELLED" }).success).toBe(false);
    expect(paths(purchaseListSchema.safeParse({ from: "2026-01-01", to: "2027-01-03" }))).toEqual(["to:range_too_long"]);
    expect(purchaseListSchema.safeParse({ from: "2026-01-01", to: "2027-01-02" }).success).toBe(true);
    expect(purchaseListSchema.safeParse({ limit: 51 }).success).toBe(false);
  });

  it("pickers: vendor + currency required, status enums, dates ≤ 366 days, limit ≤ 50, strict", () => {
    expect(purchaseMemoStockSchema.parse({ vendorId: ID(1), currency: "THB" })).toMatchObject({ status: "ALL", limit: 50 });
    expect(purchaseMemoStockSchema.safeParse({ vendorId: ID(1) }).success).toBe(false);
    expect(purchaseMemoStockSchema.safeParse({ currency: "THB" }).success).toBe(false);
    expect(purchaseMemoStockSchema.safeParse({ vendorId: ID(1), currency: "thb" }).success).toBe(false);
    expect(purchaseMemoStockSchema.parse({ vendorId: ID(1), currency: "THB", status: "SOLD", direction: "forward" })).toMatchObject({ status: "SOLD" });
    expect(purchaseMemoStockSchema.safeParse({ vendorId: ID(1), currency: "THB", status: "OPEN" }).success).toBe(false);
    expect(paths(purchaseMemoStockSchema.safeParse({ vendorId: ID(1), currency: "THB", from: "2026-03-01", to: "2026-02-01" }))).toEqual(["to:before_from"]);
    expect(purchaseMemoStockSchema.safeParse({ vendorId: ID(1), currency: "THB", limit: 51 }).success).toBe(false);
    expect(purchaseMemoStockSchema.safeParse({ vendorId: ID(1), currency: "THB", q: "x".repeat(101) }).success).toBe(false);
    expect(purchaseMemoStockSchema.safeParse({ vendorId: ID(1), currency: "THB", extra: true }).success).toBe(false);
    expect(purchaseOrderLinesSchema.parse({ vendorId: ID(1), currency: "USD", status: "PARTLY_PURCHASED" })).toMatchObject({ status: "PARTLY_PURCHASED", limit: 50 });
    expect(purchaseOrderLinesSchema.safeParse({ vendorId: ID(1), currency: "USD", status: "SOLD" }).success).toBe(false);
    expect(paths(purchaseOrderLinesSchema.safeParse({ vendorId: ID(1), currency: "USD", from: "2025-01-01", to: "2026-11-04" }))).toEqual(["to:range_too_long"]);
  });
});

describe("merged lines (UT-PU-B07, SA-PU-21)", () => {
  it("accepts MERGED as a STOCK group; an item is one MERGED line or SOLD / IN_STOCK lines, never both", () => {
    expect(createPurchaseSchema.safeParse(input([stock({ memoGroup: "MERGED" }), stock({ memoStockId: ID(6), memoGroup: "SOLD" }), stock({ memoStockId: ID(6) })])).success).toBe(true);
    expect(paths(createPurchaseSchema.safeParse(input([stock({ memoGroup: "MERGED" }), stock({ memoGroup: "SOLD" })])))).toEqual(["lines.1.memoStockId:duplicate"]);
    expect(paths(createPurchaseSchema.safeParse(input([stock(), stock({ memoGroup: "MERGED" })])))).toEqual(["lines.1.memoStockId:duplicate"]);
    expect(paths(createPurchaseSchema.safeParse(input([stock({ memoGroup: "MERGED" }), stock({ memoGroup: "MERGED" })])))).toContain("lines.1.memoStockId:duplicate");
    expect(createPurchaseSchema.safeParse(input([manual({ memoGroup: "MERGED" })])).success).toBe(false);
    expect(purchaseMemoStockSchema.safeParse({ vendorId: ID(1), currency: "THB", status: "MERGED" }).success).toBe(false);
  });
});
