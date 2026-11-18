import { describe, expect, it } from "vitest";
import {
  addSplitChild,
  addedToast,
  amountPerPiece,
  applyPick,
  createLabel,
  emptyLoad,
  exceedsMessage,
  firstRowIssue,
  fromLoad,
  invalidMessage,
  loadTotals,
  mergedUnit,
  mergeSummary,
  MESSAGES,
  modeAvailability,
  refsById,
  removeRows,
  removeSource,
  rowCost,
  shortDate,
  sourceCost,
  splitGroups,
  toLoadInput,
  unallocated,
  validateLoad,
  type LoadFormValues,
} from "@/features/load-to-stock/form";
import { toFixed } from "@/features/quotation/lib/decimal";
import { L1, L2, L3, LINE1, LINE2, LINE3, LINES, line, loadOut, VENDOR } from "./fixtures";

/** UT-LS-01…04, UT-LS-07 (FE-LS-001): the pure form model with the design numbers. */

const base = (): LoadFormValues => ({ ...emptyLoad("2026-11-17"), vendorId: VENDOR.id });
const valid = (values: LoadFormValues): LoadFormValues => ({
  ...values,
  rows: values.rows.map((row) => ({ ...row, location: "Safe A", stockPrice: "1.00", salePrice: "2.00" })),
});
const fix = (value: bigint, places = 2) => toFixed(value, places);

describe("UT-LS-01 merge (owner Q-LS-08 / Q-LS-27)", () => {
  it("Σ pcs / weight / cost of the full remaining, average per ct and the highest-priced line (design numbers)", () => {
    const summary = mergeSummary(LINES);
    expect(summary.pcs).toBe(40);
    expect(fix(summary.weightCt, 3)).toBe("29.300");
    expect(fix(summary.cost)).toBe("1387835.60");
    expect(fix(summary.price)).toBe("47366.40");
    expect(summary.unit).toBe("PER_CT");
    expect(summary.suggested?.purchaseLineId).toBe(L3);
    expect(LINES.map((ref) => fix(amountPerPiece(ref)))).toEqual(["65087.60", "14190.40", "66065.00"]);
  });

  it("mixed units are allowed: per ct unless every source is per pcs; per pcs averages by pcs", () => {
    const perPcs = line({ purchaseLineId: "p1", priceUnit: "PER_PCS", unitCostBase: "1000.0000", remainingPcs: 4, remainingAmountBase: "4000.00" });
    expect(mergedUnit([LINE1, perPcs])).toBe("PER_CT");
    expect(mergedUnit([perPcs, { ...perPcs, purchaseLineId: "p2" }])).toBe("PER_PCS");
    const pcsOnly = mergeSummary([perPcs, { ...perPcs, purchaseLineId: "p2", remainingPcs: 6, remainingAmountBase: "6000.00" }]);
    expect(fix(pcsOnly.cost)).toBe("10000.00");
    expect(fix(pcsOnly.price)).toBe("1000.00");
  });

  it("the merged row takes the suggested line's details, pcs / weight are the sums, Location and prices start empty", () => {
    const values = applyPick(base(), LINES, "MERGE", new Map([[L3, ["ph3"]]]));
    expect(values.mode).toBe("MERGE");
    expect(values.rows).toHaveLength(1);
    const [row] = values.rows;
    expect(row).toMatchObject({ sources: [L1, L2, L3], pcs: "40", weightCt: "29.300", location: "", stockPrice: "", salePrice: "", photoIds: ["ph3"] });
    expect(row!.attrs.cerNo).toBe("GRS2026-118803");
    const cost = rowCost(row!, "MERGE", refsById(values.sources));
    expect(fix(cost.cost)).toBe("1387835.60");
    expect(fix(cost.unitCost)).toBe("47366.40");
  });

  it("a later pick joins the one merged row and recomputes its quantity; the user's details stay", () => {
    const first = applyPick(base(), [LINE1, LINE2], "MERGE");
    const edited = { ...first, rows: [{ ...first.rows[0]!, attrs: { ...first.rows[0]!.attrs, stone: "Edited" } }] };
    const later = applyPick(edited, [LINE3], "MERGE");
    expect(later.rows).toHaveLength(1);
    expect(later.rows[0]).toMatchObject({ sources: [L1, L2, L3], pcs: "40", weightCt: "29.300" });
    expect(later.rows[0]!.attrs.stone).toBe("Edited");
    expect(later.sources.map((ref) => ref.purchaseLineId)).toEqual([L1, L2, L3]);
  });
});

