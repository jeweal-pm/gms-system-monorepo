import { describe, expect, it } from "vitest";
import { createQuotationSchema, quotationListSchema, reasonedIdSchema, updateQuotationSchema } from "../../src/quotation/quotation.schemas";

/** UT-QT-B09…B11: strict quotation inputs (SA-QT-06/07/08, api-contract.md). */

const ID = "11111111-1111-4111-8111-111111111111";
const line = {
  source: "MANUAL", stoneCodeId: null, stoneCode: "RU-1", stone: "Ruby", shape: "Oval", size: "", color: "", clarity: "", cutting: "", quality: "",
  lot: "", location: "", cerType: "", cerNo: "", pcs: 1, weightCt: "1.120", priceUnit: "PER_CT", unitPrice: "65000.00", discount: { type: "NONE" as const, value: "0" }, itemNote: "", photoIds: [],
};
export const quotationBody = {
  docDate: "2026-10-26", dueDate: "2026-11-25", customerId: ID, shippingAddressId: ID, invoiceAddressId: ID,
  currency: "USD", exchangeRate: "36.25", ref: "", documentNote: "",
  lines: [line],
  discount: { type: "NONE", value: "0" },
  tax: { enabled: true, rate: "7", includeInPrice: false },
  serviceCharges: [{ type: "SHIPPING", amount: "100" }],
  labor: null,
};
const paths = (value: unknown) => {
  const result = createQuotationSchema.safeParse(value);
  return result.success ? [] : result.error.issues.map((issue) => issue.path.join("."));
};

describe("quotation inputs", () => {
  it("UT-QT-B09 a valid body parses; text is trimmed; unknown keys are rejected", () => {
    expect(createQuotationSchema.parse({ ...quotationBody, ref: "  PO-77  " }).ref).toBe("PO-77");
    expect(paths({ ...quotationBody, extra: 1 })).toEqual([""]);
    expect(paths({ ...quotationBody, lines: [{ ...line, totals: "1" }] })).toEqual(["lines.0"]);
    expect(updateQuotationSchema.safeParse({ ...quotationBody, id: ID }).success).toBe(false);
    expect(updateQuotationSchema.safeParse({ ...quotationBody, id: ID, expectedVersion: 1 }).success).toBe(true);
  });

  it("UT-QT-B10 bounds: lines 1–200, decimals, due date, percent, tax rate, charges, photos", () => {
    expect(paths({ ...quotationBody, lines: [] })).toEqual(["lines"]);
    expect(paths({ ...quotationBody, lines: Array.from({ length: 201 }, () => line) })).toEqual(["lines"]);
    expect(paths({ ...quotationBody, lines: [{ ...line, weightCt: "1.1234" }] })).toEqual(["lines.0.weightCt"]);
    expect(paths({ ...quotationBody, lines: [{ ...line, unitPrice: "-1" }] })).toEqual(["lines.0.unitPrice"]);
    // SA rev 2 (SA-QT-16): STOCK is allowed, but only with its Memo Stock item.
    expect(paths({ ...quotationBody, lines: [{ ...line, source: "STOCK" }] })).toEqual(["lines.0.memoStockId"]);
    expect(paths({ ...quotationBody, lines: [{ ...line, photoIds: [ID, ID] }] })).toEqual(["lines.0.photoIds"]);
    expect(paths({ ...quotationBody, lines: [{ ...line, photoIds: [ID, ID, ID, ID, ID, ID].map((id, i) => id.replace(/1$/, String(i))) }] })).toEqual(["lines.0.photoIds"]);
    expect(paths({ ...quotationBody, lines: [{ ...line, photoIds: [ID, ID, ID, ID, ID].map((id, i) => id.replace(/1$/, String(i))) }] })).toEqual([]);
    expect(paths({ ...quotationBody, lines: [{ ...line, discount: { type: "PERCENT", value: "101" } }] })).toEqual(["lines.0.discount.value"]);
    expect(paths({ ...quotationBody, lines: [{ ...line, discount: { type: "AMOUNT", value: "-1" } }] })).toEqual(["lines.0.discount.value"]);
    expect(paths({ ...quotationBody, dueDate: "2026-10-25" })).toEqual(["dueDate"]);
    expect(paths({ ...quotationBody, discount: { type: "PERCENT", value: "100.5" } })).toEqual(["discount.value"]);
    expect(paths({ ...quotationBody, tax: { enabled: true, rate: "101", includeInPrice: false } })).toEqual(["tax.rate"]);
    expect(paths({ ...quotationBody, exchangeRate: "0" })).toEqual(["exchangeRate"]);
    expect(paths({ ...quotationBody, serviceCharges: [{ type: "SHIPPING", amount: "1" }, { type: "SHIPPING", amount: "2" }] })).toEqual(["serviceCharges"]);
    expect(paths({ ...quotationBody, documentNote: "x".repeat(501) })).toEqual(["documentNote"]);
  });

  it("UT-QT-B11 list is bounded to 50; reasons are required for reject/cancel", () => {
    expect(quotationListSchema.parse({}).limit).toBe(50);
    expect(quotationListSchema.safeParse({ limit: 51 }).success).toBe(false);
    expect(reasonedIdSchema.safeParse({ id: ID, expectedVersion: 1, reason: "  " }).success).toBe(false);
    expect(reasonedIdSchema.safeParse({ id: ID, expectedVersion: 1, reason: "Price changed" }).success).toBe(true);
  });
});

describe("UT-QT-B25a quotation From Stock lines (SA rev 2, SA-QT-16/17)", () => {
  const ITEM = "22222222-2222-4222-8222-222222222222";
  const stock = { ...line, source: "STOCK", stoneCodeId: null, stoneCode: "", memoStockId: ITEM, unitPrice: "1500" };
  const codes = (lines: unknown[]) => {
    const result = createQuotationSchema.safeParse({ ...quotationBody, lines });
    return result.success ? [] : result.error.issues.map((issue) => `${issue.path.join(".")}:${(issue as { params?: { code?: string } }).params?.code ?? issue.code}`);
  };

  it("accepts typed lines without memoStockId (null by default) and stock lines naming their item", () => {
    expect(createQuotationSchema.parse(quotationBody).lines[0].memoStockId ?? null).toBeNull();
    expect(codes([line, stock])).toEqual([]);
  });

  it("STOCK needs its item once, no stone code, a quantity and a Sale Price; MANUAL can't name an item", () => {
    expect(codes([{ ...stock, memoStockId: null }])).toEqual(["lines.0.memoStockId:required"]);
    expect(codes([stock, stock])).toEqual(["lines.1.memoStockId:duplicate"]);
    expect(codes([{ ...stock, stoneCodeId: ITEM }])).toEqual(["lines.0.stoneCodeId:invalid"]);
    expect(codes([{ ...stock, pcs: 0, weightCt: "0" }])).toEqual(["lines.0.pcs:required"]);
    expect(codes([{ ...stock, unitPrice: "0" }])).toEqual(["lines.0.unitPrice:required"]);
    expect(codes([{ ...line, memoStockId: ITEM }])).toEqual(["lines.0.memoStockId:invalid"]);
    expect(codes([{ ...stock, source: "OTHER" }])).toEqual(["lines.0.source:invalid_value"]);
  });
});
