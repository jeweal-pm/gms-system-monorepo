import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { sendAndApprove, setApproval } from "../partner-shared/approval";

/**
 * BE-LOT-011 capacity measurements (lot-based-stock architecture § Capacity, testing.md "Capacity checks"). Opt-in only:
 * LOT_CAPACITY=1 plus the disposable PARTNER_TEST_DATABASE_URL. Clones one approved Memo Stock row into
 * - 20,000 open rows in 5,000 lots → `memoStock.lots` / `fromStock.lots` page p95 (target < 150 ms);
 * - 2,000 rows in 200 lots → a Memo Out of 200 lot lines × 10 candidates approved (target < 1 s, within WRITE_TX 4 s).
 * Results are printed (`LOT-CAPACITY …`) and recorded in testing.md; every row is removed afterwards.
 */
const testUrl = process.env.PARTNER_TEST_DATABASE_URL;
const canRun = process.env.LOT_CAPACITY === "1" && Boolean(testUrl && /^postgresql:\/\/[^/]+@127\.0\.0\.1:(?!5432\/)[0-9]+\/f1_system$/.test(testUrl));
const ACTOR = `lot-cap-${randomUUID().slice(0, 8)}`;
/* eslint-disable @typescript-eslint/no-explicit-any -- services are loaded after the env stub */
let prisma: any;
const vendor = { id: randomUUID(), addressId: randomUUID() };
const customer = { id: randomUUID(), shipping: randomUUID(), invoice: randomUUID() };
const money = { discount: { type: "NONE" as const, value: "0" }, tax: { enabled: false, rate: "7", includeInPrice: false }, serviceCharges: [], labor: null };

const p95 = (values: number[]) => [...values].sort((a, b) => a - b)[Math.ceil(values.length * 0.95) - 1];

/** Clones the template item `count` times (own Memo Receive header + line each, unique numbers); lot = prefix + (n % lots). */
async function clone(templateId: string, count: number, lots: number, prefix: string) {
  await prisma.$executeRawUnsafe(`
    WITH t AS (SELECT * FROM "partner"."memo_stock" WHERE id = $1::uuid),
    l AS (SELECT * FROM "partner"."memo_receive_line" WHERE id = (SELECT memo_receive_line_id FROM t)),
    r AS (SELECT * FROM "partner"."memo_receive" WHERE id = (SELECT memo_receive_id FROM t)),
    base AS (SELECT COALESCE(max(running_no), 0) AS top FROM "partner"."memo_receive"),
    g AS (SELECT n, gen_random_uuid() AS doc_id, gen_random_uuid() AS line_id, gen_random_uuid() AS stock_uuid, lpad((90000000 + n + (SELECT count(*) FROM "partner"."memo_stock"))::text, 10, '9') AS sid FROM generate_series(1, $2::int) n),
    h AS (INSERT INTO "partner"."memo_receive" SELECT (jsonb_populate_record(NULL::"partner"."memo_receive", to_jsonb(r) || jsonb_build_object('id', g.doc_id, 'doc_no', 'CAP-' || g.sid, 'running_no', (SELECT top FROM base) + g.n, 'numbering_id', NULL))).* FROM g, r RETURNING id),
    li AS (INSERT INTO "partner"."memo_receive_line" SELECT (jsonb_populate_record(NULL::"partner"."memo_receive_line", to_jsonb(l) || jsonb_build_object('id', g.line_id, 'memo_receive_id', g.doc_id, 'stock_id', g.sid, 'lot', $3 || (g.n % $4::int)::text))).* FROM g, l, (SELECT count(*) FROM h) hc RETURNING id)
    INSERT INTO "partner"."memo_stock" (id, stock_id, memo_receive_id, memo_receive_line_id, received_doc_no, received_doc_date, due_date, vendor_id, vendor_code_snapshot, vendor_name_snapshot, location, stone, shape, size, color, clarity, cutting, quality, lot, cer_type, cer_no, item_note, received_pcs, received_weight_ct, pending_pcs, pending_weight_ct, price_unit, unit_price, line_amount, net_unit_price, currency_code, created_by)
    SELECT g.stock_uuid, g.sid, g.doc_id, g.line_id, 'CAP-' || g.sid, t.received_doc_date - (g.n % 30), t.due_date, t.vendor_id, t.vendor_code_snapshot, t.vendor_name_snapshot, t.location, t.stone, t.shape, t.size, t.color, t.clarity, t.cutting, t.quality,
      $3 || (g.n % $4::int)::text, t.cer_type, '', t.item_note, t.received_pcs, t.received_weight_ct, t.received_pcs, t.received_weight_ct, t.price_unit, t.unit_price, t.line_amount, t.net_unit_price, t.currency_code, t.created_by
    FROM g, t, (SELECT count(*) FROM li) lc`, templateId, count, prefix, lots);
}

