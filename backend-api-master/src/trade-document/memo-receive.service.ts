import { Injectable } from "@nestjs/common";
import { documentErrors } from "./document-errors";
import { TradeDocumentEngine, type DocumentListInput } from "./document-engine";
import type { MemoReceiveInput } from "./memo-schemas";
import { vendorDocumentOptions, vendorParty, type VendorOut } from "./vendor-party";

export const memoReceiveErrors = documentErrors("MEMO_RECEIVE", "MemoReceive", "memo_receive");

/**
 * memo-return SA rev 1 (owner 2026-10-29): stones received on memo from a vendor — the Memo Stock a memo return
 * picks from. Document Setup key `memo-receive`, drafts only, no photos or stock posting yet. Once any of its lines
 * was returned, it can't be edited or deleted (`MEMO_RECEIVE_IN_USE`): returns point at its line ids.
 */
@Injectable()
export class MemoReceiveService {
  private readonly engine = new TradeDocumentEngine<MemoReceiveInput, VendorOut>({
    document: "memoReceive",
    transactionKey: "memo-receive",
    event: "memo_receive",
    model: "memoReceive",
    lineModel: "memoReceiveLine",
    chargeModel: "memoReceiveCharge",
    parentKey: "memoReceiveId",
    errors: memoReceiveErrors,
    party: vendorParty<MemoReceiveInput>(memoReceiveErrors),
    async writeGuard(client, documentId) {
      if ((await client.memoReturnLine.count({ where: { sourceLine: { memoReceiveId: documentId } } })) > 0) throw memoReceiveErrors.inUse();
    },
  });

  list(input: DocumentListInput) {
    return this.engine.list(input);
  }
  get(id: string) {
    return this.engine.get(id);
  }
  nextNumber(docDate: string) {
    return this.engine.nextNumber(docDate);
  }
  create(actorId: string, input: MemoReceiveInput) {
    return this.engine.create(actorId, input);
  }
  update(actorId: string, id: string, expectedVersion: number, input: MemoReceiveInput) {
    return this.engine.update(actorId, id, expectedVersion, input);
  }
  delete(actorId: string, id: string, expectedVersion: number) {
    return this.engine.delete(actorId, id, expectedVersion);
  }

  options(includeVendorId?: string) {
    return vendorDocumentOptions(includeVendorId, memoReceiveErrors);
  }
}
