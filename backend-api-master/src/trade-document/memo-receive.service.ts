import { uuidV7 } from "@gms/storage";
import { HttpStatus, Injectable, Logger } from "@nestjs/common";
import { partnerException, validationException, type FieldError } from "../common/errors";
import { WRITE_TX, type Tx } from "../common/persistence";
import { prisma } from "../database/prisma-client";
import { Prisma } from "../generated/prisma/client";
import { documentErrors } from "./document-errors";
import { TradeDocumentEngine, type LineHook } from "./document-engine";
import { vendorDocumentOptions, vendorParty, type VendorOut } from "./memo-out-return.service";
import type { MemoReceiveInput, MemoReceiveListInput, MemoReceiveStatus } from "./memo-schemas";

export const memoReceiveErrors = documentErrors("MEMO_RECEIVE", "MemoReceive", "memo_receive");
/** SA-MR-16: an upload that isn't a JPEG/PNG ≤ 5 MB, or a saved photo id that isn't a ready Memo Receive photo. */
export const memoReceivePhotoInvalid = (path: string) => partnerException("MEMO_RECEIVE_PHOTO_INVALID", HttpStatus.UNPROCESSABLE_ENTITY, [{ path, code: "invalid_photo" }]);
/** `stored_files.source_type` of Memo Receive line photos (SA-MR-15); `source_id` is the photo id itself. */
export const MEMO_RECEIVE_PHOTO_SOURCE = "memo_receive.line-photo";

/**
 * SA-MR-16/17: every photo id must be a ready Memo Receive photo (a Quotation photo id, an unknown or a pending
 * file is refused) → `MEMO_RECEIVE_PHOTO_INVALID` at `lines.N.photoIds.M`. One bounded query (≤ 5 ids × lines).
 */
export async function checkLinePhotos(tx: Tx, lines: { photoIds: string[] }[]): Promise<void> {
  const photoIds = [...new Set(lines.flatMap((line) => line.photoIds))];
  if (photoIds.length === 0) return;
  const files = await tx.storedFile.findMany({ where: { id: { in: photoIds }, sourceType: MEMO_RECEIVE_PHOTO_SOURCE, status: "ready" }, select: { id: true } });
  const known = new Set(files.map((file) => file.id));
  lines.forEach((line, index) => {
    const bad = line.photoIds.findIndex((photoId) => !known.has(photoId));
    if (bad >= 0) throw memoReceivePhotoInvalid(`lines.${index}.photoIds.${bad}`);
  });
}

const PENDING: MemoReceiveStatus = "PENDING_APPROVAL";
const APPROVED: MemoReceiveStatus = "APPROVED";
/** Location of every Memo Stock item (ADR-0034 D6, SA-MR-07). */
export const MEMO_LOCATION = "Memo";
/** 4-digit running number per year (SA-MR-04); item 10,000 is refused (Q-MR-09 still open). */
export const STOCK_NO_MAX = 9_999;
/** Asia/Bangkok has no daylight saving: UTC+7 all year. */
const BANGKOK_OFFSET_MS = 7 * 60 * 60 * 1000;

const Decimal = Prisma.Decimal;
type Dec = Prisma.Decimal;

/** 2-digit year of `now` in Asia/Bangkok (owner Q-MR-08: the year of the save, not the Doc Date). */
export function stockIdYear(now: Date): number {
  return new Date(now.getTime() + BANGKOK_OFFSET_MS).getUTCFullYear() % 100;
}

/** Stock ID = YY ‖ lpad(n, 4, '0'), e.g. 26 + 1 → "260001". */
export function formatStockId(year: number, runningNo: number): string {
  return `${String(year).padStart(2, "0")}${String(runningNo).padStart(4, "0")}`;
}

/**
 * Takes `count` numbers from the counter of the save year under its row lock (INSERT … ON CONFLICT DO UPDATE in the
 * caller's transaction, after the Document Setup lock — always the same order, so no deadlock). The guarded UPDATE
 * returns no row when the year would pass 9,999 → `MEMO_RECEIVE_STOCK_ID_EXHAUSTED`; the transaction then rolls back.
 */
export async function issueStockIds(tx: Tx, count: number, now: Date): Promise<string[]> {
  if (count === 0) return [];
  const year = stockIdYear(now);
  const rows = await tx.$queryRaw<{ last_no: number }[]>(Prisma.sql`
    INSERT INTO "partner"."memo_stock_id_counter" AS c ("year", "last_no")
    VALUES (${year}::smallint, ${count}::int)
    ON CONFLICT ("year") DO UPDATE SET "last_no" = c."last_no" + EXCLUDED."last_no"
    WHERE c."last_no" + EXCLUDED."last_no" <= ${STOCK_NO_MAX}
    RETURNING "last_no"`);
  const last = rows[0]?.last_no;
  if (last === undefined || last > STOCK_NO_MAX) throw stockIdExhausted();
  return Array.from({ length: count }, (_, index) => formatStockId(year, last - count + 1 + index));
}

