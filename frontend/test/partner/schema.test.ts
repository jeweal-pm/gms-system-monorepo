import { describe, expect, it } from "vitest";
import { z } from "zod";
import {
  ADDRESS_MAX,
  addressIndexesWithErrors,
  addressListSchema,
  addressSchema,
  emptyAddress,
  emptyPartnerInfo,
  errorTreeFromEntries,
  firstErrorField,
  optionalText,
  partnerInfoShape,
  PHONE_MAX_DIGITS,
  requiredText,
} from "@/features/partner/schema";
import { issuesByPath, validAddress, validInfo } from "./helpers";

/**
 * UT-ADR21-01a…h, UT-PTN-S01…S16: Partner Master form building blocks shared by customer and vendor
 * (features/partner/schema.ts; ADR-0018 §3, ADR-0021 §1, form-guidelines.md).
 */

const infoSchema = z.object(partnerInfoShape);
const info = (overrides: Record<string, unknown> = {}) => ({ ...validInfo(), ...overrides });

describe("partnerInfoShape.code (ADR-0021 §1)", () => {
  it("UT-ADR21-01a accepts a code and returns it trimmed", () => {
    const result = infoSchema.safeParse(info({ code: "  C001  " }));
    expect(result.success).toBe(true);
    expect(result.data?.code).toBe("C001");
  });

  it("UT-ADR21-01b rejects an empty code with \"Code Name is required\"", () => {
    expect(issuesByPath(infoSchema, info({ code: "" })).code).toBe("Code Name is required");
  });

  it("UT-ADR21-01c treats a code of only spaces as empty", () => {
    expect(issuesByPath(infoSchema, info({ code: "   \t " })).code).toBe("Code Name is required");
  });

  it("UT-ADR21-01d accepts exactly 1 character", () => {
    expect(issuesByPath(infoSchema, info({ code: "C" }))).toEqual({});
  });

  it("UT-ADR21-01e accepts exactly 120 characters", () => {
    expect(issuesByPath(infoSchema, info({ code: "C".repeat(120) }))).toEqual({});
  });

  it("UT-ADR21-01f rejects 121 characters with the max-length message", () => {
    expect(issuesByPath(infoSchema, info({ code: "C".repeat(121) })).code).toBe("Code Name must be at most 120 characters");
  });

  it("UT-ADR21-01g counts the length after trimming", () => {
    expect(issuesByPath(infoSchema, info({ code: `  ${"C".repeat(120)}  ` }))).toEqual({});
  });

  it("UT-ADR21-01h starts a new draft with an empty code (filled later by the suggestion)", () => {
    expect(emptyPartnerInfo().code).toBe("");
    expect(issuesByPath(infoSchema, emptyPartnerInfo()).code).toBe("Code Name is required");
  });
});

