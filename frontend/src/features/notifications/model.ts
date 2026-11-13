import { approveMenuFor, approveMenuHref, type ApproveMenuSlug } from "@/features/approve-center/menus";

/**
 * Notifications (UI rev 1 / ADR-0049, owner 2026-11-11): pure view logic for the bell panel. The data shapes follow
 * api-contract rev 1 (`notification.list` / `unreadCount`).
 */
export type NotificationType = "approval.pending" | "document.approved" | "document.rejected" | "document.revision_requested";
export type NotificationScope = "for-me" | "all";

export type NotificationItem = {
  id: string;
  type: NotificationType;
  documentType: string;
  documentId: string;
  docNo: string;
  summary: { partyName?: string; amount?: string; currency?: string; reason?: string };
  createdAt: string;
  readAt: string | null;
};

export const NOTIFICATION_PAGE_SIZE = 20;
export const ANNOUNCE_EVERY_MS = 10_000;

const ACTION: Record<NotificationType, string> = {
  "approval.pending": "waits for your approval",
  "document.approved": "was approved",
  "document.rejected": "was rejected",
  "document.revision_requested": "was sent back for revision",
};

/** "RS2611002" + "waits for your approval" (the number is shown bold). */
export function titleParts(item: Pick<NotificationItem, "type" | "docNo">): { docNo: string; action: string } {
  return { docNo: item.docNo, action: ACTION[item.type] ?? "was updated" };
}

/** Document-type badge, e.g. "Reserve" (the Approve menu label). */
export function typeLabel(documentType: string): string {
  return approveMenuFor(documentType)?.label ?? documentType;
}

/** "1,234.50" from the server's plain decimal string; anything else is shown as given. */
export function groupDigits(amount: string): string {
  const match = /^(-?)(\d+)(\.\d+)?$/.exec(amount);
  if (!match) return amount;
  return `${match[1]}${match[2].replace(/\B(?=(\d{3})+(?!\d))/g, ",")}${match[3] ?? ""}`;
}

/** Body text: "Siam Gems Trading Co., Ltd. · 172,020.00 THB" (the reason has its own line, `reasonText`). */
export function bodyText(item: Pick<NotificationItem, "summary">): string {
  const { partyName, amount, currency } = item.summary;
  const money = amount ? [groupDigits(amount), currency].filter(Boolean).join(" ") : "";
  return [partyName, money].filter(Boolean).join(" · ");
}

/**
 * BE-NT-007: the approver's words on a rejected / sent-back document, "Reason: …" / "Note: …", on a line of its own so
 * a long party name never pushes it out of view. `null` for other types or without a reason.
 */
export function reasonText(item: Pick<NotificationItem, "type" | "summary">): string | null {
  const reason = item.summary.reason?.trim();
  if (!reason) return null;
  if (item.type === "document.rejected") return `Reason: ${reason}`;
  if (item.type === "document.revision_requested") return `Note: ${reason}`;
  return null;
}

/** Row target: the document itself (Q-NT-03). `null` when the type has no page in this app. */
export function documentHref(item: Pick<NotificationItem, "documentType" | "documentId">): string | null {
  const menu = approveMenuFor(item.documentType);
  if (!menu || menu.availability === "not-available") return null;
  return `${menu.documentBase}/${encodeURIComponent(item.documentId)}`;
}

/**
 * Row target (owner 2026-11-12): "waits for your approval" opens Approve › {type}, where the approver acts on it;
 * approved / rejected / sent back open the document itself.
 */
export function openHref(item: Pick<NotificationItem, "documentType" | "documentId" | "type">): string | null {
  if (item.type === "approval.pending") {
    const menu = approveMenuFor(item.documentType);
    return menu && menu.availability !== "not-available" ? approveMenuHref(menu.slug as ApproveMenuSlug) : null;
  }
  return documentHref(item);
}

/** Chevron "Open list page": Approve › {type} for a pending approval, otherwise the document list (Q-NT-03). */
export function listHref(item: Pick<NotificationItem, "documentType" | "type">): string | null {
  const menu = approveMenuFor(item.documentType);
  if (!menu || menu.availability === "not-available") return null;
  return item.type === "approval.pending" ? approveMenuHref(menu.slug as ApproveMenuSlug) : menu.documentBase;
}

/** Red badge on "For me": hidden at 0, capped at "99+". */
export function countBadge(count: number | undefined): string | null {
  if (!count || count < 1) return null;
  return count > 99 ? "99+" : String(count);
}

/** Bell accessible name, e.g. "Notifications, 6 unread". */
export function bellLabel(count: number | undefined): string {
  return count && count > 0 ? `Notifications, ${count} unread` : "Notifications";
}

const startOfDay = (date: Date) => new Date(date.getFullYear(), date.getMonth(), date.getDate()).getTime();
const DAY_MS = 86_400_000;

function dayOffset(date: Date, now: Date): number {
  return Math.round((startOfDay(now) - startOfDay(date)) / DAY_MS);
}

const dateFormatter = new Intl.DateTimeFormat("en-GB", { day: "2-digit", month: "short", year: "numeric" });
const dayMonthFormatter = new Intl.DateTimeFormat("en-GB", { day: "2-digit", month: "short" });
const timeFormatter = new Intl.DateTimeFormat("en-US", { hour: "numeric", minute: "2-digit", hour12: true });

/** Section label: "Today", "Yesterday", then "02 Nov 2026". */
export function dayLabel(date: Date, now: Date): string {
  const offset = dayOffset(date, now);
  if (offset === 0) return "Today";
  if (offset === 1) return "Yesterday";
  return dateFormatter.format(date);
}

/** Item time: "Today at 9:42 AM", "Yesterday at 9:42 AM", "02 Nov at 9:42 AM". */
export function timeLabel(date: Date, now: Date): string {
  const offset = dayOffset(date, now);
  const prefix = offset === 0 ? "Today" : offset === 1 ? "Yesterday" : dayMonthFormatter.format(date);
  return `${prefix} at ${timeFormatter.format(date)}`;
}

/** Newest first, grouped by local day; an id seen twice (page overlap) is shown once. */
export function groupByDay<T extends Pick<NotificationItem, "id" | "createdAt">>(items: readonly T[], now: Date): { label: string; items: T[] }[] {
  const seen = new Set<string>();
  const groups: { label: string; items: T[] }[] = [];
  for (const item of items) {
    if (seen.has(item.id)) continue;
    seen.add(item.id);
    const label = dayLabel(new Date(item.createdAt), now);
    const last = groups[groups.length - 1];
    if (last?.label === label) last.items.push(item);
    else groups.push({ label, items: [item] });
  }
  return groups;
}
