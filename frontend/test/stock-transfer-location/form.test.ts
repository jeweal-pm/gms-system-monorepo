import { describe, expect, it } from "vitest";
import {
  addLots,
  emptyRowCount,
  emptyTransfer,
  fromTransfer,
  invalidMessage,
  isValid,
  lotToRow,
  newLocationOptions,
  nextSort,
  pcsPatch,
  removeRows,
  rowIssue,
  ROW_MAX,
  sortedRows,
  toTransferInput,
  unitText,
  validateTransfer,
  type TransferRow,
} from "@/features/stock-transfer-location/form";
import { LINE1, LINE2, S1, S2, S3, stockLot, transferOut } from "./fixtures";

/** UT-STL-01 (FE-STL-002): the pure form model — picking, New Location options, PCS → WEIGHT fill, validation, input. */

const row = (patch: Partial<TransferRow> = {}): TransferRow => ({ ...lotToRow(stockLot({ onHandPcs: 4, onHandWeightCt: "2.500" })), ...patch });

describe("UT-STL-01a picking (one lot per row, ≤ 200)", () => {
  it("a picked lot starts with empty amounts and no New Location; the grid pads to 5 rows", () => {
    const picked = lotToRow(stockLot());
    expect(picked).toMatchObject({ stockUuid: S1, fromLocation: "BKK-01", toLocation: "", pcs: "", weightCt: "", onHandPcs: 1, onHandWeightCt: "0.620", stockPrice: "85000.00", currency: "USD" });
    expect([0, 3, 5, 9].map(emptyRowCount)).toEqual([5, 2, 0, 0]);
  });

  it("adds in pick order, skips lots already on the document and past 200 rows; removes checked rows", () => {
    const first = addLots(emptyTransfer("2026-11-24"), [stockLot(), stockLot({ stockUuid: S2 })]);
    expect(first.added).toBe(2);
    const again = addLots(first.values, [stockLot({ stockUuid: S2 }), stockLot({ stockUuid: S3 })]);
    expect(again).toMatchObject({ added: 1, skipped: 1 });
    expect(again.values.rows.map((entry) => entry.stockUuid)).toEqual([S1, S2, S3]);
    const full = { ...emptyTransfer("2026-11-24"), rows: Array.from({ length: ROW_MAX }, (_, index) => row({ key: `k${index}`, stockUuid: `u${index}` })) };
    expect(addLots(full, [stockLot({ stockUuid: "new" })])).toMatchObject({ added: 0, skipped: 1 });
    const removed = removeRows(again.values, new Set([again.values.rows[1]!.key]));
    expect(removed.rows.map((entry) => entry.stockUuid)).toEqual([S1, S3]);
  });
});

describe("UT-STL-01b New Location excludes the row's own location", () => {
  it("lists every active location except the source (any case); a saved inactive destination stays listed", () => {
    expect(newLocationOptions(["BKK-01", "Safe A", "bkk-01 ", "Shelf 1"], "BKK-01").map((option) => option.value)).toEqual(["Safe A", "Shelf 1"]);
    expect(newLocationOptions(["Safe A"], "BKK-01", "Old Vault").map((option) => option.value)).toEqual(["Old Vault", "Safe A"]);
    expect(newLocationOptions(["Safe A"], "BKK-01", "BKK-01").map((option) => option.value)).toEqual(["Safe A"]);
  });
});

describe("UT-STL-01c PCS → WEIGHT fill", () => {
  it("PCS equal to on hand fills WEIGHT with the on-hand weight (3 dp); otherwise only PCS changes", () => {
    const source = { onHandPcs: 4, onHandWeightCt: "2.5" };
    expect(pcsPatch(source, "4")).toEqual({ pcs: "4", weightCt: "2.500" });
    expect(pcsPatch(source, "3")).toEqual({ pcs: "3" });
    expect(pcsPatch(source, "")).toEqual({ pcs: "" });
    expect(pcsPatch(source, "04")).toEqual({ pcs: "4", weightCt: "2.500" });
    expect(pcsPatch(source, "2.5x")).toEqual({ pcs: "25" });
    expect(pcsPatch({ onHandPcs: 0, onHandWeightCt: "1.000" }, "0")).toEqual({ pcs: "0" });
  });
});

