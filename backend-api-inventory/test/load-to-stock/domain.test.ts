import { describe, expect, it } from "vitest";
import { Decimal } from "../../src/platform/db";
import { AppError } from "../../src/platform/errors";
import type { BatchLine } from "../../src/platform/master-api";
import { highestPricedSource, rowPriceUnit, rowUnitCost, sourceAmount } from "../../src/modules/load-to-stock/cost";
import { allocationLines, prepareDocument, type PrepareContext } from "../../src/modules/load-to-stock/prepare";
import { loadInputSchema, loadUpdateSchema } from "../../src/modules/load-to-stock/schemas";
import { Limiter, signatureMatches, sniffType } from "../../src/modules/load-to-stock/photos";

/** UT-LS-B01 (schemas), UT-LS-B02 (cost), UT-LS-B03 (Save validation / remaining), photo helpers. */
const V = "0193a000-0000-7000-8000-000000000001";
const L1 = "0193a000-0000-7000-8000-0000000000a1";
const L2 = "0193a000-0000-7000-8000-0000000000a2";
const attrs = { stoneCodeId: null, stoneCode: "", stone: "Ruby", shape: "", size: "", color: "", clarity: "", cutting: "", quality: "", lot: "", cerType: "", cerNo: "" };
const row = (sources: { purchaseLineId: string; pcs: number; weightCt: string }[], patch: Record<string, unknown> = {}) => ({ sources, location: "Safe A", attrs, stockPrice: "1", salePrice: "2", photoIds: [], ...patch });
const input = (rows: unknown[], mode = "NONE") => ({ docDate: "2026-11-17", vendorId: V, mode, rows });
const fieldCodes = (result: { success: boolean; error?: { issues: { params?: { code?: string }; code: string; path: PropertyKey[] }[] } }) =>
  result.error?.issues.map((issue) => `${issue.path.join(".")}:${issue.params?.code ?? issue.code}`) ?? [];

describe("UT-LS-B01 schemas", () => {
  it("strict, 1–200 rows, decimals as strings with scale limits, required location / prices, ≤ 5 distinct photos", () => {
    expect(loadInputSchema.safeParse(input([row([{ purchaseLineId: L1, pcs: 1, weightCt: "1.123" }])])).success).toBe(true);
    expect(loadInputSchema.safeParse(input([])).success).toBe(false);
    expect(loadInputSchema.safeParse(input(Array.from({ length: 201 }, () => row([{ purchaseLineId: L1, pcs: 1, weightCt: "1" }])), "SPLIT")).success).toBe(false);
    expect(loadInputSchema.safeParse(input([row([{ purchaseLineId: L1, pcs: 1, weightCt: "1.1234" }])])).success).toBe(false);
    expect(loadInputSchema.safeParse(input([row([{ purchaseLineId: L1, pcs: 1, weightCt: 1 as unknown as string }])])).success).toBe(false);
    expect(loadInputSchema.safeParse(input([row([{ purchaseLineId: L1, pcs: 1, weightCt: "1" }], { stockPrice: "1.001" })])).success).toBe(false);
    expect(loadInputSchema.safeParse(input([row([{ purchaseLineId: L1, pcs: 1, weightCt: "1" }], { location: " " })])).success).toBe(false);
    expect(loadInputSchema.safeParse(input([row([{ purchaseLineId: L1, pcs: 1, weightCt: "1" }], { parcel: "x".repeat(51) })])).success).toBe(false);
    expect(loadInputSchema.safeParse(input([row([{ purchaseLineId: L1, pcs: 1, weightCt: "1" }], { photoIds: [L1, L1] })])).success).toBe(false);
    expect(loadInputSchema.safeParse({ ...input([row([{ purchaseLineId: L1, pcs: 1, weightCt: "1" }])]), extra: 1 }).success).toBe(false);
    expect(loadUpdateSchema.safeParse({ ...input([row([{ purchaseLineId: L1, pcs: 1, weightCt: "1" }])]), expectedVersion: 0 }).success).toBe(false);
  });

  it("mode shape: NONE 1:1 (a line once), SPLIT one source per row, MERGE exactly one row with ≥ 2 sources", () => {
    expect(fieldCodes(loadInputSchema.safeParse(input([row([{ purchaseLineId: L1, pcs: 1, weightCt: "1" }]), row([{ purchaseLineId: L1, pcs: 1, weightCt: "1" }])])))).toContain("rows.1.sources.0.purchaseLineId:mode_shape");
    expect(loadInputSchema.safeParse(input([row([{ purchaseLineId: L1, pcs: 1, weightCt: "1" }]), row([{ purchaseLineId: L1, pcs: 1, weightCt: "1" }])], "SPLIT")).success).toBe(true);
    expect(fieldCodes(loadInputSchema.safeParse(input([row([{ purchaseLineId: L1, pcs: 1, weightCt: "1" }, { purchaseLineId: L2, pcs: 1, weightCt: "1" }])], "SPLIT")))).toContain("rows.0.sources:mode_shape");
    expect(fieldCodes(loadInputSchema.safeParse(input([row([{ purchaseLineId: L1, pcs: 1, weightCt: "1" }])], "MERGE")))).toContain("rows:mode_shape");
    expect(loadInputSchema.safeParse(input([row([{ purchaseLineId: L1, pcs: 1, weightCt: "1" }, { purchaseLineId: L2, pcs: 1, weightCt: "1" }])], "MERGE")).success).toBe(true);
    expect(fieldCodes(loadInputSchema.safeParse(input([row([{ purchaseLineId: L1, pcs: 1, weightCt: "1" }, { purchaseLineId: L1, pcs: 1, weightCt: "1" }])], "MERGE")))).toContain("rows.0.sources.1.purchaseLineId:duplicate");
  });
});

