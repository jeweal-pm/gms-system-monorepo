import { uuidV7 } from "@gms/storage";
import { Logger } from "@nestjs/common";
import { z } from "zod";
import { validationException, type FieldError } from "../common/errors";
import { WRITE_TX, type Tx } from "../common/persistence";
import { isCurrencyAllowed } from "../currency/currency-directory";
import { prisma } from "../database/prisma-client";
import { DOC_NO_MAX, formatDocNo, nextPlainRunningNo, nextRunningNo, numberingInEffect, type NumberedDocument } from "../document-setup/document-numbering";
import { fromDbDate, toDbDate } from "../document-setup/document-setup.service";
import type { DocumentTransactionKey } from "../document-setup/document-setup.transactions";
import type { Prisma } from "../generated/prisma/client";
import { calculateTotals, oversizeAmounts } from "../quotation/quotation.calculate";
import { CHARGE_TYPES, type LineInput } from "../quotation/quotation.schemas";
import type { DocumentErrors } from "./document-errors";

/**
 * Shared document engine for memo out, memo out return (ADR-0033), memo receive (ADR-0034) and memo return
 * (memo-return SA rev 2): the quotation rules — Document Setup number (max + 1 under the numbering-row lock, plain
 * 1, 2, 3 … without a row), party + address snapshots, server totals with the quotation calculator, optimistic
 * version. The party part (customer or vendor) comes from an adapter. Status on create and the editable statuses are
 * per document (SA-MR-02): memo out / memo out return stay drafts; memo receive and memo return start
 * PENDING_APPROVAL. An optional line hook adds per-line columns (memo receive: kept line ids, Stock IDs and line
 * photos, SA-MR-17; memo return: the Memo Stock item).
 */

const COMPANY_PROFILE_ID = 1;
const DRAFT_ONLY = ["DRAFT"] as const;

type Row = Record<string, unknown>;
type Dec = Prisma.Decimal;
type DocDelegate = {
  findMany(args: unknown): Promise<Row[]>;
  findUnique(args: unknown): Promise<Row | null>;
  count(args: unknown): Promise<number>;
  create(args: unknown): Promise<unknown>;
  updateMany(args: unknown): Promise<{ count: number }>;
  /** One guarded `UPDATE … RETURNING` (soft delete / restore, ADR-0045 D4/D6). */
  updateManyAndReturn(args: unknown): Promise<Row[]>;
};

/** The columns a guarded write reads to explain a miss (transaction-soft-delete D8). */
export const MISS_SELECT = { status: true, version: true, deletedAt: true } as const;
export type MissRow = { status: string; version: number; deletedAt: Date | null } | null;

/**
 * A guarded write (update / approve / delete) changed no row; throws the first match of D8:
 * missing → NOT_FOUND, soft-deleted → `<CODE>_DELETED`, status outside `allowed` → STATUS_INVALID, else CHANGED.
 */
export function explainMiss(errors: Pick<DocumentErrors, "notFound" | "deleted" | "statusInvalid" | "changed">, row: MissRow, allowed: readonly string[]): never {
  if (!row) throw errors.notFound();
  if (row.deletedAt) throw errors.deleted();
  if (!allowed.includes(row.status)) throw errors.statusInvalid();
  throw errors.changed();
}

/** Restore changed no row (D8): missing → NOT_FOUND, not deleted → STATUS_INVALID, else (stale version) CHANGED. */
export function explainRestoreMiss(errors: Pick<DocumentErrors, "notFound" | "statusInvalid" | "changed">, row: MissRow): never {
  if (!row) throw errors.notFound();
  if (!row.deletedAt) throw errors.statusInvalid();
  throw errors.changed();
}
type ChildDelegate = { createMany(args: unknown): Promise<unknown>; deleteMany(args: unknown): Promise<unknown> };
type Client = Tx | typeof prisma;

/** A line of any trade document; memo receive lines have no stone code id and no location (SA-MR-07). */
export type EngineLine = Omit<LineInput, "stoneCodeId" | "location"> & { stoneCodeId?: string | null; location?: string };