describe("UT-LS-02 split (Q-LS-10)", () => {
  it("+ Split adds a child with the unallocated rest after the group's last row; Σ ≤ remaining", () => {
    let values = applyPick(base(), [LINE1, LINE2], "SPLIT");
    values = { ...values, rows: values.rows.map((row, index) => (index === 0 ? { ...row, pcs: "7", weightCt: "8.000" } : row)) };
    expect(unallocated(values, LINE1)).toEqual({ pcs: 3, weightCt: expect.any(BigInt) });
    values = addSplitChild(values, L1);
    expect(values.rows.map((row) => row.sources[0])).toEqual([L1, L1, L2]);
    expect(values.rows[1]).toMatchObject({ pcs: "3", weightCt: "4.400", location: "", id: "", stockId: "" });
    const groups = splitGroups(values);
    expect(groups.map((group) => group.rows.length)).toEqual([2, 1]);
    // Nothing left: the next child starts at 0 and Save names it.
    values = addSplitChild(values, L1);
    expect(values.rows[2]).toMatchObject({ pcs: "0", weightCt: "0.000" });
    const issues = validateLoad(valid(values));
    expect(issues.find((issue) => issue.path.join(".") === "rows.2.pcs")?.message).toBe(MESSAGES.pcs);
  });

  it("over-allocation names every row of the line: 'Up to {p} pcs / {w} ct left on {PU}'", () => {
    let values = applyPick(base(), [LINE1], "SPLIT");
    values = addSplitChild({ ...values, rows: [{ ...values.rows[0]!, pcs: "6", weightCt: "6.000" }] }, L1);
    values = { ...values, rows: values.rows.map((row, index) => (index === 1 ? { ...row, pcs: "5" } : row)) };
    const issues = validateLoad(valid(values));
    expect(issues.filter((issue) => issue.message === exceedsMessage(LINE1)).map((issue) => issue.path.join("."))).toEqual(["rows.0.pcs", "rows.1.pcs"]);
    expect(exceedsMessage(LINE1)).toBe("Up to 10 pcs / 12.400 ct left on PU2610-031");
  });

  it("+ Split only works in a Split document", () => {
    const none = applyPick(base(), [LINE1], "NONE");
    expect(addSplitChild(none, L1)).toBe(none);
  });
});

describe("UT-LS-03 None rows: limits, remove, mode reset", () => {
  it("one row per line with its remaining; pcs 0 / remaining / remaining + 1", () => {
    const values = valid(applyPick(base(), LINES, "NONE"));
    expect(values.rows.map((row) => [row.pcs, row.weightCt])).toEqual([["10", "12.400"], ["24", "9.600"], ["6", "7.300"]]);
    expect(validateLoad(values)).toEqual([]);
    const at = (pcs: string) => validateLoad({ ...values, rows: values.rows.map((row, index) => (index === 0 ? { ...row, pcs } : row)) }).map((issue) => `${issue.path.join(".")}:${issue.message}`);
    expect(at("0")).toEqual([`rows.0.pcs:${MESSAGES.pcs}`]);
    expect(at("10")).toEqual([]);
    expect(at("11")).toEqual([`rows.0.pcs:${exceedsMessage(LINE1)}`]);
  });

  it("weight 0 only when the PU line's weight is 0 (owner Q-LS-26)", () => {
    const values = valid(applyPick(base(), [LINE1], "NONE"));
    const zero = { ...values, rows: [{ ...values.rows[0]!, weightCt: "0" }] };
    expect(validateLoad(zero).map((issue) => issue.message)).toEqual([MESSAGES.weight]);
    const weightless = line({ purchaseLineId: "w0", weightCt: "0", remainingWeightCt: "0" });
    const ok = valid(applyPick(base(), [weightless], "NONE"));
    expect(validateLoad({ ...ok, rows: [{ ...ok.rows[0]!, weightCt: "0" }] })).toEqual([]);
  });

  it("removing rows returns the line: a line without rows leaves the Item table; an empty table clears the mode", () => {
    const values = applyPick(base(), [LINE1, LINE2], "NONE");
    const one = removeRows(values, new Set([values.rows[0]!.key]));
    expect(one.sources.map((ref) => ref.purchaseLineId)).toEqual([L2]);
    expect(one.mode).toBe("NONE");
    const none = removeSource(one, L2);
    expect(none).toMatchObject({ rows: [], sources: [], mode: "" });
  });

  it("a line already on the document is not added twice", () => {
    const values = applyPick(base(), [LINE1], "NONE");
    expect(applyPick(values, [LINE1], "NONE")).toBe(values);
  });

  it("required fields: account, rows, Location, Stock Price, Sale Price (start empty, owner Q-LS-13); 'Row n: …'", () => {
    const empty = { ...base(), vendorId: "" };
    expect(validateLoad(empty).map((issue) => issue.message)).toEqual([MESSAGES.vendor, MESSAGES.rows]);
    expect(invalidMessage(validateLoad(empty))).toBe(MESSAGES.rows);
    const values = applyPick(base(), [LINE1, LINE2], "NONE");
    const issues = validateLoad(values);
    expect(issues.filter((issue) => issue.path[1] === 0).map((issue) => issue.message)).toEqual([MESSAGES.location, MESSAGES.stockPrice, MESSAGES.salePrice]);
    expect(firstRowIssue(issues)).toEqual({ index: 0, message: MESSAGES.location });
    expect(invalidMessage(issues)).toBe("Row 1: Location is required");
    const money = validateLoad({ ...values, rows: values.rows.map((row) => ({ ...row, location: "A", stockPrice: "1.234", salePrice: "x" })) });
    expect(money.map((issue) => issue.message)).toEqual([MESSAGES.money, MESSAGES.money, MESSAGES.money, MESSAGES.money]);
  });
});