describe("UT-STL-01d validation (ADR-0060 D12)", () => {
  it("row rules: New Location, PCS integer ≤ on hand, WEIGHT ≤ on hand with 3 dp, at least one > 0", () => {
    expect(rowIssue(row())).toBe("location");
    expect(rowIssue(row({ toLocation: "BKK-01", pcs: "1" }))).toBe("location");
    expect(rowIssue(row({ toLocation: "Safe A" }))).toBe("amount");
    expect(rowIssue(row({ toLocation: "Safe A", pcs: "0", weightCt: "0.000" }))).toBe("amount");
    expect(rowIssue(row({ toLocation: "Safe A", pcs: "5" }))).toBe("pcs");
    expect(rowIssue(row({ toLocation: "Safe A", weightCt: "2.501" }))).toBe("weight");
    expect(rowIssue(row({ toLocation: "Safe A", weightCt: "1.2345" }))).toBe("weight");
    expect(rowIssue(row({ toLocation: "Safe A", pcs: "4", weightCt: "2.500" }))).toBeNull();
    expect(rowIssue(row({ toLocation: "Safe A", weightCt: "0.5" }))).toBeNull();
    expect(rowIssue(row({ toLocation: "Safe A", pcs: "1" }))).toBeNull();
  });

  it("Save needs Doc Date and ≥ 1 picked row; the toast names the first problem", () => {
    const none = validateTransfer(emptyTransfer("2026-11-24"));
    expect(none).toMatchObject({ docDate: false, noRows: true });
    expect(invalidMessage(none)).toBe("Pick at least one item from stock");
    const noDate = validateTransfer({ ...emptyTransfer(""), rows: [row({ toLocation: "Safe A", pcs: "1" })] });
    expect(invalidMessage(noDate)).toBe("Doc Date is required");
    const bad = validateTransfer({ ...emptyTransfer("2026-11-24"), rows: [row({ toLocation: "Safe A", pcs: "1" }), row({ key: "b" })] });
    expect(bad.rows).toEqual([{ index: 1, key: "b", issue: "location" }]);
    expect(invalidMessage(bad)).toBe("Row 2: Select a new location");
    expect(isValid(validateTransfer({ ...emptyTransfer("2026-11-24"), rows: [row({ toLocation: "Safe A", pcs: "1" })] }))).toBe(true);
  });
});

describe("UT-STL-01e server ↔ form", () => {
  it("toTransferInput sends every picked row with its snapshot, empty amounts as 0 and weight at 3 dp", () => {
    const values = { ...emptyTransfer("2026-11-24"), ref: " R-1 ", rows: [row({ toLocation: "Safe A", pcs: "1" }), row({ id: LINE1, stockUuid: S2, toLocation: "Shelf 1", weightCt: "0.5" })] };
    expect(toTransferInput(values)).toEqual({
      docDate: "2026-11-24",
      ref: "R-1",
      lines: [
        { fromStockUuid: S1, onHandPcs: 4, onHandWeightCt: "2.500", toLocation: "Safe A", pcs: 1, weightCt: "0.000" },
        { id: LINE1, fromStockUuid: S2, onHandPcs: 4, onHandWeightCt: "2.500", toLocation: "Shelf 1", pcs: 0, weightCt: "0.500" },
      ],
    });
  });

  it("fromTransfer orders lines by position and keeps the destination and amounts", () => {
    const values = fromTransfer(transferOut());
    expect(values).toMatchObject({ docDate: "2026-11-24", ref: "Move to safe" });
    expect(values.rows.map((entry) => [entry.id, entry.toLocation, entry.pcs, entry.weightCt])).toEqual([
      [LINE1, "Shelf 1", "1", "0.620"],
      [LINE2, "Safe A", "2", "1.000"],
    ]);
  });

  it("price unit text and header sort (asc → desc → pick order)", () => {
    expect([unitText("PER_CT"), unitText("PER_PCS")]).toEqual(["per cts", "per pcs"]);
    expect(nextSort(null, "pcs")).toEqual({ key: "pcs", dir: "asc" });
    expect(nextSort({ key: "pcs", dir: "asc" }, "pcs")).toEqual({ key: "pcs", dir: "desc" });
    expect(nextSort({ key: "pcs", dir: "desc" }, "pcs")).toBeNull();
    const rows = [row({ key: "a", onHandPcs: 3 }), row({ key: "b", onHandPcs: 1 }), row({ key: "c", onHandPcs: 2 })];
    expect(sortedRows(rows, { key: "pcs", dir: "asc" }).map((entry) => entry.key)).toEqual(["b", "c", "a"]);
    expect(sortedRows(rows, { key: "pcs", dir: "desc" }).map((entry) => entry.key)).toEqual(["a", "c", "b"]);
    expect(sortedRows(rows, null).map((entry) => entry.key)).toEqual(["a", "b", "c"]);
  });
});
