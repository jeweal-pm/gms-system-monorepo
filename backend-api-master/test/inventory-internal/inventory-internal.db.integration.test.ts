import { randomBytes, randomUUID } from "node:crypto";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import type { INestApplication } from "@nestjs/common";
import { HttpException } from "@nestjs/common";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { setApproval } from "../partner-shared/approval";

/**
 * Master side of Load to Stock on PostgreSQL through real HTTP (load-to-stock SA rev 1 testing.md; BE-LS-002…005/013):
 * IT-LS-B01 (migration, CHECK, partial index, down script), IT-LS-B02 (picker), allocation apply / replay / stale /
 * refusals (IT-LS-B03 master part), IT-LS-B06 (concurrent allocations), IT-LS-B08 (Stock ID uniqueness across Memo
 * Receive and Load at the New Year), IT-LS-B10 (PURCHASE_IN_USE), IT-LS-B11 (numbering + Document Setup), IT-LS-B19
 * (Location Master resolve), photos, the service-token boundary, and the N+1 budgets NP-LS-01/02/05.
 *
 * Opt-in like the other DB integrations: `PARTNER_TEST_DATABASE_URL` → disposable `f1_system` on 127.0.0.1 (port ≠ 5432),
 * migrated. Rows are scoped to vendors created here; Stock ID years 77–79 (clocks faked); everything is removed in afterAll.
 */

type PgClient = { connect(): Promise<void>; end(): Promise<void>; query(sql: string, values?: unknown[]): Promise<{ rows: Record<string, unknown>[] }> };
// pg ships no type declarations in this workspace; only the simple-query client is needed (multi-statement down script).
// eslint-disable-next-line @typescript-eslint/no-require-imports
const { Client } = require("pg") as { Client: new (options: { connectionString?: string }) => PgClient };

const testUrl = process.env.PARTNER_TEST_DATABASE_URL;
const canRun = Boolean(testUrl && /^postgresql:\/\/[^/]+@127\.0\.0\.1:(?!5432\/)[0-9]+\/f1_system$/.test(testUrl));
const ACTOR = `ls-it-${randomUUID().slice(0, 8)}`;
const TOKEN = randomBytes(32).toString("base64url");
const PARTNER_TOKEN = `partner-${randomBytes(24).toString("base64url")}`;
const dir = mkdtempSync(join(tmpdir(), "gms-ls-master-it-"));

type PrismaClient = typeof import("../../src/database/prisma-client").prisma;
type Vendor = { id: string; addressId: string };
type Json = Record<string, unknown> & { error?: { code: string; details?: Record<string, unknown> } };

let prisma: PrismaClient;
let app: INestApplication;
let base = "";
let purchase: InstanceType<typeof import("../../src/purchase/purchase.service").PurchaseService>;
let receive: InstanceType<typeof import("../../src/trade-document/memo-receive.service").MemoReceiveService>;
let internal: InstanceType<typeof import("../../src/inventory-internal/inventory-internal.service").InventoryInternalService>;
let setup: InstanceType<typeof import("../../src/document-setup/document-setup.service").DocumentSetupService>;
const vendors: Vendor[] = [];
const loads: string[] = [];
const queries: string[] = [];
let counting = false;

const header = (vendor: Vendor, patch: Record<string, unknown> = {}) => ({
  docDate: "2026-11-04", dueDate: "2026-12-04", currency: "THB", exchangeRate: null, ref: "", documentNote: "",
  discount: { type: "NONE" as const, value: "0" }, tax: { enabled: false, rate: "7", includeInPrice: false }, serviceCharges: [], labor: null,
  vendorId: vendor.id, addressId: vendor.addressId, ...patch,
});
const manual = (patch: Record<string, unknown> = {}) => ({
  source: "MANUAL" as const, stoneCodeId: null, stoneCode: "", stone: "Ruby", shape: "Oval", size: "", color: "Red", clarity: "", cutting: "", quality: "",
  lot: "LS-LOT", location: "Safe A", cerType: "", cerNo: "", pcs: 10, weightCt: "5", priceUnit: "PER_CT" as "PER_CT" | "PER_PCS", unitPrice: "1000",
  discount: { type: "NONE" as const, value: "0" }, itemNote: "", photoIds: [] as string[], ...patch,
});
const receiveLine = () => ({ source: "MANUAL" as const, stoneCode: "", stone: "Ruby", shape: "Oval", size: "", color: "Red", clarity: "", cutting: "", quality: "",
  lot: "MR", cerType: "", cerNo: "", pcs: 1, weightCt: "1", priceUnit: "PER_CT" as const, unitPrice: "10", discount: { type: "NONE" as const, value: "0" }, itemNote: "", photoIds: [] as string[] });