/** The shared input fields (quotation `tradeDocumentFields`) every adapter's input carries. */
export type TradeDocumentInput = {
  docDate: string;
  dueDate: string;
  currency: string;
  exchangeRate: string | null;
  ref: string;
  documentNote: string;
  lines: EngineLine[];
  discount: { type: "NONE" | "PERCENT" | "AMOUNT"; value: string };
  tax: { enabled: boolean; rate: string; includeInPrice: boolean };
  serviceCharges: { type: (typeof CHARGE_TYPES)[number]; amount: string }[];
  labor: { work: string; basis: "PCS" | "WEIGHT"; qty: string; rate: string } | null;
};

/** Customer (memo out) or vendor (memo out return) handling. */
export type PartyAdapter<Input extends TradeDocumentInput, Out extends Row = Row> = {
  /** Columns read from a stored document so an inactive stored choice may stay. */
  storedSelect: Record<string, true>;
  /** Checks the party and its address(es); returns the header columns (ids + snapshots) or field errors. */
  check(tx: Tx, input: Input, stored: Row | null): Promise<{ columns: Row; errors: FieldError[] }>;
  /** Party fields of the detail output. */
  output(row: Row): Out;
  /** Snapshot column with the party name (list search and list item). */
  nameColumn: string;
  /** Output key of the party name in a list item, e.g. `customerName`. */
  listNameKey: string;
  /** Column filtered by the list's party id. */
  partyColumn: string;
};

export type EngineConfig<Input extends TradeDocumentInput, Out extends Row = Row> = {
  document: NumberedDocument;
  transactionKey: DocumentTransactionKey;
  event: string;
  model: string;
  lineModel: string;
  chargeModel: string;
  parentKey: string;
  errors: DocumentErrors;
  party: PartyAdapter<Input, Out>;
  /** Lines keep an Outstanding quantity (memo out return UI rev 3); pcs / weightCt are then the Return quantity. */
  outstanding?: boolean;
  /**
   * Runs first in the write transaction, after the status check on update (create: documentId null); returns the
   * input to store, e.g. memo return lines completed from their Memo Stock items.
   */
  prepare?: (tx: Tx, input: Input, documentId: string | null) => Promise<Input>;
  /** Status written on create (default `DRAFT`). */
  createStatus?: string;
  /** Statuses in which update and delete are allowed (default `[DRAFT]`). */
  editableStatuses?: readonly string[];
  /** Line columns the line table does not have (memo receive: `stoneCodeId`, `location`). */
  lineOmit?: readonly ("stoneCodeId" | "location")[];
  /** Per-line columns assigned inside the save transaction (memo receive Stock IDs). */
  lineHook?: LineHook<Input>;
  /** Extra header fields of the detail output (memo receive approval). */
  detailExtra?: (row: Row) => Row;
};

/** Called inside the save transaction after the document number is issued (lock order: number → hook → document). */
export type LineHook<Input extends TradeDocumentInput> = {
  /** Stored line columns read on update (passed to `assign`). */
  storedSelect: Record<string, true>;
  /** Columns for each input line, in order; may set `id` to keep a saved line's id. `stored` is null on create. */
  assign(tx: Tx, input: Input, stored: Row[] | null): Promise<Row[]>;
  /** Final detail output of a line from its row and the default output. */
  output(line: Row, base: Row): Row;
  /** Extra fields of the create / update result. */
  result(assigned: Row[]): Row;
  /** Relations read with each line by `get` (memo receive: photos in order). */
  lineInclude?: Record<string, unknown>;
  /** Writes per-line child rows after the lines (same transaction); `lineIds` are in input order. */
  afterLines?(tx: Tx, input: Input, lineIds: string[]): Promise<void>;
};

/** A line input of a document with `outstanding` lines. */
type OutstandingLine = LineInput & { outstandingPcs: number; outstandingWeightCt: string };

export const documentListFields = {
  q: z.string().trim().max(100).optional(),
  partyId: z.uuid().optional(),
  from: z.iso.date().optional(),
  to: z.iso.date().optional(),
  cursor: z.string().max(200).nullish(),
  /** Sent by tRPC useInfiniteQuery (Load more); ignored, as in the other paged lists. */
  direction: z.enum(["forward", "backward"]).optional(),
  limit: z.number().int().min(1).max(50).default(50),
  /** transaction-soft-delete D9: false (default) = not deleted, as before; true = deleted documents only. */
  deleted: z.boolean().default(false),
};
export const documentListSchema = z.object(documentListFields).strict();
/** `status` is accepted only by documents with more than one status (memo receive). */
export type DocumentListInput = z.output<typeof documentListSchema> & { status?: string };

