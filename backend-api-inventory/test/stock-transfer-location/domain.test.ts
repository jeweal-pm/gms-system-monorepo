import { describe, expect, it } from "vitest";
import { checkTransferLines, costShare, type SourceRow } from "../../src/modules/stock/transfer";
import { decodeStockCursor, encodeStockCursor } from "../../src/modules/stock/lots";
import { CARD_KINDS, DOCUMENT_TYPES, TRANSFER_SOURCED_TYPES } from "../../src/modules/stock/card-kinds";
import { transferInputSchema, stockQuerySchema } from "../../src/modules/stock-transfer-location/schemas";
import { AppError } from "../../src/platform/errors";

/** Stock Transfer Location unit tests (ADR-0060 checklist; testing.md UT-STL-01…05). */

const source = (patch: Partial<SourceRow> = {}): SourceRow => ({
  id: "s1", stock_id: "260001", status: "ACTIVE", location: "Safe A", price_unit: "PER_CT", pcs: 10, weight_ct: "5.000",
  on_hand_pcs: 10, on_hand_weight_ct: "5.000", cost_amount_base: "1000.00", version: 1, ...patch,
});
const line = (patch: Record<string, unknown> = {}) => ({ lineId: "l1", fromStockUuid: "s1", fromLocation: "Safe A", toLocation: "Safe B", pcs: 4, weightCt: "2.000", ...patch });

describe("UT-STL-01 cost share (D3: exact split)", () => {
  it("PER_CT splits by weight, PER_PCS by pieces, 2 dp half-up", () => {
    expect(costShare(source(), 4, "2.000").toFixed(2)).toBe("400.00");
    expect(costShare(source({ cost_amount_base: "100.00", weight_ct: "3.000" }), 1, "1.000").toFixed(2)).toBe("33.33");
    expect(costShare(source({ price_unit: "PER_PCS", cost_amount_base: "100.00" }), 3, "4.900").toFixed(2)).toBe("30.00");
  });
  it("a whole move takes the remainder, so source + new = original", () => {
    const original = source({ cost_amount_base: "100.00", weight_ct: "3.000", pcs: 3 });
    expect(costShare(original, 3, "3.000").toFixed(2)).toBe("100.00");
    const part = costShare(original, 1, "1.000");
    const rest = costShare({ ...original, pcs: 2, weight_ct: "2.000", cost_amount_base: original.cost_amount_base.replace("100.00", String(100 - part.toNumber())) }, 2, "2.000");
    expect(part.plus(rest).toFixed(2)).toBe("100.00");
  });
  it("a zero basis gives 0 unless the whole row moves", () => {
    expect(costShare(source({ price_unit: "PER_PCS", pcs: 0, on_hand_pcs: 0 }), 0, "1.000").toFixed(2)).toBe("0.00");
  });
});

describe("UT-STL-02 D7 checks", () => {
  const map = (row: SourceRow) => new Map([[row.id, row]]);
  it("passes within on hand", () => expect(checkTransferLines([line()], map(source()))).toEqual({ ok: true }));
  it("unavailable: missing, REVERSED or moved location", () => {
    expect(checkTransferLines([line()], new Map())).toMatchObject({ ok: false, code: "STOCK_TRANSFER_LINE_UNAVAILABLE", details: { lineIds: ["l1"] } });
    expect(checkTransferLines([line()], map(source({ status: "REVERSED" })))).toMatchObject({ code: "STOCK_TRANSFER_LINE_UNAVAILABLE" });
    expect(checkTransferLines([line({ fromLocation: "Safe C" })], map(source()))).toMatchObject({ code: "STOCK_TRANSFER_LINE_UNAVAILABLE" });
  });
  it("location: same as current (case-insensitive) or empty", () => {
    expect(checkTransferLines([line({ toLocation: " safe a " })], map(source()))).toMatchObject({ status: 422, code: "LOCATION_INVALID" });
    expect(checkTransferLines([line({ toLocation: "" })], map(source()))).toMatchObject({ code: "LOCATION_INVALID" });
  });
  it("exceeds on hand (either dimension) → 409 with the live on hand", () => {
    expect(checkTransferLines([line({ pcs: 11 })], map(source()))).toMatchObject({ status: 409, code: "STOCK_TRANSFER_EXCEEDS_ON_HAND", details: { lines: [{ lineId: "l1", onHandPcs: 10, onHandWeightCt: "5.000" }] } });
    expect(checkTransferLines([line({ weightCt: "5.001" })], map(source({ on_hand_pcs: 10 })))).toMatchObject({ code: "STOCK_TRANSFER_EXCEEDS_ON_HAND" });
  });
});

