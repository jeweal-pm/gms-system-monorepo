import { createHash, randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

/**
 * IT-MOV-01…05 (memo-outstanding-vendor SA rev 1 / ADR-0035, owner 2026-10-29) against real PostgreSQL: the
 * `20261030090000_memo_stock_buckets` migration (backfill, CHECKs, partial index, rollback), and the read-only report
 * `memoOutstanding.vendorSummary / vendorList / vendorItems / vendorOptions` on Memo Receive documents created and
 * approved through `MemoReceiveService`, with buckets then set directly (no writer exists in revision 1).
 *
 * Opt-in like the other DB integrations (INV-20261021-007): runs only with `PARTNER_TEST_DATABASE_URL` pointing at
 * a disposable `f1_system` database on 127.0.0.1 with an explicit port other than 5432, migrated with
 * `prisma migrate deploy`. Rows are scoped to vendors created here and Stock ID years 60–69; all removed in `afterAll`.
 */

const testUrl = process.env.PARTNER_TEST_DATABASE_URL;
const canRun = Boolean(testUrl && /^postgresql:\/\/[^/]+@127\.0\.0\.1:(?!5432\/)[0-9]+\/f1_system$/.test(testUrl));
const ACTOR = `mov-it-${randomUUID().slice(0, 8)}`;
const YEARS = Array.from({ length: 10 }, (_, index) => 60 + index);

type Prisma = typeof import("../../src/database/prisma-client").prisma;
type Receive = InstanceType<typeof import("../../src/trade-document/memo-receive.service").MemoReceiveService>;
type Outstanding = InstanceType<typeof import("../../src/trade-document/memo-outstanding.service").MemoOutstandingService>;
type Vendor = { id: string; addressId: string };
type Doc = { id: string; docNo: string; stockIds: string[] };
type Qty = { pcs: number; weightCt: string };

let prisma: Prisma;
let receive: Receive;
let outstanding: Outstanding;
let home = "THB";
let foreign = "USD";
const vendors: Vendor[] = [];
const created = { currencies: [] as string[], setup: false, profile: false };

const line = (patch: Record<string, unknown> = {}) => ({
  source: "MANUAL" as const, stoneCode: "", stone: "Ruby", shape: "Oval", size: "", color: "Red", clarity: "", cutting: "", quality: "",
  lot: "LOT-A", cerType: "GIA", cerNo: "C-1", pcs: 2, weightCt: "1.5", priceUnit: "PER_CT" as "PER_CT" | "PER_PCS", unitPrice: "1000",
  discount: { type: "NONE" as const, value: "0" }, itemNote: "", photoIds: [] as string[],
  ...patch,
});
const input = (vendor: Vendor, lines: ReturnType<typeof line>[], patch: Record<string, unknown> = {}) => ({
  docDate: "2026-10-01", dueDate: "2026-10-20", currency: home, exchangeRate: null as string | null, ref: "", documentNote: "", lines,
  discount: { type: "NONE" as const, value: "0" }, tax: { enabled: true, rate: "7", includeInPrice: false }, serviceCharges: [], labor: null,
  vendorId: vendor.id, addressId: vendor.addressId, ...patch,
});
const q = (pcs: number, weightCt: string): Qty => ({ pcs, weightCt });
/** Bangkok 2026-10-30 00:30 and 2026-10-29 23:59:59 (UTC+7). */
const OCT30 = () => new Date("2026-10-29T17:30:00Z");
const OCT29 = () => new Date("2026-10-29T16:59:59Z");

async function vendorFixture(name: string) {
  const id = randomUUID();
  const addressId = randomUUID();
  const code = `MOVIT${vendors.length}${ACTOR.slice(-4)}`.toUpperCase();
  await prisma.vendor.create({ data: {
    id, name, nameKey: name.toLowerCase(), code, codeKey: code.toLowerCase(),
    currencyCode: home, firstName: "It", email: "mov-it@example.test", createdBy: ACTOR, updatedBy: ACTOR,
    addresses: { create: [{ id: addressId, position: 1, name: `${name} Co.`, address: "1 Test Rd", countryCode: "TH", state: "Bangkok", city: "Bangkok", postcode: "10500", isDefault: true }] },
  } });
  const vendor = { id, addressId };
  vendors.push(vendor);
  return vendor;
}

async function approved(vendor: Vendor, lines: ReturnType<typeof line>[], patch: Record<string, unknown> = {}): Promise<Doc> {
  const doc = await receive.create(ACTOR, input(vendor, lines, patch));
  await receive.approve(ACTOR, doc.id, 1);
  return doc;
}

/** Moves quantity from pending into the buckets, keeping pending = received − returned − sold − reserved. */
async function setBuckets(stockId: string, buckets: { ret?: [number, string]; sold?: [number, string]; reserve?: [number, string] }) {
  const [rp, rw] = buckets.ret ?? [0, "0"];
  const [sp, sw] = buckets.sold ?? [0, "0"];
  const [vp, vw] = buckets.reserve ?? [0, "0"];
  await prisma.$executeRaw`
    UPDATE "partner"."memo_stock" SET returned_pcs = ${rp}, returned_weight_ct = ${rw}::numeric, sold_pcs = ${sp}, sold_weight_ct = ${sw}::numeric,
      reserved_pcs = ${vp}, reserved_weight_ct = ${vw}::numeric,
      pending_pcs = received_pcs - ${rp} - ${sp} - ${vp}, pending_weight_ct = received_weight_ct - ${rw}::numeric - ${sw}::numeric - ${vw}::numeric
    WHERE stock_id = ${stockId}`;
}

async function readyPhoto() {
  const id = randomUUID();
  await prisma.storedFile.create({ data: {
    id, kind: "image", bucket: "files", objectKey: `files/memo-receive/it/${id}.jpg`, filename: "p.jpg", contentType: "image/jpeg",
    sizeBytes: BigInt(10), sha256: createHash("sha256").update(id).digest("hex"), status: "ready",
    sourceType: "memo_receive.line-photo", sourceId: id, createdBy: ACTOR, readyAt: new Date(),
  } });
  return id;
}

describe.runIf(canRun)("IT-MOV memo outstanding from vendor on PostgreSQL", () => {
  let alpha: Vendor; let beta: Vendor; let gamma: Vendor; let delta: Vendor; let idle: Vendor;
  let d1: Doc; let d2: Doc; let d3: Doc; let d4: Doc; let d5: Doc; let d6: Doc;
  const extra: Doc[] = [];
  let photoIds: string[] = [];
  const mine = () => [alpha.id, beta.id, gamma.id];

  beforeAll(async () => {
    vi.stubEnv("PARTNER_DATABASE_URL", testUrl!);
    vi.stubEnv("DATABASE_URL", testUrl!);
    ({ prisma } = await import("../../src/database/prisma-client"));
    const { MemoReceiveService } = await import("../../src/trade-document/memo-receive.service");
    const { MemoOutstandingService } = await import("../../src/trade-document/memo-outstanding.service");
    receive = new MemoReceiveService();
    receive.clock = () => new Date("2060-06-01T03:00:00Z");
    outstanding = new MemoOutstandingService();
    outstanding.clock = OCT30;

    const profile = await prisma.companyProfile.findUnique({ where: { id: 1 }, select: { currencyCode: true } });
    if (profile) home = profile.currencyCode.trim();
    foreign = home === "USD" ? "EUR" : "USD";
    // Shared fixtures may be created concurrently by another DB integration file: a lost race keeps the other's row.
    const createIfAbsent = async (create: () => Promise<unknown>) => {
      try { await create(); return true; } catch (error) {
        if ((error as { code?: string }).code === "P2002") return false;
        throw error;
      }
    };
    for (const code of [home, foreign]) {
      if (!(await prisma.currency.findUnique({ where: { code } }))
        && await createIfAbsent(() => prisma.currency.create({ data: { code, name: code, createdBy: ACTOR, updatedBy: ACTOR } }))) {
        created.currencies.push(code);
      }
    }
    if (!profile) {
      await prisma.companyProfile.create({ data: {
        id: 1, name: "MOV IT Co.", contactName: "It", phoneCountry: "TH", phoneE164: "+6621234567", email: "mov-it@example.test",
        address: "1 Test Rd", countryCode: "TH", state: "Bangkok", city: "Bangkok", postcode: "10500", currencyCode: home, updatedBy: ACTOR,
      } });
      created.profile = true;
    }
    if (!(await prisma.documentSetup.findUnique({ where: { transactionKey: "memo-receive" } }))) {
      created.setup = await createIfAbsent(() => prisma.documentSetup.create({ data: {
        transactionKey: "memo-receive", name: "Memo Receive", code: "MR", startFrom: 1, updatedBy: ACTOR,
        rows: { create: [{ id: randomUUID(), effectiveDate: new Date("2026-01-01T00:00:00Z"), prefix: "MR", separator: "-", startNo: 1 }] },
      } }));
    }
    await prisma.memoStockIdCounter.deleteMany({ where: { year: { in: YEARS } } });
    alpha = await vendorFixture(`MOV Alpha 100% ${ACTOR}`);
    beta = await vendorFixture(`MOV Beta_Gems ${ACTOR}`);
    gamma = await vendorFixture(`MOV GammaXGems ${ACTOR}`);
    delta = await vendorFixture(`MOV Delta ${ACTOR}`);
    idle = await vendorFixture(`MOV Idle ${ACTOR}`);

    photoIds = [await readyPhoto(), await readyPhoto()];
    // D1 alpha, home currency, overdue: PER_CT 2 / 1.500 ct × 1000 = 1500.00 (2 photos), PER_PCS 3 pcs × 250 = 750.00.
    d1 = await approved(alpha, [line({ photoIds }), line({ priceUnit: "PER_PCS", pcs: 3, unitPrice: "250" })]);
    // D2 beta, foreign currency at 35: PER_CT 1 / 1.234 ct × 100 = 123.40, untouched.
    d2 = await approved(beta, [line({ pcs: 1, weightCt: "1.234", unitPrice: "100" })], { docDate: "2026-10-10", dueDate: "2026-11-02", currency: foreign, exchangeRate: "35" });
    // D3 alpha, fully sold → hidden.
    d3 = await approved(alpha, [line()], { docDate: "2026-10-02", dueDate: "2026-10-05" });
    // D4 gamma, pending approval → hidden.
    d4 = await receive.create(ACTOR, input(gamma, [line()], { docDate: "2026-10-03" }));
    // D5 gamma, due today + 7 (Oct 30): PER_PCS 2 × 300 = 600.00.
    d5 = await approved(gamma, [line({ priceUnit: "PER_PCS", pcs: 2, weightCt: "0.8", unitPrice: "300" })], { docDate: "2026-10-20", dueDate: "2026-11-06" });
    // D6 beta, home currency, due Oct 30, fully reserved (pending 0) → still listed: PER_CT 1 / 2 ct × 50 = 100.00.
    d6 = await approved(beta, [line({ pcs: 1, weightCt: "2", unitPrice: "50" })], { docDate: "2026-10-25", dueDate: "2026-10-30" });
    for (let index = 0; index < 8; index += 1) {
      extra.push(await approved(delta, [line({ pcs: 1, weightCt: "1", unitPrice: String(10 + index) })], { docDate: "2026-09-01", dueDate: `2026-09-${String(10 + index).padStart(2, "0")}` }));
    }

    await setBuckets(d1.stockIds[0], { ret: [0, "0.3"], sold: [1, "0.7"], reserve: [0, "0.2"] });
    await setBuckets(d1.stockIds[1], { sold: [1, "0.5"], reserve: [1, "0.5"] });
    await setBuckets(d3.stockIds[0], { sold: [2, "1.5"] });
    await setBuckets(d6.stockIds[0], { reserve: [1, "2"] });
  }, 60_000);

  afterAll(async () => {
    if (!prisma) return;
    const ids = vendors.map((vendor) => vendor.id);
    await prisma.memoStock.deleteMany({ where: { vendorId: { in: ids } } });
    await prisma.memoReceive.deleteMany({ where: { vendorId: { in: ids } } });
    await prisma.vendor.deleteMany({ where: { id: { in: ids } } });
    // Disposable test database only: photo rows this run created (product code never deletes uploads, ADR-0030).
    await prisma.storedFile.deleteMany({ where: { createdBy: ACTOR } });
    await prisma.memoStockIdCounter.deleteMany({ where: { year: { in: YEARS } } });
    // Shared fixtures stay while another file's documents still use them (that file removes them).
    const stillUsed = (await prisma.memoReceive.count()) + (await prisma.memoOut.count());
    if (created.setup && stillUsed === 0) await prisma.documentSetup.deleteMany({ where: { transactionKey: "memo-receive" } });
    if (created.profile) await prisma.companyProfile.deleteMany({ where: { id: 1 } });
    if (created.currencies.length > 0 && stillUsed === 0) await prisma.currency.deleteMany({ where: { code: { in: created.currencies } } });
    await prisma.$disconnect();
    vi.unstubAllEnvs();
  });

  it("IT-MOV-01 migration: approve writes buckets 0, balance and non-negative CHECKs refuse bad rows, partial index, rollback", async () => {
    const fresh = await prisma.memoStock.findUnique({ where: { stockId: d2.stockIds[0] } });
    expect(fresh).toMatchObject({ returnedPcs: 0, soldPcs: 0, reservedPcs: 0, pendingPcs: 1 });
    expect([fresh!.returnedWeightCt, fresh!.soldWeightCt, fresh!.reservedWeightCt].map(String)).toEqual(["0", "0", "0"]);
    expect(fresh!.pendingWeightCt.toFixed(3)).toBe("1.234");

    const columns = await prisma.$queryRaw<{ column_name: string; data_type: string; numeric_precision: number | null; numeric_scale: number | null; is_nullable: string; column_default: string }[]>`
      SELECT column_name, data_type, numeric_precision, numeric_scale, is_nullable, column_default FROM information_schema.columns
      WHERE table_schema = 'partner' AND table_name = 'memo_stock' AND column_name ~ '^(returned|sold|reserved)_' ORDER BY column_name`;
    expect(columns.map((column) => [column.column_name, column.data_type, column.numeric_scale, column.is_nullable, column.column_default])).toEqual([
      ["reserved_pcs", "integer", 0, "NO", "0"], ["reserved_weight_ct", "numeric", 3, "NO", "0"],
      ["returned_pcs", "integer", 0, "NO", "0"], ["returned_weight_ct", "numeric", 3, "NO", "0"],
      ["sold_pcs", "integer", 0, "NO", "0"], ["sold_weight_ct", "numeric", 3, "NO", "0"],
    ]);

    const stockId = d2.stockIds[0];
    // pending ≠ received − buckets (pcs, then weight).
    await expect(prisma.$executeRaw`UPDATE "partner"."memo_stock" SET returned_pcs = 1 WHERE stock_id = ${stockId}`).rejects.toThrow(/memo_stock_balance/);
    await expect(prisma.$executeRaw`UPDATE "partner"."memo_stock" SET sold_weight_ct = 0.001 WHERE stock_id = ${stockId}`).rejects.toThrow(/memo_stock_balance/);
    // Balanced, but a negative bucket.
    await expect(prisma.$executeRaw`UPDATE "partner"."memo_stock" SET returned_pcs = 1, sold_pcs = -1 WHERE stock_id = ${stockId}`).rejects.toThrow(/memo_stock_buckets_nonneg/);
    // pending can never go negative: moving more than received breaks the existing quantity CHECK.
    await expect(setBuckets(stockId, { reserve: [2, "1.234"] })).rejects.toThrow(/memo_stock_quantity_check/);
    expect((await prisma.memoStock.findUnique({ where: { stockId } }))?.pendingPcs).toBe(1);

    const [index] = await prisma.$queryRaw<{ indexdef: string }[]>`SELECT indexdef FROM pg_indexes WHERE schemaname = 'partner' AND indexname = 'memo_stock_open_idx'`;
    expect(index.indexdef).toMatch(/\(memo_receive_id\) WHERE \(\(pending_pcs > 0\) OR \(pending_weight_ct > \(0\)::numeric\) OR \(reserved_pcs > 0\) OR \(reserved_weight_ct > \(0\)::numeric\)\)/);
    const [rows] = await prisma.$queryRaw<{ bad: bigint }[]>`
      SELECT count(*) AS bad FROM "partner"."memo_stock"
      WHERE pending_pcs <> received_pcs - returned_pcs - sold_pcs - reserved_pcs OR pending_weight_ct <> received_weight_ct - returned_weight_ct - sold_weight_ct - reserved_weight_ct`;
    expect(Number(rows.bad)).toBe(0);

    // Rollback statements from the migration header, inside a transaction that is then rolled back.
    const sentinel = new Error("rollback");
    await expect(prisma.$transaction(async (tx) => {
      await tx.$executeRawUnsafe(`DROP INDEX "partner"."memo_stock_open_idx"`);
      await tx.$executeRawUnsafe(`ALTER TABLE "partner"."memo_stock" DROP CONSTRAINT "memo_stock_balance", DROP CONSTRAINT "memo_stock_buckets_nonneg",
        DROP COLUMN "returned_pcs", DROP COLUMN "returned_weight_ct", DROP COLUMN "sold_pcs", DROP COLUMN "sold_weight_ct",
        DROP COLUMN "reserved_pcs", DROP COLUMN "reserved_weight_ct"`);
      const [left] = await tx.$queryRaw<{ n: bigint }[]>`SELECT count(*) AS n FROM information_schema.columns WHERE table_schema = 'partner' AND table_name = 'memo_stock' AND column_name ~ '^(returned|sold|reserved)_'`;
      expect(Number(left.n)).toBe(0);
      throw sentinel;
    })).rejects.toBe(sentinel);
    const [back] = await prisma.$queryRaw<{ n: bigint }[]>`SELECT count(*) AS n FROM information_schema.columns WHERE table_schema = 'partner' AND table_name = 'memo_stock' AND column_name ~ '^(returned|sold|reserved)_'`;
    expect(Number(back.n)).toBe(6);
  });

  it("IT-MOV-02 vendorList: approved documents with open items only; per-document bucket sums; Outstanding = Memo − Return − Sold − Reserve", async () => {
    const list = await outstanding.vendorList({ vendorIds: mine(), page: 1, pageSize: 10 });
    expect(list.total).toBe(4);
    expect(list.items.map((row) => row.memoReceiveId)).toEqual([d1.id, d6.id, d2.id, d5.id]);
    expect(list.items.map((row) => row.memoReceiveId)).not.toContain(d3.id);
    expect(list.items.map((row) => row.memoReceiveId)).not.toContain(d4.id);
    const [row1, row6, row2, row5] = list.items;
    expect(row1).toEqual({
      memoReceiveId: d1.id, docNo: d1.docNo, docDate: "2026-10-01", dueDate: "2026-10-20", dueInDays: -10,
      vendor: { id: alpha.id, code: expect.stringMatching(/^MOVIT0/), name: `MOV Alpha 100% ${ACTOR}` }, currency: home, openValue: "1000.00",
      memo: q(5, "3.000"), return: q(0, "0.300"), sold: q(2, "1.200"), reserve: q(1, "0.700"), outstanding: q(2, "0.800"),
    });
    expect(row6).toMatchObject({ dueInDays: 0, openValue: "100.00", memo: q(1, "2.000"), reserve: q(1, "2.000"), outstanding: q(0, "0.000") });
    expect(row2).toMatchObject({ dueInDays: 3, currency: foreign, openValue: "123.40", memo: q(1, "1.234"), outstanding: q(1, "1.234"), sold: q(0, "0.000") });
    expect(row5).toMatchObject({ dueInDays: 7, openValue: "600.00", memo: q(2, "0.800"), outstanding: q(2, "0.800") });
    for (const row of list.items) {
      for (const key of ["pcs", "weightCt"] as const) {
        const value = (entry: Qty) => Number(entry[key]);
        expect(value(row.memo) - value(row.return) - value(row.sold) - value(row.reserve)).toBeCloseTo(value(row.outstanding), 6);
      }
    }
    // A pending-approval document is hidden even though it has no Memo Stock; settling the last open item hides a document.
    await setBuckets(d6.stockIds[0], { sold: [1, "2"] });
    expect((await outstanding.vendorList({ vendorIds: mine(), page: 1, pageSize: 10 })).items.map((row) => row.memoReceiveId)).toEqual([d1.id, d2.id, d5.id]);
    await setBuckets(d6.stockIds[0], { reserve: [1, "2"] });
    expect((await outstanding.vendorList({ vendorIds: [idle.id], page: 1, pageSize: 10 }))).toEqual({ items: [], total: 0, page: 1, pageSize: 10 });
  });

  it("IT-MOV-03 filters (escaped q, vendorIds, doc date range), every sort key both ways with a stable tie-break, paging totals", async () => {
    const ids = async (filters: Record<string, unknown>) => (await outstanding.vendorList({ vendorIds: mine(), page: 1, pageSize: 50, ...filters })).items.map((row) => row.memoReceiveId);
    expect(await ids({ q: "100%" })).toEqual([d1.id]);
    expect(await ids({ q: "%" })).toEqual([d1.id]);
    expect(await ids({ q: "a_G" })).toEqual([d6.id, d2.id]);
    expect(await ids({ q: "_" })).toEqual([d6.id, d2.id]);
    expect(await ids({ q: d5.docNo })).toContain(d5.id);
    expect(await ids({ q: d5.docNo.toLowerCase() })).toContain(d5.id);
    expect(await ids({ q: "\\" })).toEqual([]);
    expect(await ids({ vendorIds: [beta.id] })).toEqual([d6.id, d2.id]);
    expect(await ids({ vendorIds: [beta.id, beta.id, gamma.id] })).toEqual([d6.id, d2.id, d5.id]);
    expect(await ids({ from: "2026-10-05", to: "2026-10-15" })).toEqual([d2.id]);
    expect(await ids({ from: "2026-10-20" })).toEqual([d6.id, d5.id]);
    expect(await ids({ to: "2026-10-10" })).toEqual([d1.id, d2.id]);
    expect(await ids({ from: "2026-10-10", to: "2026-10-10" })).toEqual([d2.id]);

    const all = [...mine(), delta.id];
    const sortValue = {
      docNo: (row: Row) => row.docNo, vendorName: (row: Row) => row.vendor.name, dueDate: (row: Row) => row.dueDate,
      memoPcs: (row: Row) => row.memo.pcs, returnPcs: (row: Row) => row.return.pcs, soldPcs: (row: Row) => row.sold.pcs,
      reservePcs: (row: Row) => row.reserve.pcs, outstandingPcs: (row: Row) => row.outstanding.pcs, openValue: (row: Row) => Number(row.openValue),
    } as const;
    type Row = Awaited<ReturnType<Outstanding["vendorList"]>>["items"][number];
    const cmp = (a: string | number, b: string | number) => (a < b ? -1 : a > b ? 1 : 0);
    for (const sort of Object.keys(sortValue) as (keyof typeof sortValue)[]) {
      for (const dir of ["asc", "desc"] as const) {
        const result = await outstanding.vendorList({ vendorIds: all, page: 1, pageSize: 50, sort, dir });
        expect(result.total).toBe(12);
        const expected = [...result.items].sort((a, b) => {
          const primary = cmp(sortValue[sort](a), sortValue[sort](b)) * (dir === "desc" ? -1 : 1);
          if (primary !== 0) return primary;
          if (sort === "dueDate") return cmp(a.docNo, b.docNo) || cmp(a.memoReceiveId, b.memoReceiveId);
          return cmp(a.memoReceiveId, b.memoReceiveId);
        });
        expect(result.items.map((row) => row.memoReceiveId), `${sort} ${dir}`).toEqual(expected.map((row) => row.memoReceiveId));
        const again = await outstanding.vendorList({ vendorIds: all, page: 1, pageSize: 50, sort, dir });
        expect(again.items.map((row) => row.memoReceiveId)).toEqual(result.items.map((row) => row.memoReceiveId));
      }
    }
    // Default = dueDate asc: the 8 Delta documents (due Sept) come first.
    const defaults = await outstanding.vendorList({ vendorIds: all, page: 1, pageSize: 50 });
    expect(defaults.items.slice(0, 8).map((row) => row.memoReceiveId)).toEqual(extra.map((doc) => doc.id));

    const page1 = await outstanding.vendorList({ vendorIds: all, page: 1, pageSize: 10 });
    const page2 = await outstanding.vendorList({ vendorIds: all, page: 2, pageSize: 10 });
    const page3 = await outstanding.vendorList({ vendorIds: all, page: 3, pageSize: 10 });
    expect([page1.items.length, page2.items.length, page3.items.length]).toEqual([10, 2, 0]);
    expect([page1.total, page2.total, page3.total]).toEqual([12, 12, 12]);
    expect([...page1.items, ...page2.items].map((row) => row.memoReceiveId)).toEqual(defaults.items.map((row) => row.memoReceiveId));
    expect(page2).toMatchObject({ page: 2, pageSize: 10 });
  });

  it("IT-MOV-04 vendorSummary: overdue / dueIn7Days at the Bangkok date boundary; grand total converted to the company currency", async () => {
    // Bangkok 2026-10-30: overdue D1 (Oct 20); due in 7 = D6 (Oct 30, today), D2 (Nov 2), D5 (Nov 6 = today + 7).
    outstanding.clock = OCT30;
    expect(await outstanding.vendorSummary({ vendorIds: mine() })).toEqual({
      documents: 4, overdue: 1, dueIn7Days: 3, grandTotal: "6019.00", companyCurrency: home,
    });
    // 1000.00 + 123.40 × 35 + 600.00 + 100.00 = 6019.00. One second earlier (Bangkok Oct 29 23:59:59) Nov 6 is today + 8.
    outstanding.clock = OCT29;
    expect(await outstanding.vendorSummary({ vendorIds: mine() })).toMatchObject({ documents: 4, overdue: 1, dueIn7Days: 2 });
    expect((await outstanding.vendorList({ vendorIds: [gamma.id], page: 1, pageSize: 10 })).items[0].dueInDays).toBe(8);
    outstanding.clock = () => new Date("2026-10-30T17:00:00Z"); // Bangkok Oct 31: D6 is now overdue.
    expect(await outstanding.vendorSummary({ vendorIds: mine() })).toMatchObject({ overdue: 2, dueIn7Days: 2 });
    outstanding.clock = OCT30;

    // Same filters as the list; empty result.
    expect(await outstanding.vendorSummary({ vendorIds: [beta.id] })).toMatchObject({ documents: 2, grandTotal: "4419.00" });
    expect(await outstanding.vendorSummary({ vendorIds: mine(), q: "100%" })).toMatchObject({ documents: 1, grandTotal: "1000.00" });
    expect(await outstanding.vendorSummary({ vendorIds: [idle.id] })).toEqual({ documents: 0, overdue: 0, dueIn7Days: 0, grandTotal: "0.00", companyCurrency: home });
    // A different exchange rate changes only the converted total.
    await prisma.memoReceive.update({ where: { id: d2.id }, data: { exchangeRate: "36.5" } });
    expect((await outstanding.vendorSummary({ vendorIds: [beta.id] })).grandTotal).toBe("4604.10");
    await prisma.memoReceive.update({ where: { id: d2.id }, data: { exchangeRate: "35" } });
  });

  it("IT-MOV-05 vendorItems: listed documents only, unknown / unapproved / settled skipped, doc then line order, photoCount, open value", async () => {
    const result = await outstanding.vendorItems({ memoReceiveIds: [d2.id, d1.id, d3.id, d4.id, randomUUID(), d1.id] });
    const order = [d1, d2].sort((a, b) => (a.docNo < b.docNo ? -1 : 1));
    const expectedIds = order.flatMap((doc) => doc.stockIds);
    expect(result.items.map((item) => item.stockId)).toEqual(expectedIds);
    const byStock = new Map(result.items.map((item) => [item.stockId, item]));
    expect(byStock.get(d1.stockIds[0])).toEqual({
      id: expect.any(String), memoReceiveId: d1.id, position: 1, stockId: d1.stockIds[0], lot: "LOT-A", location: "Memo",
      stone: "Ruby", shape: "Oval", size: "", color: "Red", clarity: "", cutting: "", quality: "", cerType: "GIA", cerNo: "C-1", itemNote: "",
      photoCount: 2, priceUnit: "CTS", netUnitPrice: "1000.0000", currency: home, openValue: "500.00",
      memo: q(2, "1.500"), return: q(0, "0.300"), sold: q(1, "0.700"), reserve: q(0, "0.200"), outstanding: q(1, "0.300"),
    });
    // PER_PCS: 750 × (1 reserved + 1 pending) ÷ 3 = 500.00.
    expect(byStock.get(d1.stockIds[1])).toMatchObject({ position: 2, photoCount: 0, priceUnit: "PCS", netUnitPrice: "250.0000", openValue: "500.00", reserve: q(1, "0.500"), outstanding: q(1, "0.500") });
    expect(byStock.get(d2.stockIds[0])).toMatchObject({ memoReceiveId: d2.id, currency: foreign, openValue: "123.40" });
    // Items sum to the document row.
    const row1 = (await outstanding.vendorList({ vendorIds: [alpha.id], page: 1, pageSize: 10 })).items[0];
    const d1Items = result.items.filter((item) => item.memoReceiveId === d1.id);
    expect(d1Items.reduce((sum, item) => sum + Number(item.openValue), 0).toFixed(2)).toBe(row1.openValue);
    expect(d1Items.reduce((sum, item) => sum + item.outstanding.pcs, 0)).toBe(row1.outstanding.pcs);

    // Partial PER_CT that needs rounding: 123.40 × 0.617 ÷ 1.234 = 61.70;.
    await setBuckets(d2.stockIds[0], { ret: [0, "0.617"] });
    expect((await outstanding.vendorItems({ memoReceiveIds: [d2.id] })).items[0].openValue).toBe("61.70");
    await setBuckets(d2.stockIds[0], {});
    expect((await outstanding.vendorItems({ memoReceiveIds: [d3.id, d4.id] })).items).toEqual([]);
  });

  it("IT-MOV-05b vendorOptions: distinct vendors with approved Memo Receive documents, by name", async () => {
    const { vendors: options } = await outstanding.vendorOptions();
    const ours = options.filter((option) => vendors.some((vendor) => vendor.id === option.id));
    // Alpha (has a settled doc too), Beta, Delta, Gamma (approved D5); Idle has none. Gamma's pending D4 alone would not count.
    expect(ours.map((option) => option.id)).toEqual([alpha.id, beta.id, delta.id, gamma.id]);
    expect(ours[0]).toEqual({ id: alpha.id, code: expect.stringMatching(/^MOVIT0/), name: `MOV Alpha 100% ${ACTOR}` });
    expect(options.length).toBeLessThanOrEqual(1000);
  });
});
