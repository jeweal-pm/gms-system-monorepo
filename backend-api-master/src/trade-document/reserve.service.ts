import { Injectable } from "@nestjs/common";
import type { FlowPrincipal } from "../approval-setting/approval-flow";
import type { Tx } from "../common/persistence";
import { CustomerStockDocument, type CustomerStockInput } from "./customer-stock-document";
import type { DocumentActor } from "./document-engine";
import { LINE_PHOTO_DOCUMENTS } from "./line-photos";
import type { MemoReceiveListInput } from "./memo-schemas";

/**
 * reserve SA rev 1 / ADR-0036 (owner 2026-11-02): holds stones for a customer for a later Sale. Document Setup key
 * `reserve`, the approval flow of approval-setup ADR-0050 (DRAFT → Send to approve → APPROVED, or auto-approved while
 * the setting is OFF). Lines picked From Stock name a Memo Stock item, and approval moves their quantity from pending into
 * Reserve (SA-RS-07, Q-MOV-04). Rows keyed in by hand hold nothing (Q-RS-04). Never "used" until a Sale page exists.
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
  approvalType: "reserve",
  photos: LINE_PHOTO_DOCUMENTS.reserve,
});

export const reserveErrors = reserve.errors;
export type { CustomerStockDetail as ReserveDetail } from "./customer-stock-document";

@Injectable()
export class ReserveService {
  list(input: MemoReceiveListInput) {
    return reserve.list(input);
  }
  get(id: string, viewer: FlowPrincipal | null = null) {
    return reserve.get(id, viewer);
  }
  nextNumber(docDate: string) {
    return reserve.nextNumber(docDate);
  }
  create(actorId: string, input: CustomerStockInput, viewer: FlowPrincipal | null = null) {
    return reserve.create(actorId, input, viewer);
  }
  update(actorId: string, id: string, expectedVersion: number, input: CustomerStockInput, viewer: FlowPrincipal | null = null) {
    return reserve.update(actorId, id, expectedVersion, input, viewer);
  }
  delete(actorId: string, id: string, expectedVersion: number) {
    return reserve.delete(actorId, id, expectedVersion);
  }
  /** transaction-soft-delete D6 / approval-setup G3. */
  restore(actorId: string, id: string, expectedVersion: number) {
    return reserve.restore(actorId, id, expectedVersion);
  }
  submit(actor: DocumentActor, id: string, expectedVersion: number) {
    return reserve.submit(actor, id, expectedVersion);
  }
  approve(actorId: string, id: string, expectedVersion: number) {
    return reserve.approve(actorId, id, expectedVersion);
  }

  /** Go-live command (ADR-0050 D7): the same approve inside the caller's transaction. */
  approveWithin(tx: Tx, actorId: string, id: string, expectedVersion: number) {
    return reserve.approveWithin(tx, actorId, id, expectedVersion);
  }
  reject(actor: DocumentActor, id: string, expectedVersion: number, reason: string) {
    return reserve.reject(actor, id, expectedVersion, reason);
  }
  requestRevision(actor: DocumentActor, id: string, expectedVersion: number, note: string) {
    return reserve.requestRevision(actor, id, expectedVersion, note);
  }
  options(includeCustomerId?: string) {
    return reserve.options(includeCustomerId);
  }
}
