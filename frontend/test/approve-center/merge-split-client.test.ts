import { describe, expect, it, vi } from "vitest";

/** Regression (2026-11-27): Approve Center wired Merge/Split to the Stock Adjustment client, so Approve hit the
 * stock-adjustment endpoint, got *_NOT_FOUND and toasted "MS-1 was deleted." The map must use the Merge/Split client. */
const calls = vi.hoisted(() => ({ ms: [] as unknown[], sa: [] as unknown[] }));
vi.mock("@/features/merge-split/api", () => ({
  mergeSplitApi: {
    get: async () => ({ version: 3 }),
    approve: async (id: string, version: number) => { calls.ms.push(["approve", id, version]); return { id, version, status: "APPROVED" }; },
    reject: async () => ({}), requestRevision: async () => ({}),
  },
}));
vi.mock("@/features/stock-adjustment/api", async (importOriginal) => {
  const actual = await importOriginal<Record<string, unknown>>();
  return {
    ...actual,
    stockAdjustmentApi: {
      get: async () => ({ version: 1 }),
      approve: async (id: string) => { calls.sa.push(["approve", id]); return { id }; },
      reject: async () => ({}), requestRevision: async () => ({}),
    },
  };
});

describe("Approve Center document clients", () => {
  it("routes Merge/Split approve to the merge-split API, not stock adjustment", async () => {
    const { documentClients } = await import("@/features/approve-center/api");
    const clients = documentClients({} as never);
    expect(clients.mergeSplit).not.toBe(clients.stockAdjustment);
    await clients.mergeSplit.approve.mutate({ id: "ms-1", expectedVersion: 0 } as never).catch(() => undefined);
    expect(calls.sa).toEqual([]);
    expect(calls.ms[0]).toEqual(["approve", "ms-1", 3]);
  });
});