describe("partnerInfoShape (other fields)", () => {
  it("UT-PTN-S01 accepts complete information", () => {
    expect(issuesByPath(infoSchema, info())).toEqual({});
  });

  it("UT-PTN-S02 requires Code Name, Name, Currency, First name and Email; middle/last name and phone are optional", () => {
    const errors = issuesByPath(infoSchema, emptyPartnerInfo());
    expect(errors).toEqual({
      code: "Code Name is required",
      name: "Name is required",
      currencyCode: "Currency is required",
      firstName: "First name is required",
      email: "Email is required",
    });
  });

  it("UT-PTN-S03 enforces the text length limits", () => {
    const errors = issuesByPath(infoSchema, info({ name: "n".repeat(201), firstName: "f".repeat(101), middleName: "m".repeat(101), lastName: "l".repeat(101) }));
    expect(errors).toEqual({
      name: "Name must be at most 200 characters",
      firstName: "First name must be at most 100 characters",
      middleName: "Middle name must be at most 100 characters",
      lastName: "Last name must be at most 100 characters",
    });
    expect(issuesByPath(infoSchema, info({ name: "n".repeat(200), firstName: "f".repeat(100) }))).toEqual({});
  });

  it.each([
    ["", "Email is required"],
    ["   ", "Email is required"],
    ["buyer@", "Enter a valid email address"],
    ["not an email", "Enter a valid email address"],
    [`${"a".repeat(245)}@example.com`, "Email must be at most 254 characters"],
  ])("UT-PTN-S04 rejects the email %j with %j", (email, message) => {
    expect(issuesByPath(infoSchema, info({ email })).email).toBe(message);
  });

  it("UT-PTN-S05 accepts an email with surrounding spaces and returns it trimmed", () => {
    const result = infoSchema.safeParse(info({ email: "  Buyer@Example.com " }));
    expect(result.success).toBe(true);
    expect(result.data?.email).toBe("Buyer@Example.com");
  });

  it("UT-PTN-S06 accepts an empty phone (sent as null) and valid numbers for the chosen country", () => {
    expect(issuesByPath(infoSchema, info({ phone: { country: "US", number: "" } }))).toEqual({});
    expect(issuesByPath(infoSchema, info({ phone: { country: "US", number: "201 555 0123" } }))).toEqual({});
    expect(issuesByPath(infoSchema, info({ phone: { country: "TH", number: "081 234 5678" } }))).toEqual({});
  });

  it("UT-PTN-S07 rejects a short phone number and one over 15 digits", () => {
    expect(issuesByPath(infoSchema, info({ phone: { country: "TH", number: "12" } }))["phone.number"]).toBe("Enter a valid phone number");
    expect(issuesByPath(infoSchema, info({ phone: { country: "US", number: "1".repeat(PHONE_MAX_DIGITS + 1) } }))["phone.number"]).toBe(
      `Phone No. must be at most ${PHONE_MAX_DIGITS} digits`,
    );
  });

  it("UT-PTN-S08 starts a draft as Active with every text empty and the default phone country", () => {
    expect(emptyPartnerInfo()).toEqual({
      code: "",
      name: "",
      currencyCode: "",
      active: true,
      firstName: "",
      middleName: "",
      lastName: "",
      phone: { country: "US", number: "" },
      email: "",
    });
  });
});

describe("requiredText / optionalText", () => {
  it("UT-PTN-S09 builds trimmed required and optional text rules with the label in the message", () => {
    expect(requiredText("Label", 3).safeParse(" ab ").data).toBe("ab");
    expect(requiredText("Label", 3).safeParse("  ").error?.issues[0].message).toBe("Label is required");
    expect(requiredText("Label", 3).safeParse("abcd").error?.issues[0].message).toBe("Label must be at most 3 characters");
    expect(optionalText("Label", 3).safeParse("  ").data).toBe("");
    expect(optionalText("Label", 3).safeParse("abcd").error?.issues[0].message).toBe("Label must be at most 3 characters");
  });
});

describe("addressSchema", () => {
  const schema = addressSchema("Name/Company Name");

  it("UT-PTN-S10 accepts a complete address", () => {
    expect(issuesByPath(schema, validAddress())).toEqual({});
  });

  it("UT-PTN-S11 requires Name, Address, Country and Postcode; State only after a Country is chosen; City optional (owner 2026-10-19)", () => {
    expect(issuesByPath(schema, emptyAddress(false))).toEqual({
      name: "Name/Company Name is required",
      address: "Address is required",
      countryCode: "Country is required",
      postcode: "Postcode is required",
    });
    const withCountry = issuesByPath(schema, { ...emptyAddress(false), countryCode: "TH" });
    expect(withCountry).toMatchObject({ state: "State/Province is required" });
    expect(withCountry).not.toHaveProperty("city");
  });

  it("UT-PTN-S12 enforces the address length limits (Tax ID optional)", () => {
    const errors = issuesByPath(
      schema,
      validAddress({ name: "n".repeat(201), taxId: "1".repeat(33), address: "a".repeat(501), state: "s".repeat(101), city: "c".repeat(101), postcode: "1".repeat(21) }),
    );
    expect(errors).toEqual({
      name: "Name/Company Name must be at most 200 characters",
      taxId: "Tax ID must be at most 32 characters",
      address: "Address must be at most 500 characters",
      state: "State/Province must be at most 100 characters",
      city: "City must be at most 100 characters",
      postcode: "Postcode must be at most 20 characters",
    });
    expect(issuesByPath(schema, validAddress({ taxId: "1".repeat(32), postcode: "1".repeat(20) }))).toEqual({});
  });

  it("UT-PTN-S13 treats spaces as empty in required address fields", () => {
    expect(issuesByPath(schema, validAddress({ name: "  ", postcode: " " }))).toEqual({ name: "Name/Company Name is required", postcode: "Postcode is required" });
  });
});

