import { HttpException } from "@nestjs/common";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { READ_TX } from "../../src/common/persistence";
import { ApprovalService, decodePendingCursor, encodePendingCursor, pendingSql, queryHash, summarySql, toApprovalRow } from "../../src/approval/approval.service";
import { APPROVAL_REGISTRY } from "../../src/approval/approval.registry";
import { approvalPendingInputSchema } from "../../src/approval/approval.schemas";
import { permittedApprovalTypes } from "../../src/approval-setting/approval-flow";

/**
 * UT-AP-B11 / UT-AP-B12 (approve-center SA rev 1 D15/D16 as amended by approval-setup SA rev 1 / ADR-0050) against a
 * mocked Prisma: `summary` SQL from registry identifiers only, permitted ∩ ON; `pending` ORDER BY / keyset per sort and
 * direction, cursor bound to sort / direction / search, LIKE escaping, row mapping and `APPROVAL_TYPE_OFF`.
 */

type Raw = { sql: string; values: unknown[] };
const db = vi.hoisted(() => ({
  raw: [] as Raw[],
  summaryRows: [] as unknown[],
  pendingRows: [] as unknown[],
  liveRows: [] as unknown[],
  setting: new Map<string, boolean>(),
  transactions: [] as unknown[],
  failWith: null as unknown,
}));

vi.mock("../../src/database/prisma-client", () => {
  const queryRaw = vi.fn(async (query: { sql: string; values: unknown[] }) => {
    if (db.failWith) throw db.failWith;
    db.raw.push({ sql: query.sql, values: query.values });
    if (query.sql.trimStart().startsWith("SELECT 1 FROM")) return db.liveRows;
    return query.sql.includes("UNION ALL") || query.sql.includes(`AS "requireApproval"`) ? db.summaryRows : db.pendingRows;
  });
  const approvalSetting = { findUnique: vi.fn(async ({ where }: { where: { type: string } }) => (db.setting.has(where.type) ? { requireApproval: db.setting.get(where.type) } : null)) };
  const client = { $queryRaw: queryRaw, approvalSetting };
  return {
    prisma: {
      ...client,
      $transaction: vi.fn(async (fn: (tx: typeof client) => Promise<unknown>, options: unknown) => {
        db.transactions.push(options);
        return fn(client);
      }),
    },
  };
});


const ID = "0b9f3c4e-1d2a-4b3c-8d4e-5f6a7b8c9d0e";
const flat = (sql: string) => sql.replace(/\s+/g, " ").trim();
const domainCode = (error: unknown) => ((error as HttpException).getResponse() as { error: { code: string; fieldErrors?: unknown } }).error;

function dbRow(overrides: Record<string, unknown> = {}) {
  return {
    id: ID, docNo: "RS2611001", docDate: "2026-11-10", dueDate: "2026-12-10", version: 3, partyId: "c1", partyCode: "C001", partyName: "Customer A",
    ref: "R-1", currency: "THB", grandTotal: "1500.00", lineCount: 4, totalPcs: 7, totalWeightCt: "3.250",
    submittedAt: new Date("2026-11-10T03:00:00.123Z"), submittedBy: "u1", submittedByName: "Mint", revisionCount: 0,
    reviewAction: null, reviewNote: null, reviewedAt: null, reviewedByName: null, updatedAt: new Date("2026-11-10T03:00:00.123Z"),
    stoneNames: ["Ruby", "Sapphire", "Emerald"], stoneCount: 5, ...overrides,
  };
}

beforeEach(() => {
  db.raw = [];
  db.summaryRows = [];
  db.pendingRows = [];
  db.setting = new Map();
  db.transactions = [];
  db.failWith = null;
});

