import { AppError } from "../../platform/errors";
import { Decimal, Prisma, type Client, type Dec } from "../../platform/db";
import { ADJUSTMENT_SOURCED_TYPES, HIDDEN_STOCK_ID_TYPES, MOVEMENT_KINDS, STOCK_SOURCED_TYPES, documentTypeLabel } from "./card-kinds";

/**
 * Stock Card read functions (stock-card SA rev 1, ADR-0056 D1-D8; architecture.md "Read paths" and "Entry computation").
 * Read-only SQL over `inventory.stock`, `stock_movement` and `stock_hold_document`; the report module owns routes, the
 * concurrency guard and the transaction wrapper, this component owns the SQL (the stock component owns these tables).
 *
 * - A card is `stock.card_key` = (stone code, location, lot). Balance = on_hand + reserved (book stock).
 * - Entries are the NET of a document's card-kind movements on the card (zero net = no row), dated by the document date.
 * - Statement budget: list = 1, header = 1, options = 1, transactions = 2 (both in one REPEATABLE READ transaction). No
 *   statement count depends on the number of rows. Sort / direction come from enumerations, never from user text.
 */
export const CARD_PAGE_SIZES = [10, 25, 50] as const;
export const CARD_MAX_PAGE = 200;
export const CARD_MAX_ENTRIES = 5_000;
export const CARD_MAX_MOVEMENTS = 50_000;
export const CARD_OPTION_LOCATIONS_MAX = 500;
export const CARD_KEY = /^SC[0-9a-f]{32}$/;

export type CardListSort = "stoneCode" | "location" | "lot" | "balancePcs" | "balanceWeightCt";
export type TransactionSort = "date" | "docNo" | "stockId" | "account";
export type Dir = "asc" | "desc";

export type CardsParams = { q?: string; location?: string; from?: string; to?: string; sort: CardListSort; dir: Dir; page: number; pageSize: number };
export type TransactionsParams = { q?: string; from?: string; to?: string; sort: TransactionSort; dir: Dir; page: number; pageSize: number };

export type StoneAttrs = { stoneCode: string; stone: string; shape: string; size: string; color: string; clarity: string; cutting: string; quality: string };
export type CardRow = StoneAttrs & { cardKey: string; location: string; lot: string; vendorName: string; vendorCount: number; balancePcs: number; balanceWeightCt: string };
export type CardsPage = { items: CardRow[]; total: number; page: number; pageSize: number; mode: "CURRENT" | "RANGE"; asOf: string | null };
export type CardHeader = StoneAttrs & { cardKey: string; location: string; lot: string; vendorName: string; vendorCount: number; currentBalancePcs: number; currentBalanceWeightCt: string };

export type Txn = {
  id: string; docType: string; docTypeLabel: string; docId: string; docNo: string; docDate: string;
  stockId: string | null; stockIdExtra: number; accountId: string | null; accountName: string;
  inPcs: number | null; inWeightCt: string | null; outPcs: number | null; outWeightCt: string | null;
  balancePcs: number; balanceWeightCt: string;
};
export type TransactionsPage = {
  items: Txn[]; total: number; page: number; pageSize: number;
  opening: { pcs: number; weightCt: string };
  totals: { inPcs: number; inWeightCt: string; outPcs: number; outWeightCt: string; balancePcs: number; balanceWeightCt: string };
};

export const w3 = (value: string | number | null | undefined) => new Decimal(value ?? 0).toFixed(3);

/** `%term%` for ILIKE with `\`, `%` and `_` escaped (the default LIKE escape is the backslash). */
export function likePattern(term: string): string {
  return `%${term.replace(/[\\%_]/g, (char) => `\\${char}`)}%`;
}

// ---------- pure entry math (UT-SC-05) ----------

const sign = (value: Dec) => (value.gt(0) ? 1 : value.lt(0) ? -1 : 0);