const cursorSchema = z.object({ d: z.iso.date(), c: z.iso.datetime(), i: z.uuid(), v: z.literal(1) }).strict();

const money = (value: unknown) => (value as Dec).toFixed(2);
const isoOrNull = (value: unknown) => (value instanceof Date ? value.toISOString() : null);
const text = (value: unknown) => (value === null ? null : (value as Dec).toString());

export class TradeDocumentEngine<Input extends TradeDocumentInput, Out extends Row = Row, Status extends string = "DRAFT"> {
  private readonly logger: Logger;
  private readonly editable: readonly string[];

  constructor(private readonly config: EngineConfig<Input, Out>) {
    this.logger = new Logger(config.event);
    this.editable = config.editableStatuses ?? DRAFT_ONLY;
  }

  private doc(client: Client): DocDelegate {
    return (client as unknown as Record<string, DocDelegate>)[this.config.model];
  }

  private child(client: Client, model: string): ChildDelegate {
    return (client as unknown as Record<string, ChildDelegate>)[model];
  }

  async list(input: DocumentListInput) {
    const { party, errors } = this.config;
    const where: Row = {
      deletedAt: input.deleted ? { not: null } : null,
      ...(input.partyId ? { [party.partyColumn]: input.partyId } : {}),
      ...(input.status ? { status: input.status } : {}),
      ...(input.from || input.to ? { docDate: { ...(input.from ? { gte: toDbDate(input.from) } : {}), ...(input.to ? { lte: toDbDate(input.to) } : {}) } } : {}),
    };
    const and: Row[] = [];
    if (input.q) {
      const contains = { contains: input.q, mode: "insensitive" as const };
      and.push({ OR: [{ docNo: contains }, { [party.nameColumn]: contains }, { ref: contains }] });
    }
    if (input.cursor) {
      const after = decodeCursor(input.cursor);
      const docDate = toDbDate(after.docDate);
      const createdAt = new Date(after.createdAt);
      and.push({ OR: [{ docDate: { lt: docDate } }, { docDate, createdAt: { lt: createdAt } }, { docDate, createdAt, id: { lt: after.id } }] });
    }
    try {
      const [rows, total] = await Promise.all([
        this.doc(prisma).findMany({
          where: { ...where, AND: and },
          orderBy: [{ docDate: "desc" }, { createdAt: "desc" }, { id: "desc" }],
          take: input.limit + 1,
          select: { id: true, docNo: true, status: true, docDate: true, dueDate: true, [party.nameColumn]: true, currencyCode: true, grandTotal: true, createdAt: true, updatedAt: true, deletedAt: true },
        }),
        this.doc(prisma).count({ where }),
      ]);
      const page = rows.slice(0, input.limit);
      const last = page.at(-1);
      return {
        items: page.map((row) => ({
          id: row.id as string,
          docNo: row.docNo as string,
          status: row.status as Status,
          docDate: fromDbDate(row.docDate as Date),
          dueDate: fromDbDate(row.dueDate as Date),
          [party.listNameKey]: row[party.nameColumn] as string,
          currency: row.currencyCode as string,
          grandTotal: money(row.grandTotal),
          updatedAt: (row.updatedAt as Date).toISOString(),
          deletedAt: isoOrNull(row.deletedAt),
        })),
        nextCursor: rows.length > input.limit && last
          ? encodeCursor(fromDbDate(last.docDate as Date), (last.createdAt as Date).toISOString(), last.id as string)
          : null,
        total,
      };
    } catch (error) {
      throw errors.map(error, "list");
    }
  }

  async get(id: string) {
    const { errors } = this.config;
    try {
      const lineInclude = this.config.lineHook?.lineInclude;
      const row = await this.doc(prisma).findUnique({ where: { id }, include: { lines: { orderBy: { position: "asc" }, ...(lineInclude ? { include: lineInclude } : {}) }, charges: true } });
      if (!row) throw errors.notFound();
      return this.toDetail(row);
    } catch (error) {
      throw errors.map(error, "get");
    }
  }