describe("approval.summary (UT-AP-B11)", () => {
  it("permittedApprovalTypes: canApprove types in registry order; Super Admin = 8; none without APPROVE", () => {
    expect(permittedApprovalTypes({ isSuperAdmin: true, grants: [] })).toEqual(["quotation", "reserve", "memo-receive", "memo-return", "memo-out", "memo-out-return", "purchase-order", "purchase"]);
    expect(permittedApprovalTypes({ isSuperAdmin: false, grants: ["purchase:APPROVE", "reserve:APPROVE", "memo-out:VIEW", "memo-out:EDIT"] })).toEqual(["reserve", "purchase"]);
    expect(permittedApprovalTypes({ isSuperAdmin: false, grants: ["reserve:VIEW"] })).toEqual([]);
  });

  it("builds one UNION ALL statement from registry identifiers only, one capped branch per permitted type", () => {
    const query = summarySql(["reserve", "memo-out-return", "quotation"]);
    const text = flat(query.sql);
    expect(text.match(/UNION ALL/g)).toHaveLength(2);
    expect(text).toContain(`FROM "partner"."reserve" WHERE "status" = 'PENDING_APPROVAL' AND "deleted_at" IS NULL LIMIT ?`);
    expect(text).toContain(`FROM "partner"."memo_out_return"`);
    expect(text).toContain(`FROM "partner"."quotation"`);
    expect(text).not.toContain("purchase");
    // Every value (type keys, cap) is bound.
    expect(query.values).toEqual(["reserve", 100, "reserve", "memo-out-return", 100, "memo-out-return", "quotation", 100, "quotation"]);
  });

  it("empty grants → {items: [], countCap: 100, types: []} without a query", async () => {
    await expect(new ApprovalService().summary({ isSuperAdmin: false, grants: ["reserve:VIEW", "purchase:EDIT"] })).resolves.toEqual({ items: [], countCap: 100, types: [] });
    expect(db.raw).toHaveLength(0);
  });

  it("items = permitted ∩ ON (counts capped at 100), types = every permitted type with its setting; Super Admin sees all eight", async () => {
    db.summaryRows = [
      { type: "reserve", requireApproval: true, count: 4 },
      { type: "purchase", requireApproval: false, count: null },
      { type: "memo-out", requireApproval: true, count: 100 },
    ];
    const summary = await new ApprovalService().summary({ isSuperAdmin: false, grants: ["reserve:APPROVE", "memo-out:APPROVE", "purchase:APPROVE", "quotation:VIEW"] });
    expect(summary).toEqual({
      items: [{ type: "reserve", count: 4 }, { type: "memo-out", count: 100 }],
      countCap: 100,
      types: [{ type: "reserve", requireApproval: true }, { type: "memo-out", requireApproval: true }, { type: "purchase", requireApproval: false }],
    });
    expect(db.raw).toHaveLength(1);
    expect(db.raw[0].values.filter((value) => typeof value === "string")).toEqual(["reserve", "reserve", "memo-out", "memo-out", "purchase", "purchase"]);
    await new ApprovalService().summary({ isSuperAdmin: true, grants: [] });
    expect(flat(db.raw[1].sql).match(/UNION ALL/g)).toHaveLength(7);
  });

  it("an unavailable database → PARTNER_UNAVAILABLE 503", async () => {
    db.failWith = Object.assign(new Error("down"), { code: "P1001" });
    const error = await new ApprovalService().summary({ isSuperAdmin: true, grants: [] }).catch((caught: unknown) => caught);
    expect(error).toBeInstanceOf(HttpException);
    expect((error as HttpException).getStatus()).toBe(503);
    expect(domainCode(error).code).toBe("PARTNER_UNAVAILABLE");
  });
});

