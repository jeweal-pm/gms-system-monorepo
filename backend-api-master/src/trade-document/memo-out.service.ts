import { Injectable } from "@nestjs/common";
import { CustomerStockDocument, type CustomerStockInput } from "./customer-stock-document";
import type { MemoReceiveListInput } from "./memo-schemas";
import { LINE_PHOTO_DOCUMENTS } from "./line-photos";

/**
 * memo-out SA rev 2 / ADR-0033 rev 2 (owner 2026-10-31): Document Setup key `memo-out`, PENDING_APPROVAL → APPROVED.
 * Lines picked From Stock name a Memo Stock item, and approval moves their quantity from pending into Reserve. Since
 * memo-out rev 3 every line comes From Stock (the schema refuses a line without `memoStockId`). The rules live in the
 * shared customer stock document, also used by Reserve; Memo Out Return reuses its customer party and options.
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
  get(id: string) {
    return memoOut.get(id);
  }
  nextNumber(docDate: string) {
    return memoOut.nextNumber(docDate);
  }
  create(actorId: string, input: CustomerStockInput) {
    return memoOut.create(actorId, input);
  }
  update(actorId: string, id: string, expectedVersion: number, input: CustomerStockInput) {
    return memoOut.update(actorId, id, expectedVersion, input);
  }
  delete(actorId: string, id: string, expectedVersion: number) {
    return memoOut.delete(actorId, id, expectedVersion);
  }
  /** transaction-soft-delete D6: a deleted document back to its unchanged status. */
  restore(actorId: string, id: string, expectedVersion: number) {
    return memoOut.restore(actorId, id, expectedVersion);
  }
  approve(actorId: string, id: string, expectedVersion: number) {
    return memoOut.approve(actorId, id, expectedVersion);
  }
  options(includeCustomerId?: string) {
    return memoOut.options(includeCustomerId);
  }
}
