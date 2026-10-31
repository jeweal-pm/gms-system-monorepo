import { HttpStatus, Injectable, Logger } from "@nestjs/common";
import { partnerException, validationException, type FieldError } from "../common/errors";
import { escapeLike, WRITE_TX, type Tx } from "../common/persistence";
import { currencyOptions } from "../currency/currency-directory";
import { prisma } from "../database/prisma-client";
import { fromDbDate, toDbDate } from "../document-setup/document-setup.service";
import { Prisma } from "../generated/prisma/client";
import { CHARGE_TYPES } from "../quotation/quotation.schemas";
import { formatAddress, stoneLineOptions } from "../quotation/quotation.service";
import { documentErrors, type DocumentErrors } from "./document-errors";
import { TradeDocumentEngine, type LineHook, type PartyAdapter, type TradeDocumentInput } from "./document-engine";
import { customerDocumentOptions, customerParty, type CustomerOut } from "./memo-out.service";
import type { MemoOutOutstandingInput, MemoOutReturnInput, MemoReceiveListInput, MemoReceiveStatus } from "./memo-schemas";
import { releaseToMemoStock, type MemoStockTake } from "./memo-stock.service";

const Decimal = Prisma.Decimal;
type Dec = Prisma.Decimal;

export const memoOutReturnErrors = documentErrors("MEMO_OUT_RETURN", "MemoOutReturn", "memo_out_return");
const VENDOR_OPTIONS_LIMIT = 1_000;

/** Vendor + one of its addresses (memo receive, memo return; memo out return used it until SA-MOR-11). */
export type VendorOut = { vendorId: string; vendor: { code: string; name: string }; addressId: string | null; addressText: string };
type VendorInput = TradeDocumentInput & { vendorId: string; addressId: string };

/** Vendor party adapter, shared by memo receive and memo return (SA-MR-02); errors use the document's codes. */
export function vendorParty<Input extends VendorInput>(documentErrors: DocumentErrors): PartyAdapter<Input, VendorOut> {
  return {
    storedSelect: { vendorId: true },
    nameColumn: "vendorNameSnapshot",
    listNameKey: "vendorName",
    partyColumn: "vendorId",
    async check(tx, input, stored) {
      const errors: FieldError[] = [];
      const vendor = await tx.vendor.findUnique({ where: { id: input.vendorId }, select: { code: true, name: true, active: true, addresses: true } });
      if (!vendor || (!vendor.active && input.vendorId !== stored?.vendorId)) throw documentErrors.referenceInvalid([{ path: "vendorId", code: "invalid_reference" }]);
      const address = vendor.addresses.find((entry) => entry.id === input.addressId);
      if (!address) errors.push({ path: "addressId", code: "invalid_reference" });
      return {
        errors,
        columns: {
          vendorId: input.vendorId,
          vendorCodeSnapshot: vendor.code,
          vendorNameSnapshot: vendor.name,
          addressId: input.addressId,
          addressSnapshot: address ? formatAddress(address) : "",
        },
      };
    },
    output(row) {
      return {
        vendorId: row.vendorId as string,
        vendor: { code: row.vendorCodeSnapshot as string, name: row.vendorNameSnapshot as string },
        addressId: row.addressId as string | null,
        addressText: row.addressSnapshot as string,
      };
    },
  };
}

/** Status flow of memo out return (SA-MOR-12): the memo receive / memo out one. */
type MemoOutReturnStatus = MemoReceiveStatus;
const PENDING: MemoOutReturnStatus = "PENDING_APPROVAL";
const APPROVED: MemoOutReturnStatus = "APPROVED";

/** Approval found a Memo Out line with less outstanding than the return line (another return took it first). */
export const memoOutReturnOutstandingShort = (fields: FieldError[]) => partnerException("MEMO_OUT_RETURN_OUTSTANDING_SHORT", HttpStatus.CONFLICT, fields);

