import { describe, expect, it, vi } from "vitest";
import { z } from "zod";
import { loadLoadError, mapLoadSaveError, NO_COMPANY_CURRENCY, searchBody, uploadLoadPhoto, PhotoUploadError, loadToStockCalls } from "@/features/load-to-stock/api";
import { mapFlowError } from "@/features/trade-document/flow-status";
import { inventoryRequest, inventoryUrl, InventoryApiError } from "@/lib/inventory-client";
import { readDomainError, retryTransient } from "@/lib/trpc-error";
import { controlledInventory, envelope, L1, L2, LINE1, LINE2 } from "./fixtures";

/** UT-LS-05 / UT-LS-06 (FE-LS-010, FE-LS-016): the inventory REST client and the error mapping. */

const ok = z.object({ ok: z.boolean() });

describe("UT-LS-06 inventory REST client", () => {
  it("relative same-origin URLs only; empty query values left out", () => {
    expect(inventoryUrl("/load-to-stock", { q: "ab c", cursor: undefined, deleted: false, limit: 50 })).toBe("/api/inventory/v1/load-to-stock?q=ab+c&deleted=false&limit=50");
    expect(() => inventoryUrl("https://evil.example/x")).toThrow();
    expect(() => inventoryUrl("//evil.example/x")).toThrow();
    expect(() => inventoryUrl("relative")).toThrow();
  });

  it("sends the cookie only (same-origin), JSON with content-type; parses with the schema", async () => {
    const server = controlledInventory(() => ({ body: { ok: true, extra: 1 } }));
    const result = await inventoryRequest("/x", { method: "POST", body: { a: 1 }, schema: ok }, { fetch: server.fetch, renew: vi.fn() });
    expect(result).toEqual({ ok: true });
    expect(server.calls[0]).toMatchObject({ method: "POST", path: "/api/inventory/v1/x", body: { a: 1 }, credentials: "same-origin", contentType: "application/json", csrf: "1" });
  });

  it("401 renews once and retries once; a second 401 is returned as UNAUTHENTICATED (no loop)", async () => {
    let n = 0;
    const server = controlledInventory(() => (n++ === 0 ? { status: 401, body: envelope("UNAUTHENTICATED") } : { body: { ok: true } }));
    const renew = vi.fn(async () => true);
    await expect(inventoryRequest("/x", { schema: ok }, { fetch: server.fetch, renew })).resolves.toEqual({ ok: true });
    expect(renew).toHaveBeenCalledTimes(1);
    expect(server.calls).toHaveLength(2);

    const always = controlledInventory(() => ({ status: 401, body: envelope("UNAUTHENTICATED") }));
    const error = await inventoryRequest("/x", { schema: ok }, { fetch: always.fetch, renew: async () => true }).catch((caught: unknown) => caught);
    expect(always.calls).toHaveLength(2);
    expect(error).toBeInstanceOf(InventoryApiError);
    expect(readDomainError(error)).toMatchObject({ domainCode: "UNAUTHORIZED", httpStatus: 401 });
  });

  it("envelope → code, requestId, details.fieldErrors; no envelope → a code from the status; bad body → INVALID_RESPONSE", async () => {
    const validation = controlledInventory(() => ({ status: 422, body: envelope("VALIDATION_ERROR", { fieldErrors: [{ path: "rows.2.pcs", code: "too_small" }] }) }));
    const error = (await inventoryRequest("/x", { schema: ok }, { fetch: validation.fetch }).catch((caught: unknown) => caught)) as InventoryApiError;
    expect(error).toMatchObject({ status: 422, code: "VALIDATION_ERROR", requestId: "req-1", fieldErrors: [{ path: "rows.2.pcs", code: "too_small" }] });
    const gateway = controlledInventory(() => ({ status: 502 }));
    expect(await inventoryRequest("/x", { schema: ok }, { fetch: gateway.fetch }).catch((caught: InventoryApiError) => caught.code)).toBe("SERVICE_UNAVAILABLE");
    const odd = controlledInventory(() => ({ body: { ok: "yes" } }));
    expect(await inventoryRequest("/x", { schema: ok }, { fetch: odd.fetch }).catch((caught: InventoryApiError) => caught.code)).toBe("INVALID_RESPONSE");
    const down = (async () => {
      throw new TypeError("Failed to fetch");
    }) as typeof fetch;
    const network = await inventoryRequest("/x", { schema: ok }, { fetch: down }).catch((caught: unknown) => caught);
    expect(readDomainError(network)).toMatchObject({ domainCode: "NETWORK_ERROR", httpStatus: null });
    // Reads retry only transient failures (no 4xx).
    expect(retryTransient(0, error)).toBe(false);
    expect(retryTransient(0, network)).toBe(true);
  });

  it("the shared ADR-0050 mapper reads LOAD_TO_STOCK_* codes from the inventory client", () => {
    const stale = new InventoryApiError(409, "LOAD_TO_STOCK_STATUS_INVALID", "x", null, { status: "PENDING_APPROVAL" });
    expect(mapFlowError(stale, "load-to-stock", "LS1", "submit")).toMatchObject({ message: "LS1 can't be sent to approve in its current status.", refetch: true });
  });
});

