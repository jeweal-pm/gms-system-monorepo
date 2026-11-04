import { HttpException } from "@nestjs/common";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { Prisma } from "../../src/generated/prisma/client";
import { prisma } from "../../src/database/prisma-client";
import {
  decodeMemoStockCursor,
  decodePurchaseOrderLineCursor,
  encodeMemoStockCursor,
  encodePurchaseOrderLineCursor,
  purchaseMemoStock,
  purchaseOrderLines,
  toMemoStockRow,
  toPurchaseOrderLineRow,
} from "../../src/purchase/purchase-pickers";

/**
 * UT-PU-B04 (purchase SA-PU-12/13): picker cursors (encode / strict decode, invalid → VALIDATION_ERROR), the row
 * mapping (amount by available basis, OPEN vs PARTLY_PURCHASED, net unit price after the PO line discount at 2 dp,
 * `sale` / `locationType` null) and the query building (status / cursor choose the group branches, search text and
 * ids only as bound values, counts from one FILTER query). Real SQL: IT-PU-B03/B05.
 */

const raw = vi.hoisted(() => ({ calls: [] as Prisma.Sql[], pages: [] as unknown[][] }));
vi.mock("../../src/database/prisma-client", () => ({
  prisma: {
    $queryRaw: vi.fn(async (sql: Prisma.Sql) => {
      raw.calls.push(sql);
      return raw.pages.shift() ?? [];
    }),
  },
}));

const D = (value: string) => new Prisma.Decimal(value);
const VENDOR = "00000000-0000-4000-8000-000000000001";
const PO = "00000000-0000-4000-8000-0000000000f0";

async function code(promise: Promise<unknown> | (() => unknown)) {
  try { await (typeof promise === "function" ? promise() : promise); } catch (error) {
    if (error instanceof HttpException) {
      const body = (error.getResponse() as { error: { code: string; fieldErrors?: { path: string; code: string }[] } }).error;
      return `${body.code}:${body.fieldErrors?.map((field) => `${field.path}/${field.code}`).join(",") ?? ""}`;
    }
    throw error;
  }
  return "ok";
}

const memoRow = (patch: Record<string, unknown> = {}) => ({
  g: 1, id: "00000000-0000-4000-8000-000000000005", stock_id: "260042", lot: "L9", location: "Memo", item_note: "n", stone: "Sapphire", shape: "Oval",
  size: "6x4", color: "Blue", clarity: "VS", cutting: "Ex", quality: "AA", cer_type: "GIA", cer_no: "C-1", received_pcs: 4, received_weight_ct: D("2.000"),
  available_pcs: 1, available_weight_ct: D("0.500"), price_unit: "PER_CT", unit_price: D("1000.00"), net_unit_price: D("950.0000"), line_amount: D("1900.00"),
  memo_receive_id: "00000000-0000-4000-8000-0000000000e1", received_doc_no: "MR-3", received_doc_date: new Date("2026-10-30T00:00:00Z"), due_date: new Date("2026-11-30T00:00:00Z"),
  ...patch,
});
const poRow = (patch: Record<string, unknown> = {}) => ({
  id: "00000000-0000-4000-8000-000000000007", position: 2, stone_code_id: null, stone_code_snapshot: "RB", stone: "Ruby", shape: "", size: "", color: "", clarity: "",
  cutting: "", quality: "", lot: "", location: "Safe", cer_type: "", cer_no: "", item_note: "", pcs: 10, weight_ct: D("4.000"), purchased_pcs: 0,
  purchased_weight_ct: D("0.000"), price_unit: "PER_PCS", unit_price: D("100.00"), discount_type: "PERCENT", discount_value: D("10"), amount: D("900.00"),
  po_id: PO, doc_no: "PO-9", doc_date: new Date("2026-11-01T00:00:00Z"), due_date: new Date("2026-12-01T00:00:00Z"), ref: "R", created_at_text: "2026-11-01T02:03:04.567",
  ...patch,
});

beforeEach(() => {
  raw.calls = [];
  raw.pages = [];
});

