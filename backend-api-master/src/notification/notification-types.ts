/** ADR-0049 (owner 2026-11-11): document notifications owned by api-master. */

export const NOTIFICATION_TYPES = ["approval.pending", "document.approved", "document.rejected", "document.revision_requested"] as const;
export type NotificationType = (typeof NOTIFICATION_TYPES)[number];

/** The master documents with an approval step; each is also its menu / permission leaf. */
export const NOTIFICATION_DOCUMENT_TYPES = ["reserve", "memo-receive", "memo-return", "memo-out", "memo-out-return", "purchase-order", "purchase"] as const;
export type NotificationDocumentType = (typeof NOTIFICATION_DOCUMENT_TYPES)[number];

export function isNotificationDocumentType(value: string): value is NotificationDocumentType {
  return (NOTIFICATION_DOCUMENT_TYPES as readonly string[]).includes(value);
}

/** Display only (≤ 1 KB, CHECK in the table); never authoritative — opening the document re-reads it with a fresh check. */
export type NotificationSummary = { partyName?: string; amount?: string; currency?: string; reason?: string };

/** What is pushed after commit: ids only (the browser refetches the list). */
export type NotificationSignal = { eventId: string; type: NotificationType; documentType: NotificationDocumentType; recipients: readonly string[] };

export type NotificationItem = {
  id: string;
  type: NotificationType;
  documentType: NotificationDocumentType;
  documentId: string;
  docNo: string;
  summary: NotificationSummary;
  createdAt: string;
  readAt: string | null;
};
