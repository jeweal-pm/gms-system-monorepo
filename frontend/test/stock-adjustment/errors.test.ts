import { describe, expect, it } from "vitest";
import { mapAdjustmentWriteError } from "@/features/stock-adjustment/errors";
import { lineFromStock } from "@/features/stock-adjustment/form";
import { InventoryApiError } from "@/lib/inventory-client";

const line = { ...lineFromStock({ stockUuid: "b9b3adcf-0805-45ee-b578-54d0fd4ddfbb", stockId: "SA-01", lotKey: "OS-1", refDocNo: "LS-1", priceUnit: "PER_CT", onHandPcs: 3, onHandWeightCt: "1.120", stockPrice: "12.50", attrs: { stoneCode: "SC-1", stone: "Sapphire", shape: "Oval", size: "5 mm", color: "Blue", clarity: "VS1", cutting: "Good", quality: "A", lot: "L-1", location: "Safe A", cerType: "", cerNo: "" } }), id: "0854d449-5d11-47df-9c91-14524c78704b" };

describe("UT-SAJ-03 write error messages", () => {
  it("maps stale snapshots to the affected row and preserves data", () => {
    expect(mapAdjustmentWriteError(new InventoryApiError(409, "STOCK_ADJUSTMENT_STOCK_CHANGED", "x", null, { lines: [{ lineId: line.id, onHandPcs: 4, onHandWeightCt: "1.300" }] }), [line])).toEqual({
      message: "Row 1: Stock changed since picked (now 4 pcs / 1.300 cts). Remove and pick again.",
      rowErrors: [{ key: line.key, message: "Stock changed since picked (now 4 pcs / 1.300 cts). Remove and pick again." }], refetch: false,
    });
  });
  it("maps line unavailability, later use, version conflict, permission and network errors", () => {
    expect(mapAdjustmentWriteError(new InventoryApiError(422, "STOCK_ADJUSTMENT_LINE_UNAVAILABLE", "x", null, { lineIds: [line.id] }), [line]).rowErrors).toEqual([{ key: line.key, message: "No longer in stock at this location" }]);
    expect(mapAdjustmentWriteError(new InventoryApiError(409, "STOCK_ADJUSTMENT_IN_USE", "x"), [line])).toMatchObject({ message: "Cannot edit or delete: these stones were used by a later document", refetch: true });
    expect(mapAdjustmentWriteError(new InventoryApiError(409, "VERSION_CONFLICT", "x"), [line]).message).toContain("Refresh");
    expect(mapAdjustmentWriteError(new InventoryApiError(403, "FORBIDDEN", "x"), [line]).message).toContain("permission");
    expect(mapAdjustmentWriteError(new InventoryApiError(503, "SERVICE_UNAVAILABLE", "x"), [line]).message).toContain("inventory service");
  });
});
