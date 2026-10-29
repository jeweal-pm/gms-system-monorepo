import { Injectable } from "@nestjs/common";
import { validationException, type FieldError } from "../common/errors";
import type { Tx } from "../common/persistence";
import { prisma } from "../database/prisma-client";
import { fromDbDate, toDbDate } from "../document-setup/document-setup.service";
import { Prisma } from "../generated/prisma/client";
import { documentErrors } from "./document-errors";
import { TradeDocumentEngine, type DocumentListInput } from "./document-engine";
import type { MemoReturnInput, MemoStockInput } from "./memo-schemas";
import { vendorDocumentOptions, vendorParty, type VendorOut } from "./vendor-party";

export const memoReturnErrors = documentErrors("MEMO_RETURN", "MemoReturn", "memo_return");

/** Memo Stock rows shown at once (the picker searches and filters by date). */
export const MEMO_STOCK_LIMIT = 200;

type Client = Tx | typeof prisma;
type Returned = Map<string, { pcs: number; weight: Prisma.Decimal }>;

/** Pcs / weight already returned per memo receive line, leaving out the memo return being edited. */
async function returnedQuantities(client: Client, sourceLineIds: string[], excludeReturnId: string | null | undefined): Promise<Returned> {
  if (sourceLineIds.length === 0) return new Map();
  const rows = await client.memoReturnLine.groupBy({
    by: ["sourceLineId"],
    where: { sourceLineId: { in: sourceLineIds }, ...(excludeReturnId ? { memoReturnId: { not: excludeReturnId } } : {}) },
    _sum: { pcs: true, weightCt: true },
  });
  return new Map(rows.map((row) => [row.sourceLineId, { pcs: row._sum.pcs ?? 0, weight: row._sum.weightCt ?? new Prisma.Decimal(0) }]));
}

function pendingOf(line: { id: string; pcs: number; weightCt: Prisma.Decimal }, returned: Returned) {
  const done = returned.get(line.id);
  return { pcs: line.pcs - (done?.pcs ?? 0), weight: line.weightCt.minus(done?.weight ?? 0) };
}

/**
 * Completes memo return lines from their memo receive lines inside the write transaction: locks the source lines
 * (concurrent returns can't both take the same quantity), checks they belong to this vendor and currency, copies
 * the item fields and price, and stores the Outstanding quantity = received − returned by other memo returns.
 * Return pcs / weight may not exceed it.
 */
async function completeReturnLines(tx: Tx, input: MemoReturnInput, documentId: string | null): Promise<MemoReturnInput> {
  const ids = input.lines.map((line) => line.sourceLineId);
  const duplicates = ids.flatMap((id, index) => (ids.indexOf(id) === index ? [] : [{ path: `lines.${index}.sourceLineId`, code: "duplicate" }]));
  if (duplicates.length > 0) throw validationException(duplicates);
  await tx.$queryRaw(Prisma.sql`SELECT id FROM "partner"."memo_receive_line" WHERE id = ANY(${ids}::uuid[]) ORDER BY id FOR UPDATE`);
  const sources = await tx.memoReceiveLine.findMany({ where: { id: { in: ids } }, include: { document: { select: { vendorId: true, currencyCode: true } } } });
  const byId = new Map(sources.map((source) => [source.id, source]));
  const returned = await returnedQuantities(tx, ids, documentId);
  const references: FieldError[] = [];
  const quantities: FieldError[] = [];
  const lines = input.lines.map((line, index) => {
    const source = byId.get(line.sourceLineId);
    if (!source || source.document.vendorId !== input.vendorId || source.document.currencyCode !== input.currency) {
      references.push({ path: `lines.${index}.sourceLineId`, code: "invalid_reference" });
      return line;
    }
    const pending = pendingOf(source, returned);
    if (line.pcs > pending.pcs) quantities.push({ path: `lines.${index}.pcs`, code: "exceeds_outstanding" });
    if (new Prisma.Decimal(line.weightCt).gt(pending.weight)) quantities.push({ path: `lines.${index}.weightCt`, code: "exceeds_outstanding" });
    return {
      ...line,
      source: "MANUAL" as const,
      stoneCodeId: source.stoneCodeId,
      stoneCode: source.stoneCodeSnapshot,
      stone: source.stone,
      shape: source.shape,
      size: source.size,
      color: source.color,
      clarity: source.clarity,
      cutting: source.cutting,
      quality: source.quality,
      lot: source.lot,
      location: source.location,
      cerType: source.cerType,
      cerNo: source.cerNo,
      priceUnit: source.priceUnit as "PER_CT" | "PER_PCS",
      unitPrice: source.unitPrice.toFixed(2),
      discount: { type: "NONE" as const, value: "0" },
      outstandingPcs: Math.max(pending.pcs, 0),
      outstandingWeightCt: Prisma.Decimal.max(pending.weight, 0).toFixed(3),
    };
  });
  if (references.length > 0) throw memoReturnErrors.referenceInvalid(references);
  if (quantities.length > 0) throw validationException(quantities);
  return { ...input, lines };
}

