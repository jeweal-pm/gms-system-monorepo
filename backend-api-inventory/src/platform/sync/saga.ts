import { AppError } from "../errors";
import { Prisma, WRITE_TX, type Db, type Tx } from "../db";
import type { Logger } from "../logger";
import { MasterRefusal, MasterUnavailable, type CallOptions } from "../master-client";
import type { AllocationRequest, AllocationResponse, MasterApi } from "../master-api";

/**
 * Local saga of ADR-0052 D4 (architecture.md "Saga state machine"): an op row PREPARED → (master OK + tx1) DONE;
 * PREPARED → (business 409/422) REFUSED → (tx1' restores the intent) DONE. A retryable failure keeps PREPARED with
 * attempts + 1 and `next_attempt_at = now + min(2^attempts, 60) s`; after 10 attempts → STUCK (log
 * `inventory.sync_stuck`; operator command `sync:redrive`). Re-drive always sends the stored revision and payload; master
 * replays an applied revision. No HTTP call runs while a database transaction is open. A driver claims an op with a
 * 15 s lease (`next_attempt_at`), so two drivers never run one op at once.
 *
 * sale SA rev 1 / ADR-0054 D6 (BE-SL-004): the driver is generic over an op store (the table and owner column of one
 * document type, from the fixed map `OP_STORES`, never input) and a master port (put / recovery read / refusal
 * classifier). Constructed with four arguments it is exactly the Load to Stock driver of ADR-0052 (`master_sync_op`,
 * the load allocation call). `sweepAll` shares one ≤ 20-op budget between the stores (oldest due first).
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

/** Business refusals that end the Load to Stock saga with the previous state restored; anything else is not a refusal. */
export function isBusinessRefusal(error: unknown): error is MasterRefusal {
  return error instanceof MasterRefusal && ((error.status === 409 && error.code === "LOAD_ALLOCATION_EXCEEDS_REMAINING") || (error.status === 422 && error.code === "LOAD_ALLOCATION_LINE_UNAVAILABLE"));
}

/** Columns every op store has (the owner column differs per document type). */
export type BaseOp = { id: string; revision: number; kind: OpKind; state: string; payload: { actor: { id: string; name: string | null } }; attempts: number; created_by: string };
export type OpRow = BaseOp & { load_id: string; payload: OpPayload };
export type OpPayload = { allocation: AllocationRequest; actor: { id: string; name: string | null }; document?: unknown };
export type DriveOutcome<R> =
  | { outcome: "DONE"; result: R }
  | { outcome: "REFUSED"; error: AppError }
  | { outcome: "PENDING" }
  | { outcome: "BUSY" };

export type SyncHandlers<R, O extends BaseOp = OpRow, M = Pick<AllocationResponse, "stockIds">> = {
  /** tx1: master applied the revision; finish the local change. */
  apply(tx: Tx, op: O, response: M): Promise<R>;
  /** tx1': a definitive refusal; restore the previous state (a provisional create is deleted). */
  refuse(tx: Tx, op: O): Promise<void>;
  /** Maps a business refusal to the public error. */
  mapRefusal(op: O, refusal: MasterRefusal): Promise<AppError> | AppError;
  /** After commit (notifications). */
  afterCommit?(result: R): void;
};

/** Op tables per document type: identifiers are fixed here, never taken from input. */
export const OP_STORES = {
  "load-to-stock": { table: Prisma.raw(`"inventory"."master_sync_op"`), owner: Prisma.raw(`"load_id"`), ownerKey: "load_id", logKey: "loadId", event: "load_to_stock" },
  sale: { table: Prisma.raw(`"inventory"."sale_sync_op"`), owner: Prisma.raw(`"sale_id"`), ownerKey: "sale_id", logKey: "saleId", event: "sale" },
} as const;
export type OpStoreName = keyof typeof OP_STORES;

/** The master side of one document type's saga. */
export type MasterPort<O extends BaseOp, M> = {
  /** The idempotent PUT of the op's revision (never retried by the transport). */
  put(op: O, options: CallOptions): Promise<M>;
  /** Recovery read after a STALE answer: the applied response when master holds exactly this revision, else null. */
  recover(op: O, options: CallOptions): Promise<M | null>;
  /** Business refusals (409/422) that end the saga with the previous state restored. */
  isRefusal(error: unknown): error is MasterRefusal;
  /** Master's "another revision was applied" code. */
  staleCode: string;
  /** The compact result stored on the op row (ids and quantities only). */
  resultOf(response: M): unknown;
};

