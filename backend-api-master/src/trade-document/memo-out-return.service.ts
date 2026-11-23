import { HttpStatus, Injectable } from "@nestjs/common";
import { partnerException, validationException, type FieldError } from "../common/errors";
import { escapeLike, type Tx } from "../common/persistence";
import type { FlowPrincipal } from "../approval-setting/approval-flow";
import { currencyOptions } from "../currency/currency-directory";
import { prisma } from "../database/prisma-client";
import { fromDbDate, toDbDate } from "../document-setup/document-setup.service";
import { Prisma } from "../generated/prisma/client";
import { CHARGE_TYPES } from "../quotation/quotation.schemas";
import { formatAddress, stoneLineOptions } from "../quotation/quotation.service";
import { documentErrors, type DocumentErrors } from "./document-errors";
import { TradeDocumentEngine, type DocumentActor, type DocumentEffects, type LineHook, type PartyAdapter, type TradeDocumentInput } from "./document-engine";
import { customerDocumentOptions, customerParty, type CustomerOut } from "./memo-out.service";
import type { MemoOutOutstandingInput, MemoOutReturnInput, MemoReceiveListInput, MemoReceiveStatus } from "./memo-schemas";
import { latestStockUser, releaseToMemoStock, takeFromMemoStock, type MemoStockTake } from "./memo-stock.service";
import { readAllocations, type StoredAlloc } from "./lot-apply";
import { settleOldestFirst, type Part } from "./lot-allocation";
import { uuidV7 as newId } from "@gms/storage";
import { lockSourceHeaders } from "./source-lock";
import { LINE_PHOTO_DOCUMENTS, withLinePhotos } from "./line-photos";
import { uuidV7 } from "@gms/storage";
import { peekApprovalSetting } from "../approval-setting/approval-setting.service";
import { DOC_SPECS, holdSaga, ownStocksOfOutLines, registerHoldErrors, returnHoldsOf } from "./inventory-hold-saga";

const Decimal = Prisma.Decimal;
type Dec = Prisma.Decimal;

export const memoOutReturnErrors = documentErrors("MEMO_OUT_RETURN", "MemoOutReturn", "memo_out_return");
registerHoldErrors("memo-out-return", memoOutReturnErrors);

