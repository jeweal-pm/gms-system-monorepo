import { randomUUID } from "node:crypto";
import { HttpException } from "@nestjs/common";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

/**
 * approval-setup SA rev 1 / ADR-0050 + approve-center ADR-0046 (backend stage 1, 2026-11-10) against real PostgreSQL:
 * - IT-AS-B01 / IT-AP-B01 / IT-AP-B02: migrations 20261107090000_approval_review and 20261110090000_approval_setting —
 *   the 11 seed rows, the header columns / CHECKs / partial indexes on all eight headers, and the create path writing
 *   submitted_* and totals;
 * - IT-AS-B08: turning a type OFF is refused while it has PENDING_APPROVAL / REVISION_REQUESTED documents (counts),
 *   allowed with drafts and soft-deleted documents only;
 * - IT-AS-B09: a Save holding the setting row FOR SHARE makes a concurrent turn-OFF wait and then see its document;
 * - IT-AS-B11: list counts equal the capped database counts.
 *
 * Opt-in like the other DB integrations (INV-20261021-007): runs only with `PARTNER_TEST_DATABASE_URL` pointing at a
 * disposable `f1_system` database on 127.0.0.1 with an explicit port other than 5432, migrated with `prisma migrate
 * deploy`. Documents are scoped to a vendor created here and removed in `afterAll`; the setting rows are restored.
 */

const testUrl = process.env.PARTNER_TEST_DATABASE_URL;
const canRun = Boolean(testUrl && /^postgresql:\/\/[^/]+@127\.0\.0\.1:(?!5432\/)[0-9]+\/f1_system$/.test(testUrl));
const ACTOR = `as-it-${randomUUID().slice(0, 8)}`;
const HEADERS = ["quotation", "reserve", "memo_receive", "memo_return", "memo_out", "memo_out_return", "purchase_order", "purchase"];
const ENGINE_HEADERS = HEADERS.slice(1);
const TABLE_OF: Record<string, string> = {
  reserve: "reserve", "memo-receive": "memo_receive", "memo-return": "memo_return", "memo-out": "memo_out",
  "memo-out-return": "memo_out_return", "purchase-order": "purchase_order", purchase: "purchase", quotation: "quotation",
};

type Prisma = typeof import("../../src/database/prisma-client").prisma;
type SettingService = InstanceType<typeof import("../../src/approval-setting/approval-setting.service").ApprovalSettingService>;
type PoService = InstanceType<typeof import("../../src/purchase-order/purchase-order.service").PurchaseOrderService>;
type SettingRow = { type: string; require_approval: boolean; version: number; updated_at: Date; updated_by: string | null; updated_by_name: string | null };

let prisma: Prisma;
let settings: SettingService;
let orders: PoService;
let original: SettingRow[] = [];
const created = { currency: false, vendorId: "", addressId: "" };

const line = (patch: Record<string, unknown> = {}) => ({
  source: "MANUAL" as const, stoneCodeId: null, stoneCode: "", stone: "Ruby", shape: "Oval", size: "", color: "Red", clarity: "", cutting: "", quality: "",
  lot: "", location: "", cerType: "", cerNo: "", pcs: 2, weightCt: "1.255", priceUnit: "PER_CT" as const, unitPrice: "100",
  discount: { type: "NONE" as const, value: "0" }, itemNote: "", photoIds: [] as string[], ...patch,
});
const input = (lines: ReturnType<typeof line>[]) => ({
  docDate: "2026-11-10", dueDate: "2026-12-10", currency: "THB", exchangeRate: null, ref: "", documentNote: "", lines,
  discount: { type: "NONE" as const, value: "0" }, tax: { enabled: false, rate: "0", includeInPrice: false }, serviceCharges: [], labor: null,
  vendorId: created.vendorId, addressId: created.addressId,
});

async function failure(promise: Promise<unknown>) {
  try { await promise; } catch (error) {
    if (error instanceof HttpException) {
      const body = error.getResponse() as { error: { code: string; details?: Record<string, number> } };
      return { status: error.getStatus(), code: body.error.code, details: body.error.details };
    }
    throw error;
  }
  throw new Error("expected a failure");
}

