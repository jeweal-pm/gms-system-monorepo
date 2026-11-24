/* eslint-disable @typescript-eslint/no-explicit-any -- JSON bodies and the loosely typed master harness */
import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { Decimal, Prisma, type Dec } from "../../src/platform/db";
import { AppError } from "../../src/platform/errors";
import { readValueCards } from "../../src/modules/stock/value";
import { valuate, type LastSaleLine, type StockForValue } from "../../src/modules/stock/value";
import { ReportGuard, STOCK_VALUE_CODES, runReport } from "../../src/modules/reports/guard";
import { canRun, startHarness, type Harness } from "../support/harness";
import { cleanupLoads, internalApi, seedLoad, type Internal } from "../stock-card/support";
import { BOTH_GRANT, VALUE_GRANT, cleanupSales, seedSale, seedValued, type ValuedOptions } from "./support";

/**
 * Stock Value on PostgreSQL (stock-value SA rev 1 testing.md): IT-SV-M1, P1, P2, S1, S2, V1, L1-L4, D1, D2, A1, B1, B2, R1.
 * Stock is seeded through the owner connection, holds go through the REAL internal hold API, the report is read through the real
 * HTTP app (cookie, JWT, live authorization row). The service runs as the provisioned app role when INVENTORY_APP_TEST_DATABASE_URL is set.
 */
const TAG = randomUUID().slice(0, 6).toUpperCase();
const LOADS: string[] = [];
const SALES: string[] = [];
let counter = 0;
let stockIdBase = Math.floor(Math.random() * 70_000_000) + 1_000_000;

let h: Harness;
let viewer: Awaited<ReturnType<Harness["user"]>>;
let both: Awaited<ReturnType<Harness["user"]>>;
let internal: Internal;
let guard: ReportGuard;

const tagOf = (name: string) => `SV${TAG}${name}`;
const doc = () => randomUUID();
const party = () => ({ id: randomUUID(), name: "Khun Nida Jewelry" });
const uniq = () => { counter += 1; return counter; };
const num = (value: string | null) => (value === null ? null : new Decimal(value));

async function seed(options: ValuedOptions) {
  const loaded = await seedValued(h, options);
  LOADS.push(loaded.loadId);
  return loaded;
}
async function sale(options: Parameters<typeof seedSale>[1]) {
  const made = await seedSale(h, options);
  SALES.push(made.id);
  return made;
}
const cardKeyOf = async (stockUuid: string) => (await h.ownerDb.stock.findUniqueOrThrow({ where: { id: stockUuid }, select: { card_key: true } })).card_key!;

async function list(query = "", who = viewer) {
  const response = await who.call("GET", `/stock-value/cards${query}`);
  expect(response.status, JSON.stringify(response.body)).toBe(200);
  return response.body as { items: any[]; total: number; page: number; pageSize: number; mode: string; asOf: string | null; totals: any };
}
async function detail(cardKey: string, query = "", who = viewer) {
  const response = await who.call("GET", `/stock-value/cards/${cardKey}/transactions${query}`);
  expect(response.status, JSON.stringify(response.body)).toBe(200);
  return response.body as { items: any[]; total: number; opening: any; totals: any; valuation: any };
}
async function header(cardKey: string) {
  const response = await viewer.call("GET", `/stock-value/cards/${cardKey}`);
  expect(response.status, JSON.stringify(response.body)).toBe(200);
  return response.body as Record<string, any>;
}
async function allRows(query: string) {
  const rows: any[] = [];
  for (let page = 1; page <= 10; page += 1) {
    const result = await list(`${query}${query.includes("?") ? "&" : "?"}page=${page}&pageSize=25`);
    rows.push(...result.items);
    if (rows.length >= result.total) break;
  }
  return rows;
}
const one = async (code: string, query = "") => {
  const result = await list(`?q=${encodeURIComponent(code)}${query}`);
  expect(result.items, code).toHaveLength(1);
  return result.items[0];
};

/** Bulk stocks of one load (one multi-row insert): card, price, cost and balance in one call. */
type Bulk = { code: string; location?: string; lot?: string; salePrice?: string; cost?: string; priceUnit?: "PER_CT" | "PER_PCS"; pcs: number; weightCt: string; onHandPcs?: number; onHandWeightCt?: string; reservedPcs?: number; reservedWeightCt?: string; vendor?: string; stockId?: string };
async function bulk(rows: Bulk[]) {
  const base = await seedLoad(h, { stoneCode: `${tagOf("BASE")}-${uniq()}`, pcs: 1, weightCt: "1" });
  LOADS.push(base.loadId);
  const load = await h.ownerDb.load_to_stock.findFirstOrThrow({ where: { id: base.loadId } });
  const data = rows.map((row) => ({
    id: randomUUID(), stock_id: row.stockId ?? `V${String((stockIdBase += 1)).padStart(9, "0")}`, load_id: load.id, status: "ACTIVE", location: row.location ?? "Safe A", stone_code: row.code, lot: row.lot ?? "L1",
    price_unit: row.priceUnit ?? "PER_CT", pcs: row.pcs, weight_ct: row.weightCt, on_hand_pcs: row.onHandPcs ?? row.pcs, on_hand_weight_ct: row.onHandWeightCt ?? row.weightCt,
    reserved_pcs: row.reservedPcs ?? 0, reserved_weight_ct: row.reservedWeightCt ?? "0",
    memo_out_pcs: row.pcs - (row.onHandPcs ?? row.pcs) - (row.reservedPcs ?? 0), memo_out_weight_ct: new Decimal(row.weightCt).minus(row.onHandWeightCt ?? row.weightCt).minus(row.reservedWeightCt ?? 0).toFixed(3), unit_cost_base: row.cost ?? "0", cost_amount_base: "0", stock_price: "0", sale_price: row.salePrice ?? "0",
    currency_code: "THB", vendor_id: load.vendor_id, vendor_name_snapshot: row.vendor ?? "V", ref_doc_date: load.doc_date, ref_doc_no: load.doc_no,
  }));
  await h.ownerDb.stock.createMany({ data });
  return data;
}

