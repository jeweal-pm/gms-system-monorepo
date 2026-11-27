import { describe, expect, it } from "vitest";
import {
  addSplitChild,
  applyPick,
  balanceText,
  createLabel,
  defaultMode,
  emptyMergeSplit,
  firstRowIssue,
  fromMergeSplit,
  fromText,
  groupBalance,
  invalidMessage,
  mergeSummary,
  MESSAGES,
  modeAvailability,
  removeRows,
  removeSource,
  resultTotals,
  rowCost,
  sourceFromStock,
  sourceTotals,
  splitGroups,
  suggestedSource,
  toMergeSplitInput,
  totalsMismatch,
  validateMergeSplit,
  type MsFormValues,
} from "@/features/merge-split/form";
import { toFixed } from "@/features/quotation/lib/decimal";
import { msOut, OWN_A, OWN_B, OWN_C } from "./fixtures";

const base = () => emptyMergeSplit("2026-11-27");
const split = (...stocks: (typeof OWN_A)[]) => applyPick(base(), stocks, "SPLIT");
const merge = (...stocks: (typeof OWN_A)[]) => applyPick(base(), stocks, "MERGE");
const priced = (values: MsFormValues): MsFormValues => ({ ...values, rows: values.rows.map((row) => ({ ...row, location: row.location || "Safe A" })) });

describe("UT-MS-01 Split cost (C-01)", () => {
  it("a pick creates two children that add up to the stock, with its details, location and prices", () => {
    const values = split(OWN_A);
    expect(values.mode).toBe("SPLIT");
    expect(values.rows.map((row) => [row.pcs, row.weightCt, row.location, row.lot, row.stockPrice])).toEqual([
      ["2", "1.000", "Safe A", "L-1", "12000.00"],
      ["2", "1.000", "Safe A", "L-1", "12000.00"],
    ]);
    expect(groupBalance(values.rows, values.sources[0]!).state).toBe("balanced");
  });

  it("cost follows weight (per ct) or pcs (per pcs); the last child absorbs rounding so Σ = source cost", () => {
    const odd = { ...OWN_A, availWeightCt: "1.001", costAmountBase: "10010.00", unitCostBase: "10000.3333" };
    const values = split(odd);
    const costs = values.rows.map((_, index) => toFixed(rowCost(values, index).cost, 2));
    expect(costs[0]).toBe("5010.17"); // 0.501 ct × 10,000.3333
    expect(costs[1]).toBe("4999.83"); // 10,010.00 − 5,010.17
    expect(toFixed(resultTotals(values).cost, 2)).toBe("10010.00");
    const pcs = split(OWN_C);
    expect(pcs.rows.map((_, index) => toFixed(rowCost(pcs, index).cost, 2))).toEqual(["2000.00", "1000.00"]);
  });

  it("an unbalanced group is costed per child (no absorption)", () => {
    const values = split(OWN_A);
    values.rows[1] = { ...values.rows[1]!, weightCt: "0.500" };
    expect(toFixed(rowCost(values, 1).cost, 2)).toBe("5000.00");
  });
});

describe("UT-MS-02 Merge cost (C-02)", () => {
  it("weighted average: 20,000 + 45,000 = 65,000 ÷ 5.00 ct = 13,000 per ct", () => {
    const summary = mergeSummary([OWN_A, OWN_B].map(sourceFromStock));
    expect([summary.pcs, toFixed(summary.weightCt, 3), toFixed(summary.cost, 2), summary.unit, toFixed(summary.unitCost, 2)]).toEqual([6, "5.000", "65000.00", "PER_CT", "13000.00"]);
  });

  it("all per pcs → per pcs; mixed → per ct", () => {
    expect(mergeSummary([OWN_C, { ...OWN_C, stockUuid: "x" }].map(sourceFromStock)).unit).toBe("PER_PCS");
    expect(mergeSummary([OWN_A, OWN_C].map(sourceFromStock)).unit).toBe("PER_CT");
  });

  it("the merged row is one locked row with Σ quantities and no location; a later pick joins it", () => {
    const values = merge(OWN_A, OWN_B);
    expect(values.rows).toHaveLength(1);
    expect(values.rows[0]).toMatchObject({ pcs: "6", weightCt: "5.000", location: "", sourceKey: null, priceUnit: "PER_CT" });
    expect(toFixed(rowCost(values, 0).unitCost, 2)).toBe("13000.00");
    const more = applyPick(values, [OWN_C], "MERGE");
    expect(more.rows[0]).toMatchObject({ pcs: "9", weightCt: "6.000", key: values.rows[0]!.key });
    expect(fromText(more.rows[0]!, more)).toBe("From 260001 + 260002 + 260003");
    expect(fromText(more.rows[0]!, { ...more, sources: [...more.sources, { ...more.sources[0]!, stockId: "260009", key: "z" }] })).toBe("From 260001 + 260002 + 260003 +1");
  });
});

