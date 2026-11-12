import { TRPCClientError } from "@trpc/client";
import { describe, expect, it } from "vitest";
import { approveMenuFor, type AvailableMenu } from "@/features/approve-center/menus";
import {
  actionFailure,
  approveConfirm,
  approveFailure,
  bulkConfirm,
  bulkProgress,
  bulkResult,
  canRevise,
  REASON_TOO_LONG,
  REVISE_LIMIT_REASON,
  reviewFieldError,
  reviewReasonError,
  reviewText,
  rowsOf,
  runBulkApprove,
} from "@/features/approve-center/model";
import { listItem, page } from "./fixtures";

/** UT-AP-07 (FE-AP-005) confirm and error mapping; UT-AP-08 (FE-AP-006) bulk sequence. */
const reserve = approveMenuFor("reserve") as AvailableMenu;
const domainError = (domainCode: string, httpStatus = 409, fieldErrors?: { path: string; code: string }[]) =>
  TRPCClientError.from({ error: { message: domainCode, code: -32000, data: { code: "CONFLICT", httpStatus, domainCode, fieldErrors } } } as never);

describe("UT-AP-07 approve one", () => {
  it("confirm names the document and the document page's consequence (Q-AP-09)", () => {
    expect(approveConfirm(reserve, "RS2611002", 2)).toEqual({ title: "Approve RS2611002?", body: "Its 2 stock items are held for the customer and it can no longer be edited." });
    expect(approveConfirm(reserve, "RS2611002", 1).body).toContain("1 stock item is held");
    const po = approveMenuFor("purchase-order") as AvailableMenu;
    expect(approveConfirm(po, "PO1", 3).body).toBe("Its 3 items are sent to Purchase and it can no longer be edited.");
    expect(approveConfirm(approveMenuFor("quotation") as AvailableMenu, "QT1", 3).body).toBe("It can no longer be edited.");
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
  const rows = rowsOf([page([listItem({ id: "a", docNo: "RS1", version: 1 }), listItem({ id: "b", docNo: "RS2", version: 2 }), listItem({ id: "c", docNo: "RS3", version: 3 })])]);

  it("approves one at a time in order with each row's listed version (no get first), and reports progress", async () => {
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
        approve: (id, version) => track(() => log.push(`approve ${id}@${version}`)),
      },
      reserve,
      () => false,
      (index, total) => progress.push(bulkProgress(index, total)),
    );
    expect(maxInFlight).toBe(1);
    expect(log).toEqual(["approve a@1", "approve b@2", "approve c@3"]);
    expect(progress).toEqual(["Approving 1 of 3…", "Approving 2 of 3…", "Approving 3 of 3…"]);
    expect(outcome).toMatchObject({ ok: 3, stopped: false });
    expect(bulkResult(outcome.ok, 3, outcome.stopped)).toBe("Approved 3 of 3");
  });

  it("keeps going after a failure and returns the failed rows with their reasons", async () => {
    const outcome = await runBulkApprove(
      rows,
      {
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

describe("UT-AP-19 Reject… / Revise… (FE-AP-010, FE-AS-013, ADR-0050 Q-AS-32)", () => {
  it("dialog texts: Reject field 'Reason for reject'; Revise names the action; success toasts", () => {
    expect(reviewText("reject", "RS1")).toMatchObject({ title: "Reject RS1?", label: "Reason for reject", confirmLabel: "Reject", success: "RS1 rejected" });
    expect(reviewText("revise", "RS1")).toMatchObject({ title: "Send RS1 back for revision?", confirmLabel: "Revise", success: "RS1 sent back for revision" });
  });

  it("the reason is required (trimmed) and at most 500 characters, for both actions", () => {
    expect(reviewReasonError("reject", "   ")).toBe("Enter the reason before choosing Reject");
    expect(reviewReasonError("revise", "")).toBe("Enter the reason before choosing Revise");
    expect(reviewReasonError("revise", " Fix price ")).toBeNull();
    expect(reviewReasonError("reject", "a".repeat(500))).toBeNull();
    expect(reviewReasonError("reject", "a".repeat(501))).toBe(REASON_TOO_LONG);
  });

  it("server VALIDATION_ERROR on reason / note stays inline in the dialog; other errors do not", () => {
    expect(reviewFieldError("reject", domainError("VALIDATION_ERROR", 400, [{ path: "reason", code: "too_small" }]))).toBe("Enter the reason before choosing Reject");
    expect(reviewFieldError("revise", domainError("VALIDATION_ERROR", 400, [{ path: "note", code: "too_big" }]))).toBe(REASON_TOO_LONG);
    expect(reviewFieldError("revise", domainError("VALIDATION_ERROR", 400, [{ path: "id", code: "invalid" }]))).toBeNull();
    expect(reviewFieldError("revise", domainError("RESERVE_CHANGED"))).toBeNull();
  });

  it("Revise is offered once: revisionCount 1 disables it with the info text", () => {
    expect(canRevise({ revisionCount: 0 })).toBe(true);
    expect(canRevise({ revisionCount: 1 })).toBe(false);
    expect(REVISE_LIMIT_REASON).toBe("Already sent back once. Approve or reject it.");
  });

  it("maps _REVISE_LIMIT, _CHANGED, _STATUS_INVALID, _DELETED, APPROVAL_TYPE_OFF and generic failures per action", () => {
    expect(actionFailure(domainError("RESERVE_REVISE_LIMIT"), reserve, "RS1", "revise")).toMatchObject({ toast: "RS1 was already sent back once. Approve or reject it.", refetch: true });
    expect(actionFailure(domainError("QUOTATION_CHANGED"), reserve, "RS1", "reject")).toMatchObject({ toast: "RS1 was changed by someone else. The list was refreshed.", refetch: true });
    expect(actionFailure(domainError("RESERVE_STATUS_INVALID"), reserve, "RS1", "reject")).toMatchObject({ toast: "RS1 is no longer pending.", refetch: true });
    expect(actionFailure(domainError("RESERVE_DELETED"), reserve, "RS1", "revise")).toMatchObject({ toast: "RS1 was deleted.", refetch: true });
    expect(actionFailure(domainError("APPROVAL_TYPE_OFF"), reserve, "RS1", "approve")).toMatchObject({ toast: "Approval is off for Reserve.", off: true, refetch: true });
    expect(actionFailure(new Error("offline"), reserve, "RS1", "revise")).toMatchObject({ toast: "Couldn't send back RS1. Try again.", inline: "Couldn't send back. Try again." });
    expect(actionFailure(new Error("offline"), reserve, "RS1", "reject").toast).toBe("Couldn't reject RS1. Try again.");
    expect(actionFailure(domainError("PERMISSION_DENIED", 403), reserve, "RS1", "reject")).toMatchObject({ inline: "No permission to reject.", refetchAccess: true });
    expect(actionFailure(domainError("LICENSE_EXPIRED", 403), reserve, "RS1", "revise").toast).toBe("Your license doesn't allow this right now. Nothing was sent back.");
  });
});
