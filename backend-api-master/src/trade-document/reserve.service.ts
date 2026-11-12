import { Injectable } from "@nestjs/common";
import { CustomerStockDocument, type CustomerStockInput } from "./customer-stock-document";
import { LINE_PHOTO_DOCUMENTS } from "./line-photos";
import type { MemoReceiveListInput } from "./memo-schemas";

/**
 * reserve SA rev 1 / ADR-0036 (owner 2026-11-02): holds stones for a customer for a later Sale. Document Setup key
 * `reserve`, PENDING_APPROVAL → APPROVED. Lines picked From Stock name a Memo Stock item, and approval moves their
 * quantity from pending into Reserve (SA-RS-07, Q-MOV-04). Rows keyed in by hand hold nothing (Q-RS-04).
 */
const reserve = new CustomerStockDocument({
  code: "RESERVE",
  entity: "Reserve",
  table: "reserve",
  document: "reserve",
  transactionKey: "reserve",
  event: "reserve",
  model: "reserve",
  lineModel: "reserveLine",
  chargeModel: "reserveCharge",
  parentKey: "reserveId",
  photos: LINE_PHOTO_DOCUMENTS.reserve,
});

export const reserveErrors = reserve.errors;
export type { CustomerStockDetail as ReserveDetail } from "./customer-stock-document";

@Injectable()
export class ReserveService {
  list(input: MemoReceiveListInput) {
    return reserve.list(input);
  }
  get(id: string) {
    return reserve.get(id);
  }
  nextNumber(docDate: string) {
    return reserve.nextNumber(docDate);
  }
  create(actorId: string, input: CustomerStockInput) {
    return reserve.create(actorId, input);
  }
  update(actorId: string, id: string, expectedVersion: number, input: CustomerStockInput) {
    return reserve.update(actorId, id, expectedVersion, input);
  }
  delete(actorId: string, id: string, expectedVersion: number) {
    return reserve.delete(actorId, id, expectedVersion);
  }
  /** transaction-soft-delete D6: a deleted document back to its unchanged status. */
  restore(actorId: string, id: string, expectedVersion: number) {
    return reserve.restore(actorId, id, expectedVersion);
  }
  approve(actorId: string, id: string, expectedVersion: number) {
    return reserve.approve(actorId, id, expectedVersion);
  }
  options(includeCustomerId?: string) {
    return reserve.options(includeCustomerId);
  }
}