/**
 * IN / OUT of one document entry, per dimension (ADR-0056 D5): net > 0 is IN, net < 0 is OUT. A dimension whose net is zero
 * goes to the side of the other dimension, so a weight-only correction still shows `0` pieces on its side.
 */
export function directionOf(pcs: number, weightCt: string) {
  const pcsSign = sign(new Decimal(pcs));
  const weightSign = sign(new Decimal(weightCt));
  const pcsSide = pcsSign || weightSign;
  const weightSide = weightSign || pcsSign;
  const absPcs = Math.abs(pcs);
  const absWeight = new Decimal(weightCt).abs().toFixed(3);
  return {
    inPcs: pcsSide > 0 ? absPcs : null, outPcs: pcsSide < 0 ? absPcs : null,
    inWeightCt: weightSide > 0 ? absWeight : null, outWeightCt: weightSide < 0 ? absWeight : null,
  };
}

// ---------- shared SQL ----------

export const ITEM_EXPR = `COALESCE(NULLIF(n."stone_code", ''), concat_ws(' ', NULLIF(n."stone", ''), NULLIF(n."shape", ''), NULLIF(n."size", ''), NULLIF(n."color", ''), NULLIF(n."clarity", ''), NULLIF(n."cutting", ''), NULLIF(n."quality", '')))`;
/** Enumerated ORDER BY keys; the direction flips the first key only (ties break ascending). */
export const LIST_ORDER: Record<CardListSort, string[]> = {
  stoneCode: [ITEM_EXPR, 'n."location"', 'n."lot"', 'g."card_key"'],
  location: ['n."location"', ITEM_EXPR, 'n."lot"', 'g."card_key"'],
  lot: ['n."lot"', ITEM_EXPR, 'n."location"', 'g."card_key"'],
  balancePcs: ['g."bal_pcs"', ITEM_EXPR, 'n."location"', 'n."lot"', 'g."card_key"'],
  balanceWeightCt: ['g."bal_w"', ITEM_EXPR, 'n."location"', 'n."lot"', 'g."card_key"'],
};
export const DIRECTION: Record<Dir, string> = { asc: "ASC", desc: "DESC" };

function listOrderBy(sort: CardListSort, dir: Dir): Prisma.Sql {
  const [first, ...rest] = LIST_ORDER[sort];
  return Prisma.raw(`${first} ${DIRECTION[dir]}, ${rest.join(", ")}`);
}

export const locationFilter = (location: string | undefined) => (location ? Prisma.sql`AND upper(btrim(s."location")) = upper(btrim(${location}))` : Prisma.empty);
export const stockMatch = (pattern: string) => Prisma.sql`(s."stone_code" ILIKE ${pattern} OR s."stone" ILIKE ${pattern} OR s."lot" ILIKE ${pattern} OR s."vendor_name_snapshot" ILIKE ${pattern} OR s."stock_id" ILIKE ${pattern})`;

export type ListRow = StoneAttrs & {
  total: number; card_key: string | null; location: string; lot: string; vendor_name: string; vendor_count: number; bal_pcs: number; bal_w: string;
};

export function mapCard(row: ListRow & { card_key: string }): CardRow {
  return {
    cardKey: row.card_key, stoneCode: row.stoneCode, stone: row.stone, shape: row.shape, size: row.size, color: row.color, clarity: row.clarity,
    cutting: row.cutting, quality: row.quality, location: row.location, lot: row.lot, vendorName: row.vendor_name, vendorCount: row.vendor_count,
    balancePcs: row.bal_pcs, balanceWeightCt: w3(row.bal_w),
  };
}

export const CARD_COLUMNS = Prisma.sql`
  g."card_key", g."bal_pcs", g."bal_w"::text AS "bal_w", g."vendor_count", n."location", n."lot", n."stone_code" AS "stoneCode", n."stone", n."shape", n."size",
  n."color", n."clarity", n."cutting", n."quality", n."vendor_name_snapshot" AS "vendor_name"`;

