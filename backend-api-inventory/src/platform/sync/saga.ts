import { AppError } from "../errors";
import { WRITE_TX, type Db, type Tx } from "../db";
import type { Logger } from "../logger";
import { MasterRefusal, MasterUnavailable } from "../master-client";
import type { AllocationRequest, AllocationResponse, MasterApi } from "../master-api";

/**
 * Local saga of ADR-0052 D4 (architecture.md "Saga state machine"): `master_sync_op` PREPARED → (master OK + tx1)
 * DONE; PREPARED → (business 409/422) REFUSED → (tx1' restores the intent) DONE. A retryable failure keeps PREPARED with
 * attempts + 1 and `next_attempt_at = now + min(2^attempts, 60) s`; after 10 attempts → STUCK (log
 * `inventory.sync_stuck`; operator command `sync:redrive`). Re-drive always sends the stored revision and payload; master
 * replays an applied revision. No HTTP call runs while a database transaction is open. A driver claims an op with a
 * 15 s lease (`next_attempt_at`), so two drivers never run one op at once.
 */
export const MAX_ATTEMPTS = 10;
export const LEASE_MS = 15_000;
export const SWEEP_BATCH = 20;
export type OpKind = "CREATE" | "APPLY_DRAFT" | "APPROVE" | "UPDATE" | "DELETE";

/**
 * Thrown by `apply` when the local change must not be made although master already applied the revision (INV-20261117-003
 * F2: stock of the load became used). tx1 rolls back; the op is parked STUCK (load stays SYNCING, so nothing else
 * changes it) with `last_error`, and the caller gets `error`. After the cause is gone, `sync:redrive` re-applies.
 */
export class SyncHold extends Error {
  constructor(readonly error: AppError, readonly reason: string) {
    super(reason);
    this.name = "SyncHold";
  }
}

export function backoffSeconds(attempts: number): number {
  return Math.min(2 ** Math.max(attempts, 0), 60);
}

/** Next state after a retryable failure. */
export function afterFailure(attempts: number): { attempts: number; state: "PREPARED" | "STUCK"; delaySeconds: number } {
  const next = attempts + 1;
  return { attempts: next, state: next >= MAX_ATTEMPTS ? "STUCK" : "PREPARED", delaySeconds: backoffSeconds(next) };
}

/** Business refusals that end the saga with the previous state restored; anything else is not a refusal. */
export function isBusinessRefusal(error: unknown): error is MasterRefusal {
  return error instanceof MasterRefusal && ((error.status === 409 && error.code === "LOAD_ALLOCATION_EXCEEDS_REMAINING") || (error.status === 422 && error.code === "LOAD_ALLOCATION_LINE_UNAVAILABLE"));
}

export type OpRow = { id: string; load_id: string; revision: number; kind: OpKind; state: string; payload: OpPayload; attempts: number; created_by: string };
export type OpPayload = { allocation: AllocationRequest; actor: { id: string; name: string | null }; document?: unknown };
export type DriveOutcome<R> =
  | { outcome: "DONE"; result: R }
  | { outcome: "REFUSED"; error: AppError }
  | { outcome: "PENDING" }
  | { outcome: "BUSY" };

export type SyncHandlers<R> = {
  /** tx1: master applied the revision; finish the local change. */
  apply(tx: Tx, op: OpRow, response: Pick<AllocationResponse, "stockIds">): Promise<R>;
  /** tx1': a definitive refusal; restore the previous state (a provisional create is deleted). */
  refuse(tx: Tx, op: OpRow): Promise<void>;
  /** Maps a business refusal to the public error. */
  mapRefusal(op: OpRow, refusal: MasterRefusal): Promise<AppError> | AppError;
  /** After commit (notifications). */
  afterCommit?(result: R): void;
};

export class SyncDriver<R> {
  constructor(private readonly db: Db, private readonly master: MasterApi, private readonly logger: Logger, private readonly handlers: SyncHandlers<R>) {}

  /** Claims a due op (lease expired) for this driver; null when another driver holds it or it is finished. */
  async claim(opId: string): Promise<OpRow | null> {
    const rows = await this.db.$queryRaw<OpRow[]>`
      UPDATE "inventory"."master_sync_op" SET "next_attempt_at" = now() + make_interval(secs => ${LEASE_MS / 1000}), "updated_at" = now()
      WHERE "id" = ${opId}::uuid AND "state" IN ('PREPARED', 'CONFIRMED') AND "next_attempt_at" <= now()
      RETURNING "id", "load_id", "revision", "kind", "state", "payload", "attempts", "created_by"`;
    return rows[0] ?? null;
  }

