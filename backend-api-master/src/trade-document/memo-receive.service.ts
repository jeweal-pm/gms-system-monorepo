import { uuidV7 } from "@gms/storage";
import { HttpStatus, Injectable } from "@nestjs/common";
import { partnerException, validationException, type FieldError } from "../common/errors";
import { prismaCode, type Tx } from "../common/persistence";
import type { FlowPrincipal } from "../approval-setting/approval-flow";
import { prisma } from "../database/prisma-client";
import { Prisma } from "../generated/prisma/client";
import { documentErrors } from "./document-errors";
import { TradeDocumentEngine, type DocumentActor, type DocumentEffects, type LineHook } from "./document-engine";
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
 * Another document that issues ids from the same counter (Purchase, SA-PU-10) passes its own `exhausted` error.
 */
export async function issueStockIds(tx: Tx, count: number, now: Date, exhausted: () => Error = stockIdExhausted): Promise<string[]> {
  if (count === 0) return [];
  const year = stockIdYear(now);
  const rows = await tx.$queryRaw<{ last_no: number }[]>(Prisma.sql`
    INSERT INTO "partner"."memo_stock_id_counter" AS c ("year", "last_no")
    VALUES (${year}::smallint, ${count}::int)
    ON CONFLICT ("year") DO UPDATE SET "last_no" = c."last_no" + EXCLUDED."last_no"
    WHERE c."last_no" + EXCLUDED."last_no" <= ${STOCK_NO_MAX}
    RETURNING "last_no"`);
  const last = rows[0]?.last_no;
  if (last === undefined || last > STOCK_NO_MAX) throw exhausted();
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
 * the approval flow of approval-setup ADR-0050 (approval copies each line to Memo Stock), server-issued Stock IDs.
 */
@Injectable()
export class MemoReceiveService {
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

  /**
   * SA-MR-05/06 effects (approval-setup "Effects and their reversal"): approval writes one `memo_stock` row per line,
   * location `Memo`, pending = received; unique `memo_receive_line_id` / `stock_id` make a duplicate copy impossible.
   * The reversal (auto-approved edit / delete) locks those rows in id order and deletes them; a row that another document
   * has moved (returned / reserved / sold / purchased > 0) or that a line names → `MEMO_RECEIVE_IN_USE`.
   */
  private readonly effects: DocumentEffects = {
    apply: async (tx, doc, actorId, now) => {
      const document = await tx.memoReceive.findUniqueOrThrow({
        where: { id: doc.id },
        select: {
          docNo: true, docDate: true, dueDate: true, vendorId: true, vendorCodeSnapshot: true, vendorNameSnapshot: true, currencyCode: true,
          lines: { orderBy: { position: "asc" } },
        },
      });
      const rows = document.lines.map((line) => ({
        id: uuidV7(),
        stockId: line.stockId,
        memoReceiveId: doc.id,
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
      return { result: { memoStockCount: rows.length }, log: { lineCount: rows.length } };
    },
    reverse: async (tx, doc) => {
      const locked = await tx.$queryRaw<{ id: string; moved: boolean }[]>(Prisma.sql`
        SELECT id::text AS id, (returned_pcs > 0 OR returned_weight_ct > 0 OR reserved_pcs > 0 OR reserved_weight_ct > 0
          OR sold_pcs > 0 OR sold_weight_ct > 0 OR purchased_pcs > 0 OR purchased_weight_ct > 0) AS moved
        FROM "partner"."memo_stock" WHERE memo_receive_id = ${doc.id}::uuid ORDER BY id FOR UPDATE`);
      if (locked.some((row) => row.moved)) throw memoReceiveErrors.inUse(await memoReceiveUsedBy(tx, doc.id));
      try {
        await tx.memoStock.deleteMany({ where: { memoReceiveId: doc.id } });
      } catch (error) {
        // A line of another document named an item between the check and the delete (RESTRICT foreign key).
        if (prismaCode(error) === "P2003") throw memoReceiveErrors.inUse(null);
        throw error;
      }
    },
    usedBy: memoReceiveUsedBy,
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
    approvalType: "memo-receive",
    effects: this.effects,
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
  get(id: string, viewer: FlowPrincipal | null = null) {
    return this.engine.get(id, viewer) as Promise<unknown> as Promise<MemoReceiveDetail>;
  }
  nextNumber(docDate: string) {
    return this.engine.nextNumber(docDate);
  }
  create(actorId: string, input: MemoReceiveInput, viewer: FlowPrincipal | null = null) {
    return this.engine.create(actorId, input, viewer) as Promise<unknown> as Promise<{ id: string; docNo: string; version: number; stockIds: string[]; status: string; autoApproved: boolean }>;
  }
  update(actorId: string, id: string, expectedVersion: number, input: MemoReceiveInput, viewer: FlowPrincipal | null = null) {
    return this.engine.update(actorId, id, expectedVersion, input, viewer) as Promise<unknown> as Promise<{ id: string; version: number; stockIds: string[]; status: string; autoApproved: boolean }>;
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
  /** PENDING_APPROVAL → APPROVED and the Memo Stock rows above, in one transaction. */
  approve(actorId: string, id: string, expectedVersion: number) {
    return this.engine.approve(actorId, id, expectedVersion) as Promise<{ id: string; version: number; status: "APPROVED"; memoStockCount: number }>;
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
}

/**
 * An auto-approved Memo Receive is used once any of its Memo Stock rows is named by a line of another document (Memo
 * Return, Reserve, Memo Out, Purchase, Quotation; any status — soft-deleted ones too, because their lines keep the
 * RESTRICT foreign key) or has a moved bucket. Returns that document's number (live first, oldest first), else the
 * moved item's Stock ID, else null. One statement on the line FK indexes (≤ 200 items per receive).
 */
export async function memoReceiveUsedBy(client: Tx | typeof prisma, id: string): Promise<string | null> {
  const [row] = await client.$queryRaw<{ doc_no: string }[]>(Prisma.sql`
    WITH items AS (SELECT s.id FROM "partner"."memo_stock" s WHERE s.memo_receive_id = ${id}::uuid)
    SELECT CASE WHEN deleted_at IS NOT NULL THEN doc_no || ' (deleted)' ELSE doc_no END AS doc_no FROM (
      SELECT h.doc_no, h.deleted_at, h.created_at FROM "partner"."memo_return_line" l JOIN "partner"."memo_return" h ON h.id = l.memo_return_id WHERE l.memo_stock_id IN (SELECT id FROM items)
      UNION ALL
      SELECT h.doc_no, h.deleted_at, h.created_at FROM "partner"."reserve_line" l JOIN "partner"."reserve" h ON h.id = l.reserve_id WHERE l.memo_stock_id IN (SELECT id FROM items)
      UNION ALL
      SELECT h.doc_no, h.deleted_at, h.created_at FROM "partner"."memo_out_line" l JOIN "partner"."memo_out" h ON h.id = l.memo_out_id WHERE l.memo_stock_id IN (SELECT id FROM items)
      UNION ALL
      SELECT h.doc_no, h.deleted_at, h.created_at FROM "partner"."purchase_line" l JOIN "partner"."purchase" h ON h.id = l.purchase_id WHERE l.memo_stock_id IN (SELECT id FROM items)
      UNION ALL
      SELECT h.doc_no, h.deleted_at, h.created_at FROM "partner"."quotation_line" l JOIN "partner"."quotation" h ON h.id = l.quotation_id WHERE l.memo_stock_id IN (SELECT id FROM items)
      UNION ALL
      SELECT s.stock_id, NULL::timestamp, NULL::timestamp FROM "partner"."memo_stock" s WHERE s.memo_receive_id = ${id}::uuid
        AND (s.returned_pcs > 0 OR s.returned_weight_ct > 0 OR s.reserved_pcs > 0 OR s.reserved_weight_ct > 0
          OR s.sold_pcs > 0 OR s.sold_weight_ct > 0 OR s.purchased_pcs > 0 OR s.purchased_weight_ct > 0)
    ) u
    ORDER BY (deleted_at IS NOT NULL), created_at NULLS LAST
    LIMIT 1`);
  return row?.doc_no ?? null;
}

type EngineDetail = Awaited<ReturnType<TradeDocumentEngine<MemoReceiveInput, VendorOut, MemoReceiveStatus>["get"]>>;
type MemoReceiveLineOut = Omit<EngineDetail["lines"][number], "stoneCodeId" | "location" | "outstandingPcs" | "outstandingWeightCt"> & { stockId: string };
/** api-contract `MemoReceive` (the line hook and `detailExtra` shape the engine output at run time). */
export type MemoReceiveDetail = Omit<EngineDetail, "lines"> & { lines: MemoReceiveLineOut[]; approvedAt: string | null; approvedBy: string | null };