/**
 * The CTE chain of document entries (architecture.md "Entry computation" steps 1-3) for the cards selected by `cardFilter`
 * (a condition on stock alias `s`). Produces `ps` (net per stock and document), `doc` (net per card and document, zero net
 * dropped) and `dated` (document date, number and account). `pattern` (nullable) feeds `stock_match`: a visible Stock ID of the
 * document matches the detail search.
 */
export function entriesSql(cardFilter: Prisma.Sql, pattern: string | null): Prisma.Sql {
  return Prisma.sql`
  ps AS (
    SELECT s."card_key", s."id" AS "stock_uuid", s."stock_id", s."status", s."vendor_id", s."vendor_name_snapshot" AS "vendor_name", s."ref_doc_date", s."ref_doc_no",
      s."created_at" AS "stock_created", m."document_type", m."document_id",
      sum(m."pcs_delta")::int AS "pcs", sum(m."weight_delta") AS "weight", min(m."created_at") AS "first_at", count(*)::int AS "n_mv"
    FROM "inventory"."stock" s JOIN "inventory"."stock_movement" m ON m."stock_uuid" = s."id"
    WHERE ${cardFilter} AND m."kind" = ANY(${[...MOVEMENT_KINDS]}::text[])
    GROUP BY s."card_key", s."id", m."document_type", m."document_id"
  ),
  doc AS (
    SELECT p."card_key", p."document_type", p."document_id", sum(p."pcs")::int AS "pcs", sum(p."weight") AS "weight", min(p."first_at") AS "first_at",
      min(p."stock_id") FILTER (WHERE (p."pcs" <> 0 OR p."weight" <> 0) AND p."document_type" <> ALL(${[...HIDDEN_STOCK_ID_TYPES]}::text[])) AS "stock_id",
      (count(*) FILTER (WHERE (p."pcs" <> 0 OR p."weight" <> 0) AND p."document_type" <> ALL(${[...HIDDEN_STOCK_ID_TYPES]}::text[])))::int AS "stock_count",
      COALESCE(bool_or(p."stock_id" ILIKE ${pattern}::text AND (p."pcs" <> 0 OR p."weight" <> 0) AND p."document_type" <> ALL(${[...HIDDEN_STOCK_ID_TYPES]}::text[])), false) AS "stock_match",
      COALESCE(max(p."ref_doc_date") FILTER (WHERE p."status" = 'ACTIVE'), max(p."ref_doc_date")) AS "stock_date",
      COALESCE(max(p."ref_doc_no") FILTER (WHERE p."status" = 'ACTIVE'), max(p."ref_doc_no")) AS "stock_no",
      (array_agg(p."vendor_id" ORDER BY (p."status" = 'ACTIVE') DESC, p."stock_created" DESC, p."stock_uuid" DESC))[1] AS "vendor_id",
      (array_agg(p."vendor_name" ORDER BY (p."status" = 'ACTIVE') DESC, p."stock_created" DESC, p."stock_uuid" DESC))[1] AS "vendor_name"
    FROM ps p
    GROUP BY p."card_key", p."document_type", p."document_id"
    HAVING sum(p."pcs") <> 0 OR sum(p."weight") <> 0
  ),
  dated AS (
    SELECT d."card_key", d."document_type", d."document_id", d."pcs", d."weight", d."first_at", d."stock_id", d."stock_count", d."stock_match",
      CASE WHEN d."document_type" = ANY(${[...STOCK_SOURCED_TYPES]}::text[]) THEN COALESCE(d."stock_date", (d."first_at" AT TIME ZONE 'Asia/Bangkok')::date)
        WHEN d."document_type" = ANY(${[...ADJUSTMENT_SOURCED_TYPES]}::text[]) THEN COALESCE(a."doc_date", (d."first_at" AT TIME ZONE 'Asia/Bangkok')::date)
        ELSE COALESCE(h."doc_date", (d."first_at" AT TIME ZONE 'Asia/Bangkok')::date) END AS "doc_date",
      CASE WHEN d."document_type" = ANY(${[...STOCK_SOURCED_TYPES]}::text[]) THEN COALESCE(d."stock_no", '')
        WHEN d."document_type" = ANY(${[...ADJUSTMENT_SOURCED_TYPES]}::text[]) THEN COALESCE(a."doc_no", '') ELSE COALESCE(h."document_no", '') END AS "doc_no",
      CASE WHEN d."document_type" = ANY(${[...STOCK_SOURCED_TYPES]}::text[]) THEN d."vendor_id"
        WHEN d."document_type" = ANY(${[...ADJUSTMENT_SOURCED_TYPES]}::text[]) THEN NULL ELSE h."party_id" END AS "account_id",
      CASE WHEN d."document_type" = ANY(${[...STOCK_SOURCED_TYPES]}::text[]) THEN COALESCE(d."vendor_name", '')
        WHEN d."document_type" = ANY(${[...ADJUSTMENT_SOURCED_TYPES]}::text[]) THEN COALESCE(a."location", '') ELSE COALESCE(h."party_name", '') END AS "account_name"
    FROM doc d
    LEFT JOIN "inventory"."stock_hold_document" h ON h."document_type" = d."document_type" AND h."document_id" = d."document_id"
    LEFT JOIN "inventory"."stock_adjustment" a ON d."document_type" = ANY(${[...ADJUSTMENT_SOURCED_TYPES]}::text[]) AND a."id" = d."document_id"
  )`;
}

