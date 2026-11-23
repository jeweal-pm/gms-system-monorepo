import { HttpStatus, Injectable } from "@nestjs/common";
import { partnerException, validationException, type FieldError } from "../common/errors";
import type { Tx } from "../common/persistence";
import type { FlowPrincipal } from "../approval-setting/approval-flow";
import { Prisma } from "../generated/prisma/client";
import { documentErrors } from "./document-errors";
import { TradeDocumentEngine, type DocumentActor, type DocumentEffects, type LineHook } from "./document-engine";
import { vendorDocumentOptions, vendorParty, type VendorOut } from "./memo-out-return.service";
import type { MemoReceiveListInput, MemoReceiveStatus, MemoReturnInput } from "./memo-schemas";
import { applyMemoStockLines, memoStockLinesOf, reverseMemoStockLines } from "./lot-apply";
import { LINE_PHOTO_DOCUMENTS, withLinePhotos } from "./line-photos";
import { isMemoLot, stockLotUnavailable } from "./lot-key";
import { readMemoLotGroups, refuseNewItemReferences } from "./stock-lines";

export const memoReturnErrors = documentErrors("MEMO_RETURN", "MemoReturn", "memo_return");
/** Approval found a Memo Stock item with less pending than the line returns (another return took it first). */
export const memoReturnPendingShort = (fields: FieldError[]) => partnerException("MEMO_RETURN_PENDING_SHORT", HttpStatus.CONFLICT, fields);

type MemoReturnStatus = MemoReceiveStatus;

/**
 * Completes memo return lines from their Memo Stock items inside the save transaction (engine `prepare`): each item
 * must belong to the vendor and currency and appear once; the item fields and the price after the line discount
 * (Q-MR-13, 2 dp) are copied, and Outstanding = the item's pending quantity now. Return pcs / weight may not exceed
 * it. Saving reserves nothing: approval re-checks pending under a row lock (owner Q-MR-15 over-pull guard).
 */
async function completeReturnLines(tx: Tx, input: MemoReturnInput, documentId: string | null): Promise<MemoReturnInput> {
  await refuseNewItemReferences(tx, "memoReturn", documentId, input.lines);
  const refs = input.lines.map((line) => line.memoStockId ?? line.lotKey ?? "");
  const duplicates = refs.flatMap((ref, index) => (refs.indexOf(ref) === index ? [] : [{ path: `lines.${index}.${input.lines[index].memoStockId ? "memoStockId" : "reference"}`, code: "duplicate" }]));
  if (duplicates.length > 0) throw validationException(duplicates);
  const ids = input.lines.flatMap((line) => (line.memoStockId ? [line.memoStockId] : []));
  const [items, groups] = await Promise.all([
    ids.length === 0 ? Promise.resolve([]) : tx.memoStock.findMany({ where: { id: { in: ids } } }),
    readMemoLotGroups(tx, input.lines.flatMap((line) => (!line.memoStockId && isMemoLot(line.lotKey) ? [line.lotKey] : []))),
  ]);
  const byId = new Map(items.map((item) => [item.id, item]));
  const references: FieldError[] = [];
  const unavailable: number[] = [];
  const quantities: FieldError[] = [];
  const lines = input.lines.map((line, index) => {
    if (!line.memoStockId) {
      // ADR-0055 D4: a lot of this vendor and currency (price uniform by the key); Outstanding = the lot's pending now.
      const group = line.lotKey ? groups.get(line.lotKey) : undefined;
      if (!group || group.stockCount === 0) {
        unavailable.push(index);
        return line;
      }
      if (group.vendorId !== input.vendorId) references.push({ path: `lines.${index}.reference`, code: "vendor_mismatch" });
      else if (group.currency !== input.currency) references.push({ path: `lines.${index}.reference`, code: "currency_mismatch" });
      const params = { availablePcs: group.pendingPcs, availableWeightCt: group.pendingWeight.toFixed(3) };
      if (line.pcs > group.pendingPcs) quantities.push({ path: `lines.${index}.pcs`, code: "exceeds_outstanding", params });
      if (new Prisma.Decimal(line.weightCt).gt(group.pendingWeight)) quantities.push({ path: `lines.${index}.weightCt`, code: "exceeds_outstanding", params });
      return {
        ...line,
        source: "MANUAL" as const, stoneCodeId: null, stoneCode: "", stone: group.stone, shape: group.shape, size: group.size, color: group.color,
        clarity: group.clarity, cutting: group.cutting, quality: group.quality, lot: group.lot, location: group.location, cerType: group.cerType, cerNo: group.cerNo,
        priceUnit: group.priceUnit, unitPrice: group.netUnitPrice.toDecimalPlaces(2, Prisma.Decimal.ROUND_HALF_UP).toFixed(2),
        discount: { type: "NONE" as const, value: "0" }, outstandingPcs: group.pendingPcs, outstandingWeightCt: group.pendingWeight.toFixed(3),
        stockCount: group.stockCount,
      };
    }
    const item = byId.get(line.memoStockId);
    if (!item || item.vendorId !== input.vendorId || item.currencyCode !== input.currency) {
      references.push({ path: `lines.${index}.memoStockId`, code: "invalid_reference" });
      return line;
    }
    if (line.pcs > item.pendingPcs) quantities.push({ path: `lines.${index}.pcs`, code: "exceeds_outstanding" });
    if (new Prisma.Decimal(line.weightCt).gt(item.pendingWeightCt)) quantities.push({ path: `lines.${index}.weightCt`, code: "exceeds_outstanding" });
    return {
      ...line,
      source: "MANUAL" as const,
      stoneCodeId: null,
      stoneCode: "",
      stone: item.stone,
      shape: item.shape,
      size: item.size,
      color: item.color,
      clarity: item.clarity,
      cutting: item.cutting,
      quality: item.quality,
      lot: item.lot,
      location: item.location,
      cerType: item.cerType,
      cerNo: item.cerNo,
      priceUnit: item.priceUnit as "PER_CT" | "PER_PCS",
      unitPrice: item.netUnitPrice.toDecimalPlaces(2, Prisma.Decimal.ROUND_HALF_UP).toFixed(2),
      discount: { type: "NONE" as const, value: "0" },
      outstandingPcs: item.pendingPcs,
      outstandingWeightCt: item.pendingWeightCt.toFixed(3),
    };
  });
  if (references.some((error) => error.code === "invalid_reference")) throw memoReturnErrors.referenceInvalid(references);
  if (unavailable.length > 0) throw stockLotUnavailable(unavailable);
  if (references.length > 0) throw validationException(references);
  if (quantities.length > 0) throw validationException(quantities);
  return { ...input, lines };
}

