import { describe, expect, it } from "vitest";
import { mergeSplitInputSchema, stockQuerySchema } from "../../src/modules/merge-split/schemas";
import { checkStockFacts, inheritFrom, planCosts, type StockFact } from "../../src/modules/stock/convert";
import { CARD_KINDS, DOCUMENT_TYPES, MERGE_SPLIT_SOURCED_TYPES, MOVEMENT_KINDS, stockIdVisible } from "../../src/modules/stock/card-kinds";

const U1 = "0192a1b2-0000-7000-8000-000000000001";
const U2 = "0192a1b2-0000-7000-8000-000000000002";
const attrs = { stoneCodeId: null, stoneCode: "", stone: "Ruby", shape: "Oval", size: "", color: "Red", clarity: "", cutting: "", quality: "", cerType: "", cerNo: "" };
const result = (patch: Record<string, unknown> = {}) => ({ sourceKey: "a", attrs, location: "Safe A", lot: "", parcel: "", pcs: 5, weightCt: "2.500", stockPrice: "0", salePrice: "0", itemNote: "", photoIds: [], ...patch });
const split = (patch: Record<string, unknown> = {}) => ({
  docDate: "2026-11-27", mode: "SPLIT", sources: [{ key: "a", stockUuid: U1, availPcs: 10, availWeightCt: "5.000" }], results: [result(), result()], ...patch,
});
const codes = (input: unknown) => {
  const parsed = mergeSplitInputSchema.safeParse(input);
  return parsed.success ? [] : parsed.error.issues.map((issue) => `${issue.path.join(".")}:${(issue as { params?: { code?: string } }).params?.code ?? issue.code}`);
};

describe("UT-MS-B01 input rules", () => {
  it("accepts a balanced split and a merge", () => {
    expect(codes(split())).toEqual([]);
    expect(codes({ docDate: "2026-11-27", mode: "MERGE", sources: [{ key: "a", stockUuid: U1, availPcs: 3, availWeightCt: "1.000" }, { key: "b", stockUuid: U2, availPcs: 2, availWeightCt: "4.000" }], results: [result({ sourceKey: null, pcs: 5, weightCt: "5" })] })).toEqual([]);
  });
  it("SPLIT: each source needs ≥ 2 results whose Σ pcs / weight equal the take; results name a source", () => {
    expect(codes(split({ results: [result({ pcs: 10, weightCt: "5" })] }))).toContain("sources.0.key:split_needs_two");
    expect(codes(split({ results: [result({ pcs: 4 }), result()] }))).toContain("sources.0.availPcs:sum_mismatch");
    expect(codes(split({ results: [result({ weightCt: "2" }), result()] }))).toContain("sources.0.availWeightCt:sum_mismatch");
    expect(codes(split({ results: [result({ sourceKey: "zz" }), result(), result()] }))).toContain("results.0.sourceKey:invalid");
    expect(codes(split({ results: [result({ weightCt: "0", pcs: 5 }), result({ weightCt: "5", pcs: 5 })] }))).toContain("results.0.weightCt:too_small");
  });
  it("MERGE: 2–200 sources, exactly one result = Σ with sourceKey null", () => {
    const sources = [{ key: "a", stockUuid: U1, availPcs: 3, availWeightCt: "1.000" }, { key: "b", stockUuid: U2, availPcs: 2, availWeightCt: "4.000" }];
    expect(codes({ docDate: "2026-11-27", mode: "MERGE", sources: sources.slice(0, 1), results: [result({ sourceKey: null, pcs: 3, weightCt: "1" })] })).toContain("sources:too_small");
    expect(codes({ docDate: "2026-11-27", mode: "MERGE", sources, results: [result({ sourceKey: null, pcs: 5, weightCt: "5" }), result({ sourceKey: null })] })).toContain("results:too_big");
    expect(codes({ docDate: "2026-11-27", mode: "MERGE", sources, results: [result({ sourceKey: "a", pcs: 4, weightCt: "5" })] })).toEqual(expect.arrayContaining(["results.0.sourceKey:invalid", "results.0.pcs:sum_mismatch"]));
  });
  it("distinct keys / stocks / photos, strict objects, decimal strings, ≤ 200 results", () => {
    const dup = split({ sources: [{ key: "a", stockUuid: U1, availPcs: 10, availWeightCt: "5" }, { key: "a", stockUuid: U1, availPcs: 1, availWeightCt: "1" }] });
    expect(codes(dup)).toEqual(expect.arrayContaining(["sources.1.key:duplicate", "sources.1.stockUuid:duplicate"]));
    expect(codes(split({ results: [result({ photoIds: [U1, U1] }), result()] }))).toContain("results.0.photoIds:duplicate");
    expect(codes(split({ extra: 1 }))).not.toEqual([]);
    expect(codes(split({ results: [result({ weightCt: 2.5 }), result()] }))).not.toEqual([]);
    expect(codes(split({ results: Array.from({ length: 201 }, () => result()) }))).toContain("results:too_big");
  });
  it("picker query: exclude ≤ 200 uuids, limit ≤ 50", () => {
    expect(stockQuerySchema.safeParse({ limit: "51" }).success).toBe(false);
    expect(stockQuerySchema.parse({}).limit).toBe(50);
    expect(stockQuerySchema.safeParse({ exclude: ["x"] }).success).toBe(false);
  });
});

