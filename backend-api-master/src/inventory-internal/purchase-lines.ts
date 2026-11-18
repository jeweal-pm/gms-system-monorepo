import { validationException } from "../common/errors";
import { escapeLike } from "../common/persistence";
import { prisma } from "../database/prisma-client";
import { Prisma } from "../generated/prisma/client";
import { netUnitPrice } from "../trade-document/memo-receive.service";
import { SEARCH_TOTAL_CAP, type LineBatchInput, type LoadableSearchInput, type VendorsQuery } from "./inventory-internal.schemas";

/**
 * Purchase lines as Load to Stock sees them (load-to-stock SA rev 1 api-contract `PurchaseLineRef`, ADR-0052 D3/D7,
 * BE-LS-004). Remaining = line qty − loaded by applied loads (+ this load's own allocation when `excludeAllocationOf`
 * names it). A line is loadable while its Purchase is APPROVED and not deleted, its source is MANUAL / PURCHASE_ORDER
 * and its remaining pcs > 0 (owner Q-LS-26). Cost: net unit price (after the line discount) × the PU rate to the company
 * currency (1 when the PU is in that currency), 4 dp half-up; remaining amount = remaining basis × unit cost, 2 dp.
 *
 * Every read is one statement per page (+ one capped count for the picker): the photo count is a correlated
 * subquery and the company currency a join, so no query runs per returned line (N+1 review, NP-LS-01/02).
 */

const Decimal = Prisma.Decimal;
type Dec = Prisma.Decimal;

export type PurchaseLineRef = {
  purchaseLineId: string;
  stoneCodeId: string | null; stoneCode: string;
  stone: string; shape: string; size: string; color: string; clarity: string; cutting: string; quality: string;
  lot: string; cerType: string; cerNo: string;
  purchase: { id: string; docNo: string; docDate: string; currency: string; rate: string };
  location: string;
  priceUnit: "PER_CT" | "PER_PCS";
  unitPrice: string;
  netUnitPrice: string;
  unitCostBase: string;
  pcs: number; weightCt: string;
  remainingPcs: number; remainingWeightCt: string;
  remainingAmountBase: string;
  photoCount: number;
  itemNote: string;
};
export type LineStatus = "OPEN" | "CLOSED" | "UNAVAILABLE";
/** Batch rows add status, vendor id and (additive, backend note) the PU vendor code / name snapshots for the load header. */
export type BatchLine = PurchaseLineRef & { status: LineStatus; vendorId: string; vendorCode: string; vendorName: string };

type LineRow = {
  id: string; purchase_id: string; position: number; source: string;
  stone_code_id: string | null; stone_code_snapshot: string; stone: string; shape: string; size: string; color: string; clarity: string;
  cutting: string; quality: string; lot: string; location: string; cer_type: string; cer_no: string;
  pcs: number; weight_ct: string; price_unit: string; unit_price: string; discount_type: string; discount_value: string; amount: string; item_note: string;
  loaded_pcs: number; loaded_weight_ct: string; own_pcs: number; own_weight_ct: string;
  doc_no: string; doc_date: string; currency_code: string; exchange_rate: string | null; status: string; deleted: boolean; vendor_id: string;
  vendor_code_snapshot: string; vendor_name_snapshot: string;
  photo_count: number; company_currency: string | null;
};