  /** Drives an op this caller owns (just created in its tx0, or claimed). */
  async drive(op: OpRow, requestId?: string): Promise<DriveOutcome<R>> {
    let response: Pick<AllocationResponse, "stockIds">;
    try {
      response = await this.master.putAllocation(op.load_id, op.revision, op.payload.allocation, { requestId, actorId: op.payload.actor.id });
    } catch (error) {
      if (isBusinessRefusal(error)) return this.refused(op, error);
      if (error instanceof MasterRefusal && error.code === "LOAD_ALLOCATION_STALE") {
        const reconciled = await this.reconcile(op, requestId);
        if (!reconciled) return this.stuck(op, "stale");
        response = reconciled;
      } else if (error instanceof MasterRefusal) {
        this.logger.error({ event: "inventory.sync_invalid", opId: op.id, loadId: op.load_id, code: error.code });
        return this.stuck(op, error.code);
      } else {
        return this.retryLater(op, error instanceof MasterUnavailable ? error.reason : error instanceof AppError ? error.code : "error");
      }
    }
    let result: R | null = null;
    try {
      await this.db.$transaction(async (tx) => {
        const done = await tx.$executeRaw`
          UPDATE "inventory"."master_sync_op" SET "state" = 'DONE', "result" = ${JSON.stringify({ stockIds: response.stockIds })}::jsonb, "updated_at" = now()
          WHERE "id" = ${op.id}::uuid AND "state" IN ('PREPARED', 'CONFIRMED')`;
        if (done === 0) return;
        result = await this.handlers.apply(tx, op, response);
      }, WRITE_TX);
    } catch (error) {
      if (!(error instanceof SyncHold)) throw error;
      await this.stuck(op, error.reason);
      return { outcome: "REFUSED", error: error.error };
    }
    if (result === null) return { outcome: "BUSY" };
    this.logger.info({ event: "load_to_stock.applied", opId: op.id, loadId: op.load_id, revision: op.revision, kind: op.kind, stockIdCount: response.stockIds.length });
    this.handlers.afterCommit?.(result);
    return { outcome: "DONE", result };
  }

  /** Claim + drive (access re-drive, sweep, operator command). */
  async redrive(opId: string, requestId?: string): Promise<DriveOutcome<R>> {
    const op = await this.claim(opId);
    if (!op) return { outcome: "BUSY" };
    this.logger.info({ event: "inventory.sync_retry", opId, loadId: op.load_id, revision: op.revision, attempts: op.attempts });
    return this.drive(op, requestId);
  }

  /** Bounded sweep: ≤ 20 due ops, sequential. */
  async sweep(limit = SWEEP_BATCH): Promise<number> {
    const due = await this.db.$queryRaw<{ id: string }[]>`
      SELECT "id" FROM "inventory"."master_sync_op" WHERE "state" IN ('PREPARED', 'CONFIRMED') AND "next_attempt_at" <= now()
      ORDER BY "next_attempt_at" LIMIT ${limit}`;
    for (const { id } of due) {
      try { await this.redrive(id); } catch (error) {
        this.logger.warn({ event: "inventory.sync_sweep_failed", opId: id, errorName: error instanceof Error ? error.name : "unknown" });
      }
    }
    return due.length;
  }

  private async reconcile(op: OpRow, requestId?: string): Promise<Pick<AllocationResponse, "stockIds"> | null> {
    this.logger.warn({ event: "inventory.sync_stale", opId: op.id, loadId: op.load_id, revision: op.revision });
    try {
      const current = await this.master.getAllocation(op.load_id, { requestId });
      return current.revision === op.revision ? { stockIds: current.stockIds } : null;
    } catch {
      return null;
    }
  }

  private async refused(op: OpRow, refusal: MasterRefusal): Promise<DriveOutcome<R>> {
    const error = await this.handlers.mapRefusal(op, refusal);
    await this.db.$transaction(async (tx) => {
      const marked = await tx.$executeRaw`
        UPDATE "inventory"."master_sync_op" SET "state" = 'DONE', "result" = ${JSON.stringify({ refused: refusal.code })}::jsonb, "updated_at" = now()
        WHERE "id" = ${op.id}::uuid AND "state" IN ('PREPARED', 'CONFIRMED')`;
      if (marked > 0) await this.handlers.refuse(tx, op);
    }, WRITE_TX);
    this.logger.warn({ event: "load_to_stock.refused", opId: op.id, loadId: op.load_id, revision: op.revision, code: refusal.code });
    return { outcome: "REFUSED", error };
  }

  private async retryLater(op: OpRow, reason: string): Promise<DriveOutcome<R>> {
    const next = afterFailure(op.attempts);
    await this.db.$executeRaw`
      UPDATE "inventory"."master_sync_op" SET "attempts" = ${next.attempts}::smallint, "state" = ${next.state},
        "next_attempt_at" = now() + make_interval(secs => ${next.delaySeconds}), "last_error" = ${reason.slice(0, 64)}, "updated_at" = now()
      WHERE "id" = ${op.id}::uuid AND "state" IN ('PREPARED', 'CONFIRMED')`;
    if (next.state === "STUCK") this.logger.error({ event: "inventory.sync_stuck", opId: op.id, loadId: op.load_id, revision: op.revision });
    else this.logger.warn({ event: "inventory.sync_retry_scheduled", opId: op.id, loadId: op.load_id, attempts: next.attempts, reason });
    return { outcome: "PENDING" };
  }

  private async stuck(op: OpRow, reason: string): Promise<DriveOutcome<R>> {
    await this.db.$executeRaw`
      UPDATE "inventory"."master_sync_op" SET "state" = 'STUCK', "last_error" = ${reason.slice(0, 64)}, "updated_at" = now()
      WHERE "id" = ${op.id}::uuid AND "state" IN ('PREPARED', 'CONFIRMED')`;
    this.logger.error({ event: "inventory.sync_stuck", opId: op.id, loadId: op.load_id, revision: op.revision, reason });
    return { outcome: "PENDING" };
  }

  /** Operator re-drive of a STUCK op: back to PREPARED with a fresh attempt budget, then one drive. */
  async unstick(loadId: string): Promise<DriveOutcome<R> | null> {
    const rows = await this.db.$queryRaw<{ id: string }[]>`
      UPDATE "inventory"."master_sync_op" SET "state" = 'PREPARED', "attempts" = 0, "next_attempt_at" = now(), "updated_at" = now()
      WHERE "load_id" = ${loadId}::uuid AND "state" IN ('STUCK', 'PREPARED', 'CONFIRMED') RETURNING "id"`;
    if (rows.length === 0) return null;
    return this.redrive(rows[0].id);
  }
}