// ---------- list ----------

/**
 * The CTE `g` of the list: one row per card (card_key, bal_pcs, bal_w, newest_id, vendor_count). `CURRENT` (no Start, no Due)
 * groups the ACTIVE stocks' book balance; `RANGE` builds it from the document entries (balance at Due, cards that moved in
 * the range or still hold a balance). Shared by Stock Card and Stock Value so both lists show the same cards and balances.
 */
export function groupedCardsSql(params: Pick<CardsParams, "q" | "location" | "from" | "to">): { sql: Prisma.Sql; ranged: boolean } {
  const pattern = params.q ? likePattern(params.q) : null;
  const ranged = params.from !== undefined || params.to !== undefined;
  const location = locationFilter(params.location);
  const searchHaving = pattern ? Prisma.sql`AND bool_or(${stockMatch(pattern)})` : Prisma.empty;
  const due = params.to ?? null;
  const start = params.from ?? null;

  const grouped = ranged
    ? Prisma.sql`
      c AS (
        SELECT s."card_key" FROM "inventory"."stock" s WHERE s."status" = 'ACTIVE' ${location}
        GROUP BY s."card_key" ${pattern ? Prisma.sql`HAVING bool_or(${stockMatch(pattern)})` : Prisma.empty}
      ),
      ${entriesSql(Prisma.sql`s."card_key" IN (SELECT "card_key" FROM c)`, null)},
      agg AS (
        SELECT "card_key",
          COALESCE(sum("pcs") FILTER (WHERE (${due}::date IS NULL OR "doc_date" <= ${due}::date)), 0)::int AS "bal_pcs",
          COALESCE(sum("weight") FILTER (WHERE (${due}::date IS NULL OR "doc_date" <= ${due}::date)), 0) AS "bal_w",
          COALESCE(bool_or((${start}::date IS NULL OR "doc_date" >= ${start}::date) AND (${due}::date IS NULL OR "doc_date" <= ${due}::date)), false) AS "moved"
        FROM dated GROUP BY "card_key"
      ),
      nv AS (
        SELECT s."card_key", (array_agg(s."id" ORDER BY s."created_at" DESC, s."id" DESC))[1] AS "newest_id", count(DISTINCT s."vendor_id")::int AS "vendor_count"
        FROM "inventory"."stock" s WHERE s."status" = 'ACTIVE' AND s."card_key" IN (SELECT "card_key" FROM agg) GROUP BY s."card_key"
      ),
      g AS (
        SELECT a."card_key", a."bal_pcs", a."bal_w", nv."newest_id", nv."vendor_count"
        FROM agg a JOIN nv ON nv."card_key" = a."card_key"
        WHERE a."moved" OR a."bal_pcs" <> 0 OR a."bal_w" <> 0
      )`
    : Prisma.sql`
      g AS (
        SELECT s."card_key", sum(s."on_hand_pcs" + s."reserved_pcs")::int AS "bal_pcs", sum(s."on_hand_weight_ct" + s."reserved_weight_ct") AS "bal_w",
          (array_agg(s."id" ORDER BY s."created_at" DESC, s."id" DESC))[1] AS "newest_id", count(DISTINCT s."vendor_id")::int AS "vendor_count"
        FROM "inventory"."stock" s WHERE s."status" = 'ACTIVE' ${location}
        GROUP BY s."card_key"
        HAVING (sum(s."on_hand_pcs" + s."reserved_pcs") <> 0 OR sum(s."on_hand_weight_ct" + s."reserved_weight_ct") <> 0) ${searchHaving}
      )`;

  return { sql: grouped, ranged };
}

