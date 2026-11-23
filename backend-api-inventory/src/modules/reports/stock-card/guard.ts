import { AppError } from "../../../platform/errors";
import { Prisma, type Db, type Tx } from "../../../platform/db";

/**
 * Stock Card report limits (stock-card SA rev 1, ADR-0056 D8; architecture.md "Concurrency, timeouts, failure"):
 * at most 2 report queries in flight per process (the pool of 5 keeps three connections for document writes); a third waits
 * up to 250 ms, then 503 STOCK_CARD_BUSY (Retry-After 2). Every report statement runs under a 5 s `statement_timeout`
 * (503 STOCK_CARD_TIMEOUT) inside a READ ONLY transaction.
 */
export const REPORT_MAX_IN_FLIGHT = 2;
export const REPORT_WAIT_MS = 250;
export const REPORT_STATEMENT_TIMEOUT_MS = 5_000;
export const REPORT_RETRY_AFTER_SECONDS = 2;

type Waiter = { grant: () => void; timer: NodeJS.Timeout };

export class ReportGuard {
  private active = 0;
  private readonly waiters: Waiter[] = [];

  constructor(private readonly max: number = REPORT_MAX_IN_FLIGHT, private readonly waitMs: number = REPORT_WAIT_MS) {}

  get inFlight(): number { return this.active; }

  async run<T>(work: () => Promise<T>): Promise<T> {
    await this.acquire();
    try { return await work(); } finally { this.release(); }
  }

  private acquire(): Promise<void> {
    if (this.active < this.max) { this.active += 1; return Promise.resolve(); }
    return new Promise<void>((resolve, reject) => {
      const waiter: Waiter = {
        grant: resolve,
        timer: setTimeout(() => {
          this.waiters.splice(this.waiters.indexOf(waiter), 1);
          reject(new AppError(503, "STOCK_CARD_BUSY", { retryAfterSeconds: REPORT_RETRY_AFTER_SECONDS }, { "Retry-After": String(REPORT_RETRY_AFTER_SECONDS) }));
        }, this.waitMs),
      };
      this.waiters.push(waiter);
    });
  }

  /** The slot is handed to the next waiter directly, so `active` never exceeds `max`. */
  private release(): void {
    const next = this.waiters.shift();
    if (next) { clearTimeout(next.timer); next.grant(); } else this.active -= 1;
  }
}

/** SQLSTATE 57014 (query_canceled: statement_timeout) anywhere in a Prisma / driver error chain. */
export function isQueryCanceled(error: unknown, depth = 0): boolean {
  if (depth > 5 || typeof error !== "object" || error === null) return false;
  const record = error as Record<string, unknown>;
  if (record.code === "57014" || record.originalCode === "57014") return true;
  return ["cause", "meta", "driverAdapterError"].some((key) => isQueryCanceled(record[key], depth + 1));
}

export type ReportOptions ={ isolation?: "RepeatableRead"; statementTimeoutMs?: number };

/**
 * Runs `work` in a bounded read-only transaction under the concurrency guard. The SET (one `set_config` round trip) is the
 * first statement; a 57014 (query_canceled) becomes STOCK_CARD_TIMEOUT.
 */
export async function runReport<T>(db: Db, guard: ReportGuard, options: ReportOptions, work: (tx: Tx) => Promise<T>): Promise<T> {
  const timeoutMs = options.statementTimeoutMs ?? REPORT_STATEMENT_TIMEOUT_MS;
  return guard.run(async () => {
    try {
      return await db.$transaction(async (tx) => {
        await tx.$queryRaw`SELECT set_config('statement_timeout', ${String(timeoutMs)}, true), set_config('transaction_read_only', 'on', true)`;
        return work(tx);
      }, { timeout: timeoutMs + 3_000, maxWait: 2_000, ...(options.isolation === "RepeatableRead" ? { isolationLevel: Prisma.TransactionIsolationLevel.RepeatableRead } : {}) });
    } catch (error) {
      if (!(error instanceof AppError) && isQueryCanceled(error)) {
        throw new AppError(503, "STOCK_CARD_TIMEOUT", { limitSeconds: timeoutMs / 1000 });
      }
      throw error;
    }
  });
}
