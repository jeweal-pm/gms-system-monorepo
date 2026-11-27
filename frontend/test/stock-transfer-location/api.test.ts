import { describe, expect, it, vi } from "vitest";
import {
  AFTER_WRITE_KEYS,
  excludeParam,
  invalidateTransfer,
  lookupScan,
  mapTransferSaveError,
  scanMessage,
  transferFlow,
  transferKeys,
  transferLoadError,
} from "@/features/stock-transfer-location/api";
import { emptyTransfer, fromTransfer, lotToRow, toTransferInput } from "@/features/stock-transfer-location/form";
import { flowActions, savedMessage } from "@/features/trade-document/flow-status";
import { InventoryApiError } from "@/lib/inventory-client";
import { controlled, envelope, ID, LINE1, LINE2, S1, S2, stockLot, transferOut } from "./fixtures";

/** UT-STL-02 (FE-STL-004): the inventory REST adapter against a controlled server, the Flow, and the error mapping. */

const fail = (status: number, code: string, details?: Record<string, unknown>) => new InventoryApiError(status, code, code, "req-1", details ?? null);

describe("UT-STL-02a REST calls (SA rev 1 contract)", () => {
  it("reads: options, next number, daybook, detail and the stock picker with q / exclude / cursor / limit", async () => {
    const { calls, sent } = controlled((entry) => {
      if (entry.url.includes("/options")) return { body: { locations: ["BKK-01", "Safe A"], numbering: { configured: true } } };
      if (entry.url.includes("next-number")) return { body: { docNo: "STGMS2611001" } };
      if (entry.url.includes("/stock?")) return { body: { items: [stockLot()], nextCursor: "c2" } };
      if (entry.url.endsWith(ID)) return { body: transferOut() };
      return { body: { items: [{ id: ID, docNo: "STGMS2611001", docDate: "2026-11-24", ref: "", status: "APPROVED", lineCount: 2, totalPcs: 3, totalWeightCt: "1.620", autoApproved: true, deleted: false }], nextCursor: null } };
    });
    expect((await calls.options()).locations).toEqual(["BKK-01", "Safe A"]);
    expect((await calls.nextNumber("2026-11-24")).docNo).toBe("STGMS2611001");
    expect((await calls.list({ cursor: "c1" })).items[0]!.lineCount).toBe(2);
    expect((await calls.get(ID)).lines).toHaveLength(2);
    const page = await calls.stock({ q: " ruby ", exclude: [S1, S2, S1] }, "c1");
    expect(page.items[0]!.stockUuid).toBe(S1);
    expect(sent.map((entry) => entry.url)).toEqual([
      "/api/inventory/v1/stock-transfer-location/options",
      "/api/inventory/v1/stock-transfer-location/next-number?docDate=2026-11-24",
      "/api/inventory/v1/stock-transfer-location?deleted=false&cursor=c1&limit=50",
      `/api/inventory/v1/stock-transfer-location/${ID}`,
      `/api/inventory/v1/stock-transfer-location/stock?q=ruby&exclude=${encodeURIComponent(`${S1},${S2}`)}&cursor=c1&limit=50`,
    ]);
    expect(excludeParam(Array.from({ length: 250 }, (_, index) => `u${index}`)).split(",")).toHaveLength(200);
  });

  it("writes: create / update / submit / approve / revise / reject / delete / restore with expectedVersion and the CSRF header", async () => {
    const { calls, sent } = controlled((entry) => ({ status: entry.method === "POST" && entry.url.endsWith("/stock-transfer-location") ? 201 : 200, body: { id: ID, docNo: "STGMS2611001", version: 3, status: "DRAFT" } }));
    const input = toTransferInput(fromTransfer(transferOut()));
    await calls.create(input);
    await calls.update(ID, { ...input, expectedVersion: 2 });
    await calls.submit(ID, 3);
    await calls.approve(ID, 4);
    await calls.requestRevision(ID, 5, "fix");
    await calls.reject(ID, 6, "no");
    await calls.remove(ID, 7);
    await calls.restore(ID, 8);
    expect(sent.map((entry) => `${entry.method} ${entry.url.replace("/api/inventory/v1/stock-transfer-location", "")}`)).toEqual([
      "POST ", `PUT /${ID}`, `POST /${ID}/submit`, `POST /${ID}/approve`, `POST /${ID}/request-revision`, `POST /${ID}/reject`, `POST /${ID}/delete`, `POST /${ID}/restore`,
    ]);
    expect(sent[0]!.body).toMatchObject({ docDate: "2026-11-24", ref: "Move to safe", lines: [{ id: LINE1, fromStockUuid: S1, toLocation: "Shelf 1", pcs: 1, weightCt: "0.620" }, { id: LINE2 }] });
    expect(sent[1]!.body).toMatchObject({ expectedVersion: 2 });
    expect(sent[4]!.body).toEqual({ expectedVersion: 5, note: "fix" });
    expect(sent[5]!.body).toEqual({ expectedVersion: 6, reason: "no" });
    for (const entry of sent) expect(entry.headers.get("x-gms-csrf")).toBe("1");
  });

  it("an envelope error becomes an InventoryApiError with its code and details", async () => {
    const { calls } = controlled(() => ({ status: 409, body: envelope("VERSION_CONFLICT", { currentVersion: 4 }) }));
    await expect(calls.update(ID, { ...toTransferInput(emptyTransfer("2026-11-24")), expectedVersion: 1 })).rejects.toMatchObject({ code: "VERSION_CONFLICT", details: { currentVersion: 4 } });
  });
});