/** ADR-0052 D4 port: the load allocation (`PUT/GET /load-allocations/{loadId}`). */
export function loadToStockPort(master: MasterApi): MasterPort<OpRow, Pick<AllocationResponse, "stockIds">> {
  return {
    put: (op, options) => master.putAllocation(op.load_id, op.revision, op.payload.allocation, options),
    recover: async (op, options) => {
      const current = await master.getAllocation(op.load_id, options);
      return current.revision === op.revision ? { stockIds: current.stockIds } : null;
    },
    isRefusal: isBusinessRefusal,
    staleCode: "LOAD_ALLOCATION_STALE",
    resultOf: (response) => ({ stockIds: response.stockIds }),
  };
}

export class SyncDriver<R, O extends BaseOp = OpRow, M = Pick<AllocationResponse, "stockIds">> {
  private readonly store: (typeof OP_STORES)[OpStoreName];
  private readonly port: MasterPort<O, M>;

  constructor(
    private readonly db: Db,
    master: MasterApi,
    private readonly logger: Logger,
    private readonly handlers: SyncHandlers<R, O, M>,
    spec?: { store: OpStoreName; port: MasterPort<O, M> },
  ) {
    this.store = OP_STORES[spec?.store ?? "load-to-stock"];
    this.port = spec?.port ?? (loadToStockPort(master) as unknown as MasterPort<O, M>);
  }

  /** The owning document id of an op (load_id / sale_id). */
  ownerOf(op: O): string {
    return (op as unknown as Record<string, string>)[this.store.ownerKey];
  }

  private logIds(op: O) {
    return { opId: op.id, [this.store.logKey]: this.ownerOf(op) };
  }

  /** Claims a due op (lease expired) for this driver; null when another driver holds it or it is finished. */
  async claim(opId: string): Promise<O | null> {
    const rows = await this.db.$queryRaw<O[]>`
      UPDATE ${this.store.table} SET "next_attempt_at" = now() + make_interval(secs => ${LEASE_MS / 1000}), "updated_at" = now()
      WHERE "id" = ${opId}::uuid AND "state" IN ('PREPARED', 'CONFIRMED') AND "next_attempt_at" <= now()
      RETURNING "id", ${this.store.owner}, "revision", "kind", "state", "payload", "attempts", "created_by"`;
    return rows[0] ?? null;
  }