describe("UT-STL-03 input schema", () => {
  const input = (lines: Record<string, unknown>[]) => ({ docDate: "2026-11-24", ref: "R", lines });
  const base = { fromStockUuid: "0192a1b2-0000-7000-8000-000000000001", onHandPcs: 10, onHandWeightCt: "5", toLocation: "Safe B", pcs: 1, weightCt: "0" };
  const codes = (value: unknown) => { const r = transferInputSchema.safeParse(value); return r.success ? [] : r.error.issues.map((i) => [i.path.join("."), (i as { params?: { code?: string } }).params?.code ?? i.code]); };
  it("accepts a valid line", () => expect(codes(input([base]))).toEqual([]));
  it("one lot per row, an amount, not above the pick snapshot, 3 dp, 1–200 lines, strict", () => {
    expect(codes(input([base, base]))).toContainEqual(["lines.1.fromStockUuid", "duplicate"]);
    expect(codes(input([{ ...base, pcs: 0, weightCt: "0" }]))).toContainEqual(["lines.0.pcs", "required"]);
    expect(codes(input([{ ...base, pcs: 11 }]))).toContainEqual(["lines.0.pcs", "too_big"]);
    expect(codes(input([{ ...base, weightCt: "5.001" }]))).toContainEqual(["lines.0.weightCt", "too_big"]);
    expect(codes(input([{ ...base, weightCt: "1.0001" }])).length).toBeGreaterThan(0);
    expect(codes(input([])).length).toBeGreaterThan(0);
    expect(codes({ ...input([base]), extra: 1 }).length).toBeGreaterThan(0);
    expect(codes(input(Array.from({ length: 201 }, () => base))).length).toBeGreaterThan(0);
  });
  it("picker query: limit ≤ 50, exclude ≤ 200 uuids", () => {
    expect(stockQuerySchema.safeParse({ limit: "51" }).success).toBe(false);
    expect(stockQuerySchema.safeParse({ exclude: ["x"] }).success).toBe(false);
    expect(stockQuerySchema.parse({}).limit).toBe(50);
  });
});

describe("UT-STL-04 picker cursor", () => {
  it("round-trips and refuses tampering", () => {
    expect(decodeStockCursor(encodeStockCursor("2026-11-24", "260001"))).toEqual({ date: "2026-11-24", stockId: "260001" });
    expect(() => decodeStockCursor(Buffer.from("2026-02-31|260001").toString("base64url"))).toThrow(AppError);
    expect(() => decodeStockCursor(Buffer.from("2026-02-01|x'--").toString("base64url"))).toThrow(AppError);
  });
});

describe("UT-STL-05 Stock Card registry (D5)", () => {
  it("the 4 kinds are movements of the transfer document type, sourced from stock_transfer with the Stock ID shown", () => {
    for (const kind of ["TRANSFER_OUT", "TRANSFER_IN", "TRANSFER_OUT_REVERSAL", "TRANSFER_IN_REVERSAL"]) expect(CARD_KINDS[kind]).toEqual({ documentType: "stock-transfer-location", effect: "MOVEMENT" });
    expect(DOCUMENT_TYPES["stock-transfer-location"]).toEqual({ label: "Stock Transfer Location", stockIdVisible: true, source: "TRANSFER" });
    expect(TRANSFER_SOURCED_TYPES).toEqual(["stock-transfer-location"]);
  });
});
