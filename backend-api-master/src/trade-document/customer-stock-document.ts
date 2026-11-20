import { HttpStatus } from "@nestjs/common";
import { partnerException, type FieldError } from "../common/errors";
import type { Tx } from "../common/persistence";
import type { FlowPrincipal } from "../approval-setting/approval-flow";
import type { ApprovalDocType } from "../approval-setting/approval-types";
import { currencyOptions } from "../currency/currency-directory";
import { prisma } from "../database/prisma-client";
import type { NumberedDocument } from "../document-setup/document-numbering";
import type { DocumentTransactionKey } from "../document-setup/document-setup.transactions";
import { Prisma } from "../generated/prisma/client";
import { CHARGE_TYPES } from "../quotation/quotation.schemas";
import { customerLineOptions, formatAddress, stoneLineOptions } from "../quotation/quotation.service";
import { documentErrors, type DocumentErrors } from "./document-errors";
import { TradeDocumentEngine, type DocumentActor, type DocumentEffects, type LineHook, type PartyAdapter, type TradeDocumentInput } from "./document-engine";
import type { MemoOutInput, MemoReceiveListInput, MemoReceiveStatus } from "./memo-schemas";
import { releaseToMemoStock, takeFromMemoStock } from "./memo-stock.service";
import { completeFromMemoStock } from "./stock-lines";
import { withLinePhotos, type LinePhotoDocument } from "./line-photos";
import { uuidV7 } from "@gms/storage";
import { peekApprovalSetting } from "../approval-setting/approval-setting.service";
import { completeOwnStockLines, storedOwnLines, STORED_OWN_LINE_SELECT } from "./own-stock-lines";
import { DOC_SPECS, holdSaga, lineIndexOf, registerHoldErrors, sumLines } from "./inventory-hold-saga";

/**
 * A customer document whose lines may come From Stock (memo-out SA rev 2 SA-MO-11…15; reserve SA rev 1 SA-RS-04…08):
 * - customer + SHIPPING / INVOICE address;
 * - Document Setup number;
 * - the engine's approval flow (DRAFT → PENDING_APPROVAL → APPROVED, or auto-approved while approval is OFF);
 * - lines that may name a Memo Stock item, which approval moves from pending into Reserve.
 * Memo Out and Reserve share it, and each has its own tables, numbering key, error codes and grants. Rows keyed in by
 * hand hold nothing.
 */
export type CustomerStockInput = MemoOutInput;
export type CustomerStockStatus = MemoReceiveStatus;

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
        : line.ownStockId
          // ADR-0052 D20: our stock, completed before the transaction (own-stock-lines.ts); held through the saga.
          ? { source: "OWN_STOCK", ownStockId: line.ownStockId, stockId: line.stockId, stockPendingPcs: line.stockPendingPcs, stockPendingWeightCt: line.stockPendingWeightCt }
          : {},
    ),
  output: (line, base) => ({
    ...base,
    source: line.source as "MANUAL" | "STOCK" | "OWN_STOCK",
    stockId: (line.stockId as string | null) ?? null,
    memoStockId: (line.memoStockId as string | null) ?? null,
    ownStockId: (line.ownStockId as string | null) ?? null,
    stockPendingPcs: (line.stockPendingPcs as number | null) ?? null,
    stockPendingWeightCt: line.stockPendingWeightCt === null || line.stockPendingWeightCt === undefined ? null : (line.stockPendingWeightCt as Prisma.Decimal).toFixed(3),
    // sale ADR-0054 D4 / SQ-SL-04: Reserve lines carry the quantity applied Sales consumed (display only; Memo Out has none).
    ...(line.soldPcs === undefined ? {} : { soldPcs: line.soldPcs as number, soldWeightCt: (line.soldWeightCt as Prisma.Decimal).toFixed(3) }),
  }),
  result: () => ({}),
};

const hasOwn = (input: CustomerStockInput) => (input.lines ?? []).some((line) => line.ownStockId);

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
  /** ADR-0052 D18: inventory hold document type. */
  holdType: "reserve" | "memo-out";
};

/** The approval documents a customer stock document can be (registry key = permission menu). */
type CustomerStockType = Extract<ApprovalDocType, "reserve" | "memo-out">;

type StockLineRow = { memoStockId: string | null; pcs: number; weightCt: Prisma.Decimal };
type LineDelegate = { findMany(args: unknown): Promise<StockLineRow[]> };

export class CustomerStockDocument {
  readonly errors: DocumentErrors;
  /** Approval found a Memo Stock item with less pending than a stock line takes (another document took it first). */
  readonly pendingShort: (fields: FieldError[]) => Error;
  private readonly engine: TradeDocumentEngine<CustomerStockInput, CustomerOut, CustomerStockStatus>;

