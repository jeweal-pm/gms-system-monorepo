import { describe, expect, it, vi } from "vitest";
import { applyPick, emptyMergeSplit, mapMergeSplitError, mergeSplitCalls, mergeSplitLoadError, MS_DENIED, MS_NOT_FOUND, relinkStockPhotos, stockQuery, toMergeSplitInput, uploadMergeSplitPhoto } from "@/features/merge-split/api";
import { mergeSplitDocumentClient, mergeSplitPreview } from "@/features/approve-center/inventory";
import { InventoryApiError } from "@/lib/inventory-client";
import type { OwnStockRow } from "@/features/merge-split/types";
import { controlledInventory, envelope } from "../load-to-stock/fixtures";
import { MS_ID, msOut, OWN_A, OWN_B, OWN_C } from "./fixtures";

/**
 * UT-MS-05 / IT-MS-05 (FE-MS-003, FE-MS-006): the REST calls through the real inventory client against an in-memory
 * server that follows the SA rev 1 api-contract (`/api/inventory/v1/merge-split`). The live-contract check waits for
 * backend BE-MS-004/005 to hand over the running service.
 */
const renew = vi.fn(async () => true);
const BASE = "/api/inventory/v1/merge-split";

/** A tiny contract server: own stock paging + exclude, create (approval on/off), update with expectedVersion, submit. */
function contractServer(options: { requireApproval: boolean; available?: OwnStockRow[] }) {
  const stock = [...(options.available ?? [OWN_A, OWN_B, OWN_C]), ...Array.from({ length: 55 }, (_, index) => ({ ...OWN_A, stockUuid: `extra-${index}`, stockId: `26${String(index + 100)}` }))];
  let doc = { version: 1, status: "DRAFT" as string };
  const server = controlledInventory((call) => {
    if (call.path === `${BASE}/stock`) {
      const excluded = new Set((call.query.exclude ?? "").split(",").filter(Boolean));
      const q = (call.query.q ?? "").toLowerCase();
      const rows = stock.filter((row) => !excluded.has(row.stockUuid) && (!call.query.location || row.location === call.query.location) && (!q || `${row.stockId} ${row.attrs.stoneCode} ${row.lot}`.toLowerCase().includes(q)));
      const start = call.query.cursor ? Number(call.query.cursor) : 0;
      const limit = Number(call.query.limit);
      const next = start + limit < rows.length ? String(start + limit) : null;
      return { body: { items: rows.slice(start, start + limit), nextCursor: next } };
    }
    if (call.path === BASE && call.method === "POST") {
      const body = call.body as ReturnType<typeof toMergeSplitInput>;
      const source = new Map(stock.map((row) => [row.stockUuid, row]));
      for (const input of body.sources) {
        const live = source.get(input.stockUuid);
        if (!live || live.availPcs !== input.availPcs) {
          return { status: 409, body: envelope("MERGE_SPLIT_STOCK_CHANGED", { sources: [{ sourceId: input.key, stockId: live?.stockId ?? "?", availPcs: 1, availWeightCt: "0.500" }] }) };
        }
      }
      doc = { version: 1, status: options.requireApproval ? "DRAFT" : "APPROVED" };
      return { status: 201, body: { id: MS_ID, docNo: "MSGMS2611001", version: 1, status: doc.status, stockIds: body.results.map((_, index) => (options.requireApproval ? null : `27000${index}`)) } };
    }
    if (call.path === `${BASE}/${MS_ID}` && call.method === "PUT") {
      const { expectedVersion } = call.body as { expectedVersion: number };
      if (expectedVersion !== doc.version) return { status: 409, body: envelope("VERSION_CONFLICT", { currentVersion: doc.version }) };
      doc = { ...doc, version: doc.version + 1 };
      return { body: { id: MS_ID, version: doc.version, status: doc.status, stockIds: [] } };
    }
    if (call.path === `${BASE}/${MS_ID}/submit`) {
      doc = { version: doc.version + 1, status: "PENDING_APPROVAL" };
      return { body: { id: MS_ID, version: doc.version, status: doc.status, submittedAt: "2026-11-27T03:00:00Z" } };
    }
    if (call.path === `${BASE}/${MS_ID}`) return { body: msOut({ version: doc.version, status: doc.status }) };
    if (call.path === `${BASE}/photos`) return { status: 201, body: { fileId: "f-1" } };
    return { status: 404, body: envelope("MERGE_SPLIT_NOT_FOUND") };
  });
  return server;
}