/** Net unit price of a Memo Out line after its line discount (amount ÷ priced basis), 2 dp half-up (SA-MOR-15). */
function netUnitPrice(line: { priceUnit: string; pcs: number; weightCt: Dec; unitPrice: Dec; amount: Dec }): Dec {
  const basis = line.priceUnit === "PER_CT" ? line.weightCt : new Decimal(line.pcs);
  return (basis.isZero() ? line.unitPrice : line.amount.dividedBy(basis)).toDecimalPlaces(2, Decimal.ROUND_HALF_UP);
}

/**
 * Completes return lines from their Memo Out lines inside the save transaction (engine `prepare`, SA-MOR-16). Each must
 * be a From Stock line of an APPROVED memo out of this customer and currency (else REFERENCE_INVALID on
 * `lines.N.memoOutLineId`). Item fields, Stock ID / lot, price unit and the net price are copied, and Outstanding = out −
 * returned now; a Return above it → `exceeds_outstanding`. Saving reserves nothing: approval re-checks under a lock.
 */
async function completeReturnLines(tx: Tx, input: MemoOutReturnInput): Promise<MemoOutReturnInput> {
  const rows = await tx.memoOutLine.findMany({
    where: { id: { in: input.lines.map((line) => line.memoOutLineId) } },
    include: { document: { select: { status: true, customerId: true, currencyCode: true } } },
  });
  const byId = new Map(rows.map((row) => [row.id, row]));
  const references: FieldError[] = [];
  const quantities: FieldError[] = [];
  const lines = input.lines.map((line, index) => {
    const row = byId.get(line.memoOutLineId);
    if (!row || !row.memoStockId || row.document.status !== APPROVED || row.document.customerId !== input.customerId || row.document.currencyCode !== input.currency) {
      references.push({ path: `lines.${index}.memoOutLineId`, code: "invalid_reference" });
      return line;
    }
    const outstandingPcs = row.pcs - row.returnedPcs;
    const outstandingWeight = row.weightCt.minus(row.returnedWeightCt);
    if (line.pcs > outstandingPcs) quantities.push({ path: `lines.${index}.pcs`, code: "exceeds_outstanding" });
    if (new Decimal(line.weightCt).gt(outstandingWeight)) quantities.push({ path: `lines.${index}.weightCt`, code: "exceeds_outstanding" });
    return {
      ...line,
      source: "MANUAL" as const,
      stoneCodeId: null,
      stoneCode: "",
      stone: row.stone,
      shape: row.shape,
      size: row.size,
      color: row.color,
      clarity: row.clarity,
      cutting: row.cutting,
      quality: row.quality,
      lot: row.lot,
      location: row.location,
      cerType: row.cerType,
      cerNo: row.cerNo,
      priceUnit: row.priceUnit as "PER_CT" | "PER_PCS",
      unitPrice: netUnitPrice(row).toFixed(2),
      discount: { type: "NONE" as const, value: "0" },
      outstandingPcs,
      outstandingWeightCt: outstandingWeight.toFixed(3),
    };
  });
  if (references.length > 0) throw memoOutReturnErrors.referenceInvalid(references);
  if (quantities.length > 0) throw validationException(quantities);
  return { ...input, lines };
}

type MemoOutLineRef = { memoStockId: string | null; stockId: string | null; document: { id: string; docNo: string } };

/** Lines store their Memo Out line (source STOCK); the output names it, its Memo Out and the Memo Stock item. */
const memoOutLines: LineHook<MemoOutReturnInput> = {
  storedSelect: { id: true },
  assign: async (_tx, input) => input.lines.map((line) => ({ source: "STOCK", memoOutLineId: line.memoOutLineId })),
  lineInclude: { memoOutLine: { select: { memoStockId: true, stockId: true, document: { select: { id: true, docNo: true } } } } },
  output: (line, base) => {
    const { stoneCodeId: _stoneCodeId, ...rest } = base;
    const ref = line.memoOutLine as MemoOutLineRef | undefined;
    return {
      ...rest,
      source: "STOCK",
      memoOutLineId: line.memoOutLineId as string,
      memoOut: ref ? { id: ref.document.id, docNo: ref.document.docNo } : null,
      memoStockId: ref?.memoStockId ?? null,
      stockId: ref?.stockId ?? null,
    };
  },
  result: () => ({}),
};

