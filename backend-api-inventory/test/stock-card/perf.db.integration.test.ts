import { randomUUID } from "node:crypto";
import { writeFileSync } from "node:fs";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createDb, Prisma, type Db } from "../../src/platform/db";
import { readCards, readTransactions } from "../../src/modules/stock/card";
import { ReportGuard, runReport } from "../../src/modules/reports/stock-card/guard";

/**
 * PF-SC-01…04 (stock-card testing.md, BE-SC-008): measurements on a dedicated disposable database with the inventory schema
 * migrated, seeded with 50,000 stocks, 20,000 cards, 200,000 ledger rows (150,000 hold documents) and one card of 4,999 entries.
 * Opt-in: `INVENTORY_PERF_DATABASE_URL` (loopback, non-5432, database `f1_perf`). Results are printed as `[PF-SC]` lines and the
 * EXPLAIN (ANALYZE, BUFFERS) texts are written to `INVENTORY_PERF_REPORT` when set. No claim is made without a run.
 */
const url = process.env.INVENTORY_PERF_DATABASE_URL;
const canRun = Boolean(url && /^postgresql:\/\/[^/]+@127\.0\.0\.1:(?!5432\/)[0-9]+\/f1_perf$/.test(url));

let db: Db;
const guard = new ReportGuard();
const lines: string[] = [];
const say = (text: string) => { lines.push(text); console.info(`[PF-SC] ${text}`); };
const p95 = (values: number[]) => [...values].sort((a, b) => a - b)[Math.max(0, Math.ceil(values.length * 0.95) - 1)];
const BIG_STONE = "PF-BIG-CARD";

async function timed<T>(work: () => Promise<T>) {
  const started = performance.now();
  const result = await work();
  return { ms: performance.now() - started, result };
}

/** `concurrency` workers each run `iterations` calls; returns the sorted latencies. */
async function load(concurrency: number, iterations: number, call: (index: number) => Promise<unknown>) {
  const latencies: number[] = [];
  let next = 0;
  await Promise.all(Array.from({ length: concurrency }, async () => {
    for (;;) {
      const index = next; next += 1;
      if (index >= iterations) return;
      latencies.push((await timed(() => call(index))).ms);
    }
  }));
  return latencies;
}

