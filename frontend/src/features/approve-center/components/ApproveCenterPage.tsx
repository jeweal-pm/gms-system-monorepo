"use client";

import { Search, X } from "lucide-react";
import { useEffect, useId, useMemo, useRef, useState, type ReactNode } from "react";
import { Button, cx, focusRing } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { useToast } from "@/components/ui/toast";
import { useTabReplace } from "@/features/home/tabs/tab-host";
import { useApprovalCounts, usePendingList, useReviewCalls, useVisibleMenus } from "../api";
import { approveMenuFor, approveMenuHref, searchPlaceholder, type AvailableMenu } from "../menus";
import {
  actionFailure,
  APPROVAL_OFF_TITLE,
  approvalOffDetail,
  approveConfirm,
  bulkConfirm,
  bulkProgress,
  bulkResult,
  DEFAULT_SORT,
  EMPTY_SEARCH_TITLE,
  EMPTY_TEXT,
  EMPTY_TITLE,
  emptySearchText,
  landingMenu,
  listLoadError,
  menuAccess,
  nextSort,
  noApproveMessage,
  NOT_AVAILABLE_TITLE,
  notAvailableText,
  NO_SELECTION,
  pendingInput,
  pruneSelection,
  reviewFieldError,
  reviewText,
  rowsOf,
  runBulkApprove,
  SEARCH_DEBOUNCE_MS,
  SEARCH_MAX,
  searchQuery,
  selectedInOrder,
  toggleAll,
  toggleOne,
  type ApprovalRow,
  type CountState,
  type ReviewAction,
  type ReviewKind,
  selectionScope,
  type SortState,
} from "../model";
import { ApprovalEmptyState, ApprovalTable, ProvisionalTable, SkeletonRows, type RowError } from "./ApprovalTable";
import { ApproveMenuSelect, ApprovePanel } from "./ApprovePanel";
import { DocumentPreviewModal } from "./DocumentPreviewModal";
import { ReviewDialog } from "./ReviewDialog";
import type { PreviewDetail } from "../preview";

/** `/approve` (Q-AP-04): opens the first visible menu with pending documents, else the first visible menu, in this tab. */
export function ApproveLanding() {
  const { menus, mine, isPending } = useVisibleMenus();
  const { countOf, counts } = useApprovalCounts(mine);
  const replace = useTabReplace();
  const settled = !isPending && counts.every((count) => count.status !== "pending");
  const target = settled ? landingMenu(menus, countOf) : null;
  useEffect(() => {
    if (target) replace(approveMenuHref(target.slug));
  }, [replace, target]);
  if (settled && !target) {
    return (
      <PageFrame panel={null} title="Approve">
        <Card>
          <ApprovalEmptyState title="Nothing to approve" text="You don't have permission to approve any documents." />
        </Card>
      </PageFrame>
    );
  }
  return (
    <p role="status" className="p-6 text-gms-body text-gms-text-secondary">
      Opening Approve…
    </p>
  );
}

function PageFrame({ panel, beforeTitle, title, children }: { panel: ReactNode; beforeTitle?: ReactNode; title: string; children: ReactNode }) {
  return (
    <div className="flex h-full min-h-0">
      {panel}
      <div className="flex min-w-0 flex-1 flex-col bg-gms-page px-4 py-6 lg:pl-6">
        {beforeTitle}
        <h1 className="mb-4 text-gms-title font-semibold text-gms-text">{title}</h1>
        {children}
      </div>
    </div>
  );
}

function Card({ children }: { children: ReactNode }) {
  return <section className="flex min-h-0 flex-1 flex-col rounded-gms-lg border border-gms-border bg-gms-surface p-4">{children}</section>;
}

