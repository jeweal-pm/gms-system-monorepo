import { readFileSync } from "node:fs";
import { join } from "node:path";
import { TRPCClientError } from "@trpc/client";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { mapMemoOutSaveError, memoOutRestoreError } from "@/features/memo-out/api";
import { mapMemoOutReturnSaveError, memoOutReturnRestoreError } from "@/features/memo-out-return/api";
import { mapMemoReceiveError, memoReceiveRestoreError } from "@/features/memo-receive/api";
import { mapMemoReturnSaveError, memoReturnRestoreError } from "@/features/memo-return/api";
import { mapPurchaseSaveError, purchaseRestoreError } from "@/features/purchase/api";
import { mapPurchaseOrderError, purchaseOrderRestoreError } from "@/features/purchase-order/api";
import { mapSaveError as mapQuotationSaveError, quotationRestoreError } from "@/features/quotation/api";
import { flowActions } from "@/features/trade-document/flow-status";
import { QuotationHeader } from "@/features/quotation/components/header/QuotationHeader";
import { quotationDot } from "@/features/quotation/components/rail/RightRail";
import { deleteDocumentConfirm, restoreDocumentConfirm } from "@/features/quotation/components/use-confirm";
import { mapReserveSaveError, reserveRestoreError } from "@/features/reserve/api";
import {
  clearNotice,
  DAYBOOK_PAGE_SIZE,
  daybookInput,
  daybookLoadError,
  daybookQueryOptions,
  daybookState,
  deletedBannerText,
  DeletedBanner,
  deletedByName,
  deletedInfo,
  DocumentDaybook,
  formatDeletedAt,
  handOverNotice,
  peekNotice,
  restoreStatusLabel,
} from "@/features/trade-document/document-api";

/** transaction-soft-delete FE-SD-001…003 (UT-SD-F01…F06) on the verified backend contract (BE-SD-005). */

vi.mock("next/link", async () => {
  const { createElement: h } = await import("react");
  return { default: ({ href, children, ...rest }: { href: string; children: unknown }) => h("a", { href, ...rest }, children as never) };
});

const domainError = (domainCode: string, status = 409) =>
  TRPCClientError.from({ error: { message: domainCode, code: -32000, data: { code: "CONFLICT", httpStatus: status, domainCode } } } as never);

const html = (element: Parameters<typeof renderToStaticMarkup>[0]) => renderToStaticMarkup(element);
const noop = () => undefined;
const row = (patch: Record<string, unknown> = {}) => ({ id: "a", docNo: "3", docDate: "2026-11-06", status: "PENDING_APPROVAL", name: "Aom", deletedAt: null, ...patch });