/** Runs one statement; "accepted", or "23514" when a CHECK refuses it. */
async function sqlState(statement: string, ...values: unknown[]) {
  try { await prisma.$executeRawUnsafe(statement, ...values); } catch (error) {
    const text = JSON.stringify(error, Object.getOwnPropertyNames(error));
    return /23514|check constraint/i.test(text) ? "23514" : text;
  }
  return "accepted";
}

async function waitingInDb(table: string) {
  const [row] = await prisma.$queryRawUnsafe<{ pending: number; revision: number }[]>(`
    SELECT LEAST(count(*) FILTER (WHERE status = 'PENDING_APPROVAL'), 100)::int AS pending,
           LEAST(count(*) FILTER (WHERE status = 'REVISION_REQUESTED'), 100)::int AS revision
    FROM "partner"."${table}" WHERE deleted_at IS NULL`);
  return row;
}

const toDraft = (id: string) => prisma.$executeRawUnsafe(`UPDATE "partner"."purchase_order" SET status = 'DRAFT', submitted_at = NULL, submitted_by = NULL, submitted_by_name = NULL WHERE id = $1::uuid`, id);
const toPending = (id: string) => prisma.$executeRawUnsafe(`UPDATE "partner"."purchase_order" SET status = 'PENDING_APPROVAL', submitted_at = now(), submitted_by = $2,
  revision_count = 0, review_action = NULL, review_note = NULL, reviewed_at = NULL, reviewed_by = NULL, reviewed_by_name = NULL WHERE id = $1::uuid`, id, ACTOR);
const toRevision = (id: string) => prisma.$executeRawUnsafe(`UPDATE "partner"."purchase_order" SET status = 'REVISION_REQUESTED', revision_count = 1,
  review_action = 'REVISE', review_note = 'Fix the weight', reviewed_at = now(), reviewed_by = $2 WHERE id = $1::uuid`, id, ACTOR);