describe("UT-LS-B02 cost", () => {
  it("source amount by price unit (2 dp half-up); row unit price = cost ÷ basis (design numbers 1,387,835.60 ÷ 29.30 = 47,366.40)", () => {
    expect(sourceAmount("PER_CT", 5, "1.005", "1000.0000").toFixed(2)).toBe("1005.00");
    expect(sourceAmount("PER_PCS", 3, "9", "1.1150").toFixed(2)).toBe("3.35");
    const unit = rowUnitCost("PER_CT", 10, new Decimal("29.30"), new Decimal("1387835.60"));
    expect(unit.toDecimalPlaces(2).toFixed(2)).toBe("47366.40");
    expect(rowUnitCost("PER_CT", 1, new Decimal(0), new Decimal(5)).toFixed(4)).toBe("0.0000");
  });

  it("merged unit PER_CT unless every source is PER_PCS; highest company-currency amount per piece wins (ties: first)", () => {
    expect(rowPriceUnit("MERGE", ["PER_PCS", "PER_CT"])).toBe("PER_CT");
    expect(rowPriceUnit("MERGE", ["PER_PCS", "PER_PCS"])).toBe("PER_PCS");
    expect(rowPriceUnit("NONE", ["PER_PCS"])).toBe("PER_PCS");
    expect(highestPricedSource([
      { priceUnit: "PER_CT", remainingPcs: 2, remainingWeightCt: "1", unitCostBase: "1000" },
      { priceUnit: "PER_PCS", remainingPcs: 1, remainingWeightCt: "1", unitCostBase: "900" },
    ])).toBe(1);
    expect(highestPricedSource([
      { priceUnit: "PER_PCS", remainingPcs: 1, remainingWeightCt: "1", unitCostBase: "5" },
      { priceUnit: "PER_PCS", remainingPcs: 1, remainingWeightCt: "1", unitCostBase: "5" },
    ])).toBe(0);
  });
});