/** Opaque keyset cursor of the Memo Outstanding dialog: base64url of `memoOutDocDate|memoOutLineId`. */
function encodeOutstandingCursor(docDate: string, lineId: string): string {
  return Buffer.from(`${docDate}|${lineId}`, "utf8").toString("base64url");
}

function decodeOutstandingCursor(value: string): { docDate: string; lineId: string } {
  const invalid = () => validationException([{ path: "cursor", code: "invalid" }]);
  if (!/^[A-Za-z0-9_-]{1,100}$/.test(value)) throw invalid();
  const match = /^(\d{4}-\d{2}-\d{2})\|([0-9a-f-]{36})$/.exec(Buffer.from(value, "base64url").toString("utf8"));
  if (!match || Number.isNaN(Date.parse(match[1]))) throw invalid();
  return { docDate: match[1], lineId: match[2] };
}

type OutstandingRow = {
  id: string;
  memo_out_id: string;
  doc_no: string;
  doc_date: Date;
  due_date: Date;
  currency_code: string;
  memo_stock_id: string;
  stock_id: string;
  lot: string;
  location: string;
  stone: string;
  shape: string;
  size: string;
  color: string;
  clarity: string;
  cutting: string;
  quality: string;
  cer_type: string;
  cer_no: string;
  item_note: string;
  pcs: number;
  weight_ct: Dec | string;
  returned_pcs: number;
  returned_weight_ct: Dec | string;
  price_unit: string;
  unit_price: Dec | string;
  amount: Dec | string;
};

const dec = (value: Dec | string) => new Decimal(value.toString());

export function toOutstandingItem(row: OutstandingRow) {
  const weight = dec(row.weight_ct);
  const outstandingPcs = Number(row.pcs) - Number(row.returned_pcs);
  const outstandingWeight = weight.minus(dec(row.returned_weight_ct));
  const price = netUnitPrice({ priceUnit: row.price_unit, pcs: Number(row.pcs), weightCt: weight, unitPrice: dec(row.unit_price), amount: dec(row.amount) });
  const basis = row.price_unit === "PER_CT" ? outstandingWeight : new Decimal(outstandingPcs);
  return {
    memoOutLineId: row.id,
    memoOut: { id: row.memo_out_id, docNo: row.doc_no, docDate: fromDbDate(row.doc_date), dueDate: fromDbDate(row.due_date) },
    memoStockId: row.memo_stock_id,
    stockId: row.stock_id,
    lot: row.lot,
    location: row.location,
    stone: row.stone,
    shape: row.shape,
    size: row.size,
    color: row.color,
    clarity: row.clarity,
    cutting: row.cutting,
    quality: row.quality,
    cerType: row.cer_type,
    cerNo: row.cer_no,
    itemNote: row.item_note,
    outPcs: Number(row.pcs),
    outWeightCt: weight.toFixed(3),
    returnedPcs: Number(row.returned_pcs),
    returnedWeightCt: dec(row.returned_weight_ct).toFixed(3),
    outstandingPcs,
    outstandingWeightCt: outstandingWeight.toFixed(3),
    priceUnit: row.price_unit as "PER_CT" | "PER_PCS",
    unitPrice: price.toFixed(2),
    amount: price.times(basis).toDecimalPlaces(2, Decimal.ROUND_HALF_UP).toFixed(2),
    currency: row.currency_code,
  };
}