  /** Preview of the number the next save would get; the saved number may be higher. */
  async nextNumber(docDate: string) {
    try {
      return { docNo: (await this.issueNumber(prisma, docDate, false)).docNo };
    } catch (error) {
      throw this.config.errors.map(error, "nextNumber");
    }
  }

  async create(actorId: string, rawInput: Input) {
    const { errors, event, lineHook } = this.config;
    try {
      const created = await prisma.$transaction(async (tx) => {
        const input = this.config.prepare ? await this.config.prepare(tx, rawInput, null) : rawInput;
        const partyColumns = await this.checkReferences(tx, input, null);
        const { numberingId, runningNo, docNo } = await this.issueNumber(tx, input.docDate, true);
        if (docNo.length > DOC_NO_MAX) throw validationException([{ path: "docNo", code: "too_big" }]);
        const header = this.headerData(input);
        const assigned = lineHook ? await lineHook.assign(tx, input, null) : null;
        const id = uuidV7();
        const now = new Date();
        await this.doc(tx).create({
          data: { id, numberingId, runningNo, docNo, status: this.config.createStatus ?? "DRAFT", ...header, ...partyColumns, createdAt: now, createdBy: actorId, updatedAt: now, updatedBy: actorId },
        });
        await this.writeChildren(tx, id, input, assigned);
        return { id, docNo, version: 1, ...(assigned && lineHook ? lineHook.result(assigned) : {}) };
      }, WRITE_TX);
      this.logger.log({ event: `${event}.created`, actorId, id: created.id, docNo: created.docNo });
      return created;
    } catch (error) {
      throw errors.map(error, "create");
    }
  }

  async update(actorId: string, id: string, expectedVersion: number, rawInput: Input) {
    const { errors, event, party, lineModel, chargeModel, parentKey, lineHook } = this.config;
    const storedLineSelect = { ...(this.config.lineOmit?.includes("stoneCodeId") ? {} : { stoneCodeId: true }), ...lineHook?.storedSelect };
    try {
      const saved = await prisma.$transaction(async (tx) => {
        const stored = await this.doc(tx).findUnique({
          where: { id },
          select: { status: true, version: true, deletedAt: true, currencyCode: true, ...party.storedSelect, lines: { select: storedLineSelect } },
        });
        if (!stored) throw errors.notFound();
        // D8: a soft-deleted document is read-only until restored; reported before status and version.
        if (stored.deletedAt) throw errors.deleted();
        // Status first: a document that left its editable status (memo receive APPROVED) reports that, not a stale version.
        if (!this.editable.includes(stored.status as string)) throw errors.statusInvalid();
        if (stored.version !== expectedVersion) throw errors.changed();
        const input = this.config.prepare ? await this.config.prepare(tx, rawInput, id) : rawInput;
        const partyColumns = await this.checkReferences(tx, input, stored);
        const header = this.headerData(input);
        const assigned = lineHook ? await lineHook.assign(tx, input, stored.lines as Row[]) : null;
        const result = await this.doc(tx).updateMany({
          where: { id, version: expectedVersion, status: { in: [...this.editable] }, deletedAt: null },
          data: { ...header, ...partyColumns, version: { increment: 1 }, updatedAt: new Date(), updatedBy: actorId },
        });
        if (result.count === 0) throw errors.changed();
        await this.child(tx, lineModel).deleteMany({ where: { [parentKey]: id } });
        await this.child(tx, chargeModel).deleteMany({ where: { [parentKey]: id } });
        await this.writeChildren(tx, id, input, assigned);
        return { version: expectedVersion + 1, extra: assigned && lineHook ? lineHook.result(assigned) : {} };
      }, WRITE_TX);
      this.logger.log({ event: `${event}.updated`, actorId, id, version: saved.version });
      return { id, version: saved.version, ...saved.extra };
    } catch (error) {
      throw errors.map(error, "update");
    }
  }

