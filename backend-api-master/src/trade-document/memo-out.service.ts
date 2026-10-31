import { HttpStatus, Injectable, Logger } from "@nestjs/common";
import { partnerException, validationException, type FieldError } from "../common/errors";
import { WRITE_TX, type Tx } from "../common/persistence";
import { currencyOptions } from "../currency/currency-directory";
import { prisma } from "../database/prisma-client";
import { Prisma } from "../generated/prisma/client";
import { CHARGE_TYPES } from "../quotation/quotation.schemas";
import { customerLineOptions, formatAddress, stoneLineOptions } from "../quotation/quotation.service";
import { documentErrors, type DocumentErrors } from "./document-errors";
import { TradeDocumentEngine, type LineHook, type PartyAdapter, type TradeDocumentInput } from "./document-engine";
import type { MemoOutInput, MemoReceiveListInput, MemoReceiveStatus } from "./memo-schemas";
import { takeFromMemoStock } from "./memo-stock.service";

export const memoOutErrors = documentErrors("MEMO_OUT", "MemoOut", "memo_out");
/** Approval found a Memo Stock item with less pending than a stock line takes (another document took it first). */
export const memoOutPendingShort = (fields: FieldError[]) => partnerException("MEMO_OUT_PENDING_SHORT", HttpStatus.CONFLICT, fields);

type MemoOutStatus = MemoReceiveStatus;
const PENDING: MemoOutStatus = "PENDING_APPROVAL";
const APPROVED: MemoOutStatus = "APPROVED";

/** A stock line after `prepare`: the item's Stock ID and its pending at save, stored on the line (SA-MO-12). */
type PreparedLine = MemoOutInput["lines"][number] & { stockId?: string; stockPendingPcs?: number; stockPendingWeightCt?: string };

/** Customer + its SHIPPING and INVOICE address, like a quotation (memo-out SA-MO-05; memo out return SA-MOR-11). */
export type CustomerOut = {
  customerId: string;
  customer: { code: string; name: string };
  shippingAddressId: string | null;
  shippingAddressText: string;
  invoiceAddressId: string | null;
  invoiceAddressText: string;
};

type CustomerInput = TradeDocumentInput & { customerId: string; shippingAddressId: string; invoiceAddressId: string };

/** Customer party adapter, shared by memo out and memo out return (Q-MOR-11/12); errors use the document's codes. */
export function customerParty<Input extends CustomerInput>(codes: DocumentErrors): PartyAdapter<Input, CustomerOut> {
  return {
    storedSelect: { customerId: true },
    nameColumn: "customerNameSnapshot",
    listNameKey: "customerName",
    partyColumn: "customerId",
    async check(tx, input, stored) {
      const errors: FieldError[] = [];
      const customer = await tx.customer.findUnique({ where: { id: input.customerId }, select: { code: true, name: true, active: true, addresses: true } });
      if (!customer || (!customer.active && input.customerId !== stored?.customerId)) throw codes.referenceInvalid([{ path: "customerId", code: "invalid_reference" }]);
      const shipping = customer.addresses.find((address) => address.id === input.shippingAddressId && address.type === "SHIPPING");
      const invoice = customer.addresses.find((address) => address.id === input.invoiceAddressId && address.type === "INVOICE");
      if (!shipping) errors.push({ path: "shippingAddressId", code: "invalid_reference" });
      if (!invoice) errors.push({ path: "invoiceAddressId", code: "invalid_reference" });
      return {
        errors,
        columns: {
          customerId: input.customerId,
          customerCodeSnapshot: customer.code,
          customerNameSnapshot: customer.name,
          shippingAddressId: input.shippingAddressId,
          shippingAddressSnapshot: shipping ? formatAddress(shipping) : "",
          invoiceAddressId: input.invoiceAddressId,
          invoiceAddressSnapshot: invoice ? formatAddress(invoice) : "",
        },
      };
    },
    output(row) {
      return {
        customerId: row.customerId as string,
        customer: { code: row.customerCodeSnapshot as string, name: row.customerNameSnapshot as string },
        shippingAddressId: row.shippingAddressId as string | null,
        shippingAddressText: row.shippingAddressSnapshot as string,
        invoiceAddressId: row.invoiceAddressId as string | null,
        invoiceAddressText: row.invoiceAddressSnapshot as string,
      };
    },
  };
}

