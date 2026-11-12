import { Injectable } from "@nestjs/common";
import type { Tx } from "../common/persistence";
import type { FlowPrincipal } from "../approval-setting/approval-flow";
import type { prisma } from "../database/prisma-client";
import { Prisma } from "../generated/prisma/client";
import { CustomerStockDocument, type CustomerStockInput } from "./customer-stock-document";
import type { DocumentActor } from "./document-engine";
import type { MemoReceiveListInput } from "./memo-schemas";
import { LINE_PHOTO_DOCUMENTS } from "./line-photos";

/**
 * An auto-approved Memo Out is used once any Memo Out Return line names one of its lines (approval-setup "Effects and
 * their reversal"). Soft-deleted returns count too: their lines keep the RESTRICT foreign key to `memo_out_line`, so the
 * edit (which replaces the lines) could not proceed. Live documents are named first, oldest first. One indexed query.
 */
export async function memoOutUsedBy(client: Tx | typeof prisma, id: string): Promise<string | null> {
  const [row] = await client.$queryRaw<{ doc_no: string }[]>(Prisma.sql`
    SELECT CASE WHEN h.deleted_at IS NOT NULL THEN h.doc_no || ' (deleted)' ELSE h.doc_no END AS doc_no FROM "partner"."memo_out_return_line" l
    JOIN "partner"."memo_out_line" o ON o.id = l.memo_out_line_id
    JOIN "partner"."memo_out_return" h ON h.id = l.memo_out_return_id
    WHERE o.memo_out_id = ${id}::uuid
    ORDER BY (h.deleted_at IS NOT NULL), h.created_at
    LIMIT 1`);
  return row?.doc_no ?? null;
}

/**
 * memo-out SA rev 2 / ADR-0033 rev 2 (owner 2026-10-31): Document Setup key `memo-out` and the approval flow of
 * approval-setup ADR-0050. Lines picked From Stock name a Memo Stock item, and approval moves their quantity from pending
 * into Reserve. Since memo-out rev 3 every line comes From Stock (the schema refuses a line without `memoStockId`). The
 * rules live in the shared customer stock document, also used by Reserve; Memo Out Return reuses its customer party and
 * options.
 */
const memoOut = new CustomerStockDocument({
  code: "MEMO_OUT",
  entity: "MemoOut",
  table: "memo_out",
  document: "memoOut",
  transactionKey: "memo-out",
  event: "memo_out",
  model: "memoOut",
  lineModel: "memoOutLine",
  chargeModel: "memoOutCharge",
  parentKey: "memoOutId",
  approvalType: "memo-out",
  usedBy: memoOutUsedBy,
  photos: LINE_PHOTO_DOCUMENTS.memoOut,
});

export const memoOutErrors = memoOut.errors;
export const memoOutPendingShort = memoOut.pendingShort;
export { customerDocumentOptions, customerParty, type CustomerOut, type CustomerStockDetail as MemoOutDetail } from "./customer-stock-document";

@Injectable()
export class MemoOutService {
  list(input: MemoReceiveListInput) {
    return memoOut.list(input);
  }
  get(id: string, viewer: FlowPrincipal | null = null) {
    return memoOut.get(id, viewer);
  }
  nextNumber(docDate: string) {
    return memoOut.nextNumber(docDate);
  }
  create(actorId: string, input: CustomerStockInput, viewer: FlowPrincipal | null = null) {
    return memoOut.create(actorId, input, viewer);
  }
  update(actorId: string, id: string, expectedVersion: number, input: CustomerStockInput, viewer: FlowPrincipal | null = null) {
    return memoOut.update(actorId, id, expectedVersion, input, viewer);
  }
  delete(actorId: string, id: string, expectedVersion: number) {
    return memoOut.delete(actorId, id, expectedVersion);
  }
  /** transaction-soft-delete D6 / approval-setup G3. */
  restore(actorId: string, id: string, expectedVersion: number) {
    return memoOut.restore(actorId, id, expectedVersion);
  }
  submit(actor: DocumentActor, id: string, expectedVersion: number) {
    return memoOut.submit(actor, id, expectedVersion);
  }
  approve(actorId: string, id: string, expectedVersion: number) {
    return memoOut.approve(actorId, id, expectedVersion);
  }

  /** Go-live command (ADR-0050 D7): the same approve inside the caller's transaction. */
  approveWithin(tx: Tx, actorId: string, id: string, expectedVersion: number) {
    return memoOut.approveWithin(tx, actorId, id, expectedVersion);
  }
  reject(actor: DocumentActor, id: string, expectedVersion: number, reason: string) {
    return memoOut.reject(actor, id, expectedVersion, reason);
  }
  requestRevision(actor: DocumentActor, id: string, expectedVersion: number, note: string) {
    return memoOut.requestRevision(actor, id, expectedVersion, note);
  }
  options(includeCustomerId?: string) {
    return memoOut.options(includeCustomerId);
  }
}
