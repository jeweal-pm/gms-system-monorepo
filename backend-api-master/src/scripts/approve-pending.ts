import { HttpException, Logger } from "@nestjs/common";
import type { Tx } from "../common/persistence";
import { prisma } from "../database/prisma-client";
import { Prisma } from "../generated/prisma/client";
import { APPROVAL_DOC_TYPE_INFO, type ApprovalDocType } from "../approval-setting/approval-types";
import { PurchaseService } from "../purchase/purchase.service";
import { PurchaseOrderService } from "../purchase-order/purchase-order.service";
import { QuotationService } from "../quotation/quotation.service";
import { MemoOutReturnService } from "../trade-document/memo-out-return.service";
import { MemoOutService } from "../trade-document/memo-out.service";
import { MemoReceiveService } from "../trade-document/memo-receive.service";
import { MemoReturnService } from "../trade-document/memo-return.service";
import { ReserveService } from "../trade-document/reserve.service";

/**
 * Go-live command (approval-setup ADR-0050 D7, database-diagram "Go-live command", BE-AS-009). One-time, inside the
 * master container only (never reachable over HTTP):
 *
 *   node dist/scripts/approve-pending.js            # dry run (default): approves each document alone in its own
 *                                                    # short transaction that is rolled back at once
 *   GO_LIVE_ACTOR_ID=<id> node dist/scripts/approve-pending.js --apply
 *
 * Every live PENDING_APPROVAL document is approved through the normal approve path (`approveWithin` = the body of
 * `<doc>.approve`, stock effects included) in dependency order Memo Receive → Memo Return → Memo Out → Memo Out Return
 * → Reserve → Purchase Order → Purchase → Quotation, oldest `submitted_at` first, each in its own transaction.
 * Documents are approved **regardless of the current approval setting**: they were sent before go-live, and approve
 * itself never reads the setting. A document whose approval fails (e.g. `*_PENDING_SHORT`) is soft-deleted with the
 * same actor (ADR-0045; reason "not approvable at go-live" is in the output and log only — there is no reason column).
 * A concurrent change (`_CHANGED`, `_STATUS_INVALID`, `_DELETED`, `_NOT_FOUND`) is skipped, never deleted. An
 * infrastructure error stops the run with exit code 1; documents already processed stay committed and a rerun
 * continues (idempotent: a second run finds no pending documents).
 *
 * Dry run (INV-20261111-002 H2): every document is tried through the same approve in its own transaction (the bound of
 * a document write, 4 s) that is rolled back immediately, so production rows are locked for one document at a time and
 * never for the whole run. Consequence: each document is predicted against the **pre-run state**, not against the
 * stock the earlier documents of the run would have taken (unlike --apply). Documents that compete for the same stock
 * may each show WOULD_APPROVE while --apply approves the first and deletes a later one as short; the report says so.
 *
 * The actor id (`GO_LIVE_ACTOR_ID`, required for --apply) is written to approved_by / deleted_by / updated_by. The
 * master has no approved-by name column, so the "System" name exists only in this command's output.
 */

export const GO_LIVE_ORDER: readonly ApprovalDocType[] = ["memo-receive", "memo-return", "memo-out", "memo-out-return", "reserve", "purchase-order", "purchase", "quotation"];
export const DEFAULT_DRY_RUN_ACTOR = "system:go-live";
export const ACTOR_PATTERN = /^[A-Za-z0-9:_.@-]{1,64}$/;
const PAGE = 200;
/** Each real approve / delete, and each dry-run attempt (rolled back): same bound as a document write. */
const APPLY_TX = { timeout: 4_000, maxWait: 2_000 } as const;
const SKIP_SUFFIXES = ["_CHANGED", "_STATUS_INVALID", "_DELETED", "_NOT_FOUND"];

export type Approver = { approveWithin(tx: Tx, actorId: string, id: string, expectedVersion: number): Promise<unknown> };
export type Result = "APPROVED" | "DELETED" | "SKIPPED" | "WOULD_APPROVE" | "WOULD_DELETE";
export type Outcome = { type: ApprovalDocType; id: string; docNo: string; submittedAt: string | null; result: Result; code: string | null };
export type RunReport = { mode: "dry-run" | "apply"; actorId: string; outcomes: Outcome[]; aborted: { type: ApprovalDocType; docNo: string; message: string } | null };

type PendingDoc = { id: string; docNo: string; version: number; submittedAt: Date | null };
type Client = Tx | typeof prisma;

export function defaultApprovers(): Record<ApprovalDocType, Approver> {
  return {
    "memo-receive": new MemoReceiveService(),
    "memo-return": new MemoReturnService(),
    "memo-out": new MemoOutService(),
    "memo-out-return": new MemoOutReturnService(),
    reserve: new ReserveService(),
    "purchase-order": new PurchaseOrderService(),
    purchase: new PurchaseService(),
    quotation: new QuotationService(),
  };
}

