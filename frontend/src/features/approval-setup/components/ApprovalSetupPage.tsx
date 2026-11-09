"use client";

import { useQueries } from "@tanstack/react-query";
import { ArrowRight, ChevronRight, Info, LoaderCircle, RotateCw } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Fragment, useState } from "react";
import { cx, focusRing } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { Switch } from "@/components/ui/switch";
import { ToastProvider, useToast } from "@/components/ui/toast";
import { COUNT_STALE_MS, documentClients, listQueryKey, useMine } from "@/features/approve-center/api";
import { approveMenuHref, type ApproveMenu, type ApproveMenuSlug } from "@/features/approve-center/menus";
import { COUNT_INPUT, menuAccess, type CountState, type Mine } from "@/features/approve-center/model";
import { PartnerAccessGuard, PartnerPageFrame } from "@/features/partner/components/partner-page-parts";
import { masterTrpc } from "@/lib/master-trpc";
import { retryTransient } from "@/lib/trpc-error";
import {
  blockedText,
  checkFailedText,
  countedSetupMenus,
  DEFAULT_APPROVAL_SETTINGS,
  helperText,
  isNotAvailable,
  PREVIEW_NOTICE,
  SETUP_ROWS,
  statusChain,
  switchedToast,
  turnOffDecision,
  turnOffText,
  turnOnText,
  waitingCell,
  type ApprovalSettings,
  type ChipTone,
  type DialogText,
} from "../model";

/** `approval-setup` leaf (proposed, SA-AS-07). Until it exists only Super Admin / ALL pass the guard (Q-AS-09). */
export const APPROVAL_SETUP_ENTITY = { key: "approval-setup", singular: "Approval", plural: "Approvals" };

/** Setup › Approval (approval-setup UI rev 1, phase 1 FE-AS-002…005, owner 2026-11-09). */
export function ApprovalSetupPage() {
  return (
    <ToastProvider>
      <PartnerAccessGuard entity={APPROVAL_SETUP_ENTITY}>{() => <ApprovalSetupWorkspace />}</PartnerAccessGuard>
    </ToastProvider>
  );
}

type SetupCount = { state: CountState; refetch: () => Promise<unknown> };

/**
 * FE-AS-004: `{ status: PENDING_APPROVAL, limit: 1 }` per type the user may list, on the same query keys as the
 * Approve Center counts, so a fresh sidebar count adds no request. No polling.
 */
function useSetupCounts(mine: Mine): Map<ApproveMenuSlug, SetupCount> {
  const utils = masterTrpc.useUtils();
  const clients = documentClients(utils.client);
  const menus = countedSetupMenus(mine);
  const results = useQueries({
    queries: menus.map((menu) => ({
      queryKey: listQueryKey(menu.proc, COUNT_INPUT, "query"),
      queryFn: () => clients[menu.proc].list.query(COUNT_INPUT),
      staleTime: COUNT_STALE_MS,
      retry: retryTransient,
      refetchOnWindowFocus: true,
    })),
  });
  return new Map(menus.map((menu, index) => [menu.slug, { state: { status: results[index].status, total: results[index].data?.total }, refetch: () => results[index].refetch() }]));
}

type OpenDialog = { kind: "on" | "off" | "blocked" | "failed"; menu: ApproveMenu; text: DialogText };

