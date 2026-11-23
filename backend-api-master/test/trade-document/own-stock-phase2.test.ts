import { createServer, type Server } from "node:http";
import type { AddressInfo } from "node:net";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { Prisma } from "../../src/generated/prisma/client";
import { createInventoryClient, inventoryBaseUrl, InventoryRefusal, InventoryUnavailable, setInventoryClient, type InventoryClient } from "../../src/inventory-client/inventory-client";
import { covered, holdsEqual, lineIndexOf, splitHolds, sumLines, toEntries, type HoldSet } from "../../src/trade-document/inventory-hold-saga";
import { completeOwnStockLines, storedOwnLines } from "../../src/trade-document/own-stock-lines";
import { createMemoOutSchema } from "../../src/trade-document/memo-schemas";
import { createQuotationSchema } from "../../src/quotation/quotation.schemas";

/**
 * load-to-stock SA rev 2 (ADR-0052 D16–D20) master units: UT-LS-P2-02 (acquire / release split),
 * the inventory client (timeouts, BUSY retry, auth / refusal mapping) and the own-stock line completion (kept rule).
 */
const D = (value: string | number) => new Prisma.Decimal(value);
const set = (entries: [string, number, string][]): HoldSet => new Map(entries.map(([stock, pcs, weight]) => [stock, { pcs, weight: D(weight) }]));
describe("UT-LS-P2-02 acquire / release split (D19)", () => {
  it("RESERVED / MEMO_OUT: up = acquire, down = release; H_mid = max per dimension", () => {
    const old = set([["A", 3, "3"], ["B", 2, "2"]]);
    const next = set([["A", 5, "2"], ["C", 1, "1"]]);
    const { mid, acquire, release } = splitHolds(true, old, next);
    expect(toEntries(mid)).toEqual([{ stockUuid: "A", pcs: 5, weightCt: "3.000" }, { stockUuid: "B", pcs: 2, weightCt: "2.000" }, { stockUuid: "C", pcs: 1, weightCt: "1.000" }]);
    expect([acquire, release]).toEqual([true, true]);
    expect(splitHolds(true, old, set([["A", 1, "1"]]))).toMatchObject({ acquire: false, release: true });
    expect(splitHolds(true, new Map(), next)).toMatchObject({ acquire: true, release: false });
  });
  it("MEMO_OUT_RETURN: down = acquire, up = release; H_mid = min", () => {
    const old = set([["A", 2, "2"]]);
    expect(splitHolds(false, old, set([["A", 3, "3"]]))).toMatchObject({ acquire: false, release: true });
    const shrink = splitHolds(false, old, set([["A", 1, "1"]]));
    expect(shrink).toMatchObject({ acquire: true, release: false });
    expect(toEntries(shrink.mid)).toEqual([{ stockUuid: "A", pcs: 1, weightCt: "1.000" }]);
    expect(splitHolds(false, old, new Map())).toMatchObject({ acquire: true, release: false });
  });
  it("covered: never more held than acquired (up kinds), never less returned (MOR); helpers", () => {
    expect(covered(true, set([["A", 2, "2"]]), set([["A", 3, "3"]]))).toBe(true);
    expect(covered(true, set([["A", 4, "2"]]), set([["A", 3, "3"]]))).toBe(false);
    expect(covered(false, set([["A", 1, "1"]]), set([["A", 2, "2"]]))).toBe(false);
    expect(holdsEqual(set([["A", 0, "0"]]), new Map())).toBe(true);
    expect(toEntries(sumLines([{ stock: "A", pcs: 1, weightCt: "0.5" }, { stock: "A", pcs: 2, weightCt: "1" }, { stock: null, pcs: 9, weightCt: "9" }]))).toEqual([{ stockUuid: "A", pcs: 3, weightCt: "1.500" }]);
    expect([...lineIndexOf(["A", null, "A", "B"])]).toEqual([["A", [0, 2]], ["B", [3]]]);
  });
});