describe("approval.pending (UT-AP-B12)", () => {
  const base = { sort: "submittedAt" as const, dir: "asc" as const, q: undefined, limit: 50, after: null };

  it("default: pending set of one table, oldest first by (submitted_at, id), limit + 1, lateral stone preview", () => {
    const query = pendingSql(APPROVAL_REGISTRY.reserve, base);
    const text = flat(query.sql);
    expect(text).toContain(`FROM "partner"."reserve" d`);
    expect(text).toContain(`WHERE d."status" = 'PENDING_APPROVAL' AND d."deleted_at" IS NULL ORDER BY d."submitted_at" ASC, d."id" ASC LIMIT ?`);
    expect(text).toContain(`FROM "partner"."reserve_line" l WHERE l."reserve_id" = d."id" AND l."stone" <> '' GROUP BY l."stone"`);
    expect(text).toContain(`d."customer_name_snapshot" AS "partyName"`);
    expect(query.values.at(-1)).toBe(51);
  });

  it.each([
    ["submittedAt", "asc", [`d."submitted_at"`], ">", ["2026-11-10T03:00:00.123Z"], "::timestamp(3)"],
    ["docNo", "desc", [`d."doc_no"`], "<", ["RS2611001"], "::text"],
    ["qty", "asc", [`d."total_weight_ct"`], ">", ["3.250"], "::numeric"],
    ["value", "desc", [`d."currency_code"`, `d."grand_total"`], "<", ["THB", "1500.00"], "::numeric"],
  ] as const)("sort %s %s → ORDER BY and the keyset row comparison", (sort, dir, columns, op, keys, cast) => {
    const query = pendingSql(APPROVAL_REGISTRY["memo-receive"], { ...base, sort, dir, after: { keys: [...keys], id: ID } });
    const text = flat(query.sql);
    const direction = dir === "asc" ? "ASC" : "DESC";
    expect(text).toContain(`ORDER BY ${columns.map((column) => `${column} ${direction}`).join(", ")}, d."id" ${direction}`);
    expect(text).toContain(`(${columns.join(", ")}, d."id") ${op} (`);
    expect(text).toContain(cast);
    expect(query.values).toEqual(expect.arrayContaining([...keys, ID]));
  });

  it("party sort reads the cursor row's name by id (no name in the cursor) on the vendor column", () => {
    const text = flat(pendingSql(APPROVAL_REGISTRY.purchase, { ...base, sort: "party", after: { keys: [], id: ID } }).sql);
    expect(text).toContain(`ORDER BY d."vendor_name_snapshot" ASC, d."id" ASC`);
    // INV-20261111-002 item 2: the key comes only from a live PENDING_APPROVAL row of this type.
    expect(text).toContain(`(d."vendor_name_snapshot", d."id") > ((SELECT k."vendor_name_snapshot" FROM "partner"."purchase" k WHERE k."id" = ?::uuid AND k."status" = 'PENDING_APPROVAL' AND k."deleted_at" IS NULL), ?::uuid)`);
  });

  it("UT-AP-B12b party cursor: a row that is not live PENDING_APPROVAL of the type → VALIDATION_ERROR cursor before the page query; a live one pages (INV-20261111-002 item 2)", async () => {
    const service = new ApprovalService();
    db.setting.set("reserve", true);
    db.raw = [];
    db.liveRows = [];
    const cursor = encodePendingCursor({ sort: "party", dir: "asc", q: undefined, keys: [], id: ID });
    const refused = await service.pending(approvalPendingInputSchema.parse({ type: "reserve", sort: "party", cursor })).catch((error: unknown) => error);
    expect(refused).toBeInstanceOf(HttpException);
    expect([(refused as HttpException).getStatus(), domainCode(refused)]).toEqual([400, expect.objectContaining({ code: "VALIDATION_ERROR", fieldErrors: [{ path: "cursor", code: "invalid" }] })]);
    expect(db.raw).toHaveLength(1);
    expect(flat(db.raw[0].sql)).toBe(`SELECT 1 FROM "partner"."reserve" WHERE "id" = ?::uuid AND "status" = 'PENDING_APPROVAL' AND "deleted_at" IS NULL`);
    expect(db.raw[0].values).toEqual([ID]);
    db.raw = [];
    db.liveRows = [{ "?column?": 1 }];
    db.pendingRows = [dbRow()];
    await expect(service.pending(approvalPendingInputSchema.parse({ type: "reserve", sort: "party", cursor }))).resolves.toMatchObject({ items: [{ docNo: "RS2611001" }], nextCursor: null });
    expect(db.raw).toHaveLength(2);
    // Other sorts carry their own key and need no row check.
    db.raw = [];
    const docNoCursor = encodePendingCursor({ sort: "docNo", dir: "asc", q: undefined, keys: ["RS2611001"], id: ID });
    await service.pending(approvalPendingInputSchema.parse({ type: "reserve", sort: "docNo", cursor: docNoCursor }));
    expect(db.raw).toHaveLength(1);
  });

  it("search: doc no., party, ref, line stone and Stock ID; Memo Out Return via its Memo Out line; PO by stone only; LIKE-escaped", () => {
    const search = (type: "reserve" | "memo-out-return" | "purchase-order") => pendingSql(APPROVAL_REGISTRY[type], { ...base, q: "50%_a\\b" });
    const reserve = search("reserve");
    expect(flat(reserve.sql)).toContain(`(d."doc_no" ILIKE ? ESCAPE '\\' OR d."customer_name_snapshot" ILIKE ? ESCAPE '\\' OR d."ref" ILIKE ? ESCAPE '\\' OR EXISTS (SELECT 1 FROM "partner"."reserve_line" l WHERE l."reserve_id" = d."id" AND (l."stone" ILIKE ? ESCAPE '\\' OR l."stock_id" ILIKE ? ESCAPE '\\')))`);
    expect(reserve.values).toContain("%50\\%\\_a\\\\b%");
    expect(flat(search("memo-out-return").sql)).toContain(`JOIN "partner"."memo_out_line" o ON o."id" = l."memo_out_line_id" WHERE l."memo_out_return_id" = d."id" AND (l."stone" ILIKE ? ESCAPE '\\' OR o."stock_id" ILIKE ? ESCAPE '\\')`);
    const po = flat(search("purchase-order").sql);
    expect(po).toContain(`EXISTS (SELECT 1 FROM "partner"."purchase_order_line" l WHERE l."purchase_order_id" = d."id" AND l."stone" ILIKE ? ESCAPE '\\')`);
    expect(po).not.toContain("stock_id");
  });

  it("cursor: round trip; bound to sort, direction and search; tampered or malformed → VALIDATION_ERROR cursor", () => {
    const cursor = encodePendingCursor({ sort: "value", dir: "desc", q: "ruby", keys: ["THB", "1500.00"], id: ID });
    expect(cursor.length).toBeLessThanOrEqual(300);
    expect(decodePendingCursor(cursor, { sort: "value", dir: "desc", q: "ruby" })).toEqual({ keys: ["THB", "1500.00"], id: ID });
    const invalid = { code: "VALIDATION_ERROR", fieldErrors: [{ path: "cursor", code: "invalid" }] };
    const attempt = (value: string, input: { sort: "value" | "docNo"; dir: "asc" | "desc"; q: string | undefined }) => {
      try { decodePendingCursor(value, input); } catch (error) { return domainCode(error); }
      return null;
    };
    expect(attempt(cursor, { sort: "docNo", dir: "desc", q: "ruby" })).toMatchObject(invalid);
    expect(attempt(cursor, { sort: "value", dir: "asc", q: "ruby" })).toMatchObject(invalid);
    expect(attempt(cursor, { sort: "value", dir: "desc", q: "sapphire" })).toMatchObject(invalid);
    expect(attempt(cursor, { sort: "value", dir: "desc", q: undefined })).toMatchObject(invalid);
    expect(attempt("not base64 json!", { sort: "value", dir: "desc", q: "ruby" })).toMatchObject(invalid);
    const forged = (k: unknown[]) => Buffer.from(JSON.stringify({ v: 1, s: "value", d: "desc", q: queryHash("ruby"), k, i: ID })).toString("base64url");
    expect(attempt(forged(["THB", "1; DROP TABLE x"]), { sort: "value", dir: "desc", q: "ruby" })).toMatchObject(invalid);
    expect(attempt(forged(["thb", "1"]), { sort: "value", dir: "desc", q: "ruby" })).toMatchObject(invalid);
    expect(attempt(forged(["THB", "1.5"]), { sort: "value", dir: "desc", q: "ruby" })).toBeNull();
    // Any 8-4-4-4-12 id is accepted (rows created outside uuidV7, e.g. imported data), malformed ids are not.
    const md5Id = "9e107d9d-372b-b682-6b1c-c6e6b2c4a1f0";
    expect(decodePendingCursor(encodePendingCursor({ sort: "docNo", dir: "asc", q: undefined, keys: ["7"], id: md5Id }), { sort: "docNo", dir: "asc", q: undefined })).toEqual({ keys: ["7"], id: md5Id });
    expect(attempt(Buffer.from(JSON.stringify({ v: 1, s: "value", d: "desc", q: queryHash("ruby"), k: ["THB", "1"], i: "x" })).toString("base64url"), { sort: "value", dir: "desc", q: "ruby" })).toMatchObject(invalid);
    // A Thai party name never enters the cursor, so a party cursor stays short.
    expect(encodePendingCursor({ sort: "party", dir: "asc", q: undefined, keys: [], id: ID }).length).toBeLessThan(160);
  });

  it("rows: contract mapping, moreStoneCount = max(distinct − 3, 0), revisionCount, lastReview", () => {
    expect(toApprovalRow("reserve", dbRow() as never)).toEqual({
      type: "reserve", id: ID, docNo: "RS2611001", docDate: "2026-11-10", dueDate: "2026-12-10", version: 3, status: "PENDING_APPROVAL",
      party: { id: "c1", code: "C001", name: "Customer A" }, ref: "R-1", currency: "THB", grandTotal: "1500.00", lineCount: 4, totalPcs: 7, totalWeightCt: "3.250",
      stoneNames: ["Ruby", "Sapphire", "Emerald"], moreStoneCount: 2, submittedAt: "2026-11-10T03:00:00.123Z", submittedBy: "u1", submittedByName: "Mint",
      revisionCount: 0, lastReview: null, updatedAt: "2026-11-10T03:00:00.123Z",
    });
    const revised = toApprovalRow("reserve", dbRow({ stoneNames: ["Ruby"], stoneCount: 1, revisionCount: 1, reviewAction: "REVISE", reviewNote: "Fix", reviewedAt: new Date("2026-11-09T00:00:00Z"), reviewedByName: null }) as never);
    expect(revised).toMatchObject({ moreStoneCount: 0, revisionCount: 1, lastReview: { action: "REVISE", note: "Fix", at: "2026-11-09T00:00:00.000Z", byName: null } });
  });

  it("service: setting OFF → APPROVAL_TYPE_OFF 409 before the page; ON → page in READ_TX with nextCursor when more rows exist", async () => {
    const service = new ApprovalService();
    db.setting.set("reserve", false);
    const off = await service.pending(approvalPendingInputSchema.parse({ type: "reserve" })).catch((error: unknown) => error);
    expect(off).toBeInstanceOf(HttpException);
    expect([(off as HttpException).getStatus(), domainCode(off).code]).toEqual([409, "APPROVAL_TYPE_OFF"]);
    expect(db.raw).toHaveLength(0);

    db.setting.set("reserve", true);
    db.pendingRows = [dbRow(), dbRow({ id: "1b9f3c4e-1d2a-4b3c-8d4e-5f6a7b8c9d0e", docNo: "RS2611002" }), dbRow({ id: "2b9f3c4e-1d2a-4b3c-8d4e-5f6a7b8c9d0e" })];
    const page = await service.pending(approvalPendingInputSchema.parse({ type: "reserve", limit: 2, sort: "docNo" }));
    expect(page.items.map((row) => row.docNo)).toEqual(["RS2611001", "RS2611002"]);
    expect(decodePendingCursor(page.nextCursor!, { sort: "docNo", dir: "asc", q: undefined })).toEqual({ keys: ["RS2611002"], id: "1b9f3c4e-1d2a-4b3c-8d4e-5f6a7b8c9d0e" });
    expect(db.transactions).toEqual([READ_TX, READ_TX]);
    // Missing setting row reads as ON; the last page has no cursor.
    db.pendingRows = [dbRow()];
    await expect(service.pending(approvalPendingInputSchema.parse({ type: "quotation", q: "" }))).resolves.toMatchObject({ nextCursor: null, items: [{ type: "quotation" }] });
    // A cursor from another search is refused before any query.
    db.raw = [];
    const stale = encodePendingCursor({ sort: "submittedAt", dir: "asc", q: "a", keys: ["2026-11-10T03:00:00.123Z"], id: ID });
    await expect(service.pending(approvalPendingInputSchema.parse({ type: "reserve", cursor: stale }))).rejects.toBeInstanceOf(HttpException);
    expect(db.raw).toHaveLength(0);
  });

  it("input schema: defaults, limit 1–50, q trim ≤ 100, cursor ≤ 300, strict, eight types only", () => {
    expect(approvalPendingInputSchema.parse({ type: "purchase" })).toEqual({ type: "purchase", sort: "submittedAt", dir: "asc", limit: 50 });
    for (const bad of [{ type: "load-to-stock" }, { type: "memoReceive" }, { type: "reserve", limit: 0 }, { type: "reserve", limit: 51 }, { type: "reserve", q: "x".repeat(101) },
      { type: "reserve", cursor: "x".repeat(301) }, { type: "reserve", extra: 1 }]) {
      expect(approvalPendingInputSchema.safeParse(bad).success, JSON.stringify(bad).slice(0, 40)).toBe(false);
    }
  });
});