describe.runIf(canRun)("BE-LOT-011 capacity", () => {
  let template: { id: string; memoReceiveId: string };
  beforeAll(async () => {
    vi.stubEnv("PARTNER_DATABASE_URL", testUrl!);
    vi.stubEnv("DATABASE_URL", testUrl!);
    vi.stubEnv("INVENTORY_INTERNAL_URL", "");
    ({ prisma } = await import("../../src/database/prisma-client"));
    const { MemoReceiveService } = await import("../../src/trade-document/memo-receive.service");
    if (!(await prisma.currency.findUnique({ where: { code: "THB" } }))) await prisma.currency.create({ data: { code: "THB", name: "THB", createdBy: ACTOR, updatedBy: ACTOR } });
    const code = `CAP${ACTOR.slice(-4)}`.toUpperCase();
    await prisma.vendor.create({ data: { id: vendor.id, name: "Cap Vendor", nameKey: "cap vendor", code, codeKey: code.toLowerCase(), currencyCode: "THB", firstName: "It", email: "c@example.test", createdBy: ACTOR, updatedBy: ACTOR,
      addresses: { create: [{ id: vendor.addressId, position: 1, name: "Cap", address: "1", countryCode: "TH", state: "B", city: "B", postcode: "10500", isDefault: true }] } } });
    const address = { position: 1, name: "Cap", address: "2", countryCode: "TH", state: "B", city: "B", postcode: "10500", isDefault: true };
    await prisma.customer.create({ data: { id: customer.id, name: "Cap Customer", nameKey: "cap customer", code: `CAPC${ACTOR.slice(-4)}`.toUpperCase(), codeKey: `capc${ACTOR.slice(-4)}`, currencyCode: "THB", firstName: "It", email: "c@example.test", createdBy: ACTOR, updatedBy: ACTOR,
      addresses: { create: [{ ...address, id: customer.shipping, type: "SHIPPING" }, { ...address, id: customer.invoice, type: "INVOICE" }] } } });
    await setApproval(prisma, "memo-receive", true);
    const receive = new MemoReceiveService();
    receive.clock = () => new Date("2063-06-01T03:00:00Z");
    const line = { source: "MANUAL" as const, stoneCode: "", stone: "Ruby", shape: "Oval", size: "", color: "Red", clarity: "", cutting: "", quality: "", lot: "CAP-T", cerType: "", cerNo: "", pcs: 5, weightCt: "2.5", priceUnit: "PER_PCS" as const, unitPrice: "100", discount: { type: "NONE" as const, value: "0" }, itemNote: "", photoIds: [] as [] };
    const saved = await receive.create(ACTOR, { docDate: "2026-11-01", dueDate: "2026-12-01", currency: "THB", exchangeRate: null, ref: "", documentNote: "", ...money, lines: [line], vendorId: vendor.id, addressId: vendor.addressId });
    await sendAndApprove(receive, ACTOR, saved.id, saved.version);
    template = await prisma.memoStock.findFirstOrThrow({ where: { memoReceiveId: saved.id } });
  }, 300_000);

  afterAll(async () => {
    if (!prisma) return;
    await prisma.memoOut.deleteMany({ where: { customerId: customer.id } });
    await prisma.memoStock.deleteMany({ where: { vendorId: vendor.id } });
    await prisma.memoReceive.deleteMany({ where: { vendorId: vendor.id } });
    await prisma.customer.deleteMany({ where: { id: customer.id } });
    await prisma.vendor.deleteMany({ where: { id: vendor.id } });
    await prisma.$disconnect();
    vi.unstubAllEnvs();
  });

  it("picker p95 over 20,000 open rows / 5,000 lots; apply 200 lot lines × 10 candidates", async () => {
    await clone(template.id, 20_000, 5_000, "CAPP-");
    await prisma.$executeRawUnsafe(`ANALYZE "partner"."memo_stock"`);
    const { LotStockService } = await import("../../src/trade-document/lot-stock.service");
    const lots = new LotStockService();
    const runs: Record<string, number[]> = { first: [], search: [], deep: [], fromStock: [] };
    let cursor: string | null = null;
    for (let i = 0; i < 20; i += 1) {
      let t = performance.now();
      const page = await lots.memoStockLots({ vendorId: vendor.id, currency: "THB", limit: 50, cursor: null });
      runs.first.push(performance.now() - t);
      expect(page.items).toHaveLength(50);
      t = performance.now();
      await lots.memoStockLots({ vendorId: vendor.id, currency: "THB", q: "CAPP-42", limit: 50 });
      runs.search.push(performance.now() - t);
      t = performance.now();
      const deep: any = await lots.memoStockLots({ vendorId: vendor.id, currency: "THB", limit: 50, cursor: cursor ?? page.nextCursor });
      cursor = deep.nextCursor;
      runs.deep.push(performance.now() - t);
      t = performance.now();
      await lots.fromStockLots({ location: "Memo", limit: 50 });
      runs.fromStock.push(performance.now() - t);
    }
    const picker = Object.fromEntries(Object.entries(runs).map(([name, values]) => [name, Math.round(p95(values))]));
    // Apply: 2,000 more rows in 200 lots (10 each), one Memo Out with 200 lot lines (8 pcs of 50 → 2 rows each, FIFO).
    await clone(template.id, 2_000, 200, "CAPA-");
    const keys = await prisma.$queryRawUnsafe(`SELECT lot_key FROM "partner"."memo_stock" WHERE lot LIKE 'CAPA-%' GROUP BY lot_key ORDER BY lot_key LIMIT 200`) as { lot_key: string }[];
    expect(keys).toHaveLength(200);
    await setApproval(prisma, "memo-out", true);
    const { MemoOutService } = await import("../../src/trade-document/memo-out.service");
    const { createMemoOutSchema } = await import("../../src/trade-document/memo-schemas");
    const memoOut = new MemoOutService();
    const lines = keys.map((row) => ({ source: "MANUAL", stoneCodeId: null, stoneCode: "", stone: "x", shape: "", size: "", color: "", clarity: "", cutting: "", quality: "", lot: "", location: "", cerType: "", cerNo: "", pcs: 8, weightCt: "0", priceUnit: "PER_PCS", unitPrice: "100", discount: { type: "NONE", value: "0" }, itemNote: "", photoIds: [], lotKey: row.lot_key }));
    const saved = await memoOut.create(ACTOR, createMemoOutSchema.parse({ docDate: "2026-11-20", dueDate: "2026-12-20", currency: "THB", exchangeRate: null, ref: "", documentNote: "", ...money, lines, customerId: customer.id, shippingAddressId: customer.shipping, invoiceAddressId: customer.invoice }));
    await memoOut.submit({ id: ACTOR, name: null }, saved.id, saved.version);
    const t = performance.now();
    await memoOut.approve(ACTOR, saved.id, saved.version + 1);
    const applyMs = Math.round(performance.now() - t);
    const allocated = await prisma.$queryRawUnsafe(`SELECT count(*)::int AS n FROM "partner"."memo_out_line_alloc" a JOIN "partner"."memo_out_line" l ON l.id = a.line_id WHERE l.memo_out_id = $1::uuid`, saved.id) as { n: number }[];
    console.log(`LOT-CAPACITY picker p95 ms ${JSON.stringify(picker)} apply200x10 ms ${applyMs} allocRows ${allocated[0].n}`);
    expect(allocated[0].n).toBe(400);
    expect(applyMs).toBeLessThan(4_000);
  }, 600_000);
});
