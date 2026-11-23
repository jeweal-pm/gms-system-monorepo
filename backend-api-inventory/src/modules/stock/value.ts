import { AppError } from "../../platform/errors";
import { Decimal, Prisma, type Client } from "../../platform/db";
import {
  CARD_COLUMNS, CARD_MAX_ENTRIES, CARD_MAX_MOVEMENTS, DIRECTION, ITEM_EXPR, LIST_ORDER, entriesSql, entryFilter, groupedCardsSql, headerGroupSql,
  likePattern, mapCard, mapTxn, transactionStatsColumns, txnOrderBy, w3,
  type CardHeader, type CardListSort, type CardRow, type CardsParams, type Dir, type ListRow, type Txn, type TransactionSort, type TransactionsParams, type TxnRow,
} from "./card";

/**
 * Stock Value read functions (stock-value SA rev 1, ADR-0057; architecture.md "Read paths" and "Valuation rules"). Read-only SQL
 * over the Stock Card read model (`card.ts`: cards, balance, entries, running balance - one definition for both reports) plus the
 * valuation of each card: Price list (quantity-weighted `stock.sale_price`), else Last sale (latest approved `sale_line` of the
 * stone through `sale_line.item_key`), else none; weighted-average cost for Profit/Loss. The report module owns routes, schemas, the
 * guard and the transaction wrapper; this component owns the SQL.
 *
 * Statement budget (independent of the number of rows): list = 1, header = 1, options = 1 (Stock Card's), transactions = 2 (in
 * one REPEATABLE READ transaction). The last-sale probe is a LATERAL inside the same statement and runs only for cards without a
 * Price list. No user text enters SQL: sort / dir are enumerations; `q`, `location`, dates, the card key and the exact price / cost
 * handed from statement A to B are bound parameters.
 */
export type ValueListSort = CardListSort | "price" | "amount" | "profitLoss";
export type ValueTransactionSort = TransactionSort | "profitLoss";
export type ValueCardsParams = Omit<CardsParams, "sort"> & { sort: ValueListSort };
export type ValueTransactionsParams = Omit<TransactionsParams, "sort"> & { sort: ValueTransactionSort };

export type Money = string;
export type UnitPrice = string;
export type ValueUnit = "CT" | "PCS";
export type PriceSource = "PRICE_LIST" | "LAST_SALE" | "NONE";
export type PriceRef = { docType: "sale"; docId: string; docNo: string; docDate: string };
export type Valuation = {
  unit: ValueUnit; price: UnitPrice | null; priceSource: PriceSource; priceSourceLabel: "Price list" | "Last sale" | null; priceRef: PriceRef | null;
};
export type ValueRow = CardRow & Valuation & { amount: Money | null; profitLoss: Money | null };
export type ValueTotals = {
  balancePcs: number; balanceWeightCt: string; amount: Money; profitLoss: Money; pricedCards: number; unpricedCards: number; noCostCards: number;
};
export type ValueCardsPage = { items: ValueRow[]; total: number; page: number; pageSize: number; mode: "CURRENT" | "RANGE"; asOf: string | null; totals: ValueTotals };
export type ValueHeader = CardHeader & Valuation & { currentAmount: Money | null; currentProfitLoss: Money | null };
export type ValueTxn = Txn & { price: UnitPrice | null; priceSource: PriceSource; amount: Money | null; profitLoss: Money | null };
export type ValueTransactionsPage = {
  items: ValueTxn[]; total: number; page: number; pageSize: number;
  opening: { pcs: number; weightCt: string; amount: Money | null; profitLoss: Money | null };
  totals: {
    inPcs: number; inWeightCt: string; outPcs: number; outWeightCt: string; balancePcs: number; balanceWeightCt: string;
    amount: Money | null; profitLoss: Money | null;
  };
  valuation: Valuation;
};

const SOURCE_LABEL: Record<PriceSource, Valuation["priceSourceLabel"]> = { PRICE_LIST: "Price list", LAST_SALE: "Last sale", NONE: null };

