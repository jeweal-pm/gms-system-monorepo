"use client";

import { Send } from "lucide-react";
import { useState, type ReactNode } from "react";
import { Button } from "@/features/quotation/components/ui";
import type { ConfirmRequest } from "@/features/quotation/components/use-confirm";
import { masterTrpc } from "@/lib/master-trpc";
import { retryTransient } from "@/lib/trpc-error";
import {
  flowActions,
  flowStatusNote,
  FLOW_STATUS_LABELS,
  mapFlowError,
  restoreStatusLabel,
  sendToApproveConfirm,
  sentMessage,
  type DocFlow,
  type DocumentApprovalType,
  type StatusNote,
} from "./flow-status";

/**
 * `approvalSetting.list` (api-contract): read by every document page to choose its buttons. Cached for the session,
 * fetched again whenever the window regains focus and after a setting-related error; the server applies the
 * committed setting regardless.
 */
export const APPROVAL_SETTING_QUERY = { staleTime: 5 * 60_000, refetchOnWindowFocus: "always" as const, retry: retryTransient };

export function useApprovalSetting(type: DocumentApprovalType): { requireApproval: boolean | undefined; refetch: () => Promise<unknown> } {
  const list = masterTrpc.approvalSetting.list.useQuery(undefined, APPROVAL_SETTING_QUERY);
  return {
    requireApproval: list.data?.items.find((item) => item.type === type)?.requireApproval,
    refetch: () => list.refetch(),
  };
}

export type DocumentFlowState = {
  requireApproval: boolean | undefined;
  /** Header props. */
  statusLabels: typeof FLOW_STATUS_LABELS;
  statusNote: StatusNote | null;
  hideEditDelete: boolean;
  canEdit: boolean;
  canDelete: boolean;
  /** The Send to approve button (null when it doesn't apply). */
  sendButton: ReactNode;
  /** Restore confirm text: the status the document goes back to. */
  restoreLabel: string;
  /**
   * A write failed: handles the ADR-0050 codes (toast, reload the document / the setting) and returns true, or false
   * for any other error (the page maps it as before).
   */
  handleError: (error: unknown, action: "save" | "delete" | "submit") => Promise<boolean>;
};

/**
 * FE-AS-010: one hook for the eight document pages. It reads the type's approval setting, turns the document's `Flow`
 * into the header's buttons and read-only text, runs Send to approve (`<doc>.submit`, after a confirm) and maps the
 * new error codes. The page keeps its own Save / Edit / Delete / Restore and passes how to reload the document.
 */
export function useDocumentFlow(input: {
  type: DocumentApprovalType;
  saved: { id?: string; docNo?: string; version?: number } | undefined;
  flow: DocFlow | null;
  deleted: boolean;
  access: { add: boolean; edit: boolean; delete: boolean };
  editing: boolean;
  dirty: boolean;
  busy: boolean;
  submit: (args: { id: string; expectedVersion: number }) => Promise<unknown>;
  confirm: (request: ConfirmRequest) => Promise<boolean>;
  toast: (message: string) => void;
  /** Loads the document again (the page remounts or resets with the server copy); the toast is kept. */
  reload: (message: string) => Promise<void>;
  /** Any other Send to approve error (the page's own mapping: changed, deleted, validation …). */
  onError: (error: unknown) => void;
}): DocumentFlowState {
  const { type, saved, flow, deleted, access, editing, dirty, busy, submit, confirm, toast, reload, onError } = input;
  const setting = useApprovalSetting(type);
  const [sending, setSending] = useState(false);
  const actions = flowActions({ flow: saved?.id ? flow : null, deleted, requireApproval: setting.requireApproval, access, editing, dirty });

  const handleError = async (error: unknown, action: "save" | "delete" | "submit") => {
    const outcome = mapFlowError(error, type, saved?.docNo, action);
    if (!outcome) return false;
    toast(outcome.message);
    if (outcome.settingChanged) await setting.refetch();
    if (outcome.refetch && saved?.id) await reload(outcome.message);
    return true;
  };

  const onSend = async () => {
    if (!saved?.id || !saved.version || !(await confirm(sendToApproveConfirm(saved.docNo)))) return;
    setSending(true);
    try {
      await submit({ id: saved.id, expectedVersion: saved.version });
      await reload(sentMessage(saved.docNo));
    } catch (error) {
      if (!(await handleError(error, "submit"))) onError(error);
    } finally {
      setSending(false);
    }
  };

  const sendButton = actions.showSend ? (
    <Button variant="primary" onClick={() => void onSend()} disabled={!actions.canSend || busy || sending} className="min-w-24">
      <Send className="size-4" /> {sending ? "Sending…" : "Send to approve"}
    </Button>
  ) : null;

  return {
    requireApproval: setting.requireApproval,
    statusLabels: FLOW_STATUS_LABELS,
    statusNote: saved?.id && !deleted ? flowStatusNote(flow) : null,
    hideEditDelete: deleted || !actions.showEditDelete,
    canEdit: actions.canEdit,
    canDelete: actions.canDelete,
    sendButton,
    restoreLabel: restoreStatusLabel(setting.requireApproval),
    handleError,
  };
}
