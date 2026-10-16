import { afterEach, describe, expect, it, vi } from "vitest";
import {
  fieldErrorMessage,
  formFieldFor,
  logoErrorMessage,
  LogoUploadError,
  logoUrl,
  toFormValues,
  toSaveInput,
  uploadLogo,
  type CompanyProfile,
} from "@/features/company-profile/api";
import { emptyCompanyProfileForm } from "@/features/company-profile/schema";

/** UT-CP-F20…F31: contract mapping and logo upload adapter (api.ts, SA revision 2). */

const bank = { type: "doc" as const, content: [{ type: "paragraph", content: [{ type: "text", text: "Bank" }] }] };

const profile: CompanyProfile = {
  name: "Test Co., Ltd.",
  taxId: "0105555000000",
  contactName: "Contact",
  phone: { country: "TH", e164: "+66812345678" },
  email: "admin@example.com",
  website: "https://example.com",
  address: "1 Road",
  address2: "Floor 2",
  countryCode: "TH",
  state: "Bangkok",
  city: "Bangkok",
  postcode: "10110",
  currencyCode: "THB",
  bankDetails: bank,
  showBankDetailsOnInvoice: true,
  terms: null,
  showTermsOnInvoice: false,
  version: 4,
  logo: { version: "0123456789abcdef", contentType: "image/png", sizeBytes: 2048 },
  updatedAt: "2026-10-16T04:00:00.000Z",
  updatedBy: "user-1",
};

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("toFormValues", () => {
  it("UT-CP-F20 maps a saved profile to form values with a national phone number", () => {
    expect(toFormValues(profile)).toEqual({
      name: "Test Co., Ltd.",
      taxId: "0105555000000",
      contactName: "Contact",
      phone: { country: "TH", number: "812345678" },
      email: "admin@example.com",
      website: "https://example.com",
      address: "1 Road",
      address2: "Floor 2",
      countryCode: "TH",
      state: "Bangkok",
      city: "Bangkok",
      postcode: "10110",
      currencyCode: "THB",
      bankDetails: bank,
      showBankDetailsOnInvoice: true,
      terms: null,
      showTermsOnInvoice: false,
    });
  });
});

describe("toSaveInput", () => {
  it("UT-CP-F21 trims text, converts the phone to E.164 and adds the expected version", () => {
    const values = { ...toFormValues(profile), name: "  Test Co., Ltd.  ", phone: { country: "TH", number: "081 234 5678" } };
    expect(toSaveInput(values, 4)).toMatchObject({ name: "Test Co., Ltd.", phone: { country: "TH", e164: "+66812345678" }, bankDetails: bank, expectedVersion: 4 });
  });

  it("UT-CP-F22 sends expectedVersion null for the first save", () => {
    expect(toSaveInput({ ...emptyCompanyProfileForm, phone: { country: "US", number: "201 555 0123" } }, null)).toMatchObject({ phone: { country: "US", e164: "+12015550123" }, expectedVersion: null });
  });

  it("UT-CP-F23 round-trips a saved profile without changes", () => {
    const input = toSaveInput(toFormValues(profile), profile.version);
    const serverOnly = ["version", "logo", "updatedAt", "updatedBy"];
    const fields = Object.fromEntries(Object.entries(profile).filter(([key]) => !serverOnly.includes(key)));
    expect(input).toEqual({ ...fields, expectedVersion: 4 });
  });
});

describe("server field errors", () => {
  it.each([
    ["phone.e164", "phone"],
    ["bankDetails", "bankDetails"],
    ["countryCode", "countryCode"],
    ["(root)", null],
    ["expectedVersion", null],
  ])("UT-CP-F24 maps the path %j to the form field %j", (path, field) => {
    expect(formFieldFor(path)).toBe(field);
  });

  it("UT-CP-F25 explains known codes and falls back for others", () => {
    expect(fieldErrorMessage({ path: "countryCode", code: "unknown" })).toBe("Choose a value from the list");
    expect(fieldErrorMessage({ path: "bankDetails", code: "unsafe_link" })).toBe("Links must start with https://, http:// or mailto:");
    expect(fieldErrorMessage({ path: "name", code: "something_new" })).toBe("Check this field");
  });
});

describe("logoUrl", () => {
  it("UT-CP-F26 builds a versioned same-origin URL, or null without a logo", () => {
    expect(logoUrl(profile)).toBe("/api/v1/company-profile/logo?v=0123456789abcdef");
    expect(logoUrl({ ...profile, logo: null })).toBeNull();
    expect(logoUrl(null)).toBeNull();
  });
});

describe("uploadLogo", () => {
  const file = new File([new Uint8Array([0x89, 0x50, 0x4e, 0x47])], "logo.png", { type: "image/png" });

  it("UT-CP-F27 sends the file as the raw body with its type and the expected version", async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({ profile: { ...profile, version: 5 } }), { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);
    await expect(uploadLogo(file, 4)).resolves.toMatchObject({ version: 5 });
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe("/api/v1/company-profile/logo?expectedVersion=4");
    expect(init).toMatchObject({ method: "PUT", headers: { "content-type": "image/png" }, body: file, credentials: "same-origin" });
  });

  it("UT-CP-F28 throws the server error code", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(JSON.stringify({ error: { code: "PAYLOAD_TOO_LARGE" } }), { status: 413 })));
    await expect(uploadLogo(file, 4)).rejects.toEqual(new LogoUploadError("PAYLOAD_TOO_LARGE"));
  });

  it("UT-CP-F29 reports UNKNOWN for an error without a JSON body", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response("Bad gateway", { status: 502 })));
    await expect(uploadLogo(file, 4)).rejects.toMatchObject({ code: "UNKNOWN" });
  });

  it("UT-CP-F30 reports NETWORK when the request cannot be sent", async () => {
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new TypeError("Failed to fetch")));
    await expect(uploadLogo(file, 4)).rejects.toMatchObject({ code: "NETWORK" });
  });
});

describe("logoErrorMessage", () => {
  it.each([
    ["PAYLOAD_TOO_LARGE", "the image must be 10 MB or smaller"],
    ["UNSUPPORTED_MEDIA_TYPE", "choose a JPEG or PNG image"],
    ["CONFLICT", "someone else changed the profile; refresh and try again"],
    ["PERMISSION_DENIED", "you don't have permission to change it"],
    ["NETWORK", "try again"],
  ])("UT-CP-F31 explains %s", (code, message) => {
    expect(logoErrorMessage(code)).toBe(message);
  });
});