describe("UT-SD-F01 daybook: deleted documents show nowhere (owner 2026-11-06, no Active / Deleted view)", () => {
  it("the list input leaves deleted out (backend default) and has no cursor; Load more uses nextCursor", () => {
    expect(daybookInput()).toEqual({ limit: DAYBOOK_PAGE_SIZE });
    expect(daybookInput()).not.toHaveProperty("deleted");
    expect(daybookQueryOptions.getNextPageParam({ nextCursor: "c2" })).toBe("c2");
    expect(daybookQueryOptions.getNextPageParam({ nextCursor: null })).toBeUndefined();
  });

  it("no daybook renders an Active / Deleted toggle", () => {
    const markup = html(createElement(DocumentDaybook, { plural: "purchases", href: (id) => id, state: { isPending: false, isError: false, items: [row()] } }));
    expect(markup).not.toContain("aria-pressed");
    expect(markup).not.toContain(">Deleted<");
  });

  it("every daybook of the 8 documents lists only active documents", () => {
    const src = (path: string) => readFileSync(join(process.cwd(), "src/features", path), "utf8");
    const hooks: [string, string][] = [
      ["quotation/api.ts", "quotation"],
      ["reserve/api.ts", "reserve"],
      ["memo-receive/api.ts", "memoReceive"],
      ["memo-return/api.ts", "memoReturn"],
      ["memo-out/api.ts", "memoOut"],
      ["memo-out-return/api.ts", "memoOutReturn"],
      ["purchase-order/api.ts", "purchaseOrder"],
      ["purchase/api.ts", "purchase"],
    ];
    for (const [file, router] of hooks) expect(src(file)).toContain(`masterTrpc.${router}.list.useInfiniteQuery(daybookInput(), daybookQueryOptions)`);
    for (const page of ["quotation/components/rail/RightRail.tsx", "reserve/components/ReservePage.tsx", "memo-receive/components/MemoReceiveForm.tsx", "memo-return/components/MemoReturnPage.tsx", "memo-out/components/MemoOutPage.tsx", "memo-out-return/components/MemoOutReturnPage.tsx", "purchase-order/components/PurchaseOrderForm.tsx", "purchase/components/PurchasePage.tsx"]) {
      expect(src(page)).not.toContain("onViewChange");
    }
  });

  it("flattens the loaded pages and offers Load more while there is a next page", () => {
    const fetchNextPage = vi.fn();
    const state = daybookState(
      { isPending: false, isError: false, error: null, hasNextPage: true, isFetchingNextPage: false, fetchNextPage, data: { pages: [{ items: [{ id: "1", docNo: "1", docDate: "2026-11-05", status: "APPROVED", vendorName: "A" }] }, { items: [{ id: "2", docNo: "2", docDate: "2026-11-04", status: "PENDING_APPROVAL", vendorName: "B" }] }] } },
      () => "x",
      (item) => item.vendorName,
    );
    expect(state.items.map((item) => [item.docNo, item.name])).toEqual([["1", "A"], ["2", "B"]]);
    state.onLoadMore?.();
    expect(fetchNextPage).toHaveBeenCalledOnce();
    const markup = html(createElement(DocumentDaybook, { plural: "purchases", href: (id) => `/p/${id}`, state }));
    expect(markup).toContain(">Load more</button>");
    expect(html(createElement(DocumentDaybook, { plural: "purchases", href: (id) => id, state: { ...state, hasMore: false } }))).not.toContain("Load more");
  });

  it("a list load error names the list (the daybook used to say \"Couldn't load this memo return\")", () => {
    expect(daybookLoadError(domainError("VALIDATION_ERROR", 400), "memo returns")).toBe("Couldn't load memo returns. Try again.");
    expect(daybookLoadError(domainError("PERMISSION_DENIED", 403), "memo receives")).toBe("You don't have permission to view memo receives.");
  });
});

describe("UT-SD-F02 daybook rows and empty text", () => {
  it("rows keep their status dot; Quotation keeps its own colours", () => {
    const active = html(createElement(DocumentDaybook, { plural: "purchase orders", href: (id) => `/po/${id}`, state: { isPending: false, isError: false, items: [row()] } }));
    expect(active).toContain('title="Pending approval"');
    expect(active).toContain('href="/po/a"');
    expect(quotationDot("REJECTED").className).toBe("bg-[#E5484D]");
  });

  it("empty text: the page's own text, default \"No {plural} yet.\"", () => {
    const empty = { isPending: false, isError: false, items: [] };
    expect(html(createElement(DocumentDaybook, { plural: "memo outs", href: (id) => id, state: empty }))).toContain("No memo outs yet.");
    expect(html(createElement(DocumentDaybook, { plural: "quotations", href: (id) => id, emptyText: "No results found.", state: empty }))).toContain("No results found.");
  });
});

