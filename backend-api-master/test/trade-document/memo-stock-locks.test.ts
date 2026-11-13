import { describe, expect, it, vi } from "vitest";
import type { Tx } from "../../src/common/persistence";
import { Prisma } from "../../src/generated/prisma/client";
import { releaseToMemoStock, takeFromMemoStock } from "../../src/trade-document/memo-stock.service";

/**
 * UT-LOCK-01/02 (INV-20261031-002): the Memo Stock take / release paths only change non-key columns, so they lock the
 * rows `FOR NO KEY UPDATE` in id order. That still queues concurrent approvals of the same item, but no longer conflicts
 * with the FK `KEY SHARE` that a concurrent line insert takes on `memo_stock` (the 40P01 cycle of the ticket).
 */
const A = "00000000-0000-4000-8000-00000000000a";
const B = "00000000-0000-4000-8000-00000000000b";
const D = (value: string) => new Prisma.Decimal(value);
const short = () => new Error("short");

function fakeTx(locked: Record<string, unknown>[]) {
  const raw: { sql: string; values: unknown[] }[] = [];
  const tx = {
    $queryRaw: vi.fn(async (query: { sql: string; values: unknown[] }) => { raw.push(query); return locked; }),
    $executeRaw: vi.fn(async (query: { sql: string; values: unknown[] }) => { raw.push(query); return locked.length; }),
  } as unknown as Tx;
  return { tx, raw };
}

describe("Memo Stock row locks (INV-20261031-002)", () => {
  const takes = [{ memoStockId: B, pcs: 1, weightCt: D("0.5"), index: 0 }, { memoStockId: A, pcs: 1, weightCt: D("0.5"), index: 1 }];

  it("UT-LOCK-01 takeFromMemoStock locks the items FOR NO KEY UPDATE in id order, then one UPDATE", async () => {
    const { tx, raw } = fakeTx([{ id: A, pending_pcs: 5, pending_weight_ct: "5" }, { id: B, pending_pcs: 5, pending_weight_ct: "5" }]);
    await takeFromMemoStock(tx, takes, "reserved", short, new Date("2026-11-13T00:00:00Z"));
    expect(raw[0].sql).toMatch(/FROM "partner"\."memo_stock"[\s\S]*ORDER BY id FOR NO KEY UPDATE$/);
    expect(raw[0].sql).not.toMatch(/FOR UPDATE/);
    expect(raw[1].sql).toContain(`UPDATE "partner"."memo_stock"`);
  });

  it("UT-LOCK-02 releaseToMemoStock uses the same FOR NO KEY UPDATE lock", async () => {
    const { tx, raw } = fakeTx([{ id: A, bucket_pcs: 5, bucket_weight_ct: "5" }, { id: B, bucket_pcs: 5, bucket_weight_ct: "5" }]);
    await releaseToMemoStock(tx, takes, short, new Date("2026-11-13T00:00:00Z"), "returned");
    expect(raw[0].sql).toMatch(/ORDER BY id FOR NO KEY UPDATE$/);
    expect(raw[0].sql).not.toMatch(/FOR UPDATE/);
  });
});