const tableOf = (type: ApprovalDocType) => Prisma.raw(`"partner"."${APPROVAL_DOC_TYPE_INFO[type].table}"`);

/** The next page of live pending documents of `type`, oldest submitted first (keyset on the pending partial index). */
async function pendingPage(client: Client, type: ApprovalDocType, after: PendingDoc | null): Promise<PendingDoc[]> {
  const keyset = after
    ? Prisma.sql`AND (d."submitted_at", d."id") > (${after.submittedAt?.toISOString() ?? null}::timestamp(3), ${after.id}::uuid)`
    : Prisma.empty;
  return client.$queryRaw<PendingDoc[]>(Prisma.sql`
    SELECT d."id", d."doc_no" AS "docNo", d."version", d."submitted_at" AS "submittedAt"
    FROM ${tableOf(type)} d
    WHERE d."status" = 'PENDING_APPROVAL' AND d."deleted_at" IS NULL ${keyset}
    ORDER BY d."submitted_at" ASC, d."id" ASC
    LIMIT ${PAGE}`);
}

/** Soft delete of a still-pending document (ADR-0045 columns; `<t>_deleted_check` keeps PENDING_APPROVAL, G3). */
async function softDeletePending(client: Client, type: ApprovalDocType, doc: PendingDoc, actorId: string, now: Date): Promise<boolean> {
  const count = await client.$executeRaw(Prisma.sql`
    UPDATE ${tableOf(type)} SET "deleted_at" = ${now}, "deleted_by" = ${actorId}, "version" = "version" + 1, "updated_at" = ${now}, "updated_by" = ${actorId}
    WHERE "id" = ${doc.id}::uuid AND "version" = ${doc.version} AND "status" = 'PENDING_APPROVAL' AND "deleted_at" IS NULL`);
  return count === 1;
}

/** A domain refusal (4xx with a code) → its code; anything else (503, driver, bug) → null = stop the run. */
export function domainCodeOf(error: unknown): string | null {
  if (!(error instanceof HttpException) || error.getStatus() >= 500) return null;
  const body = error.getResponse() as { error?: { code?: unknown } };
  return typeof body?.error?.code === "string" ? body.error.code : null;
}

const isSkip = (code: string) => SKIP_SUFFIXES.some((suffix) => code.endsWith(suffix));

class Abort extends Error {
  constructor(readonly type: ApprovalDocType, readonly docNo: string, reason: unknown) {
    super(reason instanceof Error ? reason.message : String(reason));
  }
}
class DryRunRollback extends Error {}

/**
 * Runs the command. `apply: false` = dry run: each document's approve runs in its own transaction that is rolled back
 * right after (no lock outlives one document); every document is therefore checked against the pre-run state.
 */
export async function approvePending(options: { apply: boolean; actorId: string; approvers?: Record<ApprovalDocType, Approver>; client?: typeof prisma; log?: Logger }): Promise<RunReport> {
  const { apply, actorId } = options;
  if (!ACTOR_PATTERN.test(actorId)) throw new Error("GO_LIVE_ACTOR_ID must be 1–64 characters of letters, digits, : _ . @ -");
  const client = options.client ?? prisma;
  const approvers = options.approvers ?? defaultApprovers();
  const log = options.log ?? new Logger("GoLive");
  const outcomes: Outcome[] = [];
  const record = (type: ApprovalDocType, doc: PendingDoc, result: Result, code: string | null) => {
    outcomes.push({ type, id: doc.id, docNo: doc.docNo, submittedAt: doc.submittedAt?.toISOString() ?? null, result, code });
    log.log({ event: `go_live.${result.toLowerCase()}`, mode: apply ? "apply" : "dry-run", actorId, type, id: doc.id, docNo: doc.docNo, code });
  };

  const runType = async (type: ApprovalDocType, attempt: (doc: PendingDoc) => Promise<void>, reader: Client) => {
    let after: PendingDoc | null = null;
    for (;;) {
      const page = await pendingPage(reader, type, after);
      for (const doc of page) await attempt(doc);
      if (page.length < PAGE) return;
      after = page[page.length - 1];
    }
  };

  let aborted: RunReport["aborted"] = null;
  try {
    if (apply) {
      for (const type of GO_LIVE_ORDER) {
        await runType(type, async (doc) => {
          try {
            await client.$transaction((tx) => approvers[type].approveWithin(tx, actorId, doc.id, doc.version) as Promise<unknown>, APPLY_TX);
            record(type, doc, "APPROVED", null);
          } catch (error) {
            const code = domainCodeOf(error);
            if (code === null) throw new Abort(type, doc.docNo, error);
            if (isSkip(code)) return record(type, doc, "SKIPPED", code);
            let deleted: boolean;
            try {
              deleted = await client.$transaction((tx) => softDeletePending(tx, type, doc, actorId, new Date()), APPLY_TX);
            } catch (deleteError) {
              throw new Abort(type, doc.docNo, deleteError);
            }
            record(type, doc, deleted ? "DELETED" : "SKIPPED", deleted ? code : `${code}; changed before delete`);
          }
        }, client);
      }
    } else {
      for (const type of GO_LIVE_ORDER) {
        await runType(type, async (doc) => {
          try {
            await client.$transaction(async (tx) => {
              await approvers[type].approveWithin(tx, actorId, doc.id, doc.version);
              throw new DryRunRollback("dry run: rolled back");
            }, APPLY_TX);
          } catch (error) {
            if (error instanceof DryRunRollback) return record(type, doc, "WOULD_APPROVE", null);
            const code = domainCodeOf(error);
            if (code === null) throw new Abort(type, doc.docNo, error);
            record(type, doc, isSkip(code) ? "SKIPPED" : "WOULD_DELETE", code);
          }
        }, client);
      }
    }
  } catch (error) {
    if (error instanceof Abort) {
      aborted = { type: error.type, docNo: error.docNo, message: error.message.slice(0, 300) };
      log.error({ event: "go_live.aborted", mode: apply ? "apply" : "dry-run", actorId, type: error.type, docNo: error.docNo });
    } else {
      throw error;
    }
  }
  return { mode: apply ? "apply" : "dry-run", actorId, outcomes, aborted };
}

