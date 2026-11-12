import { APPROVE_MENUS, type ApprovalSettingType, type ApproveMenu } from "@/features/approve-center/menus";
import { readDomainError } from "@/lib/trpc-error";

/**
 * Setup › Approval pure rules (approval-setup UI rev 1; phase 2 FE-AS-008/011 on `approvalSetting.list` / `update`,
 * ADR-0050). The rows are the Approve Center registry (sidebar order, Memo rows included).
 */

export const SETUP_ROWS: readonly ApproveMenu[] = APPROVE_MENUS;

/** Load to Stock, Merge/Split Stock, Transfer Location: no page yet; switch On and disabled (Q-AS-04). */
export const isNotAvailable = (menu: ApproveMenu) => menu.availability === "not-available";

// ---------- server rows (FE-AS-008, api-contract `approvalSetting.list`) ----------

export type ApprovalSettingItem = {
  type: string;
  requireApproval: boolean;
  /** false for the three future types: the switch stays disabled (G6). */
  available: boolean;
  version: number;
  updatedAt: string;
  updatedByName: string | null;
  /** PENDING_APPROVAL + REVISION_REQUESTED, capped at 100; null without approval-setup:VIEW (shown "—"). */
  waiting: number | null;
};

export const settingOf = (items: readonly ApprovalSettingItem[] | undefined, type: ApprovalSettingType) => items?.find((item) => item.type === type);

/** A row can be switched only when the page has it, the server says it is available and the user has EDIT. */
export function rowLocked(menu: ApproveMenu, setting: ApprovalSettingItem | undefined): "not-available" | "loading" | null {
  if (isNotAvailable(menu) || (setting && !setting.available)) return "not-available";
  return setting ? null : "loading";
}

// ---------- status chain (C-AS-05/06) ----------

export type ChipTone = "step" | "pending" | "approved" | "revise" | "rejected";
export type Chip = { tone: ChipTone; label: string };
/** Steps joined by "→"; a step with several chips is joined by "/". */
export type Chain = readonly (readonly Chip[])[];

const SAVE: Chip = { tone: "step", label: "Save" }; // Q-AS-01 (owner 2026-11-09): "Save", not "Draft"
const PENDING: Chip = { tone: "pending", label: "Pending approval" };
const APPROVED: Chip = { tone: "approved", label: "Approved" };
const REVISE: Chip = { tone: "revise", label: "Revise" };
const REJECTED: Chip = { tone: "rejected", label: "Rejected" };

export function statusChain(on: boolean): Chain {
  return on ? [[SAVE], [PENDING], [APPROVED, REVISE, REJECTED]] : [[SAVE], [APPROVED]];
}

/**
 * Helper line under the chain. On: the design's sentence (Q-AS-02, owner 2026-11-09: a pending document can't be
 * edited). Off: Quotation keeps the design's sentence; approved documents of the other types are read-only (Q-AS-03).
 */
export function helperText(menu: ApproveMenu, on: boolean): string {
  if (on) return "Waits in the Approve menu and can't be edited until the approver decides.";
  if (menu.slug === "quotation") return "Approved automatically on Save. Can still be edited later.";
  return "Approved automatically on Save and takes effect at once. Can't be edited afterwards.";
}

// ---------- waiting for approval (C-AS-07) ----------

/** `waiting` is capped at 100 by the server: 100 reads "100+". */
export const WAITING_CAP = 100;

export const documentsLabel = (count: number) => `${count >= WAITING_CAP ? `${WAITING_CAP}+` : count.toLocaleString("en-US")} ${count === 1 ? "document" : "documents"}`;

export type WaitingCell = { kind: "none-applicable" } | { kind: "zero" } | { kind: "count"; total: number; text: string };

/** `waiting` null (no approval-setup:VIEW, a type that is off or not available) → "—". */
export function waitingCell(waiting: number | null | undefined): WaitingCell {
  if (waiting === null || waiting === undefined) return { kind: "none-applicable" };
  return waiting > 0 ? { kind: "count", total: waiting, text: documentsLabel(waiting) } : { kind: "zero" };
}

