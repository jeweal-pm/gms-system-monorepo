import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { createElement, type FunctionComponent, type ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { FormProvider, useForm } from "react-hook-form";
import { describe, expect, it, vi } from "vitest";
import {
  DECIMAL_SETUP_STALE_MS,
  draftFrom,
  LEGACY_STORAGE_KEY,
  lastUpdatedText,
  loadErrorMessage,
  mapSaveError,
  placesFrom,
  removeLegacyStorage,
  retryDecimalSetupRead,
  toSaveInput,
  type DecimalSetup,
} from "@/features/decimal-setup/api";
import { DECIMAL_SETUP_ENTITY, isDraftDirty } from "@/features/decimal-setup/decimal-setup-page";
import { NumberFormatContext, numberFormatFor, useNumberFormat } from "@/features/decimal-setup/number-format-provider";
import { choicesFor, exampleText, isPlaces } from "@/features/decimal-setup/pages";
import { menuKeyFor, SETUP_MENU_KEYS } from "@/features/home/navigation";
import { ReturnItemTable } from "@/features/memo-out-return/components/ReturnItemTable";
import { PrintContent } from "@/features/memo-outstanding-vendor/components/print-view";
import { formatMoney as formatOutstandingMoney, formatUnitPrice as formatOutstandingUnitPrice, formatWeight as formatOutstandingWeight } from "@/features/memo-outstanding-vendor/model";
import { DiscountPair } from "@/features/quotation/components/DiscountPair";
import { ItemTable } from "@/features/quotation/components/items/ItemTable";
import { SummaryValue } from "@/features/quotation/components/summary/SummaryValue";
import { calculateTotals } from "@/features/quotation/lib/calculate";
import { dec } from "@/features/quotation/lib/decimal";
import { emptyLine, emptyQuotation } from "@/features/quotation/lib/defaults";
import { formatMoney, formatMoneyText, formatUnitPrice, formatWeight } from "@/features/quotation/lib/format";
import { sanitizeDecimal } from "@/features/quotation/lib/number";
import type { QuotationFormValues } from "@/features/quotation/schema";
import { returnCellLimits } from "@/features/trade-document/return-item-table";
import { gatewayError } from "../partner/helpers";
import { item, row } from "../memo-outstanding-vendor/fixtures";

/** decimal-setup TODO rev 2 (UI rev 2 + SA rev 1, owner Q-DEC-08 change): UT-DEC-01, 03, 05, 11, 12, 14…17. */

const setup = (patch: Partial<DecimalSetup> = {}): DecimalSetup => ({ weightPlaces: 2, pricePlaces: 2, version: 3, updatedAt: "2026-11-03T08:10:00.000Z", updatedBy: "usr_admin", ...patch });
const withPlaces = (weightPlaces: number, pricePlaces: number, child: ReactNode) => createElement(NumberFormatContext.Provider, { value: numberFormatFor({ weightPlaces, pricePlaces }) }, child);
const noop = () => undefined;

describe("UT-DEC-01 one setting and its ranges", () => {
  it("offers weight and price 0–4 (owner 2026-11-03, Q-DEC-08 changed)", () => {
    expect(choicesFor("weight")).toEqual([0, 1, 2, 3, 4]);
    expect(choicesFor("price")).toEqual([0, 1, 2, 3, 4]);
    expect(isPlaces("weight", 4)).toBe(true);
    expect(isPlaces("price", 5)).toBe(false);
    expect(isPlaces("price", "2")).toBe(false);
  });
});

describe("UT-DEC-03 examples", () => {
  it("rounds half-up and formats weight in ct and price with thousands separators", () => {
    expect(exampleText("weight", 0)).toBe("1 ct");
    expect(exampleText("weight", 2)).toBe("1.23 ct");
    expect(exampleText("weight", 3)).toBe("1.235 ct");
    expect(exampleText("weight", 4)).toBe("1.2346 ct");
    expect(exampleText("price", 0)).toBe("12,346");
    expect(exampleText("price", 2)).toBe("12,345.68");
    expect(exampleText("price", 4)).toBe("12,345.6789");
  });
});

describe("UT-DEC-05 page layout and gate", () => {
  const source = readFileSync(new URL("../../src/features/decimal-setup/decimal-setup-page.tsx", import.meta.url), "utf8");

  it("has one Default card, no per-page table, Apply to all or search", () => {
    expect(source).toContain('title="Default"');
    expect(source).not.toContain("Decimal Places by Page");
    expect(source).not.toContain("Apply to all");
    expect(source).not.toContain("Search page");
  });

  it("is gated by its own decimal-setup leaf, which also shows the Setup menu (FE-DEC-103)", () => {
    expect(DECIMAL_SETUP_ENTITY.key).toBe("decimal-setup");
    expect(SETUP_MENU_KEYS).toContain("decimal-setup");
    expect(menuKeyFor("decimal-setup")).toBe("decimal-setup");
  });
});

describe("UT-DEC-11 api mapping", () => {
  it("edits from the loaded version and sends exactly the contract fields", () => {
    const draft = draftFrom(setup({ version: 7 }));
    expect(draft).toEqual({ weightPlaces: 2, pricePlaces: 2, expectedVersion: 7 });
    expect(toSaveInput({ ...draft, weightPlaces: 3 })).toEqual({ weightPlaces: 3, pricePlaces: 2, expectedVersion: 7 });
    expect(draftFrom(setup({ version: 0 })).expectedVersion).toBe(0);
  });

  it("maps DECIMAL_SETUP_CHANGED to the conflict message with Reload and every other error to a page message", () => {
    expect(mapSaveError(gatewayError({ domainCode: "DECIMAL_SETUP_CHANGED", httpStatus: 409, code: "CONFLICT" }))).toEqual({
      message: "Someone else changed the decimal setup. Reload to see the latest values.",
      conflict: true,
    });
    expect(mapSaveError(gatewayError({ domainCode: "VALIDATION_ERROR", fieldErrors: [{ path: "weightPlaces", code: "too_big" }] })).message).toBe("Choose 0 to 4 decimal places for weight and price.");
    expect(mapSaveError(gatewayError({ domainCode: "PERMISSION_DENIED", httpStatus: 403, code: "FORBIDDEN" }))).toMatchObject({ recheckAccess: true });
    expect(mapSaveError(gatewayError({ domainCode: "CSRF_INVALID", httpStatus: 403 })).message).toContain("Reload the page");
    expect(mapSaveError(gatewayError({ domainCode: "LICENSE_REQUIRED", httpStatus: 403 })).message).toContain("license");
    expect(mapSaveError(gatewayError({ domainCode: "UNAUTHENTICATED", httpStatus: 401 })).message).toBe("Your session has ended. Sign in again.");
    expect(mapSaveError(new Error("network")).message).toBe("Couldn't save. Try again.");
    expect(mapSaveError(gatewayError({ domainCode: "DECIMAL_SETUP_CHANGED", httpStatus: 409 })).recheckAccess).toBeUndefined();
  });

  it("explains load errors", () => {
    expect(loadErrorMessage(gatewayError({ domainCode: "LICENSE_REQUIRED", httpStatus: 403 }))).toBe("Your license doesn't allow using this page right now.");
    expect(loadErrorMessage(gatewayError({ domainCode: "PARTNER_UNAVAILABLE", httpStatus: 503 }))).toBe("Couldn't load the decimal setup.");
  });
});

describe("UT-DEC-12 rev 1 browser value removed (Q-DEC-17)", () => {
  it("deletes gms.decimal-setup.v1 and ignores blocked storage", () => {
    const storage = { removeItem: vi.fn() };
    removeLegacyStorage(storage);
    expect(LEGACY_STORAGE_KEY).toBe("gms.decimal-setup.v1");
    expect(storage.removeItem).toHaveBeenCalledWith("gms.decimal-setup.v1");
    expect(() => removeLegacyStorage({ removeItem: () => { throw new Error("SecurityError"); } })).not.toThrow();
    expect(() => removeLegacyStorage(undefined)).not.toThrow();
  });

  it("never reads or writes browser storage anywhere in the feature", () => {
    const dir = new URL("../../src/features/decimal-setup/", import.meta.url);
    const sources = readdirSync(dir).map((name) => readFileSync(join(dir.pathname.replace(/^\/([A-Za-z]:)/, "$1"), name), "utf8")).join("\n");
    expect(sources).not.toMatch(/getItem|setItem|sessionStorage/);
    expect(sources).toContain("storage?.removeItem(LEGACY_STORAGE_KEY)");
  });
});

describe("UT-DEC-14 provider values and fallback (Q-DEC-15/16)", () => {
  it("uses weight 2 / price 2 while loading or after an error, and the loaded places otherwise", () => {
    expect(placesFrom(undefined)).toEqual({ weightPlaces: 2, pricePlaces: 2 });
    expect(placesFrom({ setup: setup({ weightPlaces: 3, pricePlaces: 0 }) })).toEqual({ weightPlaces: 3, pricePlaces: 0 });
    expect(placesFrom({ setup: setup({ weightPlaces: 9, pricePlaces: -1 }) })).toEqual({ weightPlaces: 2, pricePlaces: 2 });
    expect(DECIMAL_SETUP_STALE_MS).toBe(600_000);
  });

  it("retries a transient read once and never a 4xx", () => {
    const transient = gatewayError({ domainCode: "PARTNER_UNAVAILABLE", httpStatus: 503, code: "INTERNAL_SERVER_ERROR" });
    expect(retryDecimalSetupRead(0, transient)).toBe(true);
    expect(retryDecimalSetupRead(1, transient)).toBe(false);
    expect(retryDecimalSetupRead(0, gatewayError({ domainCode: "LICENSE_REQUIRED", httpStatus: 403 }))).toBe(false);
  });

  it("binds formatters and input caps to the places; outside the provider the defaults apply", () => {
    const format = numberFormatFor({ weightPlaces: 4, pricePlaces: 4 });
    expect(format.weight("1.235")).toBe("1.2350");
    expect(format.money("12000")).toBe("12,000.0000");
    expect(format.unitPrice("1234.4995")).toBe("1,234.5000");
    expect([format.weightInputDecimals, format.priceInputDecimals]).toEqual([3, 2]);
    const Probe: FunctionComponent = () => {
      const nf = useNumberFormat();
      return createElement("output", null, `${nf.weightPlaces}/${nf.pricePlaces} ${nf.money("1")}`);
    };
    expect(renderToStaticMarkup(createElement(Probe))).toContain("2/2 1.00");
    expect(renderToStaticMarkup(withPlaces(3, 0, createElement(Probe)))).toContain("3/0 1");
  });
});

describe("UT-DEC-15 page modes", () => {
  it("Save turns on only when a value differs from the loaded one", () => {
    const loaded = setup();
    expect(isDraftDirty(null, loaded)).toBe(false);
    expect(isDraftDirty(draftFrom(loaded), loaded)).toBe(false);
    expect(isDraftDirty({ ...draftFrom(loaded), pricePlaces: 0 }, loaded)).toBe(true);
    expect(isDraftDirty({ ...draftFrom(loaded), weightPlaces: 4 }, undefined)).toBe(false);
  });

  it("shows Last updated in Asia/Bangkok, hidden before the first save by a user", () => {
    expect(lastUpdatedText(setup({ updatedAt: "2026-11-03T08:10:00.000Z" }))).toBe("Last updated 03/11/2026 15:10");
    expect(lastUpdatedText(setup({ version: 0, updatedAt: "1970-01-01T00:00:00.000Z", updatedBy: null }))).toBeNull();
    expect(lastUpdatedText(setup({ version: 1, updatedBy: null }))).toBeNull();
    expect(lastUpdatedText(setup({ updatedAt: "not a date" }))).toBeNull();
  });
});

describe("UT-DEC-16 display call sites follow the setting (FE-DEC-104, Q-DEC-18)", () => {
  const line = { ...emptyLine(), stone: "Ruby", stoneCode: "RU-1", pcs: "2", weightCt: "1.235", unitPrice: "24000.25", priceUnit: "PER_PCS" as const };

  it("quotation formatters delegate to the shared module with places (default 2)", () => {
    expect(formatWeight(dec("1.235"))).toBe("1.24");
    expect(formatWeight(dec("1.235"), 3)).toBe("1.235");
    expect(formatMoney(dec("48000.5"), 0)).toBe("48,001");
    expect(formatMoney(dec("-0.5"), 0)).toBe("-1");
    expect(formatMoneyText("12000", 4)).toBe("12,000.0000");
    expect(formatUnitPrice("1234.4995", 3)).toBe("1,234.500");
    expect(formatOutstandingWeight("25.605")).toBe("25.61");
    expect(formatOutstandingWeight("25.605", 3)).toBe("25.605");
    expect(formatOutstandingMoney("13633.5", 0)).toBe("13,634");
    expect(formatOutstandingUnitPrice("760.1250", 4)).toBe("760.1300");
  });

  it("quotation item table: 3 / 0 shows 1.235 cts and 48,001", () => {
    const lines = [line];
    const table = createElement(ItemTable, {
      lines,
      currency: "THB",
      totals: calculateTotals({ ...emptyQuotation(), lines }),
      selectedIndex: null,
      checkedKeys: new Set<string>(),
      readOnly: true,
      onSelectRow: noop,
      onToggleCheck: noop,
      onToggleAll: noop,
      onRowAction: noop,
      onAddRow: noop,
    });
    const html = renderToStaticMarkup(withPlaces(3, 0, table));
    expect(html).toContain("1.235 cts");
    expect(html).toContain("24,000 THB");
    expect(html).toContain("48,001 THB");
    expect(renderToStaticMarkup(table)).toContain("48,000.50 THB");
  });

  it("quotation summary: subtotal and grand total use the price places", () => {
    const values = { ...emptyQuotation(), currency: "THB", lines: [line] } as QuotationFormValues;
    function InForm({ children }: { children?: ReactNode }) {
      const form = useForm<QuotationFormValues>({ defaultValues: values });
      return createElement(FormProvider<QuotationFormValues>, form as Parameters<typeof FormProvider<QuotationFormValues>>[0], children);
    }
    const summary = createElement(InForm, null, createElement(SummaryValue, { totals: calculateTotals(values), currency: "THB" }));
    const html = renderToStaticMarkup(withPlaces(2, 4, summary));
    expect(html).toContain("48,000.5000");
    expect(renderToStaticMarkup(withPlaces(2, 0, summary))).toContain("48,001");
  });

  it("memo outstanding print view (report) uses the weight and price places", () => {
    const html = renderToStaticMarkup(
      withPlaces(3, 0, createElement(PrintContent, { entries: [{ row: row(), items: [item()] }], prefs: { hidden: [], subtasks: "collapsed" }, filters: [], scope: "Current page", printedAt: "" })),
    );
    const plain = renderToStaticMarkup(createElement(PrintContent, { entries: [{ row: row(), items: [item()] }], prefs: { hidden: [], subtasks: "collapsed" }, filters: [], scope: "Current page", printedAt: "" }));
    expect(plain).toContain(">30.00<");
    expect(plain).toContain("12,000.00 AED (open value)");
    expect(plain).toContain("1,850.00 USD");
    expect(html).toContain(">30.000<");
    expect(html).toContain(">4.350<");
    expect(html).toContain("12,000 AED (open value)");
    expect(html).toContain("1,850 USD");
  });
});

describe("UT-DEC-17 inputs never type past storage (FE-DEC-105, owner Q-DEC-08)", () => {
  it("return weight cell follows min(weight places, 3); pcs stays whole", () => {
    expect(returnCellLimits("weightCt", 2)).toMatchObject({ whole: 5, decimals: 2 });
    expect(returnCellLimits("weightCt", 3).decimals).toBe(3);
    expect(returnCellLimits("weightCt", 9).decimals).toBe(3);
    expect(returnCellLimits("pcs", 3)).toMatchObject({ whole: 6, decimals: 0 });
    expect(sanitizeDecimal("1.2359", numberFormatFor({ weightPlaces: 2, pricePlaces: 2 }).weightInputDecimals)).toBe("1.23");
    expect(sanitizeDecimal("1.2359", numberFormatFor({ weightPlaces: 4, pricePlaces: 2 }).weightInputDecimals)).toBe("1.235");
    expect(sanitizeDecimal("10.555", numberFormatFor({ weightPlaces: 2, pricePlaces: 4 }).priceInputDecimals)).toBe("10.55");
  });

  it("discount amount is a money field (numeric keyboard at price 0); the percent keeps its decimals", () => {
    const pair = createElement(DiscountPair, { type: "AMOUNT", value: "", base: dec("1000"), currency: "THB", labels: false, onChange: noop });
    const atZero = renderToStaticMarkup(withPlaces(2, 0, pair));
    expect(atZero).toMatch(/inputMode="numeric"[^>]*aria-label="Discount Amt \(THB\)"|aria-label="Discount Amt \(THB\)"[^>]*inputMode="numeric"/);
    expect(atZero).toMatch(/inputMode="decimal"[^>]*aria-label="Discount \(%\)"|aria-label="Discount \(%\)"[^>]*inputMode="decimal"/);
    expect(renderToStaticMarkup(withPlaces(2, 2, pair))).not.toContain('inputMode="numeric"');
  });

  it("memo out return weight cell uses a numeric keyboard at weight 0; outstanding weights show with the weight places", () => {
    const filled = { ...emptyLine(), stone: "Ruby", stoneCode: "RU-1", pcs: "2", weightCt: "1.5", unitPrice: "1000", memoOutLineId: "x", memoOutNo: "MO-1", outstandingPcs: "3", outstandingWeightCt: "2.255" };
    const lines = [filled];
    function InForm({ children }: { children?: ReactNode }) {
      const form = useForm({ defaultValues: { lines } });
      return createElement(FormProvider, form as unknown as Parameters<typeof FormProvider>[0], children);
    }
    const table = createElement(ReturnItemTable, {
      lines,
      currency: "THB",
      totals: calculateTotals({ ...emptyQuotation(), lines }),
      selectedIndex: null,
      checkedKeys: new Set<string>(),
      readOnly: false,
      onSelectRow: noop,
      onToggleCheck: noop,
      onToggleAll: noop,
      onRowAction: noop,
      onAddRow: () => 0,
    });
    const html = renderToStaticMarkup(withPlaces(0, 2, createElement(InForm, null, table)));
    expect(html).toMatch(/aria-label="Return weight, row 1"[^>]*inputMode="numeric"|inputMode="numeric"[^>]*aria-label="Return weight, row 1"/);
    expect(html).toContain(">2<");
    const three = renderToStaticMarkup(withPlaces(3, 2, createElement(InForm, null, table)));
    expect(three).toContain(">2.255<");
  });
});