/**
 * Completes stock lines from their Memo Stock items inside the save transaction (engine `prepare`, SA-MO-13). Each item
 * must exist and have the line's pcs / weight pending. Stock ID, lot, location, stone attributes, certificate and price
 * unit are copied from it, and stone code stays empty because Memo Stock has none. Sale Price, discount and item note
 * stay the user's. Saving reserves nothing; approval re-checks under a row lock (Q-MR-15). Manual lines pass unchanged.
 */
async function completeStockLines(tx: Tx, input: MemoOutInput): Promise<MemoOutInput> {
  const ids = input.lines.flatMap((line) => (line.memoStockId ? [line.memoStockId] : []));
  if (ids.length === 0) return input;
  const items = new Map((await tx.memoStock.findMany({ where: { id: { in: ids } } })).map((item) => [item.id, item]));
  const references: FieldError[] = [];
  const quantities: FieldError[] = [];
  const lines = input.lines.map((line, index): PreparedLine => {
    if (!line.memoStockId) return line;
    const item = items.get(line.memoStockId);
    if (!item) {
      references.push({ path: `lines.${index}.memoStockId`, code: "invalid_reference" });
      return line;
    }
    if (line.pcs > item.pendingPcs) quantities.push({ path: `lines.${index}.pcs`, code: "exceeds_pending" });
    if (new Prisma.Decimal(line.weightCt).gt(item.pendingWeightCt)) quantities.push({ path: `lines.${index}.weightCt`, code: "exceeds_pending" });
    return {
      ...line,
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
      stockId: item.stockId,
      stockPendingPcs: item.pendingPcs,
      stockPendingWeightCt: item.pendingWeightCt.toFixed(3),
    };
  });
  if (references.length > 0) throw memoOutErrors.referenceInvalid(references);
  if (quantities.length > 0) throw validationException(quantities);
  return { ...input, lines };
}

/** Stock lines store their item, Stock ID and pending at save, with source STOCK; manual lines keep NULLs (SA-MO-12). */
const stockLines: LineHook<MemoOutInput> = {
  storedSelect: { id: true },
  assign: async (_tx, input) =>
    (input.lines as PreparedLine[]).map((line) =>
      line.memoStockId
        ? { source: "STOCK", memoStockId: line.memoStockId, stockId: line.stockId, stockPendingPcs: line.stockPendingPcs, stockPendingWeightCt: line.stockPendingWeightCt }
        : {},
    ),
  output: (line, base) => ({
    ...base,
    source: line.source as "MANUAL" | "STOCK",
    stockId: (line.stockId as string | null) ?? null,
    memoStockId: (line.memoStockId as string | null) ?? null,
    stockPendingPcs: (line.stockPendingPcs as number | null) ?? null,
    stockPendingWeightCt: line.stockPendingWeightCt === null || line.stockPendingWeightCt === undefined ? null : (line.stockPendingWeightCt as Prisma.Decimal).toFixed(3),
  }),
  result: () => ({}),
};

/**
 * memo-out SA rev 2 / ADR-0033 rev 2 (owner 2026-10-31): Document Setup key `memo-out`, PENDING_APPROVAL → APPROVED.
 * Lines picked From Stock name a Memo Stock item, and approval moves their quantity from pending into Reserve. Manual
 * lines cut nothing (Q-MO-09).
 */
@Injectable()
export class MemoOutService {
  private readonly logger = new Logger("memo_out");

  private readonly engine = new TradeDocumentEngine<MemoOutInput, CustomerOut, MemoOutStatus>({
    document: "memoOut",
    transactionKey: "memo-out",
    event: "memo_out",
    model: "memoOut",
    lineModel: "memoOutLine",
    chargeModel: "memoOutCharge",
    parentKey: "memoOutId",
    errors: memoOutErrors,
    party: customerParty<MemoOutInput>(memoOutErrors),
    createStatus: PENDING,
    editableStatuses: [PENDING],
    prepare: completeStockLines,
    lineHook: stockLines,
    detailExtra: (row) => ({
      approvedAt: row.approvedAt ? (row.approvedAt as Date).toISOString() : null,
      approvedBy: (row.approvedBy as string | null) ?? null,
    }),
  });

