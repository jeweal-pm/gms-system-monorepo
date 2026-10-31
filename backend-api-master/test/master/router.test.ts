import { HttpException } from "@nestjs/common";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { MasterContext } from "../../src/master/authorization";
import { createMasterRouter } from "../../src/master/router";
import type { DocumentSetupService } from "../../src/document-setup/document-setup.service";
import type { CustomerService } from "../../src/customer/customer.service";
import type { VendorService } from "../../src/vendor/vendor.service";
import type { CompanyProfileService } from "../../src/company-profile/company-profile.service";
import type { StoneMasterService } from "../../src/stone-master/stone-master.service";
import type { CurrencyService } from "../../src/currency/currency.service";
import type { QuotationService } from "../../src/quotation/quotation.service";
import type { MemoOutService } from "../../src/trade-document/memo-out.service";
import type { MemoOutReturnService } from "../../src/trade-document/memo-out-return.service";
import type { MemoReceiveService } from "../../src/trade-document/memo-receive.service";
import type { MemoReturnService } from "../../src/trade-document/memo-return.service";
import type { MemoStockService } from "../../src/trade-document/memo-stock.service";
import type { MemoOutstandingService } from "../../src/trade-document/memo-outstanding.service";
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
const documentSetup = { list: vi.fn(), get: vi.fn(), save: vi.fn() };
const currency = { list: vi.fn(), get: vi.fn(), options: vi.fn(), create: vi.fn(), update: vi.fn(), delete: vi.fn() };
const quotation = {
  list: vi.fn(), get: vi.fn(), nextNumber: vi.fn(), options: vi.fn(), create: vi.fn(), update: vi.fn(),
  submit: vi.fn(), approve: vi.fn(), reject: vi.fn(), cancel: vi.fn(), delete: vi.fn(),
};
const memoOut = { list: vi.fn(), get: vi.fn(), nextNumber: vi.fn(), options: vi.fn(), create: vi.fn(), update: vi.fn(), delete: vi.fn(), approve: vi.fn() };
const memoOutReturn = { list: vi.fn(), get: vi.fn(), nextNumber: vi.fn(), options: vi.fn(), create: vi.fn(), update: vi.fn(), delete: vi.fn(), outstanding: vi.fn(), approve: vi.fn() };
const memoReceive = { list: vi.fn(), get: vi.fn(), nextNumber: vi.fn(), options: vi.fn(), create: vi.fn(), update: vi.fn(), delete: vi.fn(), approve: vi.fn() };
const memoStock = { list: vi.fn() };
const memoReturn = { list: vi.fn(), get: vi.fn(), nextNumber: vi.fn(), options: vi.fn(), create: vi.fn(), update: vi.fn(), delete: vi.fn(), approve: vi.fn() };
const memoOutstanding = { vendorSummary: vi.fn(), vendorList: vi.fn(), vendorItems: vi.fn(), vendorOptions: vi.fn() };
const router = createMasterRouter({
  customer: customer as unknown as CustomerService,
  vendor: vendor as unknown as VendorService,
  companyProfile: companyProfile as unknown as CompanyProfileService,
  stoneMaster: stoneMaster as unknown as StoneMasterService,
  documentSetup: documentSetup as unknown as DocumentSetupService,
  currency: currency as unknown as CurrencyService,
  quotation: quotation as unknown as QuotationService,
  memoOut: memoOut as unknown as MemoOutService,
  memoOutReturn: memoOutReturn as unknown as MemoOutReturnService,
  memoReceive: memoReceive as unknown as MemoReceiveService,
  memoStock: memoStock as unknown as MemoStockService,
  memoReturn: memoReturn as unknown as MemoReturnService,
  memoOutstanding: memoOutstanding as unknown as MemoOutstandingService,
});

function context(grants: string[], overrides: Partial<MasterContext> = {}): MasterContext {
  return {
    principal: { userId: "user-1", sessionId: "session-1", isSuperAdmin: false, grants },
    authorization: "CURRENT", license: "ELIGIBLE", csrfVerified: true, ...overrides,
  };
}