// ---------- pure valuation rules (UT-SV-01; PostgreSQL numeric is the engine of record, IT-SV-V1 compares both) ----------

/** 40 significant digits, half away from zero on ties (PostgreSQL `round`), so a weighted average is not rounded twice. */
const D = Decimal.clone({ precision: 40, rounding: Decimal.ROUND_HALF_UP });
type Num = InstanceType<typeof D>;

export type StockForValue = {
  priceUnit: "PER_CT" | "PER_PCS"; salePrice: string; unitCostBase: string; pcs: number; weightCt: string;
  onHandPcs: number; reservedPcs: number; onHandWeightCt: string; reservedWeightCt: string;
};
export type LastSaleLine = { priceUnit: "PER_CT" | "PER_PCS"; unitPrice: string; exchangeRate: string | null; pcs: number; weightCt: string };
export type CardValuation = {
  unit: ValueUnit; price: Num | null; priceSource: PriceSource; avgCost: Num | null;
  /** value of a balance (pcs, weight) at this price / cost */
  value(balance: { pcs: number; weightCt: string }): { amount: string | null; profitLoss: string | null };
};

/** Last sale price in the card unit and the company currency; `null` when the conversion needs a zero quantity. */
export function lastSalePrice(line: LastSaleLine, unit: ValueUnit): Num | null {
  const unitPrice = new D(line.unitPrice);
  const rate = new D(line.exchangeRate ?? 1);
  const cardUnit = unit === "PCS" ? "PER_PCS" : "PER_CT";
  let price: Num | null;
  if (line.priceUnit === cardUnit) price = unitPrice;
  else if (unit === "PCS") price = line.pcs > 0 ? unitPrice.times(line.weightCt).div(line.pcs) : null; // line per ct -> per piece
  else price = new D(line.weightCt).gt(0) ? unitPrice.times(line.pcs).div(line.weightCt) : null; // line per piece -> per ct
  return price === null ? null : price.times(rate);
}

/** Rules 1-6 of architecture.md "Valuation rules" over the ACTIVE stocks of one card. */
export function valuate(stocks: StockForValue[], lastSale: LastSaleLine | null): CardValuation {
  const book = stocks.map((s) => ({ bp: s.onHandPcs + s.reservedPcs, bw: new D(s.onHandWeightCt).plus(s.reservedWeightCt) }));
  const noBalance = book.reduce((sum, b) => sum + b.bp, 0) === 0 && book.reduce((sum, b) => sum.plus(b.bw), new D(0)).isZero();
  const weights = stocks.map((s, i) => ({ s, wp: new D(noBalance ? s.pcs : book[i].bp), ww: noBalance ? new D(s.weightCt) : book[i].bw }));
  const holding = weights.filter((x) => x.wp.gt(0) || x.ww.gt(0));
  const unit: ValueUnit = holding.length > 0 && holding.every((x) => x.s.priceUnit === "PER_PCS") ? "PCS" : "CT";
  const rows = weights.map((x) => ({ ...x, basis: unit === "PCS" ? x.wp : x.ww, own: x.s.priceUnit === "PER_CT" ? x.ww : x.wp }));
  const average = (pick: (s: StockForValue) => string) => {
    const set = rows.filter((x) => new D(pick(x.s)).gt(0) && x.basis.gt(0));
    const basis = set.reduce((sum, x) => sum.plus(x.basis), new D(0));
    return basis.isZero() ? null : set.reduce((sum, x) => sum.plus(new D(pick(x.s)).times(x.own)), new D(0)).div(basis);
  };
  const listPrice = average((s) => s.salePrice);
  const avgCost = average((s) => s.unitCostBase);
  const sale = listPrice === null && lastSale ? lastSalePrice(lastSale, unit) : null;
  const price = listPrice ?? sale;
  const priceSource: PriceSource = listPrice !== null ? "PRICE_LIST" : sale !== null ? "LAST_SALE" : "NONE";
  return {
    unit, price, priceSource, avgCost,
    value(balance) {
      const basis = unit === "PCS" ? new D(balance.pcs) : new D(balance.weightCt);
      const amount = price ? price.times(basis).toDecimalPlaces(2) : null;
      const cost = avgCost ? avgCost.times(basis).toDecimalPlaces(2) : null;
      return { amount: amount ? amount.toFixed(2) : null, profitLoss: amount && cost ? amount.minus(cost).toFixed(2) : null };
    },
  };
}