describe("UT-STL-02b approval flow: OFF → Approved, ON → Draft + Send to approve", () => {
  it("save toasts follow the create result's status", async () => {
    const off = controlled(() => ({ status: 201, body: { id: ID, docNo: "STGMS2611001", version: 1, status: "APPROVED" } }));
    const applied = await off.calls.create(toTransferInput(fromTransfer(transferOut())));
    expect(savedMessage(applied.docNo ?? undefined, { status: applied.status, autoApproved: applied.status === "APPROVED" })).toBe("STGMS2611001 saved and approved (approval is off).");
    const on = controlled(() => ({ status: 201, body: { id: ID, docNo: "STGMS2611001", version: 1, status: "DRAFT" } }));
    const draft = await on.calls.create(toTransferInput(fromTransfer(transferOut())));
    expect(savedMessage(draft.docNo ?? undefined, { status: draft.status, autoApproved: false })).toBe("Saved STGMS2611001 as Draft");
  });

  it("transferFlow: ON Draft shows Send to approve and Edit / Delete; OFF auto-approved stays editable; Pending is locked", () => {
    const access = { add: true, edit: true, delete: true };
    const draft = flowActions({ flow: transferFlow(transferOut()), deleted: false, requireApproval: true, access, editing: false, dirty: false });
    expect(draft).toMatchObject({ showSend: true, canSend: true, canEdit: true, canDelete: true });
    const auto = transferOut({ status: "APPROVED", autoApproved: true, approval: { requireApproval: false, autoApproved: true, revisionCount: 0, submitted: null, review: null } });
    expect(flowActions({ flow: transferFlow(auto), deleted: false, requireApproval: false, access, editing: false, dirty: false })).toMatchObject({ showSend: false, canEdit: true, canDelete: true });
    const pending = flowActions({ flow: transferFlow(transferOut({ status: "PENDING_APPROVAL" })), deleted: false, requireApproval: true, access, editing: false, dirty: false });
    expect(pending).toMatchObject({ showEditDelete: false, showSend: false });
    const review = transferFlow(transferOut({ status: "REVISION_REQUESTED", approval: { requireApproval: true, autoApproved: false, revisionCount: 1, submitted: null, review: { action: "REVISE", note: "check lot", at: "2026-11-24T01:00:00.000Z", by: "u", byName: "Ann" } } }));
    expect(review.review).toEqual({ action: "REVISE", note: "check lot", at: "2026-11-24T01:00:00.000Z", byName: "Ann" });
  });

  it("after a write the transfer, Approve views, Stock Card and Stock Value are refreshed", async () => {
    const keys: unknown[] = [];
    const client = { invalidateQueries: vi.fn(async ({ queryKey }: { queryKey: unknown }) => void keys.push(queryKey)) };
    await invalidateTransfer(client as never);
    expect(keys).toEqual([...AFTER_WRITE_KEYS]);
    expect(keys).toContainEqual(["inventory", "stock-card"]);
    expect(keys).toContainEqual(["inventory", "stock-value"]);
    expect(transferKeys.stock({ q: " a ", exclude: [S1] })).toEqual(["inventory", "stock-transfer-location", "stock", { q: "a", location: "", exclude: [S1] }]);
  });
});