beforeEach(() => {
  for (const fn of [...Object.values(customer), ...Object.values(vendor), ...Object.values(companyProfile), ...Object.values(stoneMaster), ...Object.values(documentSetup), ...Object.values(currency), ...Object.values(quotation), ...Object.values(memoOut), ...Object.values(memoOutReturn), ...Object.values(memoReceive), ...Object.values(memoStock), ...Object.values(memoReturn), ...Object.values(memoOutstanding)]) fn.mockReset().mockResolvedValue({ ok: true });
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

  it("GP-MT-DS document setup: VIEW reads, EDIT + CSRF saves, strict input, verified actor", async () => {
    const save = { transactionKey: "purchase-order" as const, name: "PURCHASE ORDER", code: "PO", startFrom: 1, rows: [{ effectiveDate: "2026-01-01", prefix: "PO", separator: "-", startNo: 1 }], declaration: "", expectedVersion: null };
    const caller = router.createCaller(context(["document-setup:VIEW", "document-setup:EDIT"]));
    await caller.documentSetup.list();
    await caller.documentSetup.get({ transactionKey: "quotation" });
    await caller.documentSetup.save(save);
    expect(documentSetup.list).toHaveBeenCalledOnce();
    expect(documentSetup.get).toHaveBeenCalledWith("quotation");
    expect(documentSetup.save).toHaveBeenCalledWith("user-1", expect.objectContaining({ code: "PO", expectedVersion: null }));
    await expect(router.createCaller(context([])).documentSetup.list()).rejects.toMatchObject({ code: "FORBIDDEN" });
    await expect(router.createCaller(context(["document-setup:VIEW"])).documentSetup.save(save)).rejects.toMatchObject({ code: "FORBIDDEN" });
    await expect(router.createCaller(context(["document-setup:EDIT"], { csrfVerified: false })).documentSetup.save(save)).rejects.toMatchObject({ code: "FORBIDDEN" });
    await expect(caller.documentSetup.get({ transactionKey: "stone-master" } as never)).rejects.toMatchObject({ code: "BAD_REQUEST" });
  });

  it("GP-MT-CUR currency: exact grants, CSRF on writes, no code on update, options also for quotation:VIEW", async () => {
    const body = { code: " usd ", name: "US Dollar", description: "Sales to the US", active: true, sellingRate: "33.25", buyingRate: "32.9" };
    const caller = router.createCaller(context(["currency:VIEW", "currency:ADD", "currency:EDIT", "currency:DELETE"]));
    await caller.currency.list({ q: " us " });
    expect(currency.list).toHaveBeenCalledWith({ q: "us", cursor: undefined, limit: 50 });
    await caller.currency.get({ id: ID });
    expect(currency.get).toHaveBeenCalledWith(ID);
    await caller.currency.create(body);
    expect(currency.create).toHaveBeenCalledWith("user-1", { ...body, code: "USD" });
    const update = { id: ID, expectedUpdatedAt: "2026-10-26T00:00:00.000Z", name: "US Dollar", description: "x", active: true, sellingRate: null, buyingRate: null };
    await caller.currency.update(update);
    expect(currency.update).toHaveBeenCalledWith("user-1", ID, { expectedUpdatedAt: update.expectedUpdatedAt, name: "US Dollar", description: "x", active: true, sellingRate: null, buyingRate: null });
    await expect(caller.currency.update({ ...update, code: "EUR" } as never)).rejects.toMatchObject({ code: "BAD_REQUEST" });
    await caller.currency.delete({ id: ID });
    expect(currency.delete).toHaveBeenCalledWith("user-1", ID);

    await expect(caller.currency.create({ ...body, code: "US" })).rejects.toMatchObject({ code: "BAD_REQUEST" });
    await expect(caller.currency.create({ ...body, sellingRate: "0" })).rejects.toMatchObject({ code: "BAD_REQUEST" });
    await expect(caller.currency.create({ ...body, sellingRate: "1.23456" })).rejects.toMatchObject({ code: "BAD_REQUEST" });
    await expect(router.createCaller(context(["currency:VIEW"])).currency.create(body)).rejects.toMatchObject({ code: "FORBIDDEN" });
    await expect(router.createCaller(context(["currency:ADD"], { csrfVerified: false })).currency.create(body)).rejects.toMatchObject({ code: "FORBIDDEN" });
    await expect(router.createCaller(context(["quotation:VIEW"])).currency.list({})).rejects.toMatchObject({ code: "FORBIDDEN" });

    await router.createCaller(context(["quotation:VIEW"])).currency.options();
    await router.createCaller(context(["currency:VIEW"])).currency.options();
    expect(currency.options).toHaveBeenCalledTimes(2);
    await expect(router.createCaller(context(["vendor:VIEW"])).currency.options()).rejects.toMatchObject({ code: "FORBIDDEN" });
    await expect(router.createCaller(context(["quotation:VIEW"], { license: "DENIED" })).currency.options()).rejects.toMatchObject({ code: "FORBIDDEN" });
    expect(currency.options).toHaveBeenCalledTimes(2);
  });

  it("GP-MT-QT quotation: each procedure needs its own action; mutations need CSRF; 422 keeps its domain code", async () => {
    const id = "11111111-1111-4111-8111-111111111111";
    const versioned = { id, expectedVersion: 1 };
    const body = {
      docDate: "2026-10-26", dueDate: "2026-10-27", customerId: id, shippingAddressId: id, invoiceAddressId: id, currency: "THB", exchangeRate: null, ref: "", documentNote: "",
      lines: [{ source: "MANUAL" as const, stoneCodeId: null, stoneCode: "", stone: "Ruby", shape: "", size: "", color: "", clarity: "", cutting: "", quality: "", lot: "", location: "", cerType: "", cerNo: "", pcs: 1, weightCt: "1", priceUnit: "PER_CT" as const, unitPrice: "10", discount: { type: "NONE" as const, value: "0" }, itemNote: "", photoIds: [] }],
      discount: { type: "NONE" as const, value: "0" }, tax: { enabled: false, rate: "7", includeInPrice: false }, serviceCharges: [], labor: null,
    };
    const as = (grants: string[]) => router.createCaller(context(grants.map((action) => `quotation:${action}`)));
    await as(["VIEW"]).quotation.list({});
    expect(quotation.list).toHaveBeenCalledWith(expect.objectContaining({ limit: 50 }));
    await as(["VIEW"]).quotation.get({ id });
    await as(["VIEW"]).quotation.nextNumber({ docDate: "2026-10-26" });
    await as(["VIEW"]).quotation.options({});
    await as(["ADD"]).quotation.create(body);
    expect(quotation.create).toHaveBeenCalledWith("user-1", expect.objectContaining({ currency: "THB" }));
    await as(["EDIT"]).quotation.update({ ...body, ...versioned });
    expect(quotation.update).toHaveBeenCalledWith("user-1", id, 1, expect.not.objectContaining({ id }));
    await as(["EDIT"]).quotation.submit(versioned);
    await as(["APPROVE"]).quotation.approve(versioned);
    await as(["APPROVE"]).quotation.reject({ ...versioned, reason: "No" });
    await as(["CANCEL"]).quotation.cancel({ ...versioned, reason: "No" });
    await as(["DELETE"]).quotation.delete(versioned);
    expect(quotation.delete).toHaveBeenCalledWith("user-1", id, 1);

    await expect(as(["ADD"]).quotation.list({})).rejects.toMatchObject({ code: "FORBIDDEN" });
    await expect(as(["VIEW", "ADD"]).quotation.submit(versioned)).rejects.toMatchObject({ code: "FORBIDDEN" });
    await expect(as(["EDIT"]).quotation.approve(versioned)).rejects.toMatchObject({ code: "FORBIDDEN" });
    await expect(as(["EDIT"]).quotation.cancel({ ...versioned, reason: "x" })).rejects.toMatchObject({ code: "FORBIDDEN" });
    await expect(as(["EDIT"]).quotation.delete(versioned)).rejects.toMatchObject({ code: "FORBIDDEN" });
    await expect(router.createCaller(context(["quotation:ADD"], { csrfVerified: false })).quotation.create(body)).rejects.toMatchObject({ code: "FORBIDDEN" });

    quotation.create.mockRejectedValueOnce(new HttpException({ error: { code: "QUOTATION_REFERENCE_INVALID", message: "x" } }, 422));
    await expect(as(["ADD"]).quotation.create(body)).rejects.toMatchObject({ code: "UNPROCESSABLE_CONTENT", message: "QUOTATION_REFERENCE_INVALID" });
  });

  it("GP-MT-MO memo out / memo out return: exact grants, CSRF on writes, strict party fields, no photos", async () => {
    const ID2 = "0b9f3c4e-1d2a-4b3c-8d4e-5f6a7b8c9d0f";
    const line = { source: "MANUAL" as const, stoneCodeId: null, stoneCode: "", stone: "Ruby", shape: "", size: "", color: "", clarity: "", cutting: "", quality: "",
      lot: "", location: "", cerType: "", cerNo: "", pcs: 1, weightCt: "1", priceUnit: "PER_CT" as const, unitPrice: "100", discount: { type: "NONE" as const, value: "0" }, itemNote: "", photoIds: [] as string[] };
    const shared = { docDate: "2026-10-28", dueDate: "2026-11-28", currency: "THB", exchangeRate: null, ref: "", documentNote: "", lines: [line],
      discount: { type: "NONE" as const, value: "0" }, tax: { enabled: false, rate: "7", includeInPrice: false }, serviceCharges: [], labor: null };
    const out = { ...shared, lines: [{ ...line, memoStockId: ID2 }], customerId: ID, shippingAddressId: ID2, invoiceAddressId: ID2 };
    const back = { ...shared, lines: [{ ...line, memoOutLineId: ID2, outstandingPcs: 1, outstandingWeightCt: "1" }], customerId: ID, shippingAddressId: ID2, invoiceAddressId: ID2 };

    const outCaller = router.createCaller(context(["memo-out:VIEW", "memo-out:ADD", "memo-out:EDIT", "memo-out:DELETE"]));
    await outCaller.memoOut.list({ q: "gem", partyId: ID });
    await outCaller.memoOut.get({ id: ID });
    await outCaller.memoOut.nextNumber({ docDate: "2026-10-28" });
    await outCaller.memoOut.options({ customerId: ID });
    await outCaller.memoOut.create(out);
    await outCaller.memoOut.update({ ...out, id: ID, expectedVersion: 1 });
    await outCaller.memoOut.delete({ id: ID, expectedVersion: 2 });
    expect(memoOut.list).toHaveBeenCalledWith(expect.objectContaining({ q: "gem", partyId: ID, limit: 50 }));
    expect(memoOut.options).toHaveBeenCalledWith(ID);
    expect(memoOut.update).toHaveBeenCalledWith("user-1", ID, 1, expect.objectContaining({ customerId: ID }));
    await expect(outCaller.memoOut.create({ ...out, lines: [{ ...line, photoIds: [ID] }] })).rejects.toMatchObject({ code: "BAD_REQUEST" });
    await expect(outCaller.memoOut.create({ ...back } as never)).rejects.toMatchObject({ code: "BAD_REQUEST" });
    await expect(router.createCaller(context(["memo-out:VIEW"])).memoOut.create(out)).rejects.toMatchObject({ code: "FORBIDDEN" });
    await expect(router.createCaller(context(["memo-out:ADD"], { csrfVerified: false })).memoOut.create(out)).rejects.toMatchObject({ code: "FORBIDDEN" });

    const backCaller = router.createCaller(context(["memo-out-return:VIEW", "memo-out-return:ADD"]));
    await backCaller.memoOutReturn.options({ customerId: ID });
    expect(memoOutReturn.options).toHaveBeenCalledWith(ID);
    await backCaller.memoOutReturn.create(back);
    expect(memoOutReturn.create).toHaveBeenCalledWith("user-1", expect.objectContaining({ customerId: ID, shippingAddressId: ID2, lines: [expect.objectContaining({ memoOutLineId: ID2 })] }));
    // memo-out-return rev 4: the Memo Outstanding dialog with VIEW; approve needs APPROVE + CSRF.
    await backCaller.memoOutReturn.outstanding({ customerId: ID, currency: "THB", q: "26" });
    expect(memoOutReturn.outstanding).toHaveBeenCalledWith(expect.objectContaining({ customerId: ID, currency: "THB", q: "26", limit: 50 }));
    await expect(backCaller.memoOutReturn.outstanding({ customerId: ID, currency: "THB", from: "2026-10-02", to: "2026-10-01" })).rejects.toMatchObject({ code: "BAD_REQUEST" });
    await expect(backCaller.memoOutReturn.approve({ id: ID, expectedVersion: 1 })).rejects.toMatchObject({ code: "FORBIDDEN" });
    await router.createCaller(context(["memo-out-return:APPROVE"])).memoOutReturn.approve({ id: ID, expectedVersion: 1 });
    expect(memoOutReturn.approve).toHaveBeenCalledWith("user-1", ID, 1);
    await expect(router.createCaller(context(["memo-out-return:APPROVE"], { csrfVerified: false })).memoOutReturn.approve({ id: ID, expectedVersion: 1 })).rejects.toMatchObject({ code: "FORBIDDEN" });
    await expect(backCaller.memoOutReturn.create(out as never)).rejects.toMatchObject({ code: "BAD_REQUEST" });
    await expect(router.createCaller(context(["memo-out:VIEW"])).memoOutReturn.list({})).rejects.toMatchObject({ code: "FORBIDDEN" });
    await expect(router.createCaller(context(["memo-out-return:VIEW"])).memoOutReturn.delete({ id: ID, expectedVersion: 1 })).rejects.toMatchObject({ code: "FORBIDDEN" });

    await router.createCaller(context(["memo-out-return:VIEW"])).currency.options();
    await router.createCaller(context(["memo-out:VIEW"])).currency.options();
    expect(currency.options).toHaveBeenCalledTimes(2);
  });
  it("UT-MR-R1 memo receive / memo stock: each procedure checks its grant and CSRF; memo stock with either VIEW; currency options with memo-receive VIEW", async () => {
    const ID2 = "0b9f3c4e-1d2a-4b3c-8d4e-5f6a7b8c9d0f";
    const line = { source: "MANUAL" as const, stoneCode: "", stone: "Ruby", shape: "", size: "", color: "", clarity: "", cutting: "", quality: "",
      lot: "", cerType: "", cerNo: "", pcs: 1, weightCt: "1", priceUnit: "PER_CT" as const, unitPrice: "100", discount: { type: "NONE" as const, value: "0" }, itemNote: "", photoIds: [] as string[] };
    const body = { docDate: "2026-10-29", dueDate: "2026-11-29", currency: "THB", exchangeRate: null, ref: "", documentNote: "", lines: [line],
      discount: { type: "NONE" as const, value: "0" }, tax: { enabled: false, rate: "7", includeInPrice: false }, serviceCharges: [], labor: null, vendorId: ID, addressId: ID2 };
    const versioned = { id: ID, expectedVersion: 1 };
    const all = ["VIEW", "ADD", "EDIT", "DELETE", "APPROVE"].map((action) => `memo-receive:${action}`);
    const caller = router.createCaller(context(all));

    await caller.memoReceive.list({ q: "MR", status: "PENDING_APPROVAL", partyId: ID });
    await caller.memoReceive.get({ id: ID });
    await caller.memoReceive.nextNumber({ docDate: "2026-10-29" });
    await caller.memoReceive.options({ vendorId: ID });
    await caller.memoReceive.create(body);
    await caller.memoReceive.update({ ...body, ...versioned, lines: [{ ...line, id: ID2 }, line] });
    await caller.memoReceive.delete(versioned);
    await caller.memoReceive.approve(versioned);
    expect(memoReceive.list).toHaveBeenCalledWith(expect.objectContaining({ status: "PENDING_APPROVAL", partyId: ID, limit: 50 }));
    expect(memoReceive.options).toHaveBeenCalledWith(ID);
    expect(memoReceive.create).toHaveBeenCalledWith("user-1", expect.objectContaining({ vendorId: ID, addressId: ID2 }));
    expect(memoReceive.update).toHaveBeenCalledWith("user-1", ID, 1, expect.objectContaining({ lines: [expect.objectContaining({ id: ID2 }), expect.not.objectContaining({ id: expect.anything() })] }));
    expect(memoReceive.approve).toHaveBeenCalledWith("user-1", ID, 1);

    // Exact grant per procedure.
    const only = (action: string) => router.createCaller(context([`memo-receive:${action}`]));
    await expect(only("VIEW").memoReceive.create(body)).rejects.toMatchObject({ code: "FORBIDDEN", message: "PERMISSION_DENIED" });
    await expect(only("ADD").memoReceive.update({ ...body, ...versioned })).rejects.toMatchObject({ code: "FORBIDDEN" });
    await expect(only("EDIT").memoReceive.delete(versioned)).rejects.toMatchObject({ code: "FORBIDDEN" });
    await expect(only("EDIT").memoReceive.approve(versioned)).rejects.toMatchObject({ code: "FORBIDDEN" });
    await expect(only("ADD").memoReceive.list({})).rejects.toMatchObject({ code: "FORBIDDEN" });
    await expect(router.createCaller(context(["memo-out-return:VIEW"])).memoReceive.options({})).rejects.toMatchObject({ code: "FORBIDDEN" });
    // CSRF on every mutation, checked before the service.
    const noCsrf = router.createCaller(context(all, { csrfVerified: false }));
    await expect(noCsrf.memoReceive.create(body)).rejects.toMatchObject({ code: "FORBIDDEN", message: "CSRF_INVALID" });
    await expect(noCsrf.memoReceive.update({ ...body, ...versioned })).rejects.toMatchObject({ message: "CSRF_INVALID" });
    await expect(noCsrf.memoReceive.delete(versioned)).rejects.toMatchObject({ message: "CSRF_INVALID" });
    await expect(noCsrf.memoReceive.approve(versioned)).rejects.toMatchObject({ message: "CSRF_INVALID" });
    expect(memoReceive.create).toHaveBeenCalledTimes(1);
    expect(memoReceive.approve).toHaveBeenCalledTimes(1);

    // Strict input: no stone code id / location; ≤ 5 distinct photo ids (SA-MR-17); create carries no line id; status enum.
    await expect(caller.memoReceive.create({ ...body, lines: [{ ...line, location: "Memo" }] } as never)).rejects.toMatchObject({ code: "BAD_REQUEST" });
    await expect(caller.memoReceive.create({ ...body, lines: [{ ...line, stoneCodeId: null }] } as never)).rejects.toMatchObject({ code: "BAD_REQUEST" });
    await expect(caller.memoReceive.create({ ...body, lines: [{ ...line, photoIds: [ID, ID] }] })).rejects.toMatchObject({ code: "BAD_REQUEST" });
    await expect(caller.memoReceive.create({ ...body, lines: [{ ...line, photoIds: Array.from({ length: 6 }, (_, n) => `00000000-0000-4000-8000-00000000010${n}`) }] })).rejects.toMatchObject({ code: "BAD_REQUEST" });
    await expect(caller.memoReceive.create({ ...body, lines: [{ ...line, id: ID2 }] } as never)).rejects.toMatchObject({ code: "BAD_REQUEST" });
    await expect(caller.memoReceive.list({ status: "DRAFT" } as never)).rejects.toMatchObject({ code: "BAD_REQUEST" });

    // memoStock.list: memo-return VIEW or memo-receive VIEW; bounded input.
    await router.createCaller(context(["memo-return:VIEW"])).memoStock.list({ vendorId: ID });
    await router.createCaller(context(["memo-receive:VIEW"])).memoStock.list({ vendorId: ID, q: "ruby", from: "2026-01-01", to: "2026-10-29", limit: 10 });
    expect(memoStock.list).toHaveBeenCalledTimes(2);
    expect(memoStock.list).toHaveBeenLastCalledWith(expect.objectContaining({ vendorId: ID, q: "ruby", limit: 10 }));
    await expect(router.createCaller(context(["memo-out-return:VIEW"])).memoStock.list({ vendorId: ID })).rejects.toMatchObject({ code: "FORBIDDEN" });
    await expect(router.createCaller(context(["memo-return:ADD"])).memoStock.list({ vendorId: ID })).rejects.toMatchObject({ code: "FORBIDDEN" });
    const viewer = router.createCaller(context(["memo-return:VIEW"]));
    await expect(viewer.memoStock.list({ vendorId: ID, limit: 51 })).rejects.toMatchObject({ code: "BAD_REQUEST" });
    await expect(viewer.memoStock.list({ vendorId: ID, q: "x".repeat(101) })).rejects.toMatchObject({ code: "BAD_REQUEST" });
    await expect(viewer.memoStock.list({ vendorId: ID, from: "2026-10-29", to: "2026-01-01" })).rejects.toMatchObject({ code: "BAD_REQUEST" });
    await expect(viewer.memoStock.list({ vendorId: ID, from: "2025-01-01", to: "2026-10-29" })).rejects.toMatchObject({ code: "BAD_REQUEST" });
    await expect(viewer.memoStock.list({ vendorId: "not-a-uuid" })).rejects.toMatchObject({ code: "BAD_REQUEST" });
    expect(memoStock.list).toHaveBeenCalledTimes(2);

    await router.createCaller(context(["memo-receive:VIEW"])).currency.options();
    expect(currency.options).toHaveBeenCalledTimes(1);

    memoReceive.approve.mockRejectedValueOnce(new HttpException({ error: { code: "MEMO_RECEIVE_STATUS_INVALID", message: "x" } }, 409));
    await expect(caller.memoReceive.approve(versioned)).rejects.toMatchObject({ code: "CONFLICT", message: "MEMO_RECEIVE_STATUS_INVALID" });
    memoReceive.create.mockRejectedValueOnce(new HttpException({ error: { code: "MEMO_RECEIVE_STOCK_ID_EXHAUSTED", message: "x" } }, 409));
    await expect(caller.memoReceive.create(body)).rejects.toMatchObject({ code: "CONFLICT", message: "MEMO_RECEIVE_STOCK_ID_EXHAUSTED" });
  });

  it("GP-MT-MR memo return: exact grants, CSRF on writes and approve, lines name a Memo Stock item, status list filter", async () => {
    const ID2 = "0b9f3c4e-1d2a-4b3c-8d4e-5f6a7b8c9d0f";
    const line = { source: "MANUAL" as const, stoneCodeId: null, stoneCode: "", stone: "Ruby", shape: "", size: "", color: "", clarity: "", cutting: "", quality: "",
      lot: "", location: "Memo", cerType: "", cerNo: "", pcs: 1, weightCt: "1", priceUnit: "PER_CT" as const, unitPrice: "100", discount: { type: "NONE" as const, value: "0" }, itemNote: "", photoIds: [] as string[],
      memoStockId: ID2, outstandingPcs: 1, outstandingWeightCt: "1" };
    const body = { docDate: "2026-10-29", dueDate: "2026-11-29", currency: "THB", exchangeRate: null, ref: "", documentNote: "", vendorId: ID, addressId: ID2,
      discount: { type: "NONE" as const, value: "0" }, tax: { enabled: false, rate: "7", includeInPrice: false }, serviceCharges: [], labor: null, lines: [line] };
    const versioned = { id: ID, expectedVersion: 1 };
    const all = ["VIEW", "ADD", "EDIT", "DELETE", "APPROVE"].map((action) => `memo-return:${action}`);
    const caller = router.createCaller(context(all));

    await caller.memoReturn.list({ status: "APPROVED" });
    await caller.memoReturn.get({ id: ID });
    await caller.memoReturn.nextNumber({ docDate: "2026-10-29" });
    await caller.memoReturn.options({ vendorId: ID });
    await caller.memoReturn.create(body);
    await caller.memoReturn.update({ ...body, ...versioned });
    await caller.memoReturn.delete(versioned);
    await caller.memoReturn.approve(versioned);
    expect(memoReturn.list).toHaveBeenCalledWith(expect.objectContaining({ status: "APPROVED" }));
    expect(memoReturn.create).toHaveBeenCalledWith("user-1", expect.objectContaining({ lines: [expect.objectContaining({ memoStockId: ID2 })] }));
    expect(memoReturn.approve).toHaveBeenCalledWith("user-1", ID, 1);

    const only = (action: string) => router.createCaller(context([`memo-return:${action}`]));
    await expect(only("VIEW").memoReturn.create(body)).rejects.toMatchObject({ code: "FORBIDDEN" });
    await expect(only("VIEW").memoReturn.delete(versioned)).rejects.toMatchObject({ code: "FORBIDDEN" });
    await expect(only("EDIT").memoReturn.approve(versioned)).rejects.toMatchObject({ code: "FORBIDDEN" });
    await expect(router.createCaller(context(["memo-receive:APPROVE"])).memoReturn.approve(versioned)).rejects.toMatchObject({ code: "FORBIDDEN" });
    const noCsrf = router.createCaller(context(all, { csrfVerified: false }));
    await expect(noCsrf.memoReturn.create(body)).rejects.toMatchObject({ message: "CSRF_INVALID" });
    await expect(noCsrf.memoReturn.approve(versioned)).rejects.toMatchObject({ message: "CSRF_INVALID" });
    expect(memoReturn.approve).toHaveBeenCalledTimes(1);

    // Strict input: every line names its Memo Stock item; Return ≤ Outstanding.
    const { memoStockId: _memoStockId, ...unsourced } = line;
    await expect(caller.memoReturn.create({ ...body, lines: [unsourced] } as never)).rejects.toMatchObject({ code: "BAD_REQUEST" });
    await expect(caller.memoReturn.create({ ...body, lines: [{ ...line, pcs: 2 }] })).rejects.toMatchObject({ code: "BAD_REQUEST" });

    // The Add Memo Stock dialog passes the return's currency.
    await router.createCaller(context(["memo-return:VIEW"])).memoStock.list({ vendorId: ID, currency: "THB" });
    expect(memoStock.list).toHaveBeenLastCalledWith(expect.objectContaining({ vendorId: ID, currency: "THB" }));
    // The dialog pages with a tRPC infinite query, which adds `direction`.
    await router.createCaller(context(["memo-return:VIEW"])).memoStock.list({ vendorId: ID, currency: "THB", cursor: null, direction: "forward" });
    expect(memoStock.list).toHaveBeenLastCalledWith(expect.objectContaining({ direction: "forward", cursor: null }));
    await expect(router.createCaller(context(["memo-return:VIEW"])).memoStock.list({ vendorId: ID, currency: "thb" })).rejects.toMatchObject({ code: "BAD_REQUEST" });

    await router.createCaller(context(["memo-return:VIEW"])).currency.options();
    expect(currency.options).toHaveBeenCalledTimes(1);
    memoReturn.approve.mockRejectedValueOnce(new HttpException({ error: { code: "MEMO_RETURN_PENDING_SHORT", message: "x" } }, 409));
    await expect(caller.memoReturn.approve(versioned)).rejects.toMatchObject({ code: "CONFLICT", message: "MEMO_RETURN_PENDING_SHORT" });
  });

  it("UT-MOV-R1 memoOutstanding.*: memo-outstanding-vendor VIEW on every procedure; bounds refused with contract field errors", async () => {
    const fieldErrorsOf = async (promise: Promise<unknown>) => {
      try { await promise; } catch (error) {
        const cause = (error as { cause?: unknown }).cause;
        expect(error).toMatchObject({ code: "BAD_REQUEST", message: "VALIDATION_ERROR" });
        expect(cause).toBeInstanceOf(HttpException);
        return ((cause as HttpException).getResponse() as { error: { code: string; fieldErrors: { path: string; code: string }[] } }).error;
      }
      throw new Error("expected a refusal");
    };
    const viewer = router.createCaller(context(["memo-outstanding-vendor:VIEW"]));
    await viewer.memoOutstanding.vendorSummary({ q: " MR-1 ", vendorIds: [ID], from: "2026-01-01", to: "2026-10-29" });
    expect(memoOutstanding.vendorSummary).toHaveBeenCalledWith({ q: "MR-1", vendorIds: [ID], from: "2026-01-01", to: "2026-10-29" });
    await viewer.memoOutstanding.vendorList({ pageSize: 25, sort: "openValue", dir: "desc" });
    expect(memoOutstanding.vendorList).toHaveBeenCalledWith({ page: 1, pageSize: 25, sort: "openValue", dir: "desc" });
    await viewer.memoOutstanding.vendorItems({ memoReceiveIds: [ID] });
    expect(memoOutstanding.vendorItems).toHaveBeenCalledWith({ memoReceiveIds: [ID] });
    await viewer.memoOutstanding.vendorOptions({});
    await viewer.memoOutstanding.vendorOptions();
    expect(memoOutstanding.vendorOptions).toHaveBeenCalledTimes(2);

    // Grant: exactly memo-outstanding-vendor:VIEW; memo-receive / vendor grants are not enough; live checks first.
    for (const grants of [["memo-receive:VIEW", "vendor:VIEW", "memo-return:VIEW"], ["memo-outstanding-vendor:PRINT"], []]) {
      const caller = router.createCaller(context(grants));
      await expect(caller.memoOutstanding.vendorSummary({})).rejects.toMatchObject({ code: "FORBIDDEN", message: "PERMISSION_DENIED" });
      await expect(caller.memoOutstanding.vendorList({ pageSize: 10 })).rejects.toMatchObject({ code: "FORBIDDEN" });
      await expect(caller.memoOutstanding.vendorItems({ memoReceiveIds: [ID] })).rejects.toMatchObject({ code: "FORBIDDEN" });
      await expect(caller.memoOutstanding.vendorOptions({})).rejects.toMatchObject({ code: "FORBIDDEN" });
    }
    await expect(router.createCaller(context(["memo-outstanding-vendor:VIEW"], { principal: null })).memoOutstanding.vendorList({ pageSize: 10 })).rejects.toMatchObject({ code: "UNAUTHORIZED" });
    await expect(router.createCaller(context(["memo-outstanding-vendor:VIEW"], { authorization: "UNAVAILABLE" })).memoOutstanding.vendorSummary({})).rejects.toMatchObject({ code: "SERVICE_UNAVAILABLE", message: "AUTHORIZATION_UNAVAILABLE" });
    // Reads need no CSRF proof.
    await router.createCaller(context(["memo-outstanding-vendor:VIEW"], { csrfVerified: false })).memoOutstanding.vendorSummary({});
    // A bad input from a caller without the grant is refused by the grant, not by validation.
    await expect(router.createCaller(context([])).memoOutstanding.vendorList({ pageSize: 100 } as never)).rejects.toMatchObject({ code: "FORBIDDEN" });

    // Bounds (testing.md): pageSize 100, 26 ids, 51 vendors, 400-day range; plus from > to, bad sort, empty ids, q > 100.
    expect(await fieldErrorsOf(viewer.memoOutstanding.vendorList({ pageSize: 100 } as never))).toMatchObject({ code: "VALIDATION_ERROR", fieldErrors: [{ path: "pageSize" }] });
    const ids = (count: number) => Array.from({ length: count }, (_, n) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`);
    expect(await fieldErrorsOf(viewer.memoOutstanding.vendorItems({ memoReceiveIds: ids(26) }))).toMatchObject({ fieldErrors: [{ path: "memoReceiveIds", code: "too_big" }] });
    expect(await fieldErrorsOf(viewer.memoOutstanding.vendorItems({ memoReceiveIds: [] }))).toMatchObject({ fieldErrors: [{ path: "memoReceiveIds", code: "too_small" }] });
    expect(await fieldErrorsOf(viewer.memoOutstanding.vendorItems({ memoReceiveIds: ["not-a-uuid"] }))).toMatchObject({ fieldErrors: [{ path: "memoReceiveIds.0" }] });
    expect(await fieldErrorsOf(viewer.memoOutstanding.vendorSummary({ vendorIds: ids(51) }))).toMatchObject({ fieldErrors: [{ path: "vendorIds", code: "too_big" }] });
    expect(await fieldErrorsOf(viewer.memoOutstanding.vendorList({ pageSize: 10, vendorIds: ids(51) }))).toMatchObject({ fieldErrors: [{ path: "vendorIds", code: "too_big" }] });
    expect(await fieldErrorsOf(viewer.memoOutstanding.vendorSummary({ from: "2026-01-01", to: "2027-02-05" }))).toMatchObject({ fieldErrors: [{ path: "to", code: "range_too_long" }] });
    expect(await fieldErrorsOf(viewer.memoOutstanding.vendorList({ pageSize: 10, from: "2026-01-01", to: "2027-02-05" }))).toMatchObject({ fieldErrors: [{ path: "to", code: "range_too_long" }] });
    expect(await fieldErrorsOf(viewer.memoOutstanding.vendorSummary({ from: "2026-10-29", to: "2026-10-28" }))).toMatchObject({ fieldErrors: [{ path: "to", code: "before_from" }] });
    expect(await fieldErrorsOf(viewer.memoOutstanding.vendorList({ pageSize: 10, sort: "createdAt" } as never))).toMatchObject({ fieldErrors: [{ path: "sort" }] });
    expect(await fieldErrorsOf(viewer.memoOutstanding.vendorList({ pageSize: 10, page: 0 }))).toMatchObject({ fieldErrors: [{ path: "page" }] });
    expect(await fieldErrorsOf(viewer.memoOutstanding.vendorSummary({ q: "x".repeat(101) }))).toMatchObject({ fieldErrors: [{ path: "q" }] });
    expect(await fieldErrorsOf(viewer.memoOutstanding.vendorOptions({ extra: 1 } as never))).toMatchObject({ code: "VALIDATION_ERROR" });
    // 366 days is still allowed.
    await viewer.memoOutstanding.vendorSummary({ from: "2026-01-01", to: "2027-01-02" });
    expect(memoOutstanding.vendorSummary).toHaveBeenCalledTimes(3);
    expect(memoOutstanding.vendorList).toHaveBeenCalledTimes(1);
    expect(memoOutstanding.vendorItems).toHaveBeenCalledTimes(1);

    memoOutstanding.vendorList.mockRejectedValueOnce(new Error("db down"));
    await expect(viewer.memoOutstanding.vendorList({ pageSize: 10 })).rejects.toMatchObject({ code: "SERVICE_UNAVAILABLE", message: "DEPENDENCY_UNAVAILABLE" });
  });

  it("GP-MT-MO2 memo out rev 2: From Stock lines, status filter, approve needs APPROVE + CSRF, From Stock list with memo-out VIEW and no vendor", async () => {
    const ID2 = "0b9f3c4e-1d2a-4b3c-8d4e-5f6a7b8c9d0f";
    const line = { source: "MANUAL" as const, stoneCodeId: null, stoneCode: "", stone: "Ruby", shape: "", size: "", color: "", clarity: "", cutting: "", quality: "",
      lot: "", location: "", cerType: "", cerNo: "", pcs: 1, weightCt: "1", priceUnit: "PER_CT" as const, unitPrice: "100", discount: { type: "NONE" as const, value: "0" }, itemNote: "", photoIds: [] as string[] };
    const out = { docDate: "2026-10-31", dueDate: "2026-11-30", currency: "THB", exchangeRate: null, ref: "", documentNote: "", customerId: ID, shippingAddressId: ID2, invoiceAddressId: ID2,
      discount: { type: "NONE" as const, value: "0" }, tax: { enabled: false, rate: "7", includeInPrice: false }, serviceCharges: [], labor: null,
      lines: [{ ...line, memoStockId: ID2 }] };
    const versioned = { id: ID, expectedVersion: 1 };
    const all = ["VIEW", "ADD", "EDIT", "DELETE", "APPROVE"].map((action) => `memo-out:${action}`);
    const caller = router.createCaller(context(all));

    await caller.memoOut.list({ status: "PENDING_APPROVAL" });
    expect(memoOut.list).toHaveBeenCalledWith(expect.objectContaining({ status: "PENDING_APPROVAL" }));
    await expect(caller.memoOut.list({ status: "DRAFT" } as never)).rejects.toMatchObject({ code: "BAD_REQUEST" });
    await caller.memoOut.create(out);
    expect(memoOut.create).toHaveBeenCalledWith("user-1", expect.objectContaining({ lines: [expect.objectContaining({ memoStockId: ID2 })] }));
    // memo-out rev 3: rows can't be keyed in by hand.
    await expect(caller.memoOut.create({ ...out, lines: [{ ...line, memoStockId: ID2 }, { ...line, memoStockId: null }] })).rejects.toMatchObject({ code: "BAD_REQUEST" });
    await expect(caller.memoOut.create({ ...out, lines: [{ ...line, memoStockId: ID2, unitPrice: "0" }] })).rejects.toMatchObject({ code: "BAD_REQUEST" });

    await caller.memoOut.approve(versioned);
    expect(memoOut.approve).toHaveBeenCalledWith("user-1", ID, 1);
    await expect(router.createCaller(context(["memo-out:VIEW", "memo-out:EDIT"])).memoOut.approve(versioned)).rejects.toMatchObject({ code: "FORBIDDEN" });
    await expect(router.createCaller(context(["memo-receive:APPROVE"])).memoOut.approve(versioned)).rejects.toMatchObject({ code: "FORBIDDEN" });
    await expect(router.createCaller(context(all, { csrfVerified: false })).memoOut.approve(versioned)).rejects.toMatchObject({ message: "CSRF_INVALID" });
    expect(memoOut.approve).toHaveBeenCalledTimes(1);
    memoOut.approve.mockRejectedValueOnce(new HttpException({ error: { code: "MEMO_OUT_PENDING_SHORT", message: "x" } }, 409));
    await expect(caller.memoOut.approve(versioned)).rejects.toMatchObject({ code: "CONFLICT", message: "MEMO_OUT_PENDING_SHORT" });

    await router.createCaller(context(["memo-out:VIEW"])).memoStock.list({ limit: 50 });
    expect(memoStock.list).toHaveBeenLastCalledWith(expect.objectContaining({ limit: 50 }));
    expect(memoStock.list.mock.lastCall?.[0]).not.toHaveProperty("vendorId");
    await expect(router.createCaller(context(["memo-out:ADD"])).memoStock.list({})).rejects.toMatchObject({ code: "FORBIDDEN" });
  });
});