describe("line schemas (D20)", () => {
  const base = { docDate: "2026-11-18", dueDate: "2026-11-30", currency: "THB", exchangeRate: null, ref: "", documentNote: "", discount: { type: "NONE", value: "0" }, tax: { enabled: false, rate: "7", includeInPrice: false }, serviceCharges: [], labor: null, customerId: "00000000-0000-4000-8000-000000000001", shippingAddressId: "00000000-0000-4000-8000-000000000002", invoiceAddressId: "00000000-0000-4000-8000-000000000003" };
  const ln = (patch: Record<string, unknown>) => ({ source: "MANUAL", stoneCodeId: null, stoneCode: "", stone: "", shape: "", size: "", color: "", clarity: "", cutting: "", quality: "", lot: "", location: "", cerType: "", cerNo: "", pcs: 1, weightCt: "1", priceUnit: "PER_CT", unitPrice: "1", discount: { type: "NONE", value: "0" }, itemNote: "", photoIds: [], ...patch });
  const U = "00000000-0000-4000-8000-0000000000aa";
  it("Memo Out / Reserve: exactly one of memoStockId / ownStockId, no duplicate", () => {
    expect(createMemoOutSchema.safeParse({ ...base, lines: [ln({ ownStockId: U })] }).success).toBe(true);
    expect(createMemoOutSchema.safeParse({ ...base, lines: [ln({ ownStockId: U, memoStockId: U })] }).success).toBe(false);
    expect(createMemoOutSchema.safeParse({ ...base, lines: [ln({})] }).success).toBe(false);
    expect(createMemoOutSchema.safeParse({ ...base, lines: [ln({ ownStockId: U }), ln({ ownStockId: U })] }).success).toBe(false);
    expect(createMemoOutSchema.safeParse({ ...base, lines: [ln({ ownStockId: U }), ln({ memoStockId: U })] }).success).toBe(true);
  });
  it("Quotation: OWN_STOCK needs ownStockId only", () => {
    expect(createQuotationSchema.safeParse({ ...base, lines: [ln({ source: "OWN_STOCK", ownStockId: U })] }).success).toBe(true);
    expect(createQuotationSchema.safeParse({ ...base, lines: [ln({ source: "OWN_STOCK" })] }).success).toBe(false);
    expect(createQuotationSchema.safeParse({ ...base, lines: [ln({ source: "OWN_STOCK", ownStockId: U, memoStockId: U })] }).success).toBe(false);
    expect(createQuotationSchema.safeParse({ ...base, lines: [ln({ source: "MANUAL", ownStockId: U })] }).success).toBe(false);
  });
});

describe("inventory client (D21/D22)", () => {
  let server: Server;
  let base: URL;
  const seen: { path: string; auth: string | undefined; actor: string | undefined }[] = [];
  let busyOnce = true;
  beforeAll(async () => {
    server = createServer((req, res) => {
      seen.push({ path: req.url ?? "", auth: req.headers.authorization, actor: req.headers["x-actor-user-id"] as string | undefined });
      req.resume();
      req.on("end", () => {
        if (req.url?.endsWith("/stock/lots/available")) {
          if (busyOnce) { busyOnce = false; res.writeHead(503, { "retry-after": "1", "content-type": "application/json" }).end(JSON.stringify({ error: { code: "INVENTORY_BUSY" } })); return; }
          res.writeHead(200, { "content-type": "application/json" }).end(JSON.stringify({ items: [] }));
        } else if (req.url?.includes("/stock-holds/")) {
          res.writeHead(409, { "content-type": "application/json" }).end(JSON.stringify({ error: { code: "STOCK_HOLD_STALE", details: { appliedRevision: 4 } } }));
        } else if (req.url?.endsWith("/stock/batch")) {
          setTimeout(() => res.writeHead(200).end("{}"), 6_000);
        } else {
          res.writeHead(401).end();
        }
      });
    });
    await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
    base = new URL(`http://127.0.0.1:${(server.address() as AddressInfo).port}`);
  });
  afterAll(() => new Promise<void>((resolve) => { server.closeAllConnections(); server.close(() => resolve()); }));
  const token = "t".repeat(43);

  it("bearer + actor headers; INVENTORY_BUSY retried once after 1 s; refusal carries code and details", async () => {
    const client = createInventoryClient(base, token);
    expect(await client.lotsAvailable({ limit: 2 }, { actorId: "u-1" })).toEqual([]);
    expect(seen.filter((call) => call.path.endsWith("/stock/lots/available"))).toHaveLength(2);
    expect(seen[0]).toMatchObject({ path: "/internal/v1/master/stock/lots/available", auth: `Bearer ${token}`, actor: "u-1" });
    const refusal = await client.putHolds("reserve", "x", { revision: 1, documentNo: null, holds: [] }).catch((error: unknown) => error);
    expect(refusal).toBeInstanceOf(InventoryRefusal);
    expect(refusal).toMatchObject({ status: 409, code: "STOCK_HOLD_STALE", details: { appliedRevision: 4 } });
  });
  it("5 s timeout → InventoryUnavailable; disabled (no URL) and missing token never call", async () => {
    const started = Date.now();
    await expect(createInventoryClient(base, token).batch(["a"])).rejects.toBeInstanceOf(InventoryUnavailable);
    expect(Date.now() - started).toBeLessThan(5_800);
    await expect(createInventoryClient(null, token).lotsAvailable({ limit: 1 })).rejects.toMatchObject({ reason: "disabled" });
    await expect(createInventoryClient(base, null).lotsAvailable({ limit: 1 })).rejects.toMatchObject({ reason: "token_missing" });
    expect(inventoryBaseUrl("http://u:p@x")).toBeNull();
    expect(inventoryBaseUrl("http://backend-api-inventory:3301")?.host).toBe("backend-api-inventory:3301");
  }, 10_000);
});