describe("UT-MS-03 suggested source (C-03)", () => {
  it("highest cost per piece; the first picked wins a tie", () => {
    expect(suggestedSource([OWN_A, OWN_B])?.stockId).toBe("260002");
    expect(suggestedSource([OWN_A, { ...OWN_A, stockId: "260099" }])?.stockId).toBe("260001");
    const values = merge(OWN_A, OWN_B);
    expect(values.rows[0]).toMatchObject({ lot: "L-2", stockPrice: "16000.00", salePrice: "20000.00" });
    expect(values.rows[0]!.attrs.stone).toBe("Sapphire");
  });
});

describe("UT-MS-04 validation (S-01…S-06)", () => {
  it("S-01: a date and at least one stock", () => {
    const issues = validateMergeSplit({ ...base(), docDate: "" });
    expect(issues.map((issue) => issue.message)).toEqual([MESSAGES.docDate, MESSAGES.rows]);
  });

  it("S-02 balance: Σ child pcs and weight must equal the stock; '+ Split' takes what is left", () => {
    const values = priced(split(OWN_A));
    expect(validateMergeSplit(values)).toEqual([]);
    values.rows[1] = { ...values.rows[1]!, pcs: "1", weightCt: "0.600" };
    const issues = validateMergeSplit(values);
    expect(invalidMessage(issues)).toBe("Row 1: pcs/weight must add up to 260001 (4 pcs · 2.000 ct)");
    expect(balanceText(groupBalance(values.rows, values.sources[0]!))).toBe("Left 1 pcs · 0.400 ct");
    const added = addSplitChild(values, values.sources[0]!.key);
    expect(added.rows).toHaveLength(3);
    expect(added.rows[2]).toMatchObject({ pcs: "1", weightCt: "0.400", id: "", stockId: "" });
    expect(groupBalance(added.rows, added.sources[0]!).state).toBe("balanced");
    values.rows[1] = { ...values.rows[1]!, pcs: "3", weightCt: "1.000" };
    expect(balanceText(groupBalance(values.rows, values.sources[0]!))).toBe("Over by 1 pcs · 0.000 ct");
  });

  it("S-03 rows: Location, prices, Pcs ≥ 1, Weight > 0; S-04 ≥ 2 children / ≥ 2 sources", () => {
    const values = split(OWN_A);
    values.rows[0] = { ...values.rows[0]!, location: "", stockPrice: "", salePrice: "1.234", pcs: "0", weightCt: "0" };
    const messages = validateMergeSplit(values).filter((issue) => issue.path[1] === 0).map((issue) => issue.message);
    expect(messages).toEqual(expect.arrayContaining([MESSAGES.location, MESSAGES.stockPrice, MESSAGES.money, MESSAGES.pcs, MESSAGES.weight]));
    const one = priced(split(OWN_A));
    const lonely = removeRows(one, new Set([one.rows[1]!.key]));
    expect(validateMergeSplit(lonely).map((issue) => issue.message)).toContain(MESSAGES.splitTwo);
    const lone = merge(OWN_A, OWN_B);
    expect(removeRows(lone, new Set([lone.rows[0]!.key]))).toBe(lone); // the merged row goes only with its sources
    const removed = removeSource(lone, lone.sources[1]!.key);
    expect(removed.rows[0]).toMatchObject({ pcs: "4", weightCt: "2.000" });
    expect(validateMergeSplit(removed).map((issue) => issue.message)).toContain(MESSAGES.mergeTwo);
  });

  it("S-06 totals: a Pcs / Weight mismatch gives the banner text; balanced shows none", () => {
    const values = priced(split(OWN_A));
    expect(totalsMismatch(values)).toBeNull();
    values.rows[0] = { ...values.rows[0]!, pcs: "1" };
    expect(totalsMismatch(values)).toBe("Result does not match the source: Pcs 4 vs 3, Weight 2.000 vs 2.000");
    expect(sourceTotals(values).pcs).toBe(4);
    expect(firstRowIssue(validateMergeSplit(values))?.index).toBe(0);
  });

  it("removing the last row clears the mode; removing a Split source removes its group", () => {
    const values = split(OWN_A, OWN_B);
    expect(splitGroups(values).map((group) => group.rows.length)).toEqual([2, 2]);
    const without = removeSource(values, values.sources[0]!.key);
    expect(without.sources.map((source) => source.stockId)).toEqual(["260002"]);
    expect(removeRows(without, new Set(without.rows.map((row) => row.key)))).toMatchObject({ mode: "", sources: [], rows: [] });
  });
});