  list(input: MemoReceiveListInput) {
    return this.engine.list(input);
  }
  get(id: string) {
    return this.engine.get(id) as Promise<unknown> as Promise<MemoOutDetail>;
  }
  nextNumber(docDate: string) {
    return this.engine.nextNumber(docDate);
  }
  create(actorId: string, input: MemoOutInput) {
    return this.engine.create(actorId, input);
  }
  update(actorId: string, id: string, expectedVersion: number, input: MemoOutInput) {
    return this.engine.update(actorId, id, expectedVersion, input);
  }
  delete(actorId: string, id: string, expectedVersion: number) {
    return this.engine.delete(actorId, id, expectedVersion);
  }

  /**
   * PENDING_APPROVAL → APPROVED, and each stock line's pcs / weight move from its Memo Stock item's pending into Reserve
   * (SA-MO-14, Q-MOV-04), in one transaction. The guarded UPDATE serializes approvals of this document; the shared
   * `takeFromMemoStock` locks the items and refuses a short one with `MEMO_OUT_PENDING_SHORT` (409), changing nothing.
   * Manual lines change no stock.
   */
  async approve(actorId: string, id: string, expectedVersion: number) {
    const errors = memoOutErrors;
    try {
      const approved = await prisma.$transaction(async (tx) => {
        const now = new Date();
        const updated = await tx.memoOut.updateMany({
          where: { id, version: expectedVersion, status: PENDING },
          data: { status: APPROVED, approvedAt: now, approvedBy: actorId, version: { increment: 1 }, updatedAt: now, updatedBy: actorId },
        });
        if (updated.count === 0) {
          const row = await tx.memoOut.findUnique({ where: { id }, select: { status: true } });
          if (!row) throw errors.notFound();
          if (row.status !== PENDING) throw errors.statusInvalid();
          throw errors.changed();
        }
        const document = await tx.memoOut.findUniqueOrThrow({
          where: { id },
          select: { docNo: true, lines: { orderBy: { position: "asc" }, select: { memoStockId: true, pcs: true, weightCt: true } } },
        });
        const takes = document.lines.flatMap((line, index) => (line.memoStockId ? [{ memoStockId: line.memoStockId, pcs: line.pcs, weightCt: line.weightCt, index }] : []));
        await takeFromMemoStock(tx, takes, "reserved", memoOutPendingShort, now);
        return { docNo: document.docNo, stockLineCount: takes.length };
      }, WRITE_TX);
      this.logger.log({ event: "memo_out.approved", actorId, id, docNo: approved.docNo, stockLineCount: approved.stockLineCount });
      return { id, version: expectedVersion + 1, status: APPROVED as "APPROVED", stockLineCount: approved.stockLineCount };
    } catch (error) {
      throw errors.map(error, "approve");
    }
  }

  /** Same shape as `quotation.options`, so the page reuses the quotation header fields and item editor. */
  async options(includeCustomerId?: string) {
    try {
      return await customerDocumentOptions("memo-out", includeCustomerId);
    } catch (error) {
      throw memoOutErrors.map(error, "options");
    }
  }
}

/** `quotation.options` shape for a customer document with Document Setup key `transactionKey` (memo out, memo out return). */
export async function customerDocumentOptions(transactionKey: string, includeCustomerId?: string) {
  const [stone, customers, company, setup, currencies] = await Promise.all([
    stoneLineOptions(),
    customerLineOptions(includeCustomerId),
    prisma.companyProfile.findUnique({ where: { id: 1 }, select: { currencyCode: true } }),
    prisma.documentSetup.findUnique({ where: { transactionKey }, select: { transactionKey: true } }),
    currencyOptions(prisma),
  ]);
  return {
    customers,
    currencies: currencies.filter((item) => item.active).map((item) => item.code),
    companyCurrency: company?.currencyCode ?? null,
    chargeTypes: [...CHARGE_TYPES],
    numbering: { configured: setup !== null },
    stone,
  };
}

type EngineDetail = Awaited<ReturnType<TradeDocumentEngine<MemoOutInput, CustomerOut, MemoOutStatus>["get"]>>;
type MemoOutLineOut = Omit<EngineDetail["lines"][number], "source"> & {
  source: "MANUAL" | "STOCK";
  memoStockId: string | null;
  stockId: string | null;
  stockPendingPcs: number | null;
  stockPendingWeightCt: string | null;
};
/** api-contract `MemoOut` rev 2 (the line hook and `detailExtra` shape the engine output at run time). */
export type MemoOutDetail = Omit<EngineDetail, "lines"> & { lines: MemoOutLineOut[]; approvedAt: string | null; approvedBy: string | null };