/** `/approve/[menu]`: panel + title + card for one menu (FE-AP-001). */
export function ApproveMenuPage({ slug }: { slug: string }) {
  const { menus, mine, isPending } = useVisibleMenus();
  const { countOf } = useApprovalCounts(mine);
  const menu = approveMenuFor(slug);
  const active = menu && menus.includes(menu) ? menu.slug : null;
  const panelProps = { menus, active, countOf };

  let body: ReactNode;
  if (!menu) {
    body = <ApprovalEmptyState title="Menu not found" text="This Approve menu doesn't exist." />;
  } else if (isPending) {
    body = <SkeletonRows />;
  } else if (!menuAccess(mine, menu).approve) {
    body = <ApprovalEmptyState title="No access" text={noApproveMessage(menu)} />;
  } else if (menu.availability === "not-available") {
    body = <ProvisionalTable menu={menu} title={NOT_AVAILABLE_TITLE} text={notAvailableText(menu)} />;
  } else if (countOf(menu)?.off) {
    // FE-AS-009: the type's approval setting is OFF (approval.summary types[].requireApproval).
    body = <ApprovalEmptyState title={APPROVAL_OFF_TITLE} text={approvalOffDetail(menu)} />;
  } else {
    body = <PendingApprovals key={menu.slug} menu={menu} count={countOf(menu)} />;
  }

  return (
    <PageFrame panel={<ApprovePanel {...panelProps} />} beforeTitle={<ApproveMenuSelect {...panelProps} />} title={menu?.label ?? "Menu not found"}>
      <Card>{body}</Card>
    </PageFrame>
  );
}

type Confirm =
  | { kind: "one"; row: ApprovalRow; index: number; version: number; title: string; body: string; fromPreview?: boolean }
  | { kind: "bulk"; rows: ApprovalRow[]; title: string; body: string };

/** An open Reject… / Revise… dialog: the row, its index and the version to send (the row's, or the modal's). */
type Review = { kind: ReviewKind; row: ApprovalRow; index: number; version: number; fromPreview: boolean };

/** "Showing n of N" uses the summary count (the pending list has no total); "100+" at the cap. */
export function showingText(shown: number, q: string | undefined, count: CountState | undefined): string {
  const total = count?.status === "success" && !count.off ? count.total : undefined;
  if (q || total === undefined) return `Showing ${shown}`;
  return `Showing ${shown} of ${total >= 100 ? "100+" : total}`;
}

/**
 * FE-AP-004…007, FE-AP-009/010: search, server-sorted pending rows, selection, Approve / Approve selected, Reject… and
 * Revise… for one available menu.
 */
