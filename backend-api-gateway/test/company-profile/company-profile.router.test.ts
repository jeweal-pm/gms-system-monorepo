import { TRPCError } from "@trpc/server";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { describeError } from "../../src/trpc/domain-error";
import { callPartner } from "../../src/trpc/partner-client";
import { appRouter, type TrpcContext } from "../../src/trpc/router";

/** UT-CP-G50…G56: `companyProfile.*` tRPC procedures (permissions, validation, partner calls). Partner is mocked. */

vi.mock("../../src/trpc/partner-client", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../../src/trpc/partner-client")>()),
  callPartner: vi.fn(),
}));

function caller(permissions: string[], superAdmin = false) {
  const ctx: TrpcContext = {
    session: { user: { id: "user-1", username: "admin", email: "x@users.invalid", name: "Admin" } },
    license: { state: "VALID" },
    authz: { isSuperAdmin: superAdmin, permissions },
    cookie: "session=1",
    activateLicense: null,
  };
  return appRouter.createCaller(ctx);
}

const input = {
  name: "Test Co., Ltd.",
  taxId: "",
  contactName: "Contact",
  phone: { country: "TH", e164: "+66812345678" },
  email: "admin@example.com",
  website: "",
  address: "1 Road",
  address2: "",
  roadStreet: "",
  countryCode: "TH",
  state: "Bangkok",
  city: "Bangkok",
  postcode: "10110",
  currencyCode: "THB",
  bankDetails: "",
  showBankDetailsOnInvoice: false,
  expectedVersion: null,
};

async function failure(promise: Promise<unknown>) {
  try {
    await promise;
  } catch (error) {
    if (error instanceof TRPCError) return { code: error.code, domainCode: describeError(error).domainCode };
    throw error;
  }
  throw new Error("expected the call to fail");
}

beforeEach(() => {
  vi.mocked(callPartner).mockReset();
  vi.mocked(callPartner).mockResolvedValue({ profile: null });
});

describe("companyProfile router", () => {
  it("UT-CP-G50 get calls partner with VIEW", async () => {
    await expect(caller(["company-profile:VIEW"]).companyProfile.get()).resolves.toEqual({ profile: null });
    expect(vi.mocked(callPartner).mock.calls[0][0]).toMatchObject({ method: "GET", path: "/internal/v1/company-profile", actorId: "user-1" });
  });

  it("UT-CP-G51 get is denied without VIEW", async () => {
    expect(await failure(caller(["vendor:VIEW"]).companyProfile.get())).toEqual({ code: "FORBIDDEN", domainCode: "PERMISSION_DENIED" });
    expect(callPartner).not.toHaveBeenCalled();
  });

  it("UT-CP-G52 options uses its own procedure under VIEW", async () => {
    vi.mocked(callPartner).mockResolvedValue({ currencies: [], countries: [] });
    await caller(["company-profile:VIEW"]).companyProfile.options();
    expect(vi.mocked(callPartner).mock.calls[0][0]).toMatchObject({ method: "GET", path: "/internal/v1/company-profile/options" });
  });

  it("UT-CP-G53 save needs EDIT (VIEW and ADD are not enough)", async () => {
    expect(await failure(caller(["company-profile:VIEW", "company-profile:ADD"]).companyProfile.save(input))).toEqual({ code: "FORBIDDEN", domainCode: "PERMISSION_DENIED" });
    expect(callPartner).not.toHaveBeenCalled();
  });

  it("UT-CP-G54 save sends the validated input to partner with PUT", async () => {
    vi.mocked(callPartner).mockResolvedValue({ profile: { version: 1 } });
    await caller(["company-profile:EDIT"]).companyProfile.save({ ...input, email: " Admin@Example.com " });
    expect(vi.mocked(callPartner).mock.calls[0][0]).toMatchObject({ method: "PUT", path: "/internal/v1/company-profile", body: { email: "admin@example.com", expectedVersion: null } });
  });

  it("UT-CP-G55 save rejects invalid input before calling partner", async () => {
    expect(await failure(caller([], true).companyProfile.save({ ...input, countryCode: "Thailand" }))).toMatchObject({ code: "BAD_REQUEST", domainCode: "VALIDATION_ERROR" });
    expect(callPartner).not.toHaveBeenCalled();
  });

  it("UT-CP-G56 removeLogo needs EDIT and sends the expected version", async () => {
    expect(await failure(caller(["company-profile:VIEW"]).companyProfile.removeLogo({ expectedVersion: 4 }))).toEqual({ code: "FORBIDDEN", domainCode: "PERMISSION_DENIED" });
    vi.mocked(callPartner).mockResolvedValue({ profile: { version: 5 } });
    await caller(["company-profile:EDIT"]).companyProfile.removeLogo({ expectedVersion: 4 });
    expect(vi.mocked(callPartner).mock.calls[0][0]).toMatchObject({ method: "DELETE", path: "/internal/v1/company-profile/logo?expectedVersion=4" });
  });
});