/** The SELECT list + FROM shared by search and batch (fixed identifiers; `own` is the edited load's allocation). */
function lineSelect(excludeAllocationOf: string | undefined): Prisma.Sql {
  return Prisma.sql`
    SELECT l."id", l."purchase_id", l."position", l."source", l."stone_code_id", l."stone_code_snapshot", l."stone", l."shape", l."size",
      l."color", l."clarity", l."cutting", l."quality", l."lot", l."location", l."cer_type", l."cer_no", l."pcs", l."weight_ct"::text AS "weight_ct",
      l."price_unit", l."unit_price"::text AS "unit_price", l."discount_type", l."discount_value"::text AS "discount_value", l."amount"::text AS "amount",
      l."item_note", l."loaded_pcs", l."loaded_weight_ct"::text AS "loaded_weight_ct",
      COALESCE(own."pcs", 0)::int AS "own_pcs", COALESCE(own."weight_ct", 0)::text AS "own_weight_ct",
      p."doc_no", to_char(p."doc_date", 'YYYY-MM-DD') AS "doc_date", p."currency_code", p."exchange_rate"::text AS "exchange_rate",
      p."status", (p."deleted_at" IS NOT NULL) AS "deleted", p."vendor_id", p."vendor_code_snapshot", p."vendor_name_snapshot",
      (SELECT count(*)::int FROM "partner"."purchase_line_photo" ph WHERE ph."line_id" = l."id") AS "photo_count",
      cp."currency_code" AS "company_currency"
    FROM "partner"."purchase_line" l
    JOIN "partner"."purchase" p ON p."id" = l."purchase_id"
    LEFT JOIN "partner"."load_allocation_line" own ON own."load_document_id" = ${excludeAllocationOf ?? null}::uuid AND own."purchase_line_id" = l."id"
    LEFT JOIN "partner"."company_profile" cp ON cp."id" = 1`;
}

/** PU rate to the company currency: 1 when the PU is in it (or has no rate), otherwise its stored rate. */
export function rateToCompany(currency: string, exchangeRate: string | null, companyCurrency: string | null): Dec {
  if (companyCurrency === null || currency === companyCurrency || exchangeRate === null) return new Decimal(1);
  return new Decimal(exchangeRate);
}

/** Cost per basis unit in the company currency (4 dp half-up) and the amount for a quantity (2 dp half-up). */
export function unitCostBase(net: Dec, rate: Dec): Dec {
  return net.times(rate).toDecimalPlaces(4, Decimal.ROUND_HALF_UP);
}
export function amountBase(priceUnit: string, pcs: number, weightCt: Dec, unitCost: Dec): Dec {
  const basis = priceUnit === "PER_CT" ? weightCt : new Decimal(pcs);
  return basis.times(unitCost).toDecimalPlaces(2, Decimal.ROUND_HALF_UP);
}

/** Maps one row; remaining excludes the edited load's own applied allocation. */
export function toLineRef(row: LineRow): BatchLine {
  const remainingPcs = row.pcs - row.loaded_pcs + Number(row.own_pcs);
  const remainingWeight = new Decimal(row.weight_ct).minus(row.loaded_weight_ct).plus(row.own_weight_ct);
  const net = netUnitPrice({ priceUnit: row.price_unit, pcs: row.pcs, weightCt: row.weight_ct, unitPrice: row.unit_price, amount: row.amount, discountType: row.discount_type, discountValue: row.discount_value });
  const rate = rateToCompany(row.currency_code, row.exchange_rate, row.company_currency);
  const cost = unitCostBase(net, rate);
  const unavailable = row.status !== "APPROVED" || row.deleted || row.source === "STOCK";
  return {
    purchaseLineId: row.id,
    stoneCodeId: row.stone_code_id,
    stoneCode: row.stone_code_snapshot,
    stone: row.stone, shape: row.shape, size: row.size, color: row.color, clarity: row.clarity, cutting: row.cutting, quality: row.quality,
    lot: row.lot, cerType: row.cer_type, cerNo: row.cer_no,
    purchase: { id: row.purchase_id, docNo: row.doc_no, docDate: row.doc_date, currency: row.currency_code, rate: rate.toString() },
    location: row.location,
    priceUnit: row.price_unit === "PER_PCS" ? "PER_PCS" : "PER_CT",
    unitPrice: new Decimal(row.unit_price).toFixed(2),
    netUnitPrice: net.toFixed(4),
    unitCostBase: cost.toFixed(4),
    pcs: row.pcs,
    weightCt: new Decimal(row.weight_ct).toFixed(3),
    remainingPcs,
    remainingWeightCt: remainingWeight.toFixed(3),
    remainingAmountBase: amountBase(row.price_unit, Math.max(remainingPcs, 0), Decimal.max(remainingWeight, 0), cost).toFixed(2),
    photoCount: Number(row.photo_count),
    itemNote: row.item_note,
    status: unavailable ? "UNAVAILABLE" : remainingPcs > 0 ? "OPEN" : "CLOSED",
    vendorId: row.vendor_id,
    vendorCode: row.vendor_code_snapshot,
    vendorName: row.vendor_name_snapshot,
  };
}