export const stockIdExhausted = () => partnerException("MEMO_RECEIVE_STOCK_ID_EXHAUSTED", HttpStatus.CONFLICT);

/** Quantity the line is priced on: weight for PER_CT, pieces for PER_PCS. */
function basis(priceUnit: string, pcs: number | Dec, weightCt: Dec | string): Dec {
  return priceUnit === "PER_CT" ? new Decimal(weightCt) : new Decimal(pcs);
}

/**
 * Net unit price (SA-MR-06, owner Q-MR-13: price after the line discount) = line amount ÷ received basis, 4 dp
 * half-up. With a zero basis there is nothing to divide by: the gross price less a percent discount stands in.
 */
export function netUnitPrice(line: { priceUnit: string; pcs: number; weightCt: Dec | string; unitPrice: Dec | string; amount: Dec | string; discountType: string; discountValue: Dec | string }): Dec {
  const qty = basis(line.priceUnit, line.pcs, line.weightCt);
  if (qty.isZero()) {
    const unit = new Decimal(line.unitPrice);
    const net = line.discountType === "PERCENT" ? unit.times(new Decimal(100).minus(line.discountValue)).dividedBy(100) : unit;
    return Decimal.max(net, 0).toDecimalPlaces(4, Decimal.ROUND_HALF_UP);
  }
  return new Decimal(line.amount).dividedBy(qty).toDecimalPlaces(4, Decimal.ROUND_HALF_UP);
}

/**
 * memo-receive SA rev 1 / ADR-0034: Document Setup key `memo-receive`, vendor + address like Memo Out Return,
 * PENDING_APPROVAL → APPROVED (approval copies each line to Memo Stock), server-issued Stock IDs.
 */
@Injectable()
export class MemoReceiveService {
  private readonly logger = new Logger("memo_receive");
  /** Server clock for the Stock ID year; replaced in tests only. */
  clock: () => Date = () => new Date();

  private readonly stockIds: LineHook<MemoReceiveInput> = {
    storedSelect: { id: true, stockId: true },
    assign: async (tx, input, stored) => {
      const kept = new Map((stored ?? []).map((line) => [line.id as string, line.stockId as string]));
      const errors: FieldError[] = input.lines.flatMap((line, index) => (line.id && !kept.has(line.id) ? [{ path: `lines.${index}.id`, code: "unknown_line" }] : []));
      if (errors.length > 0) throw validationException(errors);
      await checkLinePhotos(tx, input.lines);
      const fresh = await issueStockIds(tx, input.lines.filter((line) => !line.id).length, this.clock());
      let next = 0;
      return input.lines.map((line) => (line.id ? { id: line.id, stockId: kept.get(line.id) } : { stockId: fresh[next++] }));
    },
    output: (line, base) => {
      const { stoneCodeId: _stoneCodeId, location: _location, outstandingPcs: _pcs, outstandingWeightCt: _weight, ...rest } = base;
      const photoIds = ((line.photos as { fileId: string }[] | undefined) ?? []).map((photo) => photo.fileId);
      return { ...rest, photoIds, stockId: line.stockId as string };
    },
    result: (assigned) => ({ stockIds: assigned.map((line) => line.stockId as string) }),
    lineInclude: { photos: { orderBy: { position: "asc" }, select: { fileId: true } } },
    // SA-MR-17: the save replaced the lines (and their photo links, CASCADE); write each line's photos in order.
    afterLines: async (tx, input, lineIds) => {
      const photos = input.lines.flatMap((line, index) => line.photoIds.map((fileId, position) => ({ lineId: lineIds[index], position: position + 1, fileId })));
      if (photos.length > 0) await tx.memoReceiveLinePhoto.createMany({ data: photos });
    },
  };

  private readonly engine = new TradeDocumentEngine<MemoReceiveInput, VendorOut, MemoReceiveStatus>({
    document: "memoReceive",
    transactionKey: "memo-receive",
    event: "memo_receive",
    model: "memoReceive",
    lineModel: "memoReceiveLine",
    chargeModel: "memoReceiveCharge",
    parentKey: "memoReceiveId",
    errors: memoReceiveErrors,
    party: vendorParty<MemoReceiveInput>(memoReceiveErrors),
    createStatus: PENDING,
    editableStatuses: [PENDING],
    lineOmit: ["stoneCodeId", "location"],
    lineHook: this.stockIds,
    detailExtra: (row) => ({
      approvedAt: row.approvedAt ? (row.approvedAt as Date).toISOString() : null,
      approvedBy: (row.approvedBy as string | null) ?? null,
    }),
  });