async function vendorFixture(name: string): Promise<Vendor> {
  const id = randomUUID();
  const addressId = randomUUID();
  const code = `LSIT${vendors.length}${ACTOR.slice(-4)}`.toUpperCase();
  await prisma.vendor.create({ data: {
    id, name, nameKey: name.toLowerCase(), code, codeKey: code.toLowerCase(), currencyCode: "THB", firstName: "It", email: "ls-it@example.test", createdBy: ACTOR, updatedBy: ACTOR,
    addresses: { create: [{ id: addressId, position: 1, name: `${name} Co.`, address: "1 Test Rd", countryCode: "TH", state: "Bangkok", city: "Bangkok", postcode: "10500", isDefault: true }] },
  } });
  vendors.push({ id, addressId });
  return { id, addressId };
}

/** An auto-approved Purchase (approval OFF while saving); returns its id, version and line ids in position order. */
async function approvedPurchase(vendor: Vendor, lines: ReturnType<typeof manual>[], patch: Record<string, unknown> = {}) {
  await setApproval(prisma, "purchase", false);
  const saved = await purchase.create(ACTOR, { ...header(vendor, patch), lines } as never);
  const rows = await prisma.purchaseLine.findMany({ where: { purchaseId: saved.id }, orderBy: { position: "asc" }, select: { id: true } });
  return { id: saved.id, docNo: saved.docNo, version: saved.version, lineIds: rows.map((row) => row.id) };
}

async function call(method: string, path: string, body?: unknown, token = TOKEN): Promise<{ status: number; body: Json }> {
  const response = await fetch(`${base}/internal/v1/inventory${path}`, {
    method, headers: { authorization: `Bearer ${token}`, "content-type": "application/json", "x-actor-user-id": ACTOR }, body: body === undefined ? undefined : JSON.stringify(body),
  });
  const text = await response.text();
  return { status: response.status, body: text ? JSON.parse(text) as Json : {} };
}

/** Counts the data statements of one request (BEGIN / COMMIT / ROLLBACK are not data access). */
async function measured<T>(run: () => Promise<T>): Promise<{ result: T; count: number }> {
  queries.length = 0;
  counting = true;
  try {
    const result = await run();
    return { result, count: queries.filter((sql) => !/^\s*(BEGIN|COMMIT|ROLLBACK|SET TRANSACTION)/i.test(sql)).length };
  } finally {
    counting = false;
  }
}

const loaded = async (lineId: string) => {
  const line = await prisma.purchaseLine.findUniqueOrThrow({ where: { id: lineId }, select: { loadedPcs: true, loadedWeightCt: true } });
  return [line.loadedPcs, line.loadedWeightCt.toFixed(3)];
};
const newLoad = () => { const id = randomUUID(); loads.push(id); return id; };
const domainCode = async (promise: Promise<unknown>) => {
  try { await promise; } catch (error) { if (error instanceof HttpException) return (error.getResponse() as { error: { code: string } }).error.code; throw error; }
  return "ok";
};