const publicRef = ({ status: _status, vendorId: _vendorId, vendorCode: _code, vendorName: _name, ...ref }: BatchLine): PurchaseLineRef => ref;

// ---------- picker keyset cursor: base64url JSON {d: PU doc date, p: PU id, n: line position} ----------

type SearchCursor = { d: string; p: string; n: number };

export function encodeSearchCursor(cursor: SearchCursor): string {
  return Buffer.from(JSON.stringify(cursor), "utf8").toString("base64url");
}

export function decodeSearchCursor(value: string): SearchCursor {
  const invalid = () => validationException([{ path: "cursor", code: "invalid" }]);
  if (!/^[A-Za-z0-9_-]{1,300}$/.test(value)) throw invalid();
  let parsed: unknown;
  try { parsed = JSON.parse(Buffer.from(value, "base64url").toString("utf8")); } catch { throw invalid(); }
  const body = parsed as Partial<SearchCursor> | null;
  if (!body || typeof body !== "object" || Object.keys(body).length !== 3 || typeof body.d !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(body.d) ||
    typeof body.p !== "string" || !/^[0-9a-f-]{36}$/.test(body.p) || typeof body.n !== "number" || !Number.isInteger(body.n) || body.n < 0 || body.n > 32_767) {
    throw invalid();
  }
  return { d: body.d, p: body.p, n: body.n };
}

/** The loadable filter shared by the page and the count (index `purchase_line_loadable_idx` when not editing). */
function loadableWhere(input: Pick<LoadableSearchInput, "vendorId" | "q" | "from" | "to" | "excludeLineIds" | "excludeAllocationOf">): Prisma.Sql[] {
  const where: Prisma.Sql[] = [
    Prisma.sql`p."status" = 'APPROVED'`,
    Prisma.sql`p."deleted_at" IS NULL`,
    Prisma.sql`l."source" <> 'STOCK'`,
    input.excludeAllocationOf
      ? Prisma.sql`l."pcs" - l."loaded_pcs" + COALESCE(own."pcs", 0) > 0`
      : Prisma.sql`l."pcs" > l."loaded_pcs"`,
  ];
  if (input.vendorId) where.push(Prisma.sql`p."vendor_id" = ${input.vendorId}::uuid`);
  if (input.from) where.push(Prisma.sql`p."doc_date" >= ${input.from}::date`);
  if (input.to) where.push(Prisma.sql`p."doc_date" <= ${input.to}::date`);
  if (input.excludeLineIds && input.excludeLineIds.length > 0) where.push(Prisma.sql`l."id" <> ALL(${input.excludeLineIds}::uuid[])`);
  if (input.q) {
    const pattern = `%${escapeLike(input.q)}%`;
    where.push(Prisma.sql`(p."doc_no" ILIKE ${pattern} ESCAPE '\\' OR l."stone_code_snapshot" ILIKE ${pattern} ESCAPE '\\' OR l."lot" ILIKE ${pattern} ESCAPE '\\' OR l."cer_no" ILIKE ${pattern} ESCAPE '\\')`);
  }
  return where;
}