describe("UT-MS-B02 cost math (company currency)", () => {
  it("split by weight (PER_CT): unit cost kept, last result absorbs the residue, Σ = take", () => {
    const plan = planCosts("SPLIT", [{ sourceId: "s", priceUnit: "PER_CT", unitCostBase: "333.3333", availPcs: 3, availWeightCt: "1.000" }], [
      { resultId: "r1", position: 1, sourceId: "s", pcs: 1, weightCt: "0.333" }, { resultId: "r2", position: 2, sourceId: "s", pcs: 1, weightCt: "0.333" }, { resultId: "r3", position: 3, sourceId: "s", pcs: 1, weightCt: "0.334" },
    ]);
    expect(plan.takes.get("s")!.toFixed(2)).toBe("333.33");
    expect(["r1", "r2", "r3"].map((id) => plan.results.get(id)!.cost.toFixed(2))).toEqual(["111.00", "111.00", "111.33"]);
    expect(plan.results.get("r1")).toMatchObject({ priceUnit: "PER_CT", unitCostBase: "333.3333" });
  });
  it("split by pcs (PER_PCS)", () => {
    const plan = planCosts("SPLIT", [{ sourceId: "s", priceUnit: "PER_PCS", unitCostBase: "100", availPcs: 10, availWeightCt: "5" }], [
      { resultId: "a", position: 1, sourceId: "s", pcs: 4, weightCt: "1" }, { resultId: "b", position: 2, sourceId: "s", pcs: 6, weightCt: "4" },
    ]);
    expect([plan.results.get("a")!.cost.toFixed(2), plan.results.get("b")!.cost.toFixed(2)]).toEqual(["400.00", "600.00"]);
  });
  it("a degenerate negative residue is taken from the largest row (all ≥ 0, Σ = take)", () => {
    const plan = planCosts("SPLIT", [{ sourceId: "s", priceUnit: "PER_CT", unitCostBase: "0.0100", availPcs: 3, availWeightCt: "1.500" }], [
      { resultId: "a", position: 1, sourceId: "s", pcs: 1, weightCt: "0.750" }, { resultId: "b", position: 2, sourceId: "s", pcs: 1, weightCt: "0.750" }, { resultId: "c", position: 3, sourceId: "s", pcs: 1, weightCt: "0" },
    ]);
    const costs = ["a", "b", "c"].map((id) => plan.results.get(id)!.cost);
    expect(costs.every((cost) => !cost.isNegative())).toBe(true);
    expect(costs.reduce((sum, cost) => sum.plus(cost)).toFixed(2)).toBe(plan.takes.get("s")!.toFixed(2));
  });
  it("merge: weighted average, mixed units → PER_CT, basis 0 → unit 0 (UI example 65,000 ÷ 5 ct = 13,000)", () => {
    const plan = planCosts("MERGE", [
      { sourceId: "a", priceUnit: "PER_CT", unitCostBase: "10000", availPcs: 2, availWeightCt: "3.000" },
      { sourceId: "b", priceUnit: "PER_PCS", unitCostBase: "17500", availPcs: 2, availWeightCt: "2.000" },
    ], [{ resultId: "m", position: 1, sourceId: null, pcs: 4, weightCt: "5.000" }]);
    expect(plan.results.get("m")).toMatchObject({ priceUnit: "PER_CT", unitCostBase: "13000.0000" });
    expect(plan.results.get("m")!.cost.toFixed(2)).toBe("65000.00");
    const zero = planCosts("MERGE", [{ sourceId: "a", priceUnit: "PER_CT", unitCostBase: "5", availPcs: 1, availWeightCt: "0" }, { sourceId: "b", priceUnit: "PER_CT", unitCostBase: "5", availPcs: 1, availWeightCt: "0" }], [{ resultId: "m", position: 1, sourceId: null, pcs: 2, weightCt: "0" }]);
    expect(zero.results.get("m")!.unitCostBase).toBe("0.0000");
    const pcs = planCosts("MERGE", [{ sourceId: "a", priceUnit: "PER_PCS", unitCostBase: "10", availPcs: 1, availWeightCt: "1" }, { sourceId: "b", priceUnit: "PER_PCS", unitCostBase: "20", availPcs: 1, availWeightCt: "1" }], [{ resultId: "m", position: 1, sourceId: null, pcs: 2, weightCt: "2" }]);
    expect(pcs.results.get("m")).toMatchObject({ priceUnit: "PER_PCS", unitCostBase: "15.0000" });
  });
});

