import { describe, expect, it, vi } from "vitest";
import { INVENTORY_NUMBERING_KEYS, numberingResolveSchema, stockIdIssuePutSchema, stockIdIssueTypeSchema } from "../../src/inventory-internal/inventory-internal.schemas";
import { issueForDocument } from "../../src/inventory-internal/stock-id-issue";

/** stock-transfer-location ADR-0060 D6/D10 (BE-STL-002): allow-lists, body schema and the replay / stale rules of the issue. */
describe("UT-STL-M01 numbering key and issue schema", () => {
  it("allows the stock-transfer-location numbering key", () => {
    expect(INVENTORY_NUMBERING_KEYS).toContain("stock-transfer-location");
    expect(numberingResolveSchema.safeParse({ transactionKey: "stock-transfer-location", docDate: "2026-11-24", markUsed: false }).success).toBe(true);
  });
  it("issue body: revision ≥ 1, count 1–200, strict; only the transfer document type", () => {
    expect(stockIdIssuePutSchema.safeParse({ revision: 1, count: 200 }).success).toBe(true);
    for (const body of [{ revision: 0, count: 1 }, { revision: 1, count: 0 }, { revision: 1, count: 201 }, { revision: 1, count: 1, extra: 1 }]) expect(stockIdIssuePutSchema.safeParse(body).success).toBe(false);
    expect(stockIdIssueTypeSchema.safeParse("stock-transfer-location").success).toBe(true);
    expect(stockIdIssueTypeSchema.safeParse("load-to-stock").success).toBe(false);
  });
});

describe("UT-STL-M02 issueForDocument replay rules (no DB)", () => {
  const tx = (newest: { revision: number; stock_ids: string[] } | null) => {
    const queryRaw = vi.fn(async () => (newest ? [newest] : []));
    return { $queryRaw: vi.fn(async (sql: { strings?: string[]; sql?: string }) => (String((sql as { sql?: string }).sql ?? "").includes("stock_id_issue") ? queryRaw() : [])), $executeRaw: vi.fn(async () => 1) } as never;
  };
  it("same revision, same or fewer ids → replayed, no new issue", async () => {
    const client = tx({ revision: 3, stock_ids: ["810001", "810002"] });
    expect(await issueForDocument(client, "stock-transfer-location", "0192a1b2-0000-7000-8000-000000000001", { revision: 3, count: 2 }, null, () => new Date())).toEqual({ revision: 3, stockIds: ["810001", "810002"], replayed: true });
    expect(await issueForDocument(client, "stock-transfer-location", "0192a1b2-0000-7000-8000-000000000001", { revision: 3, count: 1 }, null, () => new Date())).toEqual({ revision: 3, stockIds: ["810001"], replayed: true });
  });
  it("a lower revision → 409 STOCK_ID_ISSUE_STALE", async () => {
    await expect(issueForDocument(tx({ revision: 3, stock_ids: ["810001"] }), "stock-transfer-location", "0192a1b2-0000-7000-8000-000000000001", { revision: 2, count: 1 }, null, () => new Date()))
      .rejects.toMatchObject({ status: 409, response: { error: { code: "STOCK_ID_ISSUE_STALE", details: { appliedRevision: 3 } } } });
  });
});

/** merge-split SA-MS-07 / SA-MS-13 (BE-MS-002): the Merge/Split numbering key and Stock ID issue type reuse the same allow-lists. */
describe("UT-MS-M01 merge-split numbering key and issue type", () => {
  it("allows the merge-split numbering key (Document Setup code MS)", () => {
    expect(INVENTORY_NUMBERING_KEYS).toContain("merge-split");
    expect(numberingResolveSchema.safeParse({ transactionKey: "merge-split", docDate: "2026-11-27", markUsed: true }).success).toBe(true);
  });
  it("accepts merge-split as a Stock ID issue document type; other inventory types stay refused", () => {
    expect(stockIdIssueTypeSchema.safeParse("merge-split").success).toBe(true);
    expect(stockIdIssueTypeSchema.safeParse("stock-adjustment").success).toBe(false);
  });
  it("replays the same apply sequence of a merge-split document", async () => {
    const client = { $queryRaw: vi.fn(async (sql: { sql?: string }) => (String(sql.sql ?? "").includes("stock_id_issue") ? [{ revision: 1, stock_ids: ["900001", "900002"] }] : [])), $executeRaw: vi.fn(async () => 1) } as never;
    expect(await issueForDocument(client, "merge-split", "0192a1b2-0000-7000-8000-0000000000aa", { revision: 1, count: 2 }, null, () => new Date())).toEqual({ revision: 1, stockIds: ["900001", "900002"], replayed: true });
  });
});