  /** Drives an op this caller owns (just created in its tx0, or claimed). */
  async drive(op: O, requestId?: string): Promise<DriveOutcome<R>> {
    let response: M;
    try {
      response = await this.port.put(op, { requestId, actorId: op.payload.actor.id });
    } catch (error) {
      if (this.port.isRefusal(error)) return this.refused(op, error);
      if (error instanceof MasterRefusal && error.code === this.port.staleCode) {
        const reconciled = await this.reconcile(op, requestId);
        if (!reconciled) return this.stuck(op, "stale");
        response = reconciled;
      } else if (error instanceof MasterRefusal) {
        this.logger.error({ event: "inventory.sync_invalid", ...this.logIds(op), code: error.code });
        return this.stuck(op, error.code);
      } else {
        return this.retryLater(op, error instanceof MasterUnavailable ? error.reason : error instanceof AppError ? error.code : "error");
      }
    }
    let result: R | null = null;
    try {
      await this.db.$transaction(async (tx) => {
        const done = await tx.$executeRaw`
          UPDATE ${this.store.table} SET "state" = 'DONE', "result" = ${JSON.stringify(this.port.resultOf(response))}::jsonb, "updated_at" = now()
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
    this.logger.info({ event: `${this.store.event}.applied`, ...this.logIds(op), revision: op.revision, kind: op.kind });
    this.handlers.afterCommit?.(result);
    return { outcome: "DONE", result };
  }

  /** Claim + drive (access re-drive, sweep, operator command). */
  async redrive(opId: string, requestId?: string): Promise<DriveOutcome<R>> {
    const op = await this.claim(opId);
    if (!op) return { outcome: "BUSY" };
    this.logger.info({ event: "inventory.sync_retry", ...this.logIds(op), revision: op.revision, attempts: op.attempts });
    return this.drive(op, requestId);
  }

  /** Due ops of this store (oldest first), at most `limit`. */
  async dueOps(limit = SWEEP_BATCH): Promise<{ id: string; next_attempt_at: Date }[]> {
    return this.db.$queryRaw<{ id: string; next_attempt_at: Date }[]>`
      SELECT "id", "next_attempt_at" FROM ${this.store.table} WHERE "state" IN ('PREPARED', 'CONFIRMED') AND "next_attempt_at" <= now()
      ORDER BY "next_attempt_at" LIMIT ${limit}`;
  }

  /** Bounded sweep of this store only: ≤ 20 due ops, sequential. */
  async sweep(limit = SWEEP_BATCH): Promise<number> {
    const due = await this.dueOps(limit);
    await this.redriveAll(due.map((row) => row.id));
    return due.length;
  }

  /** Sequential re-drive; one failing op never stops the others. */
  async redriveAll(ids: readonly string[]): Promise<void> {
    for (const id of ids) {
      try { await this.redrive(id); } catch (error) {
        this.logger.warn({ event: "inventory.sync_sweep_failed", opId: id, errorName: error instanceof Error ? error.name : "unknown" });
      }
    }
  }

  private async reconcile(op: O, requestId?: string): Promise<M | null> {
    this.logger.warn({ event: "inventory.sync_stale", ...this.logIds(op), revision: op.revision });
    try {
      return await this.port.recover(op, { requestId });
    } catch {
      return null;
    }
  }

  private async refused(op: O, refusal: MasterRefusal): Promise<DriveOutcome<R>> {
    const error = await this.handlers.mapRefusal(op, refusal);
    await this.db.$transaction(async (tx) => {
      const marked = await tx.$executeRaw`
        UPDATE ${this.store.table} SET "state" = 'DONE', "result" = ${JSON.stringify({ refused: refusal.code })}::jsonb, "updated_at" = now()
        WHERE "id" = ${op.id}::uuid AND "state" IN ('PREPARED', 'CONFIRMED')`;
      if (marked > 0) await this.handlers.refuse(tx, op);
    }, WRITE_TX);
    this.logger.warn({ event: `${this.store.event}.refused`, ...this.logIds(op), revision: op.revision, code: refusal.code });
    return { outcome: "REFUSED", error };
  }

  private async retryLater(op: O, reason: string): Promise<DriveOutcome<R>> {
    const next = afterFailure(op.attempts);
    await this.db.$executeRaw`
      UPDATE ${this.store.table} SET "attempts" = ${next.attempts}::smallint, "state" = ${next.state},
        "next_attempt_at" = now() + make_interval(secs => ${next.delaySeconds}), "last_error" = ${reason.slice(0, 64)}, "updated_at" = now()
      WHERE "id" = ${op.id}::uuid AND "state" IN ('PREPARED', 'CONFIRMED')`;
    if (next.state === "STUCK") this.logger.error({ event: "inventory.sync_stuck", ...this.logIds(op), revision: op.revision });
    else this.logger.warn({ event: "inventory.sync_retry_scheduled", ...this.logIds(op), attempts: next.attempts, reason });
    return { outcome: "PENDING" };
  }

  private async stuck(op: O, reason: string): Promise<DriveOutcome<R>> {
    await this.db.$executeRaw`
      UPDATE ${this.store.table} SET "state" = 'STUCK', "last_error" = ${reason.slice(0, 64)}, "updated_at" = now()
      WHERE "id" = ${op.id}::uuid AND "state" IN ('PREPARED', 'CONFIRMED')`;
    this.logger.error({ event: "inventory.sync_stuck", ...this.logIds(op), revision: op.revision, reason });
    return { outcome: "PENDING" };
  }

  /** Operator re-drive of a STUCK op of document `ownerId`: back to PREPARED with a fresh attempt budget, then one drive. */
  async unstick(ownerId: string): Promise<DriveOutcome<R> | null> {
    const rows = await this.db.$queryRaw<{ id: string }[]>`
      UPDATE ${this.store.table} SET "state" = 'PREPARED', "attempts" = 0, "next_attempt_at" = now(), "updated_at" = now()
      WHERE ${this.store.owner} = ${ownerId}::uuid AND "state" IN ('STUCK', 'PREPARED', 'CONFIRMED') RETURNING "id"`;
    if (rows.length === 0) return null;
    return this.redrive(rows[0].id);
  }
}

/** A driver as the shared sweep sees it. */
export type SweepDriver = { dueOps(limit?: number): Promise<{ id: string; next_attempt_at: Date }[]>; redriveAll(ids: readonly string[]): Promise<void> };

/**
 * ADR-0054 D6 / architecture.md "Saga generalisation": one sweep over every store within one ≤ 20-op budget, oldest
 * due first (one bounded query per store, then sequential re-drives).
 */
export async function sweepAll(drivers: readonly SweepDriver[], limit = SWEEP_BATCH): Promise<number> {
  const due = (await Promise.all(drivers.map(async (driver, index) => (await driver.dueOps(limit)).map((row) => ({ ...row, index })))))
    .flat()
    .sort((a, b) => new Date(a.next_attempt_at).getTime() - new Date(b.next_attempt_at).getTime())
    .slice(0, limit);
  for (const [index, driver] of drivers.entries()) {
    const ids = due.filter((row) => row.index === index).map((row) => row.id);
    if (ids.length > 0) await driver.redriveAll(ids);
  }
  return due.length;
}