const line = (id: string, patch: Partial<BatchLine> = {}): BatchLine => ({
  purchaseLineId: id, ...attrs, purchase: { id: "p", docNo: "PU-1", docDate: "2026-11-01", currency: "THB", rate: "1" }, location: "Safe A", priceUnit: "PER_CT",
  unitPrice: "1000.00", netUnitPrice: "1000.0000", unitCostBase: "1000.0000", pcs: 10, weightCt: "5.000", remainingPcs: 10, remainingWeightCt: "5.000",
  remainingAmountBase: "5000.00", photoCount: 0, itemNote: "", status: "OPEN", vendorId: V, ...patch,
});
const context = (lines: BatchLine[], patch: Partial<PrepareContext> = {}): PrepareContext => ({
  lines, stoneCodes: [], locations: [{ input: "Safe A", name: "Safe A" }, { input: "safe a", name: "Safe A" }], storedRows: new Map(), companyCurrency: "THB", vendor: { code: "V", name: "Vendor" }, ...patch,
});
const failure = (run: () => unknown) => { try { run(); } catch (error) { return error as AppError; } throw new Error("expected failure"); };

describe("UT-LS-B03 Save validation", () => {
  it("partial load within remaining; Split Σ ≤ remaining; over remaining → exceeds_remaining with params", () => {
    const doc = prepareDocument(loadInputSchema.parse(input([row([{ purchaseLineId: L1, pcs: 7, weightCt: "3.5" }])])), context([line(L1)]));
    expect(doc.rows[0]).toMatchObject({ pcs: 7, weightCt: "3.500", costAmountBase: "3500.00", unitCostBase: "1000.0000" });
    expect(doc.totals).toEqual({ rowCount: 1, pcs: 7, weightCt: "3.500", costAmountBase: "3500.00" });
    const over = failure(() => prepareDocument(loadInputSchema.parse(input([row([{ purchaseLineId: L1, pcs: 6, weightCt: "1" }]), row([{ purchaseLineId: L1, pcs: 5, weightCt: "1" }])], "SPLIT")), context([line(L1)])));
    expect(over.details).toEqual({ fieldErrors: [{ path: "rows.0.pcs", code: "exceeds_remaining", params: { purchaseLineId: L1, remainingPcs: 10, remainingWeightCt: "5.000" } }] });
    expect(allocationLines([{ sources: [{ purchaseLineId: L1, pcs: 2, weightCt: "1" }] }, { sources: [{ purchaseLineId: L1, pcs: 3, weightCt: "0.5" }] }])).toEqual([{ purchaseLineId: L1, pcs: 5, weightCt: "1.500" }]);
  });

  it("owner Q-LS-26: row pcs ≥ 1; weight 0 only when the source line weighs 0; a closed (pcs 0 remaining) line is refused", () => {
    const zeroWeight = failure(() => prepareDocument(loadInputSchema.parse(input([row([{ purchaseLineId: L1, pcs: 1, weightCt: "0" }])])), context([line(L1)])));
    expect(zeroWeight.details?.fieldErrors).toEqual([{ path: "rows.0.weightCt", code: "too_small" }]);
    expect(prepareDocument(loadInputSchema.parse(input([row([{ purchaseLineId: L1, pcs: 1, weightCt: "0" }])])), context([line(L1, { weightCt: "0.000", remainingWeightCt: "0.000" })])).rows[0].weightCt).toBe("0.000");
    const zeroPcs = failure(() => prepareDocument(loadInputSchema.parse(input([row([{ purchaseLineId: L1, pcs: 0, weightCt: "1" }])])), context([line(L1)])));
    expect(zeroPcs.details?.fieldErrors).toEqual([{ path: "rows.0.pcs", code: "too_small" }]);
    const closed = failure(() => prepareDocument(loadInputSchema.parse(input([row([{ purchaseLineId: L1, pcs: 1, weightCt: "0.1" }])])), context([line(L1, { remainingPcs: 0, status: "CLOSED" })])));
    expect(closed.code).toBe("VALIDATION_ERROR");
  });

  it("MERGE takes each source's full remaining (client quantities ignored), mixed units → PER_CT", () => {
    const doc = prepareDocument(loadInputSchema.parse(input([row([{ purchaseLineId: L1, pcs: 0, weightCt: "0" }, { purchaseLineId: L2, pcs: 0, weightCt: "0" }])], "MERGE")),
      context([line(L1, { remainingPcs: 3, remainingWeightCt: "1.500" }), line(L2, { priceUnit: "PER_PCS", unitCostBase: "300.0000", remainingPcs: 2, remainingWeightCt: "1.000" })]));
    expect(doc.rows[0]).toMatchObject({ pcs: 5, weightCt: "2.500", priceUnit: "PER_CT", costAmountBase: "2100.00" });
  });

  it("unavailable / other-vendor lines, inactive locations (stored name kept on update), stone codes, unknown row ids", () => {
    expect(failure(() => prepareDocument(loadInputSchema.parse(input([row([{ purchaseLineId: L1, pcs: 1, weightCt: "1" }])])), context([]))).code).toBe("LOAD_TO_STOCK_LINE_UNAVAILABLE");
    expect(failure(() => prepareDocument(loadInputSchema.parse(input([row([{ purchaseLineId: L1, pcs: 1, weightCt: "1" }])])), context([line(L1, { status: "UNAVAILABLE" })]))).details).toMatchObject({ purchaseLineIds: [L1], rowPaths: ["rows.0.sources.0"] });
    expect(failure(() => prepareDocument(loadInputSchema.parse(input([row([{ purchaseLineId: L1, pcs: 1, weightCt: "1" }])])), context([line(L1, { vendorId: "other" })]))).details?.fieldErrors).toEqual([{ path: "rows.0.sources.0.purchaseLineId", code: "vendor_mismatch" }]);
    const inactive = failure(() => prepareDocument(loadInputSchema.parse(input([row([{ purchaseLineId: L1, pcs: 1, weightCt: "1" }], { location: "Old Vault" })])), context([line(L1)])));
    expect(inactive).toMatchObject({ status: 409, code: "LOCATION_INACTIVE", details: { rowPaths: ["rows.0"] } });
    const rowId = "0193a000-0000-7000-8000-0000000000f1";
    const kept = prepareDocument(loadInputSchema.parse(input([row([{ purchaseLineId: L1, pcs: 1, weightCt: "1" }], { id: rowId, location: "Old Vault" })])), context([line(L1)], { storedRows: new Map([[rowId, { location: "Old Vault", stoneCodeId: null }]]) }));
    expect(kept.rows[0]).toMatchObject({ id: rowId, existing: true, location: "Old Vault" });
    expect(prepareDocument(loadInputSchema.parse(input([row([{ purchaseLineId: L1, pcs: 1, weightCt: "1" }], { location: "safe a" })])), context([line(L1)])).rows[0].location).toBe("Safe A");
    const code = failure(() => prepareDocument(loadInputSchema.parse(input([row([{ purchaseLineId: L1, pcs: 1, weightCt: "1" }], { attrs: { ...attrs, stoneCodeId: L2 } })])), context([line(L1)], { stoneCodes: [{ id: L2, active: false }] })));
    expect(code.details?.fieldErrors).toEqual([{ path: "rows.0.attrs.stoneCodeId", code: "invalid" }]);
    const unknown = failure(() => prepareDocument(loadInputSchema.parse(input([row([{ purchaseLineId: L1, pcs: 1, weightCt: "1" }], { id: rowId })])), context([line(L1)])));
    expect(unknown.details?.fieldErrors).toEqual([{ path: "rows.0.id", code: "unknown_row" }]);
  });
});

describe("photos helpers", () => {
  it("signature check by bytes, not by declared type", () => {
    expect(sniffType(new Uint8Array([0xff, 0xd8, 0xff, 0x00]))).toBe("image/jpeg");
    expect(sniffType(new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))).toBe("image/png");
    expect(sniffType(Buffer.from("GIF89a"))).toBeNull();
    expect(signatureMatches("image/png", new Uint8Array([0xff, 0xd8, 0xff]))).toBe(false);
  });

  it("the limiter refuses at its cap with 429 instead of queueing", async () => {
    const limiter = new Limiter(1);
    let release: () => void = () => undefined;
    const busy = limiter.run(() => new Promise<void>((resolve) => { release = resolve; }));
    await expect(limiter.run(async () => 1)).rejects.toMatchObject({ status: 429, code: "RATE_LIMITED" });
    release();
    await busy;
    expect(await limiter.run(async () => 2)).toBe(2);
  });
});