/**
 * memo-out-return SA rev 2 / ADR-0033 rev 3 (owner 2026-10-31, "อนุมัติ memo-out-return revision 4"): the customer
 * brings back what a Memo Out lent. Document Setup key `memo-out-return`; PENDING_APPROVAL → APPROVED. Lines come only
 * from the customer's approved Memo Out From Stock lines (Memo Outstanding); approval adds to those lines' returned and
 * moves the Memo Stock items from Reserve back to pending.
 */
@Injectable()
export class MemoOutReturnService {
  private readonly logger = new Logger("memo_out_return");

  private readonly engine = new TradeDocumentEngine<MemoOutReturnInput, CustomerOut, MemoOutReturnStatus>({
    document: "memoOutReturn",
    transactionKey: "memo-out-return",
    event: "memo_out_return",
    model: "memoOutReturn",
    lineModel: "memoOutReturnLine",
    chargeModel: "memoOutReturnCharge",
    parentKey: "memoOutReturnId",
    errors: memoOutReturnErrors,
    party: customerParty<MemoOutReturnInput>(memoOutReturnErrors),
    createStatus: PENDING,
    editableStatuses: [PENDING],
    outstanding: true,
    prepare: completeReturnLines,
    lineHook: memoOutLines,
    detailExtra: (row) => ({
      approvedAt: row.approvedAt ? (row.approvedAt as Date).toISOString() : null,
      approvedBy: (row.approvedBy as string | null) ?? null,
    }),
  });

  list(input: MemoReceiveListInput) {
    return this.engine.list(input);
  }
  get(id: string) {
    return this.engine.get(id) as Promise<unknown> as Promise<MemoOutReturnDetail>;
  }
  nextNumber(docDate: string) {
    return this.engine.nextNumber(docDate);
  }
  create(actorId: string, input: MemoOutReturnInput) {
    return this.engine.create(actorId, input);
  }
  update(actorId: string, id: string, expectedVersion: number, input: MemoOutReturnInput) {
    return this.engine.update(actorId, id, expectedVersion, input);
  }
  delete(actorId: string, id: string, expectedVersion: number) {
    return this.engine.delete(actorId, id, expectedVersion);
  }

  /** The `memoOut.options` shape (customers with Shipping / Invoice addresses), Document Setup key `memo-out-return`. */
  async options(includeCustomerId?: string) {
    try {
      return await customerDocumentOptions("memo-out-return", includeCustomerId);
    } catch (error) {
      throw memoOutReturnErrors.map(error, "options");
    }
  }