describe("UT-MS-B03 registry and availability rules", () => {
  it("six kinds are card movements of the merge-split document type (Stock ID visible, MERGE_SPLIT source)", () => {
    for (const kind of ["SPLIT_OUT", "SPLIT_IN", "SPLIT_REVERSAL", "MERGE_OUT", "MERGE_IN", "MERGE_REVERSAL"]) {
      expect(CARD_KINDS[kind]).toEqual({ documentType: "merge-split", effect: "MOVEMENT" });
      expect(MOVEMENT_KINDS).toContain(kind);
    }
    expect(DOCUMENT_TYPES["merge-split"]).toEqual({ label: "Merge/Split", stockIdVisible: true, source: "MERGE_SPLIT" });
    expect(stockIdVisible("merge-split")).toBe(true);
    expect(MERGE_SPLIT_SOURCED_TYPES).toEqual(["merge-split"]);
  });
  const fact = (patch: Partial<StockFact> = {}): StockFact => ({
    id: U1, stock_id: "S1", status: "ACTIVE", price_unit: "PER_CT", on_hand_pcs: 10, on_hand_weight_ct: "5.000", unit_cost_base: "1", currency_code: "THB", ref_doc_date: "2026-11-01",
    load_syncing: false, pending_doc_no: null, version: 1, consumed_pcs: 0, consumed_weight_ct: "0", ...patch,
  });
  const source = { sourceId: "s1", key: "a", stockUuid: U1, availPcs: 10, availWeightCt: "5" };
  it("unavailable → busy → changed → pending → currency, in that order", () => {
    expect(checkStockFacts("SPLIT", [source], new Map())).toMatchObject({ status: 422, code: "MERGE_SPLIT_SOURCE_UNAVAILABLE", details: { sourceKeys: ["a"] } });
    expect(checkStockFacts("SPLIT", [source], new Map([[U1, fact({ status: "REVERSED" })]]))).toMatchObject({ code: "MERGE_SPLIT_SOURCE_UNAVAILABLE" });
    expect(checkStockFacts("SPLIT", [source], new Map([[U1, fact({ load_syncing: true, on_hand_pcs: 1 })]]))).toMatchObject({ status: 409, code: "MERGE_SPLIT_BUSY", headers: { "Retry-After": "5" } });
    expect(checkStockFacts("SPLIT", [source], new Map([[U1, fact({ on_hand_pcs: 7 })]]))).toMatchObject({ status: 409, code: "MERGE_SPLIT_STOCK_CHANGED", details: { sources: [{ sourceId: "s1", key: "a", stockId: "S1", availPcs: 7, availWeightCt: "5.000" }] } });
    expect(checkStockFacts("SPLIT", [source], new Map([[U1, fact({ pending_doc_no: "MS-9" })]]))).toMatchObject({ status: 409, code: "MERGE_SPLIT_SOURCE_PENDING", details: { stockIds: ["S1"], docNos: ["MS-9"] } });
    const second = { sourceId: "s2", key: "b", stockUuid: U2, availPcs: 1, availWeightCt: "1" };
    const facts = new Map([[U1, fact()], [U2, fact({ id: U2, stock_id: "S0", on_hand_pcs: 1, on_hand_weight_ct: "1", currency_code: "USD", ref_doc_date: "2026-10-01" })]]);
    expect(checkStockFacts("MERGE", [source, second], facts)).toMatchObject({ status: 422, code: "MERGE_SPLIT_CURRENCY_MIXED", details: { currencies: ["THB", "USD"] } });
    expect(checkStockFacts("SPLIT", [source, second], facts)).toBeNull();
    expect(inheritFrom("MERGE", [source, second], facts, null)).toBe(U2);
    expect(inheritFrom("SPLIT", [source, second], facts, "s1")).toBe(U1);
  });
});

describe("Merge/Split numbering default (owner 2026-11-27)", () => {
  it("UT-MS-N1 no Document Setup row → MS-<n> from 1 with numbering_id NULL; a configured row wins", async () => {
    const { DEFAULT_NUMBERING, formatDocNo, nextRunningNo, numberingOrDefault } = await import("../../src/modules/merge-split/repository");
    const fallback = numberingOrDefault(null);
    expect(fallback).toBe(DEFAULT_NUMBERING);
    expect(formatDocNo(fallback, 1)).toBe("MS-1");
    const row = { id: U1, prefix: "MSX", separator: "/", startNo: 100 };
    expect(numberingOrDefault(row)).toBe(row);
    const sql: string[] = [];
    const tx = { $queryRaw: async (strings: TemplateStringsArray) => { sql.push(strings.join("?")); return [{ max: 4 }]; } } as never;
    expect(await nextRunningNo(tx, fallback, false)).toBe(5);
    expect(sql[0]).toContain(`"numbering_id" IS NULL`);
  });
});