export async function readCards(client: Client, params: CardsParams): Promise<CardsPage> {
  const offset = (params.page - 1) * params.pageSize;
  const { sql: grouped, ranged } = groupedCardsSql(params);

  // One statement: the total comes from the same CTE (count over g), the page from a lateral subselect, so an out-of-range
  // page still reports the exact total.
  const rows = await client.$queryRaw<ListRow[]>(Prisma.sql`
    WITH ${grouped},
    t AS (SELECT count(*)::int AS "total" FROM g)
    SELECT t."total", p.*
    FROM t LEFT JOIN LATERAL (
      SELECT ${CARD_COLUMNS}
      FROM g JOIN "inventory"."stock" n ON n."id" = g."newest_id"
      ORDER BY ${listOrderBy(params.sort, params.dir)}
      LIMIT ${params.pageSize} OFFSET ${offset}
    ) p ON true`);
  const total = rows[0]?.total ?? 0;
  return {
    items: rows.filter((row): row is ListRow & { card_key: string } => row.card_key !== null).map(mapCard),
    total, page: params.page, pageSize: params.pageSize, mode: ranged ? "RANGE" : "CURRENT", asOf: params.to ?? null,
  };
}

export async function readOptions(client: Client): Promise<{ locations: string[] }> {
  const rows = await client.$queryRaw<{ location: string }[]>`
    SELECT DISTINCT "location" FROM "inventory"."stock" WHERE "status" = 'ACTIVE' ORDER BY 1 LIMIT ${CARD_OPTION_LOCATIONS_MAX}`;
  return { locations: rows.map((row) => row.location) };
}

// ---------- header ----------

/** The CTE `g` of one card's header (current book balance of its ACTIVE stocks); shared with Stock Value. */
export const headerGroupSql = (cardKey: string) => Prisma.sql`
  g AS (
    SELECT s."card_key", sum(s."on_hand_pcs" + s."reserved_pcs")::int AS "bal_pcs", sum(s."on_hand_weight_ct" + s."reserved_weight_ct") AS "bal_w",
      (array_agg(s."id" ORDER BY s."created_at" DESC, s."id" DESC))[1] AS "newest_id", count(DISTINCT s."vendor_id")::int AS "vendor_count"
    FROM "inventory"."stock" s WHERE s."card_key" = ${cardKey} AND s."status" = 'ACTIVE' GROUP BY s."card_key"
  )`;

export async function readHeader(client: Client, cardKey: string): Promise<CardHeader> {
  const [row] = await client.$queryRaw<(ListRow & { card_key: string })[]>(Prisma.sql`
    WITH ${headerGroupSql(cardKey)}
    SELECT ${CARD_COLUMNS} FROM g JOIN "inventory"."stock" n ON n."id" = g."newest_id"`);
  if (!row) throw new AppError(404, "STOCK_CARD_NOT_FOUND");
  const card = mapCard(row);
  const { balancePcs, balanceWeightCt, ...rest } = card;
  return { ...rest, currentBalancePcs: balancePcs, currentBalanceWeightCt: balanceWeightCt };
}