describe("UT-MS-05 request mapping", () => {
  it("stock query: trimmed q ≤ 100, location, distinct exclude ≤ 200, excludeDocId, limit 50; empty keys dropped", () => {
    expect(stockQuery({ q: "  ruby ", location: "Safe A", exclude: ["a", "a", "b"], excludeDocId: MS_ID }, "c2")).toEqual({ q: "ruby", location: "Safe A", exclude: "a,b", excludeDocId: MS_ID, cursor: "c2", limit: 50 });
    expect(stockQuery({})).toEqual({ q: undefined, location: undefined, exclude: undefined, excludeDocId: undefined, cursor: undefined, limit: 50 });
    expect(stockQuery({ exclude: Array.from({ length: 250 }, (_, index) => `id${index}`) }).exclude!.split(",")).toHaveLength(200);
  });

  it("own stock pages of 50 with Load more; exclude leaves the picked stocks out; cookie credentials", async () => {
    const server = contractServer({ requireApproval: true });
    const calls = mergeSplitCalls({ fetch: server.fetch, renew });
    const first = await calls.stock({ exclude: [OWN_A.stockUuid] });
    expect(first.items).toHaveLength(50);
    expect(first.items.some((row) => row.stockUuid === OWN_A.stockUuid)).toBe(false);
    const second = await calls.stock({ exclude: [OWN_A.stockUuid] }, first.nextCursor);
    expect(second.items).toHaveLength(7);
    expect(second.nextCursor).toBeNull();
    expect(server.calls[0]).toMatchObject({ method: "GET", credentials: "same-origin" });
  });
});

describe("IT-MS-05 save flow against the contract server", () => {
  it("approval OFF: Save → APPROVED with the new Stock IDs; ON: DRAFT, then submit → PENDING_APPROVAL", async () => {
    const off = mergeSplitCalls({ fetch: contractServer({ requireApproval: false }).fetch, renew });
    const input = toMergeSplitInput(applyPick(emptyMergeSplit("2026-11-27"), [OWN_A], "SPLIT"));
    expect(await off.create(input)).toMatchObject({ status: "APPROVED", stockIds: ["270000", "270001"] });

    const server = contractServer({ requireApproval: true });
    const on = mergeSplitCalls({ fetch: server.fetch, renew });
    const saved = await on.create(input);
    expect(saved).toMatchObject({ status: "DRAFT", stockIds: [null, null] });
    expect(server.calls.at(-1)).toMatchObject({ method: "POST", path: BASE });
    expect(server.calls.at(-1)!.csrf).not.toBeNull();
    expect(await on.submit(MS_ID, saved.version)).toMatchObject({ status: "PENDING_APPROVAL", version: 2 });
    expect((await on.get(MS_ID)).status).toBe("PENDING_APPROVAL");
  });

  it("409 STOCK_CHANGED names the row; edits are kept (no refetch) and the picker refreshes", async () => {
    const calls = mergeSplitCalls({ fetch: contractServer({ requireApproval: true, available: [{ ...OWN_A, availPcs: 1 }] }).fetch, renew });
    const values = applyPick(emptyMergeSplit("2026-11-27"), [OWN_A], "SPLIT");
    const error = await calls.create(toMergeSplitInput(values)).catch((caught: unknown) => caught);
    const outcome = mapMergeSplitError(error, values);
    expect(outcome.message).toBe("Row 1: 260001 changed, available now 1 pcs · 0.500 ct");
    expect(outcome).toMatchObject({ refetchPicker: true, fieldErrors: [{ name: "rows.0.pcs" }] });
    expect(outcome.refetch).toBeUndefined();
  });

  it("stale update → VERSION_CONFLICT message, edits kept", async () => {
    const calls = mergeSplitCalls({ fetch: contractServer({ requireApproval: true }).fetch, renew });
    const input = toMergeSplitInput(applyPick(emptyMergeSplit("2026-11-27"), [OWN_A], "SPLIT"));
    await calls.create(input);
    const error = await calls.update(MS_ID, { ...input, expectedVersion: 9 }).catch((caught: unknown) => caught);
    expect(mapMergeSplitError(error)).toMatchObject({ message: "Someone else changed this Merge/Split. Refresh to see the latest.", refetch: false });
  });
});

