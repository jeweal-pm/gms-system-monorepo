import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  memoOutstandingCustomerFiltersSchema,
  memoOutstandingCustomerListSchema,
  memoOutstandingFiltersSchema,
  memoOutstandingListSchema,
  purchaseOutstandingListSchema,
} from "../../src/trade-document/memo-outstanding.schemas";
import { MemoOutstandingService, REPORT_STATEMENT_TIMEOUT_MS } from "../../src/trade-document/memo-outstanding.service";

/**
 * UT-MOS-01…04 (INV-20261029-004) with Prisma mocked: the three outstanding reports prune settled documents with an
 * `EXISTS` open predicate before `GROUP BY` (no `HAVING bool_or`), read the list total from `count(*) OVER ()` in the
 * page statement, and run inside one READ_TX with `SET LOCAL statement_timeout`. Results and contracts are covered
 * unchanged by IT-MOV / IT-MOC / IT-POS against PostgreSQL.
 */

const db = vi.hoisted(() => ({ settings: [] as string[], queries: [] as string[], results: [] as unknown[][], transactions: 0 }));

vi.mock("../../src/database/prisma-client", () => {
  const tx = {
    $executeRawUnsafe: vi.fn(async (sql: string) => { db.settings.push(sql); return 0; }),
    $queryRaw: vi.fn(async (query: { sql: string }) => { db.queries.push(query.sql.replace(/\s+/g, " ")); return db.results.shift() ?? []; }),
  };
  return {
    prisma: {
      $transaction: vi.fn(async (run: (client: typeof tx) => Promise<unknown>) => { db.transactions += 1; return run(tx); }),
      $queryRaw: vi.fn(async () => { throw new Error("report statements must run inside reportRead"); }),
    },
  };
});

const docRow = (total: number) => ({
  id: "00000000-0000-4000-8000-000000000001", doc_no: "MR-1", doc_date: new Date("2026-11-01T00:00:00Z"), due_date: new Date("2026-11-30T00:00:00Z"), due_in_days: 17,
  vendor_id: "v", vendor_code_snapshot: "V1", vendor_name_snapshot: "Vendor", customer_id: "c", customer_code_snapshot: "C1", customer_name_snapshot: "Customer",
  currency_code: "THB", memo_pcs: 1, memo_wt: "1", return_pcs: 0, return_wt: "0", sold_pcs: 0, sold_wt: "0", reserve_pcs: 0, reserve_wt: "0",
  outstanding_pcs: 1, outstanding_wt: "1", purchase_pcs: 0, purchase_wt: "0", sale_pcs: 0, sale_wt: "0", balance_pcs: 1, balance_wt: "1", open_value: "10", total,
});

