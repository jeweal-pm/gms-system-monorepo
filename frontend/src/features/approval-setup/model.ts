import { APPROVE_MENUS, type ApproveMenu, type ApproveMenuSlug, type AvailableMenu } from "@/features/approve-center/menus";
import type { CountState, Mine } from "@/features/approve-center/model";

/**
 * Setup › Approval pure rules (approval-setup UI rev 1, phase 1, owner 2026-11-09). The rows are the Approve Center
 * registry (sidebar order, Memo rows included). Phase 1 keeps the switches in page state only: nothing is saved.
 */

export type ApprovalSettings = Readonly<Record<ApproveMenuSlug, boolean>>;

/** The system today (owner answer 4): Quotation is approved on Save; every other type needs approval. */
export const DEFAULT_APPROVAL_SETTINGS: ApprovalSettings = Object.fromEntries(APPROVE_MENUS.map((menu) => [menu.slug, menu.slug !== "quotation"])) as Record<ApproveMenuSlug, boolean>;

export const SETUP_ROWS: readonly ApproveMenu[] = APPROVE_MENUS;

/** Load to Stock, Merge/Split Stock, Transfer Location: no page yet; switch On and disabled (Q-AS-04). */
export const isNotAvailable = (menu: ApproveMenu) => menu.availability === "not-available";

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

export const documentsLabel = (count: number) => `${count.toLocaleString("en-US")} ${count === 1 ? "document" : "documents"}`;

/** Count queries only for a type with a document API that the user may list (VIEW). */
export function countedSetupMenus(mine: Mine): AvailableMenu[] {
  const canView = (menu: ApproveMenu) => Boolean(mine && (mine.isSuperAdmin || mine.permissions === "ALL" || mine.permissions.includes(`${menu.leaf}:VIEW`)));
  return SETUP_ROWS.filter((menu): menu is AvailableMenu => menu.availability === "available" && canView(menu));
}

export type WaitingCell =
  | { kind: "none-applicable" }
  | { kind: "loading" }
  | { kind: "error" }
  | { kind: "zero" }
  | { kind: "count"; total: number; text: string };

/** `count` is undefined when the type has no count query (Quotation, not available, no VIEW). */
export function waitingCell(count: CountState | undefined): WaitingCell {
  if (!count) return { kind: "none-applicable" };
  if (count.status === "pending") return { kind: "loading" };
  if (count.status === "error") return { kind: "error" };
  const total = count.total ?? 0;
  return total > 0 ? { kind: "count", total, text: documentsLabel(total) } : { kind: "zero" };
}

// ---------- switch (C-AS-09…12) ----------

export type TurnOffDecision = "wait" | "blocked" | "confirm" | "failed";

/** Turning Off: never on an unknown count; blocked while any document waits (owner answer 3). */
export function turnOffDecision(count: CountState | undefined): TurnOffDecision {
  if (!count) return "confirm";
  if (count.status === "pending") return "wait";
  if (count.status === "error") return "failed";
  return (count.total ?? 0) > 0 ? "blocked" : "confirm";
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

/** Source 03: bold first sentence (singular / plural), then the instruction. */
export function blockedText(menu: ApproveMenu, total: number): DialogText {
  const lead = total === 1 ? `1 ${menu.label} document is still waiting for approval.` : `${total.toLocaleString("en-US")} ${menu.label} documents are still waiting for approval.`;
  return { title: "Can't turn off approval yet", lead, body: "Approve or reject them in the Approve menu first, then turn approval off.", confirmLabel: "Go to Approve", cancelLabel: "Close" };
}

export function checkFailedText(menu: ApproveMenu): DialogText {
  return { title: "Couldn't check waiting documents", body: `Try again in a moment. Approval for ${menu.label} stays on.`, confirmLabel: "Try again", cancelLabel: "Close" };
}

export const switchedToast = (menu: ApproveMenu, on: boolean) => `Approval turned ${on ? "on" : "off"} for ${menu.label}. Not saved yet.`;

/** Phase 1 notice (Q-AS-06). */
export const PREVIEW_NOTICE = "Preview only. These settings aren't saved yet: changes are lost when you refresh and don't change how documents are saved.";
