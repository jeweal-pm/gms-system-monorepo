import { describe, expect, it } from "vitest";
import { can, partnerAccess } from "@/features/partner/access";
import { invoiceAddressType, shippingAddressType } from "@/features/partner/address-types";
import { lowerPlural, lowerSingular, type PartnerEntity } from "@/features/partner/entity";
import { currencyChoices, toSelectOptions } from "@/features/partner/options";
import { draftRowTitle, partnerDrawerId } from "@/features/partner/components/partner-drawer";
import { partnerHeaderButtons, partnerTitle, type PartnerMode } from "@/features/partner/components/partner-page-header";

/**
 * UT-ADR21-03a…k (header title/buttons, ADR-0021 §3), UT-R3-01a/b (draft row title, customer rev 3 / vendor rev 4),
 * UT-PTN-P01…P07 (entity wording, permission helpers, option lists, address type config).
 */

const customer: PartnerEntity = { key: "customer", singular: "Customer", plural: "Customers" };
const vendor: PartnerEntity = { key: "vendor", singular: "Vendor", plural: "Vendors" };

describe("partnerTitle", () => {
  it("UT-ADR21-03a create mode shows \"Add {Entity}\"", () => {
    expect(partnerTitle(customer, "create", "ACME")).toBe("Add Customer");
    expect(partnerTitle(vendor, "create", undefined)).toBe("Add Vendor");
  });

  it("UT-ADR21-03b view and edit modes show the record name", () => {
    expect(partnerTitle(customer, "view", "ACME Co.")).toBe("ACME Co.");
    expect(partnerTitle(vendor, "edit", "Gold Supplier")).toBe("Gold Supplier");
  });

  it("UT-ADR21-03c falls back to the entity name while the record loads or with no selection", () => {
    expect(partnerTitle(customer, "view", undefined)).toBe("Customer");
    expect(partnerTitle(vendor, "edit", "")).toBe("Vendor");
    // Owner 2026-10-17: VIEW-only users land on the (disabled) Add page.
    expect(partnerTitle(vendor, "none", "ignored")).toBe("Add Vendor");
  });
});

describe("partnerHeaderButtons (ADR-0021 §3 table)", () => {
  const idle = { savedLoaded: true, gone: false, submitting: false, deleting: false };
  const buttons = (mode: PartnerMode, overrides: Partial<typeof idle> = {}) => partnerHeaderButtons({ mode, ...idle, ...overrides });

  it("UT-ADR21-03d create mode: Cancel + Save enabled; Create/Edit/Delete disabled", () => {
    expect(buttons("create", { savedLoaded: false })).toEqual({ create: false, cancel: true, save: true, edit: false, delete: false });
  });

  it("UT-ADR21-03e view mode: Create/Edit/Delete enabled; Cancel/Save disabled", () => {
    expect(buttons("view")).toEqual({ create: true, cancel: false, save: false, edit: true, delete: true });
  });

  it("UT-ADR21-03f edit mode: Cancel + Save enabled; Create/Edit/Delete disabled", () => {
    expect(buttons("edit")).toEqual({ create: false, cancel: true, save: true, edit: false, delete: false });
  });

  it("UT-ADR21-03g no selection (no ADD): only Create is enabled", () => {
    expect(buttons("none", { savedLoaded: false })).toEqual({ create: true, cancel: false, save: false, edit: false, delete: false });
  });

  it("UT-ADR21-03h view mode before the record loads: Edit/Delete disabled", () => {
    expect(buttons("view", { savedLoaded: false })).toMatchObject({ edit: false, delete: false, create: true });
  });

  it("UT-ADR21-03i while saving: Cancel disabled, Save stays enabled (shows progress), Create disabled", () => {
    expect(buttons("edit", { submitting: true })).toEqual({ create: false, cancel: false, save: true, edit: false, delete: false });
    expect(buttons("create", { submitting: true, savedLoaded: false })).toMatchObject({ cancel: false, save: true });
  });

  it("UT-ADR21-03j while deleting in view mode: every button is disabled", () => {
    expect(buttons("view", { deleting: true })).toEqual({ create: false, cancel: false, save: false, edit: false, delete: false });
  });

  it("UT-ADR21-03k a record found deleted on Save: Edit and Save unavailable, Delete still offered", () => {
    expect(buttons("edit", { gone: true })).toMatchObject({ save: false, cancel: true });
    expect(buttons("view", { gone: true })).toMatchObject({ edit: false, delete: true, create: true });
  });
});