describe.runIf(canRun)("IT-SV stock value on PostgreSQL", () => {
  beforeAll(async () => {
    guard = new ReportGuard();
    h = await startHarness({ stockCard: { guard } });
    viewer = await h.user(VALUE_GRANT, { name: "Stock Value Viewer" });
    both = await h.user(BOTH_GRANT, { name: "Both Viewer" });
    internal = internalApi(h);
  });

  afterAll(async () => {
    await cleanupSales(h, SALES);
    await cleanupLoads(h, LOADS);
    await h.close();
  });

  // ---------------------------------------------------------------- IT-SV-M1
  describe("IT-SV-M1 migration objects", () => {
    it("item_key is generated and equal for the same stone on stock and sale_line (trimmed, any case; attributes stand in for an empty code); card_key equal implies item_key equal", async () => {
      const n = uniq();
      const code = `${tagOf("M1")}${n}X`;
      const a = await seed({ stoneCode: code, location: "Safe A", lot: "L1", pcs: 1, weightCt: "1" });
      const b = await seed({ stoneCode: ` ${code.toLowerCase()} `, location: " safe a", lot: "l1 ", pcs: 1, weightCt: "1" });
      const otherLot = await seed({ stoneCode: code, location: "Safe B", lot: "L9", pcs: 1, weightCt: "1" });
      const bare = await seed({ stoneCode: "", stone: "Ruby", shape: "Oval", color: "Red", lot: `A${n}`, pcs: 1, weightCt: "1" });
      const row = async (id: string) => (await h.ownerDb.stock.findUniqueOrThrow({ where: { id }, select: { item_key: true, card_key: true } }));
      const [ra, rb, ro, rbare] = await Promise.all([a.id, b.id, otherLot.id, bare.id].map(row));
      expect(ra.item_key).toMatch(/^SI[0-9a-f]{32}$/);
      expect(ra.item_key).toBe(rb.item_key);
      expect(ra.card_key).toBe(rb.card_key);
      expect(ro.item_key).toBe(ra.item_key); // same stone in another location / lot
      expect(ro.card_key).not.toBe(ra.card_key);
      const made = await sale({ lines: [{ stoneCode: `  ${code} `, unitPrice: "10" }, { stoneCode: "", stone: "RUBY", shape: "oval", color: "red", unitPrice: "20" }, { stoneCode: `${code}-other`, unitPrice: "30" }] });
      const lines = await h.ownerDb.sale_line.findMany({ where: { sale_id: made.id }, orderBy: { position: "asc" }, select: { item_key: true } });
      expect(lines[0].item_key).toBe(ra.item_key);
      expect(lines[1].item_key).toBe(rbare.item_key);
      expect(lines[2].item_key).not.toBe(ra.item_key);
      // the app role (the service) reads the new columns; the index exists
      const [viaApp] = await h.db.$queryRaw<{ item_key: string }[]>`SELECT "item_key" FROM "inventory"."stock" WHERE "id" = ${a.id}::uuid`;
      expect(viaApp.item_key).toBe(ra.item_key);
      const indexes = await h.ownerDb.$queryRaw<{ indexname: string }[]>`SELECT indexname FROM pg_indexes WHERE schemaname = 'inventory' AND indexname = 'sale_line_item_key_idx'`;
      expect(indexes).toHaveLength(1);
      // generated columns are written by PostgreSQL only
      await expect(h.ownerDb.$executeRaw`UPDATE "inventory"."stock" SET "item_key" = 'x' WHERE "id" = ${a.id}::uuid`).rejects.toThrow();
    });
  });

  // ---------------------------------------------------------------- IT-SV-P1 / P2
  describe("IT-SV-P1 Price list", () => {
    it("one Stock ID: price, amount and profit/loss (AC-SV-01)", async () => {
      const code = `${tagOf("P1")}a${uniq()}X`;
      await seed({ stoneCode: code, pcs: 2, weightCt: "1.240", salePrice: "12500", unitCost: "8000" });
      const row = await one(code);
      expect(row).toMatchObject({ unit: "CT", price: "12500.0000", priceSource: "PRICE_LIST", priceSourceLabel: "Price list", priceRef: null, amount: "15500.00", profitLoss: "5580.00", balancePcs: 2, balanceWeightCt: "1.240" });
      expect(JSON.stringify(row)).not.toMatch(/unit_cost|unitCost|"cost"/i);
    });

    it("two Stock IDs of one card: weighted price (AC-SV-02); after a Memo Out of the cheaper one the weights follow the balance", async () => {
      const code = `${tagOf("P1")}b${uniq()}X`;
      const cheap = await seed({ stoneCode: code, pcs: 1, weightCt: "1.000", salePrice: "10000" });
      await seed({ stoneCode: code, pcs: 1, weightCt: "1.000", salePrice: "14000" });
      expect(await one(code)).toMatchObject({ price: "12000.0000", amount: "24000.00", balanceWeightCt: "2.000", vendorCount: expect.any(Number) });
      expect((await internal.hold("memo-out", doc(), [{ stockUuid: cheap.id, pcs: 1, weightCt: "0.750" }], { docDate: "2026-09-18", party: party() })).status).toBe(200);
      expect(await one(code)).toMatchObject({ price: "13200.0000", amount: "16500.00", balanceWeightCt: "1.250", balancePcs: 1 });
    });

    it("0.00 Sale Price is not a price; a per-piece Stock ID next to a per-ct one is converted value-preservingly; an unpriced Stock ID of a priced card is valued at the card price", async () => {
      const none = `${tagOf("P1")}c${uniq()}X`;
      await seed({ stoneCode: none, pcs: 1, weightCt: "1.000", salePrice: "0" });
      expect(await one(none)).toMatchObject({ priceSource: "NONE", price: null, amount: null, profitLoss: null, unit: "CT" });

      const mixed = `${tagOf("P1")}d${uniq()}X`;
      await seed({ stoneCode: mixed, pcs: 3, weightCt: "0.900", salePrice: "500", priceUnit: "PER_PCS" });
      await seed({ stoneCode: mixed, pcs: 1, weightCt: "1.000", salePrice: "1000" });
      expect(await one(mixed)).toMatchObject({ unit: "CT", price: "1315.7895", amount: "2500.00", balanceWeightCt: "1.900" });

      const allPieces = `${tagOf("P1")}e${uniq()}X`;
      await seed({ stoneCode: allPieces, pcs: 3, weightCt: "0.900", salePrice: "500", priceUnit: "PER_PCS" });
      expect(await one(allPieces)).toMatchObject({ unit: "PCS", price: "500.0000", amount: "1500.00" });

      const partial = `${tagOf("P1")}f${uniq()}X`;
      await seed({ stoneCode: partial, pcs: 1, weightCt: "1.000", salePrice: "10000" });
      await seed({ stoneCode: partial, pcs: 1, weightCt: "1.000", salePrice: "0" });
      expect(await one(partial)).toMatchObject({ price: "10000.0000", amount: "20000.00", priceSource: "PRICE_LIST" });
    });
  });

  describe("IT-SV-P2 fallback weights", () => {
    it("a RANGE list at a past Due, where the card has no balance now, still prices from the loaded quantity", async () => {
      const code = `${tagOf("P2")}${uniq()}X`;
      const load = await seed({ stoneCode: code, pcs: 2, weightCt: "1.240", salePrice: "12500", unitCost: "8000" });
      expect((await internal.hold("memo-out", doc(), [{ stockUuid: load.id, pcs: 2, weightCt: "1.240" }], { docDate: "2026-09-10", party: party() })).status).toBe(200);
      expect((await list(`?q=${code}`)).total).toBe(0); // nothing left now
      const past = await list(`?q=${code}&from=2026-09-01&to=2026-09-05`);
      expect(past).toMatchObject({ mode: "RANGE", asOf: "2026-09-05", total: 1 });
      expect(past.items[0]).toMatchObject({ balancePcs: 2, balanceWeightCt: "1.240", price: "12500.0000", amount: "15500.00", profitLoss: "5580.00" });
      const after = await list(`?q=${code}&from=2026-09-01&to=2026-09-20`);
      expect(after.items[0]).toMatchObject({ balancePcs: 0, balanceWeightCt: "0.000", amount: "0.00", profitLoss: "0.00", price: "12500.0000" });
    });
  });

  // ---------------------------------------------------------------- IT-SV-S1 / S2
  describe("IT-SV-S1 Last sale", () => {
    it("the latest applied Sale line of the stone wins; every other status, deleted, provisional and other stones are ignored; lot and location are ignored (AC-SV-03)", async () => {
      const code = `${tagOf("S1")}a${uniq()}X`;
      await seed({ stoneCode: code, pcs: 2, weightCt: "2.000", salePrice: "0", unitCost: "5000" });
      await sale({ docDate: "2026-10-01", lines: [{ stoneCode: code, unitPrice: "9000" }] });
      const winner = await sale({ docDate: "2026-11-12", lines: [{ stoneCode: ` ${code.toLowerCase()} `, unitPrice: "1111", lot: "OTHER", location: "Vault Z" }, { stoneCode: code, unitPrice: "9800", lot: "OTHER", location: "Vault Z" }] });
      for (const [status, date, price] of [["DRAFT", "2026-11-20", "9999"], ["PENDING_APPROVAL", "2026-11-21", "9998"], ["REVISION_REQUESTED", "2026-11-22", "9997"], ["REJECTED", "2026-11-23", "9996"]] as const) {
        await sale({ status, docDate: date, lines: [{ stoneCode: code, unitPrice: price }] });
      }
      await sale({ deleted: true, docDate: "2026-11-24", lines: [{ stoneCode: code, unitPrice: "9995" }] });
      await sale({ provisional: true, docDate: "2026-11-25", lines: [{ stoneCode: code, unitPrice: "9994" }] });
      await sale({ docDate: "2026-11-26", lines: [{ stoneCode: `${code}-OTHER`, unitPrice: "7777" }] });
      const row = await one(code);
      expect(row).toMatchObject({
        price: "9800.0000", priceSource: "LAST_SALE", priceSourceLabel: "Last sale", unit: "CT", amount: "19600.00", profitLoss: "9600.00",
        priceRef: { docType: "sale", docId: winner.id, docNo: winner.docNo, docDate: "2026-11-12" },
      });
      expect(JSON.stringify(row)).not.toContain("Customer");
    });

    it("the same date is broken by creation time; a Price list is never replaced by a Last sale", async () => {
      const tie = `${tagOf("S1")}b${uniq()}X`;
      await seed({ stoneCode: tie, pcs: 1, weightCt: "1.000" });
      await sale({ docDate: "2026-11-10", createdAt: "2026-11-10T08:00:00Z", lines: [{ stoneCode: tie, unitPrice: "4000" }] });
      const newer = await sale({ docDate: "2026-11-10", createdAt: "2026-11-10T09:00:00Z", lines: [{ stoneCode: tie, unitPrice: "5000" }] });
      expect(await one(tie)).toMatchObject({ price: "5000.0000", priceRef: { docNo: newer.docNo } });

      const listed = `${tagOf("S1")}c${uniq()}X`;
      await seed({ stoneCode: listed, pcs: 1, weightCt: "1.000", salePrice: "100" });
      await sale({ lines: [{ stoneCode: listed, unitPrice: "99999" }] });
      expect(await one(listed)).toMatchObject({ price: "100.0000", priceSource: "PRICE_LIST", priceRef: null });
    });

    it("foreign currency is converted by the Sale's Selling Rate; units are converted with the line's own quantities; an unusable conversion is NONE", async () => {
      const usd = `${tagOf("S1")}d${uniq()}X`;
      await seed({ stoneCode: usd, pcs: 1, weightCt: "1.000" });
      await sale({ currency: "USD", exchangeRate: "35.500000", lines: [{ stoneCode: usd, unitPrice: "100" }] });
      expect(await one(usd)).toMatchObject({ price: "3550.0000", amount: "3550.00" });

      const perPieceLine = `${tagOf("S1")}e${uniq()}X`;
      await seed({ stoneCode: perPieceLine, pcs: 1, weightCt: "4.500" });
      await sale({ lines: [{ stoneCode: perPieceLine, priceUnit: "PER_PCS", unitPrice: "100", pcs: 10, weightCt: "4.500" }] });
      expect(await one(perPieceLine)).toMatchObject({ unit: "CT", price: "222.2222", amount: "1000.00" });

      const pcsCard = `${tagOf("S1")}f${uniq()}X`;
      await seed({ stoneCode: pcsCard, pcs: 3, weightCt: "1.000", priceUnit: "PER_PCS" });
      await sale({ lines: [{ stoneCode: pcsCard, priceUnit: "PER_CT", unitPrice: "9800", pcs: 10, weightCt: "4.500" }] });
      expect(await one(pcsCard)).toMatchObject({ unit: "PCS", price: "4410.0000", amount: "13230.00" });

      const unusable = `${tagOf("S1")}g${uniq()}X`;
      await seed({ stoneCode: unusable, pcs: 1, weightCt: "1.000" });
      await sale({ lines: [{ stoneCode: unusable, priceUnit: "PER_PCS", unitPrice: "100", pcs: 5, weightCt: "0.000" }] });
      expect(await one(unusable)).toMatchObject({ priceSource: "NONE", price: null, priceRef: null });
    });

    it("the probe is not run for a card with a Price list (plan: no sale_line access when every card is priced)", async () => {
      const tag = `${tagOf("S1P")}`;
      for (let index = 0; index < 5; index += 1) {
        const code = `${tag}-${index}`;
        await seed({ stoneCode: code, pcs: 1, weightCt: "1.000", salePrice: "100" });
        await sale({ lines: [{ stoneCode: code, unitPrice: "200" }] });
      }
      const loops = async (query: string) => {
        let captured: Prisma.Sql | undefined;
        await readValueCards({ $queryRaw: async (sql: Prisma.Sql) => { captured = sql; return []; } } as never, { page: 1, pageSize: 50, sort: "stoneCode", dir: "asc", q: query });
        const plan = await h.ownerDb.$queryRawUnsafe<{ "QUERY PLAN": any[] }[]>(`EXPLAIN (ANALYZE, FORMAT JSON) ${captured!.text}`, ...captured!.values);
        const found: number[] = [];
        const walk = (node: any) => { if (node["Relation Name"] === "sale_line") found.push(node["Actual Loops"] ?? 0); (node.Plans ?? []).forEach(walk); };
        walk(plan[0]["QUERY PLAN"][0].Plan);
        return found;
      };
      expect((await loops(`${tag}-`)).reduce((sum, value) => sum + value, 0)).toBe(0);
      // control: one unpriced card makes the probe run (at most once per such card)
      await seed({ stoneCode: `${tag}-none`, pcs: 1, weightCt: "1.000" });
      await sale({ lines: [{ stoneCode: `${tag}-none`, unitPrice: "300" }] });
      const withProbe = (await loops(`${tag}-`)).reduce((sum, value) => sum + value, 0);
      expect(withProbe).toBeGreaterThan(0);
      expect(withProbe).toBeLessThanOrEqual(1);
    });
  });

  describe("IT-SV-S2 no price", () => {
    it("a card without a price is listed with nulls and counted; a priced card without a cost has no profit/loss (AC-SV-04)", async () => {
      const tag = tagOf("S2");
      await seed({ stoneCode: `${tag}-1`, pcs: 3, weightCt: "0.900" }); // no price, no sale
      await seed({ stoneCode: `${tag}-2`, pcs: 1, weightCt: "2.000", salePrice: "1000" }); // priced, no cost
      await seed({ stoneCode: `${tag}-3`, pcs: 1, weightCt: "2.000", salePrice: "1000", unitCost: "400" }); // priced, cost
      const result = await list(`?q=${tag}-`);
      expect(result.total).toBe(3);
      const by = (suffix: string) => result.items.find((item) => item.stoneCode === `${tag}-${suffix}`);
      expect(by("1")).toMatchObject({ price: null, priceSource: "NONE", priceSourceLabel: null, amount: null, profitLoss: null, balancePcs: 3, balanceWeightCt: "0.900" });
      expect(by("2")).toMatchObject({ amount: "2000.00", profitLoss: null });
      expect(by("3")).toMatchObject({ amount: "2000.00", profitLoss: "1200.00" });
      expect(result.totals).toEqual({ balancePcs: 5, balanceWeightCt: "4.900", amount: "4000.00", profitLoss: "1200.00", pricedCards: 2, unpricedCards: 1, noCostCards: 1 });
      const empty = await list(`?q=${tag}-nothing`);
      expect(empty.totals).toEqual({ balancePcs: 0, balanceWeightCt: "0.000", amount: "0.00", profitLoss: "0.00", pricedCards: 0, unpricedCards: 0, noCostCards: 0 });
      const noneOnly = await list(`?q=${tag}-1`);
      expect(noneOnly.totals).toMatchObject({ amount: "0.00", profitLoss: "0.00", pricedCards: 0, unpricedCards: 1 });
    });
  });

  // ---------------------------------------------------------------- IT-SV-V1
  describe("IT-SV-V1 engine parity", () => {
    it("the TypeScript mirror equals the SQL result on 60 seeded cards (mixed units, prices, costs, balances, last sales)", async () => {
      let state = 0x9e3779b9;
      const random = () => { state = (state + 0x6d2b79f5) >>> 0; let t = state; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
      const pick = <T,>(items: T[]) => items[Math.floor(random() * items.length)];
      const tag = tagOf("V1");
      const expected = new Map<string, { stocks: StockForValue[]; last: LastSaleLine | null }>();
      const rows: Bulk[] = [];
      for (let card = 0; card < 60; card += 1) {
        const code = `${tag}-${card}`;
        const stocks: StockForValue[] = [];
        const count = 1 + Math.floor(random() * 3);
        for (let index = 0; index < count; index += 1) {
          const priceUnit = random() < 0.3 ? "PER_PCS" : "PER_CT";
          const pcs = 1 + Math.floor(random() * 9);
          const weight = new Decimal(pcs).times(0.1 + random() * 1.4).toFixed(3);
          const salePrice = pick(["0", "0", "1250.50", "980", "15.25", "73333.33"]);
          const cost = pick(["0", "400", "610.75", "12.5", "0"]);
          // book balance = part of the loaded quantity (the rest is out on memo); one piece of it may be reserved
          const lowered = index > 0 && random() < 0.4;
          const bookPcs = lowered ? Math.floor(random() * (pcs + 1)) : pcs;
          const bookWeight = new Decimal(weight).times(bookPcs).div(pcs).toDecimalPlaces(3);
          const reserved = index > 0 && bookPcs >= 1 && random() < 0.3;
          const reservedWeight = reserved ? bookWeight.div(bookPcs).toDecimalPlaces(3) : new Decimal(0);
          const onHandPcs = bookPcs - (reserved ? 1 : 0);
          const onHandWeight = bookWeight.minus(reservedWeight).toFixed(3);
          rows.push({ code, pcs, weightCt: weight, priceUnit, salePrice, cost, onHandPcs, onHandWeightCt: onHandWeight, ...(reserved ? { reservedPcs: 1, reservedWeightCt: reservedWeight.toFixed(3) } : {}) });
          stocks.push({ priceUnit, salePrice, unitCostBase: cost, pcs, weightCt: weight, onHandPcs, reservedPcs: reserved ? 1 : 0, onHandWeightCt: onHandWeight, reservedWeightCt: reservedWeight.toFixed(3) });
        }
        let last: LastSaleLine | null = null;
        if (random() < 0.6) {
          last = { priceUnit: random() < 0.4 ? "PER_PCS" : "PER_CT", unitPrice: pick(["100", "9800.5", "12.25", "444"]), exchangeRate: random() < 0.3 ? "35.500000" : null, pcs: 1 + Math.floor(random() * 9), weightCt: random() < 0.15 ? "0.000" : (0.5 + random() * 4).toFixed(3) };
          await sale({ currency: last.exchangeRate ? "USD" : "THB", exchangeRate: last.exchangeRate, lines: [{ stoneCode: code, priceUnit: last.priceUnit, unitPrice: last.unitPrice, pcs: last.pcs, weightCt: last.weightCt }] });
        }
        expected.set(code, { stocks, last });
      }
      await bulk(rows);
      const result = await list(`?q=${tag}-&pageSize=50`);
      const all = [...result.items, ...(await list(`?q=${tag}-&pageSize=50&page=2`)).items];
      expect(all.length).toBeGreaterThan(40);
      expect(result.total).toBe(all.length);
      let checked = 0;
      for (const row of all) {
        const { stocks, last } = expected.get(row.stoneCode)!;
        const book = { pcs: stocks.reduce((sum, s) => sum + s.onHandPcs + s.reservedPcs, 0), weightCt: stocks.reduce((sum, s) => sum.plus(s.onHandWeightCt).plus(s.reservedWeightCt), new Decimal(0)).toFixed(3) };
        const mirror = valuate(stocks, last);
        const value = mirror.value(book);
        expect({ unit: row.unit, price: row.price, priceSource: row.priceSource, amount: row.amount, profitLoss: row.profitLoss }, `${row.stoneCode} ${JSON.stringify(rows.filter((r) => r.code === row.stoneCode))} ${JSON.stringify(last)}`).toEqual({
          unit: mirror.unit, price: mirror.price ? mirror.price.toFixed(4) : null, priceSource: mirror.priceSource, amount: value.amount, profitLoss: value.profitLoss,
        });
        checked += 1;
      }
      expect(checked).toBe(all.length);
      // the fixture really covers every branch
      expect(new Set(all.map((row) => row.priceSource))).toEqual(new Set(["PRICE_LIST", "LAST_SALE", "NONE"]));
      expect(new Set(all.map((row) => row.unit))).toEqual(new Set(["CT", "PCS"]));
      expect(all.some((row) => row.profitLoss !== null)).toBe(true);
      // the totals are the sum of the rounded row amounts
      const sum = (key: "amount" | "profitLoss") => all.reduce((total, row) => (row[key] === null ? total : total.plus(row[key])), new Decimal(0)).toFixed(2);
      expect(result.totals).toMatchObject({ amount: sum("amount"), profitLoss: sum("profitLoss"), pricedCards: all.filter((row) => row.amount !== null).length, unpricedCards: all.filter((row) => row.price === null).length });
    });
  });

  // ---------------------------------------------------------------- IT-SV-L1
  describe("IT-SV-L1 list = Stock Card", () => {
    it("the same query gives the same cards, order, balances and total as Stock Card, in CURRENT and RANGE", async () => {
      const tag = tagOf("L1");
      const made: Awaited<ReturnType<typeof seed>>[] = [];
      for (let index = 0; index < 12; index += 1) {
        made.push(await seed({ stoneCode: `${tag}-${index % 5}`, location: index % 2 ? "Safe A" : "Vault B", lot: `L${index % 3}`, pcs: 2 + index, weightCt: (1 + index / 4).toFixed(3), salePrice: index % 3 ? "1000" : "0", unitCost: index % 4 ? "300" : "0", docDate: `2026-09-${String(1 + index).padStart(2, "0")}` }));
      }
      for (const [index, stock] of made.entries()) {
        if (index % 3 === 0) await internal.hold("memo-out", doc(), [{ stockUuid: stock.id, pcs: 1, weightCt: "0.250" }], { docDate: `2026-09-${String(10 + index).padStart(2, "0")}`, party: party() });
      }
      let compared = 0;
      for (const range of ["", "&from=2026-09-01", "&to=2026-09-12", "&from=2026-09-05&to=2026-09-15"]) {
        for (const sort of ["stoneCode", "location", "lot", "balancePcs", "balanceWeightCt"]) {
          for (const dir of ["asc", "desc"]) {
            const query = `?q=${tag}-&pageSize=50&sort=${sort}&dir=${dir}${range}`;
            const value = await list(query, both);
            const card = (await both.call("GET", `/stock-card/cards${query}`)).body;
            expect(value.total, query).toBe(card.total);
            expect(value.mode).toBe(card.mode);
            expect(value.asOf).toBe(card.asOf);
            expect(value.items.map((item) => [item.cardKey, item.balancePcs, item.balanceWeightCt, item.location, item.lot, item.stoneCode, item.vendorName, item.vendorCount]), query)
              .toEqual(card.items.map((item: any) => [item.cardKey, item.balancePcs, item.balanceWeightCt, item.location, item.lot, item.stoneCode, item.vendorName, item.vendorCount]));
            compared += 1;
          }
        }
      }
      expect(compared).toBe(40);
    });
  });

  // ---------------------------------------------------------------- IT-SV-L2 / L3
  describe("IT-SV-L2 totals, IT-SV-L3 sorts and paging", () => {
    const tag = tagOf("L2");
    const expectedAmounts = new Map<string, { amount: Dec | null; pl: Dec | null }>();
    const sums = { pcs: 0, weight: new Decimal(0), amount: new Decimal(0), pl: new Decimal(0) };

    beforeAll(async () => {
      const rows: Bulk[] = [];
      for (let index = 0; index < 60; index += 1) {
        const group = index % 3; // 0 priced + cost, 1 priced without cost, 2 unpriced
        const pcs = 1 + (index % 7);
        const weight = new Decimal(0.35).times(index + 1).toFixed(3);
        const price = new Decimal(100 + index * 37.5);
        const cost = new Decimal(40 + index * 11.25);
        rows.push({
          code: `${tag}-${String(index).padStart(2, "0")}`, location: index % 4 === 0 ? "Vault Q" : "Safe A", lot: index % 5 === 0 ? `LOT${index}` : "", pcs, weightCt: weight,
          salePrice: group === 2 ? "0" : price.toFixed(2), cost: group === 0 ? cost.toFixed(4) : "0", vendor: index % 2 ? "Siam Stones" : "Bangkok Gem Supply",
        });
        const amount = group === 2 ? null : price.times(weight).toDecimalPlaces(2);
        const loss = group === 0 && amount ? amount.minus(cost.times(weight).toDecimalPlaces(2)) : null;
        expectedAmounts.set(`${tag}-${String(index).padStart(2, "0")}`, { amount, pl: loss });
        sums.pcs += pcs; sums.weight = sums.weight.plus(weight);
        if (amount) sums.amount = sums.amount.plus(amount);
        if (loss) sums.pl = sums.pl.plus(loss);
      }
      await bulk(rows);
    });

    it("totals are over the whole filtered set on every page (AC-SV-05) and equal the sum of the rows", async () => {
      const pages = await Promise.all([1, 2, 3].map((page) => list(`?q=${tag}-&pageSize=25&page=${page}`)));
      expect(pages.map((page) => page.items.length)).toEqual([25, 25, 10]);
      for (const page of pages) {
        expect(page.total).toBe(60);
        expect(page.totals).toEqual({ balancePcs: sums.pcs, balanceWeightCt: sums.weight.toFixed(3), amount: sums.amount.toFixed(2), profitLoss: sums.pl.toFixed(2), pricedCards: 40, unpricedCards: 20, noCostCards: 20 });
        expect(page.totals.pricedCards + page.totals.unpricedCards).toBe(page.total);
      }
      for (const row of pages.flatMap((page) => page.items)) {
        const want = expectedAmounts.get(row.stoneCode)!;
        expect(row.amount, row.stoneCode).toBe(want.amount ? want.amount.toFixed(2) : null);
        expect(row.profitLoss, row.stoneCode).toBe(want.pl ? want.pl.toFixed(2) : null);
      }
      const beyond = await list(`?q=${tag}-&pageSize=25&page=4`);
      expect(beyond).toMatchObject({ items: [], total: 60, totals: { pricedCards: 40 } });
    });

    it("price, amount and profitLoss sort numerically with missing values last in both directions; every sort key works with both directions", async () => {
      for (const sort of ["price", "amount", "profitLoss"] as const) {
        for (const dir of ["asc", "desc"] as const) {
          const rows = await allRows(`?q=${tag}-&sort=${sort}&dir=${dir}`);
          expect(rows).toHaveLength(60);
          const values = rows.map((row) => row[sort]);
          const firstNull = values.findIndex((value) => value === null);
          expect(values.slice(firstNull).every((value) => value === null), `${sort} ${dir} nulls last`).toBe(true);
          const present = values.slice(0, firstNull).map((value) => num(value)!);
          for (let index = 1; index < present.length; index += 1) {
            expect(dir === "asc" ? present[index].gte(present[index - 1]) : present[index].lte(present[index - 1]), `${sort} ${dir} at ${index}`).toBe(true);
          }
          expect(new Set(rows.map((row) => row.cardKey)).size).toBe(60); // no row lost or doubled across pages
        }
      }
      for (const sort of ["stoneCode", "location", "lot", "balancePcs", "balanceWeightCt"]) {
        for (const dir of ["asc", "desc"]) expect((await list(`?q=${tag}-&sort=${sort}&dir=${dir}&pageSize=10`)).items, `${sort} ${dir}`).toHaveLength(10);
      }
    });

    it("the location filter, search by stone code / lot / vendor / visible Stock ID, and totals follow the filtered set", async () => {
      const vault = await list(`?q=${tag}-&location=%20vault%20q%20&pageSize=50`);
      expect(vault.total).toBe(15);
      expect(vault.items.every((row) => row.location === "Vault Q")).toBe(true);
      expect(vault.totals.pricedCards + vault.totals.unpricedCards).toBe(15);
      expect((await list(`?q=${tag}-07`)).total).toBe(1);
      expect((await list(`?q=LOT10`)).items.map((row) => row.stoneCode)).toEqual([`${tag}-10`]); // by lot
      const vendor = await list(`?q=${encodeURIComponent("bangkok gem")}&pageSize=50`);
      expect(vendor.items.some((row) => row.stoneCode.startsWith(tag))).toBe(true);
      const stockId = (await h.ownerDb.stock.findFirstOrThrow({ where: { stone_code: `${tag}-03` }, select: { stock_id: true } })).stock_id;
      const byId = await list(`?q=${stockId}`);
      expect(byId.items.map((row) => row.stoneCode)).toEqual([`${tag}-03`]);
    });
  });

  // ---------------------------------------------------------------- IT-SV-L4 / D1
  describe("IT-SV-L4 consistency and IT-SV-D1 detail rows", () => {
    it("list amount = header currentAmount = last chronological row amount = detail total amount, for a Price list and a Last sale card (AC-SV-06)", async () => {
      const priced = `${tagOf("L4")}a${uniq()}X`;
      const load = await seed({ stoneCode: priced, pcs: 6, weightCt: "3.000", salePrice: "1000", unitCost: "400" });
      await internal.hold("memo-out", doc(), [{ stockUuid: load.id, pcs: 1, weightCt: "0.500" }], { docDate: "2026-09-18", party: party() });
      await internal.hold("memo-out", doc(), [{ stockUuid: load.id, pcs: 2, weightCt: "0.750" }], { docDate: "2026-09-20", party: party() });
      const viaSale = `${tagOf("L4")}b${uniq()}X`;
      const second = await seed({ stoneCode: viaSale, pcs: 4, weightCt: "2.000" });
      await sale({ lines: [{ stoneCode: viaSale, unitPrice: "700" }] });
      await internal.hold("memo-out", doc(), [{ stockUuid: second.id, pcs: 1, weightCt: "0.400" }], { docDate: "2026-09-19", party: party() });
      for (const [code, stock] of [[priced, load], [viaSale, second]] as const) {
        const row = await one(code);
        const key = await cardKeyOf(stock.id);
        expect(row.cardKey).toBe(key);
        const head = await header(key);
        const all = await detail(key, "?pageSize=50");
        const last = all.items[all.items.length - 1];
        expect(head.currentAmount, code).toBe(row.amount);
        expect(last.amount, code).toBe(row.amount);
        expect(all.totals.amount, code).toBe(row.amount);
        expect(head.currentProfitLoss).toBe(row.profitLoss);
        expect(all.totals.profitLoss).toBe(row.profitLoss);
        expect(head).toMatchObject({ price: row.price, priceSource: row.priceSource, unit: row.unit, priceRef: row.priceRef, currentBalancePcs: row.balancePcs, currentBalanceWeightCt: row.balanceWeightCt });
        expect(all.valuation).toEqual({ unit: row.unit, price: row.price, priceSource: row.priceSource, priceSourceLabel: row.priceSourceLabel, priceRef: row.priceRef });
      }
    });

    it("detail rows: price, amount = running balance x price, profit/loss = amount - cost; balances equal Stock Card's; opening valued; Memo Out hides the Stock ID (AC-SV-06)", async () => {
      const code = `${tagOf("D1")}${uniq()}X`;
      const load = await seed({ stoneCode: code, pcs: 4, weightCt: "2.000", salePrice: "1000", unitCost: "400", docDate: "2026-09-04" });
      await internal.hold("memo-out", doc(), [{ stockUuid: load.id, pcs: 1, weightCt: "0.500" }], { docDate: "2026-09-10", party: party() });
      await internal.hold("memo-out", doc(), [{ stockUuid: load.id, pcs: 1, weightCt: "0.500" }], { docDate: "2026-09-15", party: party() });
      const key = await cardKeyOf(load.id);
      const value = await detail(key, "?pageSize=50", both);
      const card = (await both.call("GET", `/stock-card/cards/${key}/transactions?pageSize=50`)).body;
      expect(value.items).toHaveLength(3);
      expect(value.items.map((row) => [row.docType, row.docDate, row.inPcs, row.inWeightCt, row.outPcs, row.outWeightCt, row.balancePcs, row.balanceWeightCt, row.stockId]))
        .toEqual(card.items.map((row: any) => [row.docType, row.docDate, row.inPcs, row.inWeightCt, row.outPcs, row.outWeightCt, row.balancePcs, row.balanceWeightCt, row.stockId]));
      expect(value.items.map((row) => [row.amount, row.profitLoss, row.price, row.priceSource])).toEqual([
        ["2000.00", "1200.00", "1000.0000", "PRICE_LIST"], ["1500.00", "900.00", "1000.0000", "PRICE_LIST"], ["1000.00", "600.00", "1000.0000", "PRICE_LIST"],
      ]);
      expect(value.items[1].stockId).toBeNull();
      expect(value.totals).toMatchObject({ balancePcs: 2, balanceWeightCt: "1.000", amount: "1000.00", profitLoss: "600.00", inPcs: 4, outPcs: 2 });
      expect(value.opening).toEqual({ pcs: 0, weightCt: "0.000", amount: "0.00", profitLoss: "0.00" });
      // a Start after the first document: the opening balance is valued, the rows keep their true value
      const ranged = await detail(key, "?from=2026-09-08&pageSize=50");
      expect(ranged.opening).toEqual({ pcs: 4, weightCt: "2.000", amount: "2000.00", profitLoss: "1200.00" });
      expect(ranged.items.map((row) => row.amount)).toEqual(["1500.00", "1000.00"]);
      // search, sort and paging do not change a row's value
      const searched = await detail(key, `?q=${encodeURIComponent("Nida")}&pageSize=50`);
      expect(searched.items.map((row) => row.amount)).toEqual(["1500.00", "1000.00"]);
      expect(searched.totals.amount).toBe("1000.00"); // the closing value is independent of q
      const byLoss = (dir: string) => detail(key, `?sort=profitLoss&dir=${dir}&pageSize=50`);
      expect((await byLoss("asc")).items.map((row) => row.profitLoss)).toEqual(["600.00", "900.00", "1200.00"]);
      expect((await byLoss("desc")).items.map((row) => row.profitLoss)).toEqual(["1200.00", "900.00", "600.00"]);
      const paged = await detail(key, "?pageSize=10&page=2");
      expect(paged.items).toEqual([]);
      expect(paged.total).toBe(3);
    });

    it("an unpriced card: every row and total is null; profitLoss sort falls back to the chronological order in both directions; the 0.00 opening rule", async () => {
      const code = `${tagOf("D1")}n${uniq()}X`;
      const load = await seed({ stoneCode: code, pcs: 2, weightCt: "1.000", docDate: "2026-09-04" });
      await internal.hold("memo-out", doc(), [{ stockUuid: load.id, pcs: 1, weightCt: "0.500" }], { docDate: "2026-09-10", party: party() });
      const key = await cardKeyOf(load.id);
      for (const dir of ["asc", "desc"]) {
        const page = await detail(key, `?sort=profitLoss&dir=${dir}`);
        expect(page.items.map((row) => row.docType)).toEqual(["load-to-stock", "memo-out"]);
        expect(page.items.every((row) => row.amount === null && row.profitLoss === null && row.price === null && row.priceSource === "NONE")).toBe(true);
      }
      const page = await detail(key);
      expect(page.opening).toEqual({ pcs: 0, weightCt: "0.000", amount: null, profitLoss: null });
      expect(page.totals).toMatchObject({ amount: null, profitLoss: null });
      expect(page.valuation).toEqual({ unit: "CT", price: null, priceSource: "NONE", priceSourceLabel: null, priceRef: null });
    });
  });

  // ---------------------------------------------------------------- IT-SV-D2
  describe("IT-SV-D2 detail bounds", () => {
    it("404 for an unknown and a malformed key with the same body; too many entries is STOCK_VALUE_TOO_LARGE", async () => {
      const unknown = await viewer.call("GET", `/stock-value/cards/SC${"0".repeat(32)}`);
      const malformed = await viewer.call("GET", "/stock-value/cards/not-a-key");
      for (const response of [unknown, malformed]) expect(response.status).toBe(404);
      expect(unknown.body.error).toMatchObject({ code: "STOCK_VALUE_NOT_FOUND" });
      expect({ ...malformed.body.error, requestId: "x" }).toEqual({ ...unknown.body.error, requestId: "x" });
      expect((await viewer.call("GET", `/stock-value/cards/SC${"0".repeat(32)}/transactions`)).body.error.code).toBe("STOCK_VALUE_NOT_FOUND");
      expect((await viewer.call("GET", "/stock-value/cards/zzz/transactions")).status).toBe(404);

      const code = `${tagOf("D2")}${uniq()}X`;
      const load = await seed({ stoneCode: code, pcs: 1, weightCt: "1.000", salePrice: "10" });
      const key = await cardKeyOf(load.id);
      await h.ownerDb.$executeRaw`
        INSERT INTO "inventory"."stock_movement" ("id", "stock_uuid", "kind", "document_type", "document_id", "revision", "pcs_delta", "weight_delta", "cost_delta_base", "created_by")
        SELECT gen_random_uuid(), ${load.id}::uuid, 'MEMO_OUT_RETURN', 'memo-out-return', gen_random_uuid(), 1, 1, 0.001, 0, 'test' FROM generate_series(1, 5001)`;
      const refused = await viewer.call("GET", `/stock-value/cards/${key}/transactions`);
      expect(refused.status).toBe(422);
      expect(refused.body.error).toMatchObject({ code: "STOCK_VALUE_TOO_LARGE", details: { limit: 5000, entries: 5002 } });
      expect((await viewer.call("GET", `/stock-value/cards/${key}/transactions?from=2999-01-01`)).status).toBe(422);
      expect((await viewer.call("GET", `/stock-value/cards/${key}`)).status).toBe(200); // the header has no such cap
    });

    it("a 422 for bad queries; the options are Stock Card's", async () => {
      for (const query of ["?foo=1", "?sort=docNo", "?sort=cost", "?pageSize=7", "?page=201", "?from=2026-09-10&to=2026-09-01", `?q=${"x".repeat(101)}`, "?dir=up"]) {
        const response = await viewer.call("GET", `/stock-value/cards${query}`);
        expect(response.status, query).toBe(422);
        expect(response.body.error.code).toBe("VALIDATION_ERROR");
      }
      expect((await viewer.call("GET", `/stock-value/cards/SC${"0".repeat(32)}/transactions?sort=amount`)).status).toBe(422);
      const options = await viewer.call("GET", "/stock-value/options");
      expect(options.status).toBe(200);
      expect(Array.isArray(options.body.locations)).toBe(true);
    });
  });

  // ---------------------------------------------------------------- IT-SV-A1
  describe("IT-SV-A1 HTTP authorization", () => {
    const key = `SC${"a".repeat(32)}`;
    const routes = ["/stock-value/options", "/stock-value/cards", `/stock-value/cards/${key}`, `/stock-value/cards/${key}/transactions`];

    it("401 without a cookie, 403 without stock-value:VIEW (a Stock Card-only user is refused), 200 for the grant and Super Admin; every response is no-store (AC-SV-07)", async () => {
      const stockCardOnly = await h.user(["stock-card:VIEW", "sale:VIEW"]);
      for (const route of routes) {
        expect((await h.app.request(`/api/inventory/v1${route}`)).status, route).toBe(401);
        const denied = await stockCardOnly.call("GET", route);
        expect(denied.status, route).toBe(403);
        expect(denied.body.error).toMatchObject({ code: "PERMISSION_DENIED" });
        expect(denied.response.headers.get("cache-control")).toBe("no-store");
      }
      const admin = await h.user([], { admin: true });
      for (const route of routes.slice(0, 2)) {
        const ok = await admin.call("GET", route);
        expect(ok.status, route).toBe(200);
        expect(ok.response.headers.get("cache-control")).toBe("no-store");
      }
      expect((await admin.call("GET", routes[2])).status).toBe(404);
      expect((await viewer.call("GET", routes[1])).status).toBe(200);
      // the grants are separate in the other direction too
      expect((await viewer.call("GET", "/stock-card/cards")).status).toBe(403);
      expect((await both.call("GET", "/stock-card/cards")).status).toBe(200);
    });

    it("503 when authorization is unavailable (fail closed), 403 when the license is denied; GET only", async () => {
      const user = await h.user(VALUE_GRANT);
      h.license.authzDown = true;
      try { expect((await user.call("GET", "/stock-value/cards")).status).toBe(503); } finally { h.license.authzDown = false; }
      h.license.state = "DENIED";
      try {
        const denied = await user.call("GET", "/stock-value/cards");
        expect(denied.status).toBe(403);
        expect(denied.body.error.code).toBe("LICENSE_DENIED");
      } finally { h.license.state = "ELIGIBLE"; }
      expect([404, 405]).toContain((await viewer.call("POST", "/stock-value/cards", {})).status);
    });
  });

  // ---------------------------------------------------------------- IT-SV-B1
  describe("IT-SV-B1 query budget (no N+1)", () => {
    it("list 1, RANGE list 1, header 1, transactions 2, options 1 statements; the same with 10 and 310 more cards, including cards that need a Last sale probe (AC-SV-08)", async () => {
      const tag = tagOf("B1");
      const base = await seed({ stoneCode: `${tag}-0`, pcs: 5, weightCt: "5.000", salePrice: "100", unitCost: "50" });
      for (let index = 1; index < 10; index += 1) {
        await seed({ stoneCode: `${tag}-${index}`, pcs: 2, weightCt: "1.000", salePrice: index % 2 ? "0" : "200" });
        if (index % 2) await sale({ lines: [{ stoneCode: `${tag}-${index}`, unitPrice: "300" }] });
      }
      await internal.hold("memo-out", doc(), [{ stockUuid: base.id, pcs: 1, weightCt: "1.000" }], { docDate: "2026-09-18", party: party() });
      const key = await cardKeyOf(base.id);
      const counts = async () => {
        const first = await h.measured(() => viewer.call("GET", `/stock-value/cards?q=${tag}-&pageSize=50`));
        const ranged = await h.measured(() => viewer.call("GET", `/stock-value/cards?q=${tag}-&pageSize=50&from=2026-01-01`));
        const head = await h.measured(() => viewer.call("GET", `/stock-value/cards/${key}`));
        const rows = await h.measured(() => viewer.call("GET", `/stock-value/cards/${key}/transactions`));
        const options = await h.measured(() => viewer.call("GET", "/stock-value/options"));
        for (const call of [first, ranged, head, rows, options]) expect(call.result.status).toBe(200);
        expect(first.result.body.total).toBeGreaterThanOrEqual(10);
        return { list: first.queries, ranged: ranged.queries, header: head.queries, detail: rows.queries, options: options.queries, master: [...first.master, ...ranged.master, ...head.master, ...rows.master, ...options.master] };
      };
      const few = await counts();
      expect(few).toEqual({ list: 1, ranged: 1, header: 1, detail: 2, options: 1, master: [] });
      const load = await h.ownerDb.load_to_stock.findFirstOrThrow({ where: { id: base.loadId } });
      await h.ownerDb.stock.createMany({
        data: Array.from({ length: 310 }, (_, index) => ({
          id: randomUUID(), stock_id: `W${String((stockIdBase += 1)).padStart(9, "0")}`, load_id: load.id, status: "ACTIVE", location: "Safe A", stone_code: `${tag}-m${index}`, lot: "L1", price_unit: "PER_CT",
          pcs: 1, weight_ct: "1", on_hand_pcs: 1, on_hand_weight_ct: "1", unit_cost_base: "0", cost_amount_base: "0", stock_price: "0", sale_price: index % 2 ? "0" : "50", currency_code: "THB",
          vendor_id: load.vendor_id, vendor_name_snapshot: "V", ref_doc_date: load.doc_date, ref_doc_no: load.doc_no,
        })),
      });
      const many = await counts();
      expect(many).toEqual(few);
    });
  });

  // ---------------------------------------------------------------- IT-SV-B2
  describe("IT-SV-B2 timeout and busy", () => {
    it("a statement over the limit is STOCK_VALUE_TIMEOUT and frees its slot; the transaction is read only (IT-SV-R1)", async () => {
      const slot = new ReportGuard();
      const error = await runReport(h.db, slot, { statementTimeoutMs: 150, codes: STOCK_VALUE_CODES }, (tx) => tx.$queryRaw`SELECT pg_sleep(3)`).catch((failure) => failure);
      expect(error).toBeInstanceOf(AppError);
      expect(error).toMatchObject({ status: 503, code: "STOCK_VALUE_TIMEOUT", details: { limitSeconds: 0.15 } });
      expect(slot.inFlight).toBe(0);
      const write = await runReport(h.db, slot, { codes: STOCK_VALUE_CODES }, (tx) => tx.$executeRaw`UPDATE "inventory"."stock" SET "version" = "version" WHERE false`).catch((failure) => failure);
      expect(String(write?.message ?? write)).toMatch(/read-only/i);
      const stockValue = await runReport(h.db, slot, { codes: STOCK_VALUE_CODES }, (tx) => readValueCards(tx, { page: 1, pageSize: 10, sort: "amount", dir: "desc" }));
      expect(stockValue.page).toBe(1);
    });

    it("Stock Card and Stock Value share one guard: with both slots taken either report is refused with its own code; the app serves again afterwards", async () => {
      let release: () => void = () => undefined;
      const hold = new Promise<void>((resolve) => { release = resolve; });
      const taken = [guard.run(() => hold), guard.run(() => hold)]; // e.g. two Stock Card reports in flight
      try {
        const value = await viewer.call("GET", "/stock-value/cards");
        expect(value.status).toBe(503);
        expect(value.body.error).toMatchObject({ code: "STOCK_VALUE_BUSY", details: { retryAfterSeconds: 2 } });
        expect(value.response.headers.get("retry-after")).toBe("2");
        const card = await both.call("GET", "/stock-card/cards");
        expect(card.body.error.code).toBe("STOCK_CARD_BUSY");
      } finally {
        release();
        await Promise.all(taken);
      }
      expect((await viewer.call("GET", "/stock-value/cards?pageSize=10")).status).toBe(200);
      expect(guard.inFlight).toBe(0);
      const parallel = await Promise.all([viewer.call("GET", "/stock-value/cards?pageSize=10"), both.call("GET", "/stock-card/cards?pageSize=10"), viewer.call("GET", "/stock-value/options")]);
      expect(parallel.map((response) => [200, 503].includes(response.status))).toEqual([true, true, true]);
    });
  });
});
