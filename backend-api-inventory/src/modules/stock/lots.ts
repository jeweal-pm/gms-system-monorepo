import { AppError, validationError } from "../../platform/errors";
import type { Client } from "../../platform/db";
import { Prisma } from "../../platform/db";

/**
 * Own stock lot reads for api-master (lot-based-stock SA rev 1 / ADR-0055 D3/D7, api-contract "Inventory internal").
 * A lot group = the open stocks (ACTIVE, on-hand > 0) sharing the generated `stock.lot_key` (every item detail incl.
 * stone code, cost unit price, Stock Price and Sale Price; OS+id for a group of one). Cost and prices never leave
 * inventory here, and the Stock ID never reaches the browser (master keeps it server-side, owner Q-LOT-10).
 * - `lotsAvailablePage`: one row per group for `fromStock.lots`; ONE statement (matching keys + aggregate in CTEs) on
 *   `stock_lot_open_idx`. A group is listed when ANY of its open stocks matches q / dates; quantities always cover the
 *   whole group. Order (newest ref date DESC, lot_key DESC), keyset cursor `base64url(YYYY-MM-DD|lotKey)`.
 * - `lotCandidates`: the open stocks of ≤ 200 groups in FIFO order (ref date ASC, Stock ID ASC), no lock (master
 *   allocates, then the unchanged hold PUT re-checks under inventory's lock). > 500 stocks in one group → 422
 *   STOCK_LOT_TOO_LARGE. One statement.
 */
export const LOT_KEY = /^(ML|OL)[0-9a-f]{32}$|^(MS|OS)[0-9a-f-]{36}$/;
export const OWN_LOT_KEY = /^OL[0-9a-f]{32}$|^OS[0-9a-f-]{36}$/;
export const LOT_GROUP_MAX = 500;
export const LOT_KEYS_MAX = 200;
/** ≤ 2,000 candidate stocks per call (the per-apply bound, D6), so the response stays ≤ ~300 KiB. */
export const LOT_CANDIDATES_MAX = 2_000;

const escapeLike = (value: string) => value.replace(/[\\%_]/g, (character) => `\\${character}`);

/** Opaque keyset cursor shared with master: base64url(`YYYY-MM-DD|lotKey`); invalid → 422 VALIDATION_ERROR `cursor invalid` (inventory envelope). */
export function decodeLotCursor(value: string): { date: string; lotKey: string } {
  const invalid = () => validationError([{ path: "cursor", code: "invalid" }]);
  if (!/^[A-Za-z0-9_-]{1,200}$/.test(value)) throw invalid();
  const match = /^(\d{4}-\d{2}-\d{2})\|(.+)$/.exec(Buffer.from(value, "base64url").toString("utf8"));
  // INV-20261121-002 H3: a calendar date (Date.parse accepts 2026-02-31, PostgreSQL's ::date does not).
  if (!match || Number.isNaN(Date.parse(match[1])) || new Date(`${match[1]}T00:00:00Z`).toISOString().slice(0, 10) !== match[1] || !LOT_KEY.test(match[2])) throw invalid();
  return { date: match[1], lotKey: match[2] };
}
export function encodeLotCursor(date: string, lotKey: string): string {
  return Buffer.from(`${date}|${lotKey}`, "utf8").toString("base64url");
}

export type LotFilters = { q?: string; from?: string; to?: string; location?: string; cursor?: string; limit: number };

type GroupRow = {
  lot_key: string; lot: string; stone_code: string; stone: string; shape: string; size: string; color: string; clarity: string; cutting: string;
  quality: string; cer_type: string; cer_no: string; location: string; item_note: string; price_unit: string; currency_code: string;
  load_id: string; ref_doc_no: string; ref_doc_date: string; ref_count: number; on_hand_pcs: number; on_hand_weight_ct: string; d: string; sale_price: string;
};

