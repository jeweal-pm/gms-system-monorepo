"use client";

import { useQueryClient } from "@tanstack/react-query";
import { ArrowRight, ChevronRight, LoaderCircle } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Fragment, useState } from "react";
import { Button, cx, focusRing } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { Switch } from "@/components/ui/switch";
import { ToastProvider, useToast } from "@/components/ui/toast";
import { useMine } from "@/features/approve-center/api";
import { approveMenuHref, type ApproveMenu, type ApproveMenuSlug } from "@/features/approve-center/menus";
import { menuAccess } from "@/features/approve-center/model";
import { PartnerAccessGuard, PartnerPageFrame } from "@/features/partner/components/partner-page-parts";
import { APPROVAL_SETTING_QUERY } from "@/features/trade-document/approval-flow";
import { masterTrpc } from "@/lib/master-trpc";
import {
  blockedText,
  helperText,
  isNotAvailable,
  rowLocked,
  SETTINGS_LOAD_ERROR,
  settingOf,
  SETUP_ROWS,
  statusChain,
  switchedToast,
  turnOffDecision,
  turnOffText,
  turnOnText,
  updateFailure,
  VIEW_ONLY_HINT,
  waitingCell,
  type ApprovalSettingItem,
  type ChipTone,
  type DialogText,
} from "../model";

/** `approval-setup` catalog leaf (BE-AS-001, FE-AS-011): VIEW opens the page read-only, EDIT switches. */
export const APPROVAL_SETUP_ENTITY = { key: "approval-setup", singular: "Approval", plural: "Approvals" };

/** Setup › Approval (approval-setup UI rev 1; FE-AS-008 persisted settings, FE-AS-011 permissions). */
export function ApprovalSetupPage() {
  return (
    <ToastProvider>
      <PartnerAccessGuard entity={APPROVAL_SETUP_ENTITY}>{(access) => <ApprovalSetupWorkspace canEdit={access.edit} />}</PartnerAccessGuard>
    </ToastProvider>
  );
}

type OpenDialog = { kind: "on" | "off" | "blocked"; menu: ApproveMenu; text: DialogText };

/**
 * FE-AS-008: `approvalSetting.list` on the same query (key and options) as the document pages' `useApprovalSetting`,
 * so a switch here updates their buttons; `approvalSetting.update` per switch, not optimistic (the switch is busy until
 * the server answers, then shows the saved value).
 */