  constructor(private readonly config: CustomerStockConfig & { approvalType: CustomerStockType; usedBy?: DocumentEffects["usedBy"] }) {
    this.errors = documentErrors(config.code, config.entity, config.table);
    this.pendingShort = (fields) => partnerException(`${config.code}_PENDING_SHORT`, HttpStatus.CONFLICT, fields);
    registerHoldErrors(config.holdType, this.errors);
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
      approvalType: config.approvalType,
      effects: this.effects(),
      prepare: completeStockLines(this.errors),
      lineHook: withLinePhotos(config.photos, stockLines),
      afterWrite: (tx, id, action) => holdSaga.inTx(config.holdType, tx, id, action),
      syncState: true,
      detailExtra: (row) => ({
        approvedAt: row.approvedAt ? (row.approvedAt as Date).toISOString() : null,
        approvedBy: (row.approvedBy as string | null) ?? null,
      }),
    });
  }

  /**
   * Effects (SA-MO-14 / SA-RS-07, Q-MOV-04; approval-setup "Effects and their reversal"): each stock line's pcs / weight
   * move from its Memo Stock item's pending into Reserve under the shared id-ordered lock (`takeFromMemoStock`, the same
   * lock for Memo Out, Reserve and Memo Return); a short item → `<CODE>_PENDING_SHORT`. The reversal gives Reserve back
   * to pending through the same lock; a short there (something took it out of Reserve) → `<CODE>_IN_USE`. Manual lines
   * change no stock.
   */
  private effects(): DocumentEffects {
    const takesOf = async (tx: Tx, id: string) => {
      const lines = await (tx as unknown as Record<string, LineDelegate>)[this.config.lineModel].findMany({
        where: { [this.config.parentKey]: id }, orderBy: { position: "asc" }, select: { memoStockId: true, pcs: true, weightCt: true },
      });
      return lines.flatMap((line, index) => (line.memoStockId ? [{ memoStockId: line.memoStockId, pcs: line.pcs, weightCt: line.weightCt, index }] : []));
    };
    return {
      apply: async (tx, doc, _actorId, now) => {
        const takes = await takesOf(tx, doc.id);
        await takeFromMemoStock(tx, takes, "reserved", this.pendingShort, now);
        return { result: { stockLineCount: takes.length }, log: { stockLineCount: takes.length } };
      },
      reverse: async (tx, doc, now) => {
        await releaseToMemoStock(tx, await takesOf(tx, doc.id), () => this.errors.inUse(null), now, "reserved");
      },
      usedBy: (client, id) => (this.config.usedBy ? this.config.usedBy(client, id) : Promise.resolve(null)),
    };
  }

  list(input: MemoReceiveListInput) {
    return this.engine.list(input);
  }
  get(id: string, viewer: FlowPrincipal | null = null) {
    return this.engine.get(id, viewer) as Promise<unknown> as Promise<CustomerStockDetail>;
  }
  nextNumber(docDate: string) {
    return this.engine.nextNumber(docDate);
  }
  /**
   * ADR-0052 D17-D19: own-stock lines are completed before the transaction (batch read unless kept) and every write that
   * can change the applied hold set runs through the hold saga (acquire -> local -> release).
   */
  async create(actorId: string, input: CustomerStockInput, viewer: FlowPrincipal | null = null) {
    const prepared = await this.completeOwn(input, null, new Map(), actorId);
    const id = uuidV7();
    return holdSaga.withHolds(hasOwn(input), {
      type: this.config.holdType, id, isCreate: true, actorId,
      next: async () => ((await peekApprovalSetting(prisma, this.config.approvalType)) ? new Map() : this.inputHolds(prepared)),
      lineIndex: lineIndexOf(prepared.lines.map((line) => (line as PreparedLine).ownStockId)),
      call: () => this.engine.create(actorId, prepared, viewer, { id }),
    });
  }
  async update(actorId: string, id: string, expectedVersion: number, input: CustomerStockInput, viewer: FlowPrincipal | null = null) {
    return holdSaga.withHolds(hasOwn(input), () => this.updateSpec(actorId, id, expectedVersion, input, viewer), () => this.engine.update(actorId, id, expectedVersion, input, viewer));
  }
  private async updateSpec(actorId: string, id: string, expectedVersion: number, input: CustomerStockInput, viewer: FlowPrincipal | null) {
    const spec = DOC_SPECS[this.config.holdType];
    const delegates = prisma as unknown as Record<string, { findMany(args: unknown): Promise<Record<string, unknown>[]>; findUnique(args: unknown): Promise<{ status: string; autoApproved: boolean } | null> }>;
    const [stored, old, header] = await Promise.all([
      delegates[this.config.lineModel].findMany({ where: { [this.config.parentKey]: id }, select: STORED_OWN_LINE_SELECT }),
      spec.lines(prisma, id, true),
      delegates[this.config.model].findUnique({ where: { id }, select: { status: true, autoApproved: true } }),
    ]);
    const prepared = await this.completeOwn(input, stored, old, actorId);
    return {
      type: this.config.holdType, id, isCreate: false, actorId, expectedVersion, old,
      next: async () => {
        if (header?.status === "APPROVED" && header.autoApproved) return this.inputHolds(prepared);
        if (header?.status === "DRAFT" && !(await peekApprovalSetting(prisma, this.config.approvalType))) return this.inputHolds(prepared);
        return null;
      },
      lineIndex: lineIndexOf(prepared.lines.map((line) => (line as PreparedLine).ownStockId)),
      call: () => this.engine.update(actorId, id, expectedVersion, prepared, viewer),
    };
  }
  delete(actorId: string, id: string, expectedVersion: number) {
    return holdSaga.withHolds(false, { type: this.config.holdType, id, isCreate: false, actorId, expectedVersion, next: () => new Map(), call: () => this.engine.delete(actorId, id, expectedVersion) });
  }
  /** transaction-soft-delete D6 / approval-setup G3: back as DRAFT (ON) or re-approved automatically (OFF). */
  restore(actorId: string, id: string, expectedVersion: number) {
    const spec = DOC_SPECS[this.config.holdType];
    return holdSaga.withHolds(false, {
      type: this.config.holdType, id, isCreate: false, actorId, expectedVersion,
      next: async () => ((await peekApprovalSetting(prisma, this.config.approvalType)) ? new Map() : spec.lines(prisma, id, false)),
      call: () => this.engine.restore(actorId, id, expectedVersion),
    });
  }
  submit(actor: DocumentActor, id: string, expectedVersion: number) {
    return this.engine.submit(actor, id, expectedVersion);
  }
  /** PENDING_APPROVAL -> APPROVED with the Reserve move above and the own-stock hold; `<CODE>_PENDING_SHORT` changes nothing. */
  async approve(actorId: string, id: string, expectedVersion: number) {
    const spec = DOC_SPECS[this.config.holdType];
    const lineModel = (prisma as unknown as Record<string, { findMany(args: unknown): Promise<{ ownStockId: string | null }[]> }>)[this.config.lineModel];
    return holdSaga.withHolds(false, {
      type: this.config.holdType, id, isCreate: false, actorId, expectedVersion,
      next: () => spec.lines(prisma, id, false),
      lineIndex: async () => lineIndexOf((await lineModel.findMany({ where: { [this.config.parentKey]: id }, orderBy: { position: "asc" }, select: { ownStockId: true } })).map((line) => line.ownStockId)),
      call: () => this.engine.approve(actorId, id, expectedVersion) as Promise<{ id: string; version: number; status: "APPROVED"; stockLineCount: number }>,
    });
  }

  private inputHolds(input: CustomerStockInput) {
    return sumLines(input.lines.map((line) => ({ stock: (line as PreparedLine).ownStockId, pcs: line.pcs, weightCt: line.weightCt })));
  }

  private async completeOwn(input: CustomerStockInput, stored: Record<string, unknown>[] | null, held: Map<string, { pcs: number; weight: Prisma.Decimal }>, actorId: string): Promise<CustomerStockInput> {
    if (!input.lines.some((line) => line.ownStockId)) return input;
    const { lines } = await completeOwnStockLines(input.lines, { stored: storedOwnLines(stored ?? []), held, referenceInvalid: this.errors.referenceInvalid, actorId });
    return { ...input, lines: lines as CustomerStockInput["lines"] };
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
  source: "MANUAL" | "STOCK" | "OWN_STOCK";
  memoStockId: string | null;
  ownStockId: string | null;
  stockId: string | null;
  stockPendingPcs: number | null;
  stockPendingWeightCt: string | null;
  /** Reserve only (sale ADR-0054 D4, SQ-SL-04). */
  soldPcs?: number;
  soldWeightCt?: string;
};
/** api-contract `MemoOut` rev 2 / `Reserve` rev 1 (the line hook and `detailExtra` shape the engine output at run time). */
export type CustomerStockDetail = Omit<EngineDetail, "lines"> & { lines: CustomerStockLineOut[]; approvedAt: string | null; approvedBy: string | null; syncState: "IDLE" | "SYNCING" };
