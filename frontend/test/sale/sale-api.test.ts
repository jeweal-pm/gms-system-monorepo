import { describe, expect, it, vi } from "vitest";
import { fromSale, mapSaleSaveError, saleCalls, saleDeleted, saleFlow, saleLoadError, salePhotoUrl, saleRestoreError, uploadSalePhoto } from "@/features/sale/api";
import { emptySale, lotToSaleLine, reserveLineToSaleLine, toSaleInput, type SaleFormValues } from "@/features/sale/form";
import { InventoryApiError } from "@/lib/inventory-client";
import { CUSTOMER_B, ID, LOT, RESERVE_LINE, reserveLine, saleOut, STOCK, stockItem } from "./fixtures";

/** UT-SL-07 (FE-SL-006/007): the inventory REST adapter, server → form mapping, Flow, and the error mapping. */

type Sent = { url: string; method: string; body: unknown; headers: Headers };
function controlled(reply: (sent: Sent) => { status?: number; body: unknown }) {
  const sent: Sent[] = [];
  const fetch = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const entry = { url: String(input), method: init?.method ?? "GET", body: init?.body instanceof FormData ? init.body : init?.body ? JSON.parse(String(init.body)) : undefined, headers: new Headers(init?.headers) };
    sent.push(entry);
    const { status = 200, body } = reply(entry);
    return new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
  });
  return { calls: saleCalls({ fetch: fetch as unknown as typeof globalThis.fetch, renew: async () => false }), sent };
}
const fail = (status: number, code: string, details?: Record<string, unknown>) => new InventoryApiError(status, code, code, "req-1", details ?? null);

describe("UT-SL-07a REST calls (verified contract)", () => {
  it("reads: options, next number, daybook, detail and reserve lines with exclude as a comma list", async () => {
    const { calls, sent } = controlled((entry) => {
      if (entry.url.includes("/sale/options")) return { body: { customers: [], companyCurrency: "THB", stone: {} } };
      if (entry.url.includes("next-number")) return { body: { docNo: "SL-1" } };
      if (entry.url.includes("reserve-lines")) return { body: { items: [reserveLine()], nextCursor: null } };
      if (entry.url.includes(`/sale/${ID}`)) return { body: saleOut() };
      return { body: { items: [], nextCursor: null } };
    });
    await calls.options(ID);
    await calls.nextNumber("2026-11-20");
    await calls.list("c1");
    expect((await calls.get(ID)).docNo).toBe("SL-1001");
    const page = await calls.reserveLines({ customerId: ID, currency: "USD", q: " pearl ", from: "2026-11-01", to: "", exclude: [RESERVE_LINE, RESERVE_LINE, STOCK] });
    expect(page.items[0]!.reserveNo).toBe("RS-26110001");
    expect(sent.map((entry) => entry.url)).toEqual([
      `/api/inventory/v1/sale/options?customerId=${ID}`,
      "/api/inventory/v1/sale/next-number?docDate=2026-11-20",
      "/api/inventory/v1/sale?deleted=false&cursor=c1&limit=50",
      `/api/inventory/v1/sale/${ID}`,
      `/api/inventory/v1/sale/reserve-lines?customerId=${ID}&currency=USD&q=pearl&from=2026-11-01&exclude=${encodeURIComponent(`${RESERVE_LINE},${STOCK}`)}&limit=50`,
    ]);
  });

  it("writes: create / update / submit / delete / restore / review with expectedVersion, JSON and the CSRF header", async () => {
    const { calls, sent } = controlled((entry) => ({ status: entry.url.endsWith("/sale") ? 201 : 200, body: { id: ID, docNo: "SL-1", version: 2, status: "DRAFT" } }));
    const input = toSaleInput(valid());
    await calls.create(input);
    await calls.update(ID, { ...input, expectedVersion: 1 });
    await calls.submit(ID, 2);
    await calls.remove(ID, 3);
    await calls.restore(ID, 4);
    await calls.approve(ID, 5);
    await calls.requestRevision(ID, 6, "fix");
    await calls.reject(ID, 7, "no");
    expect(sent.map((entry) => `${entry.method} ${entry.url.replace("/api/inventory/v1", "")}`)).toEqual([
      "POST /sale", `PUT /sale/${ID}`, `POST /sale/${ID}/submit`, `POST /sale/${ID}/delete`, `POST /sale/${ID}/restore`, `POST /sale/${ID}/approve`, `POST /sale/${ID}/request-revision`, `POST /sale/${ID}/reject`,
    ]);
    expect(sent[1]!.body).toMatchObject({ expectedVersion: 1, customerId: ID, tax: { enabled: false, rate: "7", includeInPrice: false }, serviceCharges: [] });
    expect(sent[6]!.body).toEqual({ expectedVersion: 6, note: "fix" });
    expect(sent[7]!.body).toEqual({ expectedVersion: 7, reason: "no" });
    expect(sent.every((entry) => entry.headers.get("x-gms-csrf") === "1")).toBe(true);
  });

  it("an error envelope becomes an InventoryApiError with its code and field errors", async () => {
    const { calls } = controlled(() => ({ status: 409, body: { error: { code: "SALE_CHANGED", message: "changed", requestId: "r", details: { currentVersion: 4 } } } }));
    await expect(calls.submit(ID, 1)).rejects.toMatchObject({ code: "SALE_CHANGED", status: 409 });
  });
});