  /**
   * Soft delete (ADR-0045 D4): only editable documents (PENDING_APPROVAL drafts) in one guarded `UPDATE … RETURNING`
   * that sets `deleted_at/by` and `version + 1`; status, lines, charges, photos and stock are untouched. The row keeps
   * its Doc No., so the number is never reused (D5: `max + 1` still sees it).
   */
  async delete(actorId: string, id: string, expectedVersion: number) {
    const { errors, event } = this.config;
    let docNo: string;
    try {
      const now = new Date();
      const rows = await this.doc(prisma).updateManyAndReturn({
        where: { id, version: expectedVersion, status: { in: [...this.editable] }, deletedAt: null },
        data: { deletedAt: now, deletedBy: actorId, version: { increment: 1 }, updatedAt: now, updatedBy: actorId },
        select: { docNo: true },
      });
      if (rows.length === 0) explainMiss(errors, await this.missRow(id), this.editable);
      docNo = rows[0].docNo as string;
    } catch (error) {
      throw errors.map(error, "delete");
    }
    const version = expectedVersion + 1;
    this.logger.log({ event: `${event}.deleted`, actorId, id, docNo, version });
    return { ok: true as const, version };
  }

  /**
   * Restore (D6/D7): a deleted document back to its unchanged status (editable again) in one guarded
   * `UPDATE … RETURNING`; content is not re-checked (the next Save / Approve does that).
   */
  async restore(actorId: string, id: string, expectedVersion: number) {
    const { errors, event } = this.config;
    let restored: Row;
    try {
      const now = new Date();
      const rows = await this.doc(prisma).updateManyAndReturn({
        where: { id, version: expectedVersion, deletedAt: { not: null } },
        data: { deletedAt: null, deletedBy: null, version: { increment: 1 }, updatedAt: now, updatedBy: actorId },
        select: { docNo: true, status: true },
      });
      if (rows.length === 0) explainRestoreMiss(errors, await this.missRow(id));
      restored = rows[0];
    } catch (error) {
      throw errors.map(error, "restore");
    }
    const version = expectedVersion + 1;
    this.logger.log({ event: `${event}.restored`, actorId, id, docNo: restored.docNo as string, version });
    return { id, version, status: restored.status as Status };
  }

  private async missRow(id: string): Promise<MissRow> {
    return (await this.doc(prisma).findUnique({ where: { id }, select: MISS_SELECT })) as MissRow;
  }

  /** Document Setup row in effect on the doc date: prefix + separator + max + 1; none → plain 1, 2, 3 … */
  private async issueNumber(client: Client, docDate: string, lock: boolean) {
    const { document, transactionKey } = this.config;
    const numbering = await numberingInEffect(client, transactionKey, toDbDate(docDate), lock);
    if (!numbering) {
      const runningNo = await nextPlainRunningNo(client, document, lock);
      return { numberingId: null, runningNo, docNo: String(runningNo) };
    }
    const runningNo = await nextRunningNo(client, document, numbering);
    return { numberingId: numbering.id, runningNo, docNo: formatDocNo(numbering, runningNo) };
  }

  /**
   * Party, currency and stone codes must be valid; a value already stored on the document may stay even if it
   * became inactive. A foreign currency needs an exchange rate. Returns the party columns.
   */
  private async checkReferences(tx: Tx, input: Input, stored: Row | null): Promise<Row> {
    const { columns, errors } = await this.config.party.check(tx, input, stored);
    if (!(await isCurrencyAllowed(tx, input.currency, stored?.currencyCode as string | undefined))) errors.push({ path: "currency", code: "unknown" });
    const storedStoneCodes = new Set(((stored?.lines as { stoneCodeId: string | null }[] | undefined) ?? []).flatMap((line) => (line.stoneCodeId ? [line.stoneCodeId] : [])));
    const stoneCodeIds = [...new Set(input.lines.flatMap((line) => (line.stoneCodeId ? [line.stoneCodeId] : [])))];
    if (stoneCodeIds.length > 0) {
      const found = await tx.stoneCode.findMany({ where: { id: { in: stoneCodeIds } }, select: { id: true, active: true } });
      const active = new Map(found.map((row) => [row.id, row.active]));
      input.lines.forEach((line, index) => {
        if (!line.stoneCodeId) return;
        const isActive = active.get(line.stoneCodeId);
        if (isActive === undefined || (!isActive && !storedStoneCodes.has(line.stoneCodeId))) errors.push({ path: `lines.${index}.stoneCodeId`, code: "invalid_reference" });
      });
    }
    if (errors.length > 0) throw this.config.errors.referenceInvalid(errors);
    const company = await tx.companyProfile.findUnique({ where: { id: COMPANY_PROFILE_ID }, select: { currencyCode: true } });
    if (company && company.currencyCode !== input.currency && input.exchangeRate === null) {
      throw validationException([{ path: "exchangeRate", code: "required" }]);
    }
    return columns;
  }

