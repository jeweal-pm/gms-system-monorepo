import { AppError } from "../../platform/errors";
import { Prisma, type Db, type Tx } from "../../platform/db";

/**
 * Shared report limits (stock-card SA rev 1 / ADR-0056 D8, extended by stock-value SA rev 1 / ADR-0057; architecture.md
 * "Concurrency, timeouts, failure"): at most 2 report queries in flight per process ACROSS every report module (the pool of 5
 * keeps three connections for document writes); a third waits up to 250 ms, then 503 `<report>_BUSY` (Retry-After 2). Every
 * report statement runs under a 5 s `statement_timeout` (503 `<report>_TIMEOUT`) inside a READ ONLY transaction. One
 * `ReportGuard` instance is created by the composition root and passed to every report module; the error codes belong to the
 * caller (`ReportCodes`), the limits do not.
 */
export const REPORT_MAX_IN_FLIGHT = 2;
export const REPORT_WAIT_MS = 250;
export const REPORT_STATEMENT_TIMEOUT_MS = 5_000;
export const REPORT_RETRY_AFTER_SECONDS = 2;

export type ReportCodes = { busy: string; timeout: string };
export const STOCK_CARD_CODES: ReportCodes = { busy: "STOCK_CARD_BUSY", timeout: "STOCK_CARD_TIMEOUT" };
export const STOCK_VALUE_CODES: ReportCodes = { busy: "STOCK_VALUE_BUSY", timeout: "STOCK_VALUE_TIMEOUT" };

type Waiter = { grant: () => void; timer: NodeJS.Timeout };

export class ReportGuard {
  private active = 0;
  private readonly waiters: Waiter[] = [];

  constructor(private readonly max: number = REPORT_MAX_IN_FLIGHT, private readonly waitMs: number = REPORT_WAIT_MS) {}

  get inFlight(): number { return this.active; }

  /** `busyCode` is the code of the report that is refused when the guard is full (default: Stock Card's). */
  async run<T>(work: () => Promise<T>, busyCode: string = STOCK_CARD_CODES.busy): Promise<T> {
    await this.acquire(busyCode);
    try { return await work(); } finally { this.release(); }
  }

  private acquire(busyCode: string): Promise<void> {
    if (this.active < this.max) { this.active += 1; return Promise.resolve(); }
    return new Promise<void>((resolve, reject) => {
      const waiter: Waiter = {
        grant: resolve,
        timer: setTimeout(() => {
          this.waiters.splice(this.waiters.indexOf(waiter), 1);
          reject(new AppError(503, busyCode, { retryAfterSeconds: REPORT_RETRY_AFTER_SECONDS }, { "Retry-After": String(REPORT_RETRY_AFTER_SECONDS) }));
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

export type ReportOptions = { isolation?: "RepeatableRead"; statementTimeoutMs?: number; codes?: ReportCodes };

/**
 * Runs `work` in a bounded read-only transaction under the concurrency guard. The SET (one `set_config` round trip) is the
 * first statement; a 57014 (query_canceled) becomes the report's timeout code.
 */
export async function runReport<T>(db: Db, guard: ReportGuard, options: ReportOptions, work: (tx: Tx) => Promise<T>): Promise<T> {
  const timeoutMs = options.statementTimeoutMs ?? REPORT_STATEMENT_TIMEOUT_MS;
  const codes = options.codes ?? STOCK_CARD_CODES;
  return guard.run(async () => {
    try {
      return await db.$transaction(async (tx) => {
        await tx.$queryRaw`SELECT set_config('statement_timeout', ${String(timeoutMs)}, true), set_config('transaction_read_only', 'on', true)`;
        return work(tx);
      }, { timeout: timeoutMs + 3_000, maxWait: 2_000, ...(options.isolation === "RepeatableRead" ? { isolationLevel: Prisma.TransactionIsolationLevel.RepeatableRead } : {}) });
    } catch (error) {
      if (!(error instanceof AppError) && isQueryCanceled(error)) {
        throw new AppError(503, codes.timeout, { limitSeconds: timeoutMs / 1000 });
      }
      throw error;
    }
  }, codes.busy);
}