describe("error mapping (backend error-handling)", () => {
  const err = (status: number, code: string, details?: Record<string, unknown>) => new InventoryApiError(status, code, code, null, details ?? null);
  it("maps the contract codes to messages", () => {
    expect(mapMergeSplitError(err(409, "MERGE_SPLIT_IN_USE", { stockIds: ["270001"] }))).toMatchObject({ message: "A new stock is already used — cannot edit or delete.", refetch: true });
    expect(mapMergeSplitError(err(409, "MERGE_SPLIT_SOURCE_PENDING", { stockIds: ["260001"], docNos: ["MS2611004"] })).message).toBe("A picked stock is on another pending Merge/Split (MS2611004). Remove it and pick again.");
    expect(mapMergeSplitError(err(409, "MERGE_SPLIT_STATUS")).refetch).toBe(true);
    expect(mapMergeSplitError(err(422, "MERGE_SPLIT_CURRENCY_MIXED")).message).toBe("Stocks in different currencies can't be merged.");
    expect(mapMergeSplitError(err(422, "NUMBERING_NOT_CONFIGURED")).message).toContain("Document Setup");
    expect(mapMergeSplitError(err(403, "FORBIDDEN")).message).toBe("You don't have permission. Nothing was saved.");
    expect(mapMergeSplitError(err(503, "SERVICE_UNAVAILABLE")).message).toContain("can't be reached");
    const validation = mapMergeSplitError(err(400, "VALIDATION_FAILED", { fieldErrors: [{ path: "results.1.location", code: "required" }] }));
    expect(validation).toMatchObject({ message: "Row 2: Location — required", fieldErrors: [{ name: "rows.1.location", message: "Required" }] });
    const location = mapMergeSplitError(err(422, "LOCATION_INVALID", { fieldErrors: [{ path: "results.0.location", code: "inactive" }] }));
    expect(location).toMatchObject({ message: "Row 1: the location is no longer active.", fieldErrors: [{ name: "rows.0.location" }] });
  });

  it("read errors: not found, no VIEW, other", () => {
    expect(mergeSplitLoadError(err(404, "MERGE_SPLIT_NOT_FOUND"))).toBe(MS_NOT_FOUND);
    expect(mergeSplitLoadError(err(403, "PERMISSION_DENIED"))).toBe(MS_DENIED);
    expect(mergeSplitLoadError(err(500, "INTERNAL_ERROR"))).toBe("Couldn't load this Merge/Split. Try again.");
  });
});

describe("photos (Q-MS-11) and the Approve Center adapter (FE-MS-007)", () => {
  it("relinks ≤ 3 stocks at a time; a failed read starts without photos; upload checks type and size", async () => {
    let running = 0;
    let peak = 0;
    const read = async (id: string) => {
      running += 1;
      peak = Math.max(peak, running);
      await Promise.resolve();
      running -= 1;
      if (id === "bad") throw new Error("x");
      return { fileIds: [`p-${id}`] };
    };
    const { photos, failed } = await relinkStockPhotos(["a", "b", "bad", "c"], read);
    expect(peak).toBeLessThanOrEqual(3);
    expect([photos.get("a"), photos.get("c"), failed]).toEqual([["p-a"], ["p-c"], 1]);
    await expect(uploadMergeSplitPhoto(new File(["x"], "a.gif", { type: "image/gif" }))).rejects.toThrow("Use a JPEG or PNG photo.");
    const calls = mergeSplitCalls({ fetch: contractServer({ requireApproval: true }).fetch, renew });
    expect(await uploadMergeSplitPhoto(new File(["x"], "a.png", { type: "image/png" }), calls)).toBe("f-1");
  });

  it("preview lines are the new stocks; review reads the current version first", async () => {
    const preview = mergeSplitPreview(msOut());
    expect(preview).toMatchObject({ docNo: "MSGMS2611001", location: "Safe A, Shelf 1", totals: { grandTotal: "20000.00" } });
    expect(preview.lines.map((line) => [line.pcs, line.weightCt, line.amount])).toEqual([[2, "1.000", "10000.00"], [2, "1.000", "10000.00"]]);
    const log: unknown[] = [];
    const client = mergeSplitDocumentClient({
      get: async () => msOut(),
      approve: async (id, version) => { log.push(["approve", id, version]); return { id, version, status: "APPROVED" }; },
      reject: async (id, version) => ({ id, version }),
      requestRevision: async (id, version) => ({ id, version }),
    });
    await client.approve.mutate({ id: MS_ID, expectedVersion: 0 });
    expect(log).toEqual([["approve", MS_ID, 3]]);
  });
});
