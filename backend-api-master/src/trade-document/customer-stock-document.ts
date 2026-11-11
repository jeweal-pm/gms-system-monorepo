import { HttpStatus, Logger } from "@nestjs/common";
import { partnerException, type FieldError } from "../common/errors";
import { WRITE_TX, type Tx } from "../common/persistence";
import { currencyOptions } from "../currency/currency-directory";
import { prisma } from "../database/prisma-client";
import type { NumberedDocument } from "../document-setup/document-numbering";
import type { DocumentTransactionKey } from "../document-setup/document-setup.transactions";
import { Prisma } from "../generated/prisma/client";
import { CHARGE_TYPES } from "../quotation/quotation.schemas";
import { customerLineOptions, formatAddress, stoneLineOptions } from "../quotation/quotation.service";
import { documentErrors, type DocumentErrors } from "./document-errors";
import { explainMiss, MISS_SELECT, TradeDocumentEngine, type LineHook, type PartyAdapter, type TradeDocumentInput, type MissRow } from "./document-engine";
import type { MemoOutInput, MemoReceiveListInput, MemoReceiveStatus } from "./memo-schemas";
import { takeFromMemoStock } from "./memo-stock.service";
import { completeFromMemoStock } from "./stock-lines";
import { withLinePhotos, type LinePhotoDocument } from "./line-photos";

/**
 * A customer document whose lines may come From Stock (memo-out SA rev 2 SA-MO-11…15; reserve SA rev 1 SA-RS-04…08):
 * - customer + SHIPPING / INVOICE address;
 * - Document Setup number;
 * - PENDING_APPROVAL → APPROVED;
 * - lines that may name a Memo Stock item, which approval moves from pending into Reserve.
 * Memo Out and Reserve share it, and each has its own tables, numbering key, error codes and grants. Rows keyed in by
 * hand hold nothing.
 */
export type CustomerStockInput = MemoOutInput;
export type CustomerStockStatus = MemoReceiveStatus;
const PENDING: CustomerStockStatus = "PENDING_APPROVAL";
const APPROVED: CustomerStockStatus = "APPROVED";

/** Customer + its SHIPPING and INVOICE address, like a quotation (memo-out SA-MO-05; memo out return SA-MOR-11). */
export type CustomerOut = {
  customerId: string;
  customer: { code: string; name: string };
  shippingAddressId: string | null;
  shippingAddressText: string;
  invoiceAddressId: string | null;
  invoiceAddressText: string;
};

/** A stock line after `prepare`: the item's Stock ID and its pending at save, stored on the line (SA-MO-12). */
type PreparedLine = CustomerStockInput["lines"][number] & { stockId?: string; stockPendingPcs?: number; stockPendingWeightCt?: string };

type CustomerInput = TradeDocumentInput & { customerId: string; shippingAddressId: string; invoiceAddressId: string };

