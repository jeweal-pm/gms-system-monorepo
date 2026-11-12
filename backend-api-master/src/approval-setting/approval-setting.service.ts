import { Injectable, Logger } from "@nestjs/common";
import { validationException } from "../common/errors";
import { WRITE_TX, type Tx } from "../common/persistence";
import { prisma } from "../database/prisma-client";
import { Prisma } from "../generated/prisma/client";
import { approvalSettingChanged, approvalSettingHasWaiting, mapApprovalSettingError } from "./approval-setting.errors";
import { WAITING_CAP, type ApprovalSettingItem, type ApprovalSettingUpdateInput, type ApprovalSettingUpdated } from "./approval-setting.schemas";
import { APPROVAL_DOC_TYPE_INFO, APPROVAL_DOC_TYPES, APPROVAL_TYPES, isApprovalDocType, type ApprovalDocType, type ApprovalType } from "./approval-types";

type Client = Tx | typeof prisma;
type SettingRow = { type: string; requireApproval: boolean; version: number; updatedAt: Date; updatedByName: string | null };
export type WaitingCounts = { pending: number; revision: number };
/** The acting user, from the master auth context only (never input). */
export type ApprovalSettingActor = { userId: string; userName: string | null };

/**
 * One statement, one row per type: capped counts of not-deleted PENDING_APPROVAL and REVISION_REQUESTED documents
 * (each `LIMIT 100` on the type's partial index `<t>_pending_idx` / `<t>_revision_idx`). Table names come only from
 * the fixed registry.
 */
function waitingSql(types: readonly ApprovalDocType[]): Prisma.Sql {
  return Prisma.join(types.map((type) => {
    const table = Prisma.raw(`"partner"."${APPROVAL_DOC_TYPE_INFO[type].table}"`);
    return Prisma.sql`SELECT ${type}::text AS "type",
      (SELECT count(*) FROM (SELECT 1 FROM ${table} WHERE "status" = 'PENDING_APPROVAL' AND "deleted_at" IS NULL LIMIT ${WAITING_CAP}) p)::int AS "pending",
      (SELECT count(*) FROM (SELECT 1 FROM ${table} WHERE "status" = 'REVISION_REQUESTED' AND "deleted_at" IS NULL LIMIT ${WAITING_CAP}) r)::int AS "revision"`;
  }), " UNION ALL ");
}

export async function waitingCounts(client: Client, types: readonly ApprovalDocType[]): Promise<Map<ApprovalDocType, WaitingCounts>> {
  const result = new Map<ApprovalDocType, WaitingCounts>();
  if (types.length === 0) return result;
  const rows = await client.$queryRaw<{ type: ApprovalDocType; pending: number; revision: number }[]>(waitingSql(types));
  for (const row of rows) result.set(row.type, { pending: Number(row.pending), revision: Number(row.revision) });
  return result;
}

function toUpdated(row: SettingRow): ApprovalSettingUpdated {
  return { type: row.type as ApprovalType, requireApproval: row.requireApproval, version: row.version, updatedAt: row.updatedAt.toISOString(), updatedByName: row.updatedByName };
}

/**
 * Approval settings (approval-setup SA rev 1 / ADR-0048): one "require approval" switch per type, stored in master so
 * the document Save transaction can read it under a lock. `update` locks the row FOR UPDATE and runs the waiting count
 * in the same transaction; every create / update / submit reads the row FOR SHARE first (`readForSave`), so a
 * concurrent Save either commits before the guard counts or waits for the switch to commit.
 */
@Injectable()
export class ApprovalSettingService {
  private readonly logger = new Logger(ApprovalSettingService.name);

  /** 11 items in sidebar order; `waiting` only when `withCounts` (caller holds approval-setup:VIEW). */
  async list(options: { withCounts: boolean }): Promise<{ items: ApprovalSettingItem[] }> {
    try {
      const rows = await prisma.approvalSetting.findMany({ select: { type: true, requireApproval: true, version: true, updatedAt: true, updatedByName: true } });
      const counts = options.withCounts ? await waitingCounts(prisma, APPROVAL_DOC_TYPES) : null;
      const byType = new Map(rows.map((row) => [row.type, row]));
      const items: ApprovalSettingItem[] = [];
      for (const type of APPROVAL_TYPES) {
        const row = byType.get(type);
        if (!row) {
          // Seeded by migration 20261110090000; a missing row is a data problem, not a request error.
          this.logger.warn({ event: "approval_setting.row_missing", type });
          continue;
        }
        const waiting = counts === null ? null : isApprovalDocType(type) ? waitingTotal(counts.get(type)) : 0;
        items.push({ ...toUpdated(row), available: isApprovalDocType(type), waiting });
      }
      return { items };
    } catch (error) {
      throw mapApprovalSettingError(error, "list");
    }
  }

