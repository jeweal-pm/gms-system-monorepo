import { HttpException } from "@nestjs/common";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { ApprovalSettingService } from "../../src/approval-setting/approval-setting.service";
import { approvalSettingUpdateSchema } from "../../src/approval-setting/approval-setting.schemas";
import { APPROVAL_TYPES } from "../../src/approval-setting/approval-types";
import { WRITE_TX } from "../../src/common/persistence";

/** UT-AS-B07 (approval-setup SA rev 1 / ADR-0050): approvalSetting list / update / readForSave against a mocked Prisma. */

type Row = { type: string; requireApproval: boolean; version: number; updatedAt: Date; updatedBy: string | null; updatedByName: string | null };
type RawCall = { sql: string; values: unknown[] };

const db = vi.hoisted(() => ({
  rows: new Map<string, Row>(),
  /** Waiting counts returned by the capped-count statement, per type. */
  waiting: new Map<string, { pending: number; revision: number }>(),
  raw: [] as RawCall[],
  failWith: null as unknown,
  transactionOptions: [] as unknown[],
  updates: [] as unknown[],
}));

vi.mock("../../src/database/prisma-client", () => {
  const guard = () => { if (db.failWith) throw db.failWith; };
  const sqlText = (query: { strings?: readonly string[]; sql?: string }) => query.sql ?? (query.strings ?? []).join("?");
  const queryRaw = vi.fn(async (query: { strings?: readonly string[]; sql: string; values: unknown[] } | TemplateStringsArray, ...values: unknown[]) => {
    guard();
    const isTemplate = Array.isArray(query);
    const sql = isTemplate ? (query as TemplateStringsArray).join("?") : sqlText(query as { sql: string });
    const params = isTemplate ? values : (query as { values: unknown[] }).values;
    db.raw.push({ sql, values: params });
    if (sql.includes("approval_setting")) {
      const row = db.rows.get(params[0] as string);
      if (!row) return [];
      return sql.includes("FOR SHARE") ? [{ requireApproval: row.requireApproval }] : [{ ...row }];
    }
    // Capped waiting counts: one row per type named in the statement's parameters.
    return params.filter((value): value is string => typeof value === "string").map((type) => ({ type, ...(db.waiting.get(type) ?? { pending: 0, revision: 0 }) }));
  });
  const approvalSetting = {
    findMany: vi.fn(async () => { guard(); return [...db.rows.values()].map((row) => ({ ...row })); }),
    update: vi.fn(async ({ where, data }: { where: { type: string }; data: Omit<Row, "version" | "type"> & { version: { increment: number } } }) => {
      guard();
      db.updates.push({ where, data });
      const row = db.rows.get(where.type)!;
      const { version, ...rest } = data;
      const next = { ...row, ...rest, version: row.version + version.increment };
      db.rows.set(where.type, next);
      return { ...next };
    }),
  };
  const tx = { $queryRaw: queryRaw, approvalSetting };
  return {
    prisma: {
      ...tx,
      $transaction: vi.fn(async (fn: (client: typeof tx) => unknown, options: unknown) => {
        db.transactionOptions.push(options);
        guard();
        return fn(tx);
      }),
    },
  };
});

const seededAt = new Date("2026-11-10T01:00:00.000Z");
function seed() {
  db.rows.clear();
  for (const type of APPROVAL_TYPES) db.rows.set(type, { type, requireApproval: type !== "quotation", version: 1, updatedAt: seededAt, updatedBy: null, updatedByName: null });
}
async function failure(promise: Promise<unknown>) {
  try { await promise; } catch (error) {
    if (error instanceof HttpException) return { status: error.getStatus(), body: error.getResponse() as { error: { code: string; details?: unknown } } };
    throw error;
  }
  throw new Error("expected a failure");
}
const actor = { userId: "user-1", userName: "Mint" };