// ---------- shared SQL ----------

/**
 * CTEs `sa` .. `sd` (per ACTIVE stock: weights, card unit, basis, own quantity) and `v` (one row per card: `item_key`, `is_pcs`,
 * `pl_price` = Price list, `avg_cost`). `stockFilter` is a condition on the stock alias `s` that selects the cards.
 * Window sums see the whole card because the filter selects whole cards (`card_key IN (...)` / `card_key = ...`).
 */
function valuationCtes(stockFilter: Prisma.Sql): Prisma.Sql {
  return Prisma.sql`
  sa AS (
    SELECT s."card_key", s."item_key", s."price_unit", s."sale_price", s."unit_cost_base", s."pcs", s."weight_ct",
      s."on_hand_pcs" + s."reserved_pcs" AS "bp", s."on_hand_weight_ct" + s."reserved_weight_ct" AS "bw",
      sum(s."on_hand_pcs" + s."reserved_pcs") OVER (PARTITION BY s."card_key") AS "cbp",
      sum(s."on_hand_weight_ct" + s."reserved_weight_ct") OVER (PARTITION BY s."card_key") AS "cbw"
    FROM "inventory"."stock" s WHERE s."status" = 'ACTIVE' AND ${stockFilter}
  ),
  sb AS (
    SELECT sa.*, CASE WHEN "cbp" = 0 AND "cbw" = 0 THEN "pcs" ELSE "bp" END AS "wp", CASE WHEN "cbp" = 0 AND "cbw" = 0 THEN "weight_ct" ELSE "bw" END AS "ww" FROM sa
  ),
  sc AS (
    SELECT sb.*, COALESCE(bool_and("price_unit" = 'PER_PCS') FILTER (WHERE "wp" > 0 OR "ww" > 0) OVER (PARTITION BY "card_key"), false) AS "is_pcs" FROM sb
  ),
  sd AS (
    SELECT sc.*, CASE WHEN "is_pcs" THEN "wp"::numeric ELSE "ww" END AS "basis", CASE WHEN "price_unit" = 'PER_CT' THEN "ww" ELSE "wp"::numeric END AS "own" FROM sc
  ),
  v AS (
    SELECT "card_key", min("item_key") AS "item_key", bool_or("is_pcs") AS "is_pcs",
      sum("sale_price" * "own") FILTER (WHERE "sale_price" > 0 AND "basis" > 0) / NULLIF(sum("basis") FILTER (WHERE "sale_price" > 0 AND "basis" > 0), 0) AS "pl_price",
      sum("unit_cost_base" * "own") FILTER (WHERE "unit_cost_base" > 0 AND "basis" > 0) / NULLIF(sum("basis") FILTER (WHERE "unit_cost_base" > 0 AND "basis" > 0), 0) AS "avg_cost"
    FROM sd GROUP BY "card_key"
  )`;
}

/**
 * LATERAL probe of the latest applied Invoice line of the stone (`sale_line_item_key_idx`), converted to the card unit and the
 * company currency. The `pl_price IS NULL` test sits INSIDE the subquery so PostgreSQL skips the probe (one-time filter) for every
 * card that has a Price list. A latest line that cannot be converted (zero quantity) yields a NULL price: the card is NONE.
 */