// ---------- transactions ----------

export type TxnRow = {
  document_type: string; document_id: string; doc_no: string; doc_date: string; stock_id: string | null; stock_count: number; account_id: string | null; account_name: string;
  pcs: number; weight: string; bal_pcs: number; bal_w: string;
};

export function mapTxn(row: TxnRow): Txn {
  return {
    id: `${row.document_type}:${row.document_id}`, docType: row.document_type, docTypeLabel: documentTypeLabel(row.document_type), docId: row.document_id,
    docNo: row.doc_no, docDate: row.doc_date, stockId: row.stock_id, stockIdExtra: Math.max(row.stock_count - 1, 0), accountId: row.account_id, accountName: row.account_name,
    ...directionOf(row.pcs, row.weight), balancePcs: row.bal_pcs, balanceWeightCt: w3(row.bal_w),
  };
}

/** Enumerated ORDER BY keys of the detail; `date` flips every key (a reversed chronological order), the others the first key. */
const TXN_ORDER: Record<TransactionSort, { keys: string[]; flipAll: boolean }> = {
  date: { keys: ['"doc_date"', '"first_at"', '"document_id"', '"document_type"'], flipAll: true },
  docNo: { keys: ['"doc_no"', '"doc_date"', '"first_at"', '"document_id"', '"document_type"'], flipAll: false },
  stockId: { keys: ['"stock_id" NULLS LAST', '"doc_date"', '"first_at"', '"document_id"', '"document_type"'], flipAll: false },
  account: { keys: ['"account_name"', '"doc_date"', '"first_at"', '"document_id"', '"document_type"'], flipAll: false },
};

export function txnOrderBy(sort: TransactionSort, dir: Dir): Prisma.Sql {
  const { keys, flipAll } = TXN_ORDER[sort];
  const direction = DIRECTION[dir];
  return Prisma.raw(keys.map((key, index) => (index === 0 || flipAll ? (key.endsWith(" NULLS LAST") ? `${key.slice(0, -" NULLS LAST".length)} ${direction} NULLS LAST` : `${key} ${direction}`) : key)).join(", "));
}

/** Entries filter F (date range and search); null parameters switch a clause off. */
export function entryFilter(start: string | null, due: string | null, pattern: string | null): Prisma.Sql {
  return Prisma.sql`(${start}::date IS NULL OR "doc_date" >= ${start}::date) AND (${due}::date IS NULL OR "doc_date" <= ${due}::date)
    AND (${pattern}::text IS NULL OR "stock_match" OR "doc_no" ILIKE ${pattern}::text OR "account_name" ILIKE ${pattern}::text)`;
}

/** Columns of statement A of the detail (needs the `ps` / `dated` CTEs of `entriesSql`); shared with Stock Value, which adds its valuation. */
export function transactionStatsColumns(cardKey: string, start: string | null, due: string | null, filter: Prisma.Sql): Prisma.Sql {
  return Prisma.sql`EXISTS (SELECT 1 FROM "inventory"."stock" WHERE "card_key" = ${cardKey} AND "status" = 'ACTIVE') AS "card_exists",
      (SELECT count(*)::int FROM dated) AS "entries",
      (SELECT COALESCE(sum("n_mv"), 0)::int FROM ps) AS "movements",
      (SELECT count(*)::int FROM dated WHERE ${filter}) AS "total",
      (SELECT COALESCE(sum("pcs"), 0)::int FROM dated WHERE ${start}::date IS NOT NULL AND "doc_date" < ${start}::date) AS "opening_pcs",
      (SELECT COALESCE(sum("weight"), 0)::text FROM dated WHERE ${start}::date IS NOT NULL AND "doc_date" < ${start}::date) AS "opening_w",
      (SELECT COALESCE(sum(GREATEST("pcs", 0)), 0)::int FROM dated WHERE ${filter}) AS "in_pcs",
      (SELECT COALESCE(sum(GREATEST("weight", 0)), 0)::text FROM dated WHERE ${filter}) AS "in_w",
      (SELECT COALESCE(sum(GREATEST(-"pcs", 0)), 0)::int FROM dated WHERE ${filter}) AS "out_pcs",
      (SELECT COALESCE(sum(GREATEST(-"weight", 0)), 0)::text FROM dated WHERE ${filter}) AS "out_w",
      (SELECT COALESCE(sum("pcs"), 0)::int FROM dated WHERE (${due}::date IS NULL OR "doc_date" <= ${due}::date)) AS "bal_pcs",
      (SELECT COALESCE(sum("weight"), 0)::text FROM dated WHERE (${due}::date IS NULL OR "doc_date" <= ${due}::date)) AS "bal_w"`;
}