/** SA-LS-P2-06: a Memo Out whose own-stock holds are being updated can't be returned meanwhile. */
function refuseSyncingSources(sources: Map<string, { syncing: boolean }>) {
  if ([...sources.values()].some((source) => source.syncing)) throw holdSaga.busy("memo-out-return");
}
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
    include: { document: { select: { status: true, customerId: true, currencyCode: true, deletedAt: true } } },
  });
  const byId = new Map(rows.map((row) => [row.id, row]));
  const references: FieldError[] = [];
  const quantities: FieldError[] = [];
  const lines = input.lines.map((line, index) => {
    const row = byId.get(line.memoOutLineId);
    if (!row || (!row.memoStockId && !row.ownStockId && !row.lotKey) || row.document.status !== APPROVED || row.document.deletedAt || row.document.customerId !== input.customerId || row.document.currencyCode !== input.currency) {
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

type MemoOutLineRef = { memoStockId: string | null; stockId: string | null; lotKey: string | null; document: { id: string; docNo: string } };

/** Lines store their Memo Out line (source STOCK); the output names it, its Memo Out and the Memo Stock item. */
const memoOutLines: LineHook<MemoOutReturnInput> = {
  storedSelect: { id: true },
  assign: async (_tx, input) => input.lines.map((line) => ({ source: "STOCK", memoOutLineId: line.memoOutLineId })),
  lineInclude: { memoOutLine: { select: { memoStockId: true, stockId: true, lotKey: true, document: { select: { id: true, docNo: true } } } } },
  output: (line, base) => {
    const { stoneCodeId: _stoneCodeId, ...rest } = base;
    const ref = line.memoOutLine as MemoOutLineRef | undefined;
    return {
      ...rest,
      source: "STOCK",
      memoOutLineId: line.memoOutLineId as string,
      memoOut: ref ? { id: ref.document.id, docNo: ref.document.docNo } : null,
      memoStockId: ref?.memoStockId ?? null,
      // Owner 2026-11-21 (Q3): Memo Out Return keeps the Stock ID (null on a lot line); lot key added.
      stockId: ref?.stockId ?? null,
      lotKey: ref?.lotKey ?? null,
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
  memo_stock_id: string | null;
  own_stock_id: string | null;
  stock_id: string | null;
  lot_key: string | null;
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
    ownStockId: row.own_stock_id,
    source: (row.own_stock_id || row.lot_key?.startsWith("O") ? "OWN_STOCK" : "MEMO_STOCK") as "OWN_STOCK" | "MEMO_STOCK",
    // Owner 2026-11-21 (Q3): the Stock ID stays on this picker ("" on a lot line); the lot key is added.
    stockId: row.stock_id ?? "",
    lotKey: row.lot_key,
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

type ReturnLine = { id: string; memoOutLineId: string; pcs: number; weightCt: Dec };

async function returnLines(tx: Tx, id: string): Promise<ReturnLine[]> {
  return tx.memoOutReturnLine.findMany({ where: { memoOutReturnId: id }, orderBy: { position: "asc" }, select: { id: true, memoOutLineId: true, pcs: true, weightCt: true } });
}

/** One settled part of a Memo Out allocation row by a return line (ADR-0055 D5). */
type Settled = { lineId: string; index: number; alloc: StoredAlloc; part: Part };

/**
 * Settles each return line against its Memo Out line's unsettled allocation, oldest seq first (Q-LOT-07). Pure; null for a
 * line whose allocation can't cover it (an out line applied without one would be a ledger break; reported as short).
 */
export function settleReturnLines(lines: readonly ReturnLine[], allocs: readonly StoredAlloc[]): { settled: Settled[]; short: number[] } {
  const byOutLine = new Map<string, StoredAlloc[]>();
  for (const row of allocs) byOutLine.set(row.lineId, [...(byOutLine.get(row.lineId) ?? []), row]);
  const settled: Settled[] = [];
  const short: number[] = [];
  lines.forEach((line, index) => {
    const rows = byOutLine.get(line.memoOutLineId) ?? [];
    const parts = settleOldestFirst(rows, { pcs: line.pcs, weight: line.weightCt });
    if (!parts) return void short.push(index);
    const byId = new Map(rows.map((row) => [row.id, row]));
    for (const part of parts) settled.push({ lineId: line.id, index, alloc: byId.get(part.id)!, part });
  });
  return { settled, short };
}

/** Adds `sign` × the settled parts to the Memo Out allocation rows' `settled_*` (one bound UPDATE). */
async function addSettled(tx: Tx, parts: readonly { allocId: string; pcs: number; weight: Dec }[], sign: 1 | -1) {
  if (parts.length === 0) return;
  const totals = new Map<string, { pcs: number; weight: Dec }>();
  for (const part of parts) {
    const total = totals.get(part.allocId) ?? { pcs: 0, weight: new Decimal(0) };
    totals.set(part.allocId, { pcs: total.pcs + part.pcs, weight: total.weight.plus(part.weight) });
  }
  const values = [...totals].map(([id, qty]) => Prisma.sql`(${id}::uuid, ${sign * qty.pcs}::int, ${(sign === 1 ? qty.weight : qty.weight.negated()).toFixed(3)}::numeric)`);
  await tx.$executeRaw(Prisma.sql`
    UPDATE "partner"."memo_out_line_alloc" AS a
    SET settled_pcs = a.settled_pcs + r.pcs, settled_weight_ct = a.settled_weight_ct + r.weight
    FROM (VALUES ${Prisma.join(values)}) AS r(id, pcs, weight)
    WHERE a.id = r.id`);
}

/**
 * Locks the Memo Out lines in id order (lock order memo_out_line → memo_stock, as in approval). `FOR NO KEY UPDATE`
 * (INV-20261031-002): only non-key columns change, so the FK `KEY SHARE` checks of concurrent return-line inserts
 * neither wait for it nor form a deadlock cycle with it; approvals of the same lines still queue.
 */
async function lockOutLines(tx: Tx, lines: ReturnLine[]) {
  const ids = lines.map((line) => line.memoOutLineId);
  const locked = await tx.$queryRaw<OutLineLock[]>(Prisma.sql`
    SELECT id::text AS id, pcs, weight_ct, returned_pcs, returned_weight_ct, memo_stock_id::text AS memo_stock_id
    FROM "partner"."memo_out_line" WHERE id = ANY(${ids}::uuid[]) ORDER BY id FOR NO KEY UPDATE`);
  return new Map(locked.map((row) => [row.id, row]));
}

/** Adds `sign` × each line's Return to its Memo Out line's `returned_*` (one bound `UPDATE … FROM (VALUES …)`). */
async function addReturned(tx: Tx, lines: ReturnLine[], sign: 1 | -1) {
  if (lines.length === 0) return;
  const values = lines.map((line) => Prisma.sql`(${line.memoOutLineId}::uuid, ${sign * line.pcs}::int, ${(sign === 1 ? line.weightCt : line.weightCt.negated()).toFixed(3)}::numeric)`);
  await tx.$executeRaw(Prisma.sql`
    UPDATE "partner"."memo_out_line" AS l
    SET returned_pcs = l.returned_pcs + r.pcs, returned_weight_ct = l.returned_weight_ct + r.weight
    FROM (VALUES ${Prisma.join(values)}) AS r(id, pcs, weight)
    WHERE l.id = r.id`);
}

class ReversalShort extends Error {}

/**
 * Effects (SA-MOR-17; approval-setup "Effects and their reversal"). Apply: the Memo Out lines are locked in id order and
 * re-checked (`MEMO_OUT_RETURN_OUTSTANDING_SHORT`, nothing changes), their `returned_*` grow by the Return, and each Memo
 * Stock item moves the quantity from Reserve back to pending. Reverse (auto-approved edit / delete): the same locks, the
 * Memo Out lines' `returned_*` shrink and the items move the quantity from pending into Reserve again; when the stock was
 * taken again (pending short) → `MEMO_OUT_RETURN_IN_USE {usedBy}` with the newest document that names the item.
 */
const memoOutReturnEffects: DocumentEffects = {
  apply: async (tx, doc, _actorId, now) => {
    const lines = await returnLines(tx, doc.id);
    // INV-20261111-002 F1: the Memo Outs stay APPROVED and live under FOR SHARE until this transaction ends.
    const sources = await lockSourceHeaders(tx, "memoOut", lines.map((line) => line.memoOutLineId));
    refuseSyncingSources(sources);
    const gone = lines.flatMap((line, index) => (sources.get(line.memoOutLineId)?.live ? [] : [{ path: `lines.${index}.memoOutLineId`, code: "invalid_reference" }]));
    if (gone.length > 0) throw memoOutReturnErrors.referenceInvalid(gone);
    const outLines = await lockOutLines(tx, lines);
    // ADR-0055 D5: lock order header → source lines → allocation rows (id order) → stock rows.
    const allocs = await readAllocations(tx, "memoOut", lines.map((line) => line.memoOutLineId), true);
    const short: FieldError[] = [];
    lines.forEach((line, index) => {
      const out = outLines.get(line.memoOutLineId);
      if (!out || line.pcs > Number(out.pcs) - Number(out.returned_pcs)) short.push({ path: `lines.${index}.pcs`, code: "exceeds_outstanding" });
      if (!out || line.weightCt.gt(dec(out.weight_ct).minus(dec(out.returned_weight_ct)))) short.push({ path: `lines.${index}.weightCt`, code: "exceeds_outstanding" });
    });
    if (short.length > 0) throw memoOutReturnOutstandingShort(short);
    const plan = settleReturnLines(lines, allocs);
    if (plan.short.length > 0) throw memoOutReturnOutstandingShort(plan.short.flatMap((index) => [{ path: `lines.${index}.pcs`, code: "exceeds_outstanding" }, { path: `lines.${index}.weightCt`, code: "exceeds_outstanding" }]));
    const puts: MemoStockTake[] = plan.settled.flatMap((entry) => (entry.alloc.memoStockId ? [{ memoStockId: entry.alloc.memoStockId, pcs: entry.part.pcs, weightCt: entry.part.weight, index: entry.index }] : []));
    await addReturned(tx, lines, 1);
    await addSettled(tx, plan.settled.map((entry) => ({ allocId: entry.alloc.id, pcs: entry.part.pcs, weight: entry.part.weight })), 1);
    await writeReturnAllocs(tx, lines.map((line) => line.id), plan.settled);
    await releaseToMemoStock(tx, puts, memoOutReturnOutstandingShort, now);
    return { result: {}, log: { lineCount: lines.length } };
  },
  reverse: async (tx, doc, now) => {
    const lines = await returnLines(tx, doc.id);
    const outLines = await lockOutLines(tx, lines);
    await readAllocations(tx, "memoOut", lines.map((line) => line.memoOutLineId), true);
    // The exact settled parts this return recorded (ADR-0055 D5); legacy rows were backfilled one per line.
    const recorded = await returnAllocs(tx, lines.map((line) => line.id));
    const indexOf = new Map(lines.map((line, index) => [line.id, index]));
    lines.forEach((line) => {
      const out = outLines.get(line.memoOutLineId);
      if (!out || line.pcs > Number(out.returned_pcs) || line.weightCt.gt(dec(out.returned_weight_ct))) throw memoOutReturnErrors.inUse(null);
    });
    const takes: MemoStockTake[] = recorded.flatMap((row) => (row.memo_stock_id
      ? [{ memoStockId: row.memo_stock_id, pcs: row.pcs, weightCt: dec(row.weight_ct), index: indexOf.get(row.line_id) ?? 0 }]
      : []));
    await addReturned(tx, lines, -1);
    await addSettled(tx, recorded.map((row) => ({ allocId: row.memo_out_line_alloc_id, pcs: row.pcs, weight: dec(row.weight_ct) })), -1);
    await tx.$executeRaw`DELETE FROM "partner"."memo_out_return_line_alloc" WHERE line_id = ANY(${lines.map((line) => line.id)}::uuid[])`;
    try {
      await takeFromMemoStock(tx, takes, "reserved", () => new ReversalShort(), now);
    } catch (error) {
      if (!(error instanceof ReversalShort)) throw error;
      throw memoOutReturnErrors.inUse(await memoOutReturnUsedBy(tx, doc.id));
    }
  },
  usedBy: (client, id) => memoOutReturnUsedBy(client, id),
};

/**
 * An auto-approved Memo Out Return is used when its reversal would break a balance: a Memo Stock item it gave back to
 * pending has less pending now than the return brought back (another document took it again). Returns the newest
 * live document naming such an item (other than the Memo Outs being returned), else its Stock ID, else null.
 */
export async function memoOutReturnUsedBy(client: Tx | typeof prisma, id: string): Promise<string | null> {
  // ADR-0055 D5: what the return gave back per item comes from its recorded settlement (memo_out_return_line_alloc).
  const short = await client.$queryRaw<{ memo_stock_id: string; stock_id: string; memo_out_ids: string[] }[]>(Prisma.sql`
    SELECT s.id::text AS memo_stock_id, s.stock_id, array_agg(DISTINCT o.memo_out_id::text) AS memo_out_ids
    FROM "partner"."memo_out_return_line" l
    JOIN "partner"."memo_out_return_line_alloc" r ON r.line_id = l.id
    JOIN "partner"."memo_out_line_alloc" a ON a.id = r.memo_out_line_alloc_id
    JOIN "partner"."memo_out_line" o ON o.id = l.memo_out_line_id
    JOIN "partner"."memo_stock" s ON s.id = a.memo_stock_id
    WHERE l.memo_out_return_id = ${id}::uuid
    GROUP BY s.id, s.stock_id, s.pending_pcs, s.pending_weight_ct
    HAVING sum(r.pcs) > s.pending_pcs OR sum(r.weight_ct) > s.pending_weight_ct
    ORDER BY s.id
    LIMIT 200`);
  if (short.length === 0) return null;
  const user = await latestStockUser(client, short.map((row) => row.memo_stock_id), short.flatMap((row) => row.memo_out_ids));
  return user ?? short[0].stock_id;
}

/** Stores the settled parts of the return lines (one bulk INSERT). */
async function writeReturnAllocs(tx: Tx, lineIds: readonly string[], settled: readonly Settled[]) {
  await tx.$executeRaw`DELETE FROM "partner"."memo_out_return_line_alloc" WHERE line_id = ANY(${[...lineIds]}::uuid[])`;
  if (settled.length === 0) return;
  const totals = new Map<string, { lineId: string; allocId: string; pcs: number; weight: Dec }>();
  for (const entry of settled) {
    const key = `${entry.lineId}|${entry.alloc.id}`;
    const total = totals.get(key) ?? { lineId: entry.lineId, allocId: entry.alloc.id, pcs: 0, weight: new Decimal(0) };
    totals.set(key, { ...total, pcs: total.pcs + entry.part.pcs, weight: total.weight.plus(entry.part.weight) });
  }
  const values = [...totals.values()].map((row) => Prisma.sql`(${newId()}::uuid, ${row.lineId}::uuid, ${row.allocId}::uuid, ${row.pcs}::int, ${row.weight.toFixed(3)}::numeric)`);
  await tx.$executeRaw(Prisma.sql`INSERT INTO "partner"."memo_out_return_line_alloc" (id, line_id, memo_out_line_alloc_id, pcs, weight_ct) VALUES ${Prisma.join(values)}`);
}

type ReturnAllocRow = { line_id: string; memo_out_line_alloc_id: string; memo_stock_id: string | null; own_stock_id: string | null; pcs: number; weight_ct: string };
/** The recorded settlement of return lines with each source allocation row's stock (one statement). */
async function returnAllocs(client: Tx | typeof prisma, lineIds: readonly string[]): Promise<ReturnAllocRow[]> {
  if (lineIds.length === 0) return [];
  return client.$queryRaw<ReturnAllocRow[]>`
    SELECT r.line_id::text AS line_id, r.memo_out_line_alloc_id::text AS memo_out_line_alloc_id, a.memo_stock_id::text AS memo_stock_id,
      a.own_stock_id::text AS own_stock_id, r.pcs, r.weight_ct::text AS weight_ct
    FROM "partner"."memo_out_return_line_alloc" r JOIN "partner"."memo_out_line_alloc" a ON a.id = r.memo_out_line_alloc_id
    WHERE r.line_id = ANY(${[...lineIds]}::uuid[]) ORDER BY r.id`;
}

/**
 * memo-out-return SA rev 2 / ADR-0033 rev 3 (owner 2026-10-31, "อนุมัติ memo-out-return revision 4"): the customer
 * brings back what a Memo Out lent. Document Setup key `memo-out-return`; the approval flow of ADR-0050. Lines come only
 * from the customer's approved Memo Out From Stock lines (Memo Outstanding); approval adds to those lines' returned and
 * moves the Memo Stock items from Reserve back to pending.
 */
@Injectable()
export class MemoOutReturnService {
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
    approvalType: "memo-out-return",
    effects: memoOutReturnEffects,
    outstanding: true,
    prepare: completeReturnLines,
    lockSources: async (tx, input) => {
      refuseSyncingSources(await lockSourceHeaders(tx, "memoOut", input.lines.map((line) => line.memoOutLineId)));
    },
    afterWrite: (tx, id, action) => holdSaga.inTx("memo-out-return", tx, id, action),
    syncState: true,
    lineHook: withLinePhotos(LINE_PHOTO_DOCUMENTS.memoOutReturn, memoOutLines),
    detailExtra: (row) => ({
      approvedAt: row.approvedAt ? (row.approvedAt as Date).toISOString() : null,
      approvedBy: (row.approvedBy as string | null) ?? null,
    }),
  });

  list(input: MemoReceiveListInput) {
    return this.engine.list(input);
  }
  get(id: string, viewer: FlowPrincipal | null = null) {
    return this.engine.get(id, viewer) as Promise<unknown> as Promise<MemoOutReturnDetail>;
  }
  nextNumber(docDate: string) {
    return this.engine.nextNumber(docDate);
  }
  /**
   * ADR-0052 D18/D19: a return of own-stock Memo Out lines moves memo_out -> on-hand in inventory (MEMO_OUT_RETURN hold,
   * release kind, after the local commit); its reversal (edit / delete) is the acquire kind, done first (refused ->
   * MEMO_OUT_RETURN_IN_USE, nothing changed).
   */
  async create(actorId: string, input: MemoOutReturnInput, viewer: FlowPrincipal | null = null) {
    const id = uuidV7();
    const owned = await this.ownStockOf(input);
    return holdSaga.withHolds(owned.size > 0, {
      type: "memo-out-return", id, isCreate: true, actorId,
      next: async () => ((await peekApprovalSetting(prisma, "memo-out-return")) ? new Map() : this.inputHolds(input)),
      lineIndex: this.lineIndex(input, owned),
      call: () => this.engine.create(actorId, input, viewer, { id }),
    });
  }
  async update(actorId: string, id: string, expectedVersion: number, input: MemoOutReturnInput, viewer: FlowPrincipal | null = null) {
    const owned = await this.ownStockOf(input);
    return holdSaga.withHolds(owned.size > 0, async () => {
      const header = await prisma.memoOutReturn.findUnique({ where: { id }, select: { status: true, autoApproved: true } });
      return {
      type: "memo-out-return", id, isCreate: false, actorId, expectedVersion,
      next: async () => {
        if (header?.status === "APPROVED" && header.autoApproved) return this.inputHolds(input);
        if (header?.status === "DRAFT" && !(await peekApprovalSetting(prisma, "memo-out-return"))) return this.inputHolds(input);
        return null;
      },
      lineIndex: this.lineIndex(input, owned),
      call: () => this.engine.update(actorId, id, expectedVersion, input, viewer),
      };
    }, () => this.engine.update(actorId, id, expectedVersion, input, viewer));
  }
  delete(actorId: string, id: string, expectedVersion: number) {
    return holdSaga.withHolds(false, { type: "memo-out-return", id, isCreate: false, actorId, expectedVersion, next: () => new Map(), call: () => this.engine.delete(actorId, id, expectedVersion) });
  }
  /** transaction-soft-delete D6 / approval-setup G3. */
  restore(actorId: string, id: string, expectedVersion: number) {
    return holdSaga.withHolds(false, {
      type: "memo-out-return", id, isCreate: false, actorId, expectedVersion,
      next: async () => ((await peekApprovalSetting(prisma, "memo-out-return")) ? new Map() : DOC_SPECS["memo-out-return"].lines(prisma, id, false)),
      call: () => this.engine.restore(actorId, id, expectedVersion),
    });
  }
  submit(actor: DocumentActor, id: string, expectedVersion: number) {
    return this.engine.submit(actor, id, expectedVersion);
  }
  /** PENDING_APPROVAL -> APPROVED with the moves above (SA-MOR-17) and the own-stock return in inventory. */
  approve(actorId: string, id: string, expectedVersion: number) {
    return holdSaga.withHolds(false, {
      type: "memo-out-return", id, isCreate: false, actorId, expectedVersion,
      next: () => DOC_SPECS["memo-out-return"].lines(prisma, id, false),
      call: () => this.engine.approve(actorId, id, expectedVersion) as Promise<{ id: string; version: number; status: "APPROVED" }>,
    });
  }

  /** Memo Out line id -> its own stocks (legacy line or own-lot allocation, ADR-0055; Memo Stock lines are absent). */
  private ownStockOf(input: MemoOutReturnInput): Promise<Map<string, string[]>> {
    return ownStocksOfOutLines(prisma, (input.lines ?? []).map((line) => line.memoOutLineId));
  }
  /** H_new: the oldest-first settlement of each line over its Memo Out line's own allocation. */
  private inputHolds(input: MemoOutReturnInput) {
    return returnHoldsOf(prisma, input.lines.map((line) => ({ memoOutLineId: line.memoOutLineId, pcs: line.pcs, weightCt: line.weightCt })));
  }
  private lineIndex(input: MemoOutReturnInput, owned: Map<string, string[]>) {
    const index = new Map<string, number[]>();
    input.lines.forEach((line, position) => {
      for (const stock of owned.get(line.memoOutLineId) ?? []) index.set(stock, [...(index.get(stock) ?? []), position]);
    });
    return index;
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
      Prisma.sql`o.status = 'APPROVED' AND o.deleted_at IS NULL`,
      Prisma.sql`o.customer_id = ${input.customerId}::uuid`,
      Prisma.sql`o.currency_code = ${input.currency}::char(3)`,
      // ADR-0052 D20: lines of Memo Stock and of our stock (Q-LS-P2-04: items carry `source` and `location`).
      Prisma.sql`(l.memo_stock_id IS NOT NULL OR l.own_stock_id IS NOT NULL OR l.lot_key IS NOT NULL) AND (l.returned_pcs < l.pcs OR l.returned_weight_ct < l.weight_ct)`,
    ];
    if (input.q) {
      const pattern = `%${escapeLike(input.q)}%`;
      filters.push(Prisma.sql`(o.doc_no ILIKE ${pattern} OR l.stock_id ILIKE ${pattern} OR l.lot ILIKE ${pattern} OR l.stone ILIKE ${pattern} OR l.stone_code_snapshot ILIKE ${pattern} OR l.cer_no ILIKE ${pattern})`);
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
          l.memo_stock_id::text AS memo_stock_id, l.own_stock_id::text AS own_stock_id, l.stock_id, l.lot_key, l.lot, l.location, l.stone, l.shape, l.size, l.color, l.clarity,
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

}

type OutLineLock = { id: string; pcs: number; weight_ct: Dec | string; returned_pcs: number; returned_weight_ct: Dec | string; memo_stock_id: string | null };

type EngineDetail = Awaited<ReturnType<TradeDocumentEngine<MemoOutReturnInput, CustomerOut, MemoOutReturnStatus>["get"]>>;
type MemoOutReturnLineOut = Omit<EngineDetail["lines"][number], "stoneCodeId" | "source"> & {
  source: "STOCK";
  memoOutLineId: string;
  memoOut: { id: string; docNo: string } | null;
  memoStockId: string | null;
  stockId: string | null;
  lotKey: string | null;
};
/** api-contract `MemoOutReturn` rev 2 (the line hook and `detailExtra` shape the engine output at run time). */
export type MemoOutReturnDetail = Omit<EngineDetail, "lines"> & { lines: MemoOutReturnLineOut[]; approvedAt: string | null; approvedBy: string | null; syncState: "IDLE" | "SYNCING" };

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