const LAST_SALE_JOIN = Prisma.sql`
  LEFT JOIN LATERAL (
    SELECT sa2."id" AS "sale_id", sa2."doc_no", to_char(sa2."doc_date", 'YYYY-MM-DD') AS "doc_date",
      CASE WHEN sl."price_unit" = CASE WHEN v."is_pcs" THEN 'PER_PCS' ELSE 'PER_CT' END THEN sl."unit_price"
        WHEN v."is_pcs" THEN CASE WHEN sl."pcs" > 0 THEN sl."unit_price" * sl."weight_ct" / sl."pcs" END
        ELSE CASE WHEN sl."weight_ct" > 0 THEN sl."unit_price" * sl."pcs" / sl."weight_ct" END
      END * COALESCE(sa2."exchange_rate", 1) AS "price"
    FROM "inventory"."sale_line" sl JOIN "inventory"."sale" sa2 ON sa2."id" = sl."sale_id"
    WHERE v."pl_price" IS NULL AND v."item_key" IS NOT NULL AND sl."item_key" = v."item_key"
      AND sa2."status" = 'APPROVED' AND sa2."deleted_at" IS NULL AND NOT sa2."provisional"
    ORDER BY sa2."doc_date" DESC, sa2."created_at" DESC, sl."position" DESC
    LIMIT 1
  ) ls ON true`;

/** Static expression fragments over column names (never user text). */
const raw = (text: string) => Prisma.raw(text);
const basisOf = (isPcs: string, pcs: string, weight: string) => `(CASE WHEN ${isPcs} THEN ${pcs}::numeric ELSE ${weight}::numeric END)`;
const amountOf = (price: string, basis: string) => `(CASE WHEN ${price} IS NOT NULL THEN round(${price} * ${basis}, 2) END)`;
const profitOf = (price: string, cost: string, basis: string) => `(CASE WHEN ${price} IS NOT NULL AND ${cost} IS NOT NULL THEN round(${price} * ${basis}, 2) - round(${cost} * ${basis}, 2) END)`;

/** CTEs `valued` and `calc` over the cards of `g`: price, source, last-sale reference, balance value (list and header). */
const CALC_CTES = Prisma.sql`
  valued AS (
    SELECT g."card_key", g."bal_pcs", g."bal_w", g."newest_id", g."vendor_count", v."is_pcs", v."avg_cost",
      COALESCE(v."pl_price", ls."price") AS "price",
      CASE WHEN v."pl_price" IS NOT NULL THEN 'PRICE_LIST' WHEN ls."price" IS NOT NULL THEN 'LAST_SALE' ELSE 'NONE' END AS "source",
      ls."sale_id", ls."doc_no" AS "ref_no", ls."doc_date" AS "ref_date",
      CASE WHEN v."is_pcs" THEN g."bal_pcs"::numeric ELSE g."bal_w" END AS "basis"
    FROM g JOIN v ON v."card_key" = g."card_key" ${LAST_SALE_JOIN}
  ),
  calc AS (
    SELECT valued.*, ${raw(amountOf('"price"', '"basis"'))} AS "amount", ${raw(profitOf('"price"', '"avg_cost"', '"basis"'))} AS "profit_loss" FROM valued
  )`;

const VALUE_COLUMNS = Prisma.sql`
  g."is_pcs", round(g."price", 4)::text AS "price_t", g."source", g."sale_id", g."ref_no", g."ref_date", g."amount"::text AS "amount_t", g."profit_loss"::text AS "profit_loss_t"`;

type ValueFields = { is_pcs: boolean; price_t: string | null; source: PriceSource; sale_id: string | null; ref_no: string | null; ref_date: string | null; amount_t: string | null; profit_loss_t: string | null };

const m2 = (value: string | null | undefined) => (value === null || value === undefined ? null : new Decimal(value).toFixed(2));
const p4 = (value: string | null | undefined) => (value === null || value === undefined ? null : new Decimal(value).toFixed(4));

