import { describe, expect, it, vi } from "vitest";
import { createMemoReturnSchema, memoReturnListSchema, memoStockListSchema, updateMemoReturnSchema } from "../../src/trade-document/memo-schemas";

/**
 * Unit cases for memo-return SA rev 2 that need no database: input rules. The SQL paths (copy from Memo Stock,
 * approval reducing pending under a row lock) are covered by `memo-return.db.integration.test.ts`.
 */

vi.mock("../../src/database/prisma-client", () => ({ prisma: {} }));

const ID = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
const line = (patch: Record<string, unknown> = {}) => ({
  source: "MANUAL", stoneCodeId: null, stoneCode: "", stone: "Ruby", shape: "", size: "", color: "", clarity: "", cutting: "", quality: "",
  lot: "", location: "Memo", cerType: "", cerNo: "", pcs: 2, weightCt: "1.5", priceUnit: "PER_CT", unitPrice: "1000", discount: { type: "NONE", value: "0" },
  itemNote: "", photoIds: [], memoStockId: ID(5), outstandingPcs: 3, outstandingWeightCt: "2.25",
  ...patch,
});
const input = (patch: Record<string, unknown> = {}) => ({
  docDate: "2026-10-29", dueDate: "2026-11-29", currency: "THB", exchangeRate: null, ref: "", documentNote: "", lines: [line()],
  discount: { type: "NONE", value: "0" }, tax: { enabled: false, rate: "7", includeInPrice: false }, serviceCharges: [], labor: null,
  vendorId: ID(1), addressId: ID(2), ...patch,
});
const paths = (result: { success: boolean; error?: { issues: { path: PropertyKey[]; params?: unknown }[] } }) =>
  (result.error?.issues ?? []).map((issue) => `${issue.path.join(".")}:${(issue.params as { code?: string } | undefined)?.code ?? ""}`);

describe("memo return input (memo-return SA rev 2)", () => {
  it("UT-MRT-B01 every line names a Memo Stock item; Return ≤ Outstanding; no photos", () => {
    expect(createMemoReturnSchema.safeParse(input()).success).toBe(true);
    const { memoStockId: _memoStockId, ...unsourced } = line();
    expect(createMemoReturnSchema.safeParse(input({ lines: [unsourced] })).success).toBe(false);
    expect(createMemoReturnSchema.safeParse(input({ lines: [line({ memoStockId: "x" })] })).success).toBe(false);
    expect(paths(createMemoReturnSchema.safeParse(input({ lines: [line({ pcs: 4, weightCt: "2.26" })] })))).toEqual(["lines.0.pcs:exceeds_outstanding", "lines.0.weightCt:exceeds_outstanding"]);
    expect(createMemoReturnSchema.safeParse(input({ lines: [line({ photoIds: [ID(9)] })] })).success).toBe(false);
    expect(updateMemoReturnSchema.safeParse({ ...input(), id: ID(9), expectedVersion: 1 }).success).toBe(true);
  });

  it("UT-MRT-B02 list filters by status; the Memo Stock dialog filters by currency", () => {
    expect(memoReturnListSchema.parse({ status: "APPROVED" })).toMatchObject({ status: "APPROVED", limit: 50 });
    expect(memoReturnListSchema.safeParse({ status: "DRAFT" }).success).toBe(false);
    expect(memoStockListSchema.parse({ vendorId: ID(1), currency: "USD" })).toMatchObject({ currency: "USD" });
    expect(memoStockListSchema.safeParse({ vendorId: ID(1), currency: "usd" }).success).toBe(false);
  });
});