export function PendingApprovals({ menu, count }: { menu: AvailableMenu; count?: CountState }) {
  const toast = useToast();
  const searchId = useId();
  const containerRef = useRef<HTMLDivElement>(null);
  const searchRef = useRef<HTMLInputElement>(null);
  const [text, setText] = useState("");
  const [q, setQ] = useState<string | undefined>(undefined);
  const [sort, setSort] = useState<SortState>(DEFAULT_SORT);
  // A new search or sort starts a new selection: the selection belongs to one scope.
  const scope = selectionScope(q, sort);
  const [selection, setSelection] = useState<{ scope: string; ids: ReadonlySet<string> }>({ scope, ids: new Set() });
  const selected = selection.scope === scope ? selection.ids : NO_SELECTION;
  const setSelected = (ids: ReadonlySet<string>) => setSelection({ scope, ids });
  const [busyIds, setBusyIds] = useState<ReadonlySet<string>>(new Set());
  const [errors, setErrors] = useState<ReadonlyMap<string, RowError>>(new Map());
  const [confirm, setConfirm] = useState<Confirm | null>(null);
  const [confirmPending, setConfirmPending] = useState(false);
  const [progress, setProgress] = useState<string | null>(null);
  // Rev 2 (FE-AP-013): the row whose document preview modal is open.
  const [previewRow, setPreviewRow] = useState<ApprovalRow | null>(null);
  const cancelRef = useRef(false);
  const [review, setReview] = useState<Review | null>(null);
  const [reviewPending, setReviewPending] = useState(false);
  const [reviewError, setReviewError] = useState<string | null>(null);
  const list = usePendingList(menu, q, sort);
  const calls = useReviewCalls(menu);
  const loadError = list.isError ? listLoadError(list.error, menu) : null;

  // A stale cursor (VALIDATION_ERROR cursor) restarts paging from the first page, once per failure.
  const resetFor = loadError?.resetPaging ? list.errorUpdatedAt : null;
  const { resetPaging, invalidate } = calls;
  useEffect(() => {
    if (resetFor !== null) void resetPaging(pendingInput(menu, q, sort));
  }, [resetFor, resetPaging, menu, q, sort]);
  // APPROVAL_TYPE_OFF: the type was turned off meanwhile; the summary refetch switches the page to the off state.
  const offNow = loadError?.off ?? false;
  useEffect(() => {
    if (offNow) void invalidate("reject");
  }, [offNow, invalidate]);

  // Search: debounced 300 ms, trimmed, ≤ 100 characters.
  useEffect(() => {
    const timer = setTimeout(() => setQ(searchQuery(text)), SEARCH_DEBOUNCE_MS);
    return () => clearTimeout(timer);
  }, [text]);

  const rows = useMemo(() => rowsOf(list.data?.pages), [list.data]);
  // A refresh that removes a selected row drops it from the selection.
  const visibleSelection = useMemo(() => pruneSelection(selected, rows), [rows, selected]);
  const running = progress !== null;

  const setBusy = (id: string, on: boolean) =>
    setBusyIds((current) => {
      const next = new Set(current);
      if (on) next.add(id);
      else next.delete(id);
      return next;
    });
  const setRowError = (id: string, error: RowError | null) =>
    setErrors((current) => {
      const next = new Map(current);
      if (error) next.set(id, error);
      else next.delete(id);
      return next;
    });

  function focusAfterRemoval(index: number) {
    requestAnimationFrame(() => {
      const buttons = containerRef.current?.querySelectorAll<HTMLButtonElement>("[data-approve-index]") ?? [];
      const target = buttons[Math.min(index, buttons.length - 1)];
      (target ?? searchRef.current)?.focus();
    });
  }

  function fail(row: ApprovalRow, error: unknown, action: ReviewAction) {
    const outcome = actionFailure(error, menu, row.docNo, action);
    toast.show(outcome.refetch ? "warning" : "error", outcome.toast);
    setRowError(row.id, outcome.inline ? { message: outcome.inline, link: outcome.link } : null);
    if (outcome.refetch) void calls.invalidate(action);
    if (outcome.refetchAccess) void calls.refetchAccess();
    return outcome;
  }

  /** FE-AP-009: the row carries its version and line count, so the confirm opens without a `get`. */
  function onApprove(row: ApprovalRow, index: number) {
    if (busyIds.has(row.id) || running) return;
    setRowError(row.id, null);
    setConfirm({ kind: "one", row, index, version: row.version, ...approveConfirm(menu, row.docNo, row.lineCount) });
  }

  function openReview(kind: ReviewKind, row: ApprovalRow, index: number, version: number, fromPreview: boolean) {
    if (busyIds.has(row.id) || running) return;
    setRowError(row.id, null);
    setReviewError(null);
    setReview({ kind, row, index, version, fromPreview });
  }

  function previewReview(kind: ReviewKind, row: ApprovalRow, detail: PreviewDetail) {
    const index = Math.max(0, rows.findIndex((candidate) => candidate.id === row.id));
    openReview(kind, row, index, detail.version, true);
  }

  /** FE-AP-010: `<doc>.reject {reason}` / `<doc>.requestRevision {note}` with the listed (or previewed) version. */
  async function submitReview(target: Review, reason: string) {
    const action: ReviewAction = target.kind;
    setReviewPending(true);
    setBusy(target.row.id, true);
    try {
      if (target.kind === "reject") await calls.reject(target.row.id, target.version, reason);
      else await calls.requestRevision(target.row.id, target.version, reason);
      toast.show("success", reviewText(target.kind, target.row.docNo).success);
      setReview(null);
      if (target.fromPreview) setPreviewRow(null);
      await calls.invalidate(action);
      focusAfterRemoval(target.index);
    } catch (error) {
      const inline = reviewFieldError(target.kind, error);
      if (inline) {
        setReviewError(inline);
      } else {
        setReview(null);
        fail(target.row, error, action);
      }
    } finally {
      setReviewPending(false);
      setBusy(target.row.id, false);
    }
  }

  /** FE-AP-015: Approve from the modal confirms with the version the modal loaded (no second `get`). */
  function onPreviewApprove(row: ApprovalRow, detail: PreviewDetail) {
    if (busyIds.has(row.id) || running) return;
    setRowError(row.id, null);
    const index = Math.max(0, rows.findIndex((candidate) => candidate.id === row.id));
    setConfirm({ kind: "one", row, index, version: detail.version, fromPreview: true, ...approveConfirm(menu, row.docNo, detail.lines.length) });
  }

  function closePreview(changed: boolean) {
    setPreviewRow(null);
    // The document stopped waiting meanwhile (approved elsewhere, deleted): refresh the list and counts.
    if (changed) void calls.invalidate("approve");
  }

  async function approveOne(target: Extract<Confirm, { kind: "one" }>) {
    setConfirmPending(true);
    setBusy(target.row.id, true);
    try {
      await calls.approve(target.row.id, target.version);
      setRowError(target.row.id, null);
      toast.show("success", `${target.row.docNo} approved`);
      setConfirm(null);
      if (target.fromPreview) setPreviewRow(null);
      await calls.invalidate("approve");
      focusAfterRemoval(target.index);
    } catch (error) {
      setConfirm(null);
      fail(target.row, error, "approve");
    } finally {
      setConfirmPending(false);
      setBusy(target.row.id, false);
    }
  }

  /** FE-AP-006: one at a time in table order (4 GB / 2 vCPU budget); Cancel stops before the next document. */
  async function approveSelected(targets: ApprovalRow[]) {
    setConfirm(null);
    cancelRef.current = false;
    setProgress(bulkProgress(1, targets.length));
    const { ok, failed, stopped } = await runBulkApprove(targets, calls, menu, () => cancelRef.current, (index, count) => setProgress(bulkProgress(index, count)));
    setErrors((current) => {
      const next = new Map(current);
      for (const row of targets) {
        const outcome = failed.get(row.id);
        if (outcome) next.set(row.id, { message: outcome.inline ?? outcome.toast, link: outcome.link });
        else next.delete(row.id);
      }
      return next;
    });
    setProgress(null);
    toast.show(failed.size > 0 || stopped ? "warning" : "success", bulkResult(ok, targets.length, stopped));
    setSelected(new Set(failed.keys()));
    await calls.invalidate("approve");
  }

  function onSort(key: Parameters<typeof nextSort>[1]) {
    setSort((current) => nextSort(current, key));
  }

  const selectedRows = selectedInOrder(rows, visibleSelection);
  let content: ReactNode;
  if (list.isPending) {
    content = <SkeletonRows />;
  } else if (loadError?.off) {
    content = <ApprovalEmptyState title={APPROVAL_OFF_TITLE} text={approvalOffDetail(menu)} />;
  } else if (loadError && rows.length === 0) {
    content = (
      <div role="alert" className="flex flex-col items-center gap-3 px-4 py-16 text-center text-gms-body text-gms-text">
        {loadError.message}
        {loadError.retry && <Button onClick={() => void list.refetch()}>Retry</Button>}
      </div>
    );
  } else if (rows.length === 0) {
    content = q ? (
      <ApprovalEmptyState
        title={EMPTY_SEARCH_TITLE}
        text={emptySearchText(menu)}
        action={
          <Button className="mt-2" onClick={() => setText("")}>
            Clear search
          </Button>
        }
      />
    ) : (
      <ApprovalEmptyState title={EMPTY_TITLE} text={EMPTY_TEXT} />
    );
  } else {
    content = (
      <>
        {loadError && (
          <p role="alert" className="mb-2 text-gms-body text-gms-danger">
            {loadError.message}{" "}
            <button type="button" className={cx("underline", focusRing)} onClick={() => void list.refetch()}>
              Retry
            </button>
          </p>
        )}
        <div className="min-h-0 flex-1 overflow-auto">
          <ApprovalTable
            menu={menu}
            rows={rows}
            sort={sort}
            onSort={onSort}
            selected={visibleSelection}
            onToggleRow={(id) => setSelected(toggleOne(visibleSelection, id))}
            onToggleAll={() => setSelected(toggleAll(rows, visibleSelection))}
            busyIds={busyIds}
            locked={running}
            errors={errors}
            onApprove={onApprove}
            onReject={(row, index) => openReview("reject", row, index, row.version, false)}
            onRevise={(row, index) => openReview("revise", row, index, row.version, false)}
            onOpen={setPreviewRow}
          />
        </div>
        <div className="flex flex-wrap items-center justify-between gap-3 pt-3 text-gms-label text-gms-text-secondary">
          <span>{showingText(rows.length, q, count)}</span>
          {list.hasNextPage && (
            <Button loading={list.isFetchingNextPage} loadingLabel="Loading…" onClick={() => void list.fetchNextPage()}>
              Load more
            </Button>
          )}
        </div>
      </>
    );
  }

  return (
    <div ref={containerRef} className="flex min-h-0 flex-1 flex-col">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        {selectedRows.length > 0 || running ? (
          <div role="group" aria-label="Selected documents" className="flex flex-wrap items-center gap-3 text-gms-body">
            <span>{selectedRows.length} selected</span>
            {running ? (
              <>
                <span aria-live="polite">{progress}</span>
                <Button onClick={() => (cancelRef.current = true)}>Cancel</Button>
              </>
            ) : (
              <>
                <Button variant="primary" onClick={() => setConfirm({ kind: "bulk", rows: selectedRows, ...bulkConfirm(selectedRows.length) })}>
                  Approve selected
                </Button>
                <Button onClick={() => setSelected(new Set())}>Clear</Button>
              </>
            )}
          </div>
        ) : (
          <span />
        )}
        <label htmlFor={searchId} className="relative block w-full sm:w-[360px]">
          <span className="sr-only">Search {menu.label} approvals</span>
          <Search aria-hidden size={18} className="pointer-events-none absolute top-1/2 left-3 -translate-y-1/2 text-gms-text-placeholder" />
          <input
            ref={searchRef}
            id={searchId}
            type="search"
            value={text}
            maxLength={SEARCH_MAX}
            placeholder={searchPlaceholder(menu)}
            onChange={(event) => setText(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Escape") setText("");
            }}
            className={cx("h-9 w-full rounded-gms-md border border-gms-border bg-gms-surface pr-9 pl-10 text-gms-body text-gms-text placeholder:text-gms-text-placeholder", focusRing)}
          />
          {text && (
            <button type="button" aria-label="Clear search" onClick={() => setText("")} className={cx("absolute top-1/2 right-2 -translate-y-1/2 rounded-gms-sm text-gms-text-secondary", focusRing)}>
              <X aria-hidden size={16} />
            </button>
          )}
        </label>
      </div>
      {content}
      <DocumentPreviewModal
        menu={menu}
        row={previewRow}
        busy={previewRow !== null && (busyIds.has(previewRow.id) || (confirm?.kind === "one" && confirm.row.id === previewRow.id) || review?.row.id === previewRow.id)}
        error={previewRow ? (errors.get(previewRow.id)?.message ?? null) : null}
        onClose={closePreview}
        onApprove={(detail) => previewRow && onPreviewApprove(previewRow, detail)}
        onReject={(detail) => previewRow && previewReview("reject", previewRow, detail)}
        onRevise={(detail) => previewRow && previewReview("revise", previewRow, detail)}
      />
      <ReviewDialog
        target={review ? { kind: review.kind, docNo: review.row.docNo } : null}
        pending={reviewPending}
        error={reviewError}
        onCancel={() => setReview(null)}
        onSubmit={(reason) => {
          if (review) void submitReview(review, reason);
        }}
      />
      <ConfirmDialog
        open={confirm !== null}
        title={confirm?.title ?? ""}
        body={confirm?.body ?? ""}
        cancelLabel="Cancel"
        confirmLabel="Approve"
        // Owner 2026-11-12: Approve confirms in the primary green (like the row's Approve), not the destructive red.
        confirmVariant="primary"
        pendingLabel="Approving…"
        pending={confirmPending}
        onCancel={() => setConfirm(null)}
        onConfirm={() => {
          if (confirm?.kind === "one") void approveOne(confirm);
          else if (confirm?.kind === "bulk") void approveSelected(confirm.rows);
        }}
      />
    </div>
  );
}


