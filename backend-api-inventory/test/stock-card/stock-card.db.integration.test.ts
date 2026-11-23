/* eslint-disable @typescript-eslint/no-explicit-any -- JSON bodies and the loosely typed master harness */
import { createHash, randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { AppError } from "../../src/platform/errors";
import { reverseStocks } from "../../src/modules/stock/stock";
import { ReportGuard, runReport } from "../../src/modules/reports/stock-card/guard";
import { canRun, startHarness, type Harness } from "../support/harness";
import { cleanupLoads, GRANT, internalApi, seedLoad, w, type Internal, type SeededStock } from "./support";

/**
 * Stock Card on PostgreSQL (stock-card SA rev 1 testing.md): IT-SC-M1, L1-L7, A1, B1, B2, I1, I2. Own stock is seeded through the
 * owner connection; holds go through the REAL internal hold API; the report is read through the real HTTP app (cookie, JWT,
 * live authorization row). The service runs as the provisioned app role when INVENTORY_APP_TEST_DATABASE_URL is set.
 */
const TAG = randomUUID().slice(0, 8).toUpperCase();
const LOADS: string[] = [];
const code = (n: number) => `SC${TAG}N${n}X`;

let h: Harness;
let viewer: Awaited<ReturnType<Harness["user"]>>;
let internal: Internal;
let guard: ReportGuard;
let counter = 0;

async function seed(options: Parameters<typeof seedLoad>[1]) {
  const loaded = await seedLoad(h, options);
  LOADS.push(loaded.loadId);
  return loaded;
}
const uniq = () => { counter += 1; return counter; };
const cardKeyOf = async (stockUuid: string) => (await h.ownerDb.stock.findUniqueOrThrow({ where: { id: stockUuid }, select: { card_key: true } })).card_key!;
const doc = () => randomUUID();
const party = (name = "Khun Nida Jewelry") => ({ id: randomUUID(), name });
async function transactions(cardKey: string, query = "") {
  const response = await viewer.call("GET", `/stock-card/cards/${cardKey}/transactions${query}`);
  expect(response.status, JSON.stringify(response.body)).toBe(200);
  return response.body as { items: any[]; total: number; opening: any; totals: any; page: number; pageSize: number };
}
async function cards(query = "") {
  const response = await viewer.call("GET", `/stock-card/cards${query}`);
  expect(response.status, JSON.stringify(response.body)).toBe(200);
  return response.body as { items: any[]; total: number; page: number; pageSize: number; mode: string; asOf: string | null };
}

describe.runIf(canRun)("IT-SC stock card on PostgreSQL", () => {
  beforeAll(async () => {
    guard = new ReportGuard();
    h = await startHarness({ stockCard: { guard } });
    viewer = await h.user(GRANT, { name: "Stock Card Viewer" });
    internal = internalApi(h);
  });

  afterAll(async () => {
    await cleanupLoads(h, LOADS);
    await h.close();
  });

  // ---------------------------------------------------------------- IT-SC-M1
  describe("IT-SC-M1 migration objects", () => {
    it("card_key: same stone / location / lot (trimmed, any case) is one key; anything else differs; attributes stand in for an empty stone code", async () => {
      const n = uniq();
      const a = await seed({ stoneCode: code(n), location: "Safe A", lot: "L1", pcs: 1, weightCt: "1" });
      const b = await seed({ stoneCode: ` ${code(n).toLowerCase()} `, location: " safe a", lot: "l1 ", pcs: 1, weightCt: "1" });
      const otherLot = await seed({ stoneCode: code(n), location: "Safe A", lot: "L2", pcs: 1, weightCt: "1" });
      const otherLocation = await seed({ stoneCode: code(n), location: "Safe B", lot: "L1", pcs: 1, weightCt: "1" });
      const keys = await Promise.all([a, b, otherLot, otherLocation].map((stock) => cardKeyOf(stock.id)));
      expect(keys[0]).toBe(keys[1]);
      expect(new Set(keys).size).toBe(3);
      for (const key of keys) expect(key).toMatch(/^SC[0-9a-f]{32}$/);
      const expected = `SC${createHash("md5").update(`${code(n)}\u001fSAFE A\u001fL1`).digest("hex")}`;
      expect(keys[0]).toBe(expected);
      const bare = await seed({ stoneCode: "", stone: "Ruby", shape: "Oval", color: "Red", lot: `A${n}`, pcs: 1, weightCt: "1" });
      const attrs = `RUBY\u001fOVAL\u001f\u001fRED\u001f\u001f\u001f\u001fSAFE A\u001fA${n}`;
      // the stone attribute fallback: item = stone | shape | size | color | clarity | cutting | quality joined by chr(31)
      expect(await cardKeyOf(bare.id)).toBe(`SC${createHash("md5").update(attrs).digest("hex")}`);
    });

    it("the index and the new hold-document columns exist; the rollback script restores the old shape", async () => {
      const index = await h.ownerDb.$queryRaw<{ indexdef: string }[]>`SELECT indexdef FROM pg_indexes WHERE schemaname = 'inventory' AND indexname = 'stock_card_key_idx'`;
      expect(index[0]?.indexdef).toMatch(/\(card_key\)/);
      const columns = await h.ownerDb.$queryRaw<{ table_name: string; column_name: string; is_nullable: string; is_generated: string }[]>`
        SELECT table_name, column_name, is_nullable, is_generated FROM information_schema.columns
        WHERE table_schema = 'inventory' AND ((table_name = 'stock' AND column_name = 'card_key') OR (table_name = 'stock_hold_document' AND column_name IN ('doc_date', 'party_id', 'party_name'))) ORDER BY 1, 2`;
      expect(columns).toEqual([
        { table_name: "stock", column_name: "card_key", is_nullable: "YES", is_generated: "ALWAYS" },
        { table_name: "stock_hold_document", column_name: "doc_date", is_nullable: "YES", is_generated: "NEVER" },
        { table_name: "stock_hold_document", column_name: "party_id", is_nullable: "YES", is_generated: "NEVER" },
        { table_name: "stock_hold_document", column_name: "party_name", is_nullable: "NO", is_generated: "NEVER" },
      ]);
      const down = readFileSync(join(__dirname, "../../prisma/rollback/20261123090000_stock_card.down.sql"), "utf8");
      const statements = down.split("\n").filter((line) => !line.trim().startsWith("--")).join("\n").split(";").map((sql) => sql.trim()).filter(Boolean);
      expect(statements).toHaveLength(3);
      class Rollback extends Error {}
      let after: { n: number }[] = [];
      await h.ownerDb.$transaction(async (tx) => {
        for (const statement of statements) await tx.$executeRawUnsafe(statement);
        after = await tx.$queryRaw<{ n: number }[]>`
          SELECT count(*)::int AS n FROM information_schema.columns WHERE table_schema = 'inventory'
          AND ((table_name = 'stock' AND column_name = 'card_key') OR (table_name = 'stock_hold_document' AND column_name IN ('doc_date', 'party_id', 'party_name')))`;
        throw new Rollback();
      }).catch((error) => { if (!(error instanceof Rollback)) throw error; });
      expect(after[0].n).toBe(0);
      const kept = await h.ownerDb.$queryRaw<{ n: number }[]>`SELECT count(*)::int AS n FROM information_schema.columns WHERE table_schema = 'inventory' AND table_name = 'stock' AND column_name = 'card_key'`;
      expect(kept[0].n).toBe(1);
    });
  });

  // ---------------------------------------------------------------- IT-SC-L1 / L2
  describe("IT-SC-L1 ledger reads and IT-SC-L2 Reserve", () => {
    it("Load 4, Memo Out 2, Memo Out Return 2: IN 4 / OUT 2 / IN 2, balances 4 / 2 / 4, totals, Stock ID rule, captions", async () => {
      const n = uniq();
      const load = await seed({ stoneCode: code(n), docDate: "2026-09-04", docNo: `LS-L1-${TAG}`, pcs: 4, weightCt: "1.240", vendorName: "Bangkok Gem Supply" });
      const customer = party();
      const out = doc();
      const back = doc();
      expect((await internal.hold("memo-out", out, [{ stockUuid: load.id, pcs: 2, weightCt: "0.620" }], { docDate: "2026-09-18", party: customer }, `MO-${TAG}`)).status).toBe(200);
      expect((await internal.hold("memo-out-return", back, [{ stockUuid: load.id, pcs: 2, weightCt: "0.620" }], { docDate: "2026-10-02", party: customer }, `MOR-${TAG}`)).status).toBe(200);

      const list = await cards(`?q=${code(n)}`);
      expect(list).toMatchObject({ total: 1, mode: "CURRENT", asOf: null, page: 1, pageSize: 25 });
      expect(list.items[0]).toMatchObject({ stoneCode: code(n), location: "Safe A", lot: "L1", vendorName: "Bangkok Gem Supply", vendorCount: 1, balancePcs: 4, balanceWeightCt: "1.240" });
      const key = list.items[0].cardKey;
      expect(await cardKeyOf(load.id)).toBe(key);

      const header = await viewer.call("GET", `/stock-card/cards/${key}`);
      expect(header.status).toBe(200);
      expect(header.body).toMatchObject({ cardKey: key, stoneCode: code(n), stone: "Sapphire", shape: "Oval", color: "Blue", location: "Safe A", lot: "L1", currentBalancePcs: 4, currentBalanceWeightCt: "1.240", vendorName: "Bangkok Gem Supply", vendorCount: 1 });

      const page = await transactions(key);
      expect(page.total).toBe(3);
      expect(page.items.map((row) => [row.docType, row.docTypeLabel, row.docNo, row.docDate])).toEqual([
        ["load-to-stock", "Load to Stock", `LS-L1-${TAG}`, "2026-09-04"],
        ["memo-out", "Memo Out", `MO-${TAG}`, "2026-09-18"],
        ["memo-out-return", "Memo Out Return", `MOR-${TAG}`, "2026-10-02"],
      ]);
      expect(page.items.map((row) => [row.inPcs, row.inWeightCt, row.outPcs, row.outWeightCt, row.balancePcs, row.balanceWeightCt])).toEqual([
        [4, "1.240", null, null, 4, "1.240"],
        [null, null, 2, "0.620", 2, "0.620"],
        [2, "0.620", null, null, 4, "1.240"],
      ]);
      expect(page.items.map((row) => row.stockId)).toEqual([load.stockId, null, load.stockId]);
      expect(page.items.map((row) => row.stockIdExtra)).toEqual([0, 0, 0]);
      expect(page.items.map((row) => row.accountName)).toEqual(["Bangkok Gem Supply", "Khun Nida Jewelry", "Khun Nida Jewelry"]);
      expect(page.items[1].accountId).toBe(customer.id);
      expect(page.items[0].id).toBe(`load-to-stock:${load.loadId}`);
      expect(page.opening).toEqual({ pcs: 0, weightCt: "0.000" });
      expect(page.totals).toEqual({ inPcs: 6, inWeightCt: "1.860", outPcs: 2, outWeightCt: "0.620", balancePcs: 4, balanceWeightCt: "1.240" });
    });

    it("Reserve is not a movement: no row, balance unchanged; release the same", async () => {
      const n = uniq();
      const load = await seed({ stoneCode: code(n), pcs: 4, weightCt: "2.000" });
      const key = await cardKeyOf(load.id);
      const reserve = doc();
      expect((await internal.hold("reserve", reserve, [{ stockUuid: load.id, pcs: 1, weightCt: "0.500" }], { docDate: "2026-09-10", party: party() })).status).toBe(200);
      let page = await transactions(key);
      expect(page.items.map((row) => row.docType)).toEqual(["load-to-stock"]);
      expect(page.totals.balancePcs).toBe(4);
      expect((await cards(`?q=${code(n)}`)).items[0]).toMatchObject({ balancePcs: 4, balanceWeightCt: "2.000" });
      expect((await internal.hold("reserve", reserve, [])).status).toBe(200);
      page = await transactions(key);
      expect(page.items).toHaveLength(1);
      expect((await cards(`?q=${code(n)}`)).items[0]).toMatchObject({ balancePcs: 4, balanceWeightCt: "2.000" });
    });
  });

  // ---------------------------------------------------------------- IT-SC-L3
  describe("IT-SC-L3 edits and deletes", () => {
    it("Memo Out 5 -> 3 shows OUT 3; deleting it leaves no row; a Load edit shows the new net; deleting the Load removes the card", async () => {
      const n = uniq();
      const load = await seed({ stoneCode: code(n), pcs: 6, weightCt: "3.000" });
      const key = await cardKeyOf(load.id);
      const out = doc();
      await internal.hold("memo-out", out, [{ stockUuid: load.id, pcs: 5, weightCt: "2.500" }], { docDate: "2026-09-18", party: party() });
      expect((await transactions(key)).items[1]).toMatchObject({ docType: "memo-out", outPcs: 5, outWeightCt: "2.500", balancePcs: 1 });
      await internal.hold("memo-out", out, [{ stockUuid: load.id, pcs: 3, weightCt: "1.500" }]);
      let page = await transactions(key);
      expect(page.items[1]).toMatchObject({ docType: "memo-out", outPcs: 3, outWeightCt: "1.500", balancePcs: 3, balanceWeightCt: "1.500" });
      expect(page.items[1].docDate).toBe("2026-09-18"); // an absent docDate leaves the stored one
      await internal.hold("memo-out", out, []);
      page = await transactions(key);
      expect(page.items.map((row) => row.docType)).toEqual(["load-to-stock"]);
      expect(page.totals.balancePcs).toBe(6);

      // an applied Load edit (LOAD_ADJUST +2 pcs / +1 ct) is the Load row's new net
      await h.ownerDb.$transaction([
        h.ownerDb.$executeRaw`UPDATE "inventory"."stock" SET "pcs" = 8, "weight_ct" = 4.000, "on_hand_pcs" = 8, "on_hand_weight_ct" = 4.000 WHERE "id" = ${load.id}::uuid`,
        h.ownerDb.$executeRaw`INSERT INTO "inventory"."stock_movement" ("id", "stock_uuid", "kind", "document_type", "document_id", "revision", "pcs_delta", "weight_delta", "cost_delta_base", "created_by")
          VALUES (${randomUUID()}::uuid, ${load.id}::uuid, 'LOAD_ADJUST', 'load-to-stock', ${load.loadId}::uuid, 2, 2, 1.000, 0, 'test')`,
      ]);
      page = await transactions(key);
      expect(page.items).toHaveLength(1);
      expect(page.items[0]).toMatchObject({ inPcs: 8, inWeightCt: "4.000", balancePcs: 8 });
      expect((await cards(`?q=${code(n)}`)).items[0].balancePcs).toBe(8);

      // deleting the Load reverses its stock: no rows, and the card leaves the CURRENT list and 404s
      await h.db.$transaction((tx) => reverseStocks(tx, { loadId: load.loadId, currency: "THB", vendorId: randomUUID(), vendorName: "", revision: 3, actorId: "test", refDocDate: "2026-09-04", refDocNo: load.docNo },
        [{ id: load.id, stock_id: load.stockId, pcs: 8, weight_ct: "4.000", cost_amount_base: "0", on_hand_pcs: 8, on_hand_weight_ct: "4.000" }]));
      expect((await cards(`?q=${code(n)}`)).total).toBe(0);
      expect((await viewer.call("GET", `/stock-card/cards/${key}`)).status).toBe(404);
      expect((await viewer.call("GET", `/stock-card/cards/${key}/transactions`)).status).toBe(404);
    });
  });

  // ---------------------------------------------------------------- IT-SC-L4
  describe("IT-SC-L4 invariant after a seeded random sequence", () => {
    it("for every stock the card-kind deltas sum to on_hand + reserved, and CURRENT equals RANGE without dates", async () => {
      const n = uniq();
      const stocks: SeededStock[] = [];
      for (let index = 0; index < 4; index += 1) stocks.push(await seed({ stoneCode: code(n), lot: `P${index % 2}`, location: index < 2 ? "Safe A" : "Safe B", pcs: 6, weightCt: "3.000" }));
      let seedValue = 20_261_123;
      const random = () => { seedValue = (seedValue * 1_664_525 + 1_013_904_223) % 4_294_967_296; return seedValue / 4_294_967_296; };
      const docs = { reserve: [doc(), doc()], "memo-out": [doc(), doc()], "memo-out-return": [doc(), doc()] } as const;
      let applied = 0;
      for (let step = 0; step < 70; step += 1) {
        const type = (["reserve", "memo-out", "memo-out-return"] as const)[Math.floor(random() * 3)];
        const documentId = docs[type][Math.floor(random() * 2)];
        const chosen = stocks.filter(() => random() < 0.6).map((stock) => {
          const pcs = 1 + Math.floor(random() * 3);
          return { stockUuid: stock.id, pcs, weightCt: w(pcs * 0.5) };
        });
        const result = await internal.hold(type, documentId, random() < 0.15 ? [] : chosen, random() < 0.5 ? { docDate: `2026-10-${String(1 + Math.floor(random() * 20)).padStart(2, "0")}`, party: party() } : {});
        if (result.status === 200) applied += 1;
      }
      expect(applied).toBeGreaterThan(15);
      const rows = await h.ownerDb.$queryRaw<{ id: string; ledger_pcs: number; ledger_weight: string; book_pcs: number; book_weight: string }[]>`
        SELECT s."id", COALESCE(sum(m."pcs_delta") FILTER (WHERE m."kind" IN ('LOAD_IN', 'LOAD_ADJUST', 'LOAD_REVERSAL', 'MEMO_OUT', 'MEMO_OUT_REVERSAL', 'MEMO_OUT_RETURN', 'MEMO_OUT_RETURN_REVERSAL')), 0)::int AS "ledger_pcs",
          COALESCE(sum(m."weight_delta") FILTER (WHERE m."kind" IN ('LOAD_IN', 'LOAD_ADJUST', 'LOAD_REVERSAL', 'MEMO_OUT', 'MEMO_OUT_REVERSAL', 'MEMO_OUT_RETURN', 'MEMO_OUT_RETURN_REVERSAL')), 0)::text AS "ledger_weight",
          (s."on_hand_pcs" + s."reserved_pcs") AS "book_pcs", (s."on_hand_weight_ct" + s."reserved_weight_ct")::text AS "book_weight"
        FROM "inventory"."stock" s LEFT JOIN "inventory"."stock_movement" m ON m."stock_uuid" = s."id" WHERE s."id" = ANY(${stocks.map((stock) => stock.id)}::uuid[]) GROUP BY s."id"`;
      for (const row of rows) {
        expect(row.ledger_pcs).toBe(row.book_pcs);
        expect(w(row.ledger_weight)).toBe(w(row.book_weight));
      }
      const current = await cards(`?q=${code(n)}&pageSize=50`);
      const ranged = await cards(`?q=${code(n)}&pageSize=50&from=2000-01-01&to=2100-01-01`);
      const pick = (page: { items: any[] }) => page.items.filter((item) => item.balancePcs !== 0 || item.balanceWeightCt !== "0.000").map((item) => [item.cardKey, item.balancePcs, item.balanceWeightCt]).sort();
      expect(pick(ranged)).toEqual(pick(current));
      for (const item of current.items) {
        const detail = await transactions(item.cardKey, "?pageSize=50");
        expect(detail.totals.balancePcs).toBe(item.balancePcs);
        expect(detail.totals.balanceWeightCt).toBe(item.balanceWeightCt);
        const last = detail.items[detail.items.length - 1];
        expect(last ? last.balancePcs : 0).toBe(item.balancePcs);
        expect(detail.totals.inPcs - detail.totals.outPcs).toBe(item.balancePcs);
      }
    });
  });

  // ---------------------------------------------------------------- IT-SC-L5
  describe("IT-SC-L5 dates", () => {
    it("the balance at Due ignores later documents; with Start the first row carries earlier movements and opening matches", async () => {
      const n = uniq();
      const load = await seed({ stoneCode: code(n), docDate: "2026-09-04", pcs: 4, weightCt: "1.240" });
      const key = await cardKeyOf(load.id);
      const out = doc();
      const back = doc();
      await internal.hold("memo-out", out, [{ stockUuid: load.id, pcs: 2, weightCt: "0.620" }], { docDate: "2026-09-18", party: party() });
      await internal.hold("memo-out-return", back, [{ stockUuid: load.id, pcs: 2, weightCt: "0.620" }], { docDate: "2026-10-02", party: party() });

      const atDue = await cards(`?q=${code(n)}&to=2026-09-20`);
      expect(atDue).toMatchObject({ mode: "RANGE", asOf: "2026-09-20" });
      expect(atDue.items[0]).toMatchObject({ balancePcs: 2, balanceWeightCt: "0.620" });
      const detailDue = await transactions(key, "?to=2026-09-20");
      expect(detailDue.items.map((row) => row.docType)).toEqual(["load-to-stock", "memo-out"]);
      expect(detailDue.totals).toMatchObject({ balancePcs: 2, balanceWeightCt: "0.620", inPcs: 4, outPcs: 2 });

      const detailStart = await transactions(key, "?from=2026-09-10");
      expect(detailStart.opening).toEqual({ pcs: 4, weightCt: "1.240" });
      expect(detailStart.items.map((row) => [row.docType, row.balancePcs])).toEqual([["memo-out", 2], ["memo-out-return", 4]]);
      expect(detailStart.totals).toEqual({ inPcs: 2, inWeightCt: "0.620", outPcs: 2, outWeightCt: "0.620", balancePcs: 4, balanceWeightCt: "1.240" });

      // a card without an entry in the range and without balance at Due is hidden; one with an entry is shown
      expect((await cards(`?q=${code(n)}&from=2026-09-10&to=2026-09-12`)).items[0]).toMatchObject({ balancePcs: 4 });
      expect((await cards(`?q=${code(n)}&to=2026-09-01`)).total).toBe(0);
    });

    it("a hold document without metadata falls back to the first movement's Bangkok date (midnight boundary at +07:00)", async () => {
      const n = uniq();
      const load = await seed({ stoneCode: code(n), docDate: "2026-09-04", pcs: 4, weightCt: "4.000" });
      const key = await cardKeyOf(load.id);
      const late = doc();
      const early = doc();
      await internal.hold("memo-out", late, [{ stockUuid: load.id, pcs: 1, weightCt: "1.000" }]);
      await internal.hold("memo-out", early, [{ stockUuid: load.id, pcs: 1, weightCt: "1.000" }]);
      await h.ownerDb.$executeRaw`UPDATE "inventory"."stock_movement" SET "created_at" = '2026-09-30T17:30:00Z' WHERE "document_id" = ${late}::uuid`;
      await h.ownerDb.$executeRaw`UPDATE "inventory"."stock_movement" SET "created_at" = '2026-09-30T16:59:00Z' WHERE "document_id" = ${early}::uuid`;
      const page = await transactions(key);
      const byId = new Map(page.items.map((row) => [row.docId, row]));
      expect(byId.get(late)).toMatchObject({ docDate: "2026-10-01", accountName: "", accountId: null });
      expect(byId.get(early)?.docDate).toBe("2026-09-30");
      expect(page.items.map((row) => row.docId)).toEqual([load.loadId, early, late]);
    });
  });

  // ---------------------------------------------------------------- IT-SC-L6
  describe("IT-SC-L6 list", () => {
    it("search, location filter, every sort with dir, numbered paging with an exact total, zero balance rules, two stocks in one card", async () => {
      const n = uniq();
      const tag = `L6${TAG}N${n}X`;
      const specs = [
        { stoneCode: `${tag}-B`, location: "Safe B", lot: "L9", pcs: 3, weightCt: "0.900", vendorName: `Vend ${tag} Beta` },
        { stoneCode: `${tag}-A`, location: "Safe A", lot: "L7", pcs: 5, weightCt: "2.500", vendorName: `Vend ${tag} Alpha` },
        { stoneCode: `${tag}-C`, location: "Safe A", lot: "L8", pcs: 1, weightCt: "5.000", vendorName: `Vend ${tag} Gamma` },
      ];
      const stocks = [];
      for (const spec of specs) stocks.push(await seed(spec));
      // a second stock of card A (same stone / location / lot, another vendor, newer): one card, vendorCount 2, newest vendor shown
      const second = await seed({ stoneCode: `${tag}-A`, location: "Safe A", lot: "L7", pcs: 2, weightCt: "0.500", vendorName: `Vend ${tag} Delta` });
      const listed = await cards(`?q=${tag}&pageSize=50`);
      expect(listed.total).toBe(3);
      const a = listed.items.find((item) => item.stoneCode === `${tag}-A`);
      expect(a).toMatchObject({ balancePcs: 7, balanceWeightCt: "3.000", vendorCount: 2, vendorName: `Vend ${tag} Delta` });

      const order = async (sort: string, dir: string) => (await cards(`?q=${tag}&sort=${sort}&dir=${dir}`)).items.map((item) => item.stoneCode.slice(-1));
      expect(await order("stoneCode", "asc")).toEqual(["A", "B", "C"]);
      expect(await order("stoneCode", "desc")).toEqual(["C", "B", "A"]);
      expect(await order("location", "asc")).toEqual(["A", "C", "B"]);
      expect(await order("location", "desc")).toEqual(["B", "A", "C"]);
      expect(await order("lot", "asc")).toEqual(["A", "C", "B"]);
      expect(await order("lot", "desc")).toEqual(["B", "C", "A"]);
      expect(await order("balancePcs", "asc")).toEqual(["C", "B", "A"]);
      expect(await order("balancePcs", "desc")).toEqual(["A", "B", "C"]);
      expect(await order("balanceWeightCt", "asc")).toEqual(["B", "A", "C"]);
      expect(await order("balanceWeightCt", "desc")).toEqual(["C", "A", "B"]);

      // search terms: stone code, lot, vendor, visible Stock ID (case-insensitive contains)
      expect((await cards(`?q=${tag.toLowerCase()}-b`)).total).toBe(1);
      expect((await cards(`?q=${tag}&location=safe%20a`)).total).toBe(2);
      const byLot = await cards(`?q=L8&location=Safe%20A&pageSize=50`);
      expect(byLot.items.some((item) => item.stoneCode === `${tag}-C`)).toBe(true);
      expect((await cards(`?q=Vend%20${tag}%20Gamma`)).items.map((item) => item.stoneCode)).toEqual([`${tag}-C`]);
      expect((await cards(`?q=${stocks[0].stockId}`)).items.map((item) => item.stoneCode)).toEqual([`${tag}-B`]);
      expect((await cards(`?q=${tag}%25`)).total).toBe(0); // % is a literal, not a wildcard
      expect((await cards(`?q=${tag}_A`)).total).toBe(0); // _ is a literal too
      expect((await cards(`?q=%25`)).total).toBe(0);

      // numbered paging with an exact total, also past the last page
      const page1 = await cards(`?q=${tag}&pageSize=10&sort=stoneCode`);
      expect(page1).toMatchObject({ total: 3, page: 1, pageSize: 10 });
      const past = await cards(`?q=${tag}&pageSize=10&page=3`);
      expect(past).toMatchObject({ total: 3, items: [] });
      const paged = [...(await cards(`?q=${tag}&pageSize=10`)).items];
      expect(paged).toHaveLength(3);
      for (let page = 1; page <= 2; page += 1) {
        const slice = await cards(`?q=${tag}&pageSize=10&page=${page}&sort=lot`);
        expect(slice.total).toBe(3);
      }

      // zero balance: hidden in CURRENT, shown in RANGE with an entry in the range, hidden in RANGE with none
      const out = doc();
      const back = doc();
      await internal.hold("memo-out", out, [{ stockUuid: stocks[2].id, pcs: 1, weightCt: "5.000" }], { docDate: "2026-09-18", party: party() });
      expect((await cards(`?q=${tag}-C`)).total).toBe(0);
      const inRange = await cards(`?q=${tag}-C&from=2026-09-01&to=2026-10-01`);
      expect(inRange.items[0]).toMatchObject({ balancePcs: 0, balanceWeightCt: "0.000" }); // the Load (04/09) is the entry in range
      expect((await cards(`?q=${tag}-C&from=2026-12-01`)).total).toBe(0);
      await internal.hold("memo-out-return", back, [{ stockUuid: stocks[2].id, pcs: 1, weightCt: "5.000" }], { docDate: "2026-10-02", party: party() });
      expect((await cards(`?q=${tag}-C`)).items[0]).toMatchObject({ balancePcs: 1 });
      expect(second.stockId).toBeTruthy();
    });

    it("options list the distinct locations of active stock", async () => {
      const n = uniq();
      await seed({ stoneCode: code(n), location: `Vault ${TAG}`, pcs: 1, weightCt: "1.000" });
      const response = await viewer.call("GET", "/stock-card/options");
      expect(response.status).toBe(200);
      expect(response.body.locations).toContain(`Vault ${TAG}`);
      expect(new Set(response.body.locations).size).toBe(response.body.locations.length);
      expect(response.body.locations.length).toBeLessThanOrEqual(500);
    });
  });

  // ---------------------------------------------------------------- IT-SC-L7
  describe("IT-SC-L7 detail", () => {
    it("404 for unknown and malformed keys (same body), filters, sorts, pages, the balance independent of sort and q, totals over the filtered set", async () => {
      const unknown = await viewer.call("GET", `/stock-card/cards/SC${"0".repeat(32)}`);
      const malformed = await viewer.call("GET", "/stock-card/cards/not-a-key");
      const malformedTx = await viewer.call("GET", "/stock-card/cards/not-a-key/transactions");
      expect([unknown.status, malformed.status, malformedTx.status]).toEqual([404, 404, 404]);
      expect(unknown.body.error.code).toBe("STOCK_CARD_NOT_FOUND");
      expect({ ...malformed.body.error, requestId: "" }).toEqual({ ...unknown.body.error, requestId: "" });
      expect((await viewer.call("GET", `/stock-card/cards/SC${"0".repeat(32)}/transactions`)).body.error.code).toBe("STOCK_CARD_NOT_FOUND");

      const n = uniq();
      const load = await seed({ stoneCode: code(n), docDate: "2026-09-01", docNo: `LS-L7-${TAG}`, pcs: 10, weightCt: "10.000", vendorName: "Zeta Vendor" });
      const key = await cardKeyOf(load.id);
      const customerA = party("Alpha Customer");
      const customerB = party("Beta Customer");
      const ids = [doc(), doc(), doc()];
      await internal.hold("memo-out", ids[0], [{ stockUuid: load.id, pcs: 3, weightCt: "3.000" }], { docDate: "2026-09-05", party: customerA }, `MO-A-${TAG}`);
      await internal.hold("memo-out", ids[1], [{ stockUuid: load.id, pcs: 2, weightCt: "2.000" }], { docDate: "2026-09-10", party: customerB }, `MO-B-${TAG}`);
      await internal.hold("memo-out-return", ids[2], [{ stockUuid: load.id, pcs: 1, weightCt: "1.000" }], { docDate: "2026-09-15", party: customerA }, `MOR-A-${TAG}`);

      const asc = await transactions(key, "?sort=date&dir=asc");
      expect(asc.items.map((row) => row.balancePcs)).toEqual([10, 7, 5, 6]);
      const desc = await transactions(key, "?sort=date&dir=desc");
      expect(desc.items.map((row) => row.balancePcs)).toEqual([6, 5, 7, 10]);
      const byDoc = await transactions(key, "?sort=docNo&dir=asc");
      expect(byDoc.items.map((row) => row.docNo)).toEqual([...byDoc.items.map((row) => row.docNo)].sort());
      const byAccount = await transactions(key, "?sort=account&dir=asc");
      expect(byAccount.items.map((row) => row.accountName)).toEqual(["Alpha Customer", "Alpha Customer", "Beta Customer", "Zeta Vendor"]);
      const byStock = await transactions(key, "?sort=stockId&dir=asc");
      expect(byStock.items[byStock.items.length - 1].stockId).toBeNull(); // hidden Stock IDs sort last
      // the running balance is the chronological one whatever the sort
      for (const page of [desc, byDoc, byAccount, byStock]) {
        const byId = new Map(page.items.map((row) => [row.id, row.balancePcs]));
        for (const row of asc.items) expect(byId.get(row.id)).toBe(row.balancePcs);
      }

      // q: document number, account name, visible Stock ID; the balance and the closing balance ignore it
      const q = await transactions(key, `?q=${encodeURIComponent(`MO-A-${TAG}`)}`);
      expect(q.items.map((row) => row.docNo)).toEqual([`MO-A-${TAG}`]);
      expect(q.items[0].balancePcs).toBe(7);
      expect(q.total).toBe(1);
      expect(q.totals).toEqual({ inPcs: 0, inWeightCt: "0.000", outPcs: 3, outWeightCt: "3.000", balancePcs: 6, balanceWeightCt: "6.000" });
      expect((await transactions(key, "?q=alpha")).items.map((row) => row.accountName)).toEqual(["Alpha Customer", "Alpha Customer"]);
      const byId = await transactions(key, `?q=${load.stockId}`);
      expect(byId.items.map((row) => row.docType)).toEqual(["load-to-stock", "memo-out-return"]); // never the hidden Memo Out rows

      // paging over the filtered set
      const small = await transactions(key, "?pageSize=10&page=1&from=2026-09-05");
      expect(small.total).toBe(3);
      const secondPage = await transactions(key, "?pageSize=10&page=2");
      expect(secondPage).toMatchObject({ total: 4, items: [] });
      const both = await Promise.all([1, 2].map(async (page) => (await viewer.call("GET", `/stock-card/cards/${key}/transactions?pageSize=10&page=${page}`)).status));
      expect(both).toEqual([200, 200]);
    });

    it("a card with more than 5,000 entries is refused with STOCK_CARD_TOO_LARGE", async () => {
      const n = uniq();
      const load = await seed({ stoneCode: code(n), pcs: 1, weightCt: "1.000" });
      const key = await cardKeyOf(load.id);
      await h.ownerDb.$executeRaw`
        INSERT INTO "inventory"."stock_movement" ("id", "stock_uuid", "kind", "document_type", "document_id", "revision", "pcs_delta", "weight_delta", "cost_delta_base", "created_by")
        SELECT gen_random_uuid(), ${load.id}::uuid, 'MEMO_OUT_RETURN', 'memo-out-return', gen_random_uuid(), 1, 1, 0.001, 0, 'test' FROM generate_series(1, 5001)`;
      const refused = await viewer.call("GET", `/stock-card/cards/${key}/transactions`);
      expect(refused.status).toBe(422);
      expect(refused.body.error).toMatchObject({ code: "STOCK_CARD_TOO_LARGE", details: { limit: 5000 } });
      expect(refused.body.error.details.entries).toBe(5002);
      // the cap applies before the date filter
      expect((await viewer.call("GET", `/stock-card/cards/${key}/transactions?from=2999-01-01`)).status).toBe(422);
    });

    it("a 422 for bad queries: unknown key, bad sort, pageSize, page > 200, from after to, long q", async () => {
      const bad = ["?foo=1", "?sort=docNo", "?pageSize=7", "?page=201", "?page=0", "?from=2026-02-30", "?from=2026-09-10&to=2026-09-01", `?q=${"x".repeat(101)}`, "?dir=up"];
      for (const query of bad) {
        const response = await viewer.call("GET", `/stock-card/cards${query}`);
        expect(response.status, query).toBe(422);
        expect(response.body.error.code).toBe("VALIDATION_ERROR");
      }
      const range = await viewer.call("GET", "/stock-card/cards?from=2026-09-10&to=2026-09-01");
      expect(range.body.error.details.fieldErrors).toEqual([{ path: "to", code: "before_from" }]);
      const tooBig = await viewer.call("GET", "/stock-card/cards?page=201");
      expect(tooBig.body.error.details.fieldErrors).toEqual([{ path: "page", code: "too_large" }]);
      const repeated = await viewer.call("GET", "/stock-card/cards?page=1&page=2");
      expect(repeated.status).toBe(422);
      expect((await viewer.call("GET", `/stock-card/cards/SC${"0".repeat(32)}/transactions?sort=account&pageSize=99`)).status).toBe(422);
    });
  });

  // ---------------------------------------------------------------- IT-SC-A1
  describe("IT-SC-A1 HTTP authorization", () => {
    const routes = ["/stock-card/options", "/stock-card/cards", `/stock-card/cards/SC${"a".repeat(32)}`, `/stock-card/cards/SC${"a".repeat(32)}/transactions`];

    it("401 without a cookie, 403 without stock-card:VIEW, 200 for the grant and for Super Admin; every response is no-store", async () => {
      for (const route of routes) {
        const anonymous = await h.app.request(`/api/inventory/v1${route}`);
        expect(anonymous.status, route).toBe(401);
        const denied = await (await h.user(["load-to-stock:VIEW", "sale:VIEW", "stock-card:PRINT"])).call("GET", route);
        expect(denied.status, route).toBe(403);
        expect(denied.body.error.code).toBe("PERMISSION_DENIED");
        expect(denied.response.headers.get("cache-control")).toBe("no-store");
      }
      const admin = await h.user([], { admin: true });
      for (const route of routes.slice(0, 2)) {
        const ok = await admin.call("GET", route);
        expect(ok.status, route).toBe(200);
        expect(ok.response.headers.get("cache-control")).toBe("no-store");
      }
      expect((await admin.call("GET", routes[2])).status).toBe(404); // authorized, unknown key
      expect((await viewer.call("GET", routes[1])).status).toBe(200);
    });

    it("503 when authorization is unavailable (fail closed) and 403 when the license is denied", async () => {
      const user = await h.user(GRANT);
      h.license.authzDown = true;
      try { expect((await user.call("GET", "/stock-card/cards")).status).toBe(503); } finally { h.license.authzDown = false; }
      h.license.state = "DENIED";
      try {
        const denied = await user.call("GET", "/stock-card/cards");
        expect(denied.status).toBe(403);
        expect(denied.body.error.code).toBe("LICENSE_DENIED");
      } finally { h.license.state = "ELIGIBLE"; }
    });

    it("the report is GET only: a POST to a stock-card route is not a route", async () => {
      const response = await viewer.call("POST", "/stock-card/cards", {});
      expect([404, 405]).toContain(response.status);
    });
  });

  // ---------------------------------------------------------------- IT-SC-B1
  describe("IT-SC-B1 query budget (no N+1)", () => {
    it("list 1, header 1, transactions 2, options 1 statements, the same with 10 and 300 more cards, and no master call", async () => {
      const n = uniq();
      const tag = `B1${TAG}N${n}X`;
      const base = await seed({ stoneCode: `${tag}-0`, pcs: 5, weightCt: "5.000" });
      for (let index = 1; index < 10; index += 1) await seed({ stoneCode: `${tag}-${index}`, pcs: 2, weightCt: "1.000" });
      await internal.hold("memo-out", doc(), [{ stockUuid: base.id, pcs: 1, weightCt: "1.000" }], { docDate: "2026-09-18", party: party() });
      const key = await cardKeyOf(base.id);
      const counts = async () => {
        const list = await h.measured(() => viewer.call("GET", `/stock-card/cards?q=${tag}&pageSize=50`));
        const ranged = await h.measured(() => viewer.call("GET", `/stock-card/cards?q=${tag}&pageSize=50&from=2026-01-01`));
        const header = await h.measured(() => viewer.call("GET", `/stock-card/cards/${key}`));
        const detail = await h.measured(() => viewer.call("GET", `/stock-card/cards/${key}/transactions`));
        const options = await h.measured(() => viewer.call("GET", "/stock-card/options"));
        for (const call of [list, ranged, header, detail, options]) expect(call.result.status).toBe(200);
        expect(list.result.body.total).toBeGreaterThanOrEqual(10);
        return { list: list.queries, ranged: ranged.queries, header: header.queries, detail: detail.queries, options: options.queries, master: [...list.master, ...ranged.master, ...header.master, ...detail.master, ...options.master] };
      };
      const few = await counts();
      expect(few).toEqual({ list: 1, ranged: 1, header: 1, detail: 2, options: 1, master: [] });
      // 300 more cards in one multi-row insert: the statement counts do not move
      const load = await h.ownerDb.load_to_stock.findFirstOrThrow({ where: { id: base.loadId } });
      await h.ownerDb.stock.createMany({
        data: Array.from({ length: 300 }, (_, index) => ({
          id: randomUUID(), stock_id: `B${String(uniq() * 1000 + index).padStart(9, "0")}`.slice(0, 10), load_id: load.id, status: "ACTIVE", location: "Safe A", stone_code: `${tag}-m${index}`, lot: "L1", price_unit: "PER_CT",
          pcs: 1, weight_ct: "1", on_hand_pcs: 1, on_hand_weight_ct: "1", unit_cost_base: "0", cost_amount_base: "0", stock_price: "0", sale_price: "0", currency_code: "THB",
          vendor_id: load.vendor_id, vendor_name_snapshot: "V", ref_doc_date: load.doc_date, ref_doc_no: load.doc_no,
        })),
      });
      const many = await counts();
      expect(many).toEqual(few);
    });
  });

  // ---------------------------------------------------------------- IT-SC-B2
  describe("IT-SC-B2 timeout and busy", () => {
    it("a statement over the limit is STOCK_CARD_TIMEOUT and frees its slot; the transaction is read only", async () => {
      const slot = new ReportGuard();
      const error = await runReport(h.db, slot, { statementTimeoutMs: 150 }, (tx) => tx.$queryRaw`SELECT pg_sleep(3)`).catch((failure) => failure);
      expect(error).toBeInstanceOf(AppError);
      expect(error).toMatchObject({ status: 503, code: "STOCK_CARD_TIMEOUT", details: { limitSeconds: 0.15 } });
      expect(slot.inFlight).toBe(0);
      const readOnly = await runReport(h.db, slot, {}, (tx) => tx.$queryRaw<{ transaction_read_only: string }[]>`SHOW transaction_read_only`);
      expect(readOnly[0].transaction_read_only).toBe("on");
      const write = await runReport(h.db, slot, {}, (tx) => tx.$executeRaw`UPDATE "inventory"."stock" SET "version" = "version" WHERE false`).catch((failure) => failure);
      expect(String(write?.message ?? write)).toMatch(/read-only/i);
    });

    it("the third concurrent report waits at most 250 ms and gets STOCK_CARD_BUSY with Retry-After; HTTP returns 503", async () => {
      const busy = new ReportGuard(2, 60);
      const results = await Promise.allSettled([1, 2, 3].map(() => runReport(h.db, busy, {}, (tx) => tx.$queryRaw`SELECT 1 AS one FROM pg_sleep(0.4)`)));
      expect(results.filter((result) => result.status === "fulfilled")).toHaveLength(2);
      const refused = results.filter((result): result is PromiseRejectedResult => result.status === "rejected");
      expect(refused).toHaveLength(1);
      expect(refused[0].reason).toMatchObject({ status: 503, code: "STOCK_CARD_BUSY", headers: { "Retry-After": "2" } });

      // over HTTP: both slots of the app's guard are taken, the request waits the 250 ms and is refused
      let release: () => void = () => undefined;
      const hold = new Promise<void>((resolve) => { release = resolve; });
      const taken = [guard.run(() => hold), guard.run(() => hold)];
      try {
        const response = await viewer.call("GET", "/stock-card/cards");
        expect(response.status).toBe(503);
        expect(response.body.error).toMatchObject({ code: "STOCK_CARD_BUSY", details: { retryAfterSeconds: 2 } });
        expect(response.response.headers.get("retry-after")).toBe("2");
      } finally {
        release();
        await Promise.all(taken);
      }
      expect((await viewer.call("GET", "/stock-card/cards?pageSize=10")).status).toBe(200);
    });
  });

  // ---------------------------------------------------------------- IT-SC-I1 / I2
  describe("IT-SC-I1 internal metadata and IT-SC-I2 card after a metadata edit", () => {
    it("PUT stores docDate / party in the same transaction, replays, leaves absent fields alone and does not hash them", async () => {
      const n = uniq();
      const load = await seed({ stoneCode: code(n), pcs: 5, weightCt: "5.000" });
      const id = doc();
      const customer = party("First Customer");
      const holds = [{ stockUuid: load.id, pcs: 2, weightCt: "2.000" }];
      const first = await internal.hold("memo-out", id, holds, { docDate: "2026-09-18", party: customer }, "MO-I1");
      expect(first.status).toBe(200);
      const stored = () => h.ownerDb.stock_hold_document.findUniqueOrThrow({ where: { document_type_document_id: { document_type: "memo-out", document_id: id } } });
      let row = await stored();
      expect([row.doc_date?.toISOString().slice(0, 10), row.party_id, row.party_name]).toEqual(["2026-09-18", customer.id, "First Customer"]);
      const hash = row.request_hash;

      // same revision, same holds, other metadata: replayed, hash unchanged, metadata applied
      const replay = await internal.call("PUT", `/stock-holds/memo-out/${id}`, { revision: 1, documentNo: "MO-I1", holds, docDate: "2026-09-19", party: { ...customer, name: "Renamed Customer" } });
      expect(replay.status).toBe(200);
      expect(replay.body.replayed).toBe(true);
      row = await stored();
      expect([row.request_hash, row.doc_date?.toISOString().slice(0, 10), row.party_name]).toEqual([hash, "2026-09-19", "Renamed Customer"]);

      // absent fields leave the stored values; the next revision keeps date and customer
      expect((await internal.hold("memo-out", id, [{ stockUuid: load.id, pcs: 3, weightCt: "3.000" }], {}, "MO-I1")).status).toBe(200);
      row = await stored();
      expect([row.doc_date?.toISOString().slice(0, 10), row.party_name]).toEqual(["2026-09-19", "Renamed Customer"]);
      // null clears
      expect((await internal.hold("memo-out", id, [{ stockUuid: load.id, pcs: 3, weightCt: "3.000" }], { party: null, docDate: null }, "MO-I1")).status).toBe(200);
      row = await stored();
      expect([row.doc_date, row.party_id, row.party_name]).toEqual([null, null, ""]);

      // a stale revision is refused and stores nothing
      const stale = await internal.call("PUT", `/stock-holds/memo-out/${id}`, { revision: 1, documentNo: "MO-I1", holds: [], docDate: "2030-01-01" });
      expect(stale.status).toBe(409);
      expect((await stored()).doc_date).toBeNull();
      // a refused hold (exceeds available) rolls the metadata back with it
      const refused = await internal.call("PUT", `/stock-holds/reserve/${doc()}`, { revision: 1, documentNo: null, holds: [{ stockUuid: load.id, pcs: 99, weightCt: "1.000" }], docDate: "2026-09-18" });
      expect(refused.status).toBe(409);
    });

    it("strict bodies: unknown keys, a bad date and an empty customer name are 422", async () => {
      const id = doc();
      for (const body of [{ revision: 1, documentNo: null, holds: [], extra: 1 }, { revision: 1, documentNo: null, holds: [], docDate: "2026-13-01" }, { revision: 1, documentNo: null, holds: [], party: { id: randomUUID(), name: "" } }, { revision: 1, documentNo: null, holds: [], party: { id: "x", name: "N" } }]) {
        expect((await internal.call("PUT", `/stock-holds/memo-out/${id}`, body)).status).toBe(422);
      }
    });

    it("PATCH sets and clears the metadata without a revision; 404 without a hold document; wrong token 401; strict body", async () => {
      const n = uniq();
      const load = await seed({ stoneCode: code(n), docDate: "2026-09-01", pcs: 5, weightCt: "5.000" });
      const key = await cardKeyOf(load.id);
      const id = doc();
      const customer = party("Old Name");
      await internal.hold("memo-out", id, [{ stockUuid: load.id, pcs: 2, weightCt: "2.000" }], { docDate: "2026-09-18", party: customer }, "MO-I2");
      let page = await transactions(key);
      expect(page.items[1]).toMatchObject({ docDate: "2026-09-18", accountName: "Old Name", accountId: customer.id });

      // I2: a date or customer edit that changes no quantity reaches the card through PATCH
      const renamed = { id: customer.id, name: "New Name" };
      const patched = await internal.call("PATCH", `/stock-holds/memo-out/${id}/metadata`, { docDate: "2026-09-25", party: renamed });
      expect(patched).toMatchObject({ status: 200, body: { updated: true } });
      page = await transactions(key);
      expect(page.items.map((row) => [row.docType, row.docDate, row.accountName])).toEqual([["load-to-stock", "2026-09-01", "Vendor One"], ["memo-out", "2026-09-25", "New Name"]]);
      expect((await h.ownerDb.stock_hold_document.findUniqueOrThrow({ where: { document_type_document_id: { document_type: "memo-out", document_id: id } } })).applied_revision).toBe(1);
      // idempotent
      expect((await internal.call("PATCH", `/stock-holds/memo-out/${id}/metadata`, { docDate: "2026-09-25", party: renamed })).status).toBe(200);
      expect((await transactions(key)).items[1]).toMatchObject({ docDate: "2026-09-25", accountName: "New Name" });
      // clearing falls back to the first movement's date and an empty account
      expect((await internal.call("PATCH", `/stock-holds/memo-out/${id}/metadata`, { docDate: null, party: null })).status).toBe(200);
      page = await transactions(key);
      expect(page.items[1]).toMatchObject({ accountName: "", accountId: null });
      expect(page.items[1].docDate).toBe(new Date().toLocaleDateString("sv-SE", { timeZone: "Asia/Bangkok" }));
      // an empty body changes nothing
      expect((await internal.call("PATCH", `/stock-holds/memo-out/${id}/metadata`, {})).status).toBe(200);

      expect((await internal.call("PATCH", `/stock-holds/memo-out/${doc()}/metadata`, { docDate: "2026-09-25" })).status).toBe(404);
      expect((await internal.call("PATCH", `/stock-holds/sale/${id}/metadata`, { docDate: "2026-09-25" })).status).toBe(404);
      expect((await internal.call("PATCH", `/stock-holds/memo-out/${id}/metadata`, { docDate: "2026-09-25" }, "wrong-token-wrong-token-wrong-token-wrong-token")).status).toBe(401);
      expect((await internal.call("PATCH", `/stock-holds/memo-out/${id}/metadata`, { docDate: "2026-09-25" }, null)).status).toBe(401);
      for (const body of [{ extra: 1 }, { docDate: "x" }, { party: { id: customer.id } }, { party: { id: customer.id, name: "x".repeat(201) } }]) {
        expect((await internal.call("PATCH", `/stock-holds/memo-out/${id}/metadata`, body)).status).toBe(422);
      }
    });
  });
});