describe("UT-SD-F03 deleted document: banner and read-only header", () => {
  const info = deletedInfo({ deletedAt: "2026-11-06T04:20:33.572Z", deletedBy: "u1" });

  it("reads deletedAt / deletedBy from get; null when not deleted", () => {
    expect(info).toEqual({ at: "2026-11-06T04:20:33.572Z", by: "u1" });
    expect(deletedInfo({ deletedAt: null, deletedBy: null })).toBeNull();
    expect(deletedInfo(undefined)).toBeNull();
  });

  it("banner text \"Deleted by {user} on dd/mm/yyyy HH:mm\" (Asia/Bangkok); the user id is never shown", () => {
    expect(formatDeletedAt("2026-11-06T04:20:33.572Z")).toBe("06/11/2026 11:20");
    expect(deletedBannerText(info!, deletedByName("u1", { id: "u1", name: "Somchai" }))).toBe("Deleted by Somchai on 06/11/2026 11:20");
    expect(deletedByName("u1", { id: "u2", name: "Other" })).toBe("another user");
    expect(deletedByName(null, undefined)).toBe("another user");
  });

  it("the banner is a focusable status with Read-only; Restore is a button", () => {
    const markup = html(createElement(DeletedBanner, { text: "Deleted by Somchai on 06/11/2026 11:20", canRestore: true, busy: false, onRestore: noop }));
    expect(markup).toContain('role="status" tabindex="0"');
    expect(markup).toContain("Deleted by Somchai on 06/11/2026 11:20");
    expect(markup).toContain("Read-only");
    expect(markup).toMatch(/<button type="button"[^>]*>.*Restore<\/button>/);
  });

  it("the header of a deleted document has no Edit / Delete, and Save stays disabled in view mode", () => {
    const markup = html(createElement(QuotationHeader, { docNo: "3", isPreview: false, mode: "view", saving: false, canSave: false, canCreate: true, canEdit: false, canDelete: false, hideEditDelete: true, actions: { onCancel: noop, onSave: noop, onEdit: noop, onDelete: noop, onDuplicate: noop, onRefresh: noop } }));
    expect(markup).not.toContain("> Edit</button>");
    expect(markup).not.toContain("> Delete</button>");
    expect(markup).toMatch(/<button[^>]*disabled=""[^>]*>Save<\/button>/);
  });

  it("every form treats deletedAt as read-only and shows the banner (shared form, Quotation, Memo Receive, PO)", () => {
    const src = (path: string) => readFileSync(join(process.cwd(), "src/features", path), "utf8");
    for (const form of ["trade-document/document-form.tsx", "quotation/components/QuotationForm.tsx", "memo-receive/components/MemoReceiveForm.tsx", "purchase-order/components/PurchaseOrderForm.tsx"]) {
      const text = src(form);
      expect(text).toMatch(/const readOnly = mode === "view" \|\| isDeleted;/);
      expect(text).toContain("<DocumentDeletedBanner info={deleted}");
      expect(text).toContain("hideEditDelete={approvalFlow.hideEditDelete}");
      expect(text).toMatch(/deleted: isDeleted,/);
    }
    for (const page of ["memo-out/components/MemoOutPage.tsx", "reserve/components/ReservePage.tsx", "memo-return/components/MemoReturnPage.tsx", "memo-out-return/components/MemoOutReturnPage.tsx", "purchase/components/PurchasePage.tsx", "quotation/components/QuotationPage.tsx", "memo-receive/components/MemoReceivePage.tsx", "purchase-order/components/PurchaseOrderPage.tsx"]) {
      expect(src(page)).toContain("deleted={deletedInfo(detail.data)}");
    }
  });
});

describe("UT-SD-F04 Restore and Delete availability", () => {
  it("Restore confirm names the number and the status it goes back to", () => {
    // ADR-0048 G3 / G10: Draft while approval is ON, approved again while OFF.
    expect(restoreDocumentConfirm("PO-3", restoreStatusLabel(true))).toEqual({
      title: "Restore PO-3?",
      body: "It goes back to Draft and can be edited again.",
      cancelLabel: "Cancel",
      confirmLabel: "Restore",
    });
    expect(restoreDocumentConfirm("QT-1", restoreStatusLabel(false)).body).toBe("It goes back to Approved and can be edited again.");
    expect(restoreStatusLabel(undefined)).toBe("its saved status");
  });

  it("Restore shows only with DELETE", () => {
    const hidden = html(createElement(DeletedBanner, { text: "Deleted by another user on 06/11/2026 11:20", canRestore: false, busy: false, onRestore: noop }));
    expect(hidden).not.toContain("Restore");
    const busy = html(createElement(DeletedBanner, { text: "x", canRestore: true, busy: true, onRestore: noop }));
    expect(busy).toMatch(/<button[^>]*disabled=""/);
  });

  it("a deleted document shows no Edit / Delete / Send to approve whatever its Flow (ADR-0048 replaces OQ-1)", () => {
    const flow = { status: "DRAFT", autoApproved: false, revisionCount: 0, canEdit: true, canDelete: true, canSubmit: true, usedBy: null, review: null };
    const all = { add: true, edit: true, delete: true };
    expect(flowActions({ flow, deleted: true, requireApproval: true, access: all, editing: false, dirty: false })).toEqual({ showEditDelete: false, canEdit: false, canDelete: false, showSend: false, canSend: false });
  });

  it("the header hides only Delete for a quotation past approval", () => {
    const markup = html(createElement(QuotationHeader, { docNo: "QT-1", isPreview: false, mode: "view", saving: false, canSave: true, canCreate: true, canEdit: true, canDelete: false, hideDelete: true, actions: { onCancel: noop, onSave: noop, onEdit: noop, onDelete: noop, onDuplicate: noop, onRefresh: noop } }));
    expect(markup).toContain("Edit</button>");
    expect(markup).not.toContain("Delete</button>");
  });

  it("after a confirmed Delete every form returns to Create New (OQ-3)", () => {
    const src = (path: string) => readFileSync(join(process.cwd(), "src/features", path), "utf8");
    expect(src("trade-document/document-form.tsx")).toMatch(/await api\.remove\([^)]*\);\n?\r?\n\s*await api\.invalidate\(\);\r?\n\s*replaceTab\(config\.newHref\);/);
    expect(src("quotation/components/QuotationForm.tsx")).toContain('replaceTab("/pre-sale/quotation");');
    expect(src("memo-receive/components/MemoReceiveForm.tsx")).toContain("replaceTab(MEMO_RECEIVE_HREF);");
    expect(src("purchase-order/components/PurchaseOrderForm.tsx")).toContain("replaceTab(PURCHASE_ORDER_HREF);");
    expect(src("purchase-order/components/PurchaseOrderForm.tsx")).toContain("await confirm(deleteDocumentConfirm(saved.docNo))");
  });

  it("a message is handed over to the next mount of the same document and expires", () => {
    handOverNotice("d1", "Restored 3", 1_000);
    expect(peekNotice("d1", 2_000)).toBe("Restored 3");
    expect(peekNotice("d1", 20_000)).toBeNull();
    clearNotice("d1");
    expect(peekNotice("d1", 2_000)).toBeNull();
    expect(peekNotice(undefined)).toBeNull();
  });
});