describe("mode dialog rules (P-02)", () => {
  it("Merge needs 2 stocks; the document's mode locks the other; defaults Split for 1, Merge for ≥ 2", () => {
    expect(modeAvailability("MERGE", 1, "")).toEqual({ enabled: false, reason: "Pick at least 2 stocks to merge" });
    expect(modeAvailability("SPLIT", 1, "MERGE")).toEqual({ enabled: false, reason: "This document is in Merge mode" });
    expect(modeAvailability("MERGE", 1, "MERGE").enabled).toBe(true);
    expect([defaultMode(1, ""), defaultMode(2, ""), defaultMode(3, "SPLIT")]).toEqual(["SPLIT", "MERGE", "SPLIT"]);
    expect([createLabel("SPLIT", 2, ""), createLabel("MERGE", 2, ""), createLabel("MERGE", 1, "MERGE")]).toEqual(["Create 4 rows", "Create 1 row", "Add to the merged row"]);
  });
});

describe("contract mapping", () => {
  it("form → MergeSplitInput: source keys, results naming their source (Split) or null (Merge), decimals fixed", () => {
    const input = toMergeSplitInput({ ...priced(split(OWN_A)), ref: " R ", documentNote: " N " });
    expect(input).toMatchObject({ docDate: "2026-11-27", mode: "SPLIT", ref: "R", note: "N" });
    expect(input.sources).toEqual([{ key: input.results[0]!.sourceKey, stockUuid: OWN_A.stockUuid, availPcs: 4, availWeightCt: "2.000" }]);
    expect(input.results[0]).toMatchObject({ pcs: 2, weightCt: "1.000", stockPrice: "12000.00", salePrice: "15000.00", lot: "L-1", parcel: "", itemNote: "" });
    expect(input.results[0]).not.toHaveProperty("id");
    expect(toMergeSplitInput(merge(OWN_A, OWN_B)).results[0]!.sourceKey).toBeNull();
  });

  it("MergeSplitOut → form keeps ids, source keys and issued Stock IDs", () => {
    const values = fromMergeSplit(msOut({ results: msOut().results.map((row, index) => ({ ...row, stockId: `27000${index}`, inUse: index === 1 })) }));
    expect(values.sources[0]).toMatchObject({ key: "s-a", costAmountBase: "20000.00", loadedFrom: { docNo: "LS2611001" } });
    expect(values.rows.map((row) => [row.id, row.sourceKey, row.stockId, row.inUse])).toEqual([["r1", "s-a", "270000", false], ["r2", "s-a", "270001", true]]);
    expect(toMergeSplitInput(values).results[0]).toMatchObject({ id: "r1", sourceKey: "s-a" });
  });
});