/** Customer party adapter, shared by memo out, reserve and memo out return (Q-MOR-11/12); errors use the document's codes. */
export function customerParty<Input extends CustomerInput>(errors: DocumentErrors): PartyAdapter<Input, CustomerOut> {
  return {
    storedSelect: { customerId: true },
    nameColumn: "customerNameSnapshot",
    listNameKey: "customerName",
    partyColumn: "customerId",
    async check(tx, input, stored) {
      const fieldErrors: FieldError[] = [];
      const customer = await tx.customer.findUnique({ where: { id: input.customerId }, select: { code: true, name: true, active: true, addresses: true } });
      if (!customer || (!customer.active && input.customerId !== stored?.customerId)) throw errors.referenceInvalid([{ path: "customerId", code: "invalid_reference" }]);
      const shipping = customer.addresses.find((address) => address.id === input.shippingAddressId && address.type === "SHIPPING");
      const invoice = customer.addresses.find((address) => address.id === input.invoiceAddressId && address.type === "INVOICE");
      if (!shipping) fieldErrors.push({ path: "shippingAddressId", code: "invalid_reference" });
      if (!invoice) fieldErrors.push({ path: "invoiceAddressId", code: "invalid_reference" });
      return {
        errors: fieldErrors,
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
 * stay the user's. Saving holds nothing; approval re-checks under a row lock (Q-MR-15). Manual lines pass unchanged.
 */
function completeStockLines(errors: DocumentErrors) {
  return async (tx: Tx, input: CustomerStockInput): Promise<CustomerStockInput> => {
    if (!input.lines.some((line) => line.memoStockId)) return input;
    const lines: PreparedLine[] = await completeFromMemoStock(tx, input.lines, errors.referenceInvalid);
    return { ...input, lines };
  };
}

/** Stock lines store their item, Stock ID and pending at save, with source STOCK; manual lines keep NULLs (SA-MO-12). */
const stockLines: LineHook<CustomerStockInput> = {
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

/** The table-specific parts of a customer stock document. */
export type CustomerStockConfig = {
  /** Error code prefix, e.g. `MEMO_OUT` / `RESERVE`. */
  code: string;
  entity: string;
  table: string;
  document: NumberedDocument;
  transactionKey: DocumentTransactionKey;
  event: string;
  model: "memoOut" | "reserve";
  lineModel: string;
  chargeModel: string;
  parentKey: string;
  /** Line photos (ADR-0048, owner 2026-11-11). */
  photos: LinePhotoDocument;
};

type ApprovalDelegate = {
  updateMany(args: unknown): Promise<{ count: number }>;
  findUnique(args: unknown): Promise<unknown>;
  findUniqueOrThrow(args: unknown): Promise<{ docNo: string; lines: { memoStockId: string | null; pcs: number; weightCt: Prisma.Decimal }[] }>;
};

export class CustomerStockDocument {
  readonly errors: DocumentErrors;
  /** Approval found a Memo Stock item with less pending than a stock line takes (another document took it first). */
  readonly pendingShort: (fields: FieldError[]) => Error;
  private readonly logger: Logger;
  private readonly engine: TradeDocumentEngine<CustomerStockInput, CustomerOut, CustomerStockStatus>;

  constructor(private readonly config: CustomerStockConfig) {
    this.errors = documentErrors(config.code, config.entity, config.table);
    this.pendingShort = (fields) => partnerException(`${config.code}_PENDING_SHORT`, HttpStatus.CONFLICT, fields);
    this.logger = new Logger(config.event);
    this.engine = new TradeDocumentEngine<CustomerStockInput, CustomerOut, CustomerStockStatus>({
      document: config.document,
      transactionKey: config.transactionKey,
      event: config.event,
      model: config.model,
      lineModel: config.lineModel,
      chargeModel: config.chargeModel,
      parentKey: config.parentKey,
      errors: this.errors,
      party: customerParty<CustomerStockInput>(this.errors),
      createStatus: PENDING,
      editableStatuses: [PENDING],
      prepare: completeStockLines(this.errors),
      lineHook: withLinePhotos(config.photos, stockLines),
      detailExtra: (row) => ({
        approvedAt: row.approvedAt ? (row.approvedAt as Date).toISOString() : null,
        approvedBy: (row.approvedBy as string | null) ?? null,
      }),
    });
  }

  list(input: MemoReceiveListInput) {
    return this.engine.list(input);
  }
  get(id: string) {
    return this.engine.get(id) as Promise<unknown> as Promise<CustomerStockDetail>;
  }
  nextNumber(docDate: string) {
    return this.engine.nextNumber(docDate);
  }
  create(actorId: string, input: CustomerStockInput) {
    return this.engine.create(actorId, input);
  }
  update(actorId: string, id: string, expectedVersion: number, input: CustomerStockInput) {
    return this.engine.update(actorId, id, expectedVersion, input);
  }
  delete(actorId: string, id: string, expectedVersion: number) {
    return this.engine.delete(actorId, id, expectedVersion);
  }
  /** transaction-soft-delete D6: a deleted document back to its unchanged status. */
  restore(actorId: string, id: string, expectedVersion: number) {
    return this.engine.restore(actorId, id, expectedVersion);
  }

  /**
   * PENDING_APPROVAL → APPROVED, and each stock line's pcs / weight move from its Memo Stock item's pending into Reserve
   * (SA-MO-14 / SA-RS-07, Q-MOV-04), in one transaction. The guarded UPDATE serializes approvals of this document; the
   * shared `takeFromMemoStock` locks the items (the same lock for Memo Out, Reserve and Memo Return) and refuses a short
   * one with `<CODE>_PENDING_SHORT` (409), changing nothing. Manual lines change no stock.
   */
  async approve(actorId: string, id: string, expectedVersion: number) {
    const { errors } = this;
    try {
      const approved = await prisma.$transaction(async (tx) => {
        const doc = (tx as unknown as Record<string, ApprovalDelegate>)[this.config.model];
        const now = new Date();
        const updated = await doc.updateMany({
          where: { id, version: expectedVersion, status: PENDING, deletedAt: null },
          data: { status: APPROVED, approvedAt: now, approvedBy: actorId, version: { increment: 1 }, updatedAt: now, updatedBy: actorId },
        });
        if (updated.count === 0) {
          // D8: NOT_FOUND → DELETED → STATUS_INVALID → CHANGED.
          explainMiss(errors, (await doc.findUnique({ where: { id }, select: MISS_SELECT })) as MissRow, [PENDING]);
        }
        const document = await doc.findUniqueOrThrow({
          where: { id },
          select: { docNo: true, lines: { orderBy: { position: "asc" }, select: { memoStockId: true, pcs: true, weightCt: true } } },
        });
        const takes = document.lines.flatMap((line, index) => (line.memoStockId ? [{ memoStockId: line.memoStockId, pcs: line.pcs, weightCt: line.weightCt, index }] : []));
        await takeFromMemoStock(tx, takes, "reserved", this.pendingShort, now);
        return { docNo: document.docNo, stockLineCount: takes.length };
      }, WRITE_TX);
      this.logger.log({ event: `${this.config.event}.approved`, actorId, id, docNo: approved.docNo, stockLineCount: approved.stockLineCount });
      return { id, version: expectedVersion + 1, status: APPROVED as "APPROVED", stockLineCount: approved.stockLineCount };
    } catch (error) {
      throw errors.map(error, "approve");
    }
  }

  /** Same shape as `quotation.options`, so the page reuses the quotation header fields and item editor. */
  async options(includeCustomerId?: string) {
    try {
      return await customerDocumentOptions(this.config.transactionKey, includeCustomerId);
    } catch (error) {
      throw this.errors.map(error, "options");
    }
  }
}

/** `quotation.options` shape for a customer document with Document Setup key `transactionKey` (memo out, reserve, memo out return). */
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

type EngineDetail = Awaited<ReturnType<TradeDocumentEngine<CustomerStockInput, CustomerOut, CustomerStockStatus>["get"]>>;
type CustomerStockLineOut = Omit<EngineDetail["lines"][number], "source"> & {
  source: "MANUAL" | "STOCK";
  memoStockId: string | null;
  stockId: string | null;
  stockPendingPcs: number | null;
  stockPendingWeightCt: string | null;
};
/** api-contract `MemoOut` rev 2 / `Reserve` rev 1 (the line hook and `detailExtra` shape the engine output at run time). */
export type CustomerStockDetail = Omit<EngineDetail, "lines"> & { lines: CustomerStockLineOut[]; approvedAt: string | null; approvedBy: string | null };