describe("picker cursors (UT-PU-B04)", () => {
  it("memo stock cursor = base64url of g|date|stockId; SOLD is group 0", () => {
    const cursor = encodeMemoStockCursor("SOLD", "2026-10-30", "260042");
    expect(Buffer.from(cursor, "base64url").toString("utf8")).toBe("0|2026-10-30|260042");
    expect(decodeMemoStockCursor(encodeMemoStockCursor("IN_STOCK", "2026-10-30", "260042"))).toEqual({ group: 1, docDate: "2026-10-30", stockId: "260042" });
  });

  it("PO line cursor = base64url JSON {d, c, i, p, v: 1}", () => {
    const cursor = encodePurchaseOrderLineCursor("2026-11-01", "2026-11-01T02:03:04.567", PO, 3);
    expect(decodePurchaseOrderLineCursor(cursor)).toEqual({ docDate: "2026-11-01", createdAt: "2026-11-01T02:03:04.567", id: PO, position: 3 });
  });

  it("refuses malformed cursors with VALIDATION_ERROR cursor/invalid", async () => {
    const bad = (value: string) => Buffer.from(value, "utf8").toString("base64url");
    for (const value of ["!!", bad("2|2026-10-30|260042"), bad("0|2026-13-45|260042"), bad("0|2026-10-30|26004"), bad("0|2026-10-30|260042|x")]) {
      expect(await code(() => decodeMemoStockCursor(value))).toBe("VALIDATION_ERROR:cursor/invalid");
    }
    for (const value of ["%%", bad("{"), bad(JSON.stringify({ d: "2026-11-01", c: "x", i: PO, p: 1, v: 1 })), bad(JSON.stringify({ d: "2026-11-01", c: "2026-11-01T02:03:04.567", i: PO, p: 1, v: 1, extra: 1 }))]) {
      expect(await code(() => decodePurchaseOrderLineCursor(value))).toBe("VALIDATION_ERROR:cursor/invalid");
    }
  });
});

describe("picker rows (UT-PU-B04)", () => {
  it("memo stock row: one row per status, amount by the available basis, sale and locationType always null (D6)", () => {
    expect(toMemoStockRow(memoRow())).toEqual({
      key: "00000000-0000-4000-8000-000000000005:IN_STOCK", memoStockId: "00000000-0000-4000-8000-000000000005", status: "IN_STOCK", stockId: "260042", lot: "L9", itemNote: "n",
      memoReceive: { id: "00000000-0000-4000-8000-0000000000e1", docNo: "MR-3", docDate: "2026-10-30", dueDate: "2026-11-30" },
      location: "Memo", locationType: null, stone: "Sapphire", shape: "Oval", size: "6x4", color: "Blue", clarity: "VS", cutting: "Ex", quality: "AA", cerType: "GIA", cerNo: "C-1",
      availablePcs: 1, availableWeightCt: "0.500", priceUnit: "CTS", unitPrice: "1000.00", netUnitPrice: "950.0000", amount: "475.00", sale: null,
    });
    expect(toMemoStockRow(memoRow({ g: 0, price_unit: "PER_PCS" }))).toMatchObject({ status: "SOLD", key: "00000000-0000-4000-8000-000000000005:SOLD", priceUnit: "PCS", amount: "475.00" });
  });

  it("PO line row: OPEN vs PARTLY_PURCHASED, available = ordered − purchased, net unit price after the line discount (2 dp)", () => {
    expect(toPurchaseOrderLineRow(poRow())).toMatchObject({
      status: "OPEN", position: 2, orderedPcs: 10, purchasedPcs: 0, availablePcs: 10, availableWeightCt: "4.000", netUnitPrice: "90.00", amount: "900.00",
      purchaseOrder: { id: PO, docNo: "PO-9", docDate: "2026-11-01", dueDate: "2026-12-01", ref: "R" }, priceUnit: "PER_PCS",
    });
    expect(toPurchaseOrderLineRow(poRow({ purchased_pcs: 3, purchased_weight_ct: D("1.2") }))).toMatchObject({
      status: "PARTLY_PURCHASED", availablePcs: 7, availableWeightCt: "2.800", purchasedWeightCt: "1.200", amount: "630.00",
    });
    expect(toPurchaseOrderLineRow(poRow({ purchased_pcs: 0, purchased_weight_ct: D("0.001") })).status).toBe("PARTLY_PURCHASED");
    expect(toPurchaseOrderLineRow(poRow({ unit_price: D("33.33"), discount_type: "NONE", discount_value: D("0"), pcs: 3, amount: D("99.99") })).netUnitPrice).toBe("33.33");
  });
});