/**
 * memo-return SA rev 1 (owner 2026-10-29): stones sent back to the vendor from its memo receives. Document Setup
 * key `memo-return`, drafts only, no photos or stock posting yet.
 */
@Injectable()
export class MemoReturnService {
  private readonly engine = new TradeDocumentEngine<MemoReturnInput, VendorOut>({
    document: "memoReturn",
    transactionKey: "memo-return",
    event: "memo_return",
    model: "memoReturn",
    lineModel: "memoReturnLine",
    chargeModel: "memoReturnCharge",
    parentKey: "memoReturnId",
    errors: memoReturnErrors,
    party: vendorParty<MemoReturnInput>(memoReturnErrors),
    outstanding: true,
    sourceLine: true,
    prepare: completeReturnLines,
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
  create(actorId: string, input: MemoReturnInput) {
    return this.engine.create(actorId, input);
  }
  update(actorId: string, id: string, expectedVersion: number, input: MemoReturnInput) {
    return this.engine.update(actorId, id, expectedVersion, input);
  }
  delete(actorId: string, id: string, expectedVersion: number) {
    return this.engine.delete(actorId, id, expectedVersion);
  }

  options(includeVendorId?: string) {
    return vendorDocumentOptions(includeVendorId, memoReturnErrors);
  }

  /**
   * Memo Stock: the vendor's memo receive lines in the return's currency with a quantity still out, newest receipt
   * first; `from` / `to` filter the receive date, `q` searches stone code, stone, lot, location and receive number.
   */
  async memoStock(input: MemoStockInput) {
    try {
      const contains = input.q ? { contains: input.q, mode: "insensitive" as const } : undefined;
      const lines = await prisma.memoReceiveLine.findMany({
        where: {
          document: {
            vendorId: input.vendorId,
            currencyCode: input.currency,
            ...(input.from || input.to ? { docDate: { ...(input.from ? { gte: toDbDate(input.from) } : {}), ...(input.to ? { lte: toDbDate(input.to) } : {}) } } : {}),
          },
          ...(contains
            ? { OR: [{ stoneCodeSnapshot: contains }, { stone: contains }, { lot: contains }, { location: contains }, { document: { docNo: contains } }] }
            : {}),
        },
        include: { document: { select: { id: true, docNo: true, docDate: true, dueDate: true } } },
        orderBy: [{ document: { docDate: "desc" } }, { memoReceiveId: "desc" }, { position: "asc" }],
        take: MEMO_STOCK_LIMIT,
      });
      const returned = await returnedQuantities(prisma, lines.map((line) => line.id), input.excludeReturnId);
      return {
        items: lines.flatMap((line) => {
          const pending = pendingOf(line, returned);
          if (pending.pcs <= 0 && pending.weight.lte(0)) return [];
          const pendingPcs = Math.max(pending.pcs, 0);
          const pendingWeight = Prisma.Decimal.max(pending.weight, 0);
          const amount = line.unitPrice.times(line.priceUnit === "PER_PCS" ? pendingPcs : pendingWeight);
          return [{
            sourceLineId: line.id,
            memoReceiveId: line.document.id,
            memoReceiveNo: line.document.docNo,
            docDate: fromDbDate(line.document.docDate),
            dueDate: fromDbDate(line.document.dueDate),
            stoneCodeId: line.stoneCodeId,
            stoneCode: line.stoneCodeSnapshot,
            stone: line.stone,
            shape: line.shape,
            size: line.size,
            color: line.color,
            clarity: line.clarity,
            cutting: line.cutting,
            quality: line.quality,
            lot: line.lot,
            location: line.location,
            cerType: line.cerType,
            cerNo: line.cerNo,
            itemNote: line.itemNote,
            priceUnit: line.priceUnit as "PER_CT" | "PER_PCS",
            unitPrice: line.unitPrice.toFixed(2),
            pendingPcs,
            pendingWeightCt: pendingWeight.toFixed(3),
            amount: amount.toFixed(2),
          }];
        }),
      };
    } catch (error) {
      throw memoReturnErrors.map(error, "memoStock");
    }
  }
}