describe("own-stock line completion (D17 kept rule)", () => {
  const S = "00000000-0000-4000-8000-0000000000aa";
  const row = { stockUuid: S, stockId: "810001", status: "ACTIVE" as const, stoneCodeId: null, location: "Safe A", priceUnit: "PER_CT" as const, stoneCode: "SC", stone: "Ruby", shape: "", size: "", color: "", clarity: "", cutting: "", quality: "", lot: "L1", cerType: "", cerNo: "", pcs: 5, weightCt: "5.000", availablePcs: 3, availableWeightCt: "3.000", stockPrice: "1.00", salePrice: "2.00", currency: "THB", vendor: { id: "v", code: "V", name: "N" }, load: { id: "l", docNo: "LS", docDate: "2026-11-01" }, itemNote: "" };
  let batches = 0;
  const fake: InventoryClient = { batch: async () => { batches += 1; return [row]; }, putHolds: async () => { throw new Error("no"); }, lotsAvailable: async () => [], stockLots: async () => [] };
  beforeAll(() => setInventoryClient(fake));
  afterAll(() => setInventoryClient(null));
  const refInvalid = (fields: unknown) => Object.assign(new Error("ref"), { fields });

  it("copies the stock (lot, location, Stock ID, snapshot = available + held); exceeds → exceeds_pending with params", async () => {
    const done = await completeOwnStockLines([{ ownStockId: S, pcs: 4, weightCt: "1" }], { held: new Map([[S, { pcs: 1, weight: D(1) }]]), referenceInvalid: refInvalid });
    expect(done.lines[0]).toMatchObject({ stockId: "810001", lot: "L1", location: "Safe A", stoneCode: "SC", stockPendingPcs: 4, stockPendingWeightCt: "4.000" });
    await expect(completeOwnStockLines([{ ownStockId: S, pcs: 4, weightCt: "1" }], { referenceInvalid: refInvalid })).rejects.toMatchObject({ response: { error: { fieldErrors: [{ path: "lines.0.pcs", code: "exceeds_pending", params: { availablePcs: 3 } }] } } });
  });
  it("a kept line (same stock, not raised) uses its stored copy without a call; unknown → REFERENCE_INVALID", async () => {
    batches = 0;
    const stored = storedOwnLines([{ ownStockId: S, stoneCodeSnapshot: "SC", stone: "Ruby", shape: "", size: "", color: "", clarity: "", cutting: "", quality: "", lot: "OLD", location: "Safe A", cerType: "", cerNo: "", priceUnit: "PER_CT", stockId: "810001", stockPendingPcs: 9, stockPendingWeightCt: D(9), pcs: 5, weightCt: D(5) }]);
    const kept = await completeOwnStockLines([{ ownStockId: S, pcs: 5, weightCt: "5" }], { stored, referenceInvalid: refInvalid });
    expect(batches).toBe(0);
    expect(kept.lines[0]).toMatchObject({ lot: "OLD", stockPendingPcs: 9 });
    const other = "00000000-0000-4000-8000-0000000000bb";
    await expect(completeOwnStockLines([{ ownStockId: other, pcs: 1, weightCt: "1" }], { referenceInvalid: refInvalid })).rejects.toMatchObject({ fields: [{ path: "lines.0.ownStockId", code: "invalid_reference" }] });
  });
});
