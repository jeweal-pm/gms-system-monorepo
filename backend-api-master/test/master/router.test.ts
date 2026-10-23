import { HttpException } from "@nestjs/common";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { MasterContext } from "../../src/master/authorization";
import { createMasterRouter } from "../../src/master/router";
import type { CustomerService } from "../../src/customer/customer.service";
import type { VendorService } from "../../src/vendor/vendor.service";
import type { CompanyProfileService } from "../../src/company-profile/company-profile.service";
import type { StoneMasterService } from "../../src/stone-master/stone-master.service";
import { customerBody, withVersion } from "../partner-shared/fixtures";

vi.mock("../../src/database/prisma-client", async () => (await import("../partner-shared/prisma-fake")).prismaModule);

const ID = "0b9f3c4e-1d2a-4b3c-8d4e-5f6a7b8c9d0e";
const customer = {
  list: vi.fn(), get: vi.fn(), options: vi.fn(), nextCode: vi.fn(), create: vi.fn(), update: vi.fn(), delete: vi.fn(),
};
const vendor = {
  list: vi.fn(), get: vi.fn(), options: vi.fn(), nextCode: vi.fn(), create: vi.fn(), update: vi.fn(), delete: vi.fn(),
};
const companyProfile = { get: vi.fn(), options: vi.fn(), save: vi.fn(), removeLogo: vi.fn() };
const stoneMaster = { list: vi.fn(), get: vi.fn(), options: vi.fn(), create: vi.fn(), update: vi.fn(), delete: vi.fn() };
const router = createMasterRouter({
  customer: customer as unknown as CustomerService,
  vendor: vendor as unknown as VendorService,
  companyProfile: companyProfile as unknown as CompanyProfileService,
  stoneMaster: stoneMaster as unknown as StoneMasterService,
});

function context(grants: string[], overrides: Partial<MasterContext> = {}): MasterContext {
  return {
    principal: { userId: "user-1", sessionId: "session-1", isSuperAdmin: false, grants },
    authorization: "CURRENT", license: "ELIGIBLE", csrfVerified: true, ...overrides,
  };
}

beforeEach(() => {
  for (const fn of [...Object.values(customer), ...Object.values(vendor), ...Object.values(companyProfile), ...Object.values(stoneMaster)]) fn.mockReset().mockResolvedValue({ ok: true });
});