// ---------- switch (C-AS-09…12) ----------

/** Turning Off: blocked at once when the loaded count shows waiting documents; otherwise confirm and let the server decide. */
export function turnOffDecision(waiting: number | null | undefined): "blocked" | "confirm" {
  return (waiting ?? 0) > 0 ? "blocked" : "confirm";
}

export type DialogText = { title: string; lead?: string; body: string; confirmLabel: string; cancelLabel: string };

export function turnOnText(menu: ApproveMenu): DialogText {
  return {
    title: `Turn on approval for ${menu.label}?`,
    body: `From now on, a saved ${menu.label} waits in the Approve menu until an approver approves, sends back or rejects it. Documents already saved don't change.`,
    confirmLabel: "Turn on",
    cancelLabel: "Cancel",
  };
}

export function turnOffText(menu: ApproveMenu): DialogText {
  const body =
    menu.slug === "quotation"
      ? "From now on, saving a Quotation approves it at once. Documents already saved don't change."
      : `From now on, saving a ${menu.label} approves it at once, and its stock changes happen on Save. Documents already approved don't change.`;
  return { title: `Turn off approval for ${menu.label}?`, body, confirmLabel: "Turn off", cancelLabel: "Cancel" };
}

/**
 * Source 03 layout with the Q-AS-12 / error-handling wording (waiting includes documents sent back for revision): bold
 * first sentence (singular / plural), then the instruction.
 */
export function blockedText(menu: ApproveMenu, total: number): DialogText {
  const lead =
    total === 1
      ? `1 ${menu.label} document is still waiting for approval or sent back for revision.`
      : `${total >= WAITING_CAP ? `${WAITING_CAP}+` : total.toLocaleString("en-US")} ${menu.label} documents are still waiting for approval or sent back for revision.`;
  return {
    title: "Can't turn off approval yet",
    lead,
    body: "Finish them in the Approve menu (or have them sent again or deleted) first, then turn approval off.",
    confirmLabel: "Go to Approve",
    cancelLabel: "Close",
  };
}

export const switchedToast = (menu: ApproveMenu, on: boolean) => `Approval turned ${on ? "on" : "off"} for ${menu.label}.`;

/** What a failed `approvalSetting.update` does (api-contract errors, approval-setup error-handling). */
export type UpdateFailure =
  | { kind: "blocked"; total: number }
  | { kind: "toast"; message: string; refetchSettings: boolean; refetchAccess: boolean };

export function updateFailure(error: unknown, menu: ApproveMenu, on: boolean): UpdateFailure {
  const { domainCode, details } = readDomainError(error);
  if (domainCode === "APPROVAL_SETTING_HAS_WAITING") {
    const count = (value: unknown) => (typeof value === "number" && Number.isFinite(value) ? value : 0);
    return { kind: "blocked", total: count(details?.pending) + count(details?.revision) };
  }
  const toast = (message: string, refetchSettings = true, refetchAccess = false): UpdateFailure => ({ kind: "toast", message, refetchSettings, refetchAccess });
  if (domainCode === "APPROVAL_SETTING_CHANGED") return toast(`Approval for ${menu.label} was changed by someone else.`);
  if (domainCode === "VALIDATION_ERROR") return toast(`Approval for ${menu.label} is not available yet.`);
  if (domainCode === "PERMISSION_DENIED" || domainCode === "FORBIDDEN") return toast("You don't have permission to change approval settings.", true, true);
  if (domainCode === "CSRF_INVALID") return toast("Your session needs a refresh. Reload the page and try again.", false);
  if (domainCode === "UNAUTHORIZED") return toast("Your session has ended. Sign in again.", false);
  return toast(`Couldn't save. Approval for ${menu.label} is still ${on ? "on" : "off"}.`, false);
}

export const SETTINGS_LOAD_ERROR = "Couldn't load the approval settings.";
export const VIEW_ONLY_HINT = "View only";
