import { uuidV7 } from "@gms/storage";
import { validationException } from "../common/errors";
import type { Tx } from "../common/persistence";
import { prisma } from "../database/prisma-client";
import type { NotificationDocumentType, NotificationItem, NotificationSignal, NotificationSummary, NotificationType } from "./notification-types";

/** ADR-0049 D2/D5/D11: storage of master document notifications. */

export const NOTIFICATION_PAGE_MAX = 20;
export const NOTIFICATION_RETENTION_DAYS = 90;
export const NOTIFICATION_PURGE_BATCH = 5_000;
const SUMMARY_TEXT_MAX = 200;

const clip = (value: unknown) => (typeof value === "string" && value.trim() ? value.trim().slice(0, SUMMARY_TEXT_MAX) : undefined);

/** Display-only summary, every text clipped so the row stays ≤ 1 KB. */
export function cleanSummary(summary: NotificationSummary): NotificationSummary {
  const clean: NotificationSummary = {};
  for (const key of ["partyName", "amount", "currency", "reason"] as const) {
    const value = clip(summary[key]);
    if (value) clean[key] = value;
  }
  return clean;
}

export type RecordInput = {
  type: NotificationType;
  documentType: NotificationDocumentType;
  documentId: string;
  docNo: string;
  actorId: string;
  recipients: readonly string[];
  summary: NotificationSummary;
};

/** Inside the document's own transaction (D3): the event and its recipient rows commit with the status change. */
export async function recordNotification(tx: Tx, input: RecordInput): Promise<NotificationSignal> {
  const id = uuidV7();
  const createdAt = new Date();
  const recipients = [...new Set(input.recipients)].filter((userId) => userId !== input.actorId);
  await tx.notificationEvent.create({
    data: { id, type: input.type, documentType: input.documentType, documentId: input.documentId, docNo: input.docNo, actorUserId: input.actorId, summary: cleanSummary(input.summary), createdAt },
  });
  if (recipients.length > 0) {
    await tx.notificationRecipient.createMany({ data: recipients.map((userId) => ({ eventId: id, userId, createdAt })) });
  }
  return { eventId: id, type: input.type, documentType: input.documentType, recipients };
}

// ---------- keyset cursor: base64url("<ISO time>|<uuid>") ----------

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

export function encodeCursor(createdAt: Date, id: string) {
  return Buffer.from(`${createdAt.toISOString()}|${id}`).toString("base64url");
}

export function decodeCursor(cursor: string): { createdAt: Date; id: string } {
  const text = Buffer.from(cursor, "base64url").toString();
  const [time, id, extra] = text.split("|");
  const createdAt = new Date(time ?? "");
  if (extra !== undefined || !id || !UUID.test(id) || Number.isNaN(createdAt.getTime()) || createdAt.toISOString() !== time) {
    throw validationException([{ path: "cursor", code: "invalid" }]);
  }
  return { createdAt, id };
}

type EventRow = { id: string; type: string; documentType: string; documentId: string; docNo: string; summary: unknown; createdAt: Date };

function toItem(event: EventRow, readAt: Date | null): NotificationItem {
  return {
    id: event.id,
    type: event.type as NotificationType,
    documentType: event.documentType as NotificationDocumentType,
    documentId: event.documentId,
    docNo: event.docNo,
    summary: cleanSummary((event.summary ?? {}) as NotificationSummary),
    createdAt: event.createdAt.toISOString(),
    readAt: readAt ? readAt.toISOString() : null,
  };
}

const pageSize = (limit: number | undefined) => Math.min(Math.max(limit ?? NOTIFICATION_PAGE_MAX, 1), NOTIFICATION_PAGE_MAX);

/** "For me": the caller's own recipient rows, newest first, with read state. */
export async function listForUser(userId: string, cursor: string | null | undefined, limit?: number) {
  const take = pageSize(limit);
  const after = cursor ? decodeCursor(cursor) : null;
  const rows = await prisma.notificationRecipient.findMany({
    where: {
      userId,
      ...(after ? { OR: [{ createdAt: { lt: after.createdAt } }, { createdAt: after.createdAt, eventId: { lt: after.id } }] } : {}),
    },
    orderBy: [{ createdAt: "desc" }, { eventId: "desc" }],
    take: take + 1,
    select: { createdAt: true, eventId: true, readAt: true, event: { select: { id: true, type: true, documentType: true, documentId: true, docNo: true, summary: true, createdAt: true } } },
  });
  const page = rows.slice(0, take);
  const last = page[page.length - 1];
  return { items: page.map((row) => toItem(row.event, row.readAt)), nextCursor: rows.length > take && last ? encodeCursor(last.createdAt, last.eventId) : null };
}

/** "All": every event of the document types the caller may VIEW, newest first, no read state (Q-NT-02). */
export async function listForTypes(types: readonly NotificationDocumentType[], cursor: string | null | undefined, limit?: number) {
  const take = pageSize(limit);
  if (types.length === 0) return { items: [], nextCursor: null };
  const after = cursor ? decodeCursor(cursor) : null;
  const rows = await prisma.notificationEvent.findMany({
    where: {
      documentType: { in: [...types] },
      ...(after ? { OR: [{ createdAt: { lt: after.createdAt } }, { createdAt: after.createdAt, id: { lt: after.id } }] } : {}),
    },
    orderBy: [{ createdAt: "desc" }, { id: "desc" }],
    take: take + 1,
    select: { id: true, type: true, documentType: true, documentId: true, docNo: true, summary: true, createdAt: true },
  });
  const page = rows.slice(0, take);
  const last = page[page.length - 1];
  return { items: page.map((row) => toItem(row, null)), nextCursor: rows.length > take && last ? encodeCursor(last.createdAt, last.id) : null };
}

export async function unreadCount(userId: string) {
  return { count: await prisma.notificationRecipient.count({ where: { userId, readAt: null } }) };
}

/** Only the caller's own unread rows; unknown ids are ignored. */
export async function markRead(userId: string, ids: readonly string[]) {
  const result = await prisma.notificationRecipient.updateMany({ where: { userId, eventId: { in: [...ids] }, readAt: null }, data: { readAt: new Date() } });
  return { updated: result.count };
}

export async function markAllRead(userId: string) {
  const result = await prisma.notificationRecipient.updateMany({ where: { userId, readAt: null }, data: { readAt: new Date() } });
  return { updated: result.count };
}

/** D11: deletes events older than the retention, one bounded batch per call (recipients go by CASCADE). */
export async function purgeExpired(now = new Date()) {
  const before = new Date(now.getTime() - NOTIFICATION_RETENTION_DAYS * 86_400_000);
  const deleted = await prisma.$executeRaw`
    DELETE FROM "partner"."notification_event"
    WHERE "id" IN (SELECT "id" FROM "partner"."notification_event" WHERE "created_at" < ${before} LIMIT ${NOTIFICATION_PURGE_BATCH})
  `;
  return { deleted };
}
