import { uuidV7 } from "@gms/storage";
import { validationError } from "../errors";
import { Prisma, type Db, type Tx } from "../db";

/**
 * Inventory-owned notifications (ADR-0052 D12, ADR-0049 D2/D5/D11 shapes as master): written in the status-change
 * transaction; the SSE stream only signals ids. Q-LS-32: approvers on Send to approve; the creator on Approve / Revise /
 * Reject. The actor is never a recipient.
 */
export const NOTIFICATION_TYPES = ["approval.pending", "document.approved", "document.rejected", "document.revision_requested"] as const;
export type NotificationType = (typeof NOTIFICATION_TYPES)[number];
export const NOTIFICATION_DOCUMENT_TYPES = ["load-to-stock", "sale", "stock-transfer-location", "stock-adjustment"] as const;
export type NotificationDocumentType = (typeof NOTIFICATION_DOCUMENT_TYPES)[number];
export type NotificationSummary = { partyName?: string; amount?: string; currency?: string; reason?: string };
export type NotificationSignal = { eventId: string; type: NotificationType; documentType: NotificationDocumentType; recipients: readonly string[] };

export const NOTIFICATION_PAGE_MAX = 20;
export const NOTIFICATION_RETENTION_DAYS = 90;
export const SYNC_OP_RETENTION_DAYS = 30;
export const PURGE_BATCH = 5_000;
const SUMMARY_BYTES_MAX = 960;

const clip = (value: unknown) => {
  if (typeof value !== "string") return undefined;
  const text = Array.from(value.trim().replace(/[\uD800-\uDBFF](?![\uDC00-\uDFFF])|(?<![\uD800-\uDBFF])[\uDC00-\uDFFF]/g, "�")).slice(0, 200).join("").trimEnd();
  return text || undefined;
};

export function cleanSummary(summary: NotificationSummary): NotificationSummary {
  const clean: NotificationSummary = {};
  for (const key of ["partyName", "amount", "currency", "reason"] as const) {
    const value = clip(summary[key]);
    if (value) clean[key] = value;
  }
  for (const key of ["reason", "partyName"] as const) {
    const chars = Array.from(clean[key] ?? "");
    let keep = chars.length;
    while (keep > 0 && Buffer.byteLength(JSON.stringify(clean), "utf8") > SUMMARY_BYTES_MAX) {
      keep = Math.floor(keep * 0.9);
      const kept = chars.slice(0, keep).join("").trimEnd();
      if (kept) clean[key] = `${kept}…`;
      else delete clean[key];
    }
  }
  return clean;
}

export type RecordInput = {
  type: NotificationType; documentId: string; docNo: string; actorId: string; recipients: readonly string[]; summary: NotificationSummary;
  /** Default `load-to-stock`; Sale passes `sale` (ADR-0054 D8). */
  documentType?: NotificationDocumentType;
};