  list(input: MemoReceiveListInput) {
    return this.engine.list(input);
  }
  get(id: string) {
    return this.engine.get(id) as Promise<unknown> as Promise<MemoReceiveDetail>;
  }
  nextNumber(docDate: string) {
    return this.engine.nextNumber(docDate);
  }
  create(actorId: string, input: MemoReceiveInput) {
    return this.engine.create(actorId, input) as Promise<{ id: string; docNo: string; version: number; stockIds: string[] }>;
  }
  update(actorId: string, id: string, expectedVersion: number, input: MemoReceiveInput) {
    return this.engine.update(actorId, id, expectedVersion, input) as Promise<{ id: string; version: number; stockIds: string[] }>;
  }
  delete(actorId: string, id: string, expectedVersion: number) {
    return this.engine.delete(actorId, id, expectedVersion);
  }

  /** `memoOutReturn.options` shape plus `numbering`; stone lists without stone codes (SA-MR-07/10). */
  async options(includeVendorId?: string) {
    try {
      const [options, setup] = await Promise.all([
        vendorDocumentOptions(includeVendorId),
        prisma.documentSetup.findUnique({ where: { transactionKey: "memo-receive" }, select: { transactionKey: true } }),
      ]);
      const { codes: _codes, ...stone } = options.stone;
      return { ...options, numbering: { configured: setup !== null }, stone };
    } catch (error) {
      throw memoReceiveErrors.map(error, "options");
    }
  }

  /**
   * SA-MR-05/06: PENDING_APPROVAL → APPROVED (approved_at/by, version + 1) and one `memo_stock` row per line, location
   * `Memo`, pending = received, in one transaction. The guarded UPDATE serializes concurrent approvals; unique
   * `memo_receive_line_id` / `stock_id` make a duplicate copy impossible.
   */
  async approve(actorId: string, id: string, expectedVersion: number) {
    const errors = memoReceiveErrors;
    try {
      const approved = await prisma.$transaction(async (tx) => {
        const now = new Date();
        const updated = await tx.memoReceive.updateMany({
          where: { id, version: expectedVersion, status: PENDING },
          data: { status: APPROVED, approvedAt: now, approvedBy: actorId, version: { increment: 1 }, updatedAt: now, updatedBy: actorId },
        });
        if (updated.count === 0) {
          const row = await tx.memoReceive.findUnique({ where: { id }, select: { status: true, version: true } });
          if (!row) throw errors.notFound();
          if (row.status !== PENDING) throw errors.statusInvalid();
          throw errors.changed();
        }
        const document = await tx.memoReceive.findUniqueOrThrow({
          where: { id },
          select: {
            docNo: true, docDate: true, dueDate: true, vendorId: true, vendorCodeSnapshot: true, vendorNameSnapshot: true, currencyCode: true,
            lines: { orderBy: { position: "asc" } },
          },
        });
        const rows = document.lines.map((line) => ({
          id: uuidV7(),
          stockId: line.stockId,
          memoReceiveId: id,
          memoReceiveLineId: line.id,
          receivedDocNo: document.docNo,
          receivedDocDate: document.docDate,
          dueDate: document.dueDate,
          vendorId: document.vendorId,
          vendorCodeSnapshot: document.vendorCodeSnapshot,
          vendorNameSnapshot: document.vendorNameSnapshot,
          location: MEMO_LOCATION,
          stone: line.stone,
          shape: line.shape,
          size: line.size,
          color: line.color,
          clarity: line.clarity,
          cutting: line.cutting,
          quality: line.quality,
          lot: line.lot,
          cerType: line.cerType,
          cerNo: line.cerNo,
          itemNote: line.itemNote,
          receivedPcs: line.pcs,
          receivedWeightCt: line.weightCt,
          pendingPcs: line.pcs,
          pendingWeightCt: line.weightCt,
          priceUnit: line.priceUnit,
          unitPrice: line.unitPrice,
          lineAmount: line.amount,
          netUnitPrice: netUnitPrice(line),
          currencyCode: document.currencyCode,
          createdAt: now,
          createdBy: actorId,
          updatedAt: now,
        }));
        if (rows.length > 0) await tx.memoStock.createMany({ data: rows });
        return { docNo: document.docNo, memoStockCount: rows.length };
      }, WRITE_TX);
      this.logger.log({ event: "memo_receive.approved", actorId, id, docNo: approved.docNo, lineCount: approved.memoStockCount });
      return { id, version: expectedVersion + 1, status: APPROVED as "APPROVED", memoStockCount: approved.memoStockCount };
    } catch (error) {
      throw errors.map(error, "approve");
    }
  }
}

type EngineDetail = Awaited<ReturnType<TradeDocumentEngine<MemoReceiveInput, VendorOut, MemoReceiveStatus>["get"]>>;
type MemoReceiveLineOut = Omit<EngineDetail["lines"][number], "stoneCodeId" | "location" | "outstandingPcs" | "outstandingWeightCt"> & { stockId: string };
/** api-contract `MemoReceive` (the line hook and `detailExtra` shape the engine output at run time). */
export type MemoReceiveDetail = Omit<EngineDetail, "lines"> & { lines: MemoReceiveLineOut[]; approvedAt: string | null; approvedBy: string | null };