describe.runIf(canRun)("approval settings and approval columns on PostgreSQL", () => {
  beforeAll(async () => {
    vi.stubEnv("PARTNER_DATABASE_URL", testUrl!);
    vi.stubEnv("DATABASE_URL", testUrl!);
    ({ prisma } = await import("../../src/database/prisma-client"));
    const { ApprovalSettingService } = await import("../../src/approval-setting/approval-setting.service");
    const { PurchaseOrderService } = await import("../../src/purchase-order/purchase-order.service");
    settings = new ApprovalSettingService();
    orders = new PurchaseOrderService();
    original = await prisma.$queryRawUnsafe<SettingRow[]>(`SELECT * FROM "partner"."approval_setting"`);
    if (!(await prisma.currency.findUnique({ where: { code: "THB" } }))) {
      try {
        await prisma.currency.create({ data: { code: "THB", name: "Thai Baht", createdBy: ACTOR, updatedBy: ACTOR } });
        created.currency = true;
      } catch (error) { if ((error as { code?: string }).code !== "P2002") throw error; }
    }
    created.vendorId = randomUUID();
    created.addressId = randomUUID();
    const code = `ASIT${ACTOR.slice(-6)}`.toUpperCase();
    await prisma.vendor.create({ data: {
      id: created.vendorId, name: "Approval IT Vendor", nameKey: "approval it vendor", code, codeKey: code.toLowerCase(),
      currencyCode: "THB", firstName: "It", email: "as-it@example.test", createdBy: ACTOR, updatedBy: ACTOR,
      addresses: { create: [{ id: created.addressId, position: 1, name: "Approval IT Co.", address: "1 Test Rd", countryCode: "TH", state: "Bangkok", city: "Bangkok", postcode: "10500", isDefault: true }] },
    } });
  });

  afterAll(async () => {
    if (!prisma) return;
    await prisma.purchaseOrder.deleteMany({ where: { vendorId: created.vendorId } });
    await prisma.vendor.deleteMany({ where: { id: created.vendorId } });
    if (created.currency && (await prisma.memoReceive.count()) + (await prisma.memoOut.count()) + (await prisma.purchaseOrder.count()) === 0) {
      await prisma.currency.deleteMany({ where: { code: "THB" } });
    }
    for (const row of original) {
      await prisma.$executeRawUnsafe(`UPDATE "partner"."approval_setting" SET require_approval = $2, version = $3, updated_at = $4, updated_by = $5, updated_by_name = $6 WHERE type = $1`,
        row.type, row.require_approval, row.version, row.updated_at, row.updated_by, row.updated_by_name);
    }
    await prisma.$disconnect();
    vi.unstubAllEnvs();
  });

  it("IT-AS-B01 migration: 11 seeded settings, approval columns, CHECKs and partial indexes on all eight headers", async () => {
    const seeded = await prisma.$queryRawUnsafe<{ type: string; require_approval: boolean }[]>(`SELECT type, require_approval FROM "partner"."approval_setting" ORDER BY type`);
    expect(Object.fromEntries(seeded.map((row) => [row.type, row.require_approval]))).toEqual({
      quotation: false, reserve: true, "memo-receive": true, "memo-return": true, "memo-out": true, "memo-out-return": true,
      "purchase-order": true, purchase: true, "load-to-stock": true, "merge-split": true, "stock-transfer-location": true,
    });
    expect(await sqlState(`INSERT INTO "partner"."approval_setting" (type, require_approval) VALUES ('sale', true)`)).toBe("23514");
    expect(await sqlState(`UPDATE "partner"."approval_setting" SET version = 0 WHERE type = 'reserve'`)).toBe("23514");

    const columns = await prisma.$queryRawUnsafe<{ table_name: string; column_name: string; is_nullable: string }[]>(`
      SELECT table_name, column_name, is_nullable FROM information_schema.columns
      WHERE table_schema = 'partner' AND column_name IN ('submitted_at', 'submitted_by', 'submitted_by_name', 'review_action', 'review_note', 'reviewed_at',
        'reviewed_by', 'reviewed_by_name', 'line_count', 'total_pcs', 'total_weight_ct', 'auto_approved', 'revision_count')`);
    for (const table of HEADERS) {
      const own = Object.fromEntries(columns.filter((column) => column.table_name === table).map((column) => [column.column_name, column.is_nullable]));
      expect(Object.keys(own), table).toHaveLength(13);
      expect(own, table).toMatchObject({ submitted_at: "YES", submitted_by: "YES", line_count: "NO", total_pcs: "NO", total_weight_ct: "NO", auto_approved: "NO", revision_count: "NO" });
    }
    const constraints = await prisma.$queryRawUnsafe<{ conname: string }[]>(`SELECT conname FROM pg_constraint WHERE connamespace = 'partner'::regnamespace AND contype = 'c'`);
    const names = new Set(constraints.map((row) => row.conname));
    for (const table of ENGINE_HEADERS) {
      for (const suffix of ["status", "approved", "deleted", "review", "review_status", "totals_qty", "submitted", "auto_approved", "revision_count"]) expect(names.has(`${table}_${suffix}_check`), `${table}_${suffix}_check`).toBe(true);
    }
    for (const suffix of ["status", "deleted", "review", "totals_qty", "revision_count"]) expect(names.has(`quotation_${suffix}_check`), `quotation_${suffix}_check`).toBe(true);
    const indexes = await prisma.$queryRawUnsafe<{ indexname: string; indexdef: string }[]>(`SELECT indexname, indexdef FROM pg_indexes WHERE schemaname = 'partner' AND (indexname LIKE '%_pending_idx' OR indexname LIKE '%_revision_idx')`);
    for (const table of HEADERS) {
      expect(indexes.find((index) => index.indexname === `${table}_pending_idx`)?.indexdef, table).toMatch(/\(submitted_at, id\) WHERE.*PENDING_APPROVAL.*deleted_at IS NULL/);
      expect(indexes.find((index) => index.indexname === `${table}_revision_idx`)?.indexdef, table).toMatch(/\(id\) WHERE.*REVISION_REQUESTED.*deleted_at IS NULL/);
    }
    // isUsed relies on these existing FK indexes (database-diagram.md › Indexes).
    const fkIndexes = await prisma.$queryRawUnsafe<{ indexname: string }[]>(`SELECT indexname FROM pg_indexes WHERE schemaname = 'partner'`);
    const fkNames = new Set(fkIndexes.map((row) => row.indexname));
    for (const name of ["memo_stock_memo_receive_line_id_key", "memo_out_return_line_memo_out_line_idx", "purchase_line_memo_stock_idx", "purchase_line_po_line_idx",
      "reserve_line_memo_stock_idx", "memo_out_line_memo_stock_idx", "memo_return_line_memo_stock_idx", "quotation_line_memo_stock_idx"]) expect(fkNames.has(name), name).toBe(true);
  });

  it("IT-AP-B01 / IT-AP-B02 create writes a DRAFT with totals (no submitted_*), submit stamps submitted_*; the review / status / delete CHECKs hold", async () => {
    const { id } = await orders.create(ACTOR, input([line(), line({ pcs: 3, weightCt: "0.5" })]));
    const [row] = await prisma.$queryRawUnsafe<{ status: string; submitted_at: Date | null; submitted_by: string | null; line_count: number; total_pcs: number; total_weight_ct: string; auto_approved: boolean; revision_count: number }[]>(
      `SELECT status, submitted_at, submitted_by, line_count, total_pcs, total_weight_ct::text, auto_approved, revision_count FROM "partner"."purchase_order" WHERE id = $1::uuid`, id);
    expect(row).toMatchObject({ status: "DRAFT", submitted_at: null, submitted_by: null, line_count: 2, total_pcs: 5, total_weight_ct: "1.755", auto_approved: false, revision_count: 0 });
    const detail = await orders.get(id);
    await orders.update(ACTOR, id, detail.version, input([line({ pcs: 1, weightCt: "0.25" })]));
    const [after] = await prisma.$queryRawUnsafe<{ line_count: number; total_pcs: number; total_weight_ct: string }[]>(`SELECT line_count, total_pcs, total_weight_ct::text FROM "partner"."purchase_order" WHERE id = $1::uuid`, id);
    expect(after).toEqual({ line_count: 1, total_pcs: 1, total_weight_ct: "0.250" });
    await orders.submit({ id: ACTOR, name: "Mint" }, id, detail.version + 1);
    const [sent] = await prisma.$queryRawUnsafe<{ status: string; submitted_by: string; submitted_by_name: string; submitted_at: Date | null }[]>(`SELECT status, submitted_by, submitted_by_name, submitted_at FROM "partner"."purchase_order" WHERE id = $1::uuid`, id);
    expect(sent).toMatchObject({ status: "PENDING_APPROVAL", submitted_by: ACTOR, submitted_by_name: "Mint", submitted_at: expect.any(Date) });

    const t = `"partner"."purchase_order"`;
    // ADR-0050: DRAFT has no submitted_*; submitted_* are paired; REVISION_REQUESTED needs revision_count = 1; count ≤ 1.
    expect(await sqlState(`UPDATE ${t} SET status = 'DRAFT' WHERE id = $1::uuid`, id)).toBe("23514");
    expect(await sqlState(`UPDATE ${t} SET submitted_by = NULL WHERE id = $1::uuid`, id)).toBe("23514");
    expect(await sqlState(`UPDATE ${t} SET status = 'PENDING_APPROVAL', submitted_at = NULL, submitted_by = NULL WHERE id = $1::uuid`, id)).toBe("23514");
    expect(await sqlState(`UPDATE ${t} SET status = 'REVISION_REQUESTED', review_action = 'REVISE', review_note = 'x', reviewed_at = now(), reviewed_by = 'u' WHERE id = $1::uuid`, id)).toBe("23514");
    expect(await sqlState(`UPDATE ${t} SET revision_count = 2 WHERE id = $1::uuid`, id)).toBe("23514");
    // auto_approved only on an APPROVED row without submitted_* or review.
    expect(await sqlState(`UPDATE ${t} SET auto_approved = true WHERE id = $1::uuid`, id)).toBe("23514");
    // ADR-0046 D2/D3: REJECTED needs a REJECT review; REVISE review with REJECTED fails; blank note fails.
    expect(await sqlState(`UPDATE ${t} SET status = 'REJECTED' WHERE id = $1::uuid`, id)).toBe("23514");
    expect(await sqlState(`UPDATE ${t} SET status = 'REJECTED', review_action = 'REVISE', review_note = 'x', reviewed_at = now(), reviewed_by = 'u' WHERE id = $1::uuid`, id)).toBe("23514");
    expect(await sqlState(`UPDATE ${t} SET status = 'REJECTED', review_action = 'REJECT', review_note = '   ', reviewed_at = now(), reviewed_by = 'u' WHERE id = $1::uuid`, id)).toBe("23514");
    expect(await sqlState(`UPDATE ${t} SET status = 'REJECTED', review_action = 'REJECT', review_note = NULL, reviewed_at = now(), reviewed_by = 'u' WHERE id = $1::uuid`, id)).toBe("23514");
    // NULL-safe CHECKs: review fields without an action, or an action without its note, are refused.
    expect(await sqlState(`UPDATE ${t} SET review_note = 'x', reviewed_at = now(), reviewed_by = 'u' WHERE id = $1::uuid`, id)).toBe("23514");
    expect(await sqlState(`UPDATE ${t} SET status = 'REJECTED', review_action = 'REJECT', review_note = 'No', reviewed_at = now(), reviewed_by = 'u' WHERE id = $1::uuid`, id)).toBe("accepted");
    // A rejected document can't be deleted; a sent-back one can; a draft can be (and has no submitted_*).
    expect(await sqlState(`UPDATE ${t} SET deleted_at = now(), deleted_by = 'u' WHERE id = $1::uuid`, id)).toBe("23514");
    // A REJECT review can't stay on a non-REJECTED row.
    expect(await sqlState(`UPDATE ${t} SET status = 'PENDING_APPROVAL' WHERE id = $1::uuid`, id)).toBe("23514");
    await toPending(id);
    await toRevision(id);
    expect(await sqlState(`UPDATE ${t} SET deleted_at = now(), deleted_by = 'u' WHERE id = $1::uuid`, id)).toBe("accepted");
    expect(await sqlState(`UPDATE ${t} SET deleted_at = NULL, deleted_by = NULL WHERE id = $1::uuid`, id)).toBe("accepted");
    await toPending(id);
    expect(await toDraft(id)).toBe(1);
    expect(await sqlState(`UPDATE ${t} SET deleted_at = now(), deleted_by = 'u' WHERE id = $1::uuid`, id)).toBe("accepted");
    // An APPROVED row approved by an approver (not auto) can't be deleted.
    expect(await sqlState(`UPDATE ${t} SET deleted_at = NULL, deleted_by = NULL, status = 'APPROVED', approved_at = now(), approved_by = 'u', submitted_at = now(), submitted_by = 'u' WHERE id = $1::uuid`, id)).toBe("accepted");
    expect(await sqlState(`UPDATE ${t} SET deleted_at = now(), deleted_by = 'u' WHERE id = $1::uuid`, id)).toBe("23514");
    // Auto-approved: APPROVED without submitted_*; deletable.
    expect(await sqlState(`UPDATE ${t} SET auto_approved = true, submitted_at = NULL, submitted_by = NULL WHERE id = $1::uuid`, id)).toBe("accepted");
    expect(await sqlState(`UPDATE ${t} SET deleted_at = now(), deleted_by = 'u' WHERE id = $1::uuid`, id)).toBe("accepted");
  });

  it("IT-AS-B08 / IT-AS-B11 turn OFF is refused while documents wait (pending / revision counts), allowed with drafts; counts match the database", async () => {
    const [current] = await prisma.$queryRawUnsafe<{ version: number; require_approval: boolean }[]>(`SELECT version, require_approval FROM "partner"."approval_setting" WHERE type = 'purchase-order'`);
    expect(current.require_approval).toBe(true);
    const others = await waitingInDb("purchase_order");
    const a = await orders.create(ACTOR, input([line()]));
    const b = await orders.create(ACTOR, input([line()]));
    await toPending(a.id);
    await toPending(b.id);
    await toRevision(b.id);

    const refused = await failure(settings.update({ userId: ACTOR, userName: "Mint" }, { type: "purchase-order", requireApproval: false, expectedVersion: current.version }));
    expect(refused).toEqual({ status: 409, code: "APPROVAL_SETTING_HAS_WAITING", details: { pending: Math.min(others.pending + 1, 100), revision: Math.min(others.revision + 1, 100) } });

    // list: counts only when asked; each equals the capped database count.
    const listed = await settings.list({ withCounts: true });
    for (const item of listed.items) {
      const table = TABLE_OF[item.type];
      if (!table) { expect(item.waiting, item.type).toBe(0); continue; }
      const db = await waitingInDb(table);
      expect(item.waiting, item.type).toBe(Math.min(db.pending + db.revision, 100));
    }
    expect((await settings.list({ withCounts: false })).items.every((item) => item.waiting === null)).toBe(true);

    // Drafts and soft-deleted documents don't block.
    await toDraft(a.id);
    await toPending(b.id);
    await toDraft(b.id);
    await prisma.$executeRawUnsafe(`UPDATE "partner"."purchase_order" SET deleted_at = now(), deleted_by = $2 WHERE id = $1::uuid`, b.id, ACTOR);
    if (others.pending + others.revision === 0) {
      const off = await settings.update({ userId: ACTOR, userName: "Mint" }, { type: "purchase-order", requireApproval: false, expectedVersion: current.version });
      expect(off).toMatchObject({ type: "purchase-order", requireApproval: false, version: current.version + 1, updatedByName: "Mint" });
      // Stale version → CHANGED; same value → no-op.
      expect(await failure(settings.update({ userId: ACTOR, userName: null }, { type: "purchase-order", requireApproval: true, expectedVersion: current.version }))).toMatchObject({ code: "APPROVAL_SETTING_CHANGED" });
      expect(await settings.update({ userId: ACTOR, userName: null }, { type: "purchase-order", requireApproval: false, expectedVersion: 1 })).toMatchObject({ version: current.version + 1 });
      const on = await settings.update({ userId: ACTOR, userName: null }, { type: "purchase-order", requireApproval: true, expectedVersion: current.version + 1 });
      expect(on).toMatchObject({ requireApproval: true, version: current.version + 2, updatedByName: null });
    }
  });

  it("IT-AS-B09 a Save holding the setting FOR SHARE makes turn-OFF wait, then the guard sees the submitted document", async () => {
    const draft = await orders.create(ACTOR, input([line()]));
    await toDraft(draft.id);
    const before = await waitingInDb("purchase_order");
    const [current] = await prisma.$queryRawUnsafe<{ version: number }[]>(`SELECT version FROM "partner"."approval_setting" WHERE type = 'purchase-order'`);

    let locked!: () => void;
    const lockHeld = new Promise<void>((resolve) => { locked = resolve; });
    const order: string[] = [];
    const save = prisma.$transaction(async (tx) => {
      expect(await settings.readForSave(tx, "purchase-order")).toBe(true);
      locked();
      await new Promise((resolve) => setTimeout(resolve, 400));
      await tx.$executeRawUnsafe(`UPDATE "partner"."purchase_order" SET status = 'PENDING_APPROVAL', submitted_at = now(), submitted_by = $2 WHERE id = $1::uuid`, draft.id, ACTOR);
      order.push("save");
    }, { timeout: 4_000, maxWait: 2_000 });
    await lockHeld;
    const turnOff = failure(settings.update({ userId: ACTOR, userName: null }, { type: "purchase-order", requireApproval: false, expectedVersion: current.version }))
      .finally(() => order.push("turnOff"));
    await save;
    const refused = await turnOff;
    expect(order).toEqual(["save", "turnOff"]);
    expect(refused).toMatchObject({ status: 409, code: "APPROVAL_SETTING_HAS_WAITING" });
    expect(refused.details?.pending).toBe(Math.min(before.pending + 1, 100));
    const [after] = await prisma.$queryRawUnsafe<{ require_approval: boolean; version: number }[]>(`SELECT require_approval, version FROM "partner"."approval_setting" WHERE type = 'purchase-order'`);
    expect(after).toEqual({ require_approval: true, version: current.version });
  });
});
