import { describe, expect, it, vi } from "vitest";
import type { Tx } from "../../src/common/persistence";
import type { Prisma } from "../../src/generated/prisma/client";
import { lockSourceHeaders } from "../../src/trade-document/source-lock";

/**
 * UT-AS-B15 (INV-20261111-002 F1): `lockSourceHeaders` maps the dependent's source lines to their headers, locks the
 * distinct headers FOR SHARE in id order with bound values only, and reports each header live (APPROVED, not deleted)
 * as read under the lock. The two-session behaviour is IT-AS-B15 on PostgreSQL.
 */

vi.mock("../../src/database/prisma-client", () => ({ prisma: {} }));

const L1 = "00000000-0000-4000-8000-0000000000a1";
const L2 = "00000000-0000-4000-8000-0000000000a2";
const L3 = "00000000-0000-4000-8000-0000000000a3";
const H1 = "00000000-0000-4000-8000-0000000000b1";
const H2 = "00000000-0000-4000-8000-0000000000b2";

function fakeTx(owners: { id: string; parent: string }[], headers: { id: string; live: boolean }[]) {
  const queries: Prisma.Sql[] = [];
  const tx = {
    $queryRaw: vi.fn(async (sql: Prisma.Sql) => {
      queries.push(sql);
      return sql.sql.includes("AS parent") ? owners : headers;
    }),
  };
  return { tx: tx as unknown as Tx, queries };
}

describe("lockSourceHeaders (UT-AS-B15)", () => {
  it("Memo Out: lines → distinct headers locked FOR SHARE in id order; live per header; bound values only", async () => {
    const { tx, queries } = fakeTx([{ id: L1, parent: H2 }, { id: L2, parent: H1 }, { id: L3, parent: H2 }], [{ id: H1, live: true }, { id: H2, live: false }]);
    const result = await lockSourceHeaders(tx, "memoOut", [L1, L2, L3, L1]);
    expect(queries).toHaveLength(2);
    expect(queries[0].sql).toMatch(/SELECT id::text AS id, "memo_out_id"::text AS parent FROM "partner"\."memo_out_line" WHERE id = ANY/);
    expect(queries[0].values).toEqual([[L1, L2, L3]]);
    expect(queries[1].sql).toMatch(/\(status = 'APPROVED' AND deleted_at IS NULL\) AS live FROM "partner"\."memo_out"\s+WHERE id = ANY\([^)]*\) ORDER BY id FOR SHARE/);
    expect(queries[1].values).toEqual([[H1, H2]]);
    expect(Object.fromEntries(result)).toEqual({ [L1]: { id: H2, live: false }, [L2]: { id: H1, live: true }, [L3]: { id: H2, live: false } });
    for (const sql of queries) for (const value of [L1, L2, H1, H2]) expect(sql.sql).not.toContain(value);
  });

  it("Purchase Order: uses the PO tables; no lines → no query; unknown lines → no header, no lock", async () => {
    const empty = fakeTx([], []);
    expect((await lockSourceHeaders(empty.tx, "purchaseOrder", [])).size).toBe(0);
    expect(empty.queries).toHaveLength(0);
    const missing = fakeTx([], []);
    expect((await lockSourceHeaders(missing.tx, "purchaseOrder", [L1])).size).toBe(0);
    expect(missing.queries).toHaveLength(1);
    expect(missing.queries[0].sql).toContain(`"purchase_order_id"::text AS parent FROM "partner"."purchase_order_line"`);
    const po = fakeTx([{ id: L1, parent: H1 }], [{ id: H1, live: true }]);
    expect(Object.fromEntries(await lockSourceHeaders(po.tx, "purchaseOrder", [L1]))).toEqual({ [L1]: { id: H1, live: true } });
    expect(po.queries[1].sql).toMatch(/FROM "partner"\."purchase_order"\s+WHERE id = ANY\([^)]*\) ORDER BY id FOR SHARE/);
  });
});
