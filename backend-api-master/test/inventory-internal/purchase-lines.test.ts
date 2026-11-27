import { describe, expect, it } from "vitest";
import { Prisma } from "../../src/generated/prisma/client";
import { amountBase, decodeSearchCursor, encodeSearchCursor, rateToCompany, toLineRef, unitCostBase } from "../../src/inventory-internal/purchase-lines";
import { loadableSearchSchema, masterDataResolveSchema, numberingResolveSchema } from "../../src/inventory-internal/inventory-internal.schemas";

/** UT-LS-B11 (BE-LS-004): PurchaseLineRef mapping, cost in the company currency and the picker cursor. */
const D = (value: string) => new Prisma.Decimal(value);
const row = (patch: Record<string, unknown> = {}) => ({
  id: "l1", purchase_id: "p1", position: 1, source: "MANUAL", stone_code_id: null, stone_code_snapshot: "RB-OV", stone: "Ruby", shape: "Oval", size: "", color: "Red",
  clarity: "", cutting: "", quality: "", lot: "L", location: "Safe A", cer_type: "", cer_no: "", pcs: 10, weight_ct: "5.000", price_unit: "PER_CT",
  unit_price: "1000.00", discount_type: "PERCENT", discount_value: "10", amount: "4500.00", item_note: "", loaded_pcs: 7, loaded_weight_ct: "3.000",
  own_pcs: 0, own_weight_ct: "0", doc_no: "PU-1", doc_date: "2026-11-01", currency_code: "USD", exchange_rate: "35.5", status: "APPROVED", deleted: false,
  vendor_id: "v1", vendor_code_snapshot: "V1", vendor_name_snapshot: "Vendor One", photo_count: 2, company_currency: "THB", ...patch,
}) as Parameters<typeof toLineRef>[0];

describe("toLineRef", () => {
  it("net unit price after the line discount × PU rate, remaining and its amount in the company currency", () => {
    expect(toLineRef(row())).toMatchObject({
      purchaseLineId: "l1", netUnitPrice: "900.0000", unitCostBase: "31950.0000", remainingPcs: 3, remainingWeightCt: "2.000",
      remainingAmountBase: "63900.00", purchase: { rate: "35.5", currency: "USD", docNo: "PU-1" }, photoCount: 2, status: "OPEN", vendorId: "v1", vendorCode: "V1", vendorName: "Vendor One", location: "Safe A",
    });
  });

  it("rate 1 in the company currency; PER_PCS uses pieces; own allocation counts back as remaining", () => {
    const ref = toLineRef(row({ currency_code: "THB", exchange_rate: null, price_unit: "PER_PCS", unit_price: "100.00", discount_type: "NONE", discount_value: "0", amount: "1000.00", own_pcs: 2, own_weight_ct: "1" }));
    expect(ref).toMatchObject({ purchase: { rate: "1" }, unitCostBase: "100.0000", remainingPcs: 5, remainingWeightCt: "3.000", remainingAmountBase: "500.00" });
  });

  it("status: CLOSED at remaining pcs 0 (weight left is written off); UNAVAILABLE when not approved / deleted / STOCK", () => {
    expect(toLineRef(row({ loaded_pcs: 10 })).status).toBe("CLOSED");
    expect(toLineRef(row({ status: "PENDING_APPROVAL" })).status).toBe("UNAVAILABLE");
    expect(toLineRef(row({ deleted: true })).status).toBe("UNAVAILABLE");
    expect(toLineRef(row({ source: "STOCK" })).status).toBe("UNAVAILABLE");
  });

  it("cost helpers round half-up (4 dp unit, 2 dp amount)", () => {
    expect(unitCostBase(D("0.33335"), D("1")).toFixed(4)).toBe("0.3334");
    expect(amountBase("PER_CT", 1, D("1.005"), D("1")).toFixed(2)).toBe("1.01");
    expect(amountBase("PER_PCS", 3, D("9"), D("1.115")).toFixed(2)).toBe("3.35");
    expect(rateToCompany("USD", "35", null).toString()).toBe("1");
    expect(rateToCompany("USD", "35", "THB").toString()).toBe("35");
  });
});

describe("picker input and cursor", () => {
  it("cursor round-trips and refuses tampering", () => {
    const cursor = { d: "2026-11-01", p: "0193a000-0000-7000-8000-000000000001", n: 3 };
    expect(decodeSearchCursor(encodeSearchCursor(cursor))).toEqual(cursor);
    for (const bad of ["***", Buffer.from("{}").toString("base64url"), Buffer.from(JSON.stringify({ ...cursor, x: 1 })).toString("base64url"), Buffer.from(JSON.stringify({ ...cursor, n: -1 })).toString("base64url")]) {
      expect(() => decodeSearchCursor(bad)).toThrow();
    }
  });

  it("search: strict, ≤ 50 per page, ≤ 200 distinct exclusions, date range ≤ 366 days and in order", () => {
    expect(loadableSearchSchema.parse({}).limit).toBe(50);
    expect(loadableSearchSchema.safeParse({ limit: 51 }).success).toBe(false);
    expect(loadableSearchSchema.safeParse({ from: "2026-01-01", to: "2027-01-02" }).success).toBe(true);
    expect(loadableSearchSchema.safeParse({ from: "2026-01-01", to: "2027-01-03" }).success).toBe(false);
    expect(loadableSearchSchema.safeParse({ from: "2026-02-01", to: "2026-01-01" }).success).toBe(false);
    expect(loadableSearchSchema.safeParse({ from: "2026-02-30" }).success).toBe(false);
    const id = "0193a000-0000-7000-8000-000000000001";
    expect(loadableSearchSchema.safeParse({ excludeLineIds: [id, id] }).success).toBe(false);
    expect(loadableSearchSchema.safeParse({ extra: 1 }).success).toBe(false);
  });

  it("resolve / numbering inputs are strict and bounded", () => {
    expect(masterDataResolveSchema.safeParse({ stoneCodeIds: [], locationNames: ["Safe A"] }).success).toBe(true);
    expect(masterDataResolveSchema.safeParse({ stoneCodeIds: [], locationNames: ["x".repeat(41)] }).success).toBe(false);
    expect(numberingResolveSchema.safeParse({ transactionKey: "load-to-stock", docDate: "2026-11-17", markUsed: true }).success).toBe(true);
    expect(numberingResolveSchema.safeParse({ transactionKey: "stock-adjustment", docDate: "2026-11-17", markUsed: false }).success).toBe(true);
    expect(numberingResolveSchema.safeParse({ transactionKey: "purchase", docDate: "2026-11-17", markUsed: true }).success).toBe(false);
  });
});
