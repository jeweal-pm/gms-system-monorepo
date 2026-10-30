import { describe, expect, it, vi } from "vitest";
import { Prisma } from "../../src/generated/prisma/client";
import { formatStockId, netUnitPrice, stockIdYear } from "../../src/trade-document/memo-receive.service";
import { encodeStockCursor, pendingAmount } from "../../src/trade-document/memo-stock.service";
import { createMemoReceiveSchema, memoStockListSchema, updateMemoReceiveSchema } from "../../src/trade-document/memo-schemas";

/**
 * Unit cases for memo-receive SA rev 1 (ADR-0034) that need no database: input rules (IT-MR-07 schema part), the
 * Stock ID year / format (SA-MR-04), the Memo Stock net unit price (SA-MR-06) and the dialog amount (SA-MR-11).
 * The SQL paths are covered by `memo-receive.db.integration.test.ts`.
 */

vi.mock("../../src/database/prisma-client", () => ({ prisma: {} }));

const ID = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
const line = (patch: Record<string, unknown> = {}) => ({
  source: "MANUAL", stoneCode: "", stone: "Ruby", shape: "", size: "", color: "", clarity: "", cutting: "", quality: "",
  lot: "L1", cerType: "", cerNo: "", pcs: 2, weightCt: "1.5", priceUnit: "PER_CT", unitPrice: "1000", discount: { type: "NONE", value: "0" }, itemNote: "", photoIds: [],
  ...patch,
});
const input = (patch: Record<string, unknown> = {}) => ({
  docDate: "2026-10-29", dueDate: "2026-11-29", currency: "THB", exchangeRate: null, ref: "", documentNote: "", lines: [line()],
  discount: { type: "NONE", value: "0" }, tax: { enabled: false, rate: "7", includeInPrice: false }, serviceCharges: [], labor: null,
  vendorId: ID(1), addressId: ID(2), ...patch,
});
const paths = (result: { success: boolean; error?: { issues: { path: PropertyKey[]; params?: unknown }[] } }) =>
  (result.error?.issues ?? []).map((issue) => `${issue.path.join(".")}:${(issue.params as { code?: string } | undefined)?.code ?? ""}`);

describe("memo receive input (SA-MR-07/09)", () => {
  it("UT-MR-S1 lines have no stone code id or location; create takes no line id; update ids are unique", () => {
    expect(createMemoReceiveSchema.safeParse(input()).success).toBe(true);
    expect(createMemoReceiveSchema.safeParse(input({ lines: [line({ location: "Memo" })] })).success).toBe(false);
    expect(createMemoReceiveSchema.safeParse(input({ lines: [line({ stoneCodeId: null })] })).success).toBe(false);
    expect(createMemoReceiveSchema.safeParse(input({ lines: [line({ id: ID(3) })] })).success).toBe(false);
    const update = { ...input({ lines: [line({ id: ID(3) }), line({ id: ID(3) }), line()] }), id: ID(9), expectedVersion: 1 };
    expect(paths(updateMemoReceiveSchema.safeParse(update))).toEqual(["lines.1.id:duplicate"]);
    expect(updateMemoReceiveSchema.safeParse({ ...update, lines: [line({ id: ID(3) }), line()] }).success).toBe(true);
  });

  it("UT-MR-S3 photos (SA-MR-17): up to 5 distinct photo ids per line, in order", () => {
    const five = [3, 4, 5, 6, 7].map(ID);
    expect(createMemoReceiveSchema.parse(input({ lines: [line({ photoIds: five })] })).lines[0].photoIds).toEqual(five);
    expect(paths(createMemoReceiveSchema.safeParse(input({ lines: [line({ photoIds: [...five, ID(8)] })] })))).toEqual(["lines.0.photoIds:"]);
    expect(paths(createMemoReceiveSchema.safeParse(input({ lines: [line({ photoIds: [ID(3), ID(3)] })] })))).toEqual(["lines.0.photoIds:duplicate"]);
    expect(createMemoReceiveSchema.safeParse(input({ lines: [line({ photoIds: ["not-a-uuid"] })] })).success).toBe(false);
  });

  it("IT-MR-07 (schema) discount bounds: line % ≤ 100, line amount ≤ gross, document amount ≤ subtotal", () => {
    // gross = 1.5 ct × 1000 = 1500.00
    expect(paths(createMemoReceiveSchema.safeParse(input({ lines: [line({ discount: { type: "PERCENT", value: "100.01" } })] })))).toEqual(["lines.0.discount.value:too_big"]);
    expect(createMemoReceiveSchema.safeParse(input({ lines: [line({ discount: { type: "PERCENT", value: "100" } })] })).success).toBe(true);
    expect(paths(createMemoReceiveSchema.safeParse(input({ lines: [line({ discount: { type: "AMOUNT", value: "1500.01" } })] })))).toEqual(["lines.0.discount.value:exceeds_gross"]);
    expect(createMemoReceiveSchema.safeParse(input({ lines: [line({ discount: { type: "AMOUNT", value: "1500" } })] })).success).toBe(true);
    // subtotal = 1500 − 100 = 1400.00
    const discounted = [line({ discount: { type: "AMOUNT", value: "100" } })];
    expect(paths(createMemoReceiveSchema.safeParse(input({ lines: discounted, discount: { type: "AMOUNT", value: "1400.01" } })))).toEqual(["discount.value:exceeds_subtotal"]);
    expect(createMemoReceiveSchema.safeParse(input({ lines: discounted, discount: { type: "AMOUNT", value: "1400" } })).success).toBe(true);
    expect(paths(createMemoReceiveSchema.safeParse(input({ discount: { type: "PERCENT", value: "101" } })))).toEqual(["discount.value:too_big"]);
  });

  it("UT-MR-S2 memoStock.list input: vendor required, from ≤ to, range ≤ 366 days, limit ≤ 50", () => {
    expect(memoStockListSchema.parse({ vendorId: ID(1) })).toMatchObject({ limit: 50 });
    expect(memoStockListSchema.safeParse({ vendorId: ID(1), from: "2026-01-01", to: "2027-01-02" }).success).toBe(true);
    expect(paths(memoStockListSchema.safeParse({ vendorId: ID(1), from: "2026-01-01", to: "2027-01-03" }))).toEqual(["to:range_too_long"]);
    expect(paths(memoStockListSchema.safeParse({ vendorId: ID(1), from: "2026-02-01", to: "2026-01-31" }))).toEqual(["to:before_from"]);
    expect(memoStockListSchema.safeParse({ vendorId: ID(1), limit: 51 }).success).toBe(false);
    expect(memoStockListSchema.safeParse({ vendorId: ID(1), extra: 1 }).success).toBe(false);
  });
});

