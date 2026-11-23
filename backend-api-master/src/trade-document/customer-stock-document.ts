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
import { applyMemoStockLines, memoStockLinesOf, reverseMemoStockLines } from "./lot-apply";
import { completeFromMemoStock, refuseNewItemReferences } from "./stock-lines";
import { withLinePhotos, type LinePhotoDocument } from "./line-photos";
import { uuidV7 } from "@gms/storage";
import { peekApprovalSetting } from "../approval-setting/approval-setting.service";
import { completeOwnStockLines, storedOwnLines, STORED_OWN_LINE_SELECT } from "./own-stock-lines";
import { DOC_SPECS, holdSaga, lineIndexOf, registerHoldErrors, SagaRequired, sumLines, type HoldSet } from "./inventory-hold-saga";
import { completeOwnLotLines, currentOwnLotPlan, mergeHolds, planCovers, planHolds, planLineIndex, planOwnLots, withOwnLotPlan, type OwnLotPlan } from "./own-lot-lines";
import { ALLOC_TABLES, pendingShortError, writeAllocations, type AllocationRow, type ShortLine } from "./lot-apply";
import { inventoryUnavailable } from "./own-stock-lines";

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
type PreparedLine = CustomerStockInput["lines"][number] & { stockId?: string | null; stockPendingPcs?: number; stockPendingWeightCt?: string; stockCount?: number | null };

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
function completeStockLines(errors: DocumentErrors, table: "reserve" | "memoOut") {
  return async (tx: Tx, input: CustomerStockInput, documentId: string | null): Promise<CustomerStockInput> => {
    await refuseNewItemReferences(tx, table, documentId, input.lines);
    if (!input.lines.some((line) => line.memoStockId || line.lotKey?.startsWith("M"))) return input;
    const lines: PreparedLine[] = await completeFromMemoStock(tx, input.lines, errors.referenceInvalid);
    return { ...input, lines };
  };
}

/**
 * Stock lines store their item, Stock ID and pending at save, with source STOCK; manual lines keep NULLs (SA-MO-12).
 * A lot line (ADR-0055 D4) stores its lot key, the group's available and stock count, and no Stock ID.
 */
const stockLines: LineHook<CustomerStockInput> = {
  storedSelect: { id: true },
  lineInclude: { _count: { select: { allocs: true } } },
  assign: async (_tx, input) =>
    (input.lines as PreparedLine[]).map((line) =>
      line.lotKey
        ? { source: line.lotKey.startsWith("M") ? "STOCK" : "OWN_STOCK", lotKey: line.lotKey, stockCount: line.stockCount, stockId: null, stockPendingPcs: line.stockPendingPcs, stockPendingWeightCt: line.stockPendingWeightCt }
        : line.memoStockId
        ? { source: "STOCK", memoStockId: line.memoStockId, stockId: line.stockId, stockPendingPcs: line.stockPendingPcs, stockPendingWeightCt: line.stockPendingWeightCt }
        : line.ownStockId
          // ADR-0052 D20: our stock, completed before the transaction (own-stock-lines.ts); held through the saga.
          ? { source: "OWN_STOCK", ownStockId: line.ownStockId, stockId: line.stockId, stockPendingPcs: line.stockPendingPcs, stockPendingWeightCt: line.stockPendingWeightCt }
          : {},
    ),
  output: (line, base) => ({
    ...base,
    source: line.source as "MANUAL" | "STOCK" | "OWN_STOCK",
    // Owner Q-LOT-10 (ADR-0055 D9): the Stock ID is not returned to the browser (compatibility step: null, then removed).
    stockId: null,
    lotKey: (line.lotKey as string | null) ?? null,
    allocated: ((line._count as { allocs?: number } | undefined)?.allocs ?? 0) > 0,
    memoStockId: (line.memoStockId as string | null) ?? null,
    ownStockId: (line.ownStockId as string | null) ?? null,
    stockPendingPcs: (line.stockPendingPcs as number | null) ?? null,
    stockPendingWeightCt: line.stockPendingWeightCt === null || line.stockPendingWeightCt === undefined ? null : (line.stockPendingWeightCt as Prisma.Decimal).toFixed(3),
    // sale ADR-0054 D4 / SQ-SL-04: Reserve lines carry the quantity applied Sales consumed (display only; Memo Out has none).
    ...(line.soldPcs === undefined ? {} : { soldPcs: line.soldPcs as number, soldWeightCt: (line.soldWeightCt as Prisma.Decimal).toFixed(3) }),
  }),
  result: () => ({}),
};

