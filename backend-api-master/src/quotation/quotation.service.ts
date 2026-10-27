import { uuidV7 } from "@gms/storage";
import { Injectable, Logger } from "@nestjs/common";
import { z } from "zod";
import { validationException, type FieldError } from "../common/errors";
import { WRITE_TX, type Tx } from "../common/persistence";
import { COUNTRY_OPTIONS } from "../common/reference-data";
import { currencyOptions, isCurrencyAllowed } from "../currency/currency-directory";
import { prisma } from "../database/prisma-client";
import { fromDbDate, toDbDate } from "../document-setup/document-setup.service";
import { DOC_NO_MAX, formatDocNo, nextPlainQuotationRunningNo, nextQuotationRunningNo, numberingInEffect } from "../document-setup/document-numbering";
import { Prisma } from "../generated/prisma/client";
import { sizePartCode } from "../stone-master/stone-code";
import { calculateTotals, oversizeAmounts } from "./quotation.calculate";
import {
  mapQuotationError,
  quotationChanged,
  quotationNotFound,
  quotationPhotoInvalid,
  quotationReferenceInvalid,
  quotationStatusInvalid,
} from "./quotation.errors";
import { QUOTATION_PHOTO_SOURCE } from "./quotation-photo.storage";
import { CHARGE_TYPES, type QuotationInput, type QuotationListInput, type QuotationStatus } from "./quotation.schemas";

/** Statuses in which the document can still be edited (SA-QT-03). */
const EDITABLE: readonly QuotationStatus[] = ["DRAFT", "REJECTED"];
const COMPANY_PROFILE_ID = 1;
const CUSTOMER_OPTIONS_LIMIT = 1_000;
const COUNTRY_NAME = new Map(COUNTRY_OPTIONS.map((item) => [item.code, item.name]));

type StoredRefs = { customerId: string; shippingAddressId: string | null; invoiceAddressId: string | null; currencyCode: string; stoneCodeIds: Set<string> };
type Snapshot = { customerCode: string; customerName: string; shippingText: string; invoiceText: string };

/** Printed address text kept on the quotation (SA-QT-06 snapshot). */
export function formatAddress(address: { name: string; taxId: string | null; address: string; city: string; state: string; postcode: string; countryCode: string }): string {
  const place = [address.city, address.state, address.postcode].filter(Boolean).join(" ");
  return [address.name, address.address, place, COUNTRY_NAME.get(address.countryCode) ?? address.countryCode, address.taxId ? `Tax ID ${address.taxId}` : ""]
    .filter((part) => part.trim() !== "")
    .join("\n")
    .slice(0, 1000);
}

// ---- keyset cursor on (doc_date desc, created_at desc, id desc) (SA-QT-11) ----

const cursorSchema = z.object({ d: z.iso.date(), c: z.iso.datetime(), i: z.uuid(), v: z.literal(1) }).strict();
type ListCursor = { docDate: string; createdAt: string; id: string };

function encodeCursor(cursor: ListCursor): string {
  return Buffer.from(JSON.stringify({ d: cursor.docDate, c: cursor.createdAt, i: cursor.id, v: 1 }), "utf8").toString("base64url");
}

