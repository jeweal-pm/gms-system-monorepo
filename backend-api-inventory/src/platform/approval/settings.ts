import { z } from "zod";
import { AppError } from "../errors";
import { WRITE_TX, type Db, type Tx } from "../db";
import { hasGrant, type Principal } from "../auth/principal";

/**
 * Inventory approval switches (ADR-0052 D8, Q-LS-25 default; ADR-0050 D4/D5 semantics as master): every create /
 * update / submit reads the row FOR SHARE in its own transaction; `update` locks it FOR UPDATE and refuses OFF while
 * documents wait. `load-to-stock`, `sale` (ADR-0054 D7), and `stock-adjustment` (ADR-0059) have documents; merge-split
 * and stock-transfer-location count 0.
 */
export const INVENTORY_APPROVAL_TYPES = ["load-to-stock", "merge-split", "stock-transfer-location", "sale", "stock-adjustment"] as const;
export type InventoryApprovalType = (typeof INVENTORY_APPROVAL_TYPES)[number];

export const approvalTypeSchema = z.enum(INVENTORY_APPROVAL_TYPES);
export const settingUpdateSchema = z.object({ requireApproval: z.boolean(), expectedVersion: z.number().int().min(1) }).strict();

type Row = { type: string; require_approval: boolean; version: number };
export type Waiting = { pending: number; revision: number };

/** Waiting documents of a type (pending / sent back, not deleted), each count capped at 100. Two index-only counts. */
export async function waitingCounts(client: Db | Tx, type: InventoryApprovalType): Promise<Waiting> {
  if (type === "sale") {
    // sale_pending_idx / sale_revision_idx (index-only partial counts, capped at 100).
    const [sale] = await client.$queryRaw<Waiting[]>`
      SELECT (SELECT count(*) FROM (SELECT 1 FROM "inventory"."sale" WHERE "status" = 'PENDING_APPROVAL' AND "deleted_at" IS NULL LIMIT 100) p)::int AS "pending",
             (SELECT count(*) FROM (SELECT 1 FROM "inventory"."sale" WHERE "status" = 'REVISION_REQUESTED' AND "deleted_at" IS NULL LIMIT 100) r)::int AS "revision"`;
    return { pending: Number(sale.pending), revision: Number(sale.revision) };
  }
  if (type === "stock-adjustment") {
    const [adjustment] = await client.$queryRaw<Waiting[]>`
      SELECT (SELECT count(*) FROM (SELECT 1 FROM "inventory"."stock_adjustment" WHERE "status" = 'PENDING_APPROVAL' AND "deleted_at" IS NULL LIMIT 100) p)::int AS "pending",
             (SELECT count(*) FROM (SELECT 1 FROM "inventory"."stock_adjustment" WHERE "status" = 'REVISION_REQUESTED' AND "deleted_at" IS NULL LIMIT 100) r)::int AS "revision"`;
    return { pending: Number(adjustment.pending), revision: Number(adjustment.revision) };
  }
  if (type !== "load-to-stock") return { pending: 0, revision: 0 };
  const [row] = await client.$queryRaw<Waiting[]>`
    SELECT (SELECT count(*) FROM (SELECT 1 FROM "inventory"."load_to_stock" WHERE "status" = 'PENDING_APPROVAL' AND "deleted_at" IS NULL LIMIT 100) p)::int AS "pending",
           (SELECT count(*) FROM (SELECT 1 FROM "inventory"."load_to_stock" WHERE "status" = 'REVISION_REQUESTED' AND "deleted_at" IS NULL LIMIT 100) r)::int AS "revision"`;
  return { pending: Number(row.pending), revision: Number(row.revision) };
}

/** FOR SHARE read inside a document transaction; a missing row reads as ON (approval required). */
export async function readSettingForShare(tx: Tx, type: InventoryApprovalType): Promise<boolean> {
  const rows = await tx.$queryRaw<{ require_approval: boolean }[]>`SELECT "require_approval" FROM "inventory"."approval_setting" WHERE "type" = ${type} FOR SHARE`;
  return rows[0]?.require_approval ?? true;
}

export async function listSettings(db: Db, principal: Principal) {
  const rows = await db.$queryRaw<Row[]>`SELECT "type", "require_approval", "version" FROM "inventory"."approval_setting"`;
  const withCounts = hasGrant(principal, "approval-setup", "VIEW");
  const byType = new Map(rows.map((row) => [row.type, row]));
  const items = [];
  for (const type of INVENTORY_APPROVAL_TYPES) {
    const row = byType.get(type);
    if (!row) continue;
    items.push({
      type, requireApproval: row.require_approval, version: row.version,
      ...(withCounts ? { waitingCount: await waitingCounts(db, type) } : {}),
    });
  }
  return { items };
}

export async function updateSetting(db: Db, principal: Principal, type: InventoryApprovalType, input: z.output<typeof settingUpdateSchema>) {
  return db.$transaction(async (tx) => {
    const [current] = await tx.$queryRaw<Row[]>`SELECT "type", "require_approval", "version" FROM "inventory"."approval_setting" WHERE "type" = ${type} FOR UPDATE`;
    if (!current) throw new AppError(409, "APPROVAL_SETTING_CHANGED");
    if (current.require_approval === input.requireApproval) return { type, requireApproval: current.require_approval, version: current.version };
    if (current.version !== input.expectedVersion) throw new AppError(409, "APPROVAL_SETTING_CHANGED", { currentVersion: current.version });
    if (!input.requireApproval) {
      const waiting = await waitingCounts(tx, type);
      if (waiting.pending + waiting.revision > 0) throw new AppError(409, "APPROVAL_SETTING_HAS_WAITING", waiting);
    }
    const [updated] = await tx.$queryRaw<Row[]>`
      UPDATE "inventory"."approval_setting"
      SET "require_approval" = ${input.requireApproval}, "version" = "version" + 1, "updated_at" = now(), "updated_by" = ${principal.userId}, "updated_by_name" = ${principal.displayName}
      WHERE "type" = ${type}
      RETURNING "type", "require_approval", "version"`;
    return { type, requireApproval: updated.require_approval, version: updated.version };
  }, WRITE_TX);
}