describe("staged master domain tRPC boundary", () => {
  it("GP-MT-01/02 denies absent identity, stale authorization, unavailable/denied license before service calls", async () => {
    await expect(router.createCaller(context(["customer:VIEW"], { principal: null })).customer.list({})).rejects.toMatchObject({ code: "UNAUTHORIZED" });
    await expect(router.createCaller(context(["customer:VIEW"], { authorization: "UNAVAILABLE" })).customer.list({})).rejects.toMatchObject({ code: "SERVICE_UNAVAILABLE" });
    await expect(router.createCaller(context(["customer:VIEW"], { license: "UNAVAILABLE" })).customer.list({})).rejects.toMatchObject({ code: "SERVICE_UNAVAILABLE" });
    await expect(router.createCaller(context(["customer:VIEW"], { license: "DENIED" })).customer.list({})).rejects.toMatchObject({ code: "FORBIDDEN" });
    expect(customer.list).not.toHaveBeenCalled();
  });

  it("GP-MT-01/03 uses exact customer/vendor menu grants and keeps lists bounded to 50", async () => {
    await expect(router.createCaller(context(["vendor:VIEW"])).customer.list({})).rejects.toMatchObject({ code: "FORBIDDEN" });
    await router.createCaller(context(["customer:VIEW", "vendor:VIEW"])).customer.list({ q: "  gem ", active: false, cursor: null });
    expect(customer.list).toHaveBeenCalledWith({ q: "gem", active: "false", limit: 50 });
    await router.createCaller(context(["vendor:VIEW"])).vendor.list({ limit: 1 });
    expect(vendor.list).toHaveBeenCalledWith({ limit: 1 });
    await expect(router.createCaller(context(["customer:VIEW"])).customer.list({ limit: 51 })).rejects.toMatchObject({ code: "BAD_REQUEST" });
    await expect(router.createCaller(context(["vendor:VIEW"])).vendor.list({ limit: 201 })).rejects.toMatchObject({ code: "BAD_REQUEST" });
    expect(customer.list).toHaveBeenCalledTimes(1);
    expect(vendor.list).toHaveBeenCalledTimes(1);
  });

  it("GP-MT-03/04 requires ADD and CSRF before customer writes, ignores browser actor headers, and passes verified user ID", async () => {
    const fixture = customerBody();
    const input = { ...fixture, invoiceAddresses: fixture.invoiceAddresses.map((address) => ({ ...address, taxId: null })) };
    await expect(router.createCaller(context(["customer:VIEW"])).customer.create(input)).rejects.toMatchObject({ code: "FORBIDDEN" });
    await expect(router.createCaller(context(["customer:ADD"], { csrfVerified: false })).customer.create(input)).rejects.toMatchObject({ code: "FORBIDDEN" });
    expect(customer.create).not.toHaveBeenCalled();
    await router.createCaller(context(["customer:ADD"])).customer.create(input);
    expect(customer.create).toHaveBeenCalledWith("user-1", expect.objectContaining({ code: input.code }));
    await router.createCaller(context(["customer:EDIT"])).customer.update({ id: ID, ...withVersion(input) });
    expect(customer.update).toHaveBeenCalledWith("user-1", ID, expect.objectContaining({ expectedUpdatedAt: "2026-10-16T00:00:00.000Z" }));
    await router.createCaller(context(["customer:DELETE"])).customer.delete({ id: ID });
    expect(customer.delete).toHaveBeenCalledWith("user-1", ID);
  });

  it("GP-MT-01/03 maintains vendor and customer operation names and mutation grants", async () => {
    const caller = router.createCaller(context(["customer:VIEW", "customer:ADD", "vendor:VIEW", "vendor:ADD", "vendor:DELETE"]));
    await caller.customer.get({ id: ID });
    await caller.customer.options();
    await caller.customer.nextCode();
    await caller.vendor.get({ id: ID });
    await caller.vendor.options();
    await caller.vendor.nextCode();
    await caller.vendor.delete({ id: ID });
    expect(customer.get).toHaveBeenCalledWith(ID);
    expect(customer.options).toHaveBeenCalledOnce();
    expect(customer.nextCode).toHaveBeenCalledOnce();
    expect(vendor.get).toHaveBeenCalledWith(ID);
    expect(vendor.options).toHaveBeenCalledOnce();
    expect(vendor.nextCode).toHaveBeenCalledOnce();
    expect(vendor.delete).toHaveBeenCalledWith("user-1", ID);
  });

  it("GP-MT-03/04 validates vendor writes and passes the verified user through the service boundary", async () => {
    const { shippingAddresses: _shipping, ...fixture } = customerBody();
    const input = { ...fixture, invoiceAddresses: fixture.invoiceAddresses.map((address) => ({ ...address, taxId: null })) };
    await expect(router.createCaller(context(["vendor:VIEW"])).vendor.create(input)).rejects.toMatchObject({ code: "FORBIDDEN" });
    await expect(router.createCaller(context(["vendor:ADD"], { csrfVerified: false })).vendor.create(input)).rejects.toMatchObject({ code: "FORBIDDEN" });
    await router.createCaller(context(["vendor:ADD"])).vendor.create(input);
    expect(vendor.create).toHaveBeenCalledWith("user-1", expect.objectContaining({ code: input.code }));
    await router.createCaller(context(["vendor:EDIT"])).vendor.update({ id: ID, ...withVersion(input) });
    expect(vendor.update).toHaveBeenCalledWith("user-1", ID, expect.objectContaining({ expectedUpdatedAt: "2026-10-16T00:00:00.000Z" }));
  });

  it("GP-MT-01 maps existing partner domain conflict and field validation codes safely", async () => {
    customer.get.mockRejectedValueOnce(new HttpException({ error: { code: "CUSTOMER_NOT_FOUND" } }, 404));
    await expect(router.createCaller(context(["customer:VIEW"])).customer.get({ id: ID })).rejects.toMatchObject({ code: "NOT_FOUND", message: "CUSTOMER_NOT_FOUND" });
    customer.list.mockRejectedValueOnce(new Error("database password=sensitive"));
    await expect(router.createCaller(context(["customer:VIEW"])).customer.list({})).rejects.toMatchObject({ code: "SERVICE_UNAVAILABLE", message: "DEPENDENCY_UNAVAILABLE" });
  });

  it("GP-MT-01 preserves company profile tRPC names, grants, actor, and strict input", async () => {
    const caller = router.createCaller(context(["company-profile:VIEW", "company-profile:EDIT"]));
    await caller.companyProfile.get();
    await caller.companyProfile.options();
    const profile = {
      name: "GMS", taxId: "", contactName: "Owner", phone: { country: "TH", e164: "+66812345678" },
      email: "owner@example.com", website: "", address: "Address", address2: "", roadStreet: "",
      countryCode: "TH", state: "Bangkok", city: "", postcode: "10000", currencyCode: "THB",
      bankDetails: "", showBankDetailsOnInvoice: false, expectedVersion: null,
    };
    await caller.companyProfile.save(profile);
    await caller.companyProfile.removeLogo({ expectedVersion: 1 });
    expect(companyProfile.get).toHaveBeenCalledOnce();
    expect(companyProfile.options).toHaveBeenCalledOnce();
    expect(companyProfile.save).toHaveBeenCalledWith("user-1", expect.objectContaining({ expectedVersion: null }));
    expect(companyProfile.removeLogo).toHaveBeenCalledWith("user-1", 1);
    await expect(router.createCaller(context(["company-profile:VIEW"])).companyProfile.save(profile)).rejects.toMatchObject({ code: "FORBIDDEN" });
    await expect(caller.companyProfile.removeLogo({ expectedVersion: 0 })).rejects.toMatchObject({ code: "BAD_REQUEST" });
  });

  it("GP-MT-01 preserves stone master family names and exact view/add/edit/delete gates", async () => {
    const caller = router.createCaller(context(["stone-master:VIEW", "stone-master:ADD", "stone-master:EDIT", "stone-master:DELETE"]));
    await caller.stoneMaster.group.list({ limit: 10 });
    await caller.stoneMaster.group.get({ id: ID });
    await caller.stoneMaster.options({ kinds: ["group"] });
    await caller.stoneMaster.group.create({ code: "G", name: "Group", active: true });
    await caller.stoneMaster.group.update({ id: ID, expectedUpdatedAt: "2026-10-16T00:00:00.000Z", code: "G", name: "Group", active: true });
    await caller.stoneMaster.group.delete({ id: ID });
    expect(stoneMaster.list).toHaveBeenCalledWith("group", { limit: 10 });
    expect(stoneMaster.get).toHaveBeenCalledWith("group", ID);
    expect(stoneMaster.options).toHaveBeenCalledWith({ kinds: ["group"], include: [] });
    expect(stoneMaster.create).toHaveBeenCalledWith("group", "user-1", expect.objectContaining({ code: "G" }));
    expect(stoneMaster.update).toHaveBeenCalledWith("group", "user-1", ID, expect.objectContaining({ expectedUpdatedAt: "2026-10-16T00:00:00.000Z" }));
    expect(stoneMaster.delete).toHaveBeenCalledWith("group", "user-1", ID);
    await expect(router.createCaller(context(["stone-master:VIEW"])).stoneMaster.group.create({ code: "G", name: "Group", active: true })).rejects.toMatchObject({ code: "FORBIDDEN" });
    await expect(router.createCaller(context(["stone-master:VIEW", "stone-master:ADD"], { csrfVerified: false })).stoneMaster.group.create({ code: "G", name: "Group", active: true })).rejects.toMatchObject({ code: "FORBIDDEN" });
  });
});