const hasOwn = (input: CustomerStockInput) => (input.lines ?? []).some((line) => line.ownStockId || line.lotKey?.startsWith("O"));

type OwnLineRow = { id: string; own_stock_id: string | null; lot_key: string | null; stock_id: string | null; pcs: number; weight_ct: string; position: number };

/**
 * ADR-0055 D7 (BE-LOT-005): own-stock allocation rows of an applied document, inside tx1: a legacy own line → one row; an
 * own-lot line → the plan the saga's hold PUT was built from (`currentOwnLotPlan`). A lot line without a plan (a path
 * that bypassed the saga) → 503 INVENTORY_UNAVAILABLE, nothing applied.
 */
async function writeOwnAllocations(tx: Tx, table: "reserve" | "memoOut", parent: "reserve_id" | "memo_out_id", documentId: string, shortCode: string) {
  const lines = await tx.$queryRaw<OwnLineRow[]>(Prisma.sql`
    SELECT id::text AS id, own_stock_id::text AS own_stock_id, lot_key, stock_id, pcs, weight_ct::text AS weight_ct, position
    FROM ${ALLOC_TABLES[table].line} WHERE ${Prisma.raw(`"${parent}"`)} = ${documentId}::uuid AND (own_stock_id IS NOT NULL OR lot_key LIKE 'O%') ORDER BY position`);
  if (lines.length === 0) return;
  const plan = currentOwnLotPlan();
  const rows: AllocationRow[] = [];
  for (const line of lines) {
    if (line.own_stock_id) {
      if (line.stock_id) rows.push({ lineId: line.id, seq: 1, memoStockId: null, ownStockId: line.own_stock_id, stockId: line.stock_id, pcs: line.pcs, weight: new Prisma.Decimal(line.weight_ct) });
      continue;
    }
    // An empty / missing plan = the fast path (the input named no own stock, so the saga has not run): re-run through the
    // saga, which pre-reads the lot and holds it. Under the saga every stored lot line is planned, so a gap there fails closed.
    const planned = plan?.get(line.lot_key!);
    if (!planned) throw !plan || plan.size === 0 ? new SagaRequired() : inventoryUnavailable();
    // INV-20261121-002 F1: a plan that does not cover the line in full (never an empty one) refuses the whole apply.
    if (!planCovers(planned, { pcs: line.pcs, weightCt: line.weight_ct })) {
      throw pendingShortError(shortCode, [{ index: line.position - 1, lotKey: line.lot_key, availablePcs: planned.reduce((sum, row) => sum + row.pcs, 0), availableWeightCt: planned.reduce((sum, row) => sum.plus(row.weight), new Prisma.Decimal(0)).toFixed(3) }]);
    }
    planned.forEach((row, index) => rows.push({ lineId: line.id, seq: index + 1, memoStockId: null, ownStockId: row.stockUuid, stockId: row.stockId, pcs: row.pcs, weight: row.weight }));
  }
  await writeAllocations(tx, table, lines.map((line) => line.id), rows);
}

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
      prepare: completeStockLines(this.errors, config.holdType === "reserve" ? "reserve" : "memoOut"),
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
    // lot-based-stock (ADR-0055 D5): lot lines are allocated FIFO to Stock IDs under one id-ordered lock and the
    // allocation is stored in <doc>_line_alloc; legacy item lines take their item (and get one allocation row).
    const table = this.config.holdType === "reserve" ? "reserve" : "memoOut";
    const parent = this.config.holdType === "reserve" ? "reserve_id" : "memo_out_id";
    return {
      apply: async (tx, doc, _actorId, now) => {
        const lines = await memoStockLinesOf(tx, table, parent, doc.id);
        const count = await applyMemoStockLines(tx, { table, lines, bucket: "reserved", shortCode: `${this.config.code}_PENDING_SHORT`, now });
        await writeOwnAllocations(tx, table, parent, doc.id, `${this.config.code}_PENDING_SHORT`);
        return { result: { stockLineCount: count }, log: { stockLineCount: count } };
      },
      reverse: async (tx, doc, now) => {
        await reverseMemoStockLines(tx, { table, lines: await memoStockLinesOf(tx, table, parent, doc.id), bucket: "reserved", inUse: () => this.errors.inUse(null), now });
        // Own-stock allocation rows go with the applied state (the saga sets the holds from what stays applied).
        await tx.$executeRaw(Prisma.sql`DELETE FROM ${ALLOC_TABLES[table].table} a USING ${ALLOC_TABLES[table].line} l
          WHERE a.line_id = l.id AND ${Prisma.raw(`l."${parent}"`)} = ${doc.id}::uuid AND a.own_stock_id IS NOT NULL`);
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
    const { input: prepared, plan } = await this.completeOwn(input, null, new Map(), actorId);
    const id = uuidV7();
    return holdSaga.withHolds(hasOwn(input), {
      type: this.config.holdType, id, isCreate: true, actorId,
      next: async () => ((await peekApprovalSetting(prisma, this.config.approvalType)) ? new Map() : this.inputHolds(prepared, plan)),
      lineIndex: this.lineIndex(prepared, plan),
      call: () => withOwnLotPlan(plan, () => this.engine.create(actorId, prepared, viewer, { id })),
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
    const { input: prepared, plan } = await this.completeOwn(input, stored, old, actorId);
    return {
      type: this.config.holdType, id, isCreate: false, actorId, expectedVersion, old,
      next: async () => {
        if (header?.status === "APPROVED" && header.autoApproved) return this.inputHolds(prepared, plan);
        if (header?.status === "DRAFT" && !(await peekApprovalSetting(prisma, this.config.approvalType))) return this.inputHolds(prepared, plan);
        return null;
      },
      lineIndex: this.lineIndex(prepared, plan),
      call: () => withOwnLotPlan(plan, () => this.engine.update(actorId, id, expectedVersion, prepared, viewer)),
    };
  }
  delete(actorId: string, id: string, expectedVersion: number) {
    return holdSaga.withHolds(false, { type: this.config.holdType, id, isCreate: false, actorId, expectedVersion, next: () => new Map(), call: () => this.engine.delete(actorId, id, expectedVersion) });
  }
  /** transaction-soft-delete D6 / approval-setup G3: back as DRAFT (ON) or re-approved automatically (OFF). */
  restore(actorId: string, id: string, expectedVersion: number) {
    const plan: OwnLotPlan = new Map();
    return holdSaga.withHolds(false, {
      type: this.config.holdType, id, isCreate: false, actorId, expectedVersion,
      next: async () => ((await peekApprovalSetting(prisma, this.config.approvalType)) ? new Map() : this.storedHolds(id, actorId, plan)),
      call: () => withOwnLotPlan(plan, () => this.engine.restore(actorId, id, expectedVersion)),
    });
  }
  submit(actor: DocumentActor, id: string, expectedVersion: number) {
    return this.engine.submit(actor, id, expectedVersion);
  }
  /** PENDING_APPROVAL -> APPROVED with the Reserve move above and the own-stock hold; `<CODE>_PENDING_SHORT` changes nothing. */
  async approve(actorId: string, id: string, expectedVersion: number) {
    const spec = DOC_SPECS[this.config.holdType];
    const lineModel = (prisma as unknown as Record<string, { findMany(args: unknown): Promise<{ ownStockId: string | null }[]> }>)[this.config.lineModel];
    const plan: OwnLotPlan = new Map();
    void spec;
    return holdSaga.withHolds(false, {
      type: this.config.holdType, id, isCreate: false, actorId, expectedVersion,
      next: () => this.storedHolds(id, actorId, plan),
      lineIndex: async () => {
        const lines = await (lineModel as unknown as { findMany(args: unknown): Promise<{ ownStockId: string | null; lotKey: string | null }[]> })
          .findMany({ where: { [this.config.parentKey]: id }, orderBy: { position: "asc" }, select: { ownStockId: true, lotKey: true } });
        return planLineIndex(lines, plan, lineIndexOf(lines.map((line) => line.ownStockId)));
      },
      call: () => withOwnLotPlan(plan, () => this.engine.approve(actorId, id, expectedVersion) as Promise<{ id: string; version: number; status: "APPROVED"; stockLineCount: number }>),
    });
  }

  /** H_new of the input: legacy own lines by stock + the own-lot plan (ADR-0055 D7). */
  private inputHolds(input: CustomerStockInput, plan: OwnLotPlan) {
    return mergeHolds(sumLines(input.lines.map((line) => ({ stock: (line as PreparedLine).ownStockId, pcs: line.pcs, weightCt: line.weightCt }))), planHolds(plan));
  }

  private lineIndex(input: CustomerStockInput, plan: OwnLotPlan) {
    return planLineIndex(input.lines, plan, lineIndexOf(input.lines.map((line) => (line as PreparedLine).ownStockId)));
  }

  /**
   * Approve / restore prediction: the stored legacy own lines + a fresh FIFO plan for the stored own-lot lines (one
   * inventory read; available = on-hand + what this document holds now). The plan is kept for tx1's allocation rows.
   */
  private async storedHolds(id: string, actorId: string, plan: OwnLotPlan): Promise<HoldSet> {
    const spec = DOC_SPECS[this.config.holdType];
    const delegate = (prisma as unknown as Record<string, { findMany(args: unknown): Promise<{ ownStockId: string | null; lotKey: string | null; pcs: number; weightCt: Prisma.Decimal; position: number }[]> }>)[this.config.lineModel];
    const [legacy, lines, held] = await Promise.all([
      spec.lines(prisma, id, false),
      delegate.findMany({ where: { [this.config.parentKey]: id, lotKey: { startsWith: "O" } }, select: { ownStockId: true, lotKey: true, pcs: true, weightCt: true, position: true } }),
      spec.lines(prisma, id, true),
    ]);
    if (lines.length === 0) return legacy;
    const fresh = await planOwnLots(lines.map((line) => ({ ...line, weightCt: line.weightCt.toFixed(3), index: line.position - 1 })), held, (short: ShortLine[]) => pendingShortError(`${this.config.code}_PENDING_SHORT`, short), actorId);
    for (const [key, rows] of fresh) plan.set(key, rows);
    return mergeHolds(legacy, planHolds(plan));
  }

  private async completeOwn(input: CustomerStockInput, stored: Record<string, unknown>[] | null, held: Map<string, { pcs: number; weight: Prisma.Decimal }>, actorId: string): Promise<{ input: CustomerStockInput; plan: OwnLotPlan }> {
    if (!input.lines.some((line) => line.ownStockId || line.lotKey?.startsWith("O"))) return { input, plan: new Map() };
    const { lines } = await completeOwnStockLines(input.lines, { stored: storedOwnLines(stored ?? []), held, referenceInvalid: this.errors.referenceInvalid, actorId });
    const lots = await completeOwnLotLines(lines, { held, actorId });
    return { input: { ...input, lines: lots.lines as CustomerStockInput["lines"] }, plan: lots.plan };
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
  /** Always null (owner Q-LOT-10); removed after FE-LOT-006. */
  stockId: string | null;
  lotKey: string | null;
  allocated: boolean;
  stockPendingPcs: number | null;
  stockPendingWeightCt: string | null;
  /** Reserve only (sale ADR-0054 D4, SQ-SL-04). */
  soldPcs?: number;
  soldWeightCt?: string;
};
/** api-contract `MemoOut` rev 2 / `Reserve` rev 1 (the line hook and `detailExtra` shape the engine output at run time). */
export type CustomerStockDetail = Omit<EngineDetail, "lines"> & { lines: CustomerStockLineOut[]; approvedAt: string | null; approvedBy: string | null; syncState: "IDLE" | "SYNCING" };
