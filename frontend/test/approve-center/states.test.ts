import { TRPCClientError } from "@trpc/client";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { ApprovalEmptyState, ProvisionalTable, SkeletonRows } from "@/features/approve-center/components/ApprovalTable";
import { approveMenuFor } from "@/features/approve-center/menus";
import { APPROVAL_OFF_TITLE, approvalOffDetail, EMPTY_SEARCH_TITLE, EMPTY_TEXT, EMPTY_TITLE, emptySearchText, listLoadError, noApproveMessage, NOT_AVAILABLE_TITLE, notAvailableText } from "@/features/approve-center/model";

/** UT-AP-06 (FE-AP-004/008): table states and their texts. */
const reserve = approveMenuFor("reserve")!;
const html = (element: ReturnType<typeof createElement>) => renderToStaticMarkup(element).replaceAll("&#x27;", "'");
const domainError = (domainCode: string, httpStatus: number, fieldErrors?: { path: string; code: string }[]) =>
  TRPCClientError.from({ error: { message: domainCode, code: -32000, data: { code: "X", httpStatus, domainCode, fieldErrors } } } as never);

describe("UT-AP-06 states", () => {
  it("loading: header + 5 skeleton rows of 56 px", () => {
    const markup = html(createElement(SkeletonRows));
    expect(markup).toContain('aria-busy="true"');
    expect(markup.match(/<tr class="h-14">/g)).toHaveLength(5);
  });

  it("empty: source 01 text; empty search: its own title and text", () => {
    const markup = html(createElement(ApprovalEmptyState, { title: EMPTY_TITLE, text: EMPTY_TEXT }));
    expect(markup).toContain("Nothing waiting");
    expect(markup).toContain("Every document in this menu has been reviewed.");
    expect(EMPTY_SEARCH_TITLE).toBe("No matching documents");
    expect(emptySearchText(reserve)).toBe("Try another document no., customer, stone or Stock ID.");
    expect(emptySearchText(approveMenuFor("load-to-stock")!)).toBe("Try another document no., stone or Stock ID.");
  });

  it("not available: provisional header + 'Not available yet' (FE-AP-008)", () => {
    const menu = approveMenuFor("merge-split")!;
    const markup = html(createElement(ProvisionalTable, { menu, title: NOT_AVAILABLE_TITLE, text: notAvailableText(menu) }));
    expect(markup).toContain("Not available yet");
    expect(markup).toContain("Merge/Split Stock approvals will appear here once its page is built.");
    expect(markup).toContain(">Document<");
    expect(markup).not.toContain("<tbody");
  });

  it("errors: Retry for failures, the APPROVE text, the off state, and a stale cursor resets paging (FE-AP-009)", () => {
    expect(listLoadError(new Error("network"), reserve)).toEqual({ message: "Couldn't load Reserve approvals.", retry: true, off: false, resetPaging: false });
    expect(listLoadError(domainError("PERMISSION_DENIED", 403), reserve)).toMatchObject({ message: "You don't have permission to approve Reserve documents.", retry: false });
    expect(listLoadError(domainError("UNAUTHORIZED", 401), reserve).retry).toBe(false);
    expect(listLoadError(domainError("APPROVAL_TYPE_OFF", 409), reserve)).toMatchObject({ message: "Approval is off for Reserve.", off: true, retry: false });
    expect(listLoadError(domainError("VALIDATION_ERROR", 400, [{ path: "cursor", code: "invalid" }]), reserve)).toMatchObject({ resetPaging: true, retry: true });
    expect(listLoadError(domainError("VALIDATION_ERROR", 400, [{ path: "q", code: "too_big" }]), reserve).resetPaging).toBe(false);
    expect(noApproveMessage(reserve)).toBe("You don't have permission to approve Reserve documents.");
  });

  it("off state (FE-AS-009): its own title and text", () => {
    const markup = html(createElement(ApprovalEmptyState, { title: APPROVAL_OFF_TITLE, text: approvalOffDetail(reserve) }));
    expect(markup).toContain("Approval is off");
    expect(markup).toContain("Approval is off for Reserve. Its documents are approved when they are saved.");
  });
});