function valuationOf(row: ValueFields): Valuation {
  const source: PriceSource = row.price_t === null ? "NONE" : row.source;
  return {
    unit: row.is_pcs ? "PCS" : "CT", price: p4(row.price_t), priceSource: source, priceSourceLabel: SOURCE_LABEL[source],
    priceRef: source === "LAST_SALE" && row.sale_id && row.ref_no !== null && row.ref_date ? { docType: "sale", docId: row.sale_id, docNo: row.ref_no, docDate: row.ref_date } : null,
  };
}

// ---------- list ----------

type ValueListRow = ListRow & ValueFields & {
  t_pcs: number; t_w: string; t_amount: string; t_pl: string; priced: number; unpriced: number; no_cost: number;
};

const VALUE_ORDER = { price: '"price"', amount: '"amount"', profitLoss: '"profit_loss"' } as const;

/** Enumerated ORDER BY: the value sorts put missing values last in both directions; the others are Stock Card's keys. */
export function valueOrderBy(sort: ValueListSort, dir: Dir): Prisma.Sql {
  if (sort === "price" || sort === "amount" || sort === "profitLoss") {
    return Prisma.raw(`g.${VALUE_ORDER[sort]} ${DIRECTION[dir]} NULLS LAST, ${ITEM_EXPR}, n."location", n."lot", g."card_key"`);
  }
  const [first, ...rest] = LIST_ORDER[sort];
  return Prisma.raw(`${first} ${DIRECTION[dir]}, ${rest.join(", ")}`);
}

export async function readValueCards(client: Client, params: ValueCardsParams): Promise<ValueCardsPage> {
  const offset = (params.page - 1) * params.pageSize;
  const { sql: grouped, ranged } = groupedCardsSql(params);
  // One statement: cards + balance (`g`, Stock Card's), valuation of those cards (`v`), probe for cards without a Price list,
  // totals over the whole set (`t`) and the page (lateral). The page alias `g` shadows the CTE only inside the lateral.
  const rows = await client.$queryRaw<ValueListRow[]>(Prisma.sql`
    WITH ${grouped},
    ${valuationCtes(Prisma.sql`s."card_key" IN (SELECT "card_key" FROM g)`)},
    ${CALC_CTES},
    t AS (
      SELECT count(*)::int AS "total", COALESCE(sum("bal_pcs"), 0)::int AS "t_pcs", COALESCE(sum("bal_w"), 0)::text AS "t_w",
        COALESCE(sum("amount"), 0)::text AS "t_amount", COALESCE(sum("profit_loss"), 0)::text AS "t_pl", count("amount")::int AS "priced",
        (count(*) FILTER (WHERE "price" IS NULL))::int AS "unpriced", (count(*) FILTER (WHERE "amount" IS NOT NULL AND "profit_loss" IS NULL))::int AS "no_cost"
      FROM calc
    )
    SELECT t.*, p.*
    FROM t LEFT JOIN LATERAL (
      SELECT ${CARD_COLUMNS}, ${VALUE_COLUMNS}
      FROM calc g JOIN "inventory"."stock" n ON n."id" = g."newest_id"
      ORDER BY ${valueOrderBy(params.sort, params.dir)}
      LIMIT ${params.pageSize} OFFSET ${offset}
    ) p ON true`);
  const head = rows[0];
  const items = rows.filter((row): row is ValueListRow & { card_key: string } => row.card_key !== null).map((row): ValueRow => ({
    ...mapCard(row), ...valuationOf(row), amount: m2(row.amount_t), profitLoss: m2(row.profit_loss_t),
  }));
  return {
    items, total: head?.total ?? 0, page: params.page, pageSize: params.pageSize, mode: ranged ? "RANGE" : "CURRENT", asOf: params.to ?? null,
    totals: {
      balancePcs: head?.t_pcs ?? 0, balanceWeightCt: w3(head?.t_w), amount: m2(head?.t_amount ?? "0")!, profitLoss: m2(head?.t_pl ?? "0")!,
      pricedCards: head?.priced ?? 0, unpricedCards: head?.unpriced ?? 0, noCostCards: head?.no_cost ?? 0,
    },
  };
}

// ---------- header ----------