  private headerData(input: Input) {
    const totals = totalsOf(input);
    // Amounts must fit DECIMAL(18,2); otherwise the write would fail as a database error.
    const oversize = oversizeAmounts(totals);
    if (oversize.length > 0) throw validationException(oversize.map((path) => ({ path, code: "too_big" })));
    return {
      docDate: toDbDate(input.docDate),
      dueDate: toDbDate(input.dueDate),
      currencyCode: input.currency,
      exchangeRate: input.exchangeRate,
      ref: input.ref,
      documentNote: input.documentNote,
      discountType: input.discount.type,
      discountValue: input.discount.type === "NONE" ? "0" : input.discount.value,
      taxEnabled: input.tax.enabled,
      taxRate: input.tax.rate,
      taxIncluded: input.tax.includeInPrice,
      laborWork: input.labor?.work ?? null,
      laborBasis: input.labor?.basis ?? null,
      laborQty: input.labor?.qty ?? null,
      laborRate: input.labor?.rate ?? null,
      subtotal: totals.subtotal,
      discountAmount: totals.discountAmount,
      priceBeforeTax: totals.priceBeforeTax,
      taxAmount: totals.taxAmount,
      chargesAmount: totals.chargesAmount,
      laborAmount: totals.laborAmount,
      grandTotal: totals.grandTotal,
    };
  }

  /** Lines and charges, written in batches (≤ 2 statements, plus the line hook's). `assigned` = line hook columns by position. */
  private async writeChildren(tx: Tx, documentId: string, input: Input, assigned: Row[] | null = null) {
    const { lineModel, chargeModel, parentKey, lineOmit = [] } = this.config;
    const { lineAmounts, lineDiscounts } = totalsOf(input);
    const lines = input.lines.map((line, index) => omit({
      id: uuidV7(),
      [parentKey]: documentId,
      position: index + 1,
      source: line.source,
      stoneCodeId: line.stoneCodeId,
      stoneCodeSnapshot: line.stoneCode,
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
      pcs: line.pcs,
      weightCt: line.weightCt,
      priceUnit: line.priceUnit,
      unitPrice: line.unitPrice,
      discountType: line.discount.type,
      discountValue: line.discount.type === "NONE" ? "0" : line.discount.value,
      discountAmount: lineDiscounts[index],
      amount: lineAmounts[index],
      itemNote: line.itemNote,
      ...(this.config.outstanding
        ? { outstandingPcs: (line as OutstandingLine).outstandingPcs, outstandingWeightCt: (line as OutstandingLine).outstandingWeightCt }
        : {}),
      ...assigned?.[index],
    }, lineOmit));
    await this.child(tx, lineModel).createMany({ data: lines });
    await this.config.lineHook?.afterLines?.(tx, input, lines.map((line) => line.id as string));
    if (input.serviceCharges.length > 0) {
      await this.child(tx, chargeModel).createMany({ data: input.serviceCharges.map((charge) => ({ [parentKey]: documentId, chargeType: charge.type, amount: charge.amount })) });
    }
  }