describe("Stock ID (SA-MR-04)", () => {
  it("UT-MR-ID1 is the 2-digit Asia/Bangkok year of the save + 4 digits", () => {
    expect(stockIdYear(new Date("2026-10-29T03:00:00Z"))).toBe(26);
    // 2026-12-31 17:30 UTC is already 2027-01-01 00:30 in Bangkok.
    expect(stockIdYear(new Date("2026-12-31T17:30:00Z"))).toBe(27);
    expect(stockIdYear(new Date("2026-12-31T16:59:59Z"))).toBe(26);
    expect(stockIdYear(new Date("2100-06-01T00:00:00Z"))).toBe(0);
    expect(formatStockId(26, 1)).toBe("260001");
    expect(formatStockId(27, 9999)).toBe("279999");
    expect(formatStockId(5, 42)).toBe("050042");
  });
});

describe("Memo Stock prices (SA-MR-06/11)", () => {
  const D = (value: string) => new Prisma.Decimal(value);
  it("UT-MR-P1 net unit price = line amount ÷ received basis, 4 dp half-up; zero basis falls back to the price", () => {
    const base = { priceUnit: "PER_CT", pcs: 3, weightCt: D("1.5"), unitPrice: D("1000"), discountType: "NONE", discountValue: D("0") };
    expect(netUnitPrice({ ...base, amount: D("1500") }).toFixed(4)).toBe("1000.0000");
    expect(netUnitPrice({ ...base, amount: D("1350"), discountType: "PERCENT", discountValue: D("10") }).toFixed(4)).toBe("900.0000");
    expect(netUnitPrice({ ...base, amount: D("1400"), discountType: "AMOUNT", discountValue: D("100") }).toFixed(4)).toBe("933.3333");
    expect(netUnitPrice({ ...base, priceUnit: "PER_PCS", unitPrice: D("500"), amount: D("1000") }).toFixed(4)).toBe("333.3333");
    expect(netUnitPrice({ ...base, priceUnit: "PER_PCS", pcs: 3, unitPrice: D("1"), amount: D("2") }).toFixed(4)).toBe("0.6667");
    expect(netUnitPrice({ ...base, weightCt: D("0"), amount: D("0"), discountType: "PERCENT", discountValue: D("25") }).toFixed(4)).toBe("750.0000");
    expect(netUnitPrice({ ...base, weightCt: D("0"), amount: D("0") }).toFixed(4)).toBe("1000.0000");
  });

  it("UT-MR-P2 dialog amount = line amount × pending ÷ received (CTS by weight, PCS by pieces), exact when fully pending", () => {
    const row = { price_unit: "PER_CT", received_pcs: 3, received_weight_ct: D("1.5"), pending_pcs: 3, pending_weight_ct: D("1.5"), line_amount: D("1333.33") };
    expect(pendingAmount(row).toFixed(2)).toBe("1333.33");
    expect(pendingAmount({ ...row, pending_weight_ct: D("0.5") }).toFixed(2)).toBe("444.44");
    expect(pendingAmount({ ...row, price_unit: "PER_PCS", pending_pcs: 1, pending_weight_ct: D("1.5") }).toFixed(2)).toBe("444.44");
    expect(pendingAmount({ ...row, price_unit: "PER_PCS", pending_pcs: 2 }).toFixed(2)).toBe("888.89");
    expect(pendingAmount({ ...row, received_weight_ct: D("0"), pending_weight_ct: D("0"), line_amount: D("0") }).toFixed(2)).toBe("0.00");
  });

  it("UT-MR-P3 the keyset cursor is base64url of date|stockId", () => {
    expect(Buffer.from(encodeStockCursor("2026-10-29", "260001"), "base64url").toString("utf8")).toBe("2026-10-29|260001");
  });
});