describe("UT-LS-05 Save errors and request bodies", () => {
  const values = { sources: [LINE1, LINE2] };

  it("remaining changed: 'Row n: only {p} pcs / {w} ct left on {PU}', field errors on the rows, picker refetched", () => {
    const error = new InventoryApiError(409, "LOAD_TO_STOCK_EXCEEDS_REMAINING", "x", null, {
      lines: [
        { purchaseLineId: L2, rowPaths: ["rows.3"], remainingPcs: 2, remainingWeightCt: "1.200" },
        { purchaseLineId: L1, rowPaths: ["rows.1", "rows.2"], remainingPcs: 3, remainingWeightCt: "3.700" },
      ],
    });
    const outcome = mapLoadSaveError(error, values);
    expect(outcome.message).toBe("Row 2: only 3 pcs / 3.700 ct left on PU2610-031");
    expect(outcome.fieldErrors.map((field) => field.name)).toEqual(["rows.1.pcs", "rows.2.pcs", "rows.3.pcs"]);
    expect(outcome.refetchPicker).toBe(true);
  });

  it("each documented code maps to its text", () => {
    const map = (code: string, details?: Record<string, unknown>) => mapLoadSaveError(new InventoryApiError(409, code, "x", null, details ?? null), values);
    expect(map("LOAD_TO_STOCK_CHANGED").message).toBe("Someone else changed this Load to Stock. Refresh to see the latest.");
    expect(map("LOAD_TO_STOCK_IN_USE")).toMatchObject({ message: "Some stock from this load is already used; it can't be changed.", refetch: true });
    expect(map("SYNC_PENDING")).toMatchObject({ message: "Saving in progress — refreshing.", refetch: true });
    expect(map("LOAD_TO_STOCK_LINE_UNAVAILABLE", { rowPaths: ["rows.4"] }).message).toBe("Row 5: this PU line can no longer be loaded. Remove the row.");
    expect(map("LOCATION_INACTIVE", { rowPaths: ["rows.0"] })).toMatchObject({ fieldErrors: [{ name: "rows.0.location", message: "Choose another location" }] });
    expect(map("MASTER_UNAVAILABLE").message).toBe("Purchase data can't be reached right now. Try again in a moment.");
    expect(map("PERMISSION_DENIED").message).toBe("You don't have permission to do this. Nothing was saved.");
    expect(map("LICENSE_DENIED").message).toBe("Your license doesn't allow this right now. Nothing was saved.");
    expect(mapLoadSaveError(new InventoryApiError(422, "VALIDATION_ERROR", "x", null, { fieldErrors: [{ path: "rows.2.stockPrice", code: "required" }] }), values)).toEqual({
      fieldErrors: [{ name: "rows.2.stockPrice", message: "Required" }],
      message: "Row 3: Stock Price — required",
    });
    // Backend notes 2026-11-17: no company currency → VALIDATION_ERROR at `currency`; SYNC_PENDING carries the load id.
    expect(mapLoadSaveError(new InventoryApiError(422, "VALIDATION_ERROR", "x", null, { fieldErrors: [{ path: "currency", code: "required" }] }), values).message).toBe(NO_COMPANY_CURRENCY);
    expect(mapLoadSaveError(new InventoryApiError(503, "SYNC_PENDING", "x", null, { id: "load-9" }), values)).toMatchObject({ refetch: true, pendingId: "load-9" });
    expect(loadLoadError(new InventoryApiError(404, "LOAD_TO_STOCK_NOT_FOUND", "x"))).toBe("Load to Stock not found.");
    expect(loadLoadError(new InventoryApiError(502, "SERVICE_UNAVAILABLE", "x"))).toBe("The inventory service can't be reached. Try again.");
  });

  it("search body: strict keys, trimmed search, ≤ 200 distinct exclusions, 50 a page", () => {
    expect(searchBody({ vendorId: "v", q: "  ", excludeLineIds: [L1, L1] }, null)).toEqual({ vendorId: "v", excludeLineIds: [L1], limit: 50 });
    expect(searchBody({ q: " PU26 ", from: "2026-10-01", to: "2026-10-31", excludeAllocationOf: "load" }, "c2")).toEqual({ q: "PU26", from: "2026-10-01", to: "2026-10-31", excludeAllocationOf: "load", cursor: "c2", limit: 50 });
  });

  it("photo upload: type / size checked before sending; multipart to /load-to-stock/photos; codes → ADR-0048 texts", async () => {
    const server = controlledInventory(() => ({ status: 201, body: { id: "ph1" } }));
    const calls = loadToStockCalls({ fetch: server.fetch, renew: async () => false });
    const file = (type: string, size = 10) => new File([new Uint8Array(size)], "a", { type });
    await expect(uploadLoadPhoto(file("image/gif"), calls)).rejects.toThrow("Use a JPEG or PNG photo.");
    await expect(uploadLoadPhoto(file("image/png", 5 * 1024 * 1024 + 1), calls)).rejects.toBeInstanceOf(PhotoUploadError);
    await expect(uploadLoadPhoto(file("image/png"), calls)).resolves.toBe("ph1");
    expect(server.calls[0]).toMatchObject({ method: "POST", path: "/api/inventory/v1/load-to-stock/photos", body: "multipart", contentType: null });
    const big = controlledInventory(() => ({ status: 413, body: envelope("PHOTO_TOO_LARGE") }));
    await expect(uploadLoadPhoto(file("image/png"), loadToStockCalls({ fetch: big.fetch }))).rejects.toThrow("This file isn't a supported photo (JPEG or PNG, up to 5 MB).");
  });
});