export async function readValueHeader(client: Client, cardKey: string): Promise<ValueHeader> {
  const [row] = await client.$queryRaw<(ListRow & ValueFields & { card_key: string })[]>(Prisma.sql`
    WITH ${headerGroupSql(cardKey)},
    ${valuationCtes(Prisma.sql`s."card_key" = ${cardKey}`)},
    ${CALC_CTES}
    SELECT ${CARD_COLUMNS}, ${VALUE_COLUMNS}
    FROM calc g JOIN "inventory"."stock" n ON n."id" = g."newest_id"`);
  if (!row) throw new AppError(404, "STOCK_VALUE_NOT_FOUND");
  const { balancePcs, balanceWeightCt, ...rest } = mapCard(row);
  return { ...rest, currentBalancePcs: balancePcs, currentBalanceWeightCt: balanceWeightCt, ...valuationOf(row), currentAmount: m2(row.amount_t), currentProfitLoss: m2(row.profit_loss_t) };
}

// ---------- transactions ----------

type ValueTxnRow = TxnRow & { amount_t: string | null; profit_loss_t: string | null };

/** Detail ORDER BY: Stock Card's keys plus `profitLoss` (missing values last in both directions; ties chronological). */
export function valueTxnOrderBy(sort: ValueTransactionSort, dir: Dir): Prisma.Sql {
  if (sort === "profitLoss") return Prisma.raw(`"profit_loss" ${DIRECTION[dir]} NULLS LAST, "doc_date", "first_at", "document_id", "document_type"`);
  return txnOrderBy(sort, dir);
}

/**
 * Two statements, to run in one REPEATABLE READ READ ONLY transaction by the caller:
 * (A) Stock Card's statement A + the card's valuation (exact price, cost, unit, source, last-sale reference) + the opening and
 *     closing balances valued in SQL (existence, entry counts, totals);
 * (B) the page rows with the TRUE running balance; `amount` / `profit_loss` are computed in SQL from the exact price and cost of (A)
 *     bound as parameters, so the page can be sorted by `profitLoss` and every row keeps its own value.
 */