/** api-contract `LotGroupRow` of our stock: bucket = on-hand, no price / cost / vendor (master merges vendor-free rows). */
export function lotGroupRow(row: GroupRow) {
  const merged = row.lot_key.startsWith("OL");
  return {
    lotKey: row.lot_key,
    source: "OWN_STOCK" as const,
    lot: row.lot,
    merged,
    stoneCode: row.stone_code, stone: row.stone, shape: row.shape, size: row.size, color: row.color, clarity: row.clarity,
    cutting: row.cutting, quality: row.quality, cerType: row.cer_type, cerNo: merged ? "" : row.cer_no,
    location: row.location,
    itemNote: row.item_note,
    ref: { type: "LOAD" as const, id: row.load_id, docNo: row.ref_doc_no, docDate: row.ref_doc_date },
    refCount: Number(row.ref_count),
    pendingPcs: Number(row.on_hand_pcs),
    pendingWeightCt: new Prisma.Decimal(row.on_hand_weight_ct).toFixed(3),
    priceUnit: row.price_unit as "PER_CT" | "PER_PCS",
    unitPrice: null, netUnitPrice: null, amount: null,
    currency: null, vendor: null,
    // ADR-0058 D7: the lot's Sale Price (company currency per price unit) so Sale From Stock can prefill its editable unit price; no cost, no vendor.
    salePrice: new Prisma.Decimal(row.sale_price).toFixed(2),
  };
}
export type OwnLotGroupRow = ReturnType<typeof lotGroupRow>;

const OPEN = Prisma.sql`s."status" = 'ACTIVE' AND (s."on_hand_pcs" > 0 OR s."on_hand_weight_ct" > 0)`;

export async function lotsAvailablePage(client: Client, input: LotFilters): Promise<OwnLotGroupRow[]> {
  const where: Prisma.Sql[] = [OPEN];
  // Location is part of the key (uniform per group), so it filters rows.
  if (input.location) where.push(Prisma.sql`lower(s."location") = lower(${input.location})`);
  const having: Prisma.Sql[] = [];
  if (input.q) {
    // Q-LOT-10a: Lot, Stone, Stone Code, Cer No. and source doc no.; never the Stock ID.
    const pattern = `%${escapeLike(input.q)}%`;
    having.push(Prisma.sql`bool_or(s."lot" ILIKE ${pattern} OR s."stone" ILIKE ${pattern} OR s."stone_code" ILIKE ${pattern} OR s."cer_no" ILIKE ${pattern} OR s."ref_doc_no" ILIKE ${pattern})`);
  }
  if (input.from || input.to) {
    const from = input.from ? Prisma.sql`s."ref_doc_date" >= ${input.from}::date` : Prisma.sql`TRUE`;
    const to = input.to ? Prisma.sql`s."ref_doc_date" <= ${input.to}::date` : Prisma.sql`TRUE`;
    having.push(Prisma.sql`bool_or(${from} AND ${to})`);
  }
  if (input.cursor) {
    const after = decodeLotCursor(input.cursor);
    having.push(Prisma.sql`(max(s."ref_doc_date"), s."lot_key") < (${after.date}::date, ${after.lotKey}::varchar)`);
  }
  const rows = await client.$queryRaw<GroupRow[]>(Prisma.sql`
    WITH k AS (
      SELECT s."lot_key", max(s."ref_doc_date") AS d FROM "inventory"."stock" s
      WHERE ${Prisma.join(where, " AND ")}
      GROUP BY s."lot_key"
      ${having.length > 0 ? Prisma.sql`HAVING ${Prisma.join(having, " AND ")}` : Prisma.empty}
      ORDER BY d DESC, s."lot_key" DESC
      LIMIT ${input.limit}
    ), g AS (
      SELECT s."lot_key", sum(s."on_hand_pcs") AS on_hand_pcs, sum(s."on_hand_weight_ct") AS on_hand_weight_ct, count(DISTINCT s."load_id") AS ref_count
      FROM "inventory"."stock" s WHERE s."lot_key" IN (SELECT "lot_key" FROM k) AND ${OPEN} GROUP BY s."lot_key"
    ), n AS (
      SELECT DISTINCT ON (s."lot_key") s."lot_key", s."lot", s."stone_code", s."stone", s."shape", s."size", s."color", s."clarity", s."cutting", s."quality",
        s."cer_type", s."cer_no", s."location", s."item_note", s."price_unit", s."sale_price"::text AS "sale_price", s."currency_code", s."load_id", s."ref_doc_no", to_char(s."ref_doc_date", 'YYYY-MM-DD') AS "ref_doc_date"
      FROM "inventory"."stock" s WHERE s."lot_key" IN (SELECT "lot_key" FROM k) AND ${OPEN}
      ORDER BY s."lot_key", s."ref_doc_date" DESC, s."stock_id" DESC
    )
    SELECT n.*, g."ref_count"::int AS "ref_count", g."on_hand_pcs"::int AS "on_hand_pcs", g."on_hand_weight_ct"::text AS "on_hand_weight_ct", to_char(k.d, 'YYYY-MM-DD') AS d
    FROM k JOIN g ON g."lot_key" = k."lot_key" JOIN n ON n."lot_key" = k."lot_key"
    ORDER BY k.d DESC, k."lot_key" DESC`);
  return rows.map(lotGroupRow);
}

