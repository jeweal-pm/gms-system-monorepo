import { HttpStatus, Injectable, Logger } from "@nestjs/common";
import { partnerException, validationException, type FieldError } from "../common/errors";
import { WRITE_TX, type Tx } from "../common/persistence";
import { prisma } from "../database/prisma-client";
import { Prisma } from "../generated/prisma/client";
import { documentErrors } from "./document-errors";
import { TradeDocumentEngine, type LineHook } from "./document-engine";
import { vendorDocumentOptions, vendorParty, type VendorOut } from "./memo-out-return.service";
import type { MemoReceiveListInput, MemoReceiveStatus, MemoReturnInput } from "./memo-schemas";

export const memoReturnErrors = documentErrors("MEMO_RETURN", "MemoReturn", "memo_return");
/** Approval found a Memo Stock item with less pending than the line returns (another return took it first). */
export const memoReturnPendingShort = (fields: FieldError[]) => partnerException("MEMO_RETURN_PENDING_SHORT", HttpStatus.CONFLICT, fields);

type MemoReturnStatus = MemoReceiveStatus;
const PENDING: MemoReturnStatus = "PENDING_APPROVAL";
const APPROVED: MemoReturnStatus = "APPROVED";

/**
 * Completes memo return lines from their Memo Stock items inside the save transaction (engine `prepare`): each item
 * must belong to the vendor and currency and appear once; the item fields and the price after the line discount
 * (Q-MR-13, 2 dp) are copied, and Outstanding = the item's pending quantity now. Return pcs / weight may not exceed
 * it. Saving reserves nothing: approval re-checks pending under a row lock (owner Q-MR-15 over-pull guard).
 */