/**
 * Two statements, to run in one REPEATABLE READ READ ONLY transaction by the caller:
 * (A) existence, entry / movement counts (<= 5,000 / 50,000, else STOCK_CARD_TOO_LARGE), opening, totals, closing balance, total rows;
 * (B) the page rows with the TRUE running balance (window over every entry of the card, computed before q, from, to, sort and page).
 */
export async function readTransactions(client: Client, cardKey: string, params: TransactionsParams): Promise<TransactionsPage> {
  const pattern = params.q ? likePattern(params.q) : null;
  const start = params.from ?? null;
  const due = params.to ?? null;
  const entries = entriesSql(Prisma.sql`s."card_key" = ${cardKey}`, pattern);
  const filter = entryFilter(start, due, pattern);

  const [stats] = await client.$queryRaw<{
    card_exists: boolean; entries: number; movements: number; total: number; opening_pcs: number; opening_w: string;
    in_pcs: number; in_w: string; out_pcs: number; out_w: string; bal_pcs: number; bal_w: string;
  }[]>(Prisma.sql`
    WITH ${entries}
    SELECT ${transactionStatsColumns(cardKey, start, due, filter)}`);
  if (!stats?.card_exists) throw new AppError(404, "STOCK_CARD_NOT_FOUND");
  if (stats.entries > CARD_MAX_ENTRIES || stats.movements > CARD_MAX_MOVEMENTS) {
    throw new AppError(422, "STOCK_CARD_TOO_LARGE", { entries: stats.entries, movements: stats.movements, limit: CARD_MAX_ENTRIES });
  }

  const offset = (params.page - 1) * params.pageSize;
  const rows = stats.total === 0 || offset >= stats.total ? [] : await client.$queryRaw<TxnRow[]>(Prisma.sql`
    WITH ${entries},
    ordered AS (
      SELECT dated.*, sum("pcs") OVER w AS "bal_pcs", sum("weight") OVER w AS "bal_w"
      FROM dated
      WINDOW w AS (ORDER BY "doc_date", "first_at", "document_id", "document_type" ROWS BETWEEN UNBOUNDED PRECEDING AND CURRENT ROW)
    )
    SELECT "document_type", "document_id", "doc_no", to_char("doc_date", 'YYYY-MM-DD') AS "doc_date", "stock_id", "stock_count", "account_id", "account_name",
      "pcs", "weight"::text AS "weight", "bal_pcs"::int AS "bal_pcs", "bal_w"::text AS "bal_w"
    FROM ordered
    WHERE ${filter}
    ORDER BY ${txnOrderBy(params.sort, params.dir)}
    LIMIT ${params.pageSize} OFFSET ${offset}`);

  return {
    items: rows.map(mapTxn),
    total: stats.total, page: params.page, pageSize: params.pageSize,
    opening: { pcs: stats.opening_pcs, weightCt: w3(stats.opening_w) },
    totals: { inPcs: stats.in_pcs, inWeightCt: w3(stats.in_w), outPcs: stats.out_pcs, outWeightCt: w3(stats.out_w), balancePcs: stats.bal_pcs, balanceWeightCt: w3(stats.bal_w) },
  };
}