describe("UT-LS-04 partial-load cost by the PU price unit (owner Q-LS-12)", () => {
  it("per ct: weight × unit cost; per pcs: pcs × unit cost; 2 dp half-up", () => {
    expect(fix(sourceCost(LINE1, 7, "8.700"))).toBe("456663.00");
    const perPcs = line({ priceUnit: "PER_PCS", unitCostBase: "1234.5678" });
    expect(fix(sourceCost(perPcs, 7, "8.700"))).toBe("8641.97");
    const values = applyPick(base(), [LINE1], "NONE");
    const partial = { ...values, rows: [{ ...values.rows[0]!, pcs: "7", weightCt: "8.700" }] };
    expect(fix(rowCost(partial.rows[0]!, "NONE", refsById(partial.sources)).cost)).toBe("456663.00");
    const totals = loadTotals(partial);
    expect(totals).toMatchObject({ rowCount: 1, pcs: 7 });
    expect(fix(totals.cost)).toBe("456663.00");
  });
});

describe("UT-LS-07 mode dialog rules and payload mapping", () => {
  it("Merge needs 2 lines on a first pick; later picks keep the document's mode", () => {
    expect(modeAvailability("MERGE", 1, "")).toEqual({ enabled: false, reason: "Pick at least 2 lines to merge" });
    expect(modeAvailability("MERGE", 2, "")).toEqual({ enabled: true, reason: null });
    expect(modeAvailability("NONE", 1, "SPLIT")).toEqual({ enabled: false, reason: "This document is in Split mode" });
    expect(modeAvailability("MERGE", 1, "MERGE")).toEqual({ enabled: true, reason: null });
    expect(createLabel("NONE", 3, "")).toBe("Create 3 load rows");
    expect(createLabel("SPLIT", 1, "")).toBe("Create 1 load row");
    expect(createLabel("MERGE", 3, "")).toBe("Merge · create 1 load row");
    expect(createLabel("MERGE", 1, "MERGE")).toBe("Add to the merged row");
    expect(addedToast("NONE", 3)).toBe("Added 3 load rows");
  });

  it("toLoadInput: header mode, one source per None/Split row, full remaining for Merge, decimals as strings", () => {
    const none = valid(applyPick({ ...base(), ref: " R1 ", documentNote: "" }, [LINE1], "NONE"));
    const input = toLoadInput({ ...none, rows: [{ ...none.rows[0]!, pcs: "7", weightCt: "8.7", parcel: " P-1 " }] });
    expect(input).toEqual({
      docDate: "2026-11-17",
      vendorId: VENDOR.id,
      ref: "R1",
      mode: "NONE",
      rows: [
        {
          sources: [{ purchaseLineId: L1, pcs: 7, weightCt: "8.700" }],
          location: "Safe A",
          parcel: "P-1",
          attrs: expect.objectContaining({ stoneCode: "SA-RBLDEXVS1AAA", stoneCodeId: null }),
          stockPrice: "1.00",
          salePrice: "2.00",
          photoIds: [],
        },
      ],
    });
    const merge = toLoadInput(valid(applyPick(base(), LINES, "MERGE")));
    expect(merge.rows[0]!.sources).toEqual([
      { purchaseLineId: L1, pcs: 10, weightCt: "12.400" },
      { purchaseLineId: L2, pcs: 24, weightCt: "9.600" },
      { purchaseLineId: L3, pcs: 6, weightCt: "7.300" },
    ]);
  });

  it("fromLoad keeps row ids (and Stock IDs) as keys; an update sends the row id", () => {
    const values = fromLoad(loadOut({ rows: [{ ...loadOut().rows[0]!, stockId: "260123" }] }));
    expect(values).toMatchObject({ id: loadOut().id, version: 3, mode: "NONE", vendorId: VENDOR.id });
    expect(values.rows[0]).toMatchObject({ key: loadOut().rows[0]!.id, id: loadOut().rows[0]!.id, stockId: "260123", pcs: "7", weightCt: "8.700" });
    expect(toLoadInput(values).rows[0]).toMatchObject({ id: loadOut().rows[0]!.id });
    expect(shortDate("2026-10-02")).toBe("02/10/26");
  });
});