  /**
   * Memo Outstanding dialog (SA-MOR-15): the customer's approved Memo Out From Stock lines in this currency with
   * something not yet returned, newest Memo Out first. One query (LIMIT limit + 1) on `memo_out_line_open_idx` and
   * `memo_out_customer_idx`; no count.
   */
  async outstanding(input: MemoOutOutstandingInput) {
    const filters: Prisma.Sql[] = [
      Prisma.sql`o.status = 'APPROVED'`,
      Prisma.sql`o.customer_id = ${input.customerId}::uuid`,
      Prisma.sql`o.currency_code = ${input.currency}::char(3)`,
      Prisma.sql`l.memo_stock_id IS NOT NULL AND (l.returned_pcs < l.pcs OR l.returned_weight_ct < l.weight_ct)`,
    ];
    if (input.q) {
      const pattern = `%${escapeLike(input.q)}%`;
      filters.push(Prisma.sql`(o.doc_no ILIKE ${pattern} OR l.stock_id ILIKE ${pattern} OR l.lot ILIKE ${pattern} OR l.stone ILIKE ${pattern} OR l.cer_no ILIKE ${pattern})`);
    }
    if (input.from) filters.push(Prisma.sql`o.doc_date >= ${toDbDate(input.from)}::date`);
    if (input.to) filters.push(Prisma.sql`o.doc_date <= ${toDbDate(input.to)}::date`);
    if (input.excludeReturnId) {
      filters.push(Prisma.sql`NOT EXISTS (SELECT 1 FROM "partner"."memo_out_return_line" x WHERE x.memo_out_return_id = ${input.excludeReturnId}::uuid AND x.memo_out_line_id = l.id)`);
    }
    if (input.cursor) {
      const after = decodeOutstandingCursor(input.cursor);
      filters.push(Prisma.sql`(o.doc_date, l.id) < (${toDbDate(after.docDate)}::date, ${after.lineId}::uuid)`);
    }
    try {
      const rows = await prisma.$queryRaw<OutstandingRow[]>(Prisma.sql`
        SELECT l.id::text AS id, o.id::text AS memo_out_id, o.doc_no, o.doc_date, o.due_date, o.currency_code,
          l.memo_stock_id::text AS memo_stock_id, l.stock_id, l.lot, l.location, l.stone, l.shape, l.size, l.color, l.clarity,
          l.cutting, l.quality, l.cer_type, l.cer_no, l.item_note, l.pcs, l.weight_ct, l.returned_pcs, l.returned_weight_ct,
          l.price_unit, l.unit_price, l.amount
        FROM "partner"."memo_out_line" l
        JOIN "partner"."memo_out" o ON o.id = l.memo_out_id
        WHERE ${Prisma.join(filters, " AND ")}
        ORDER BY o.doc_date DESC, l.id DESC
        LIMIT ${input.limit + 1}`);
      const page = rows.slice(0, input.limit);
      const last = page.at(-1);
      return {
        items: page.map(toOutstandingItem),
        nextCursor: rows.length > input.limit && last ? encodeOutstandingCursor(fromDbDate(last.doc_date), last.id) : null,
      };
    } catch (error) {
      throw memoOutReturnErrors.map(error, "outstanding");
    }
  }

  /**
   * PENDING_APPROVAL → APPROVED in one transaction (SA-MOR-17): the guarded UPDATE serializes approvals of this document;
   * the Memo Out lines are locked in id order and re-checked (`MEMO_OUT_RETURN_OUTSTANDING_SHORT`, 409, nothing changes);
   * their `returned_*` grow by the Return; then each Memo Stock item moves the quantity from Reserve back to pending.
   */
  async approve(actorId: string, id: string, expectedVersion: number) {
    const errors = memoOutReturnErrors;
    try {
      const approved = await prisma.$transaction(async (tx) => {
        const now = new Date();
        const updated = await tx.memoOutReturn.updateMany({
          where: { id, version: expectedVersion, status: PENDING },
          data: { status: APPROVED, approvedAt: now, approvedBy: actorId, version: { increment: 1 }, updatedAt: now, updatedBy: actorId },
        });
        if (updated.count === 0) {
          const row = await tx.memoOutReturn.findUnique({ where: { id }, select: { status: true } });
          if (!row) throw errors.notFound();
          if (row.status !== PENDING) throw errors.statusInvalid();
          throw errors.changed();
        }
        const document = await tx.memoOutReturn.findUniqueOrThrow({
          where: { id },
          select: { docNo: true, lines: { orderBy: { position: "asc" }, select: { memoOutLineId: true, pcs: true, weightCt: true } } },
        });
        const ids = document.lines.map((line) => line.memoOutLineId);
        const locked = await tx.$queryRaw<OutLineLock[]>(Prisma.sql`
          SELECT id::text AS id, pcs, weight_ct, returned_pcs, returned_weight_ct, memo_stock_id::text AS memo_stock_id
          FROM "partner"."memo_out_line" WHERE id = ANY(${ids}::uuid[]) ORDER BY id FOR UPDATE`);
        const outLines = new Map(locked.map((row) => [row.id, row]));
        const short: FieldError[] = [];
        const puts: MemoStockTake[] = [];
        document.lines.forEach((line, index) => {
          const out = outLines.get(line.memoOutLineId);
          if (!out || line.pcs > Number(out.pcs) - Number(out.returned_pcs)) short.push({ path: `lines.${index}.pcs`, code: "exceeds_outstanding" });
          if (!out || line.weightCt.gt(dec(out.weight_ct).minus(dec(out.returned_weight_ct)))) short.push({ path: `lines.${index}.weightCt`, code: "exceeds_outstanding" });
          if (out?.memo_stock_id) puts.push({ memoStockId: out.memo_stock_id, pcs: line.pcs, weightCt: line.weightCt, index });
        });
        if (short.length > 0) throw memoOutReturnOutstandingShort(short);
        if (document.lines.length > 0) {
          const values = document.lines.map((line) => Prisma.sql`(${line.memoOutLineId}::uuid, ${line.pcs}::int, ${line.weightCt.toFixed(3)}::numeric)`);
          await tx.$executeRaw(Prisma.sql`
            UPDATE "partner"."memo_out_line" AS l
            SET returned_pcs = l.returned_pcs + r.pcs, returned_weight_ct = l.returned_weight_ct + r.weight
            FROM (VALUES ${Prisma.join(values)}) AS r(id, pcs, weight)
            WHERE l.id = r.id`);
        }
        await releaseToMemoStock(tx, puts, memoOutReturnOutstandingShort, now);
        return { docNo: document.docNo, lineCount: document.lines.length };
      }, WRITE_TX);
      this.logger.log({ event: "memo_out_return.approved", actorId, id, docNo: approved.docNo, lineCount: approved.lineCount });
      return { id, version: expectedVersion + 1, status: APPROVED as "APPROVED" };
    } catch (error) {
      throw errors.map(error, "approve");
    }
  }
}