type CandidateRow = { lot_key: string; id: string; stock_id: string; ref_doc_date: string; on_hand_pcs: number; on_hand_weight_ct: string; load_syncing: boolean; n: number };

/** FIFO candidates of ≤ 200 own lots (no lock); a group above 500 stocks → 422 STOCK_LOT_TOO_LARGE {lotKey, limit}. */
export async function lotCandidates(client: Client, lotKeys: readonly string[]) {
  if (lotKeys.length === 0) return { groups: [] };
  const rows = await client.$queryRaw<CandidateRow[]>(Prisma.sql`
    SELECT x.* FROM (
      SELECT s."lot_key", s."id", s."stock_id", to_char(s."ref_doc_date", 'YYYY-MM-DD') AS "ref_doc_date", s."on_hand_pcs", s."on_hand_weight_ct"::text AS "on_hand_weight_ct",
        (l."sync_state" = 'SYNCING') AS "load_syncing",
        row_number() OVER (PARTITION BY s."lot_key" ORDER BY s."ref_doc_date", s."stock_id")::int AS n
      FROM "inventory"."stock" s JOIN "inventory"."load_to_stock" l ON l."id" = s."load_id"
      WHERE s."lot_key" = ANY(${[...lotKeys]}::varchar[]) AND ${OPEN}
    ) x WHERE x.n <= ${LOT_GROUP_MAX + 1}
    ORDER BY x."lot_key", x.n
    LIMIT ${LOT_CANDIDATES_MAX + 1}`);
  const tooLarge = rows.find((row) => row.n > LOT_GROUP_MAX);
  if (tooLarge) throw new AppError(422, "STOCK_LOT_TOO_LARGE", { lotKey: tooLarge.lot_key, limit: LOT_GROUP_MAX });
  if (rows.length > LOT_CANDIDATES_MAX) throw new AppError(422, "STOCK_LOT_TOO_LARGE", { limit: LOT_CANDIDATES_MAX });
  const groups = new Map<string, { stockUuid: string; stockId: string; refDocDate: string; onHandPcs: number; onHandWeightCt: string; loadSyncing: boolean }[]>();
  for (const key of lotKeys) groups.set(key, []);
  for (const row of rows) {
    groups.get(row.lot_key)?.push({
      stockUuid: row.id, stockId: row.stock_id, refDocDate: row.ref_doc_date, onHandPcs: row.on_hand_pcs,
      onHandWeightCt: new Prisma.Decimal(row.on_hand_weight_ct).toFixed(3), loadSyncing: row.load_syncing,
    });
  }
  return { groups: [...groups].map(([lotKey, stocks]) => ({ lotKey, rows: stocks })) };
}
