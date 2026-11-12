import { Logger } from "@nestjs/common";
import type { NotificationDocumentType } from "./notification-types";

/**
 * ADR-0049 D4: approvers of a document type = active users holding `<type>:APPROVE` and `<type>:VIEW`, plus Super
 * Admins, read from the auth-owned `auth.permission_holders` view through the master authz reader (registered at
 * start-up by MasterAuthzDatabase). The actor is never notified (Q-NT-08).
 */
export type ApproverLookup = (documentType: NotificationDocumentType) => Promise<string[]>;

const logger = new Logger("Notification");
let lookup: ApproverLookup | null = null;

export function setApproverLookup(next: ApproverLookup | null) {
  lookup = next;
}

/** A failed lookup never fails the save: the event is still recorded (the "All" tab), just without recipients. */
export async function approverRecipients(documentType: NotificationDocumentType, actorId: string): Promise<string[]> {
  if (!lookup) return [];
  try {
    const ids = await lookup(documentType);
    return [...new Set(ids)].filter((id) => id !== actorId);
  } catch (error) {
    logger.warn({ event: "notification.recipients_unavailable", documentType, errorName: error instanceof Error ? error.name : "unknown" });
    return [];
  }
}

/** The document's creator, unless they are the actor. */
export function creatorRecipient(createdBy: string | null | undefined, actorId: string): string[] {
  return createdBy && createdBy !== actorId ? [createdBy] : [];
}