/** Inside the document's own transaction: one event + one set-based recipient insert. */
export async function recordNotification(tx: Tx, input: RecordInput): Promise<NotificationSignal> {
  const id = uuidV7();
  const createdAt = new Date();
  const documentType = input.documentType ?? "load-to-stock";
  const recipients = [...new Set(input.recipients)].filter((userId) => userId !== input.actorId);
  await tx.notification_event.create({
    data: { id, type: input.type, document_type: documentType, document_id: input.documentId, doc_no: input.docNo, actor_user_id: input.actorId, summary: cleanSummary(input.summary), created_at: createdAt },
  });
  if (recipients.length > 0) await tx.notification_recipient.createMany({ data: recipients.map((userId) => ({ event_id: id, user_id: userId, created_at: createdAt })) });
  return { eventId: id, type: input.type, documentType, recipients };
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
export function encodeCursor(createdAt: Date, id: string) {
  return Buffer.from(`${createdAt.toISOString()}|${id}`).toString("base64url");
}
export function decodeCursor(cursor: string): { createdAt: Date; id: string } {
  const [time, id, extra] = Buffer.from(cursor, "base64url").toString().split("|");
  const createdAt = new Date(time ?? "");
  if (extra !== undefined || !id || !UUID.test(id) || Number.isNaN(createdAt.getTime()) || createdAt.toISOString() !== time) throw validationError([{ path: "cursor", code: "invalid" }]);
  return { createdAt, id };
}

type EventRow = { id: string; type: string; document_type: string; document_id: string; doc_no: string; summary: unknown; created_at: Date };
const toItem = (event: EventRow, readAt: Date | null) => ({
  id: event.id, type: event.type as NotificationType, documentType: event.document_type as NotificationDocumentType, documentId: event.document_id,
  docNo: event.doc_no, summary: cleanSummary((event.summary ?? {}) as NotificationSummary), createdAt: event.created_at.toISOString(), readAt: readAt ? readAt.toISOString() : null,
});
const pageSize = (limit: number | undefined) => Math.min(Math.max(limit ?? NOTIFICATION_PAGE_MAX, 1), NOTIFICATION_PAGE_MAX);
const eventSelect = { id: true, type: true, document_type: true, document_id: true, doc_no: true, summary: true, created_at: true } as const;

/** "For me": one query (recipient rows + their events), newest first. */
export async function listForUser(db: Db, userId: string, cursor: string | undefined, limit?: number) {
  const take = pageSize(limit);
  const after = cursor ? decodeCursor(cursor) : null;
  const rows = await db.$queryRaw<(EventRow & { r_created_at: Date; read_at: Date | null })[]>`
    SELECT e."id", e."type", e."document_type", e."document_id", e."doc_no", e."summary", e."created_at", r."created_at" AS "r_created_at", r."read_at"
    FROM "inventory"."notification_recipient" r JOIN "inventory"."notification_event" e ON e."id" = r."event_id"
    WHERE r."user_id" = ${userId} ${after ? Prisma.sql`AND (r."created_at", r."event_id") < (${after.createdAt}, ${after.id}::uuid)` : Prisma.empty}
    ORDER BY r."created_at" DESC, r."event_id" DESC
    LIMIT ${take + 1}`;
  const page = rows.slice(0, take);
  const last = page[page.length - 1];
  return { items: page.map((row) => toItem(row, row.read_at)), nextCursor: rows.length > take && last ? encodeCursor(last.r_created_at, last.id) : null };
}

/** "All": events of the document types the caller may VIEW, no read state. */
export async function listForTypes(db: Db, types: readonly NotificationDocumentType[], cursor: string | undefined, limit?: number) {
  const take = pageSize(limit);
  if (types.length === 0) return { items: [], nextCursor: null };
  const after = cursor ? decodeCursor(cursor) : null;
  const rows = await db.notification_event.findMany({
    where: { document_type: { in: [...types] }, ...(after ? { OR: [{ created_at: { lt: after.createdAt } }, { created_at: after.createdAt, id: { lt: after.id } }] } : {}) },
    orderBy: [{ created_at: "desc" }, { id: "desc" }],
    take: take + 1,
    select: eventSelect,
  });
  const page = rows.slice(0, take);
  const last = page[page.length - 1];
  return { items: page.map((row) => toItem(row, null)), nextCursor: rows.length > take && last ? encodeCursor(last.created_at, last.id) : null };
}

export async function unreadCount(db: Db, userId: string) {
  return { count: await db.notification_recipient.count({ where: { user_id: userId, read_at: null } }) };
}
export async function markRead(db: Db, userId: string, ids: readonly string[]) {
  const result = await db.notification_recipient.updateMany({ where: { user_id: userId, event_id: { in: [...ids] }, read_at: null }, data: { read_at: new Date() } });
  return { updated: result.count };
}
export async function markAllRead(db: Db, userId: string) {
  const result = await db.notification_recipient.updateMany({ where: { user_id: userId, read_at: null }, data: { read_at: new Date() } });
  return { updated: result.count };
}

/** ADR-0049 D11 + database-diagram "Retention": one bounded batch each of old notifications and DONE sync ops. */
export async function purgeExpired(db: Db, now = new Date()) {
  const before = new Date(now.getTime() - NOTIFICATION_RETENTION_DAYS * 86_400_000);
  const opsBefore = new Date(now.getTime() - SYNC_OP_RETENTION_DAYS * 86_400_000);
  const deleted = await db.$executeRaw`
    DELETE FROM "inventory"."notification_event"
    WHERE "id" IN (SELECT "id" FROM "inventory"."notification_event" WHERE "created_at" < ${before} LIMIT ${PURGE_BATCH})`;
  const loadOps = await db.$executeRaw`
    DELETE FROM "inventory"."master_sync_op"
    WHERE "id" IN (SELECT "id" FROM "inventory"."master_sync_op" WHERE "state" = 'DONE' AND "updated_at" < ${opsBefore} LIMIT ${PURGE_BATCH})`;
  // sale ADR-0054 D6: the Sale saga table follows the same retention (sale_sync_op_done_idx).
  const saleOps = await db.$executeRaw`
    DELETE FROM "inventory"."sale_sync_op"
    WHERE "id" IN (SELECT "id" FROM "inventory"."sale_sync_op" WHERE "state" = 'DONE' AND "updated_at" < ${opsBefore} LIMIT ${PURGE_BATCH})`;
  return { deleted, ops: loadOps + saleOps };
}
