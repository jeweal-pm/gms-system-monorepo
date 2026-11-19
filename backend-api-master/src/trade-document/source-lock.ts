import type { Tx } from "../common/persistence";
import { Prisma } from "../generated/prisma/client";

/**
 * Source documents a dependent document applies effects against (INV-20261111-002 F1): Memo Out Return → Memo Out,
 * Purchase → Purchase Order. Fixed identifiers only, never input.
 */
const SOURCES = {
  memoOut: { header: Prisma.raw(`"partner"."memo_out"`), lines: Prisma.raw(`"partner"."memo_out_line"`), parent: Prisma.raw(`"memo_out_id"`), syncing: Prisma.raw(`(sync_state = 'SYNCING')`) },
  purchaseOrder: { header: Prisma.raw(`"partner"."purchase_order"`), lines: Prisma.raw(`"partner"."purchase_order_line"`), parent: Prisma.raw(`"purchase_order_id"`), syncing: Prisma.raw(`false`) },
} as const;
export type SourceKind = keyof typeof SOURCES;

/**
 * A locked source header: live = APPROVED and not soft-deleted; syncing = a Memo Out whose own-stock holds are being
 * updated in inventory (ADR-0052 SA-LS-P2-06: a Memo Out Return of it is refused with MEMO_OUT_RETURN_BUSY).
 */
export type SourceHeader = { id: string; live: boolean; syncing: boolean };

/**
 * Locks the source headers of `lineIds` `FOR SHARE`, in id order, and returns line id → header (state read under the
 * lock, i.e. the committed state after any concurrent writer). The source's own update / soft delete / edit takes the
 * header first through its guarded version bump (`FOR NO KEY UPDATE`), so the two serialize: the dependent either
 * waits and then sees the source deleted, or the source waits and its `usedBy` then sees the dependent.
 *
 * Lock order (approval-setup architecture, "Lock order"): setting → dependent header → source header(s) (this,
 * FOR SHARE, id order) → memo_out_line → memo_stock → purchase_order_line. Callers take it before any line insert or
 * line/stock lock of the dependent, so a source writer holding its header never waits for the dependent.
 * ≤ 2 bounded primary-key statements (≤ the document's line count).
 */
export async function lockSourceHeaders(tx: Tx, kind: SourceKind, lineIds: readonly string[]): Promise<Map<string, SourceHeader>> {
  const result = new Map<string, SourceHeader>();
  const ids = [...new Set(lineIds)];
  if (ids.length === 0) return result;
  const source = SOURCES[kind];
  const owners = await tx.$queryRaw<{ id: string; parent: string }[]>(Prisma.sql`
    SELECT id::text AS id, ${source.parent}::text AS parent FROM ${source.lines} WHERE id = ANY(${ids}::uuid[])`);
  const parents = [...new Set(owners.map((row) => row.parent))].sort();
  if (parents.length === 0) return result;
  const headers = await tx.$queryRaw<{ id: string; live: boolean; syncing: boolean }[]>(Prisma.sql`
    SELECT id::text AS id, (status = 'APPROVED' AND deleted_at IS NULL) AS live, ${source.syncing} AS syncing FROM ${source.header}
    WHERE id = ANY(${parents}::uuid[]) ORDER BY id FOR SHARE`);
  const byId = new Map(headers.map((row) => [row.id, { id: row.id, live: row.live === true, syncing: row.syncing === true }]));
  for (const owner of owners) {
    const header = byId.get(owner.parent);
    if (header) result.set(owner.id, header);
  }
  return result;
}