describe("drawer wording", () => {
  it("UT-R3-01a the customer draft row title is fixed \"New customer\"", () => {
    expect(draftRowTitle(customer)).toBe("New customer");
  });

  it("UT-R3-01b the vendor draft row title is fixed \"New vendor\"", () => {
    expect(draftRowTitle(vendor)).toBe("New vendor");
  });

  it("UT-PTN-P01 drawer DOM id and lower-case wording come from the entity", () => {
    expect(partnerDrawerId(customer)).toBe("customers-drawer");
    expect(partnerDrawerId(vendor)).toBe("vendors-drawer");
    expect(lowerSingular(vendor)).toBe("vendor");
    expect(lowerPlural(customer)).toBe("customers");
  });
});

describe("permission helpers (UX only; gateway enforces)", () => {
  it("UT-PTN-P02 Super Admin and \"ALL\" may do everything", () => {
    expect(partnerAccess({ isSuperAdmin: true, permissions: [] }, "vendor")).toEqual({ view: true, add: true, edit: true, delete: true, print: true });
    expect(partnerAccess({ isSuperAdmin: false, permissions: "ALL" }, "customer")).toEqual({ view: true, add: true, edit: true, delete: true, print: true });
  });

  it("UT-PTN-P03 a permission list grants only the listed actions of that menu key", () => {
    const mine = { isSuperAdmin: false, permissions: ["vendor:VIEW", "vendor:EDIT", "vendor:PRINT", "customer:DELETE"] };
    expect(partnerAccess(mine, "vendor")).toEqual({ view: true, add: false, edit: true, delete: false, print: true });
    expect(partnerAccess(mine, "customer")).toEqual({ view: false, add: false, edit: false, delete: true, print: false });
    expect(can({ isSuperAdmin: false, permissions: [] }, "customer", "VIEW")).toBe(false);
  });

  it("UT-PTN-P04 key matching is exact (no prefix or case match)", () => {
    expect(can({ isSuperAdmin: false, permissions: ["customers:VIEW", "customer:view"] }, "customer", "VIEW")).toBe(false);
  });
});

describe("toSelectOptions", () => {
  it("UT-PTN-P05 sorts currencies by code (\"{code} — {name}\") and countries by name", () => {
    const options = toSelectOptions({
      currencies: [
        { code: "USD", name: "US Dollar", active: true },
        { code: "THB", name: "Thai Baht", active: true },
        { code: "EUR", name: "Euro", active: true },
      ],
      countries: [
        { code: "TH", name: "Thailand" },
        { code: "AU", name: "Australia" },
        { code: "JP", name: "Japan" },
      ],
    });
    expect(options.currencies).toEqual([
      { value: "EUR", label: "EUR — Euro", active: true },
      { value: "THB", label: "THB — Thai Baht", active: true },
      { value: "USD", label: "USD — US Dollar", active: true },
    ]);
    expect(options.countries.map((option) => option.value)).toEqual(["AU", "JP", "TH"]);
    expect(options.countries[0]).toEqual({ value: "AU", label: "Australia" });
  });

  it("UT-PTN-P06 does not mutate the server output", () => {
    const output = { currencies: [{ code: "USD", name: "US Dollar", active: true }, { code: "EUR", name: "Euro", active: true }], countries: [] };
    toSelectOptions(output);
    expect(output.currencies[0].code).toBe("USD");
  });

  it("UT-CUR-05 marks inactive currencies; choices keep only the saved inactive one", () => {
    const { currencies } = toSelectOptions({
      currencies: [{ code: "USD", name: "US Dollar", active: true }, { code: "INR", name: "Indian Rupee", active: false }, { code: "LKR", name: "Sri Lankan Rupee", active: false }],
      countries: [],
    });
    expect(currencies.find((option) => option.value === "INR")).toEqual({ value: "INR", label: "INR — Indian Rupee (inactive)", active: false });
    expect(currencyChoices(currencies, "USD").map((option) => option.value)).toEqual(["USD"]);
    expect(currencyChoices(currencies, "INR").map((option) => option.value)).toEqual(["INR", "USD"]);
  });
});

describe("address type config", () => {
  it("UT-PTN-P07 invoice has Tax ID and the billing autofill section; shipping has neither", () => {
    expect(invoiceAddressType).toMatchObject({ key: "invoice", arrayName: "invoiceAddresses", withTaxId: true, autofillSection: "billing" });
    expect(shippingAddressType).toMatchObject({ key: "shipping", arrayName: "shippingAddresses", withTaxId: false, autofillSection: "shipping" });
  });
});
