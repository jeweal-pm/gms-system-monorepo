import { describe, expect, it } from "vitest";
import {
  loadErrorMessage,
  mapDeleteError,
  mapSaveError,
  rowText,
  toCreateInput,
  toDuplicateValues,
  toFormValues,
  toUpdateFields,
  type CurrencyDetail,
} from "@/features/currency/api";
import { formatRate, rateProblem, sanitizeRate } from "@/features/currency/rates";
import { currencyFormSchema, emptyCurrencyForm, isBaseCode, type CurrencyFormValues } from "@/features/currency/schema";
import { quotationCurrencyOptions, quotationExchangeRate, type CurrencyOptionItem } from "@/features/quotation/lib/currency";
import { gatewayError, issuesByPath } from "../partner/helpers";

/** UT-CUR-01…06: currency UI rev 1 (owner 2026-10-26) page logic and the Quotation currency select. */

const values = (overrides: Partial<CurrencyFormValues> = {}): CurrencyFormValues => ({
  ...emptyCurrencyForm(),
  code: "usd",
  name: "US Dollar",
  description: "Sales to the US",
  sellingRate: "33.25",
  buyingRate: "32.9",
  ...overrides,
});

const detail = (overrides: Partial<CurrencyDetail> = {}): CurrencyDetail => ({
  id: "00000000-0000-4000-8000-000000000001",
  code: "USD",
  name: "US Dollar",
  description: "Sales to the US",
  active: true,
  sellingRate: "33.2500",
  buyingRate: "32.9000",
  createdAt: "2026-10-26T00:00:00.000Z",
  updatedAt: "2026-10-26T00:00:00.000Z",
  baseCode: "THB",
  ...overrides,
});

describe("form schema (UT-CUR-01)", () => {
  const schema = currencyFormSchema("THB");

  it("accepts a valid non-base currency", () => {
    expect(issuesByPath(schema, values())).toEqual({});
  });

  it("checks code, name, description and both rates", () => {
    expect(issuesByPath(schema, values({ code: "US", name: " ", description: "", sellingRate: "", buyingRate: "0.0000" }))).toEqual({
      code: "Enter 3 letters, e.g. USD",
      name: "Name is required",
      description: "Description is required",
      sellingRate: "Rate is required",
      buyingRate: "Enter a rate greater than 0",
    });
    expect(issuesByPath(schema, values({ description: "x".repeat(251) })).description).toBe("Use 250 characters or fewer");
  });

  it("needs no rates for the base currency (case-insensitive)", () => {
    expect(issuesByPath(schema, values({ code: "thb", sellingRate: "", buyingRate: "" }))).toEqual({});
    expect(isBaseCode(" thb ", "THB")).toBe(true);
    expect(isBaseCode("THB", null)).toBe(false);
  });

  it("requires rates when there is no company currency yet", () => {
    expect(issuesByPath(currencyFormSchema(null), values({ code: "THB", sellingRate: "" })).sellingRate).toBe("Rate is required");
  });
});

describe("rates", () => {
  it("sanitizes typing to digits, one dot and 4 decimals", () => {
    expect(sanitizeRate("1,234.56789")).toBe("1234.5678");
    expect(sanitizeRate("3a3.2.5")).toBe("33.25");
    expect(sanitizeRate("123456789012345678")).toBe("12345678901234");
  });

  it("formats to 4 decimals without losing precision", () => {
    expect(formatRate("33.25")).toBe("33.2500");
    expect(formatRate("007")).toBe("7.0000");
    expect(formatRate("12345678901234.1")).toBe("12345678901234.1000");
    expect(formatRate("abc")).toBe("abc");
  });

  it("explains a bad rate", () => {
    expect(rateProblem("1.23456")).toBe("Use digits with up to 4 decimals");
    expect(rateProblem("0.0001")).toBeNull();
  });
});

describe("mapping (UT-CUR-02)", () => {
  it("loads a detail into the form, rates empty when not set", () => {
    expect(toFormValues(detail())).toEqual({ code: "USD", name: "US Dollar", description: "Sales to the US", active: true, sellingRate: "33.2500", buyingRate: "32.9000" });
    expect(toFormValues(detail({ sellingRate: null, buyingRate: null }))).toMatchObject({ sellingRate: "", buyingRate: "" });
    expect(toDuplicateValues(detail()).code).toBe("");
  });

  it("builds create/update input; the base currency sends no rates; update never sends the code", () => {
    expect(toCreateInput(values(), "THB")).toEqual({ code: "USD", name: "US Dollar", description: "Sales to the US", active: true, sellingRate: "33.2500", buyingRate: "32.9000" });
    expect(toCreateInput(values({ code: "thb" }), "THB")).toMatchObject({ code: "THB", sellingRate: null, buyingRate: null });
    const fields = toUpdateFields(values({ code: "EUR" }), "USD", "THB");
    expect(fields).toEqual({ name: "US Dollar", description: "Sales to the US", active: true, sellingRate: "33.2500", buyingRate: "32.9000" });
    expect(toUpdateFields(values(), "THB", "THB")).toMatchObject({ sellingRate: null, buyingRate: null });
  });
});

