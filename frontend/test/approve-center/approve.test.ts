import { TRPCClientError } from "@trpc/client";
import { describe, expect, it } from "vitest";
import { approveMenuFor, type AvailableMenu } from "@/features/approve-center/menus";
import { approveConfirm, approveFailure, bulkConfirm, bulkProgress, bulkResult, rowsOf, runBulkApprove } from "@/features/approve-center/model";
import { listItem, page } from "./fixtures";

/** UT-AP-07 (FE-AP-005) confirm and error mapping; UT-AP-08 (FE-AP-006) bulk sequence. */
const reserve = approveMenuFor("reserve") as AvailableMenu;
const domainError = (domainCode: string, httpStatus = 409) =>
  TRPCClientError.from({ error: { message: domainCode, code: -32000, data: { code: "CONFLICT", httpStatus, domainCode } } } as never);

describe("UT-AP-07 approve one", () => {
  it("confirm names the document and the document page's consequence (Q-AP-09)", () => {
    expect(approveConfirm(reserve, "RS2611002", 2)).toEqual({ title: "Approve RS2611002?", body: "Its 2 stock items are held for the customer and it can no longer be edited." });
    expect(approveConfirm(reserve, "RS2611002", 1).body).toContain("1 stock item is held");
    const po = approveMenuFor("purchase-order") as AvailableMenu;
    expect(approveConfirm(po, "PO1", 3).body).toBe("Its 3 items are sent to Purchase and it can no longer be edited.");
  });

  it("maps each documented error (error-handling.md)", () => {
    expect(approveFailure(domainError("RESERVE_CHANGED"), reserve, "RS1")).toMatchObject({ toast: "RS1 was changed by someone else. The list was refreshed.", refetch: true, inline: null });
    expect(approveFailure(domainError("PURCHASE_ORDER_STATUS_INVALID"), reserve, "RS1")).toMatchObject({ toast: "RS1 is no longer pending.", refetch: true });
    expect(approveFailure(domainError("MEMO_OUT_DELETED"), reserve, "RS1")).toMatchObject({ toast: "RS1 was deleted.", refetch: true });
    expect(approveFailure(domainError("RESERVE_NOT_FOUND", 404), reserve, "RS1")).toMatchObject({ toast: "RS1 was deleted.", refetch: true });
    const short = approveFailure(domainError("RESERVE_PENDING_SHORT"), reserve, "RS1");
    expect(short).toMatchObject({ inline: "Some stock items no longer have enough pending. Open the document to fix it.", link: true, refetch: false });
    expect(approveFailure(domainError("MEMO_OUT_RETURN_OUTSTANDING_SHORT"), reserve, "RS1").link).toBe(true);
    expect(approveFailure(domainError("PERMISSION_DENIED", 403), reserve, "RS1")).toMatchObject({ toast: "You no longer have permission to approve Reserve.", refetchAccess: true });
    expect(approveFailure(new Error("offline"), reserve, "RS1")).toMatchObject({ toast: "Couldn't approve RS1. Try again.", refetch: false });
    expect(approveFailure(domainError("CSRF_INVALID", 403), reserve, "RS1").toast).toContain("Reload the page");
  });

  it("messages never carry internal codes", () => {
    for (const code of ["RESERVE_CHANGED", "RESERVE_PENDING_SHORT", "PERMISSION_DENIED", "SOMETHING_ELSE"]) {
      const outcome = approveFailure(domainError(code), reserve, "RS1");
      expect(`${outcome.toast} ${outcome.inline ?? ""}`).not.toMatch(/[A-Z]{3,}_[A-Z]+/);
    }
  });
});

describe("UT-AP-08 approve selected", () => {
  const rows = rowsOf([page([listItem({ id: "a", docNo: "RS1" }), listItem({ id: "b", docNo: "RS2" }), listItem({ id: "c", docNo: "RS3" })])]);

  it("approves one at a time in order with a fresh version each, and reports progress", async () => {
    const log: string[] = [];
    let inFlight = 0;
    let maxInFlight = 0;
    const progress: string[] = [];
    const track = async <T,>(work: () => T) => {
      inFlight += 1;
      maxInFlight = Math.max(maxInFlight, inFlight);
      await Promise.resolve();
      inFlight -= 1;
      return work();
    };
    const outcome = await runBulkApprove(
      rows,
      {
        prepare: (id) => track(() => (log.push(`get ${id}`), { version: id.charCodeAt(0) })),
        approve: (id, version) => track(() => log.push(`approve ${id}@${version}`)),
      },
      reserve,
      () => false,
      (index, total) => progress.push(bulkProgress(index, total)),
    );
    expect(maxInFlight).toBe(1);
    expect(log).toEqual(["get a", "approve a@97", "get b", "approve b@98", "get c", "approve c@99"]);
    expect(progress).toEqual(["Approving 1 of 3…", "Approving 2 of 3…", "Approving 3 of 3…"]);
    expect(outcome).toMatchObject({ ok: 3, stopped: false });
    expect(bulkResult(outcome.ok, 3, outcome.stopped)).toBe("Approved 3 of 3");
  });

  it("keeps going after a failure and returns the failed rows with their reasons", async () => {
    const outcome = await runBulkApprove(
      rows,
      {
        prepare: async () => ({ version: 1 }),
        approve: async (id) => {
          if (id === "b") throw domainError("RESERVE_PENDING_SHORT");
        },
      },
      reserve,
      () => false,
      () => undefined,
    );
    expect(outcome.ok).toBe(2);
    expect([...outcome.failed.keys()]).toEqual(["b"]);
    expect(outcome.failed.get("b")?.link).toBe(true);
    expect(bulkResult(outcome.ok, 3, outcome.stopped)).toBe("Approved 2 of 3");
  });

  it("Cancel stops before the next document", async () => {
    let cancelled = false;
    const approved: string[] = [];
    const outcome = await runBulkApprove(
      rows,
      {
        prepare: async () => ({ version: 1 }),
        approve: async (id) => {
          approved.push(id);
          cancelled = true;
        },
      },
      reserve,
      () => cancelled,
      () => undefined,
    );
    expect(approved).toEqual(["a"]);
    expect(outcome).toMatchObject({ ok: 1, stopped: true });
    expect(bulkResult(1, 3, true)).toBe("Approved 1 of 3. Stopped.");
    expect(bulkConfirm(3).title).toBe("Approve 3 documents?");
    expect(bulkConfirm(1).title).toBe("Approve 1 document?");
  });
});
