import { validationException, type FieldError } from "../common/errors";
import { escapeLike } from "../common/persistence";
import { prisma } from "../database/prisma-client";
import { fromDbDate, toDbDate } from "../document-setup/document-setup.service";
import { Prisma } from "../generated/prisma/client";
import { formatAddress } from "../quotation/quotation.service";
import { netUnitPrice } from "../trade-document/memo-receive.service";
import type { SalePrepareInput, SaleReserveLineSearchInput } from "./inventory-internal.schemas";
import { readMemoLotGroups, type MemoLotGroup } from "../trade-document/stock-lines";

/**
 * Read paths of the master side of Sale (sale SA rev 1 api-contract "Master internal API", BE-SL-002). None of them
 * returns the vendor memo cost (authorization.md "Data exposure"); none holds a lock.
 * - reserve-lines search: ONE keyset page query (LIMIT limit + 1) over reserve_open_customer_idx ⋈ reserve_line_open_idx;
 * - prepare: ≤ 4 bounded queries (customer + addresses, currency + company currency, Reserve lines + headers, Memo Stock
 *   items), each set-based over ≤ 200 ids.
 */
const Decimal = Prisma.Decimal;
type Dec = Prisma.Decimal;

export type ReserveLineRef = {
  reserveLineId: string; reserveId: string; reserveNo: string; reserveDate: string; dueDate: string;
  /** Legacy Reserve line: its item; a lot Reserve line (ADR-0055): null and `lotKey` set. */
  memoStockId: string | null; lotKey: string | null;
  /** ADR-0058 phase B: where the Reserve line's stock comes from. */
  source: "MEMO_STOCK" | "OWN_STOCK";
  /** The Reserve line's Stock ID ("" on a lot line). Owner 2026-11-21 (Q3): Sale keeps showing it. */
  stockId: string; priceUnit: "PER_CT" | "PER_PCS";
  stoneCode: string; stone: string; shape: string; size: string; color: string; clarity: string; cutting: string; quality: string;
  lot: string; location: string; cerType: string; cerNo: string;
  netUnitPrice: string; openPcs: number; openWeightCt: string; openAmount: string;
};

type ReserveLineRow = {
  id: string; reserve_id: string; doc_no: string; doc_date: Date; due_date: Date; memo_stock_id: string | null; own_stock_id: string | null; lot_key: string | null; stock_id: string | null; position: number;
  price_unit: string; stone_code_snapshot: string; stone: string; shape: string; size: string; color: string; clarity: string; cutting: string; quality: string;
  lot: string; location: string; cer_type: string; cer_no: string;
  pcs: number; weight_ct: string; sold_pcs: number; sold_weight_ct: string; unit_price: string; amount: string; discount_type: string; discount_value: string;
};

const LINE_COLUMNS = Prisma.sql`
  l."id"::text AS "id", l."reserve_id"::text AS "reserve_id", r."doc_no", r."doc_date", r."due_date", l."memo_stock_id"::text AS "memo_stock_id", l."own_stock_id"::text AS "own_stock_id", l."lot_key", l."stock_id", l."position",
  l."price_unit", l."stone_code_snapshot", l."stone", l."shape", l."size", l."color", l."clarity", l."cutting", l."quality", l."lot", l."location", l."cer_type", l."cer_no",
  l."pcs", l."weight_ct"::text AS "weight_ct", l."sold_pcs", l."sold_weight_ct"::text AS "sold_weight_ct", l."unit_price"::text AS "unit_price", l."amount"::text AS "amount",
  l."discount_type", l."discount_value"::text AS "discount_value"`;