describe("drawer rows (UT-CUR-03)", () => {
  it("shows the base, the rates or 'Rates not set'", () => {
    expect(rowText(detail({ code: "THB", name: "Thai Baht" }), "THB")).toEqual({ primary: "THB · Thai Baht", secondary: "Base currency" });
    expect(rowText(detail(), "THB")).toEqual({ primary: "USD · US Dollar", secondary: "Sell 33.2500 · Buy 32.9000 THB" });
    expect(rowText(detail({ sellingRate: null }), "THB").secondary).toBe("Rates not set");
    expect(rowText(detail(), null).secondary).toBe("Sell 33.2500 · Buy 32.9000");
  });
});

describe("errors (UT-CUR-04)", () => {
  it("maps save errors to fields and banners", () => {
    expect(mapSaveError(gatewayError({ domainCode: "CURRENCY_CODE_TAKEN", httpStatus: 409, code: "CONFLICT" }))).toEqual({ fieldErrors: [{ name: "code", message: "This code is already used" }], formError: null });
    expect(mapSaveError(gatewayError({ domainCode: "CURRENCY_CHANGED", httpStatus: 409, code: "CONFLICT" }))).toMatchObject({ stale: true });
    expect(mapSaveError(gatewayError({ domainCode: "CURRENCY_NOT_FOUND", httpStatus: 404, code: "NOT_FOUND" }))).toMatchObject({ notFound: true });
    expect(mapSaveError(gatewayError({ domainCode: "CURRENCY_BASE_LOCKED", httpStatus: 409, code: "CONFLICT" })).formError).toContain("always active");
    expect(mapSaveError(gatewayError({ domainCode: "VALIDATION_ERROR", fieldErrors: [{ path: "sellingRate", code: "required" }] }))).toEqual({
      fieldErrors: [{ name: "sellingRate", message: "Rate is required" }],
      formError: null,
    });
    expect(mapSaveError(gatewayError({ domainCode: "PERMISSION_DENIED", httpStatus: 403, code: "FORBIDDEN" }))).toMatchObject({ recheckAccess: true });
    expect(mapSaveError(gatewayError({ domainCode: "SOMETHING_ELSE" })).formError).toBe("Couldn't save. Try again.");
  });

  it("maps delete and load errors", () => {
    expect(mapDeleteError(gatewayError({ domainCode: "CURRENCY_IN_USE", httpStatus: 409, code: "CONFLICT" }))).toEqual({ kind: "dialog", message: "This currency is used by other records. Turn off Active instead." });
    expect(mapDeleteError(gatewayError({ domainCode: "CURRENCY_NOT_FOUND", httpStatus: 404, code: "NOT_FOUND" })).kind).toBe("gone");
    expect(loadErrorMessage(gatewayError({ domainCode: "PERMISSION_DENIED", httpStatus: 403, code: "FORBIDDEN" }), "currencies")).toBe("You don't have permission to view Currency.");
  });
});

describe("Quotation currency (UT-CUR-06)", () => {
  const items: CurrencyOptionItem[] = [
    { code: "INR", name: "Indian Rupee", active: false, sellingRate: "0.4000", buyingRate: "0.3850" },
    { code: "THB", name: "Thai Baht", active: true, sellingRate: null, buyingRate: null },
    { code: "USD", name: "US Dollar", active: true, sellingRate: "33.2500", buyingRate: "32.9000" },
  ];

  it("offers active currencies plus the current inactive or unknown one", () => {
    expect(quotationCurrencyOptions(items, "USD").map((option) => option.value)).toEqual(["THB", "USD"]);
    expect(quotationCurrencyOptions(items, "INR")).toContainEqual({ value: "INR", label: "INR (inactive)" });
    expect(quotationCurrencyOptions(items, "EUR").at(-1)).toEqual({ value: "EUR", label: "EUR" });
  });

  it("uses the Selling Rate; the base currency and missing rates leave it empty", () => {
    expect(quotationExchangeRate(items, "THB", "USD")).toBe("33.2500");
    expect(quotationExchangeRate(items, "THB", "THB")).toBe("");
    expect(quotationExchangeRate(items, "THB", "EUR")).toBe("");
    expect(quotationExchangeRate(items, "THB", "")).toBe("");
  });
});