function decodeCursor(value: string): ListCursor {
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

const decimalText = (value: Prisma.Decimal | null) => (value === null ? null : value.toString());
const money = (value: Prisma.Decimal) => value.toFixed(2);

const DETAIL_INCLUDE = {
  lines: { orderBy: { position: "asc" }, include: { photos: { orderBy: { position: "asc" }, select: { fileId: true } } } },
  charges: true,
} as const satisfies Prisma.QuotationInclude;

type DetailRow = Prisma.QuotationGetPayload<{ include: typeof DETAIL_INCLUDE }>;

/** Contract output (api-contract.md `Quotation`). */
export function toQuotation(row: DetailRow) {
  return {
    id: row.id,
    docNo: row.docNo,
    status: row.status as QuotationStatus,
    version: row.version,
    docDate: fromDbDate(row.docDate),
    dueDate: fromDbDate(row.dueDate),
    customerId: row.customerId,
    customer: { code: row.customerCodeSnapshot, name: row.customerNameSnapshot },
    shippingAddressId: row.shippingAddressId,
    shippingAddressText: row.shippingAddressSnapshot,
    invoiceAddressId: row.invoiceAddressId,
    invoiceAddressText: row.invoiceAddressSnapshot,
    currency: row.currencyCode,
    exchangeRate: decimalText(row.exchangeRate),
    ref: row.ref,
    documentNote: row.documentNote,
    lines: row.lines.map((line) => ({
      id: line.id,
      source: line.source as "MANUAL",
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
      pcs: line.pcs,
      weightCt: line.weightCt.toFixed(3),
      priceUnit: line.priceUnit as "PER_CT" | "PER_PCS",
      unitPrice: money(line.unitPrice),
      discount: { type: line.discountType as "NONE" | "PERCENT" | "AMOUNT", value: line.discountValue.toString() },
      discountAmount: money(line.discountAmount),
      amount: money(line.amount),
      itemNote: line.itemNote,
      photoIds: line.photos.map((photo) => photo.fileId),
    })),
    discount: { type: row.discountType as "NONE" | "PERCENT" | "AMOUNT", value: row.discountValue.toString() },
    tax: { enabled: row.taxEnabled, rate: row.taxRate.toString(), includeInPrice: row.taxIncluded },
    serviceCharges: [...row.charges]
      .sort((a, b) => CHARGE_TYPES.indexOf(a.chargeType as never) - CHARGE_TYPES.indexOf(b.chargeType as never))
      .map((charge) => ({ type: charge.chargeType as (typeof CHARGE_TYPES)[number], amount: money(charge.amount) })),
    labor: row.laborWork === null || row.laborBasis === null || row.laborQty === null || row.laborRate === null
      ? null
      : { work: row.laborWork, basis: row.laborBasis as "PCS" | "WEIGHT", qty: row.laborQty.toString(), rate: money(row.laborRate) },
    totals: {
      subtotal: money(row.subtotal),
      discountAmount: money(row.discountAmount),
      priceBeforeTax: money(row.priceBeforeTax),
      taxAmount: money(row.taxAmount),
      chargesAmount: money(row.chargesAmount),
      laborAmount: money(row.laborAmount),
      grandTotal: money(row.grandTotal),
    },
    statusReason: row.statusReason,
    createdAt: row.createdAt.toISOString(),
    createdBy: row.createdBy,
    updatedAt: row.updatedAt.toISOString(),
    approvedAt: row.approvedAt?.toISOString() ?? null,
    approvedBy: row.approvedBy,
  };
}

@Injectable()
export class QuotationService {
  private readonly logger = new Logger(QuotationService.name);

  async list(input: QuotationListInput) {
    const where: Prisma.QuotationWhereInput = {
      status: input.status ?? { not: "CANCELLED" },
      ...(input.customerId ? { customerId: input.customerId } : {}),
      ...(input.from || input.to ? { docDate: { ...(input.from ? { gte: toDbDate(input.from) } : {}), ...(input.to ? { lte: toDbDate(input.to) } : {}) } } : {}),
    };
    const and: Prisma.QuotationWhereInput[] = [];
    if (input.q) {
      const contains = { contains: input.q, mode: "insensitive" as const };
      and.push({ OR: [{ docNo: contains }, { customerNameSnapshot: contains }, { ref: contains }] });
    }
    if (input.cursor) {
      const after = decodeCursor(input.cursor);
      const docDate = toDbDate(after.docDate);
      const createdAt = new Date(after.createdAt);
      and.push({ OR: [
        { docDate: { lt: docDate } },
        { docDate, createdAt: { lt: createdAt } },
        { docDate, createdAt, id: { lt: after.id } },
      ] });
    }
    try {
      const [rows, total] = await Promise.all([
        prisma.quotation.findMany({
          where: { ...where, AND: and },
          orderBy: [{ docDate: "desc" }, { createdAt: "desc" }, { id: "desc" }],
          take: input.limit + 1,
          select: { id: true, docNo: true, status: true, docDate: true, dueDate: true, customerNameSnapshot: true, currencyCode: true, grandTotal: true, createdAt: true, updatedAt: true },
        }),
        prisma.quotation.count({ where }),
      ]);
      const page = rows.slice(0, input.limit);
      const last = page.at(-1);
      return {
        items: page.map((row) => ({
          id: row.id,
          docNo: row.docNo,
          status: row.status as QuotationStatus,
          docDate: fromDbDate(row.docDate),
          dueDate: fromDbDate(row.dueDate),
          customerName: row.customerNameSnapshot,
          currency: row.currencyCode,
          grandTotal: money(row.grandTotal),
          updatedAt: row.updatedAt.toISOString(),
        })),
        nextCursor: rows.length > input.limit && last ? encodeCursor({ docDate: fromDbDate(last.docDate), createdAt: last.createdAt.toISOString(), id: last.id }) : null,
        total,
      };
    } catch (error) {
      throw mapQuotationError(error, "list");
    }
  }

  async get(id: string) {
    try {
      const row = await prisma.quotation.findUnique({ where: { id }, include: DETAIL_INCLUDE });
      if (!row) throw quotationNotFound();
      return toQuotation(row);
    } catch (error) {
      throw mapQuotationError(error, "get");
    }
  }

  /** Preview of the number the next save would get (SA-QT-04); the saved number may be higher. */
  async nextNumber(docDate: string) {
    try {
      return { docNo: (await this.issueNumber(prisma, docDate, false)).docNo };
    } catch (error) {
      throw mapQuotationError(error, "nextNumber");
    }
  }

  /**
   * SA-QT-04: the Document Setup row in effect on the doc date gives prefix + separator + max + 1; with
   * no row in effect (owner 2026-10-26) the number is plain 1, 2, 3 … and `numberingId` is null.
   */
  private async issueNumber(client: Tx | typeof prisma, docDate: string, lock: boolean) {
    const numbering = await numberingInEffect(client, "quotation", toDbDate(docDate), lock);
    if (!numbering) {
      const runningNo = await nextPlainQuotationRunningNo(client, lock);
      return { numberingId: null, runningNo, docNo: String(runningNo) };
    }
    const runningNo = await nextQuotationRunningNo(client, numbering);
    return { numberingId: numbering.id, runningNo, docNo: formatDocNo(numbering, runningNo) };
  }

  /**
   * Header and line choices in one call (SA-QT-11): active customers with addresses (plus an included
   * stored one), and active stone codes / part names for the item editor, so quotation users don't need
   * `stone-master:VIEW`. Each list ≤ 1,000 rows.
   */
  async options(includeCustomerId?: string) {
    try {
      // Each part comes as {name, code} so the editor can rebuild a stone code when a part changes
      // (owner 2026-10-27); a size has no code, so its name stands in (stone master SA-SM-05a).
      const parts = (rows: { name: string; code?: string }[]) => {
        const seen = new Set<string>();
        return rows.flatMap((row) => {
          if (seen.has(row.name)) return [];
          seen.add(row.name);
          return [{ name: row.name, code: row.code ?? sizePartCode(row.name) }];
        });
      };
      const active = { where: { active: true }, select: { name: true, code: true }, orderBy: { name: "asc" as const }, take: CUSTOMER_OPTIONS_LIMIT };
      const part = { select: { name: true } };
      const [stoneCodes, stoneNames, shapes, sizes, colors, clarities, cuttings, qualities] = await Promise.all([
        prisma.stoneCode.findMany({
          where: { active: true },
          orderBy: { code: "asc" },
          take: CUSTOMER_OPTIONS_LIMIT,
          select: { id: true, code: true, partOrder: true, stoneName: part, shape: part, size: part, color: part, clarity: part, cutting: part, quality: part },
        }),
        prisma.stoneName.findMany(active),
        prisma.stoneShape.findMany(active),
        prisma.stoneSize.findMany({ ...active, select: { name: true } }),
        prisma.stoneColor.findMany(active),
        prisma.stoneClarity.findMany(active),
        prisma.stoneCutting.findMany(active),
        prisma.stoneQuality.findMany(active),
      ]);
      const stone = {
        codes: stoneCodes.map((row) => ({
          id: row.id,
          code: row.code,
          partOrder: row.partOrder,
          stone: row.stoneName?.name ?? "",
          shape: row.shape?.name ?? "",
          size: row.size?.name ?? "",
          color: row.color?.name ?? "",
          clarity: row.clarity?.name ?? "",
          cutting: row.cutting?.name ?? "",
          quality: row.quality?.name ?? "",
        })),
        stones: parts(stoneNames),
        shapes: parts(shapes),
        sizes: parts(sizes),
        colors: parts(colors),
        clarities: parts(clarities),
        cuttings: parts(cuttings),
        qualities: parts(qualities),
      };
      const [customers, company, setup] = await Promise.all([
        prisma.customer.findMany({
          where: includeCustomerId ? { OR: [{ active: true }, { id: includeCustomerId }] } : { active: true },
          orderBy: [{ nameKey: "asc" }, { id: "asc" }],
          take: CUSTOMER_OPTIONS_LIMIT,
          select: { id: true, code: true, name: true, active: true, currencyCode: true, addresses: { orderBy: [{ type: "asc" }, { position: "asc" }] } },
        }),
        prisma.companyProfile.findUnique({ where: { id: COMPANY_PROFILE_ID }, select: { currencyCode: true } }),
        prisma.documentSetup.findUnique({ where: { transactionKey: "quotation" }, select: { transactionKey: true } }),
      ]);
      return {
        customers: customers.map((customer) => ({
          id: customer.id,
          code: customer.code,
          name: customer.name,
          active: customer.active,
          currency: customer.currencyCode,
          addresses: customer.addresses.map((address) => ({
            id: address.id,
            type: address.type,
            label: formatAddress(address).split("\n").slice(0, 2).join(" · "),
            isDefault: address.isDefault,
          })),
        })),
        // Setup › Currency (currency SA-CUR-05): active currencies only.
        currencies: (await currencyOptions(prisma)).filter((item) => item.active).map((item) => item.code),
        companyCurrency: company?.currencyCode ?? null,
        chargeTypes: [...CHARGE_TYPES],
        numbering: { configured: setup !== null },
        stone,
      };
    } catch (error) {
      throw mapQuotationError(error, "options");
    }
  }

  async create(actorId: string, input: QuotationInput) {
    try {
      const created = await prisma.$transaction(async (tx) => {
        const snapshot = await this.checkReferences(tx, input, null);
        const { numberingId, runningNo, docNo } = await this.issueNumber(tx, input.docDate, true);
        if (docNo.length > DOC_NO_MAX) throw validationException([{ path: "docNo", code: "too_big" }]);
        const id = uuidV7();
        const now = new Date();
        await tx.quotation.create({
          data: {
            id,
            numberingId,
            runningNo,
            docNo,
            status: "DRAFT",
            ...this.headerData(input, snapshot),
            createdAt: now,
            createdBy: actorId,
            updatedAt: now,
            updatedBy: actorId,
          },
        });
        await this.writeChildren(tx, id, input);
        return { id, docNo, version: 1 };
      }, WRITE_TX);
      this.logger.log({ event: "quotation.created", actorId, id: created.id, docNo: created.docNo });
      return created;
    } catch (error) {
      throw mapQuotationError(error, "create");
    }
  }

  async update(actorId: string, id: string, expectedVersion: number, input: QuotationInput) {
    try {
      const version = await prisma.$transaction(async (tx) => {
        const stored = await tx.quotation.findUnique({
          where: { id },
          select: { status: true, version: true, customerId: true, shippingAddressId: true, invoiceAddressId: true, currencyCode: true, lines: { select: { stoneCodeId: true } } },
        });
        if (!stored) throw quotationNotFound();
        if (stored.version !== expectedVersion) throw quotationChanged();
        if (!EDITABLE.includes(stored.status as QuotationStatus)) throw quotationStatusInvalid();
        const snapshot = await this.checkReferences(tx, input, {
          customerId: stored.customerId,
          shippingAddressId: stored.shippingAddressId,
          invoiceAddressId: stored.invoiceAddressId,
          currencyCode: stored.currencyCode,
          stoneCodeIds: new Set(stored.lines.flatMap((line) => (line.stoneCodeId ? [line.stoneCodeId] : []))),
        });
        const result = await tx.quotation.updateMany({
          where: { id, version: expectedVersion, status: { in: [...EDITABLE] } },
          data: { ...this.headerData(input, snapshot), version: { increment: 1 }, updatedAt: new Date(), updatedBy: actorId },
        });
        if (result.count === 0) throw quotationChanged();
        await tx.quotationLine.deleteMany({ where: { quotationId: id } });
        await tx.quotationCharge.deleteMany({ where: { quotationId: id } });
        await this.writeChildren(tx, id, input);
        return expectedVersion + 1;
      }, WRITE_TX);
      this.logger.log({ event: "quotation.updated", actorId, id, version });
      return { id, version };
    } catch (error) {
      throw mapQuotationError(error, "update");
    }
  }

  submit(actorId: string, id: string, expectedVersion: number) {
    return this.transition(actorId, id, expectedVersion, ["DRAFT", "REJECTED"], "PENDING_APPROVAL", { statusReason: null }, "submitted");
  }

  /** Used by the separate Approve page (owner 2026-10-26, Q-QT-02); the creator may approve. */
  approve(actorId: string, id: string, expectedVersion: number) {
    return this.transition(actorId, id, expectedVersion, ["PENDING_APPROVAL"], "APPROVED", { approvedAt: new Date(), approvedBy: actorId, statusReason: null }, "approved");
  }

  reject(actorId: string, id: string, expectedVersion: number, reason: string) {
    return this.transition(actorId, id, expectedVersion, ["PENDING_APPROVAL"], "REJECTED", { statusReason: reason }, "rejected");
  }

  cancel(actorId: string, id: string, expectedVersion: number, reason: string) {
    return this.transition(actorId, id, expectedVersion, ["DRAFT", "PENDING_APPROVAL", "APPROVED", "REJECTED"], "CANCELLED", { statusReason: reason }, "cancelled");
  }

  /** Only drafts can be deleted (SA-QT-03); the next save may reuse the latest number (Q-QT-03). */
  async delete(actorId: string, id: string, expectedVersion: number) {
    try {
      const result = await prisma.quotation.deleteMany({ where: { id, version: expectedVersion, status: "DRAFT" } });
      if (result.count === 0) await this.explainMiss(prisma, id, expectedVersion);
    } catch (error) {
      throw mapQuotationError(error, "delete");
    }
    this.logger.log({ event: "quotation.deleted", actorId, id });
    return { ok: true as const };
  }

  private async transition(actorId: string, id: string, expectedVersion: number, from: readonly QuotationStatus[], to: QuotationStatus, data: Prisma.QuotationUpdateManyMutationInput, event: string) {
    try {
      const result = await prisma.quotation.updateMany({
        where: { id, version: expectedVersion, status: { in: [...from] } },
        data: { ...data, status: to, version: { increment: 1 }, updatedAt: new Date(), updatedBy: actorId },
      });
      if (result.count === 0) await this.explainMiss(prisma, id, expectedVersion);
    } catch (error) {
      throw mapQuotationError(error, event);
    }
    this.logger.log({ event: `quotation.${event}`, actorId, id });
    return { id, status: to, version: expectedVersion + 1 };
  }

  /** A guarded write touched no row: missing → NOT_FOUND, other version → CHANGED, else STATUS_INVALID. */
  private async explainMiss(client: Tx | typeof prisma, id: string, expectedVersion: number): Promise<never> {
    const row = await client.quotation.findUnique({ where: { id }, select: { version: true } });
    if (!row) throw quotationNotFound();
    if (row.version !== expectedVersion) throw quotationChanged();
    throw quotationStatusInvalid();
  }

  /**
   * SA-QT-06/07/10: customer, addresses, currency, stone codes and photos must be valid; a value already
   * stored on the quotation may stay even if it became inactive. Returns the snapshot texts.
   */
  private async checkReferences(tx: Tx, input: QuotationInput, stored: StoredRefs | null): Promise<Snapshot> {
    const errors: FieldError[] = [];
    const customer = await tx.customer.findUnique({ where: { id: input.customerId }, select: { code: true, name: true, active: true, addresses: true } });
    if (!customer || (!customer.active && input.customerId !== stored?.customerId)) {
      throw quotationReferenceInvalid([{ path: "customerId", code: "invalid_reference" }]);
    }
    const shipping = customer.addresses.find((address) => address.id === input.shippingAddressId && address.type === "SHIPPING");
    const invoice = customer.addresses.find((address) => address.id === input.invoiceAddressId && address.type === "INVOICE");
    if (!shipping) errors.push({ path: "shippingAddressId", code: "invalid_reference" });
    if (!invoice) errors.push({ path: "invoiceAddressId", code: "invalid_reference" });
    // Currency master (SA-CUR-05): an active currency, or the one already stored on this quotation.
    if (!(await isCurrencyAllowed(tx, input.currency, stored?.currencyCode))) errors.push({ path: "currency", code: "unknown" });

    const stoneCodeIds = [...new Set(input.lines.flatMap((line) => (line.stoneCodeId ? [line.stoneCodeId] : [])))];
    if (stoneCodeIds.length > 0) {
      const found = await tx.stoneCode.findMany({ where: { id: { in: stoneCodeIds } }, select: { id: true, active: true } });
      const active = new Map(found.map((row) => [row.id, row.active]));
      input.lines.forEach((line, index) => {
        if (!line.stoneCodeId) return;
        const isActive = active.get(line.stoneCodeId);
        if (isActive === undefined || (!isActive && !stored?.stoneCodeIds.has(line.stoneCodeId))) errors.push({ path: `lines.${index}.stoneCodeId`, code: "invalid_reference" });
      });
    }
    if (errors.length > 0) throw quotationReferenceInvalid(errors);

    const photoIds = [...new Set(input.lines.flatMap((line) => line.photoIds))];
    if (photoIds.length > 0) {
      const files = await tx.storedFile.findMany({ where: { id: { in: photoIds }, sourceType: QUOTATION_PHOTO_SOURCE, status: "ready" }, select: { id: true } });
      const known = new Set(files.map((file) => file.id));
      input.lines.forEach((line, index) => {
        const bad = line.photoIds.findIndex((photoId) => !known.has(photoId));
        if (bad >= 0) throw quotationPhotoInvalid(`lines.${index}.photoIds.${bad}`);
      });
    }

    // A foreign-currency quotation needs a rate to the company currency (SA-QT-06).
    const company = await tx.companyProfile.findUnique({ where: { id: COMPANY_PROFILE_ID }, select: { currencyCode: true } });
    if (company && company.currencyCode !== input.currency && input.exchangeRate === null) {
      throw validationException([{ path: "exchangeRate", code: "required" }]);
    }
    return {
      customerCode: customer.code,
      customerName: customer.name,
      shippingText: formatAddress(shipping!),
      invoiceText: formatAddress(invoice!),
    };
  }

  private headerData(input: QuotationInput, snapshot: Snapshot) {
    const totals = calculateTotals(input);
    // Amounts must fit DECIMAL(18,2); otherwise the write would fail as a database error.
    const oversize = oversizeAmounts(totals);
    if (oversize.length > 0) throw validationException(oversize.map((path) => ({ path, code: "too_big" })));
    return {
      docDate: toDbDate(input.docDate),
      dueDate: toDbDate(input.dueDate),
      customerId: input.customerId,
      customerCodeSnapshot: snapshot.customerCode,
      customerNameSnapshot: snapshot.customerName,
      shippingAddressId: input.shippingAddressId,
      shippingAddressSnapshot: snapshot.shippingText,
      invoiceAddressId: input.invoiceAddressId,
      invoiceAddressSnapshot: snapshot.invoiceText,
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

  /** Lines, their photos and the charges, written in batches (≤ 3 statements). */
  private async writeChildren(tx: Tx, quotationId: string, input: QuotationInput) {
    const { lineAmounts, lineDiscounts } = calculateTotals(input);
    const lines = input.lines.map((line, index) => ({
      id: uuidV7(),
      quotationId,
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
    await tx.quotationLine.createMany({ data: lines });
    const photos = input.lines.flatMap((line, index) => line.photoIds.map((fileId, position) => ({ lineId: lines[index].id, position: position + 1, fileId })));
    if (photos.length > 0) await tx.quotationLinePhoto.createMany({ data: photos });
    if (input.serviceCharges.length > 0) {
      await tx.quotationCharge.createMany({ data: input.serviceCharges.map((charge) => ({ quotationId, chargeType: charge.type, amount: charge.amount })) });
    }
  }
}