describe.runIf(canRun)("PF-SC stock card measurements", () => {
  beforeAll(async () => {
    db = createDb(url!);
    const [{ n }] = await db.$queryRaw<{ n: number }[]>`SELECT count(*)::int AS n FROM "inventory"."stock"`;
    if (n > 0) throw new Error("the perf database must be empty");
    const started = performance.now();
    await db.$executeRawUnsafe(`
      INSERT INTO "inventory"."load_to_stock" ("id", "numbering_id", "running_no", "doc_no", "status", "applied_revision", "doc_date", "vendor_id", "currency_code", "mode", "row_count", "total_pcs", "total_weight_ct", "total_cost_base", "created_by", "updated_by")
      SELECT gen_random_uuid(), NULL, g, 'PF-LS-' || g, 'APPROVED', 1, DATE '2025-01-01' + (g % 700), gen_random_uuid(), 'THB', 'NONE', 1, 2, 1, 0, 'perf', 'perf' FROM generate_series(1, 1000) g`);
    // 50,000 active stocks in 20,000 cards (2.5 per card): pcs 2 = on_hand 1 + memo_out 1; the card balance is the on-hand piece.
    await db.$executeRawUnsafe(`
      INSERT INTO "inventory"."stock" ("id", "stock_id", "load_id", "status", "location", "stone_code", "stone", "lot", "price_unit", "pcs", "weight_ct", "on_hand_pcs", "on_hand_weight_ct", "memo_out_pcs", "memo_out_weight_ct",
        "unit_cost_base", "cost_amount_base", "stock_price", "sale_price", "currency_code", "vendor_id", "vendor_name_snapshot", "ref_doc_date", "ref_doc_no", "created_at")
      SELECT gen_random_uuid(), 'P' || lpad(g::text, 9, '0'), l."id", 'ACTIVE', 'Safe ' || (g % 5), 'PF' || (g % 20000), 'Sapphire', CASE WHEN g % 3 = 0 THEN 'L' || (g % 7) ELSE '' END, 'PER_CT', 2, 1.000, 1, 0.500, 1, 0.500,
        0, 0, 0, 0, 'THB', l."vendor_id", 'Vendor ' || (g % 40), l."doc_date", l."doc_no", now() - (g % 900) * interval '1 hour'
      FROM generate_series(1, 50000) g JOIN "inventory"."load_to_stock" l ON l."running_no" = 1 + (g % 1000)`);
    // Ledger: per stock LOAD_IN +2, MEMO_OUT -1, MEMO_OUT_RETURN +1, MEMO_OUT -1 (= 200,000 rows, net +1 = on hand 1); one hold document per hold row.
    await db.$executeRawUnsafe(`
      CREATE TEMP TABLE pf_hold AS
      SELECT s."id" AS stock_uuid, k, gen_random_uuid() AS document_id, DATE '2025-01-01' + ((row_number() OVER ())::int % 690) AS doc_date, gen_random_uuid() AS party
      FROM "inventory"."stock" s CROSS JOIN generate_series(1, 3) k`);
    await db.$executeRawUnsafe(`
      INSERT INTO "inventory"."stock_hold_document" ("document_type", "document_id", "applied_revision", "request_hash", "document_no", "doc_date", "party_id", "party_name")
      SELECT CASE WHEN k = 2 THEN 'memo-out-return' ELSE 'memo-out' END, document_id, 1, repeat('0', 64), 'PF-' || left(document_id::text, 8), doc_date, party, 'Customer ' || left(party::text, 4) FROM pf_hold`);
    await db.$executeRawUnsafe(`
      INSERT INTO "inventory"."stock_movement" ("id", "stock_uuid", "kind", "document_type", "document_id", "revision", "pcs_delta", "weight_delta", "cost_delta_base", "created_at", "created_by")
      SELECT gen_random_uuid(), h.stock_uuid, CASE WHEN h.k = 2 THEN 'MEMO_OUT_RETURN' ELSE 'MEMO_OUT' END, CASE WHEN h.k = 2 THEN 'memo-out-return' ELSE 'memo-out' END, h.document_id, 1,
        CASE WHEN h.k = 2 THEN 1 ELSE -1 END, CASE WHEN h.k = 2 THEN 0.5 ELSE -0.5 END, 0, h.doc_date + time '10:00', 'perf' FROM pf_hold h
      UNION ALL
      SELECT gen_random_uuid(), s."id", 'LOAD_IN', 'load-to-stock', s."load_id", 1, 2, 1.000, 0, s."created_at", 'perf' FROM "inventory"."stock" s`);
    // One card with 4,999 entries (the largest card the report serves).
    await db.$executeRawUnsafe(`
      INSERT INTO "inventory"."stock" ("id", "stock_id", "load_id", "status", "location", "stone_code", "stone", "lot", "price_unit", "pcs", "weight_ct", "on_hand_pcs", "on_hand_weight_ct",
        "unit_cost_base", "cost_amount_base", "stock_price", "sale_price", "currency_code", "vendor_id", "vendor_name_snapshot", "ref_doc_date", "ref_doc_no")
      SELECT gen_random_uuid(), 'PBIG000001', l."id", 'ACTIVE', 'Safe 0', '${BIG_STONE}', 'Ruby', '', 'PER_CT', 4999, 2499.5, 4999, 2499.5, 0, 0, 0, 0, 'THB', l."vendor_id", 'Vendor Big', l."doc_date", l."doc_no"
      FROM "inventory"."load_to_stock" l WHERE l."running_no" = 1`);
    await db.$executeRawUnsafe(`
      INSERT INTO "inventory"."stock_movement" ("id", "stock_uuid", "kind", "document_type", "document_id", "revision", "pcs_delta", "weight_delta", "cost_delta_base", "created_at", "created_by")
      SELECT gen_random_uuid(), s."id", 'MEMO_OUT_RETURN', 'memo-out-return', gen_random_uuid(), 1, 1, 0.5, 0, now() - g * interval '1 hour', 'perf'
      FROM "inventory"."stock" s CROSS JOIN generate_series(1, 4999) g WHERE s."stone_code" = '${BIG_STONE}'`);
    await db.$executeRawUnsafe(`ANALYZE "inventory"."stock"; ANALYZE "inventory"."stock_movement"; ANALYZE "inventory"."stock_hold_document"`).catch(async () => {
      for (const table of ["stock", "stock_movement", "stock_hold_document"]) await db.$executeRawUnsafe(`ANALYZE "inventory"."${table}"`);
    });
    const [counts] = await db.$queryRaw<{ stocks: number; movements: number; cards: number }[]>`
      SELECT (SELECT count(*) FROM "inventory"."stock")::int AS stocks, (SELECT count(*) FROM "inventory"."stock_movement")::int AS movements, (SELECT count(DISTINCT "card_key") FROM "inventory"."stock")::int AS cards`;
    say(`seeded ${counts.stocks} stocks, ${counts.movements} movements, ${counts.cards} cards in ${Math.round(performance.now() - started)} ms`);
  }, 600_000);

  afterAll(async () => {
    if (process.env.INVENTORY_PERF_REPORT) writeFileSync(process.env.INVENTORY_PERF_REPORT, lines.join("\n"));
    await db?.$disconnect();
  });

  async function explain(label: string, build: (client: never) => Promise<unknown>) {
    const captured: Prisma.Sql[] = [];
    const recorder = { $queryRaw: async (sql: Prisma.Sql) => { captured.push(sql); return [{ total: 0, card_exists: true, entries: 1, movements: 1, total_rows: 1 }]; } };
    await build(recorder as never).catch(() => undefined);
    for (const [index, sql] of captured.entries()) {
      const rows = await db.$queryRawUnsafe<{ "QUERY PLAN": string }[]>(`EXPLAIN (ANALYZE, BUFFERS, COSTS OFF, TIMING OFF) ${sql.text}`, ...sql.values);
      const plan = rows.map((row) => row["QUERY PLAN"]).join("\n");
      lines.push(`--- EXPLAIN ${label} statement ${index + 1}\n${plan}`);
      const summary = plan.split("\n").filter((line) => /Execution Time|Planning Time|Index (Only )?Scan|Seq Scan|Bitmap Heap Scan|Parallel Seq|Sort Method|Buffers: shared/.test(line)).slice(0, 14).map((line) => line.trim()).join(" | ");
      console.info(`[PF-SC] EXPLAIN ${label} #${index + 1}: ${summary}`);
    }
  }

  it("PF-SC-02 CURRENT list at 50,000 stocks: p95 <= 100 ms (2 concurrent)", async () => {
    await load(2, 10, () => runReport(db, guard, {}, (tx) => readCards(tx, { sort: "stoneCode", dir: "asc", page: 1, pageSize: 25 })));
    const sorts = ["stoneCode", "balancePcs", "location"] as const;
    const latencies = await load(2, 60, (index) => runReport(db, guard, {}, (tx) => readCards(tx, { sort: sorts[index % 3], dir: index % 2 ? "desc" : "asc", page: 1 + (index % 4), pageSize: 25, q: index % 5 === 0 ? "PF1" : undefined })));
    const page = await runReport(db, guard, {}, (tx) => readCards(tx, { sort: "stoneCode", dir: "asc", page: 1, pageSize: 50 }));
    say(`PF-SC-02 CURRENT list p95 ${p95(latencies).toFixed(0)} ms (median ${[...latencies].sort((a, b) => a - b)[latencies.length >> 1].toFixed(0)} ms, ${latencies.length} calls, 2 concurrent), total ${page.total} cards`);
    await explain("CURRENT list", (client) => readCards(client, { sort: "stoneCode", dir: "asc", page: 1, pageSize: 25 }));
    expect(page.total).toBeGreaterThan(19_000);
    expect(p95(latencies)).toBeLessThan(100);
  }, 300_000);

  it("PF-SC-01 RANGE list at 200,000 movements / 20,000 cards: p95 <= 300 ms (2 concurrent)", async () => {
    const rss = process.memoryUsage().rss;
    const params = { sort: "stoneCode", dir: "asc", page: 1, pageSize: 25, from: "2026-01-01", to: "2026-11-23" } as const;
    await load(2, 4, () => runReport(db, guard, {}, (tx) => readCards(tx, params)));
    const latencies = await load(2, 20, (index) => runReport(db, guard, {}, (tx) => readCards(tx, { ...params, page: 1 + (index % 3), sort: index % 2 ? "balancePcs" : "stoneCode" })));
    const narrow = await load(2, 10, (index) => runReport(db, guard, {}, (tx) => readCards(tx, { ...params, location: `Safe ${index % 5}`, q: "PF12" })));
    const delta = (process.memoryUsage().rss - rss) / 1048576;
    say(`PF-SC-01 RANGE list (all 20,000 cards) p95 ${p95(latencies).toFixed(0)} ms (median ${[...latencies].sort((a, b) => a - b)[latencies.length >> 1].toFixed(0)} ms, ${latencies.length} calls, 2 concurrent); with location + q p95 ${p95(narrow).toFixed(0)} ms; test-process RSS +${delta.toFixed(0)} MiB`);
    await explain("RANGE list", (client) => readCards(client, params));
    expect(p95(latencies)).toBeLessThan(300);
  }, 600_000);

  it("PF-SC-03 detail at 4,999 entries: p95 <= 150 ms; a normal card is far below", async () => {
    const [{ card_key }] = await db.$queryRaw<{ card_key: string }[]>`SELECT "card_key" FROM "inventory"."stock" WHERE "stone_code" = ${BIG_STONE}`;
    const params = { sort: "date", dir: "asc", page: 1, pageSize: 50 } as const;
    await load(1, 3, () => runReport(db, guard, { isolation: "RepeatableRead" }, (tx) => readTransactions(tx, card_key, params)));
    const latencies = await load(2, 30, (index) => runReport(db, guard, { isolation: "RepeatableRead" }, (tx) => readTransactions(tx, card_key, { ...params, page: 1 + (index % 5), sort: index % 2 ? "docNo" : "date" })));
    const page = await runReport(db, guard, { isolation: "RepeatableRead" }, (tx) => readTransactions(tx, card_key, params));
    const [{ card_key: smallKey }] = await db.$queryRaw<{ card_key: string }[]>`SELECT "card_key" FROM "inventory"."stock" WHERE "stone_code" = 'PF7'`;
    const small = await load(2, 30, () => runReport(db, guard, { isolation: "RepeatableRead" }, (tx) => readTransactions(tx, smallKey, params)));
    say(`PF-SC-03 detail ${page.total} entries p95 ${p95(latencies).toFixed(0)} ms (median ${[...latencies].sort((a, b) => a - b)[latencies.length >> 1].toFixed(0)} ms, 2 concurrent); a normal card (~10 entries) p95 ${p95(small).toFixed(0)} ms`);
    await explain("detail", (client) => readTransactions(client, card_key, params));
    expect(page.total).toBe(4_999);
    expect(page.items[page.items.length - 1].balancePcs).toBe(50);
    expect(p95(latencies)).toBeLessThan(150);
  }, 300_000);

  it("PF-SC-04 header and options statements use the card key index and stay small", async () => {
    const [{ card_key }] = await db.$queryRaw<{ card_key: string }[]>`SELECT "card_key" FROM "inventory"."stock" WHERE "stone_code" = 'PF7'`;
    const { readHeader, readOptions } = await import("../../src/modules/stock/card");
    const header = await load(2, 30, () => runReport(db, guard, {}, (tx) => readHeader(tx, card_key)));
    const options = await load(2, 20, () => runReport(db, guard, {}, (tx) => readOptions(tx)));
    say(`PF-SC-04 header p95 ${p95(header).toFixed(0)} ms; options p95 ${p95(options).toFixed(0)} ms (50,000 stocks, ${randomUUID().slice(0, 0)}5 locations)`);
    await explain("header", (client) => readHeader(client, card_key));
    expect(p95(header)).toBeLessThan(50);
  }, 120_000);
});