export async function readValueTransactions(client: Client, cardKey: string, params: ValueTransactionsParams): Promise<ValueTransactionsPage> {
  const pattern = params.q ? likePattern(params.q) : null;
  const start = params.from ?? null;
  const due = params.to ?? null;
  const entries = entriesSql(Prisma.sql`s."card_key" = ${cardKey}`, pattern);
  const filter = entryFilter(start, due, pattern);
  const closing = basisOf('x."is_pcs"', 'x."bal_pcs"', 'x."bal_w"');
  const opening = basisOf('x."is_pcs"', 'x."opening_pcs"', 'x."opening_w"');

  const [stats] = await client.$queryRaw<(ValueFields & {
    card_exists: boolean; entries: number; movements: number; total: number; opening_pcs: number; opening_w: string;
    in_pcs: number; in_w: string; out_pcs: number; out_w: string; bal_pcs: number; bal_w: string;
    price_exact: string | null; cost_exact: string | null; open_amount: string | null; open_pl: string | null;
  })[]>(Prisma.sql`
    WITH ${entries},
    ${valuationCtes(Prisma.sql`s."card_key" = ${cardKey}`)},
    st AS (SELECT ${transactionStatsColumns(cardKey, start, due, filter)}),
    vl AS (
      SELECT v."is_pcs", v."avg_cost", COALESCE(v."pl_price", ls."price") AS "price",
        CASE WHEN v."pl_price" IS NOT NULL THEN 'PRICE_LIST' WHEN ls."price" IS NOT NULL THEN 'LAST_SALE' ELSE 'NONE' END AS "source",
        ls."sale_id", ls."doc_no" AS "ref_no", ls."doc_date" AS "ref_date"
      FROM v ${LAST_SALE_JOIN}
    ),
    x AS (SELECT st.*, vl.* FROM st LEFT JOIN vl ON true)
    SELECT x."card_exists", x."entries", x."movements", x."total", x."opening_pcs", x."opening_w", x."in_pcs", x."in_w", x."out_pcs", x."out_w", x."bal_pcs", x."bal_w",
      COALESCE(x."is_pcs", false) AS "is_pcs", round(x."price", 4)::text AS "price_t", x."price"::text AS "price_exact", x."avg_cost"::text AS "cost_exact", COALESCE(x."source", 'NONE') AS "source",
      x."sale_id", x."ref_no", x."ref_date",
      ${raw(amountOf('x."price"', closing))}::text AS "amount_t", ${raw(profitOf('x."price"', 'x."avg_cost"', closing))}::text AS "profit_loss_t",
      ${raw(amountOf('x."price"', opening))}::text AS "open_amount", ${raw(profitOf('x."price"', 'x."avg_cost"', opening))}::text AS "open_pl"
    FROM x`);
  if (!stats?.card_exists) throw new AppError(404, "STOCK_VALUE_NOT_FOUND");
  if (stats.entries > CARD_MAX_ENTRIES || stats.movements > CARD_MAX_MOVEMENTS) {
    throw new AppError(422, "STOCK_VALUE_TOO_LARGE", { entries: stats.entries, movements: stats.movements, limit: CARD_MAX_ENTRIES });
  }
  const valuation = valuationOf(stats);

  const offset = (params.page - 1) * params.pageSize;
  const rows = stats.total === 0 || offset >= stats.total ? [] : await client.$queryRaw<ValueTxnRow[]>(Prisma.sql`
    WITH ${entries},
    ordered AS (
      SELECT dated.*, sum("pcs") OVER w AS "bal_pcs", sum("weight") OVER w AS "bal_w"
      FROM dated
      WINDOW w AS (ORDER BY "doc_date", "first_at", "document_id", "document_type" ROWS BETWEEN UNBOUNDED PRECEDING AND CURRENT ROW)
    ),
    pv AS (SELECT ${stats.price_exact}::numeric AS "price", ${stats.cost_exact}::numeric AS "cost", ${stats.is_pcs}::boolean AS "is_pcs"),
    valued AS (
      SELECT o.*, ${raw(amountOf('pv."price"', basisOf('pv."is_pcs"', 'o."bal_pcs"', 'o."bal_w"')))} AS "amount",
        ${raw(profitOf('pv."price"', 'pv."cost"', basisOf('pv."is_pcs"', 'o."bal_pcs"', 'o."bal_w"')))} AS "profit_loss"
      FROM ordered o CROSS JOIN pv
    )
    SELECT "document_type", "document_id", "doc_no", to_char("doc_date", 'YYYY-MM-DD') AS "doc_date", "stock_id", "stock_count", "account_id", "account_name",
      "pcs", "weight"::text AS "weight", "bal_pcs"::int AS "bal_pcs", "bal_w"::text AS "bal_w", "amount"::text AS "amount_t", "profit_loss"::text AS "profit_loss_t"
    FROM valued
    WHERE ${filter}
    ORDER BY ${valueTxnOrderBy(params.sort, params.dir)}
    LIMIT ${params.pageSize} OFFSET ${offset}`);

  return {
    items: rows.map((row): ValueTxn => ({ ...mapTxn(row), price: valuation.price, priceSource: valuation.priceSource, amount: m2(row.amount_t), profitLoss: m2(row.profit_loss_t) })),
    total: stats.total, page: params.page, pageSize: params.pageSize,
    opening: { pcs: stats.opening_pcs, weightCt: w3(stats.opening_w), amount: m2(stats.open_amount), profitLoss: m2(stats.open_pl) },
    totals: {
      inPcs: stats.in_pcs, inWeightCt: w3(stats.in_w), outPcs: stats.out_pcs, outWeightCt: w3(stats.out_w), balancePcs: stats.bal_pcs, balanceWeightCt: w3(stats.bal_w),
      amount: m2(stats.amount_t), profitLoss: m2(stats.profit_loss_t),
    },
    valuation,
  };
}