describe("UT-SD-F05 error mapping for the 8 documents", () => {
  const save: [string, string, (error: unknown) => { message: string }][] = [
    ["QUOTATION", "quotation", mapQuotationSaveError],
    ["RESERVE", "reserve", mapReserveSaveError],
    ["MEMO_RECEIVE", "memo receive", mapMemoReceiveError],
    ["MEMO_RETURN", "memo return", mapMemoReturnSaveError],
    ["MEMO_OUT", "memo out", mapMemoOutSaveError],
    ["MEMO_OUT_RETURN", "memo out return", mapMemoOutReturnSaveError],
    ["PURCHASE_ORDER", "purchase order", mapPurchaseOrderError],
    ["PURCHASE", "purchase", mapPurchaseSaveError],
  ];
  it.each(save)("%s_DELETED → \"This … was deleted. Restore it to edit.\" and a reload", (code, noun, map) => {
    const outcome = map(domainError(`${code}_DELETED`)) as { message: string; deleted?: boolean; reload?: boolean };
    expect(outcome.message).toBe(`This ${noun} was deleted. Restore it to edit.`);
    expect(outcome.deleted === true || outcome.reload === true).toBe(true);
  });

  const restore: [string, string, (error: unknown) => { message: string; refetch: boolean }][] = [
    ["QUOTATION", "quotation", quotationRestoreError],
    ["RESERVE", "reserve", reserveRestoreError],
    ["MEMO_RECEIVE", "memo receive", memoReceiveRestoreError],
    ["MEMO_RETURN", "memo return", memoReturnRestoreError],
    ["MEMO_OUT", "memo out", memoOutRestoreError],
    ["MEMO_OUT_RETURN", "memo out return", memoOutReturnRestoreError],
    ["PURCHASE_ORDER", "purchase order", purchaseOrderRestoreError],
    ["PURCHASE", "purchase", purchaseRestoreError],
  ];
  it.each(restore)("restore %s_STATUS_INVALID → \"no longer deleted\" + refetch; CHANGED refetches; NOT_FOUND doesn't", (code, noun, map) => {
    expect(map(domainError(`${code}_STATUS_INVALID`))).toEqual({ message: `This ${noun} is no longer deleted.`, refetch: true });
    expect(map(domainError(`${code}_CHANGED`))).toEqual({ message: `Someone else changed this ${noun}. Refresh to see the latest.`, refetch: true });
    expect(map(domainError(`${code}_NOT_FOUND`, 404)).refetch).toBe(false);
    expect(map(domainError("PERMISSION_DENIED", 403)).message).toBe("You don't have permission to restore it. Nothing was changed.");
  });

  it("CHANGED on save is unchanged", () => {
    expect(mapMemoOutSaveError(domainError("MEMO_OUT_CHANGED")).message).toBe("Someone else changed this memo out. Refresh to see the latest.");
    expect(mapPurchaseOrderError(domainError("PURCHASE_ORDER_CHANGED")).reload).toBe(false);
  });
});

describe("UT-SD-F06 the delete confirm text is unchanged", () => {
  it("matches today's deleteDocumentConfirm exactly", () => {
    expect(deleteDocumentConfirm("PO-3")).toEqual({
      title: "Delete PO-3?",
      body: "The document will be permanently deleted. This can't be undone.",
      cancelLabel: "Keep document",
      confirmLabel: "Delete",
    });
  });
});