describe("Outstanding reports prune before grouping (INV-20261029-004)", () => {
  const service = new MemoOutstandingService();
  service.clock = () => new Date("2026-11-13T03:00:00Z");

  beforeEach(() => {
    db.settings = [];
    db.queries = [];
    db.results = [];
    db.transactions = 0;
  });

  it("UT-MOS-01 vendor list: one READ_TX with the statement timeout, EXISTS before GROUP BY, total from count(*) OVER ()", async () => {
    db.results = [[docRow(37)]];
    const page = await service.vendorList(memoOutstandingListSchema.parse({ page: 1, pageSize: 10 }));
    expect(page).toMatchObject({ total: 37, page: 1, pageSize: 10, items: [{ docNo: "MR-1", openValue: "10.00" }] });
    expect(db.transactions).toBe(1);
    expect(db.settings).toEqual([`SET LOCAL statement_timeout = ${REPORT_STATEMENT_TIMEOUT_MS}`]);
    expect(db.queries).toHaveLength(1);
    const [sql] = db.queries;
    expect(sql).toMatch(/AND EXISTS \(SELECT 1 FROM "partner"\."memo_stock" o WHERE o\.memo_receive_id = r\.id AND \(o\.pending_pcs > 0 OR o\.pending_weight_ct > 0 OR o\.reserved_pcs > 0 OR o\.reserved_weight_ct > 0\)\) GROUP BY r\.id\)/);
    expect(sql).not.toMatch(/HAVING|bool_or/);
    expect(sql).toContain("count(*) OVER ()::bigint AS total");
  });

  it("UT-MOS-02 a page past the end runs the pruned count once; an empty first page needs no count", async () => {
    db.results = [[], [{ total: 12 }]];
    expect(await service.vendorList(memoOutstandingListSchema.parse({ page: 3, pageSize: 10 }))).toMatchObject({ items: [], total: 12, page: 3 });
    expect(db.queries).toHaveLength(2);
    expect(db.queries[1]).toMatch(/SELECT count\(\*\)::bigint AS total FROM docs$/);
    expect(db.queries[1]).toContain("AND EXISTS (SELECT 1 FROM \"partner\".\"memo_stock\" o");
    db.queries = [];
    db.results = [[]];
    expect(await service.vendorList(memoOutstandingListSchema.parse({ page: 1, pageSize: 10 }))).toMatchObject({ items: [], total: 0 });
    expect(db.queries).toHaveLength(1);
  });

  it("UT-MOS-03 customer and purchase lists prune with their own open predicates and count in the page statement", async () => {
    db.results = [[docRow(4)]];
    expect((await service.customerList(memoOutstandingCustomerListSchema.parse({ page: 1, pageSize: 10 }))).total).toBe(4);
    expect(db.queries[0]).toMatch(/AND EXISTS \(SELECT 1 FROM "partner"\."memo_out_line" x WHERE x\.memo_out_id = o\.id AND x\.memo_stock_id IS NOT NULL AND \(x\.returned_pcs < x\.pcs OR x\.returned_weight_ct < x\.weight_ct\)\) GROUP BY o\.id\)/);
    db.results = [[docRow(5)]];
    expect((await service.purchaseList(purchaseOutstandingListSchema.parse({ page: 1, pageSize: 10 }))).total).toBe(5);
    expect(db.queries[1]).toMatch(/AND EXISTS \(SELECT 1 FROM "partner"\."memo_stock" o WHERE o\.memo_receive_id = r\.id AND \(\(o\.received_pcs - o\.returned_pcs - o\.purchased_pcs\) > 0 OR \(o\.received_weight_ct - o\.returned_weight_ct - o\.purchased_weight_ct\) > 0\)\) GROUP BY r\.id\)/);
    for (const sql of db.queries) {
      expect(sql).not.toMatch(/HAVING|bool_or/);
      expect(sql).toContain("count(*) OVER ()::bigint AS total");
    }
    expect(db.settings).toHaveLength(2);
  });

  it("UT-MOS-04 the three summaries prune the same way, one statement each under the timeout", async () => {
    const summary = { documents: 1, overdue: 0, due_in_7_days: 0, grand_total: "10", company_currency: "THB" };
    db.results = [[summary], [summary], [summary]];
    await service.vendorSummary(memoOutstandingFiltersSchema.parse({}));
    await service.customerSummary(memoOutstandingCustomerFiltersSchema.parse({}));
    await service.purchaseSummary(memoOutstandingFiltersSchema.parse({}));
    expect(db.transactions).toBe(3);
    expect(db.settings).toHaveLength(3);
    expect(db.queries).toHaveLength(3);
    expect(db.queries[0]).toContain(`FROM "partner"."memo_stock" o WHERE o.memo_receive_id = r.id AND (o.pending_pcs > 0`);
    expect(db.queries[1]).toContain(`FROM "partner"."memo_out_line" x WHERE x.memo_out_id = o.id`);
    expect(db.queries[2]).toContain(`(o.received_pcs - o.returned_pcs - o.purchased_pcs) > 0`);
    for (const sql of db.queries) expect(sql).not.toMatch(/HAVING|bool_or/);
  });
});