/** Reserve line → picker row; `extraPcs/extraWeight` add back this Sale's own applied quantity (prepare with saleId). */
function toRef(row: ReserveLineRow, extraPcs = 0, extraWeight: Dec = new Decimal(0)): ReserveLineRef {
  const net = netUnitPrice({ priceUnit: row.price_unit, pcs: row.pcs, weightCt: row.weight_ct, unitPrice: row.unit_price, amount: row.amount, discountType: row.discount_type, discountValue: row.discount_value });
  const openPcs = row.pcs - row.sold_pcs + extraPcs;
  const openWeight = new Decimal(row.weight_ct).minus(row.sold_weight_ct).plus(extraWeight);
  const basis = row.price_unit === "PER_CT" ? openWeight : new Decimal(openPcs);
  return {
    reserveLineId: row.id, reserveId: row.reserve_id, reserveNo: row.doc_no, reserveDate: fromDbDate(row.doc_date), dueDate: fromDbDate(row.due_date),
    memoStockId: row.memo_stock_id, lotKey: row.memo_stock_id ? null : row.lot_key, source: row.own_stock_id || row.lot_key?.startsWith("O") ? "OWN_STOCK" : "MEMO_STOCK", stockId: row.stock_id ?? "", priceUnit: row.price_unit === "PER_PCS" ? "PER_PCS" : "PER_CT",
    stoneCode: row.stone_code_snapshot, stone: row.stone, shape: row.shape, size: row.size, color: row.color, clarity: row.clarity, cutting: row.cutting, quality: row.quality,
    lot: row.lot, location: row.location, cerType: row.cer_type, cerNo: row.cer_no,
    netUnitPrice: net.toFixed(4), openPcs, openWeightCt: openWeight.toFixed(3), openAmount: net.times(basis).toDecimalPlaces(2, Decimal.ROUND_HALF_UP).toFixed(2),
  };
}

// ---------- From Reserve picker (P-01) ----------

type PickerCursor = { d: string; r: string; p: number };
const encode = (cursor: PickerCursor) => Buffer.from(JSON.stringify(cursor), "utf8").toString("base64url");
function decode(value: string): PickerCursor {
  const invalid = () => validationException([{ path: "cursor", code: "invalid" }]);
  if (!/^[A-Za-z0-9_-]{1,300}$/.test(value)) throw invalid();
  let body: Partial<PickerCursor>;
  try { body = JSON.parse(Buffer.from(value, "base64url").toString("utf8")) as Partial<PickerCursor>; } catch { throw invalid(); }
  if (!body || typeof body.d !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(body.d) || typeof body.r !== "string" || !/^[0-9a-f-]{36}$/.test(body.r) || !Number.isInteger(body.p)) throw invalid();
  return { d: body.d, r: body.r, p: body.p as number };
}

/** Open stock lines of APPROVED, live Reserves of the customer in the currency, oldest Reserve first, then line position. */
export async function searchSaleReserveLines(input: SaleReserveLineSearchInput) {
  const filters: Prisma.Sql[] = [
    Prisma.sql`r."customer_id" = ${input.customerId}::uuid`, Prisma.sql`r."currency_code" = ${input.currency}::char(3)`,
    Prisma.sql`r."status" = 'APPROVED'`, Prisma.sql`r."deleted_at" IS NULL`,
    Prisma.sql`(l."memo_stock_id" IS NOT NULL OR l."lot_key" LIKE 'M%' OR l."own_stock_id" IS NOT NULL OR l."lot_key" LIKE 'O%')`, Prisma.sql`(l."sold_pcs" < l."pcs" OR l."sold_weight_ct" < l."weight_ct")`,
  ];
  if (input.q) {
    const pattern = `%${escapeLike(input.q)}%`;
    filters.push(Prisma.sql`(r."doc_no" ILIKE ${pattern} OR l."stock_id" ILIKE ${pattern} OR l."lot" ILIKE ${pattern} OR l."stone" ILIKE ${pattern} OR l."stone_code_snapshot" ILIKE ${pattern} OR l."cer_no" ILIKE ${pattern})`);
  }
  if (input.from) filters.push(Prisma.sql`r."doc_date" >= ${toDbDate(input.from)}::date`);
  if (input.to) filters.push(Prisma.sql`r."doc_date" <= ${toDbDate(input.to)}::date`);
  if (input.exclude.length > 0) filters.push(Prisma.sql`l."id" <> ALL(${input.exclude}::uuid[])`);
  if (input.cursor) {
    const after = decode(input.cursor);
    filters.push(Prisma.sql`(r."doc_date", r."id", l."position") > (${toDbDate(after.d)}::date, ${after.r}::uuid, ${after.p}::smallint)`);
  }
  const rows = await prisma.$queryRaw<ReserveLineRow[]>(Prisma.sql`
    SELECT ${LINE_COLUMNS}
    FROM "partner"."reserve" r JOIN "partner"."reserve_line" l ON l."reserve_id" = r."id"
    WHERE ${Prisma.join(filters, " AND ")}
    ORDER BY r."doc_date", r."id", l."position"
    LIMIT ${input.limit + 1}`);
  const page = rows.slice(0, input.limit);
  const last = page.at(-1);
  return {
    items: page.map((row) => toRef(row)),
    nextCursor: rows.length > input.limit && last ? encode({ d: fromDbDate(last.doc_date), r: last.reserve_id, p: last.position }) : null,
  };
}