/**
 * Lines store their Memo Stock item and its Stock ID, or their lot (ADR-0055 D4: no Stock ID, the group size); the output
 * names the reference in place of a stone code id. The Stock ID is not returned (owner Q-LOT-10).
 */
const memoStockLines: LineHook<MemoReturnInput> = {
  storedSelect: { id: true },
  lineInclude: { _count: { select: { allocs: true } } },
  assign: async (tx, input) => {
    const ids = input.lines.flatMap((line) => (line.memoStockId ? [line.memoStockId] : []));
    const items = ids.length === 0 ? [] : await tx.memoStock.findMany({ where: { id: { in: ids } }, select: { id: true, stockId: true } });
    const stockIds = new Map(items.map((item) => [item.id, item.stockId]));
    return input.lines.map((line) => (line.memoStockId
      ? { memoStockId: line.memoStockId, stockId: stockIds.get(line.memoStockId) }
      : { memoStockId: null, stockId: null, lotKey: line.lotKey, stockCount: (line as { stockCount?: number }).stockCount }));
  },
  output: (line, base) => {
    const { stoneCodeId: _stoneCodeId, ...rest } = base;
    return {
      ...rest, memoStockId: (line.memoStockId as string | null) ?? null, stockId: null, lotKey: (line.lotKey as string | null) ?? null,
      allocated: ((line._count as { allocs?: number } | undefined)?.allocs ?? 0) > 0,
    };
  },
  result: () => ({}),
};

/**
 * memo-return SA rev 2 (owner 2026-10-29): Memo Stock items sent back to their vendor. Document Setup key
 * `memo-return`; PENDING_APPROVAL → APPROVED, and approval reduces the items' pending pcs / weight (Q-MR-15).
 */

/**
 * Effects (memo-outstanding-vendor SA-MOV-02, CHECK memo_stock_balance; approval-setup "Effects and their reversal"):
 * the returned pcs / weight move from each Memo Stock item's pending into its Return bucket under the id-ordered lock, so
 * two returns of the same item can't both pass; short → `MEMO_RETURN_PENDING_SHORT` (409, the short line fields). The
 * reversal gives the Return bucket back to pending through the same lock. Nothing else references a Memo Return, so it
 * is never "used"; the balance CHECK stays the final guard.
 */