describe("UT-STL-02c error mapping (row-level by lineId)", () => {
  const values = { rows: [{ ...lotToRow(stockLot()), key: "k1", id: LINE1 }, { ...lotToRow(stockLot({ stockUuid: S2 })), key: "k2", id: "" }] };

  it("409 STOCK_TRANSFER_EXCEEDS_ON_HAND → the rows' on hand now (a new row matched by its stock UUID); the picker refreshes", () => {
    const outcome = mapTransferSaveError(fail(409, "STOCK_TRANSFER_EXCEEDS_ON_HAND", { lines: [{ lineId: S2, onHandPcs: 0, onHandWeightCt: "0.300" }, { lineId: LINE1, onHandPcs: 1, onHandWeightCt: "0.500" }] }), values);
    expect(outcome.rowErrors).toEqual([
      { key: "k1", message: "Only 1 pcs / 0.500 ct on hand now" },
      { key: "k2", message: "Only 0 pcs / 0.300 ct on hand now" },
    ]);
    expect(outcome.message).toBe("Row 1: Only 1 pcs / 0.500 ct on hand now");
    expect(outcome.refetchStock).toBe(true);
  });

  it("422 LINE_UNAVAILABLE and LOCATION_INVALID → row messages; unknown ids fall back to one toast", () => {
    expect(mapTransferSaveError(fail(422, "STOCK_TRANSFER_LINE_UNAVAILABLE", { lineIds: [LINE1] }), values)).toMatchObject({ rowErrors: [{ key: "k1", message: "This lot can no longer be moved. Remove the row." }], message: "Row 1: This lot can no longer be moved. Remove the row." });
    expect(mapTransferSaveError(fail(422, "LOCATION_INVALID", { lineIds: [S2] }), values)).toMatchObject({ rowErrors: [{ key: "k2", message: "Choose another new location" }], message: "Row 2: Choose another new location" });
    expect(mapTransferSaveError(fail(422, "LOCATION_INVALID", { lineIds: ["other"] }), values)).toMatchObject({ rowErrors: [], message: "A new location is no longer valid. Choose another location." });
  });

  it("IN_USE names the Stock IDs and reloads; VERSION_CONFLICT asks for a refresh; validation maps lines.N and header fields", () => {
    expect(mapTransferSaveError(fail(409, "STOCK_TRANSFER_IN_USE", { stockIds: ["260101", "260102"] }), values)).toMatchObject({ message: "Stock 260101, 260102 from this transfer is already used; it can't be changed.", refetch: true });
    expect(mapTransferSaveError(fail(409, "VERSION_CONFLICT", { currentVersion: 3 }), values).message).toBe("Someone else changed this transfer. Refresh to see the latest.");
    expect(mapTransferSaveError(fail(409, "STOCK_TRANSFER_STATUS", { status: "APPROVED" })).refetch).toBe(true);
    const validation = mapTransferSaveError(fail(400, "VALIDATION_FAILED", { fieldErrors: [{ path: "lines.1.toLocation", code: "required" }, { path: "docDate", code: "required" }] }), values);
    expect(validation).toMatchObject({ rowErrors: [{ key: "k2", message: "New Location — required" }], fieldErrors: [{ name: "docDate", message: "Required" }], message: "Row 2: New Location — required" });
    expect(mapTransferSaveError(fail(422, "NUMBERING_NOT_CONFIGURED")).message).toContain("Document Setup");
    expect(mapTransferSaveError(fail(0, "NETWORK_ERROR")).message).toBe("The inventory service can't be reached. Try again in a moment.");
    expect(transferLoadError(fail(404, "STOCK_TRANSFER_NOT_FOUND"))).toBe("Stock Transfer Location not found.");
  });
});

describe("UT-STL-02d barcode scan", () => {
  it("adds only one exact match; none / several / already picked → a toast", async () => {
    const reply = (items: unknown[]) => controlled(() => ({ body: { items, nextCursor: null } }));
    const one = reply([stockLot(), stockLot({ stockUuid: S2, stockId: "2600140", attrs: { ...stockLot().attrs, lot: "L-9" } })]);
    expect(await lookupScan("260014", [], one.calls)).toMatchObject({ kind: "found", lot: { stockUuid: S1 } });
    expect(one.sent[0]!.url).toBe("/api/inventory/v1/stock-transfer-location/stock?q=260014&limit=10");
    expect(await lookupScan("260014", [S1], one.calls)).toEqual({ kind: "picked" });
    const many = reply([stockLot(), stockLot({ stockUuid: S2 })]);
    const result = await lookupScan("RU-RUBDEXVVS1AAA", [], many.calls);
    expect(result).toEqual({ kind: "many", count: 2 });
    expect(scanMessage("RU-RUBDEXVVS1AAA", result)).toBe("RU-RUBDEXVVS1AAA matches 2 lots. Use From Stock to pick one.");
    expect(scanMessage("X", await lookupScan("X", [], reply([]).calls))).toBe("No stock found for X");
    expect(await lookupScan("  ", [], reply([]).calls)).toEqual({ kind: "none" });
  });
});
