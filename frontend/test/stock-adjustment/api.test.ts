import { describe, expect, it, vi } from "vitest";
import { adjustmentCalls, adjustmentKeys } from "@/features/stock-adjustment/api";
import { emptyAdjustment, lineFromStock } from "@/features/stock-adjustment/form";

const stock = {
  stockUuid: "b9b3adcf-0805-45ee-b578-54d0fd4ddfbb", stockId: "SA-RBLDVGVS1AAA", lotKey: "OS-stock", refDocNo: "LS2611-001",
  priceUnit: "PER_CT" as const, onHandPcs: 3, onHandWeightCt: "1.120", stockPrice: "12.50",
  attrs: { stoneCode: "SA-RBLDVGVS1AAA", stone: "Sapphire", shape: "Oval", size: "5.0 × 7.0 mm", color: "Blue", clarity: "VS1", cutting: "Good", quality: "A", lot: "L-2611-001", location: "Safe A", cerType: "", cerNo: "" },
};

function controlled(body: unknown, status = 200) {
  const calls: { url: string; init?: RequestInit }[] = [];
  const fetcher: typeof fetch = async (input, init) => {
    calls.push({ url: String(input), init });
    return new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
  };
  return { calls, fetcher };
}

describe("UT-SAJ-03 / IT-SAJ-02 stock-adjustment REST adapter", () => {
  it("sends same-origin picker filters with location and excluded stock ids", async () => {
    const server = controlled({ items: [], nextCursor: null });
    const calls = adjustmentCalls({ fetch: server.fetcher, renew: vi.fn() });
    await calls.stock("Safe A", " blue ", [stock.stockUuid]);
    expect(server.calls[0]?.url).toContain("/api/inventory/v1/stock-adjustment/stock?");
    expect(server.calls[0]?.url).toContain("location=Safe+A");
    expect(server.calls[0]?.url).toContain("q=blue");
    expect(server.calls[0]?.url).toContain(`exclude=${stock.stockUuid}`);
    expect(server.calls[0]?.init).toMatchObject({ credentials: "same-origin", cache: "no-store" });
  });
  it("POST create sends decimal strings, physical values and stock snapshot", async () => {
    const server = controlled({ id: stock.stockUuid, docNo: "SA2611001", version: 1, status: "APPROVED" }, 201);
    const calls = adjustmentCalls({ fetch: server.fetcher, renew: vi.fn() });
    const picked = lineFromStock(stock);
    await calls.create({ ...emptyAdjustment("2026-11-24"), location: "Safe A", lines: [{ ...picked, physicalPcs: "2", physicalWeightCt: "0.900" }] });
    const request = server.calls[0];
    expect(request?.url).toBe("/api/inventory/v1/stock-adjustment");
    expect(request?.init?.method).toBe("POST");
    expect(JSON.parse(String(request?.init?.body))).toMatchObject({ location: "Safe A", lines: [{ stockPcs: 3, stockWeightCt: "1.120", physicalPcs: 2, physicalWeightCt: "0.900", physicalPrice: "12.50" }] });
  });
  it("lists and uses stable cache-key prefixes for invalidation", async () => {
    const server = controlled({ items: [], nextCursor: null });
    await adjustmentCalls({ fetch: server.fetcher, renew: vi.fn() }).list();
    expect(server.calls[0]?.url).toContain("deleted=false");
    expect(adjustmentKeys.list).toEqual(expect.arrayContaining(["inventory", "stock-adjustment", "list"]));
  });
  it("uses expectedVersion on save, submit, approval review, delete and restore actions", async () => {
    const id = stock.stockUuid; const seen: { url: string; body: { expectedVersion?: unknown; note?: unknown; reason?: unknown } | null }[] = [];
    const fetcher: typeof fetch = async (input, init) => {
      seen.push({ url: String(input), body: init?.body ? JSON.parse(String(init.body)) : null });
      return new Response(JSON.stringify({ id, version: 2, docNo: "SA2611001", status: "DRAFT" }), { status: 200, headers: { "content-type": "application/json" } });
    };
    const calls = adjustmentCalls({ fetch: fetcher, renew: vi.fn() });
    const value = { ...emptyAdjustment("2026-11-24"), location: "Safe A", lines: [{ ...lineFromStock(stock), physicalPcs: "2", physicalWeightCt: "0.900" }] };
    await calls.update(id, 1, value); await calls.submit(id, 2); await calls.approve(id, 3); await calls.requestRevision(id, 4, "Count again"); await calls.reject(id, 5, "Wrong stock"); await calls.remove(id, 6); await calls.restore(id, 7);
    expect(seen.map((item) => item.url.replace("/api/inventory/v1", ""))).toEqual([
      `/stock-adjustment/${id}`, `/stock-adjustment/${id}/submit`, `/stock-adjustment/${id}/approve`, `/stock-adjustment/${id}/request-revision`, `/stock-adjustment/${id}/reject`, `/stock-adjustment/${id}/delete`, `/stock-adjustment/${id}/restore`,
    ]);
    expect(seen.map((item) => item.body?.expectedVersion)).toEqual([1, 2, 3, 4, 5, 6, 7]);
    expect(seen[3]?.body).toMatchObject({ note: "Count again" }); expect(seen[4]?.body).toMatchObject({ reason: "Wrong stock" });
  });
});