/** P-01 picker: one page query (limit + 1) and one count capped at 1,000. Order: PU date desc, PU id desc, position asc. */
export async function searchLoadableLines(input: LoadableSearchInput) {
  const after = input.cursor ? decodeSearchCursor(input.cursor) : null;
  const where = loadableWhere(input);
  const page = after
    ? [...where, Prisma.sql`(p."doc_date" < ${after.d}::date OR (p."doc_date" = ${after.d}::date AND (p."id" < ${after.p}::uuid OR (p."id" = ${after.p}::uuid AND l."position" > ${after.n}::int))))`]
    : where;
  const [rows, counted] = await Promise.all([
    prisma.$queryRaw<LineRow[]>(Prisma.sql`${lineSelect(input.excludeAllocationOf)}
      WHERE ${Prisma.join(page, " AND ")}
      ORDER BY p."doc_date" DESC, p."id" DESC, l."position" ASC
      LIMIT ${input.limit + 1}`),
    prisma.$queryRaw<{ total: number }[]>(Prisma.sql`
      SELECT count(*)::int AS "total" FROM (
        SELECT 1 FROM "partner"."purchase_line" l
        JOIN "partner"."purchase" p ON p."id" = l."purchase_id"
        LEFT JOIN "partner"."load_allocation_line" own ON own."load_document_id" = ${input.excludeAllocationOf ?? null}::uuid AND own."purchase_line_id" = l."id"
        WHERE ${Prisma.join(where, " AND ")}
        LIMIT ${SEARCH_TOTAL_CAP}
      ) c`),
  ]);
  const items = rows.slice(0, input.limit);
  const last = items[items.length - 1];
  return {
    items: items.map((row) => publicRef(toLineRef(row))),
    nextCursor: rows.length > input.limit && last ? encodeSearchCursor({ d: last.doc_date, p: last.purchase_id, n: last.position }) : null,
    total: Number(counted[0]?.total ?? 0),
  };
}

/** Lines by id (≤ 200) with status and vendor, in one query; unknown ids are absent. */
export async function lineBatch(input: LineBatchInput): Promise<{ items: BatchLine[] }> {
  const rows = await prisma.$queryRaw<LineRow[]>(Prisma.sql`${lineSelect(input.excludeAllocationOf)}
    WHERE l."id" = ANY(${[...new Set(input.ids)]}::uuid[])
    ORDER BY l."id"`);
  return { items: rows.map(toLineRef) };
}

/** DISTINCT vendors with ≥ 1 loadable line; keyset on (name_key, id), the cursor carries only the id. */
export async function loadableVendors(input: VendorsQuery) {
  const where: Prisma.Sql[] = [Prisma.sql`EXISTS (
    SELECT 1 FROM "partner"."purchase" p JOIN "partner"."purchase_line" l ON l."purchase_id" = p."id"
    WHERE p."vendor_id" = v."id" AND p."status" = 'APPROVED' AND p."deleted_at" IS NULL AND l."source" <> 'STOCK' AND l."pcs" > l."loaded_pcs")`];
  if (input.q) {
    const pattern = `%${escapeLike(input.q)}%`;
    where.push(Prisma.sql`(v."name" ILIKE ${pattern} ESCAPE '\\' OR v."code" ILIKE ${pattern} ESCAPE '\\')`);
  }
  if (input.cursor) {
    if (!/^[0-9a-f-]{36}$/.test(input.cursor)) throw validationException([{ path: "cursor", code: "invalid" }]);
    where.push(Prisma.sql`(v."name_key", v."id") > ((SELECT k."name_key" FROM "partner"."vendor" k WHERE k."id" = ${input.cursor}::uuid), ${input.cursor}::uuid)`);
  }
  const rows = await prisma.$queryRaw<{ id: string; code: string | null; name: string }[]>(Prisma.sql`
    SELECT v."id", v."code", v."name" FROM "partner"."vendor" v
    WHERE ${Prisma.join(where, " AND ")}
    ORDER BY v."name_key", v."id"
    LIMIT ${input.limit + 1}`);
  const items = rows.slice(0, input.limit).map((row) => ({ id: row.id, code: row.code ?? "", name: row.name }));
  return { items, nextCursor: rows.length > input.limit ? items[items.length - 1].id : null };
}