const valid = (): SaleFormValues => ({
  ...emptySale(), docDate: "2026-11-20", dueDate: "2026-11-30", customerId: ID, shippingAddressId: ID, invoiceAddressId: CUSTOMER_B, currency: "USD", exchangeRate: "35.5",
  lines: [emptySale().lines[0]!, reserveLineToSaleLine(reserveLine()), { ...lotToSaleLine(stockItem()), unitPrice: "950" }, ...emptySale().lines.slice(3)],
});

describe("UT-SL-07b server → form, Flow, deleted", () => {
  it("fromSale: lines in position order with source, reference, caption, live cap, price, discount and photos; header money fields", () => {
    const form = fromSale(saleOut());
    expect(form).toMatchObject({ id: ID, docNo: "SL-1001", version: 3, status: "DRAFT", customerId: ID, invoiceAddressId: CUSTOMER_B, currency: "USD", exchangeRate: "35.5", ref: "PO-9", documentNote: "Paid" });
    expect(form.lines.map((line) => [line.lineId, line.saleSource, line.reserveLineId, line.memoStockId, line.sourceDocNo, line.stockPendingPcs, line.stockPendingWeightCt])).toEqual([
      ["line-1", "RESERVE", RESERVE_LINE, STOCK, "RS-1001", "40", "336.000"],
      ["line-2", "STOCK", "", "", "MR-26100012", "3", "2.100"],
    ]);
    expect(form.lines[1]).toMatchObject({ source: "STOCK", lotKey: LOT, stockId: "", pcs: "1", weightCt: "0.700", unitPrice: "950.00", priceUnit: "PER_PCS", discountType: "AMOUNT", discountValue: "5", photos: [{ id: "p1", url: salePhotoUrl("p1") }] });
    expect(form.lines[0]).toMatchObject({ discountValue: "", itemNote: "gift" });
    expect(form.tax).toEqual({ enabled: true, rate: "7.0000", includeInPrice: false });
    expect(form.serviceCharges).toEqual([{ chargeId: "SHIPPING", amount: "10.00" }]);
    // Sent back unchanged: each line keeps its id and reference.
    const input = toSaleInput(form);
    expect(input.lines.map((line) => [line.id, line.source, "reserveLineId" in line ? line.reserveLineId : "lotKey" in line ? line.lotKey : line.memoStockId])).toEqual([["line-1", "RESERVE", RESERVE_LINE], ["line-2", "STOCK", LOT]]);
  });

  it("saleFlow uses the server flags; a syncing sale can't be edited or deleted; deleted info", () => {
    expect(saleFlow(saleOut())).toMatchObject({ status: "DRAFT", canEdit: true, canDelete: true, canSubmit: true, usedBy: null, review: null });
    expect(saleFlow(saleOut({ syncing: true }))).toMatchObject({ canEdit: false, canDelete: false });
    const reviewed = saleOut({ status: "REVISION_REQUESTED", approval: { requireApproval: true, autoApproved: false, revisionCount: 1, review: { action: "REVISE", note: "fix price", at: null, by: "u", byName: "Ann" } } });
    expect(saleFlow(reviewed).review).toEqual({ action: "REVISE", note: "fix price", at: "", byName: "Ann" });
    expect(saleDeleted(saleOut())).toBeNull();
    expect(saleDeleted(saleOut({ deleted: { at: "2026-11-20T01:00:00.000Z", by: "u1" } }))).toEqual({ at: "2026-11-20T01:00:00.000Z", by: "u1" });
  });
});

