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
 * Shared document engine for memo out and memo out return (ADR-0033): the quotation rules — Document Setup number
 * (max + 1 under the numbering-row lock, plain 1, 2, 3 … without a row), party + address snapshots, server
 * totals with the quotation calculator, optimistic version, drafts only (no approval in rev 1), no photos and no
 * stock posting yet. The party part (customer or vendor) comes from an adapter.
 */

const COMPANY_PROFILE_ID = 1;
const EDITABLE = ["DRAFT"] as const;

type Row = Record<string, unknown>;
type Dec = Prisma.Decimal;
type DocDelegate = {
  findMany(args: unknown): Promise<Row[]>;
  findUnique(args: unknown): Promise<Row | null>;
  count(args: unknown): Promise<number>;
  create(args: unknown): Promise<unknown>;
  updateMany(args: unknown): Promise<{ count: number }>;
  deleteMany(args: unknown): Promise<{ count: number }>;
};
type ChildDelegate = { createMany(args: unknown): Promise<unknown>; deleteMany(args: unknown): Promise<unknown> };
type Client = Tx | typeof prisma;

/** The shared input fields (quotation `tradeDocumentFields`) every adapter's input carries. */
export type TradeDocumentInput = {
  docDate: string;
  dueDate: string;
  currency: string;
  exchangeRate: string | null;
  ref: string;
  documentNote: string;
  lines: LineInput[];
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
};

export const documentListSchema = z.object({
  q: z.string().trim().max(100).optional(),
  partyId: z.uuid().optional(),
  from: z.iso.date().optional(),
  to: z.iso.date().optional(),
  cursor: z.string().max(200).nullish(),
  limit: z.number().int().min(1).max(50).default(50),
}).strict();
export type DocumentListInput = z.output<typeof documentListSchema>;

const cursorSchema = z.object({ d: z.iso.date(), c: z.iso.datetime(), i: z.uuid(), v: z.literal(1) }).strict();

const money = (value: unknown) => (value as Dec).toFixed(2);
const text = (value: unknown) => (value === null ? null : (value as Dec).toString());

export class TradeDocumentEngine<Input extends TradeDocumentInput, Out extends Row = Row> {
  private readonly logger: Logger;

  constructor(private readonly config: EngineConfig<Input, Out>) {
    this.logger = new Logger(config.event);
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
      ...(input.partyId ? { [party.partyColumn]: input.partyId } : {}),
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
          select: { id: true, docNo: true, status: true, docDate: true, dueDate: true, [party.nameColumn]: true, currencyCode: true, grandTotal: true, createdAt: true, updatedAt: true },
        }),
        this.doc(prisma).count({ where }),
      ]);
      const page = rows.slice(0, input.limit);
      const last = page.at(-1);
      return {
        items: page.map((row) => ({
          id: row.id as string,
          docNo: row.docNo as string,
          status: row.status as "DRAFT",
          docDate: fromDbDate(row.docDate as Date),
          dueDate: fromDbDate(row.dueDate as Date),
          [party.listNameKey]: row[party.nameColumn] as string,
          currency: row.currencyCode as string,
          grandTotal: money(row.grandTotal),
          updatedAt: (row.updatedAt as Date).toISOString(),
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
      const row = await this.doc(prisma).findUnique({ where: { id }, include: { lines: { orderBy: { position: "asc" } }, charges: true } });
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

  async create(actorId: string, input: Input) {
    const { errors, event } = this.config;
    try {
      const created = await prisma.$transaction(async (tx) => {
        const partyColumns = await this.checkReferences(tx, input, null);
        const { numberingId, runningNo, docNo } = await this.issueNumber(tx, input.docDate, true);
        if (docNo.length > DOC_NO_MAX) throw validationException([{ path: "docNo", code: "too_big" }]);
        const id = uuidV7();
        const now = new Date();
        await this.doc(tx).create({
          data: { id, numberingId, runningNo, docNo, status: "DRAFT", ...this.headerData(input), ...partyColumns, createdAt: now, createdBy: actorId, updatedAt: now, updatedBy: actorId },
        });
        await this.writeChildren(tx, id, input);
        return { id, docNo, version: 1 };
      }, WRITE_TX);
      this.logger.log({ event: `${event}.created`, actorId, id: created.id, docNo: created.docNo });
      return created;
    } catch (error) {
      throw errors.map(error, "create");
    }
  }

  async update(actorId: string, id: string, expectedVersion: number, input: Input) {
    const { errors, event, party, lineModel, chargeModel, parentKey } = this.config;
    try {
      const version = await prisma.$transaction(async (tx) => {
        const stored = await this.doc(tx).findUnique({
          where: { id },
          select: { status: true, version: true, currencyCode: true, ...party.storedSelect, lines: { select: { stoneCodeId: true } } },
        });
        if (!stored) throw errors.notFound();
        if (stored.version !== expectedVersion) throw errors.changed();
        if (!(EDITABLE as readonly string[]).includes(stored.status as string)) throw errors.statusInvalid();
        const partyColumns = await this.checkReferences(tx, input, stored);
        const result = await this.doc(tx).updateMany({
          where: { id, version: expectedVersion, status: { in: [...EDITABLE] } },
          data: { ...this.headerData(input), ...partyColumns, version: { increment: 1 }, updatedAt: new Date(), updatedBy: actorId },
        });
        if (result.count === 0) throw errors.changed();
        await this.child(tx, lineModel).deleteMany({ where: { [parentKey]: id } });
        await this.child(tx, chargeModel).deleteMany({ where: { [parentKey]: id } });
        await this.writeChildren(tx, id, input);
        return expectedVersion + 1;
      }, WRITE_TX);
      this.logger.log({ event: `${event}.updated`, actorId, id, version });
      return { id, version };
    } catch (error) {
      throw errors.map(error, "update");
    }
  }

  /** Only drafts can be deleted; the next save may reuse the latest number (Q-QT-03 rule). */
  async delete(actorId: string, id: string, expectedVersion: number) {
    const { errors, event } = this.config;
    try {
      const result = await this.doc(prisma).deleteMany({ where: { id, version: expectedVersion, status: { in: [...EDITABLE] } } });
      if (result.count === 0) {
        const row = await this.doc(prisma).findUnique({ where: { id }, select: { version: true } });
        if (!row) throw errors.notFound();
        if (row.version !== expectedVersion) throw errors.changed();
        throw errors.statusInvalid();
      }
    } catch (error) {
      throw errors.map(error, "delete");
    }
    this.logger.log({ event: `${event}.deleted`, actorId, id });
    return { ok: true as const };
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
    const totals = calculateTotals(input);
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

  /** Lines and charges, written in batches (≤ 2 statements). */
  private async writeChildren(tx: Tx, documentId: string, input: Input) {
    const { lineModel, chargeModel, parentKey } = this.config;
    const { lineAmounts, lineDiscounts } = calculateTotals(input);
    const lines = input.lines.map((line, index) => ({
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
    }));
    await this.child(tx, lineModel).createMany({ data: lines });
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
      status: row.status as "DRAFT",
      version: row.version as number,
      docDate: fromDbDate(row.docDate as Date),
      dueDate: fromDbDate(row.dueDate as Date),
      ...this.config.party.output(row),
      currency: row.currencyCode as string,
      exchangeRate: text(row.exchangeRate),
      ref: row.ref as string,
      documentNote: row.documentNote as string,
      lines: lines.map((line) => ({
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
      createdAt: (row.createdAt as Date).toISOString(),
      createdBy: row.createdBy as string,
      updatedAt: (row.updatedAt as Date).toISOString(),
    };
  }
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