  /**
   * Switch one type (ADR-0048 D4). Same value → no-op, the row is returned unchanged. Otherwise the row must still be
   * at `expectedVersion` (else APPROVAL_SETTING_CHANGED). Turning OFF is refused while the type has PENDING_APPROVAL or
   * REVISION_REQUESTED documents (APPROVAL_SETTING_HAS_WAITING {pending, revision}); drafts do not block. The three
   * future inventory types (`available = false`) are refused before any read: `VALIDATION_ERROR` at `type`
   * (`not_available`, "Not available yet", clarification G6; INV-20261111-002 item 1).
   */
  async update(actor: ApprovalSettingActor, input: ApprovalSettingUpdateInput): Promise<ApprovalSettingUpdated> {
    const docType = input.type;
    if (!isApprovalDocType(docType)) throw validationException([{ path: "type", code: "not_available" }]);
    try {
      const { row, changed } = await prisma.$transaction(async (tx) => {
        const [current] = await tx.$queryRaw<SettingRow[]>`
          SELECT "type", "require_approval" AS "requireApproval", "version", "updated_at" AS "updatedAt", "updated_by_name" AS "updatedByName"
          FROM "partner"."approval_setting" WHERE "type" = ${input.type} FOR UPDATE`;
        if (!current) throw approvalSettingChanged();
        if (current.requireApproval === input.requireApproval) return { row: current, changed: false };
        if (current.version !== input.expectedVersion) throw approvalSettingChanged();
        if (!input.requireApproval) {
          const waiting = (await waitingCounts(tx, [docType])).get(docType) ?? { pending: 0, revision: 0 };
          if (waiting.pending + waiting.revision > 0) throw approvalSettingHasWaiting(waiting);
        }
        const updated = await tx.approvalSetting.update({
          where: { type: input.type },
          data: { requireApproval: input.requireApproval, version: { increment: 1 }, updatedAt: new Date(), updatedBy: actor.userId, updatedByName: actor.userName },
          select: { type: true, requireApproval: true, version: true, updatedAt: true, updatedByName: true },
        });
        return { row: updated, changed: true };
      }, WRITE_TX);
      if (changed) this.logger.log({ event: "approval_setting.updated", actorId: actor.userId, type: row.type, requireApproval: row.requireApproval, version: row.version });
      return toUpdated(row);
    } catch (error) {
      throw mapApprovalSettingError(error, "update");
    }
  }

  /**
   * The committed setting of `type`, read FOR SHARE inside the caller's write transaction (lock order: setting row →
   * document header → memo_stock rows → purchase_order_line rows). A missing row reads as ON (approval required), so
   * a data problem never applies stock effects without an approval.
   */
  readForSave(tx: Tx, type: ApprovalDocType): Promise<boolean> {
    return readApprovalSetting(tx, type);
  }
}

const settingLogger = new Logger("ApprovalSetting");

/**
 * The committed "require approval" switch of `type`, read `FOR SHARE` inside a document write transaction (create /
 * update / submit / restore), always before the document header (lock order: setting → header → memo_stock →
 * purchase_order_line). A concurrent `approvalSetting.update` (FOR UPDATE) waits for this transaction, or this read
 * waits for it to commit. A missing row reads as ON, so a data problem never applies effects without an approval.
 */
export async function readApprovalSetting(tx: Tx, type: ApprovalDocType): Promise<boolean> {
  const [row] = await tx.$queryRaw<{ requireApproval: boolean }[]>`
    SELECT "require_approval" AS "requireApproval" FROM "partner"."approval_setting" WHERE "type" = ${type} FOR SHARE`;
  if (!row) {
    settingLogger.warn({ event: "approval_setting.row_missing", type, operation: "readForSave" });
    return true;
  }
  return row.requireApproval;
}

/** The current switch without a lock (document `get`: the page's `canSubmit` flag only; writes re-read it locked). */
export async function peekApprovalSetting(client: Client, type: ApprovalDocType): Promise<boolean> {
  const row = await client.approvalSetting.findUnique({ where: { type }, select: { requireApproval: true } });
  return row?.requireApproval ?? true;
}

function waitingTotal(counts: WaitingCounts | undefined): number {
  if (!counts) return 0;
  return Math.min(counts.pending + counts.revision, WAITING_CAP);
}