// ---------- prepare (Save / Submit / detail validation) ----------

type PreparedReserveLine = ReserveLineRef & { status: "OPEN" | "CLOSED" | "UNAVAILABLE"; customerId: string; currency: string };
type PreparedStock = {
  memoStockId: string; stockId: string; priceUnit: "PER_CT" | "PER_PCS";
  attrs: { stoneCode: string; stone: string; shape: string; size: string; color: string; clarity: string; cutting: string; quality: string; lot: string; location: string; cerType: string; cerNo: string };
  memoReceive: { id: string; docNo: string };
  pendingPcs: number; pendingWeightCt: string; status: "OK" | "UNAVAILABLE";
};

type PartyAddress = { id: string; type: string; name: string; taxId: string | null; address: string; countryCode: string; state: string; city: string; postcode: string };

export async function prepareSale(input: SalePrepareInput) {
  const reserveLineIds = [...new Set(input.reserveLineIds)];
  const memoStockIds = [...new Set(input.memoStockIds)];
  const saleId = input.saleId ?? null;
  const [customer, currencyRow, reserveRows, stockRows] = await Promise.all([
    // One statement: the customer and only the two addresses named (a Prisma `include` would add a second query).
    input.party
      ? prisma.$queryRaw<{ code: string; name: string; active: boolean; addresses: PartyAddress[] }[]>(Prisma.sql`
          SELECT c."code", c."name", c."active",
            COALESCE((SELECT json_agg(json_build_object('id', a."id", 'type', a."type", 'name', a."name", 'taxId', a."tax_id", 'address', a."address",
                'countryCode', a."country_code", 'state', a."state", 'city', a."city", 'postcode', a."postcode"))
              FROM "partner"."customer_address" a
              WHERE a."customer_id" = c."id" AND a."id" IN (${input.party.shippingAddressId}::uuid, ${input.party.invoiceAddressId}::uuid)), '[]'::json) AS "addresses"
          FROM "partner"."customer" c WHERE c."id" = ${input.party.customerId}::uuid`).then((rows) => rows[0] ?? null)
      : Promise.resolve(null),
    prisma.$queryRaw<{ active: boolean | null; company: string | null }[]>(Prisma.sql`
      SELECT (SELECT c."active" FROM "partner"."currency" c WHERE c."code" = ${input.currency}) AS "active",
             (SELECT p."currency_code" FROM "partner"."company_profile" p WHERE p."id" = 1) AS "company"`),
    reserveLineIds.length === 0 ? Promise.resolve([]) : prisma.$queryRaw<(ReserveLineRow & { status: string; deleted: boolean; customer_id: string; currency_code: string; own_pcs: number; own_weight_ct: string })[]>(Prisma.sql`
      SELECT ${LINE_COLUMNS}, r."status", (r."deleted_at" IS NOT NULL) AS "deleted", r."customer_id"::text AS "customer_id", r."currency_code",
        COALESCE(own."pcs", 0)::int AS "own_pcs", COALESCE(own."weight_ct", 0)::text AS "own_weight_ct"
      FROM "partner"."reserve_line" l JOIN "partner"."reserve" r ON r."id" = l."reserve_id"
      LEFT JOIN (SELECT u."reserve_line_id", sum(u."pcs") AS "pcs", sum(u."weight_ct") AS "weight_ct" FROM (
          SELECT c."reserve_line_id", c."pcs", c."weight_ct" FROM "partner"."sale_consumption_line" c WHERE c."sale_id" = ${saleId}::uuid AND c."reserve_line_id" IS NOT NULL
          UNION ALL SELECT o."reserve_line_id", o."pcs", o."weight_ct" FROM "partner"."sale_consumption_own_line" o WHERE o."sale_id" = ${saleId}::uuid) u
        GROUP BY u."reserve_line_id") own ON own."reserve_line_id" = l."id"
      WHERE l."id" = ANY(${reserveLineIds}::uuid[])`),
    memoStockIds.length === 0 ? Promise.resolve([]) : prisma.$queryRaw<{
      id: string; stock_id: string; price_unit: string; stone: string; shape: string; size: string; color: string; clarity: string; cutting: string; quality: string;
      lot: string; location: string; cer_type: string; cer_no: string; memo_receive_id: string; received_doc_no: string; pending_pcs: number; pending_weight_ct: string;
      stone_code: string | null; own_pcs: number; own_weight_ct: string;
    }[]>(Prisma.sql`
      SELECT s."id"::text AS "id", s."stock_id", s."price_unit", s."stone", s."shape", s."size", s."color", s."clarity", s."cutting", s."quality", s."lot", s."location",
        s."cer_type", s."cer_no", s."memo_receive_id"::text AS "memo_receive_id", s."received_doc_no", s."pending_pcs", s."pending_weight_ct"::text AS "pending_weight_ct",
        (SELECT rl."stone_code_snapshot" FROM "partner"."memo_receive_line" rl WHERE rl."id" = s."memo_receive_line_id") AS "stone_code",
        COALESCE((SELECT sum(c."pcs") FROM "partner"."sale_consumption_line" c WHERE c."sale_id" = ${saleId}::uuid AND c."source" = 'STOCK' AND c."memo_stock_id" = s."id"), 0)::int AS "own_pcs",
        COALESCE((SELECT sum(c."weight_ct") FROM "partner"."sale_consumption_line" c WHERE c."sale_id" = ${saleId}::uuid AND c."source" = 'STOCK' AND c."memo_stock_id" = s."id"), 0)::text AS "own_weight_ct"
      FROM "partner"."memo_stock" s WHERE s."id" = ANY(${memoStockIds}::uuid[])`),
  ]);

  let party: { code: string; name: string; shippingText: string; invoiceText: string } | null = null;
  const partyErrors: FieldError[] = [];
  if (input.party) {
    const allowInactive = input.party.keepCustomerId === input.party.customerId;
    if (!customer || (!customer.active && !allowInactive)) {
      partyErrors.push({ path: "customerId", code: "invalid_reference" });
    } else {
      const shipping = customer.addresses.find((address) => address.id === input.party!.shippingAddressId && address.type === "SHIPPING");
      const invoice = customer.addresses.find((address) => address.id === input.party!.invoiceAddressId && address.type === "INVOICE");
      if (!shipping) partyErrors.push({ path: "shippingAddressId", code: "invalid_reference" });
      if (!invoice) partyErrors.push({ path: "invoiceAddressId", code: "invalid_reference" });
      party = { code: customer.code, name: customer.name, shippingText: shipping ? formatAddress(shipping) : "", invoiceText: invoice ? formatAddress(invoice) : "" };
    }
  }

  const reserveLines: PreparedReserveLine[] = reserveRows.map((row) => {
    const ref = toRef(row, row.own_pcs, new Decimal(row.own_weight_ct));
    const live = row.status === "APPROVED" && !row.deleted && (row.memo_stock_id !== null || Boolean(row.lot_key?.startsWith("M")) || row.own_stock_id !== null || Boolean(row.lot_key?.startsWith("O")));
    const open = ref.openPcs > 0 || new Decimal(ref.openWeightCt).greaterThan(0);
    return { ...ref, status: !live ? "UNAVAILABLE" : open ? "OPEN" : "CLOSED", customerId: row.customer_id, currency: row.currency_code };
  });
  const memoStocks: PreparedStock[] = stockRows.map((row) => ({
    memoStockId: row.id, stockId: row.stock_id, priceUnit: row.price_unit === "PER_PCS" ? "PER_PCS" : "PER_CT",
    attrs: { stoneCode: row.stone_code ?? "", stone: row.stone, shape: row.shape, size: row.size, color: row.color, clarity: row.clarity, cutting: row.cutting, quality: row.quality, lot: row.lot, location: row.location, cerType: row.cer_type, cerNo: row.cer_no },
    memoReceive: { id: row.memo_receive_id, docNo: row.received_doc_no },
    pendingPcs: row.pending_pcs + row.own_pcs, pendingWeightCt: new Decimal(row.pending_weight_ct).plus(row.own_weight_ct).toFixed(3), status: "OK",
  }));
  // ADR-0055 D7: From Stock lot lines — the group snapshot and available (pending + what this Sale holds of it), no lock.
  const lotKeys = [...new Set(input.lotKeys ?? [])];
  const [groups, ownLots]: [Map<string, MemoLotGroup>, { lot_key: string; pcs: number; weight_ct: string }[]] = lotKeys.length === 0 ? [new Map(), []] : await Promise.all([
    readMemoLotGroups(prisma, lotKeys),
    saleId ? prisma.$queryRaw<{ lot_key: string; pcs: number; weight_ct: string }[]>(Prisma.sql`
      SELECT s."lot_key", sum(c."pcs")::int AS "pcs", sum(c."weight_ct")::text AS "weight_ct"
      FROM "partner"."sale_consumption_line" c JOIN "partner"."memo_stock" s ON s."id" = c."memo_stock_id"
      WHERE c."sale_id" = ${saleId}::uuid AND c."source" = 'STOCK' AND s."lot_key" = ANY(${lotKeys}::varchar[]) GROUP BY s."lot_key"`) : Promise.resolve([]),
  ]);
  const ownByLot = new Map(ownLots.map((row) => [row.lot_key, row]));
  type PreparedLot = { lotKey: string; status: "OK" | "UNAVAILABLE"; stockCount?: number; priceUnit?: "PER_CT" | "PER_PCS"; attrs?: PreparedStock["attrs"]; pendingPcs?: number; pendingWeightCt?: string };
  const memoLots = lotKeys.flatMap((lotKey): PreparedLot[] => {
    const group = groups.get(lotKey);
    if (!group) return [{ lotKey, status: "UNAVAILABLE" as const }];
    const own = ownByLot.get(lotKey);
    const pendingPcs = group.pendingPcs + (own?.pcs ?? 0);
    const pendingWeight = group.pendingWeight.plus(own?.weight_ct ?? "0");
    return [{
      lotKey, stockCount: group.stockCount, priceUnit: group.priceUnit,
      attrs: { stoneCode: "", stone: group.stone, shape: group.shape, size: group.size, color: group.color, clarity: group.clarity, cutting: group.cutting, quality: group.quality, lot: group.lot, location: group.location, cerType: group.cerType, cerNo: group.cerNo },
      pendingPcs, pendingWeightCt: pendingWeight.toFixed(3),
      status: (pendingPcs > 0 || pendingWeight.gt(0) ? "OK" : "UNAVAILABLE") as "OK" | "UNAVAILABLE",
    }];
  });
  return {
    party, partyErrors,
    currencyActive: currencyRow[0]?.active === true,
    companyCurrency: currencyRow[0]?.company ?? null,
    reserveLines, memoStocks, memoLots,
  };
}