type OutLineLock = { id: string; pcs: number; weight_ct: Dec | string; returned_pcs: number; returned_weight_ct: Dec | string; memo_stock_id: string | null };

type EngineDetail = Awaited<ReturnType<TradeDocumentEngine<MemoOutReturnInput, CustomerOut, MemoOutReturnStatus>["get"]>>;
type MemoOutReturnLineOut = Omit<EngineDetail["lines"][number], "stoneCodeId" | "source"> & {
  source: "STOCK";
  memoOutLineId: string;
  memoOut: { id: string; docNo: string } | null;
  memoStockId: string | null;
  stockId: string | null;
};
/** api-contract `MemoOutReturn` rev 2 (the line hook and `detailExtra` shape the engine output at run time). */
export type MemoOutReturnDetail = Omit<EngineDetail, "lines"> & { lines: MemoOutReturnLineOut[]; approvedAt: string | null; approvedBy: string | null };

/** Active vendors with their addresses (plus a stored inactive one), currencies and the stone lists. */
export async function vendorDocumentOptions(includeVendorId?: string) {
  const [stone, vendors, company, currencies] = await Promise.all([
    stoneLineOptions(),
    prisma.vendor.findMany({
      where: includeVendorId ? { OR: [{ active: true }, { id: includeVendorId }] } : { active: true },
      orderBy: [{ nameKey: "asc" }, { id: "asc" }],
      take: VENDOR_OPTIONS_LIMIT,
      select: { id: true, code: true, name: true, active: true, currencyCode: true, addresses: { orderBy: { position: "asc" } } },
    }),
    prisma.companyProfile.findUnique({ where: { id: 1 }, select: { currencyCode: true } }),
    currencyOptions(prisma),
  ]);
  return {
    vendors: vendors.map((vendor) => ({
      id: vendor.id,
      code: vendor.code,
      name: vendor.name,
      active: vendor.active,
      currency: vendor.currencyCode,
      addresses: vendor.addresses.map((address) => ({ id: address.id, label: formatAddress(address).split("\n").slice(0, 2).join(" · "), isDefault: address.isDefault })),
    })),
    currencies: currencies.filter((item) => item.active).map((item) => item.code),
    companyCurrency: company?.currencyCode ?? null,
    chargeTypes: [...CHARGE_TYPES],
    stone,
  };
}