describe("UT-SL-07c error mapping (error-handling.md)", () => {
  const values = valid();

  it("SALE_SOURCE_SHORT / exceeds: the right form row (empty rows skipped) with the available amount", () => {
    const outcome = mapSaleSaveError(fail(409, "SALE_SOURCE_SHORT", { fieldErrors: [{ path: "lines.1.weightCt", code: "exceeds_pending", params: { availablePcs: 2, availableWeightCt: "1.400" } }] }), values);
    expect(outcome.fieldErrors).toEqual([{ name: "lines.2.weightCt", message: "Only 2 pcs / 1.400 ct are available" }]);
    expect(outcome.message).toBe("Row 3: Only 2 pcs / 1.400 ct are available");
    const validation = mapSaleSaveError(fail(422, "VALIDATION_ERROR", { fieldErrors: [{ path: "lines.0.pcs", code: "exceeds_open", params: { availablePcs: 1, availableWeightCt: "8.4" } }, { path: "dueDate", code: "before_doc_date" }] }), values);
    expect(validation.fieldErrors).toEqual([{ name: "dueDate", message: "Due date must be on or after doc date" }, { name: "lines.1.pcs", message: "Only 1 pcs / 8.4 ct are available" }]);
    expect(validation.message).toBe("Row 2: Only 1 pcs / 8.4 ct are available");
  });

  it("SALE_REFERENCE_INVALID names the row to remove; header validation names the field", () => {
    expect(mapSaleSaveError(fail(422, "SALE_REFERENCE_INVALID", { fieldErrors: [{ path: "lines.0.reference", code: "unavailable" }] }), values).message).toBe("Row 2: This item is no longer available. Remove the row.");
    const header = mapSaleSaveError(fail(422, "VALIDATION_ERROR", { fieldErrors: [{ path: "exchangeRate", code: "required" }] }), values);
    expect(header.fieldErrors).toEqual([{ name: "exchangeRate", message: "Required" }]);
  });

  it("version conflict, deleted, status, busy, master down, permission, CSRF and unknown errors", () => {
    expect(mapSaleSaveError(fail(409, "SALE_CHANGED")).message).toBe("This sale was changed by someone else. Refresh to see the latest.");
    expect(mapSaleSaveError(fail(409, "SALE_DELETED"))).toMatchObject({ deleted: true });
    expect(mapSaleSaveError(fail(409, "SALE_STATUS_INVALID")).message).toBe("This sale can't be changed in its current status.");
    expect(mapSaleSaveError(fail(503, "SYNC_PENDING", { id: ID }), emptySale()).message).toBe("Saving in progress. Open the sale from the Daybook in a moment.");
    expect(mapSaleSaveError(fail(409, "SALE_BUSY"), { ...emptySale(), id: ID }).message).toBe("Saving in progress. Refresh in a moment.");
    expect(mapSaleSaveError(fail(503, "MASTER_UNAVAILABLE")).message).toContain("Nothing was saved");
    expect(mapSaleSaveError(fail(403, "PERMISSION_DENIED")).message).toBe("You don't have permission to do this. Nothing was saved.");
    expect(mapSaleSaveError(fail(403, "CSRF_INVALID")).message).toBe("Your session needs a refresh. Reload the page and try again.");
    expect(mapSaleSaveError(new Error("x")).message).toBe("Couldn't save. Try again.");
  });

  it("load and restore errors", () => {
    expect(saleLoadError(fail(404, "SALE_NOT_FOUND"))).toBe("Sale not found.");
    expect(saleLoadError(fail(403, "PERMISSION_DENIED"))).toBe("You don't have permission to view sales.");
    expect(saleLoadError(fail(0, "NETWORK_ERROR"))).toBe("The inventory service can't be reached. Try again.");
    expect(saleRestoreError(fail(409, "SALE_STATUS_INVALID"))).toEqual({ message: "This sale is no longer deleted.", refetch: true });
  });
});

describe("UT-SL-07d photos (FE-SL-007)", () => {
  const png = (size = 10) => new File([new Uint8Array(size)], "a.png", { type: "image/png" });
  it("uploads one JPEG/PNG to POST /sale/photos as multipart and maps refusals", async () => {
    const { calls, sent } = controlled(() => ({ status: 201, body: { id: "photo-1" } }));
    expect(await uploadSalePhoto(png(), calls)).toBe("photo-1");
    expect(sent[0]!.url).toBe("/api/inventory/v1/sale/photos");
    expect(sent[0]!.body).toBeInstanceOf(FormData);
    await expect(uploadSalePhoto(new File(["x"], "a.gif", { type: "image/gif" }), calls)).rejects.toThrow("Use a JPEG or PNG photo.");
    await expect(uploadSalePhoto(png(), { uploadPhoto: () => Promise.reject(fail(422, "SALE_PHOTO_INVALID")) })).rejects.toThrow("JPEG or PNG, up to 5 MB");
    await expect(uploadSalePhoto(png(), { uploadPhoto: () => Promise.reject(fail(403, "PERMISSION_DENIED")) })).rejects.toThrow("permission");
    expect(salePhotoUrl("p 1")).toBe("/api/inventory/v1/sale/photos/p%201");
  });
});