const memoReturnEffects: DocumentEffects = {
  // lot-based-stock (ADR-0055 D5): a lot line returns the oldest borrowed items first (Q-LOT-06); allocation stored.
  apply: async (tx, doc, _actorId, now) => {
    const lines = await memoStockLinesOf(tx, "memoReturn", "memo_return_id", doc.id);
    const count = await applyMemoStockLines(tx, { table: "memoReturn", lines, bucket: "returned", shortCode: "MEMO_RETURN_PENDING_SHORT", now });
    return { result: {}, log: { lineCount: count } };
  },
  reverse: async (tx, doc, now) => {
    await reverseMemoStockLines(tx, { table: "memoReturn", lines: await memoStockLinesOf(tx, "memoReturn", "memo_return_id", doc.id), bucket: "returned", inUse: () => memoReturnErrors.inUse(null), now });
  },
  usedBy: async () => null,
};

/**
 * memo-return SA rev 2 (owner 2026-10-29): Memo Stock items sent back to their vendor. Document Setup key
 * `memo-return`; the approval flow of approval-setup ADR-0050, and approval reduces the items' pending pcs / weight
 * (Q-MR-15).
 */
@Injectable()
export class MemoReturnService {
  private readonly engine = new TradeDocumentEngine<MemoReturnInput, VendorOut, MemoReturnStatus>({
    document: "memoReturn",
    transactionKey: "memo-return",
    event: "memo_return",
    model: "memoReturn",
    lineModel: "memoReturnLine",
    chargeModel: "memoReturnCharge",
    parentKey: "memoReturnId",
    errors: memoReturnErrors,
    party: vendorParty<MemoReturnInput>(memoReturnErrors),
    approvalType: "memo-return",
    effects: memoReturnEffects,
    outstanding: true,
    lineOmit: ["stoneCodeId"],
    prepare: completeReturnLines,
    lineHook: withLinePhotos(LINE_PHOTO_DOCUMENTS.memoReturn, memoStockLines),
    detailExtra: (row) => ({
      approvedAt: row.approvedAt ? (row.approvedAt as Date).toISOString() : null,
      approvedBy: (row.approvedBy as string | null) ?? null,
    }),
  });

  list(input: MemoReceiveListInput) {
    return this.engine.list(input);
  }
  get(id: string, viewer: FlowPrincipal | null = null) {
    return this.engine.get(id, viewer) as Promise<unknown> as Promise<MemoReturnDetail>;
  }
  nextNumber(docDate: string) {
    return this.engine.nextNumber(docDate);
  }
  create(actorId: string, input: MemoReturnInput, viewer: FlowPrincipal | null = null) {
    return this.engine.create(actorId, input, viewer);
  }
  update(actorId: string, id: string, expectedVersion: number, input: MemoReturnInput, viewer: FlowPrincipal | null = null) {
    return this.engine.update(actorId, id, expectedVersion, input, viewer);
  }
  delete(actorId: string, id: string, expectedVersion: number) {
    return this.engine.delete(actorId, id, expectedVersion);
  }
  /** transaction-soft-delete D6 / approval-setup G3. */
  restore(actorId: string, id: string, expectedVersion: number) {
    return this.engine.restore(actorId, id, expectedVersion);
  }
  submit(actor: DocumentActor, id: string, expectedVersion: number) {
    return this.engine.submit(actor, id, expectedVersion);
  }
  /** PENDING_APPROVAL → APPROVED with the Return move above; a short item changes nothing. */
  approve(actorId: string, id: string, expectedVersion: number) {
    return this.engine.approve(actorId, id, expectedVersion) as Promise<{ id: string; version: number; status: "APPROVED" }>;
  }

  /** Go-live command (ADR-0050 D7): the same approve inside the caller's transaction. */
  approveWithin(tx: Tx, actorId: string, id: string, expectedVersion: number) {
    return this.engine.approveWithin(tx, actorId, id, expectedVersion);
  }
  reject(actor: DocumentActor, id: string, expectedVersion: number, reason: string) {
    return this.engine.reject(actor, id, expectedVersion, reason);
  }
  requestRevision(actor: DocumentActor, id: string, expectedVersion: number, note: string) {
    return this.engine.requestRevision(actor, id, expectedVersion, note);
  }

  async options(includeVendorId?: string) {
    try {
      return await vendorDocumentOptions(includeVendorId);
    } catch (error) {
      throw memoReturnErrors.map(error, "options");
    }
  }
}

type EngineDetail = Awaited<ReturnType<TradeDocumentEngine<MemoReturnInput, VendorOut, MemoReturnStatus>["get"]>>;
type MemoReturnLineOut = Omit<EngineDetail["lines"][number], "stoneCodeId"> & { memoStockId: string | null; stockId: null; lotKey: string | null; allocated: boolean };
/** api-contract `MemoReturn` (the line hook and `detailExtra` shape the engine output at run time). */
export type MemoReturnDetail = Omit<EngineDetail, "lines"> & { lines: MemoReturnLineOut[]; approvedAt: string | null; approvedBy: string | null };