async function completeReturnLines(tx: Tx, input: MemoReturnInput): Promise<MemoReturnInput> {
  const ids = input.lines.map((line) => line.memoStockId);
  const duplicates = ids.flatMap((id, index) => (ids.indexOf(id) === index ? [] : [{ path: `lines.${index}.memoStockId`, code: "duplicate" }]));
  if (duplicates.length > 0) throw validationException(duplicates);
  const items = await tx.memoStock.findMany({ where: { id: { in: ids } } });
  const byId = new Map(items.map((item) => [item.id, item]));
  const references: FieldError[] = [];
  const quantities: FieldError[] = [];
  const lines = input.lines.map((line, index) => {
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
  if (references.length > 0) throw memoReturnErrors.referenceInvalid(references);
  if (quantities.length > 0) throw validationException(quantities);
  return { ...input, lines };
}

/** Lines store their Memo Stock item and its Stock ID; the output names them in place of a stone code id. */
const memoStockLines: LineHook<MemoReturnInput> = {
  storedSelect: { id: true },
  assign: async (tx, input) => {
    const items = await tx.memoStock.findMany({ where: { id: { in: input.lines.map((line) => line.memoStockId) } }, select: { id: true, stockId: true } });
    const stockIds = new Map(items.map((item) => [item.id, item.stockId]));
    return input.lines.map((line) => ({ memoStockId: line.memoStockId, stockId: stockIds.get(line.memoStockId) }));
  },
  output: (line, base) => {
    const { stoneCodeId: _stoneCodeId, ...rest } = base;
    return { ...rest, memoStockId: line.memoStockId as string, stockId: line.stockId as string };
  },
  result: () => ({}),
};

/**
 * memo-return SA rev 2 (owner 2026-10-29): Memo Stock items sent back to their vendor. Document Setup key
 * `memo-return`; PENDING_APPROVAL → APPROVED, and approval reduces the items' pending pcs / weight (Q-MR-15).
 */
@Injectable()
export class MemoReturnService {
  private readonly logger = new Logger("memo_return");

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
    createStatus: PENDING,
    editableStatuses: [PENDING],
    outstanding: true,
    lineOmit: ["stoneCodeId"],
    prepare: completeReturnLines,
    lineHook: memoStockLines,
    detailExtra: (row) => ({
      approvedAt: row.approvedAt ? (row.approvedAt as Date).toISOString() : null,
      approvedBy: (row.approvedBy as string | null) ?? null,
    }),
  });

  list(input: MemoReceiveListInput) {
    return this.engine.list(input);
  }
  get(id: string) {
    return this.engine.get(id) as Promise<unknown> as Promise<MemoReturnDetail>;
  }
  nextNumber(docDate: string) {
    return this.engine.nextNumber(docDate);
  }
  create(actorId: string, input: MemoReturnInput) {
    return this.engine.create(actorId, input);
  }
  update(actorId: string, id: string, expectedVersion: number, input: MemoReturnInput) {
    return this.engine.update(actorId, id, expectedVersion, input);
  }
  delete(actorId: string, id: string, expectedVersion: number) {
    return this.engine.delete(actorId, id, expectedVersion);
  }

  async options(includeVendorId?: string) {
    try {
      return await vendorDocumentOptions(includeVendorId);
    } catch (error) {
      throw memoReturnErrors.map(error, "options");
    }
  }

  /**
   * PENDING_APPROVAL → APPROVED and the returned pcs / weight come off each Memo Stock item, in one transaction. The
   * guarded UPDATE serializes approvals of this document; the items are locked in id order (`FOR UPDATE`) so two
   * returns of the same item can't both pass. An item with less pending than the line → `MEMO_RETURN_PENDING_SHORT`
   * (409, the short line fields) and nothing changes.
   */
  async approve(actorId: string, id: string, expectedVersion: number) {
    const errors = memoReturnErrors;
    try {
      const approved = await prisma.$transaction(async (tx) => {
        const now = new Date();
        const updated = await tx.memoReturn.updateMany({
          where: { id, version: expectedVersion, status: PENDING },
          data: { status: APPROVED, approvedAt: now, approvedBy: actorId, version: { increment: 1 }, updatedAt: now, updatedBy: actorId },
        });
        if (updated.count === 0) {
          const row = await tx.memoReturn.findUnique({ where: { id }, select: { status: true } });
          if (!row) throw errors.notFound();
          if (row.status !== PENDING) throw errors.statusInvalid();
          throw errors.changed();
        }
        const document = await tx.memoReturn.findUniqueOrThrow({
          where: { id },
          select: { docNo: true, lines: { orderBy: { position: "asc" }, select: { memoStockId: true, pcs: true, weightCt: true } } },
        });
        const ids = document.lines.map((line) => line.memoStockId);
        const locked = await tx.$queryRaw<{ id: string; pending_pcs: number; pending_weight_ct: Prisma.Decimal }[]>(Prisma.sql`
          SELECT id::text AS id, pending_pcs, pending_weight_ct FROM "partner"."memo_stock"
          WHERE id = ANY(${ids}::uuid[]) ORDER BY id FOR UPDATE`);
        const pending = new Map(locked.map((row) => [row.id, row]));
        const short: FieldError[] = [];
        document.lines.forEach((line, index) => {
          const item = pending.get(line.memoStockId);
          if (!item || line.pcs > item.pending_pcs) short.push({ path: `lines.${index}.pcs`, code: "exceeds_pending" });
          if (!item || line.weightCt.gt(new Prisma.Decimal(item.pending_weight_ct.toString()))) short.push({ path: `lines.${index}.weightCt`, code: "exceeds_pending" });
        });
        if (short.length > 0) throw memoReturnPendingShort(short);
        if (document.lines.length > 0) {
          const values = document.lines.map((line) => Prisma.sql`(${line.memoStockId}::uuid, ${line.pcs}::int, ${line.weightCt.toFixed(3)}::numeric)`);
          await tx.$executeRaw(Prisma.sql`
            UPDATE "partner"."memo_stock" AS s
            SET pending_pcs = s.pending_pcs - r.pcs, pending_weight_ct = s.pending_weight_ct - r.weight, version = s.version + 1, updated_at = ${now}
            FROM (VALUES ${Prisma.join(values)}) AS r(id, pcs, weight)
            WHERE s.id = r.id`);
        }
        return { docNo: document.docNo, lineCount: document.lines.length };
      }, WRITE_TX);
      this.logger.log({ event: "memo_return.approved", actorId, id, docNo: approved.docNo, lineCount: approved.lineCount });
      return { id, version: expectedVersion + 1, status: APPROVED as "APPROVED" };
    } catch (error) {
      throw errors.map(error, "approve");
    }
  }
}

type EngineDetail = Awaited<ReturnType<TradeDocumentEngine<MemoReturnInput, VendorOut, MemoReturnStatus>["get"]>>;
type MemoReturnLineOut = Omit<EngineDetail["lines"][number], "stoneCodeId"> & { memoStockId: string; stockId: string };
/** api-contract `MemoReturn` (the line hook and `detailExtra` shape the engine output at run time). */
export type MemoReturnDetail = Omit<EngineDetail, "lines"> & { lines: MemoReturnLineOut[]; approvedAt: string | null; approvedBy: string | null };
