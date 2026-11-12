import { HttpException, HttpStatus } from "@nestjs/common";
import { describe, expect, it, vi } from "vitest";
import { partnerException } from "../../src/common/errors";
import { ACTOR_PATTERN, approvePending, domainCodeOf, formatReport, GO_LIVE_ORDER, main, type RunReport } from "../../src/scripts/approve-pending";

/** Go-live command units (approval-setup ADR-0050 D7, BE-AS-009): order, error classes, arguments, the final table. */

describe("approve-pending go-live command", () => {
  it("dependency order Memo Receive → Memo Return → Memo Out → Memo Out Return → Reserve → Purchase Order → Purchase → Quotation", () => {
    expect(GO_LIVE_ORDER).toEqual(["memo-receive", "memo-return", "memo-out", "memo-out-return", "reserve", "purchase-order", "purchase", "quotation"]);
  });

  it("domain refusals carry their code; 503 / driver / bugs stop the run (null)", () => {
    expect(domainCodeOf(partnerException("RESERVE_PENDING_SHORT", HttpStatus.CONFLICT))).toBe("RESERVE_PENDING_SHORT");
    expect(domainCodeOf(partnerException("PURCHASE_REFERENCE_INVALID", HttpStatus.UNPROCESSABLE_ENTITY))).toBe("PURCHASE_REFERENCE_INVALID");
    expect(domainCodeOf(partnerException("PARTNER_UNAVAILABLE", HttpStatus.SERVICE_UNAVAILABLE))).toBeNull();
    expect(domainCodeOf(new HttpException("plain", 409))).toBeNull();
    expect(domainCodeOf(new Error("connection reset"))).toBeNull();
  });

  it("actor id: 1–64 safe characters; --apply requires GO_LIVE_ACTOR_ID; unknown arguments are refused (exit 2, no database use)", async () => {
    expect(ACTOR_PATTERN.test("system:go-live")).toBe(true);
    expect(ACTOR_PATTERN.test("user_01HXYZ.abc@x")).toBe(true);
    expect(ACTOR_PATTERN.test("")).toBe(false);
    expect(ACTOR_PATTERN.test("x".repeat(65))).toBe(false);
    expect(ACTOR_PATTERN.test("a b")).toBe(false);
    const stderr = vi.spyOn(process.stderr, "write").mockImplementation(() => true);
    await expect(main(["--apply"], {})).resolves.toBe(2);
    await expect(main(["--apply"], { GO_LIVE_ACTOR_ID: "bad actor" })).resolves.toBe(2);
    await expect(main(["--force"], {})).resolves.toBe(2);
    await expect(main(["--apply", "--dry-run"], { GO_LIVE_ACTOR_ID: "system" })).resolves.toBe(2);
    stderr.mockRestore();
    await expect(approvePending({ apply: true, actorId: "a b" })).rejects.toThrow(/GO_LIVE_ACTOR_ID/);
  });

  it("final table: one row per document with result and code, totals per mode, abort line", () => {
    const report: RunReport = {
      mode: "apply", actorId: "system:go-live", aborted: null, outcomes: [
        { type: "memo-receive", id: "1", docNo: "MR2611001", submittedAt: "2026-11-01T01:00:00.000Z", result: "APPROVED", code: null },
        { type: "reserve", id: "2", docNo: "RS2611004", submittedAt: "2026-11-02T01:00:00.000Z", result: "DELETED", code: "RESERVE_PENDING_SHORT" },
        { type: "purchase", id: "3", docNo: "PU2611002", submittedAt: null, result: "SKIPPED", code: "PURCHASE_CHANGED" },
      ],
    };
    const text = formatReport(report);
    expect(text).toContain(`Go-live approve-pending (apply), actor system:go-live ("System")`);
    expect(text).toMatch(/1 \| Memo Receive \| MR2611001 \| 2026-11-01T01:00:00.000Z \| APPROVED +\| -/);
    expect(text).toMatch(/2 \| Reserve +\| RS2611004 \| 2026-11-02T01:00:00.000Z \| DELETED +\| RESERVE_PENDING_SHORT/);
    expect(text).toContain("Total 3: approved 1, deleted 1, skipped 1");
    const dry = formatReport({ mode: "dry-run", actorId: "system:go-live", outcomes: [], aborted: { type: "purchase", docNo: "PU1", message: "down" } });
    expect(dry).toContain("nothing was changed");
    expect(dry).toContain("(no pending documents)");
    expect(dry).toContain("Total 0: would approve 0, would delete 0, skipped 0");
    expect(dry).toContain("ABORTED at Purchase PU1: down");
    expect(dry).not.toContain("checked alone");
    const dryRows = formatReport({ mode: "dry-run", actorId: "system:go-live", aborted: null, outcomes: [report.outcomes[0]] });
    expect(dryRows).toContain("Note: each document was checked alone against the current stock");
  });

  it("UT-AS-B12b dry run (INV-20261111-002 H2): one short rolled-back transaction per document (4 s bound), never one for the whole run; refusals and aborts as before", async () => {
    const docs = [
      { id: "a", docNo: "MR1", version: 2, submittedAt: new Date("2026-11-01T00:00:00Z") },
      { id: "b", docNo: "MR2", version: 2, submittedAt: new Date("2026-11-02T00:00:00Z") },
    ];
    const events: string[] = [];
    let open = 0;
    const tx = { marker: "tx" };
    const client = {
      $queryRaw: vi.fn(async (query: { sql: string }) => {
        events.push(`read open=${open}`);
        return query.sql.includes(`"partner"."memo_receive"`) ? docs : [];
      }),
      $transaction: vi.fn(async (fn: (inner: typeof tx) => Promise<unknown>, options: unknown) => {
        events.push(`begin ${JSON.stringify(options)}`);
        open += 1;
        try {
          return await fn(tx);
        } finally {
          open -= 1;
          events.push("end");
        }
      }),
    };
    const approve = vi.fn(async (_tx: unknown, _actor: string, id: string) => {
      if (id === "b") throw partnerException("MEMO_RECEIVE_PENDING_SHORT", HttpStatus.CONFLICT);
      return {};
    });
    const approvers = Object.fromEntries(GO_LIVE_ORDER.map((type) => [type, { approveWithin: approve }])) as never;
    const report = await approvePending({ apply: false, actorId: "system:go-live", approvers, client: client as never, log: { log: vi.fn(), error: vi.fn() } as never });
    expect(report.outcomes.map((outcome) => [outcome.docNo, outcome.result, outcome.code])).toEqual([["MR1", "WOULD_APPROVE", null], ["MR2", "WOULD_DELETE", "MEMO_RECEIVE_PENDING_SHORT"]]);
    // Each document: its own transaction with the document-write bound; pages are read outside any transaction.
    expect(client.$transaction).toHaveBeenCalledTimes(2);
    expect(client.$transaction.mock.calls.every(([, options]) => JSON.stringify(options) === JSON.stringify({ timeout: 4_000, maxWait: 2_000 }))).toBe(true);
    expect(events.filter((event) => event.startsWith("read")).every((event) => event === "read open=0")).toBe(true);
    expect(approve.mock.calls.map(([inner]) => inner)).toEqual([tx, tx]);
    // An infrastructure error stops the run.
    approve.mockImplementationOnce(async () => { throw new Error("connection lost"); });
    const aborted = await approvePending({ apply: false, actorId: "system:go-live", approvers, client: client as never, log: { log: vi.fn(), error: vi.fn() } as never });
    expect(aborted.aborted).toMatchObject({ type: "memo-receive", docNo: "MR1", message: "connection lost" });
  });
});
