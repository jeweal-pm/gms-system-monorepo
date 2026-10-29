import { Injectable } from "@nestjs/common";
import { documentErrors } from "./document-errors";
import { TradeDocumentEngine, type DocumentListInput } from "./document-engine";
import type { MemoOutReturnInput } from "./memo-schemas";
import { vendorDocumentOptions, vendorParty, type VendorOut } from "./vendor-party";

export const memoOutReturnErrors = documentErrors("MEMO_OUT_RETURN", "MemoOutReturn", "memo_out_return");

/** memo-out-return SA rev 1 / ADR-0033: Document Setup key `memo-out-return`, drafts only, no stock posting yet. */
@Injectable()
export class MemoOutReturnService {
  private readonly engine = new TradeDocumentEngine<MemoOutReturnInput, VendorOut>({
    document: "memoOutReturn",
    transactionKey: "memo-out-return",
    event: "memo_out_return",
    model: "memoOutReturn",
    lineModel: "memoOutReturnLine",
    chargeModel: "memoOutReturnCharge",
    parentKey: "memoOutReturnId",
    errors: memoOutReturnErrors,
    party: vendorParty<MemoOutReturnInput>(memoOutReturnErrors),
    outstanding: true,
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
  create(actorId: string, input: MemoOutReturnInput) {
    return this.engine.create(actorId, input);
  }
  update(actorId: string, id: string, expectedVersion: number, input: MemoOutReturnInput) {
    return this.engine.update(actorId, id, expectedVersion, input);
  }
  delete(actorId: string, id: string, expectedVersion: number) {
    return this.engine.delete(actorId, id, expectedVersion);
  }

  /** Active vendors with their addresses (plus a stored inactive one), currencies and the stone lists. */
  options(includeVendorId?: string) {
    return vendorDocumentOptions(includeVendorId, memoOutReturnErrors);
  }
}
