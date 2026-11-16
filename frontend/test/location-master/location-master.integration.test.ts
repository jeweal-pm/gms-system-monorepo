import { createTRPCClient, httpBatchLink } from "@trpc/client";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { MasterRouter } from "@gem-crm/backend-api-master/src/master/router";
import { mapDeleteError, mapSaveError, toInput } from "@/features/location-master/api";
import { locationOptions } from "@/features/location-master/location-options";
import { mapPurchaseOrderError } from "@/features/purchase-order/api";
import { mapPurchaseSaveError } from "@/features/purchase/api";
import { createDomainTrpcFetch } from "@/lib/domain-trpc-fetch";

/**
 * IT-LM-01/02 (location-master UI rev 1, ADR-0052): the real tRPC link + CSRF fetch wrapper against a controlled
 * `/api/master/trpc` server → the page's mappers, and the PO / Purchase Location choices from `options.locations`.
 */
type Call = { path: string; method: string; input: unknown; csrf: string | null };
type Reply = { status?: number; body: unknown };

const ok = (data: unknown): Reply => ({ body: { result: { data } } });
const fail = (status: number, code: string, domainCode: string, fieldErrors?: unknown): Reply => ({
  status,
  body: { error: { message: domainCode, code: -32000, data: { code, httpStatus: status, domainCode, ...(fieldErrors ? { fieldErrors } : {}) } } },
});

function controlledServer(respond: (path: string, input: unknown) => Reply) {
  const calls: Call[] = [];
  const fetchStub = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = new URL(String(input), "http://localhost");
    const paths = url.pathname.replace("/api/master/trpc/", "").split(",");
    const method = init?.method ?? "GET";
    const inputs = (method === "GET" ? JSON.parse(url.searchParams.get("input") ?? "{}") : JSON.parse(String(init?.body ?? "{}"))) as Record<string, unknown>;
    const csrf = new Headers(init?.headers).get("x-gms-csrf");
    const results = paths.map((path, index) => {
      calls.push({ path, method, input: inputs[index], csrf });
      return respond(path, inputs[index]);
    });
    const status = results.find((result) => result.status)?.status ?? 200;
    return new Response(JSON.stringify(results.map((result) => result.body)), { status, headers: { "content-type": "application/json" } });
  });
  const client = createTRPCClient<MasterRouter>({ links: [httpBatchLink({ url: "/api/master/trpc", fetch: createDomainTrpcFetch(fetchStub as typeof fetch) })] });
  return { client, calls };
}

const ID = "00000000-0000-4000-8000-000000000001";
const ROW = { id: ID, name: "Safe A", active: true, createdAt: "2026-11-16T00:00:00.000Z", updatedAt: "2026-11-16T01:00:00.000Z" };

afterEach(() => vi.restoreAllMocks());

describe("IT-LM-01 Location Master through the real client", () => {
  it("lists, creates, maps a taken name to the Name field, and deletes with expectedUpdatedAt", async () => {
    const { client, calls } = controlledServer((path, input) => {
      if (path === "locationMaster.list") return ok({ items: [{ id: ID, name: "Safe A", active: true }], nextCursor: null, total: 1 });
      if (path === "locationMaster.create") return (input as { name: string }).name === "Safe A" ? fail(409, "CONFLICT", "LOCATION_NAME_TAKEN", [{ path: "name", code: "duplicate" }]) : ok({ ...ROW, name: "Shelf 1" });
      if (path === "locationMaster.delete") return ok({ id: ID });
      return fail(404, "NOT_FOUND", "NOT_FOUND");
    });

    const list = await client.locationMaster.list.query({ q: "safe", limit: 50 });
    expect(list).toMatchObject({ items: [{ name: "Safe A" }], total: 1 });
    expect(calls[0]).toMatchObject({ path: "locationMaster.list", method: "GET", input: { q: "safe", limit: 50 } });

    await client.locationMaster.create.mutate(toInput({ name: " Shelf 1 ", active: true }));
    expect(calls.at(-1)).toEqual({ path: "locationMaster.create", method: "POST", input: { name: "Shelf 1", active: true }, csrf: "1" });

    const taken = await client.locationMaster.create.mutate(toInput({ name: "Safe A", active: true })).catch((caught: unknown) => caught);
    expect(mapSaveError(taken)).toEqual({ fieldErrors: [{ name: "name", message: "This name is already used" }], formError: null });

    await client.locationMaster.delete.mutate({ id: ID, expectedUpdatedAt: ROW.updatedAt });
    expect(calls.at(-1)).toEqual({ path: "locationMaster.delete", method: "POST", input: { id: ID, expectedUpdatedAt: ROW.updatedAt }, csrf: "1" });
  });

  it("a changed or missing row on delete maps to the dialog / gone outcomes", async () => {
    const changed = controlledServer(() => fail(409, "CONFLICT", "LOCATION_CHANGED"));
    const stale = await changed.client.locationMaster.delete.mutate({ id: ID, expectedUpdatedAt: ROW.updatedAt }).catch((caught: unknown) => caught);
    expect(mapDeleteError(stale)).toMatchObject({ kind: "dialog", stale: true });
    const gone = controlledServer(() => fail(404, "NOT_FOUND", "LOCATION_NOT_FOUND"));
    const missing = await gone.client.locationMaster.delete.mutate({ id: ID, expectedUpdatedAt: ROW.updatedAt }).catch((caught: unknown) => caught);
    expect(mapDeleteError(missing)).toEqual({ kind: "gone", message: "This location was already deleted." });
  });
});

describe("IT-LM-02 PO / Purchase rows use the master names", () => {
  it("options.locations become the row choices; an unknown name from the server names the row", async () => {
    const { client } = controlledServer((path) => {
      if (path === "purchaseOrder.options" || path === "purchase.options") return ok({ locations: ["Safe", "Shelf 1"] });
      return fail(400, "BAD_REQUEST", "VALIDATION_ERROR", [{ path: "lines.0.location", code: "unknown_location" }]);
    });
    const poOptions = (await client.purchaseOrder.options.query({})) as { locations: string[] };
    expect(locationOptions(poOptions.locations).map((option) => option.value)).toEqual(["", "Safe", "Shelf 1"]);
    const purchaseOptions = (await client.purchase.options.query({})) as { locations: string[] };
    expect(locationOptions(purchaseOptions.locations).map((option) => option.label)).toEqual(["—", "Safe", "Shelf 1"]);

    const poError = await client.purchaseOrder.create.mutate({} as never).catch((caught: unknown) => caught);
    expect(mapPurchaseOrderError(poError).message).toBe("Row 1: choose a location from Location Master.");
    const purchaseError = await client.purchase.create.mutate({} as never).catch((caught: unknown) => caught);
    expect(mapPurchaseSaveError(purchaseError)).toMatchObject({ fieldErrors: [{ name: "lines.0.locationId" }], message: "Row 1: choose a location from Location Master." });
  });
});
