import { HttpException, HttpStatus } from "@nestjs/common";
import { errorBody } from "../common/errors";
import type { Tx } from "../common/persistence";
import { Prisma } from "../generated/prisma/client";
import { issueStockIds } from "../trade-document/memo-receive.service";
import type { StockIdIssuePutInput, StockIdIssueType } from "./inventory-internal.schemas";

/**
 * stock-transfer-location ADR-0060 D6 (BE-STL-002): Stock IDs for an inventory document that is not a Load to Stock, issued
 * from the one Stock ID counter (`issueStockIds`, ADR-0052 D5) and recorded per (document type, document id, revision) in
 * `partner.stock_id_issue`, in ONE master transaction.
 *
 * - The same revision replays the stored ids (the first `count`, `replayed: true`). A replay asking for MORE ids than were
 *   stored (the document's lines changed before its apply committed) appends only the missing ids, so the ids already
 *   handed out keep their order and are never issued twice.
 * - A revision below the newest stored one → 409 STOCK_ID_ISSUE_STALE {appliedRevision}.
 * - Ids of a revision that inventory never applied stay recorded (gaps are allowed, ADR-0052 D5); nothing is reused.
 *
 * Lock order: a transaction advisory lock per document (serializes two calls for one document), then the Stock ID
 * advisory lock and counter row inside `issueStockIds` (always the last lock, as for every other issuer).
 * Statements (independent of the count): lock, newest row, (Stock ID lock + counter) when issuing, insert / append = ≤ 5.
 */
export type StockIdIssueResult = { revision: number; stockIds: string[]; replayed: boolean };

const MESSAGES: Record<string, string> = {
  STOCK_ID_ISSUE_STALE: "The Stock ID issue revision is older than the applied one",
};

export function stockIdIssueException(code: string, status: number, details?: Record<string, unknown>) {
  const body = errorBody(code);
  return new HttpException({ error: { ...body.error, message: MESSAGES[code] ?? body.error.message, ...(details ? { details } : {}) } }, status);
}

export async function issueForDocument(
  tx: Tx, documentType: StockIdIssueType, documentId: string, input: StockIdIssuePutInput, actorId: string | null, clock: () => Date,
): Promise<StockIdIssueResult> {
  const lockKey = `partner.stock_id_issue:${documentType}:${documentId}`;
  await tx.$queryRaw(Prisma.sql`SELECT 1 AS locked FROM (SELECT pg_advisory_xact_lock(hashtext(${lockKey}))) AS l`);
  const [newest] = await tx.$queryRaw<{ revision: number; stock_ids: string[] }[]>(Prisma.sql`
    SELECT "revision", "stock_ids" FROM "partner"."stock_id_issue"
    WHERE "document_type" = ${documentType} AND "document_id" = ${documentId}::uuid
    ORDER BY "revision" DESC LIMIT 1`);
  if (newest && input.revision < newest.revision) {
    throw stockIdIssueException("STOCK_ID_ISSUE_STALE", HttpStatus.CONFLICT, { appliedRevision: newest.revision });
  }
  if (newest && newest.revision === input.revision) {
    if (input.count <= newest.stock_ids.length) return { revision: input.revision, stockIds: newest.stock_ids.slice(0, input.count), replayed: true };
    const extra = await issueStockIds(tx, input.count - newest.stock_ids.length, clock);
    await tx.$executeRaw(Prisma.sql`
      UPDATE "partner"."stock_id_issue" SET "stock_ids" = "stock_ids" || ${extra}::varchar[], "updated_at" = now(), "updated_by" = ${actorId}
      WHERE "document_type" = ${documentType} AND "document_id" = ${documentId}::uuid AND "revision" = ${input.revision}::int`);
    return { revision: input.revision, stockIds: [...newest.stock_ids, ...extra], replayed: false };
  }
  const stockIds = await issueStockIds(tx, input.count, clock);
  await tx.$executeRaw(Prisma.sql`
    INSERT INTO "partner"."stock_id_issue" ("document_type", "document_id", "revision", "stock_ids", "updated_by")
    VALUES (${documentType}, ${documentId}::uuid, ${input.revision}::int, ${stockIds}::varchar[], ${actorId})`);
  return { revision: input.revision, stockIds, replayed: false };
}