describe("ApprovalSettingService", () => {
  let service: ApprovalSettingService;
  beforeEach(() => {
    seed();
    db.waiting.clear();
    db.raw = [];
    db.failWith = null;
    db.transactionOptions = [];
    db.updates = [];
    service = new ApprovalSettingService();
  });

  it("list: 11 items in sidebar order; counts only when asked, capped at 100, 0 for the three future types", async () => {
    const withoutCounts = await service.list({ withCounts: false });
    expect(withoutCounts.items.map((item) => item.type)).toEqual([...APPROVAL_TYPES]);
    expect(withoutCounts.items.every((item) => item.waiting === null)).toBe(true);
    expect(db.raw).toHaveLength(0);
    expect(withoutCounts.items[0]).toEqual({ type: "quotation", requireApproval: false, available: true, version: 1, updatedAt: seededAt.toISOString(), updatedByName: null, waiting: null });
    expect(withoutCounts.items.filter((item) => !item.available).map((item) => item.type)).toEqual(["load-to-stock", "merge-split", "stock-transfer-location"]);

    db.waiting.set("reserve", { pending: 2, revision: 1 });
    db.waiting.set("purchase", { pending: 100, revision: 7 });
    const counted = await service.list({ withCounts: true });
    const waiting = Object.fromEntries(counted.items.map((item) => [item.type, item.waiting]));
    expect(waiting).toMatchObject({ reserve: 3, purchase: 100, quotation: 0, "load-to-stock": 0, "stock-transfer-location": 0 });
    // One statement for the eight document types; table names are fixed identifiers, the cap is a bound parameter.
    expect(db.raw).toHaveLength(1);
    expect(db.raw[0].sql).toContain(`FROM "partner"."memo_out_return" WHERE "status" = 'PENDING_APPROVAL' AND "deleted_at" IS NULL LIMIT`);
    expect(db.raw[0].sql.match(/UNION ALL/g)).toHaveLength(7);
    expect(db.raw[0].values).toContain(100);
  });

  it("update: ON → OFF without waiting documents bumps the version and snapshots the actor; same value is a no-op", async () => {
    const updated = await service.update(actor, { type: "reserve", requireApproval: false, expectedVersion: 1 });
    expect(updated).toMatchObject({ type: "reserve", requireApproval: false, version: 2, updatedByName: "Mint" });
    expect(db.updates[0]).toMatchObject({ where: { type: "reserve" }, data: { requireApproval: false, updatedBy: "user-1", updatedByName: "Mint", version: { increment: 1 } } });
    expect(db.transactionOptions).toEqual([WRITE_TX]);
    // The row is locked FOR UPDATE before the waiting count, inside the same transaction.
    expect(db.raw[0].sql).toContain("FOR UPDATE");
    expect(db.raw[1].sql).toContain(`"partner"."reserve"`);

    db.updates = [];
    db.raw = [];
    // Same value (even at a stale version) returns the row unchanged; no count, no write.
    const same = await service.update(actor, { type: "reserve", requireApproval: false, expectedVersion: 1 });
    expect(same).toMatchObject({ requireApproval: false, version: 2 });
    expect(db.updates).toHaveLength(0);
    expect(db.raw).toHaveLength(1);
  });

  it("update: turning OFF with pending or revision documents → APPROVAL_SETTING_HAS_WAITING {pending, revision}; drafts do not block", async () => {
    db.waiting.set("memo-out", { pending: 2, revision: 0 });
    expect(await failure(service.update(actor, { type: "memo-out", requireApproval: false, expectedVersion: 1 }))).toEqual({
      status: 409, body: { error: { code: "APPROVAL_SETTING_HAS_WAITING", message: expect.any(String), details: { pending: 2, revision: 0 } } },
    });
    db.waiting.set("memo-out", { pending: 0, revision: 1 });
    expect((await failure(service.update(actor, { type: "memo-out", requireApproval: false, expectedVersion: 1 }))).body.error.details).toEqual({ pending: 0, revision: 1 });
    expect(db.updates).toHaveLength(0);
    // Turning ON never counts.
    db.rows.set("quotation", { ...db.rows.get("quotation")!, requireApproval: false });
    db.raw = [];
    await service.update(actor, { type: "quotation", requireApproval: true, expectedVersion: 1 });
    expect(db.raw).toHaveLength(1);
  });

  it("UT-AS-B07b update: the three future types (available = false) → VALIDATION_ERROR type/not_available before any read; no row change (G6, INV-20261111-002 item 1)", async () => {
    for (const type of ["load-to-stock", "merge-split", "stock-transfer-location"] as const) {
      for (const requireApproval of [true, false]) {
        db.raw = [];
        db.updates = [];
        expect(await failure(service.update(actor, { type, requireApproval, expectedVersion: 1 }))).toEqual({
          status: 400, body: { error: { code: "VALIDATION_ERROR", message: expect.any(String), fieldErrors: [{ path: "type", code: "not_available" }] } },
        });
        expect(db.raw).toHaveLength(0);
        expect(db.updates).toHaveLength(0);
      }
      expect(db.rows.get(type)).toMatchObject({ version: 1 });
    }
  });

  it("update: stale version or a missing row → APPROVAL_SETTING_CHANGED; database unavailable → PARTNER_UNAVAILABLE", async () => {
    expect(await failure(service.update(actor, { type: "purchase", requireApproval: false, expectedVersion: 4 }))).toMatchObject({ status: 409, body: { error: { code: "APPROVAL_SETTING_CHANGED" } } });
    db.rows.delete("purchase");
    expect(await failure(service.update(actor, { type: "purchase", requireApproval: false, expectedVersion: 1 }))).toMatchObject({ status: 409, body: { error: { code: "APPROVAL_SETTING_CHANGED" } } });
    db.failWith = Object.assign(new Error("closed"), { code: "P1001" });
    expect(await failure(service.update(actor, { type: "reserve", requireApproval: false, expectedVersion: 1 }))).toMatchObject({ status: 503, body: { error: { code: "PARTNER_UNAVAILABLE" } } });
    expect(await failure(service.list({ withCounts: true }))).toMatchObject({ status: 503, body: { error: { code: "PARTNER_UNAVAILABLE" } } });
  });

  it("readForSave reads the row FOR SHARE; a missing row reads as ON (approval required)", async () => {
    const tx = (await import("../../src/database/prisma-client")).prisma as never;
    expect(await service.readForSave(tx, "quotation")).toBe(false);
    expect(await service.readForSave(tx, "reserve")).toBe(true);
    expect(db.raw.at(-1)?.sql).toContain("FOR SHARE");
    db.rows.delete("purchase");
    expect(await service.readForSave(tx, "purchase")).toBe(true);
  });

  it("UT-AS-B07 input: strict, 11 type keys, boolean switch, expectedVersion ≥ 1", () => {
    for (const type of APPROVAL_TYPES) expect(approvalSettingUpdateSchema.safeParse({ type, requireApproval: true, expectedVersion: 1 }).success).toBe(true);
    expect(approvalSettingUpdateSchema.safeParse({ type: "sale", requireApproval: true, expectedVersion: 1 }).success).toBe(false);
    expect(approvalSettingUpdateSchema.safeParse({ type: "reserve", requireApproval: "true", expectedVersion: 1 }).success).toBe(false);
    expect(approvalSettingUpdateSchema.safeParse({ type: "reserve", requireApproval: true, expectedVersion: 0 }).success).toBe(false);
    expect(approvalSettingUpdateSchema.safeParse({ type: "reserve", requireApproval: true, expectedVersion: 1, updatedBy: "x" }).success).toBe(false);
  });
});