describe("addressListSchema default rules", () => {
  const exactlyOne = addressListSchema("invoice", "Name", "exactlyOne");
  const atMostOne = addressListSchema("invoice", "Name", "atMostOne");
  const items = (...defaults: boolean[]) => defaults.map((isDefault) => validAddress({ isDefault }));

  it("UT-PTN-S14 exactlyOne: one default is valid; none or two are rejected", () => {
    expect(issuesByPath(exactlyOne, items(true, false))).toEqual({});
    expect(issuesByPath(exactlyOne, items(false, false))[""]).toBe("Exactly one default address is required");
    expect(issuesByPath(exactlyOne, items(true, true))[""]).toBe("Exactly one default address is required");
  });

  it("UT-PTN-S15 atMostOne: zero or one default is valid; two are rejected", () => {
    expect(issuesByPath(atMostOne, items(false, false))).toEqual({});
    expect(issuesByPath(atMostOne, items(false, true))).toEqual({});
    expect(issuesByPath(atMostOne, items(true, false, true))[""]).toBe("Only one default address is allowed");
  });

  it("UT-PTN-S16 requires 1 to 10 items of a type", () => {
    expect(issuesByPath(atMostOne, [])[""]).toBe("Add at least one invoice address");
    expect(issuesByPath(atMostOne, items(...Array<boolean>(ADDRESS_MAX).fill(false)))).toEqual({});
    expect(issuesByPath(atMostOne, items(...Array<boolean>(ADDRESS_MAX + 1).fill(false)))[""]).toBe("Up to 10 invoice addresses");
  });
});

describe("emptyAddress", () => {
  it("UT-PTN-S17 creates an unsaved empty item with the requested default flag", () => {
    expect(emptyAddress(true)).toEqual({ id: null, name: "", taxId: "", address: "", countryCode: "", state: "", city: "", postcode: "", isDefault: true });
    expect(emptyAddress(false).isDefault).toBe(false);
  });
});

describe("error tree helpers", () => {
  const tree = (...names: string[]) => errorTreeFromEntries(names.map((name) => ({ name, message: `bad ${name}` })));

  it("UT-PTN-S18 errorTreeFromEntries nests dot-joined names like RHF", () => {
    expect(tree("code", "invoiceAddresses.1.postcode")).toEqual({
      code: { message: "bad code" },
      invoiceAddresses: { 1: { postcode: { message: "bad invoiceAddresses.1.postcode" } } },
    });
  });

  it("UT-PTN-S19 firstErrorField starts at Code Name, then follows the visual order of information fields", () => {
    expect(firstErrorField(tree("email", "code", "name"), ["invoiceAddresses"])).toBe("code");
    expect(firstErrorField(tree("email", "phone"), ["invoiceAddresses"])).toBe("phone");
    expect(firstErrorField(undefined, ["invoiceAddresses"])).toBeNull();
    expect(firstErrorField({}, ["invoiceAddresses"])).toBeNull();
  });

  it("UT-PTN-S20 firstErrorField then checks address arrays in the given order, item by item, field by field", () => {
    const errors = tree("shippingAddresses.0.name", "invoiceAddresses.2.city", "invoiceAddresses.1.postcode", "invoiceAddresses.1.address");
    expect(firstErrorField(errors, ["invoiceAddresses", "shippingAddresses"])).toBe("invoiceAddresses.1.address");
    expect(firstErrorField(errors, ["shippingAddresses", "invoiceAddresses"])).toBe("shippingAddresses.0.name");
    // An array the entity does not have is ignored (vendor has invoice addresses only).
    expect(firstErrorField(tree("shippingAddresses.0.name"), ["invoiceAddresses"])).toBeNull();
  });

  it("UT-PTN-S21 addressIndexesWithErrors lists items with at least one field error", () => {
    const errors = tree("invoiceAddresses.0.name", "invoiceAddresses.3.postcode", "shippingAddresses.1.city");
    expect(addressIndexesWithErrors(errors, "invoiceAddresses")).toEqual([0, 3]);
    expect(addressIndexesWithErrors(errors, "shippingAddresses")).toEqual([1]);
    expect(addressIndexesWithErrors(undefined, "invoiceAddresses")).toEqual([]);
    // A list-level message (default rule) is not an item error.
    expect(addressIndexesWithErrors({ invoiceAddresses: { root: { message: "x" } } }, "invoiceAddresses")).toEqual([]);
  });
});