describe("picker queries (UT-PU-B04)", () => {
  const scope = { vendorId: VENDOR, currency: "THB", status: "ALL" as const, limit: 2 };

  it("memoStock: SOLD then IN_STOCK branches, LIMIT n + 1, counts in one FILTER query, next cursor from the last row", async () => {
    raw.pages = [[memoRow({ g: 0 }), memoRow({ g: 1, stock_id: "260041" }), memoRow({ g: 1, stock_id: "260040" })], [{ sold: 1, in_stock: 4 }]];
    const page = await purchaseMemoStock({ ...scope, q: "50%_\\" });
    expect(page.items.map((row) => row.status)).toEqual(["SOLD", "IN_STOCK"]);
    expect(page.counts).toEqual({ all: 5, sold: 1, inStock: 4 });
    expect(decodeMemoStockCursor(page.nextCursor!)).toEqual({ group: 1, docDate: "2026-10-30", stockId: "260041" });
    const [rows, counts] = raw.calls;
    expect(rows.sql).toMatch(/sold_pcs > purchased_pcs[\s\S]*UNION ALL[\s\S]*pending_pcs > 0[\s\S]*ORDER BY g ASC, received_doc_date DESC, stock_id DESC/);
    expect(counts.sql).toMatch(/count\(\*\) FILTER \(WHERE \(sold_pcs > purchased_pcs[\s\S]*count\(\*\) FILTER \(WHERE \(pending_pcs > 0/);
    // Search text and ids are bound values with LIKE wildcards escaped, never SQL text.
    expect(rows.values).toContain("%50\\%\\_\\\\%");
    expect(rows.values).toContain(VENDOR);
    for (const sql of raw.calls) expect(sql.sql).not.toContain("50%");
  });

  it("memoStock: a status or an IN_STOCK cursor drops the SOLD branch; the SOLD tab alone has no IN_STOCK branch", async () => {
    await purchaseMemoStock({ ...scope, status: "IN_STOCK" });
    expect(raw.calls[0].sql).not.toMatch(/sold_pcs > purchased_pcs/);
    raw.calls = [];
    await purchaseMemoStock({ ...scope, cursor: encodeMemoStockCursor("IN_STOCK", "2026-10-30", "260041") });
    expect(raw.calls[0].sql).not.toMatch(/UNION ALL/);
    expect(raw.calls[0].sql).toMatch(/\(received_doc_date, stock_id\) </);
    raw.calls = [];
    await purchaseMemoStock({ ...scope, status: "SOLD", cursor: encodeMemoStockCursor("SOLD", "2026-10-30", "260041") });
    expect(raw.calls[0].sql).not.toMatch(/pending_pcs > 0 OR/);
    raw.calls = [];
    // SOLD tab with a cursor already in IN_STOCK: no rows query at all, only the counts.
    const empty = await purchaseMemoStock({ ...scope, status: "SOLD", cursor: encodeMemoStockCursor("IN_STOCK", "2026-10-30", "260041") });
    expect(empty).toMatchObject({ items: [], nextCursor: null });
    expect(raw.calls).toHaveLength(1);
  });

  it("purchaseOrderLines: approved PO of the vendor and currency, open lines, status filter, counts, keyset by PO then position", async () => {
    raw.pages = [[poRow(), poRow({ position: 3 }), poRow({ position: 4 })], [{ all: 7, open: 5 }]];
    const page = await purchaseOrderLines({ ...scope, status: "OPEN", cursor: encodePurchaseOrderLineCursor("2026-11-02", "2026-11-02T00:00:00.000", PO, 1) });
    expect(page.items).toHaveLength(2);
    expect(page.counts).toEqual({ all: 7, open: 5, partlyPurchased: 2 });
    expect(decodePurchaseOrderLineCursor(page.nextCursor!)).toEqual({ docDate: "2026-11-01", createdAt: "2026-11-01T02:03:04.567", id: PO, position: 3 });
    const [rows, counts] = raw.calls;
    expect(rows.sql).toMatch(/d\.status = 'APPROVED'[\s\S]*l\.purchased_pcs < l\.pcs OR l\.purchased_weight_ct < l\.weight_ct[\s\S]*l\.purchased_pcs = 0 AND l\.purchased_weight_ct = 0[\s\S]*l\.position >/);
    expect(rows.sql).toMatch(/ORDER BY d\.doc_date DESC, d\.created_at DESC, d\.id DESC, l\.position ASC/);
    expect(counts.sql).not.toMatch(/l\.position >/);
    raw.calls = [];
    await purchaseOrderLines({ ...scope, status: "PARTLY_PURCHASED" });
    expect(raw.calls[0].sql).toMatch(/NOT \(l\.purchased_pcs = 0/);
  });

  it("a database outage maps to PARTNER_UNAVAILABLE", async () => {
    vi.mocked(prisma.$queryRaw).mockRejectedValueOnce(Object.assign(new Error("down"), { code: "P1001" }));
    expect(await code(purchaseOrderLines(scope))).toBe("PARTNER_UNAVAILABLE:");
  });
});