describe.runIf(canRun)("IT-LS master internal API on PostgreSQL", () => {
  let vendorA: Vendor;
  let vendorB: Vendor;

  beforeAll(async () => {
    const tokenFile = join(dir, "inventory-token");
    writeFileSync(tokenFile, `${TOKEN}\n`);
    vi.stubEnv("PARTNER_DATABASE_URL", testUrl!);
    vi.stubEnv("DATABASE_URL", testUrl!);
    vi.stubEnv("PARTNER_SERVICE_TOKEN", PARTNER_TOKEN);
    vi.stubEnv("INVENTORY_MASTER_SERVICE_TOKEN_FILE", tokenFile);
    vi.stubEnv("GMS_STORAGE_ROOT", dir);
    vi.stubEnv("PRISMA_QUERY_EVENTS", "1");
    ({ prisma } = await import("../../src/database/prisma-client"));
    (prisma as unknown as { $on(event: "query", listener: (event: { query: string }) => void): void }).$on("query", (event) => { if (counting) queries.push(event.query); });
    await (await import("../partner-shared/locations")).ensureTestLocations(prisma);
    const { PurchaseService } = await import("../../src/purchase/purchase.service");
    const { MemoReceiveService } = await import("../../src/trade-document/memo-receive.service");
    const { DocumentSetupService } = await import("../../src/document-setup/document-setup.service");
    const { InventoryInternalService } = await import("../../src/inventory-internal/inventory-internal.service");
    const { InventoryInternalController } = await import("../../src/inventory-internal/inventory-internal.controller");
    const { InventoryServiceTokenGuard } = await import("../../src/inventory-internal/inventory-token.guard");
    const { ServiceTokenGuard } = await import("../../src/internal-auth/service-token.guard");
    const { EnvelopeExceptionFilter } = await import("../../src/common/exception.filter");
    const { Module } = await import("@nestjs/common");
    const { APP_FILTER, APP_GUARD, NestFactory } = await import("@nestjs/core");
    const express = (await import("express")).default;
    purchase = new PurchaseService();
    receive = new MemoReceiveService();
    setup = new DocumentSetupService();
    internal = new InventoryInternalService();
    internal.clock = () => new Date("2077-06-01T03:00:00Z");
    class TestModule {}
    Module({
      controllers: [InventoryInternalController],
      providers: [{ provide: InventoryInternalService, useValue: internal }, InventoryServiceTokenGuard, { provide: APP_GUARD, useClass: ServiceTokenGuard }, { provide: APP_FILTER, useClass: EnvelopeExceptionFilter }],
    })(TestModule);
    app = await NestFactory.create(TestModule, { bodyParser: false, logger: false });
    app.use(express.json({ limit: "256kb" }));
    await app.listen(0, "127.0.0.1");
    base = (await app.getUrl()).replace("[::1]", "127.0.0.1");
    if (!(await prisma.currency.findUnique({ where: { code: "THB" } }))) await prisma.currency.create({ data: { code: "THB", name: "THB", createdBy: ACTOR, updatedBy: ACTOR } });
    await prisma.memoStockIdCounter.deleteMany({ where: { year: { in: [77, 78, 79] } } });
    vendorA = await vendorFixture("LS IT Vendor A");
    vendorB = await vendorFixture("LS IT Vendor B");
  });

  afterAll(async () => {
    await app?.close();
    if (prisma) {
      const ids = vendors.map((vendor) => vendor.id);
      await prisma.loadStockId.deleteMany({ where: { loadDocumentId: { in: loads } } });
      await prisma.loadAllocation.deleteMany({ where: { loadDocumentId: { in: loads } } });
      await prisma.$executeRawUnsafe(`DELETE FROM "partner"."purchase_line_photo" WHERE line_id IN (SELECT l.id FROM "partner"."purchase_line" l JOIN "partner"."purchase" p ON p.id = l.purchase_id WHERE p.vendor_id = ANY($1::uuid[]))`, ids);
      await prisma.storedFile.deleteMany({ where: { createdBy: ACTOR } });
      await prisma.purchase.deleteMany({ where: { vendorId: { in: ids } } });
      await prisma.memoStock.deleteMany({ where: { vendorId: { in: ids } } });
      await prisma.memoReceive.deleteMany({ where: { vendorId: { in: ids } } });
      await prisma.vendor.deleteMany({ where: { id: { in: ids } } });
      await prisma.memoStockIdCounter.deleteMany({ where: { year: { in: [77, 78, 79] } } });
      await prisma.documentNumbering.updateMany({ where: { transactionKey: "load-to-stock" }, data: { externalUsedAt: null } });
      await setApproval(prisma, "purchase", true);
      await prisma.$disconnect();
    }
    rmSync(dir, { recursive: true, force: true });
    vi.unstubAllEnvs();
  });

  it("IT-LS-B01 migration: loaded_* default 0, CHECK 23514 on overload and on STOCK lines, loadable partial index, approval rows gone, down script (rolled back)", async () => {
    const pu = await approvedPurchase(vendorA, [manual({ pcs: 2, weightCt: "1" })]);
    expect(await loaded(pu.lineIds[0])).toEqual([0, "0.000"]);
    const state = async (sql: string) => prisma.$executeRawUnsafe(sql).then(() => "accepted", (error: unknown) => (/23514|check constraint/i.test(JSON.stringify(error, Object.getOwnPropertyNames(error))) ? "23514" : String(error)));
    expect(await state(`UPDATE "partner"."purchase_line" SET loaded_pcs = 3 WHERE id = '${pu.lineIds[0]}'`)).toBe("23514");
    expect(await state(`UPDATE "partner"."purchase_line" SET loaded_weight_ct = 1.001 WHERE id = '${pu.lineIds[0]}'`)).toBe("23514");
    expect(await state(`UPDATE "partner"."purchase_line" SET loaded_pcs = -1 WHERE id = '${pu.lineIds[0]}'`)).toBe("23514");
    const stockLine = await prisma.purchaseLine.findFirst({ where: { source: "STOCK" }, select: { id: true } });
    if (stockLine) expect(await state(`UPDATE "partner"."purchase_line" SET loaded_pcs = 1 WHERE id = '${stockLine.id}'`)).toBe("23514");
    const rows = await prisma.$queryRawUnsafe<{ type: string }[]>(`SELECT type FROM "partner"."approval_setting" WHERE type IN ('load-to-stock','merge-split','stock-transfer-location')`);
    expect(rows).toEqual([]);
    const index = await prisma.$queryRawUnsafe<{ indexdef: string }[]>(`SELECT indexdef FROM pg_indexes WHERE schemaname = 'partner' AND indexname = 'purchase_line_loadable_idx'`);
    expect(index[0].indexdef).toMatch(/WHERE \(\(\(source\)::text <> 'STOCK'::text\) AND \(pcs > loaded_pcs\)\)/);
    const plan = await prisma.$transaction(async (tx) => {
      await tx.$executeRawUnsafe(`SET LOCAL enable_seqscan = off`);
      return tx.$queryRawUnsafe<{ "QUERY PLAN": string }[]>(`EXPLAIN SELECT l.purchase_id, l.position FROM "partner"."purchase_line" l WHERE l.source <> 'STOCK' AND l.pcs > l.loaded_pcs ORDER BY l.purchase_id, l.position`);
    });
    expect(plan.map((row) => row["QUERY PLAN"]).join("\n")).toContain("purchase_line_loadable_idx");

    // The down script, inside a transaction that is rolled back (the disposable database keeps the migration).
    const client = new Client({ connectionString: testUrl });
    await client.connect();
    try {
      await client.query("BEGIN");
      const allocated = await client.query(`SELECT count(*)::int AS n FROM "partner"."load_allocation_line"`);
      if (allocated.rows[0].n === 0) {
        await client.query(readFileSync(resolve(__dirname, "../../prisma/rollback/20261117090000_load_to_stock_allocation.down.sql"), "utf8"));
        const columns = await client.query(`SELECT column_name FROM information_schema.columns WHERE table_schema = 'partner' AND table_name = 'purchase_line' AND column_name LIKE 'loaded_%'`);
        expect(columns.rows).toEqual([]);
        const settings = await client.query(`SELECT count(*)::int AS n FROM "partner"."approval_setting" WHERE type IN ('load-to-stock','merge-split','stock-transfer-location')`);
        expect(settings.rows[0].n).toBe(3);
      }
      await client.query("ROLLBACK");
      // With an allocation line the down script refuses.
      await client.query("BEGIN");
      const load = randomUUID();
      await client.query(`INSERT INTO "partner"."load_allocation" (load_document_id, vendor_id) VALUES ($1, $2)`, [load, vendorA.id]);
      await client.query(`INSERT INTO "partner"."load_allocation_line" VALUES ($1, $2, 1, 0)`, [load, pu.lineIds[0]]);
      await expect(client.query(readFileSync(resolve(__dirname, "../../prisma/rollback/20261117090000_load_to_stock_allocation.down.sql"), "utf8"))).rejects.toThrow(/release the applied loads/);
      await client.query("ROLLBACK");
    } finally {
      await client.end();
    }
  });

  it("service token boundary: no token / the partner token → 401 before any data; the inventory token → 200", async () => {
    expect((await call("GET", "/reference", undefined, "")).status).toBe(401);
    expect((await call("GET", "/reference", undefined, PARTNER_TOKEN)).status).toBe(401);
    expect((await call("PUT", `/load-allocations/${randomUUID()}`, { revision: 1, vendorId: vendorA.id, lines: [], newStockIdCount: 0 }, PARTNER_TOKEN)).status).toBe(401);
    const reference = await call("GET", "/reference");
    expect(reference.status).toBe(200);
    expect(reference.body).toMatchObject({ stone: expect.objectContaining({ codes: expect.any(Array) }), locations: expect.arrayContaining(["Safe A", "Safe B"]) });
  });

  it("IT-LS-B19 master-data/resolve: active names case-insensitively in master spelling; inactive / unknown absent; stone codes with active flag", async () => {
    await prisma.$executeRawUnsafe(`INSERT INTO "partner"."location" (id, name, active, created_by, updated_by) VALUES (gen_random_uuid(), 'LS Old Vault ${ACTOR}', false, 'test', 'test') ON CONFLICT ((lower(name))) DO UPDATE SET active = false`);
    const resolved = await call("POST", "/master-data/resolve", { stoneCodeIds: [randomUUID()], locationNames: ["safe a", "SAFE B", `ls old vault ${ACTOR}`, "Nowhere"] });
    expect(resolved.status).toBe(200);
    expect(resolved.body).toEqual({ stoneCodes: [], locations: [{ input: "SAFE B", name: "Safe B" }, { input: "safe a", name: "Safe A" }] });
    const reference = await call("GET", "/reference");
    expect(reference.body.locations).not.toContain(`LS Old Vault ${ACTOR}`);
    expect((await call("POST", "/master-data/resolve", { stoneCodeIds: [], locationNames: ["x".repeat(41)] })).status).toBe(400);
  });

  it("IT-LS-B02 picker: approved + live + MANUAL/PO only, remaining > 0, vendor / date / q (escaped) / exclusions, keyset pages, a closed line leaves", async () => {
    const pu = await approvedPurchase(vendorB, [manual({ lot: "PICK_1%" }), manual({ lot: "PICK-2", pcs: 3 }), manual({ lot: "PICK-3", pcs: 1 })], { docDate: "2026-10-01" });
    await setApproval(prisma, "purchase", true);
    const draft = await purchase.create(ACTOR, { ...header(vendorB, { docDate: "2026-10-01" }), lines: [manual({ lot: "PICK-DRAFT" })] } as never);
    const search = (input: Record<string, unknown>) => call("POST", "/purchase-lines/loadable/search", { vendorId: vendorB.id, ...input });
    const all = await search({});
    expect(all.status).toBe(200);
    const lots = (all.body.items as { lot: string }[]).map((item) => item.lot);
    expect(lots).toEqual(expect.arrayContaining(["PICK_1%", "PICK-2", "PICK-3"]));
    expect(lots).not.toContain("PICK-DRAFT");
    expect(all.body.items).toEqual(expect.arrayContaining([expect.objectContaining({ purchaseLineId: pu.lineIds[0], remainingPcs: 10, remainingWeightCt: "5.000", unitCostBase: "1000.0000", remainingAmountBase: "5000.00", purchase: expect.objectContaining({ id: pu.id, rate: "1" }) })]));
    expect((await search({ q: "PICK_1%" })).body.items).toHaveLength(1);
    expect((await search({ q: "PICK_" })).body.items).toHaveLength(1); // `_` is a plain character
    expect((await search({ from: "2026-10-02" })).body.items).toEqual([]);
    expect((await search({ excludeLineIds: [pu.lineIds[0]] })).body.items).toHaveLength((all.body.items as unknown[]).length - 1);
    const first = await search({ limit: 1 });
    expect(first.body.nextCursor).toEqual(expect.any(String));
    expect(first.body.total).toBe((all.body.items as unknown[]).length);
    const second = await search({ limit: 1, cursor: first.body.nextCursor });
    expect((second.body.items as { purchaseLineId: string }[])[0].purchaseLineId).not.toBe((first.body.items as { purchaseLineId: string }[])[0].purchaseLineId);
    // Close PICK-3 (1 pcs) with a load: it leaves the picker; an edit of that load still sees it (own allocation).
    const load = newLoad();
    expect((await call("PUT", `/load-allocations/${load}`, { revision: 1, vendorId: vendorB.id, lines: [{ purchaseLineId: pu.lineIds[2], pcs: 1, weightCt: "2" }], newStockIdCount: 1 })).status).toBe(200);
    expect(((await search({})).body.items as { lot: string }[]).map((item) => item.lot)).not.toContain("PICK-3");
    const editing = await search({ excludeAllocationOf: load });
    expect(editing.body.items).toEqual(expect.arrayContaining([expect.objectContaining({ lot: "PICK-3", remainingPcs: 1, remainingWeightCt: "5.000" })]));
    // Owner 2026-11-27: the Account list shows every active vendor, also one with no loadable Purchase line.
    const noLines = await vendorFixture("LS IT Vendor Without Lines");
    const vendorsPage = await call("GET", "/vendors/loadable?q=LS%20IT%20Vendor&limit=50");
    expect((vendorsPage.body.items as { id: string }[]).map((item) => item.id)).toEqual(expect.arrayContaining([vendorB.id, noLines.id]));
    expect((await call("POST", "/purchase-lines/loadable/search", { limit: 51 })).status).toBe(400);
    expect(draft.status).toBe("DRAFT");
  });

  it("IT-LS-B03 allocation (master part): partial 7 of 10 → remaining 3 with a YY#### id; replay returns the same ids; stale / exceeds / unavailable refused; release returns remaining, ids never reused", async () => {
    const pu = await approvedPurchase(vendorA, [manual(), manual({ pcs: 4, weightCt: "2" })]);
    const load = newLoad();
    const body = { revision: 1, vendorId: vendorA.id, lines: [{ purchaseLineId: pu.lineIds[0], pcs: 7, weightCt: "3.5" }], newStockIdCount: 2 };
    const applied = await call("PUT", `/load-allocations/${load}`, body);
    expect(applied.status).toBe(200);
    expect(applied.body).toMatchObject({ revision: 1, replayed: false, lines: [{ purchaseLineId: pu.lineIds[0], remainingPcs: 3, remainingWeightCt: "1.500" }] });
    const ids = applied.body.stockIds as string[];
    expect(ids).toHaveLength(2);
    for (const id of ids) expect(id).toMatch(/^77\d{4}$/);
    expect(await loaded(pu.lineIds[0])).toEqual([7, "3.500"]);
    const replay = await call("PUT", `/load-allocations/${load}`, body);
    expect(replay.body).toMatchObject({ revision: 1, replayed: true, stockIds: ids });
    expect(await loaded(pu.lineIds[0])).toEqual([7, "3.500"]);
    expect((await call("PUT", `/load-allocations/${load}`, { ...body, newStockIdCount: 1 })).body.error?.code).toBe("LOAD_ALLOCATION_STALE");
    expect((await call("GET", `/load-allocations/${load}`)).body).toEqual({ revision: 1, lines: [{ purchaseLineId: pu.lineIds[0], pcs: 7, weightCt: "3.500" }], stockIds: ids });
    const exceeds = await call("PUT", `/load-allocations/${load}`, { ...body, revision: 2, lines: [{ purchaseLineId: pu.lineIds[0], pcs: 11, weightCt: "3.5" }] });
    expect(exceeds.status).toBe(409);
    expect(exceeds.body.error).toMatchObject({ code: "LOAD_ALLOCATION_EXCEEDS_REMAINING", details: { lines: [{ purchaseLineId: pu.lineIds[0], remainingPcs: 10, remainingWeightCt: "5.000" }] } });
    const other = await approvedPurchase(vendorB, [manual()]);
    const unavailable = await call("PUT", `/load-allocations/${load}`, { ...body, revision: 2, lines: [{ purchaseLineId: other.lineIds[0], pcs: 1, weightCt: "1" }] });
    expect(unavailable.status).toBe(422);
    expect(unavailable.body.error).toMatchObject({ code: "LOAD_ALLOCATION_LINE_UNAVAILABLE", details: { purchaseLineIds: [other.lineIds[0]] } });
    // Edit (rev 2): 7 → 10 closes the line (weight 1.5 left is written off), plus 1 new row id.
    const edit = await call("PUT", `/load-allocations/${load}`, { ...body, revision: 2, lines: [{ purchaseLineId: pu.lineIds[0], pcs: 10, weightCt: "3.5" }], newStockIdCount: 1 });
    expect(edit.body).toMatchObject({ revision: 2, lines: [{ remainingPcs: 0, remainingWeightCt: "1.500" }] });
    expect((await call("POST", "/purchase-lines/batch", { ids: [pu.lineIds[0]] })).body.items).toEqual([expect.objectContaining({ status: "CLOSED", remainingPcs: 0 })]);
    // Release (rev 3, empty set): everything returns; older revisions can never re-apply.
    const release = await call("PUT", `/load-allocations/${load}`, { revision: 3, vendorId: vendorA.id, lines: [], newStockIdCount: 0 });
    expect(release.body).toMatchObject({ revision: 3, stockIds: [], lines: [{ purchaseLineId: pu.lineIds[0], remainingPcs: 10, remainingWeightCt: "5.000" }] });
    expect(await loaded(pu.lineIds[0])).toEqual([0, "0.000"]);
    expect((await call("PUT", `/load-allocations/${load}`, body)).body.error?.code).toBe("LOAD_ALLOCATION_STALE");
    const again = await call("PUT", `/load-allocations/${load}`, { ...body, revision: 4 });
    expect((again.body.stockIds as string[]).some((id) => ids.includes(id))).toBe(false);
    expect(await prisma.loadStockId.count({ where: { loadDocumentId: load } })).toBe(5);
    expect((await call("GET", `/load-allocations/${randomUUID()}`)).status).toBe(404);
  });

  it("IT-LS-B10 PURCHASE_IN_USE: an auto-approved Purchase with a loaded line can't be edited or deleted; after release it can", async () => {
    const pu = await approvedPurchase(vendorA, [manual()]);
    const load = newLoad();
    await call("PUT", `/load-allocations/${load}`, { revision: 1, vendorId: vendorA.id, lines: [{ purchaseLineId: pu.lineIds[0], pcs: 1, weightCt: "0.5" }], newStockIdCount: 1 });
    const detail = await purchase.get(pu.id);
    expect(await domainCode(purchase.update(ACTOR, pu.id, detail.version, { ...header(vendorA), lines: [{ ...manual(), id: pu.lineIds[0] }] } as never))).toBe("PURCHASE_IN_USE");
    expect(await domainCode(purchase.delete(ACTOR, pu.id, detail.version))).toBe("PURCHASE_IN_USE");
    await call("PUT", `/load-allocations/${load}`, { revision: 2, vendorId: vendorA.id, lines: [], newStockIdCount: 0 });
    expect(await domainCode(purchase.delete(ACTOR, pu.id, detail.version))).toBe("ok");
    // A deleted Purchase's lines are unavailable for a new load.
    const after = await call("PUT", `/load-allocations/${newLoad()}`, { revision: 1, vendorId: vendorA.id, lines: [{ purchaseLineId: pu.lineIds[0], pcs: 1, weightCt: "0" }], newStockIdCount: 1 });
    expect(after.body.error?.code).toBe("LOAD_ALLOCATION_LINE_UNAVAILABLE");
  });

  it("IT-LS-B06 concurrent allocations: two loads of 7 on a 10-pc line → exactly one wins; 20 parallel loads on overlapping lines never deadlock", async () => {
    const pu = await approvedPurchase(vendorA, [manual(), manual({ pcs: 20, weightCt: "20" }), manual({ pcs: 20, weightCt: "20" })]);
    const race = await Promise.all([newLoad(), newLoad()].map((load) =>
      call("PUT", `/load-allocations/${load}`, { revision: 1, vendorId: vendorA.id, lines: [{ purchaseLineId: pu.lineIds[0], pcs: 7, weightCt: "1" }], newStockIdCount: 1 })));
    expect(race.map((result) => result.status).sort()).toEqual([200, 409]);
    expect(race.find((result) => result.status === 409)!.body.error).toMatchObject({ code: "LOAD_ALLOCATION_EXCEEDS_REMAINING", details: { lines: [{ remainingPcs: 3 }] } });
    expect(await loaded(pu.lineIds[0])).toEqual([7, "1.000"]);
    const many = await Promise.all(Array.from({ length: 20 }, (_, index) => {
      const lines = index % 2 === 0
        ? [{ purchaseLineId: pu.lineIds[1], pcs: 1, weightCt: "1" }, { purchaseLineId: pu.lineIds[2], pcs: 1, weightCt: "1" }]
        : [{ purchaseLineId: pu.lineIds[2], pcs: 1, weightCt: "1" }, { purchaseLineId: pu.lineIds[1], pcs: 1, weightCt: "1" }];
      return call("PUT", `/load-allocations/${newLoad()}`, { revision: 1, vendorId: vendorA.id, lines, newStockIdCount: 1 });
    }));
    expect(many.every((result) => result.status === 200)).toBe(true);
    expect(await loaded(pu.lineIds[1])).toEqual([20, "20.000"]);
    expect(await loaded(pu.lineIds[2])).toEqual([20, "20.000"]);
    const issued = many.flatMap((result) => result.body.stockIds as string[]);
    expect(new Set(issued).size).toBe(20);
  });

  it("IT-LS-B08 Stock ID uniqueness: Memo Receive and Load issuing in parallel across the Bangkok New Year never share an id", async () => {
    const pu = await approvedPurchase(vendorA, [manual({ pcs: 100, weightCt: "100" })]);
    let tick = 0;
    // Alternates between 2078-12-31 23:59 and 2079-01-01 00:00 Bangkok at every read (both callers read after the lock).
    const boundary = () => new Date((tick++ % 2 === 0) ? "2078-12-31T16:59:59Z" : "2078-12-31T17:00:01Z");
    internal.clock = boundary;
    receive.clock = boundary;
    await setApproval(prisma, "memo-receive", true);
    const work = Array.from({ length: 12 }, (_, index) => index % 2 === 0
      ? receive.create(ACTOR, { ...header(vendorA), lines: [receiveLine(), receiveLine()] } as never).then((saved) => (saved as { stockIds: string[] }).stockIds)
      : call("PUT", `/load-allocations/${newLoad()}`, { revision: 1, vendorId: vendorA.id, lines: [{ purchaseLineId: pu.lineIds[0], pcs: 1, weightCt: "1" }], newStockIdCount: 2 }).then((result) => result.body.stockIds as string[]));
    const issued = (await Promise.all(work)).flat();
    expect(issued).toHaveLength(24);
    expect(new Set(issued).size).toBe(24);
    const memo = await prisma.memoReceiveLine.findMany({ where: { stockId: { in: issued } }, select: { stockId: true } });
    const load = await prisma.loadStockId.findMany({ where: { stockId: { in: issued } }, select: { stockId: true } });
    expect(memo.length + load.length).toBe(24);
    internal.clock = () => new Date("2077-06-01T03:00:00Z");
  });

  it("IT-LS-B11 numbering: preview does not mark; markUsed marks once; Document Setup then keeps the row locked", async () => {
    const existing = await prisma.documentSetup.findUnique({ where: { transactionKey: "load-to-stock" }, include: { rows: true } });
    if (!existing) {
      await setup.save(ACTOR, { transactionKey: "load-to-stock", name: "Load to Stock", code: `L${ACTOR.slice(-4).toUpperCase()}`, startFrom: 1, declaration: "", expectedVersion: null,
        rows: [{ effectiveDate: "2026-01-01", prefix: "LS", separator: "-", startNo: 1 }] } as never);
    }
    const preview = await call("POST", "/document-numbering/resolve", { transactionKey: "load-to-stock", docDate: "2026-11-17", markUsed: false });
    expect(preview.body.numbering).toMatchObject({ id: expect.any(String), startNo: expect.any(Number) });
    const id = (preview.body.numbering as { id: string }).id;
    await prisma.documentNumbering.update({ where: { id }, data: { externalUsedAt: null } });
    expect((await prisma.documentNumbering.findUniqueOrThrow({ where: { id } })).externalUsedAt).toBeNull();
    await call("POST", "/document-numbering/resolve", { transactionKey: "load-to-stock", docDate: "2026-11-17", markUsed: true });
    const first = (await prisma.documentNumbering.findUniqueOrThrow({ where: { id } })).externalUsedAt;
    expect(first).toBeInstanceOf(Date);
    await call("POST", "/document-numbering/resolve", { transactionKey: "load-to-stock", docDate: "2026-11-17", markUsed: true });
    expect((await prisma.documentNumbering.findUniqueOrThrow({ where: { id } })).externalUsedAt).toEqual(first);
    const read = await setup.get("load-to-stock");
    expect(read.setup?.rows.find((row) => row.id === id)).toMatchObject({ used: true });
    expect((await call("POST", "/document-numbering/resolve", { transactionKey: "purchase", docDate: "2026-11-17", markUsed: true })).status).toBe(400);
  });

  it("photos: a line of an approved Purchase lists its ready photos; content streams only linked files; anything else 404", async () => {
    const pu = await approvedPurchase(vendorA, [manual()]);
    const { createPhotoStore } = await import("../../src/quotation/quotation-photo.storage");
    const png = Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), randomBytes(64)]);
    const stored = await createPhotoStore("purchase-photo").store(png, "image/png");
    const fileId = randomUUID();
    await prisma.storedFile.create({ data: { id: fileId, kind: "photo", bucket: "files", objectKey: stored.key, filename: "a.png", contentType: "image/png", sizeBytes: BigInt(stored.sizeBytes), sha256: stored.sha256, status: "ready", sourceType: "purchase.line-photo", sourceId: fileId, createdBy: ACTOR, readyAt: new Date() } });
    await prisma.purchaseLinePhoto.create({ data: { lineId: pu.lineIds[0], position: 1, fileId } });
    const list = await call("GET", `/purchase-lines/${pu.lineIds[0]}/photos`);
    expect(list.body).toEqual({ items: [{ fileId, position: 1, contentType: "image/png", sizeBytes: png.length, sha256: stored.sha256 }] });
    const response = await fetch(`${base}/internal/v1/inventory/files/${fileId}/content`, { headers: { authorization: `Bearer ${TOKEN}` } });
    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toBe("image/png");
    expect(Buffer.from(await response.arrayBuffer()).equals(png)).toBe(true);
    expect((await call("GET", `/files/${randomUUID()}/content`)).status).toBe(404);
    expect((await call("GET", `/purchase-lines/${randomUUID()}/photos`)).status).toBe(404);
    const unlinked = randomUUID();
    await prisma.storedFile.create({ data: { id: unlinked, kind: "photo", bucket: "files", objectKey: stored.key.replace(/\.png$/, "-x.png"), filename: "b.png", contentType: "image/png", sizeBytes: 1n, sha256: stored.sha256, status: "ready", sourceType: "purchase.line-photo", sourceId: unlinked, createdBy: ACTOR, readyAt: new Date() } });
    expect((await call("GET", `/files/${unlinked}/content`)).status).toBe(404);
  });

  it("NP-LS-01/02/05 N+1 budgets: search 2 statements, batch 1, allocation ≤ 9 — the same for 1 and for 200 lines", async () => {
    const small = await approvedPurchase(vendorB, [manual({ lot: `NPS-${ACTOR}` })]);
    const big = await approvedPurchase(vendorB, Array.from({ length: 200 }, (_, index) => manual({ lot: `NPM-${ACTOR}-${index}`, pcs: 2, weightCt: "1" })));
    const searchOne = await measured(() => internal.search({ vendorId: vendorB.id, q: `NPS-${ACTOR}`, limit: 50 }));
    const searchMany = await measured(() => internal.search({ vendorId: vendorB.id, q: `NPM-${ACTOR}`, limit: 50 }));
    expect(searchOne.result.items.length).toBe(1);
    expect(searchMany.result.items.length).toBe(50);
    expect([searchOne.count, searchMany.count]).toEqual([2, 2]);
    const batchOne = await measured(() => internal.batch({ ids: small.lineIds }));
    const batchMany = await measured(() => internal.batch({ ids: big.lineIds }));
    expect(batchMany.result.items).toHaveLength(200);
    expect([batchOne.count, batchMany.count]).toEqual([1, 1]);
    const one = await measured(() => internal.putAllocation(newLoad(), { revision: 1, vendorId: vendorB.id, lines: [{ purchaseLineId: small.lineIds[0], pcs: 1, weightCt: "1" }], newStockIdCount: 1 }, ACTOR));
    const many = await measured(() => internal.putAllocation(newLoad(), { revision: 1, vendorId: vendorB.id, lines: big.lineIds.map((id) => ({ purchaseLineId: id, pcs: 1, weightCt: "0.5" })), newStockIdCount: 200 }, ACTOR));
    expect(many.result.stockIds).toHaveLength(200);
    expect(one.count).toBe(many.count);
    expect(many.count).toBeLessThanOrEqual(9);
    const started = Date.now();
    const release = await measured(() => internal.putAllocation(loads[loads.length - 1], { revision: 2, vendorId: vendorB.id, lines: [], newStockIdCount: 0 }, ACTOR));
    expect(release.count).toBeLessThanOrEqual(9);
    console.info(`NP-LS-05 evidence: allocation statements 1 line=${one.count}, 200 lines=${many.count}; release 200=${release.count} in ${Date.now() - started} ms`);
  });
});