  /** Contract output: the quotation document shape with this document's party fields. */
  private toDetail(row: Row) {
    const lines = row.lines as Row[];
    const charges = row.charges as Row[];
    return {
      id: row.id as string,
      docNo: row.docNo as string,
      status: row.status as Status,
      version: row.version as number,
      docDate: fromDbDate(row.docDate as Date),
      dueDate: fromDbDate(row.dueDate as Date),
      ...this.config.party.output(row),
      currency: row.currencyCode as string,
      exchangeRate: text(row.exchangeRate),
      ref: row.ref as string,
      documentNote: row.documentNote as string,
      lines: lines.map((line) => this.lineOutput(line, {
        id: line.id as string,
        source: line.source as "MANUAL",
        stoneCodeId: line.stoneCodeId as string | null,
        stoneCode: line.stoneCodeSnapshot as string,
        stone: line.stone as string,
        shape: line.shape as string,
        size: line.size as string,
        color: line.color as string,
        clarity: line.clarity as string,
        cutting: line.cutting as string,
        quality: line.quality as string,
        lot: line.lot as string,
        location: line.location as string,
        cerType: line.cerType as string,
        cerNo: line.cerNo as string,
        pcs: line.pcs as number,
        weightCt: (line.weightCt as Dec).toFixed(3),
        priceUnit: line.priceUnit as "PER_CT" | "PER_PCS",
        unitPrice: money(line.unitPrice),
        discount: { type: line.discountType as "NONE" | "PERCENT" | "AMOUNT", value: (line.discountValue as Dec).toString() },
        discountAmount: money(line.discountAmount),
        amount: money(line.amount),
        itemNote: line.itemNote as string,
        photoIds: [] as string[],
        // Only documents with `outstanding` lines (memo out return) have these columns.
        outstandingPcs: line.outstandingPcs === undefined ? null : (line.outstandingPcs as number),
        outstandingWeightCt: line.outstandingWeightCt === undefined ? null : (line.outstandingWeightCt as Dec).toFixed(3),
      })),
      discount: { type: row.discountType as "NONE" | "PERCENT" | "AMOUNT", value: (row.discountValue as Dec).toString() },
      tax: { enabled: row.taxEnabled as boolean, rate: (row.taxRate as Dec).toString(), includeInPrice: row.taxIncluded as boolean },
      serviceCharges: [...charges]
        .sort((a, b) => CHARGE_TYPES.indexOf(a.chargeType as never) - CHARGE_TYPES.indexOf(b.chargeType as never))
        .map((charge) => ({ type: charge.chargeType as (typeof CHARGE_TYPES)[number], amount: money(charge.amount) })),
      labor: row.laborWork === null || row.laborBasis === null || row.laborQty === null || row.laborRate === null
        ? null
        : { work: row.laborWork as string, basis: row.laborBasis as "PCS" | "WEIGHT", qty: (row.laborQty as Dec).toString(), rate: money(row.laborRate) },
      totals: {
        subtotal: money(row.subtotal),
        discountAmount: money(row.discountAmount),
        priceBeforeTax: money(row.priceBeforeTax),
        taxAmount: money(row.taxAmount),
        chargesAmount: money(row.chargesAmount),
        laborAmount: money(row.laborAmount),
        grandTotal: money(row.grandTotal),
      },
      ...this.config.detailExtra?.(row),
      createdAt: (row.createdAt as Date).toISOString(),
      createdBy: row.createdBy as string,
      updatedAt: (row.updatedAt as Date).toISOString(),
      // D10: non-null = deleted, shown read-only.
      deletedAt: isoOrNull(row.deletedAt),
      deletedBy: (row.deletedBy as string | null | undefined) ?? null,
    };
  }

  /** Default line output, or the line hook's (memo receive: no stone code id / location, plus Stock ID). */
  private lineOutput<T extends Row>(line: Row, base: T): T {
    return this.config.lineHook ? (this.config.lineHook.output(line, base) as T) : base;
  }
}

/** Totals with the quotation calculator; it reads only the price fields every engine line has. */
function totalsOf(input: TradeDocumentInput) {
  return calculateTotals(input as unknown as Parameters<typeof calculateTotals>[0]);
}

function omit(row: Row, keys: readonly string[]): Row {
  if (keys.length === 0) return row;
  const copy = { ...row };
  for (const key of keys) delete copy[key];
  return copy;
}

function encodeCursor(docDate: string, createdAt: string, id: string): string {
  return Buffer.from(JSON.stringify({ d: docDate, c: createdAt, i: id, v: 1 }), "utf8").toString("base64url");
}

function decodeCursor(value: string): { docDate: string; createdAt: string; id: string } {
  const invalid = () => validationException([{ path: "cursor", code: "invalid" }]);
  if (!/^[A-Za-z0-9_-]{1,200}$/.test(value)) throw invalid();
  try {
    const parsed = cursorSchema.safeParse(JSON.parse(Buffer.from(value, "base64url").toString("utf8")));
    if (!parsed.success) throw invalid();
    return { docDate: parsed.data.d, createdAt: parsed.data.c, id: parsed.data.i };
  } catch {
    throw invalid();
  }
}