const LABEL: Record<ApprovalDocType, string> = {
  "memo-receive": "Memo Receive", "memo-return": "Memo Return", "memo-out": "Memo Out", "memo-out-return": "Memo Out Return",
  reserve: "Reserve", "purchase-order": "Purchase Order", purchase: "Purchase", quotation: "Quotation",
};

/** The final table (approved / deleted / skipped and the error code of each refused document). */
export function formatReport(report: RunReport): string {
  const header = ["#", "Type", "Doc No.", "Submitted", "Result", "Code"];
  const rows = report.outcomes.map((outcome, index) => [String(index + 1), LABEL[outcome.type], outcome.docNo, outcome.submittedAt ?? "-", outcome.result, outcome.code ?? "-"]);
  const widths = header.map((title, column) => Math.max(title.length, ...rows.map((row) => row[column].length)));
  const line = (cells: string[]) => cells.map((cell, column) => cell.padEnd(widths[column])).join(" | ");
  const count = (...results: Result[]) => report.outcomes.filter((outcome) => results.includes(outcome.result)).length;
  return [
    `Go-live approve-pending (${report.mode}), actor ${report.actorId} ("System")${report.mode === "dry-run" ? " - nothing was changed" : ""}`,
    line(header),
    widths.map((width) => "-".repeat(width)).join("-+-"),
    ...rows.map(line),
    rows.length === 0 ? "(no pending documents)" : "",
    report.mode === "dry-run" && rows.length > 0 ? "Note: each document was checked alone against the current stock; documents competing for the same stock may still be deleted by --apply." : "",
    `Total ${report.outcomes.length}: ${report.mode === "apply" ? `approved ${count("APPROVED")}, deleted ${count("DELETED")}` : `would approve ${count("WOULD_APPROVE")}, would delete ${count("WOULD_DELETE")}`}, skipped ${count("SKIPPED")}`,
    report.aborted ? `ABORTED at ${LABEL[report.aborted.type]} ${report.aborted.docNo}: ${report.aborted.message} (rerun after fixing; processed documents stay committed)` : "",
  ].filter((text) => text !== "").join("\n");
}

export async function main(argv: readonly string[], env: NodeJS.ProcessEnv): Promise<number> {
  const unknown = argv.filter((arg) => arg !== "--apply" && arg !== "--dry-run");
  if (unknown.length > 0 || (argv.includes("--apply") && argv.includes("--dry-run"))) {
    process.stderr.write("Usage: node dist/scripts/approve-pending.js [--dry-run | --apply]   (GO_LIVE_ACTOR_ID required for --apply)\n");
    return 2;
  }
  const apply = argv.includes("--apply");
  const actorId = env.GO_LIVE_ACTOR_ID?.trim() || (apply ? "" : DEFAULT_DRY_RUN_ACTOR);
  if (!ACTOR_PATTERN.test(actorId)) {
    process.stderr.write("GO_LIVE_ACTOR_ID must be set (1–64 characters of letters, digits, : _ . @ -) for --apply\n");
    return 2;
  }
  try {
    const report = await approvePending({ apply, actorId });
    process.stdout.write(`${formatReport(report)}\n`);
    return report.aborted ? 1 : 0;
  } finally {
    await prisma.$disconnect();
  }
}

if (typeof require !== "undefined" && require.main === module) {
  Logger.overrideLogger(["log", "warn", "error"]);
  main(process.argv.slice(2), process.env).then((code) => { process.exitCode = code; }, (error: unknown) => {
    process.stderr.write(`go-live command failed: ${error instanceof Error ? error.message : String(error)}\n`);
    process.exitCode = 1;
  });
}
