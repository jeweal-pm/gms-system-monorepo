import { createServer, type Server } from "node:http";
import type { AddressInfo } from "node:net";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createInventoryClient, InventoryRefusal, InventoryUnavailable, METADATA_TIMEOUT_MS } from "../../src/inventory-client/inventory-client";
import { metadataOf } from "../../src/trade-document/inventory-hold-saga";
import { BACKFILL_DELAY_MS, BACKFILL_PAGE, BACKFILL_TYPES } from "../../src/scripts/stock-card-backfill";

/** UT-SC-M01 (stock-card testing.md): the hold payload metadata, the PATCH client call and the backfill bounds. */
const CUSTOMER = "0193a000-0000-7000-8000-0000000000c1";

describe("UT-SC-M01 metadataOf (document date and customer of a hold)", () => {
  it("date and customer travel as docDate / party; a date comes out as YYYY-MM-DD", () => {
    expect(metadataOf({ doc_date: "2026-09-18", customer_id: CUSTOMER, customer_name_snapshot: " Khun Nida Jewelry " })).toEqual({ docDate: "2026-09-18", party: { id: CUSTOMER, name: "Khun Nida Jewelry" } });
    expect(metadataOf({ doc_date: "2026-09-18T00:00:00.000Z", customer_id: CUSTOMER, customer_name_snapshot: "N" })?.docDate).toBe("2026-09-18");
  });

  it("an empty or missing part is left out so inventory keeps its stored value; nothing at all gives no metadata", () => {
    expect(metadataOf({ doc_date: "2026-09-18", customer_id: CUSTOMER, customer_name_snapshot: "   " })).toEqual({ docDate: "2026-09-18" });
    expect(metadataOf({ doc_date: null, customer_id: CUSTOMER, customer_name_snapshot: "N" })).toEqual({ party: { id: CUSTOMER, name: "N" } });
    expect(metadataOf({ doc_date: null, customer_id: null, customer_name_snapshot: null })).toBeUndefined();
    expect(metadataOf(undefined)).toBeUndefined();
  });

  it("the customer name is cut to the 200 characters inventory accepts", () => {
    expect(metadataOf({ doc_date: null, customer_id: CUSTOMER, customer_name_snapshot: "x".repeat(300) })?.party?.name).toHaveLength(200);
  });
});

describe("UT-SC-M01 inventory client: hold metadata and PATCH", () => {
  let server: Server;
  let base: URL;
  const seen: { method: string; path: string; body: unknown; auth: string | undefined; actor: string | undefined }[] = [];
  beforeAll(async () => {
    server = createServer((req, res) => {
      const chunks: Buffer[] = [];
      req.on("data", (chunk: Buffer) => chunks.push(chunk));
      req.on("end", () => {
        const text = Buffer.concat(chunks).toString("utf8");
        seen.push({ method: req.method ?? "", path: req.url ?? "", body: text ? JSON.parse(text) : undefined, auth: req.headers.authorization, actor: req.headers["x-actor-user-id"] as string | undefined });
        if (req.url?.includes("/missing/")) { res.writeHead(404, { "content-type": "application/json" }).end(JSON.stringify({ error: { code: "NOT_FOUND" } })); return; }
        if (req.url?.includes("/slow/")) return; // never answers: the client's own timer ends the call
        if (req.method === "PATCH") { res.writeHead(200, { "content-type": "application/json" }).end(JSON.stringify({ updated: true })); return; }
        res.writeHead(200, { "content-type": "application/json" }).end(JSON.stringify({ revision: 1, replayed: false, holds: [], stocks: [] }));
      });
    });
    await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
    base = new URL(`http://127.0.0.1:${(server.address() as AddressInfo).port}`);
  });
  afterAll(() => new Promise<void>((resolve) => { server.closeAllConnections(); server.close(() => resolve()); }));
  const token = "t".repeat(43);

  it("putHolds sends docDate and party only when given (an older payload sends neither)", async () => {
    const client = createInventoryClient(base, token);
    await client.putHolds("memo-out", "d1", { revision: 1, documentNo: "MO1", holds: [], docDate: "2026-09-18", party: { id: CUSTOMER, name: "N" } });
    await client.putHolds("memo-out", "d2", { revision: 1, documentNo: "MO1", holds: [] });
    const [withMeta, without] = seen.slice(-2);
    expect(withMeta.body).toEqual({ revision: 1, documentNo: "MO1", holds: [], docDate: "2026-09-18", party: { id: CUSTOMER, name: "N" } });
    expect(Object.keys(without.body as object)).toEqual(["revision", "documentNo", "holds"]);
  });

  it("patchMetadata is a PATCH to …/stock-holds/{type}/{id}/metadata with the token and the actor; the body is the metadata", async () => {
    const client = createInventoryClient(base, token);
    await expect(client.patchMetadata("reserve", "d3", { docDate: "2026-09-19", party: { id: CUSTOMER, name: "N" } }, { actorId: "stock-card-backfill", requestId: "req-1" })).resolves.toBeUndefined();
    expect(seen.at(-1)).toMatchObject({ method: "PATCH", path: "/internal/v1/master/stock-holds/reserve/d3/metadata", auth: `Bearer ${token}`, actor: "stock-card-backfill", body: { docDate: "2026-09-19", party: { id: CUSTOMER, name: "N" } } });
  });

  it("a document inventory does not know is an InventoryRefusal 404; a hung call ends at the metadata timeout; disabled makes no call", async () => {
    const client = createInventoryClient(base, token);
    const refusal = await client.patchMetadata("memo-out", "missing", { docDate: "2026-09-19" }).catch((error: unknown) => error);
    expect(refusal).toBeInstanceOf(InventoryRefusal);
    expect(refusal).toMatchObject({ status: 404, code: "NOT_FOUND" });
    const started = Date.now();
    await expect(client.patchMetadata("memo-out", "slow", {})).rejects.toBeInstanceOf(InventoryUnavailable);
    expect(Date.now() - started).toBeLessThan(METADATA_TIMEOUT_MS + 800);
    expect(METADATA_TIMEOUT_MS).toBeLessThan(5_000);
    await expect(createInventoryClient(null, token).patchMetadata("memo-out", "x", {})).rejects.toMatchObject({ reason: "disabled" });
    await expect(createInventoryClient(base, null).patchMetadata("memo-out", "x", {})).rejects.toMatchObject({ reason: "token_missing" });
  });
});

describe("stock-card:backfill bounds", () => {
  it("covers Reserve, Memo Out and Memo Out Return in keyset pages of 200 at no more than 200 calls per minute", () => {
    expect([...BACKFILL_TYPES]).toEqual(["reserve", "memo-out", "memo-out-return"]);
    expect(BACKFILL_PAGE).toBe(200);
    expect(60_000 / BACKFILL_DELAY_MS).toBeLessThanOrEqual(200);
  });
});