function ApprovalSetupWorkspace() {
  const toast = useToast();
  const router = useRouter();
  const { mine } = useMine();
  const counts = useSetupCounts(mine);
  // Phase 1 (owner answer 4): page state only, lost on refresh; never written to storage.
  const [settings, setSettings] = useState<ApprovalSettings>(DEFAULT_APPROVAL_SETTINGS);
  const [dialog, setDialog] = useState<OpenDialog | null>(null);
  const [waitingOff, setWaitingOff] = useState<ApproveMenuSlug | null>(null);

  const countOf = (menu: ApproveMenu) => counts.get(menu.slug)?.state;

  function decideOff(menu: ApproveMenu, count: CountState | undefined) {
    const decision = turnOffDecision(count);
    if (decision === "wait") setWaitingOff(menu.slug);
    else if (decision === "blocked") setDialog({ kind: "blocked", menu, text: blockedText(menu, count?.total ?? 0) });
    else if (decision === "failed") setDialog({ kind: "failed", menu, text: checkFailedText(menu) });
    else setDialog({ kind: "off", menu, text: turnOffText(menu) });
  }

  // A turn-off clicked while the count was loading continues once the count settles (state adjusted during render,
  // guarded so it runs once per settle).
  const waitingMenu = SETUP_ROWS.find((menu) => menu.slug === waitingOff);
  if (waitingMenu && countOf(waitingMenu)?.status !== "pending") {
    setWaitingOff(null);
    decideOff(waitingMenu, countOf(waitingMenu));
  }

  function onToggle(menu: ApproveMenu, next: boolean) {
    if (next) setDialog({ kind: "on", menu, text: turnOnText(menu) });
    else decideOff(menu, countOf(menu));
  }

  function apply(menu: ApproveMenu, on: boolean) {
    setSettings((current) => ({ ...current, [menu.slug]: on }));
    toast.show("info", switchedToast(menu, on));
  }

  function onConfirm() {
    if (!dialog) return;
    const { kind, menu } = dialog;
    setDialog(null);
    if (kind === "on") apply(menu, true);
    else if (kind === "off") apply(menu, false);
    else if (kind === "blocked") router.push(approveMenuHref(menu.slug));
    else {
      setWaitingOff(menu.slug);
      void counts.get(menu.slug)?.refetch();
    }
  }

  return (
    <PartnerPageFrame>
      <h1 className="text-gms-title font-medium text-gms-text-heading">Approval</h1>
      <section aria-label="Approval settings" className="mt-8 rounded-gms-lg bg-gms-surface p-6">
        <p role="note" className="mb-4 flex items-start gap-2 rounded-gms-md border border-gms-border bg-gms-surface-muted px-4 py-3 text-gms-body text-gms-text">
          <Info aria-hidden size={16} className="mt-0.5 shrink-0 text-gms-info-dot" />
          {PREVIEW_NOTICE}
        </p>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[960px] border-collapse text-left">
            <caption className="sr-only">Approval settings</caption>
            <thead>
              <tr className="h-14 border-b border-gms-border bg-gms-page text-gms-body font-semibold text-gms-text">
                <th scope="col" className="w-[24%] min-w-[240px] pl-8 pr-4">Menu</th>
                <th scope="col" className="min-w-[520px] px-4">When a document is saved</th>
                <th scope="col" className="w-[200px] px-4">Waiting for approval</th>
                <th scope="col" className="w-[180px] px-4">Require approval</th>
              </tr>
            </thead>
            <tbody>
              {SETUP_ROWS.map((menu) => (
                <SettingRow
                  key={menu.slug}
                  menu={menu}
                  on={isNotAvailable(menu) ? true : settings[menu.slug]}
                  count={countOf(menu)}
                  canOpenApprove={menuAccess(mine, menu).approve}
                  checking={waitingOff === menu.slug}
                  onToggle={(next) => onToggle(menu, next)}
                  onRetry={() => void counts.get(menu.slug)?.refetch()}
                />
              ))}
            </tbody>
          </table>
        </div>
      </section>
      <ConfirmDialog
        open={dialog !== null}
        title={dialog?.text.title ?? ""}
        body={
          dialog?.text.lead ? (
            <p>
              <strong className="font-semibold">{dialog.text.lead}</strong> {dialog.text.body}
            </p>
          ) : (
            <p>{dialog?.text.body}</p>
          )
        }
        cancelLabel={dialog?.text.cancelLabel ?? "Cancel"}
        confirmLabel={dialog?.text.confirmLabel ?? ""}
        pendingLabel={dialog?.text.confirmLabel ?? ""}
        pending={false}
        confirmVariant="primary"
        onCancel={() => setDialog(null)}
        onConfirm={onConfirm}
      />
    </PartnerPageFrame>
  );
}

