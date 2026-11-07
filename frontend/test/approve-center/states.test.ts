import { TRPCClientError } from "@trpc/client";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { ApprovalEmptyState, ProvisionalTable, SkeletonRows } from "@/features/approve-center/components/ApprovalTable";
import { approveMenuFor } from "@/features/approve-center/menus";
import { EMPTY_SEARCH_TITLE, EMPTY_TEXT, EMPTY_TITLE, emptySearchText, listLoadError, noApproveMessage, noViewMessage, NOT_AVAILABLE_TITLE, notAvailableText } from "@/features/approve-center/model";

/** UT-AP-06 (FE-AP-004/008): table states and their texts. */
const reserve = approveMenuFor("reserve")!;
const html = (element: ReturnType<typeof createElement>) => renderToStaticMarkup(element).replaceAll("&#x27;", "'");
const domainError = (domainCode: string, httpStatus: number) =>
  TRPCClientError.from({ error: { message: domainCode, code: -32000, data: { code: "X", httpStatus, domainCode } } } as never);

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

  it("errors: Retry for failures, permission text for no VIEW, and the APPROVE text", () => {
    expect(listLoadError(new Error("network"), reserve)).toEqual({ message: "Couldn't load Reserve approvals.", retry: true });
    expect(listLoadError(domainError("PERMISSION_DENIED", 403), reserve)).toEqual({ message: "You don't have permission to view Reserve documents.", retry: false });
    expect(listLoadError(domainError("UNAUTHORIZED", 401), reserve).retry).toBe(false);
    expect(noViewMessage(reserve)).toBe("You don't have permission to view Reserve documents.");
    expect(noApproveMessage(reserve)).toBe("You don't have permission to approve Reserve documents.");
  });
});