function ApprovalSetupWorkspace({ canEdit }: { canEdit: boolean }) {
  const toast = useToast();
  const router = useRouter();
  const queryClient = useQueryClient();
  const utils = masterTrpc.useUtils();
  const { mine } = useMine();
  const list = masterTrpc.approvalSetting.list.useQuery(undefined, APPROVAL_SETTING_QUERY);
  const [dialog, setDialog] = useState<OpenDialog | null>(null);
  const [saving, setSaving] = useState<ApproveMenuSlug | null>(null);
  const items = list.data?.items;

  function onToggle(menu: ApproveMenu, next: boolean) {
    if (saving || dialog) return;
    if (next) setDialog({ kind: "on", menu, text: turnOnText(menu) });
    else {
      const waiting = settingOf(items, menu.type)?.waiting;
      if (turnOffDecision(waiting) === "blocked") setDialog({ kind: "blocked", menu, text: blockedText(menu, waiting ?? 0) });
      else setDialog({ kind: "off", menu, text: turnOffText(menu) });
    }
  }

  async function save(menu: ApproveMenu, on: boolean) {
    const setting = settingOf(items, menu.type);
    if (!setting) return;
    setSaving(menu.slug);
    try {
      const saved = await utils.client.approvalSetting.update.mutate({ type: menu.type, requireApproval: on, expectedVersion: setting.version });
      utils.approvalSetting.list.setData(undefined, (current) =>
        current ? { ...current, items: current.items.map((item) => (item.type === saved.type ? { ...item, ...saved } : item)) } : current,
      );
      toast.show("success", switchedToast(menu, saved.requireApproval));
      await Promise.all([utils.approvalSetting.list.invalidate(), queryClient.invalidateQueries({ queryKey: [["approval"]] })]);
    } catch (error) {
      const failure = updateFailure(error, menu, setting.requireApproval);
      if (failure.kind === "blocked") {
        setDialog({ kind: "blocked", menu, text: blockedText(menu, failure.total) });
        void utils.approvalSetting.list.invalidate();
      } else {
        toast.show("error", failure.message);
        if (failure.refetchSettings) void utils.approvalSetting.list.invalidate();
        if (failure.refetchAccess) void queryClient.invalidateQueries({ queryKey: [["permission", "mine"]] });
      }
    } finally {
      setSaving(null);
    }
  }

  function onConfirm() {
    if (!dialog) return;
    const { kind, menu } = dialog;
    setDialog(null);
    if (kind === "on") void save(menu, true);
    else if (kind === "off") void save(menu, false);
    else router.push(approveMenuHref(menu.slug));
  }

  return (
    <PartnerPageFrame>
      <h1 className="text-gms-title font-medium text-gms-text-heading">Approval</h1>
      <section aria-label="Approval settings" className="mt-8 rounded-gms-lg bg-gms-surface p-6">
        {list.isError && !items ? (
          <div role="alert" className="flex flex-col items-start gap-3 py-8 text-gms-body text-gms-text">
            {SETTINGS_LOAD_ERROR}
            <Button onClick={() => void list.refetch()}>Retry</Button>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[960px] border-collapse text-left">
              <caption className="sr-only">Approval settings</caption>
              <thead>
                <tr className="h-14 border-b border-gms-border bg-gms-page text-gms-body font-semibold text-gms-text">
                  <th scope="col" className="w-[24%] min-w-[240px] pl-8 pr-4">Menu</th>
                  <th scope="col" className="min-w-[520px] px-4">When a document is saved</th>
                  <th scope="col" className="w-[200px] px-4">Waiting for approval</th>
                  <th scope="col" className="w-[180px] px-4" title={canEdit ? undefined : VIEW_ONLY_HINT}>
                    Require approval
                    {!canEdit && <span className="ml-2 text-gms-label font-normal text-gms-text-secondary">({VIEW_ONLY_HINT})</span>}
                  </th>
                </tr>
              </thead>
              <tbody>
                {SETUP_ROWS.map((menu) => (
                  <SettingRow
                    key={menu.slug}
                    menu={menu}
                    setting={settingOf(items, menu.type)}
                    canEdit={canEdit}
                    canOpenApprove={menuAccess(mine, menu).approve}
                    saving={saving === menu.slug}
                    onToggle={(next) => onToggle(menu, next)}
                  />
                ))}
              </tbody>
            </table>
          </div>
        )}
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

export function SettingRow({ menu, setting, canEdit, canOpenApprove, saving, onToggle }: {
  menu: ApproveMenu;
  /** undefined while the list loads (or for a type the server did not return). */
  setting: ApprovalSettingItem | undefined;
  canEdit: boolean;
  canOpenApprove: boolean;
  /** The row's update is running (not optimistic). */
  saving: boolean;
  onToggle: (next: boolean) => void;
}) {
  const Icon = menu.icon;
  const locked = rowLocked(menu, setting);
  const notAvailable = locked === "not-available";
  // Not-available types read On (Q-AS-04); a loading row shows its last known value only once loaded.
  const on = notAvailable ? true : (setting?.requireApproval ?? false);
  return (
    <tr className="h-[82px] border-b border-gms-border align-middle">
      <th scope="row" className="pl-8 pr-4 text-left font-normal">
        <span className="flex items-center gap-3 text-gms-body font-semibold text-gms-text">
          <Icon aria-hidden size={20} strokeWidth={1.5} className="shrink-0" />
          {menu.label}
        </span>
      </th>
      <td className="px-4 py-3">
        {locked === "loading" ? (
          <span aria-label="Loading" className="block h-4 w-64 animate-pulse rounded-gms-sm bg-gms-surface-sunken" />
        ) : (
          <>
            <StatusChainView on={on} />
            <p className="mt-1.5 text-gms-label text-gms-text-muted">{helperText(menu, on)}</p>
          </>
        )}
      </td>
      <td className="px-4">
        {locked === "loading" ? (
          <span aria-label="Loading" className="block h-4 w-24 animate-pulse rounded-gms-sm bg-gms-surface-sunken" />
        ) : (
          <WaitingCellView menu={menu} waiting={on && !notAvailable ? setting?.waiting : null} canOpenApprove={canOpenApprove} />
        )}
      </td>
      <td className="px-4">
        <span className="flex items-center gap-2" aria-busy={saving || undefined}>
          <Switch
            id={`approval-${menu.slug}`}
            label={on ? "On" : "Off"}
            checked={on}
            readOnly={!canEdit && !notAvailable}
            disabled={notAvailable || locked === "loading" || saving}
            hint={notAvailable ? "Not available yet" : undefined}
            onChange={onToggle}
          />
          {saving && <LoaderCircle aria-label="Saving" size={14} className="animate-spin text-gms-text-muted" />}
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

function WaitingCellView({ menu, waiting, canOpenApprove }: { menu: ApproveMenu; waiting: number | null | undefined; canOpenApprove: boolean }) {
  const cell = waitingCell(waiting);
  if (cell.kind === "none-applicable") return <span aria-label="Not applicable" className="text-gms-body text-gms-text-muted">—</span>;
  if (cell.kind === "zero") return <span className="text-gms-body text-gms-text-muted">No documents</span>;
  const label = `${cell.text.replace(/ documents?$/, "")} ${menu.label} ${cell.total === 1 ? "document" : "documents"} waiting for approval or sent back`;
  if (!canOpenApprove || isNotAvailable(menu)) return <span aria-label={label} className="text-gms-body font-semibold text-gms-warning-text">{cell.text}</span>;
  return (
    <Link href={approveMenuHref(menu.slug)} aria-label={label} className={cx("inline-flex items-center gap-1 rounded-gms-sm text-gms-body font-semibold text-gms-warning-text hover:underline", focusRing)}>
      {cell.text}
      <ChevronRight aria-hidden size={14} />
    </Link>
  );
}