export function SettingRow({ menu, on, count, canOpenApprove, checking, onToggle, onRetry }: {
  menu: ApproveMenu;
  on: boolean;
  count: CountState | undefined;
  canOpenApprove: boolean;
  checking: boolean;
  onToggle: (next: boolean) => void;
  onRetry: () => void;
}) {
  const Icon = menu.icon;
  const notAvailable = isNotAvailable(menu);
  return (
    <tr className="h-[82px] border-b border-gms-border align-middle">
      <th scope="row" className="pl-8 pr-4 text-left font-normal">
        <span className="flex items-center gap-3 text-gms-body font-semibold text-gms-text">
          <Icon aria-hidden size={20} strokeWidth={1.5} className="shrink-0" />
          {menu.label}
        </span>
      </th>
      <td className="px-4 py-3">
        <StatusChainView on={on} />
        <p className="mt-1.5 text-gms-label text-gms-text-muted">{helperText(menu, on)}</p>
      </td>
      <td className="px-4">
        <WaitingCellView menu={menu} count={on && !notAvailable ? count : undefined} canOpenApprove={canOpenApprove} onRetry={onRetry} />
      </td>
      <td className="px-4">
        <span className="flex items-center gap-2" aria-busy={checking || undefined}>
          <Switch id={`approval-${menu.slug}`} label={on ? "On" : "Off"} checked={on} disabled={notAvailable || checking} hint={notAvailable ? "Not available yet" : undefined} onChange={onToggle} />
          {checking && <LoaderCircle aria-label="Checking waiting documents" size={14} className="animate-spin text-gms-text-muted" />}
        </span>
      </td>
    </tr>
  );
}

const chipClass: Record<ChipTone, string> = {
  step: "bg-gms-page text-gms-text-secondary",
  pending: "bg-gms-pending-chip text-gms-warning-text",
  approved: "bg-gms-success-subtle text-gms-status-active",
  revise: "bg-gms-warning-subtle text-gms-warning-text",
  rejected: "bg-gms-danger-subtle text-gms-danger",
};

function StatusChainView({ on }: { on: boolean }) {
  const chain = statusChain(on);
  return (
    <ol aria-label="Status after Save" className="flex flex-wrap items-center gap-2">
      {chain.map((step, index) => (
        <li key={index} className="flex items-center gap-2">
          {index > 0 && <ArrowRight aria-hidden size={16} className="text-gms-text-muted" />}
          {step.map((chip, chipIndex) => (
            <Fragment key={chip.label}>
              {chipIndex > 0 && <span aria-hidden className="px-1 text-gms-text-muted">/</span>}
              <span className={cx("inline-flex h-5 items-center rounded-gms-sm px-1.5 text-gms-label font-medium", chipClass[chip.tone])}>{chip.label}</span>
            </Fragment>
          ))}
        </li>
      ))}
    </ol>
  );
}

function WaitingCellView({ menu, count, canOpenApprove, onRetry }: { menu: ApproveMenu; count: CountState | undefined; canOpenApprove: boolean; onRetry: () => void }) {
  const cell = waitingCell(count);
  if (cell.kind === "none-applicable") return <span aria-label="Not applicable" className="text-gms-body text-gms-text-muted">—</span>;
  if (cell.kind === "loading") return <span aria-label="Loading" className="block h-4 w-24 animate-pulse rounded-gms-sm bg-gms-surface-sunken" />;
  if (cell.kind === "zero") return <span className="text-gms-body text-gms-text-muted">No documents</span>;
  if (cell.kind === "error") {
    return (
      <span className="flex items-center gap-2 text-gms-body text-gms-text-muted">
        Couldn&apos;t load
        <button type="button" aria-label={`Retry ${menu.label} count`} title="Retry" onClick={onRetry} className={cx("rounded-gms-sm p-1 hover:bg-gms-surface-sunken", focusRing)}>
          <RotateCw aria-hidden size={14} />
        </button>
      </span>
    );
  }
  const label = `${cell.total} ${menu.label} ${cell.total === 1 ? "document" : "documents"} waiting for approval`;
  if (!canOpenApprove) return <span aria-label={label} className="text-gms-body font-semibold text-gms-warning-text">{cell.text}</span>;
  return (
    <Link href={approveMenuHref(menu.slug)} aria-label={label} className={cx("inline-flex items-center gap-1 rounded-gms-sm text-gms-body font-semibold text-gms-warning-text hover:underline", focusRing)}>
      {cell.text}
      <ChevronRight aria-hidden size={14} />
    </Link>
  );
}
