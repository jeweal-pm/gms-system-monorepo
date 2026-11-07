import { HttpException } from "@nestjs/common";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { MasterContext } from "../../src/master/authorization";
import { createMasterRouter } from "../../src/master/router";
import type { DocumentSetupService } from "../../src/document-setup/document-setup.service";
import type { DecimalSetupService } from "../../src/decimal-setup/decimal-setup.service";
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
import type { ReserveService } from "../../src/trade-document/reserve.service";
import type { PurchaseOrderService } from "../../src/purchase-order/purchase-order.service";
import type { PurchaseService } from "../../src/purchase/purchase.service";
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
const decimalSetup = { get: vi.fn(), save: vi.fn() };
const currency = { list: vi.fn(), get: vi.fn(), options: vi.fn(), create: vi.fn(), update: vi.fn(), delete: vi.fn() };
const quotation = {
  list: vi.fn(), get: vi.fn(), nextNumber: vi.fn(), options: vi.fn(), create: vi.fn(), update: vi.fn(),
  submit: vi.fn(), approve: vi.fn(), reject: vi.fn(), cancel: vi.fn(), delete: vi.fn(), restore: vi.fn(),
};
const memoOut = { list: vi.fn(), get: vi.fn(), nextNumber: vi.fn(), options: vi.fn(), create: vi.fn(), update: vi.fn(), delete: vi.fn(), restore: vi.fn(), approve: vi.fn() };
const memoOutReturn = { list: vi.fn(), get: vi.fn(), nextNumber: vi.fn(), options: vi.fn(), create: vi.fn(), update: vi.fn(), delete: vi.fn(), restore: vi.fn(), outstanding: vi.fn(), approve: vi.fn() };
const memoReceive = { list: vi.fn(), get: vi.fn(), nextNumber: vi.fn(), options: vi.fn(), create: vi.fn(), update: vi.fn(), delete: vi.fn(), restore: vi.fn(), approve: vi.fn() };
const memoStock = { list: vi.fn() };
const memoReturn = { list: vi.fn(), get: vi.fn(), nextNumber: vi.fn(), options: vi.fn(), create: vi.fn(), update: vi.fn(), delete: vi.fn(), restore: vi.fn(), approve: vi.fn() };
const memoOutstanding = { vendorSummary: vi.fn(), vendorList: vi.fn(), vendorItems: vi.fn(), vendorOptions: vi.fn(), customerSummary: vi.fn(), customerList: vi.fn(), customerItems: vi.fn(), customerOptions: vi.fn(), purchaseSummary: vi.fn(), purchaseList: vi.fn(), purchaseItems: vi.fn(), purchaseOptions: vi.fn() };
const reserve = { list: vi.fn(), get: vi.fn(), nextNumber: vi.fn(), options: vi.fn(), create: vi.fn(), update: vi.fn(), delete: vi.fn(), restore: vi.fn(), approve: vi.fn() };
const purchaseOrder = { list: vi.fn(), get: vi.fn(), nextNumber: vi.fn(), options: vi.fn(), create: vi.fn(), update: vi.fn(), delete: vi.fn(), restore: vi.fn(), approve: vi.fn() };
const purchase = {
  list: vi.fn(), get: vi.fn(), nextNumber: vi.fn(), options: vi.fn(), memoStock: vi.fn(), purchaseOrderLines: vi.fn(),
  create: vi.fn(), update: vi.fn(), delete: vi.fn(), restore: vi.fn(), approve: vi.fn(),
};
const router = createMasterRouter({
  customer: customer as unknown as CustomerService,
  vendor: vendor as unknown as VendorService,
  companyProfile: companyProfile as unknown as CompanyProfileService,
  stoneMaster: stoneMaster as unknown as StoneMasterService,
  documentSetup: documentSetup as unknown as DocumentSetupService,
  decimalSetup: decimalSetup as unknown as DecimalSetupService,
  currency: currency as unknown as CurrencyService,
  quotation: quotation as unknown as QuotationService,
  memoOut: memoOut as unknown as MemoOutService,
  memoOutReturn: memoOutReturn as unknown as MemoOutReturnService,
  memoReceive: memoReceive as unknown as MemoReceiveService,
  memoStock: memoStock as unknown as MemoStockService,
  memoReturn: memoReturn as unknown as MemoReturnService,
  memoOutstanding: memoOutstanding as unknown as MemoOutstandingService,
  reserve: reserve as unknown as ReserveService,
  purchaseOrder: purchaseOrder as unknown as PurchaseOrderService,
  purchase: purchase as unknown as PurchaseService,
});

function context(grants: string[], overrides: Partial<MasterContext> = {}): MasterContext {
  return {
    principal: { userId: "user-1", sessionId: "session-1", isSuperAdmin: false, grants },
    authorization: "CURRENT", license: "ELIGIBLE", csrfVerified: true, ...overrides,
  };
}

beforeEach(() => {
  for (const fn of [...Object.values(customer), ...Object.values(vendor), ...Object.values(companyProfile), ...Object.values(stoneMaster), ...Object.values(documentSetup), ...Object.values(decimalSetup), ...Object.values(currency), ...Object.values(quotation), ...Object.values(memoOut), ...Object.values(memoOutReturn), ...Object.values(memoReceive), ...Object.values(memoStock), ...Object.values(memoReturn), ...Object.values(memoOutstanding), ...Object.values(reserve), ...Object.values(purchaseOrder), ...Object.values(purchase)]) fn.mockReset().mockResolvedValue({ ok: true });
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

  it("GP-MT-DEC / UT-DEC-B07 decimal setup: any live licensed session reads, decimal-setup:EDIT + CSRF saves, strict input", async () => {
    const save = { weightPlaces: 3, pricePlaces: 0, expectedVersion: 1 };
    // get: no grant at all is enough; no CSRF on a query.
    await router.createCaller(context([], { csrfVerified: false })).decimalSetup.get();
    expect(decimalSetup.get).toHaveBeenCalledOnce();
    await expect(router.createCaller(context([], { principal: null })).decimalSetup.get()).rejects.toMatchObject({ code: "UNAUTHORIZED", message: "UNAUTHENTICATED" });
    await expect(router.createCaller(context([], { authorization: "UNAVAILABLE" })).decimalSetup.get()).rejects.toMatchObject({ code: "SERVICE_UNAVAILABLE", message: "AUTHORIZATION_UNAVAILABLE" });
    await expect(router.createCaller(context([], { license: "DENIED" })).decimalSetup.get()).rejects.toMatchObject({ code: "FORBIDDEN", message: "LICENSE_REQUIRED" });
    expect(decimalSetup.get).toHaveBeenCalledOnce();
    // save: exact EDIT grant (document-setup grants do not count), CSRF, verified actor.
    await expect(router.createCaller(context(["decimal-setup:VIEW", "document-setup:EDIT"])).decimalSetup.save(save)).rejects.toMatchObject({ code: "FORBIDDEN", message: "PERMISSION_DENIED" });
    await expect(router.createCaller(context(["decimal-setup:EDIT"], { csrfVerified: false })).decimalSetup.save(save)).rejects.toMatchObject({ code: "FORBIDDEN", message: "CSRF_INVALID" });
    expect(decimalSetup.save).not.toHaveBeenCalled();
    await router.createCaller(context(["decimal-setup:EDIT"])).decimalSetup.save(save);
    expect(decimalSetup.save).toHaveBeenCalledWith("user-1", save);
    // Owner Q-DEC-08: 4 is the upper bound for both settings.
    await router.createCaller(context(["decimal-setup:EDIT"])).decimalSetup.save({ weightPlaces: 4, pricePlaces: 4, expectedVersion: 2 });
    expect(decimalSetup.save).toHaveBeenLastCalledWith("user-1", { weightPlaces: 4, pricePlaces: 4, expectedVersion: 2 });
    decimalSetup.save.mockClear();
    // Validation runs after the grant check and carries field errors.
    const editor = router.createCaller(context(["decimal-setup:EDIT"]));
    const invalid = await editor.decimalSetup.save({ ...save, weightPlaces: 5 }).then(() => null, (error: unknown) => error as { code: string; message: string; cause: HttpException });
    expect(invalid).toMatchObject({ code: "BAD_REQUEST", message: "VALIDATION_ERROR" });
    expect(invalid?.cause.getResponse()).toMatchObject({ error: { code: "VALIDATION_ERROR", fieldErrors: [expect.objectContaining({ path: "weightPlaces" })] } });
    await expect(editor.decimalSetup.save({ ...save, pricePlaces: 5 })).rejects.toMatchObject({ code: "BAD_REQUEST" });
    await expect(editor.decimalSetup.save({ ...save, pricePlaces: 1.5 })).rejects.toMatchObject({ code: "BAD_REQUEST" });
    await expect(editor.decimalSetup.save({ ...save, page: "quotation" } as never)).rejects.toMatchObject({ code: "BAD_REQUEST" });
    expect(decimalSetup.save).not.toHaveBeenCalled();
    // Domain errors keep their code.
    decimalSetup.save.mockRejectedValueOnce(new HttpException({ error: { code: "DECIMAL_SETUP_CHANGED" } }, 409));
    await expect(editor.decimalSetup.save(save)).rejects.toMatchObject({ code: "CONFLICT", message: "DECIMAL_SETUP_CHANGED" });
    decimalSetup.get.mockRejectedValueOnce(new HttpException({ error: { code: "PARTNER_UNAVAILABLE" } }, 503));
    await expect(editor.decimalSetup.get()).rejects.toMatchObject({ code: "SERVICE_UNAVAILABLE", message: "PARTNER_UNAVAILABLE" });
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
    // GP-MT-QT2 (quotation SA rev 2, SA-QT-19): Quotation From Stock reads Memo Stock with quotation:VIEW.
    await router.createCaller(context(["quotation:VIEW"])).memoStock.list({ vendorId: ID, q: "ruby", from: "2026-01-01", to: "2026-10-29", limit: 10 });
    expect(memoStock.list).toHaveBeenCalledTimes(3);
    expect(memoStock.list).toHaveBeenLastCalledWith(expect.objectContaining({ vendorId: ID, q: "ruby", limit: 10 }));
    await expect(router.createCaller(context(["memo-out-return:VIEW"])).memoStock.list({ vendorId: ID })).rejects.toMatchObject({ code: "FORBIDDEN" });
    await expect(router.createCaller(context(["memo-return:ADD"])).memoStock.list({ vendorId: ID })).rejects.toMatchObject({ code: "FORBIDDEN" });
    const viewer = router.createCaller(context(["memo-return:VIEW"]));
    await expect(viewer.memoStock.list({ vendorId: ID, limit: 51 })).rejects.toMatchObject({ code: "BAD_REQUEST" });
    await expect(viewer.memoStock.list({ vendorId: ID, q: "x".repeat(101) })).rejects.toMatchObject({ code: "BAD_REQUEST" });
    await expect(viewer.memoStock.list({ vendorId: ID, from: "2026-10-29", to: "2026-01-01" })).rejects.toMatchObject({ code: "BAD_REQUEST" });
    await expect(viewer.memoStock.list({ vendorId: ID, from: "2025-01-01", to: "2026-10-29" })).rejects.toMatchObject({ code: "BAD_REQUEST" });
    await expect(viewer.memoStock.list({ vendorId: "not-a-uuid" })).rejects.toMatchObject({ code: "BAD_REQUEST" });
    expect(memoStock.list).toHaveBeenCalledTimes(3);

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

  it("GP-MT-MOC memoOutstanding.customer*: memo-outstanding-customer VIEW on every procedure; customer bounds and sort whitelist", async () => {
    const viewer = router.createCaller(context(["memo-outstanding-customer:VIEW"]));
    await viewer.memoOutstanding.customerSummary({ q: " 12 ", customerIds: [ID], from: "2026-01-01", to: "2026-11-03" });
    expect(memoOutstanding.customerSummary).toHaveBeenCalledWith({ q: "12", customerIds: [ID], from: "2026-01-01", to: "2026-11-03" });
    await viewer.memoOutstanding.customerList({ pageSize: 25, sort: "customerName", dir: "desc" });
    expect(memoOutstanding.customerList).toHaveBeenCalledWith({ page: 1, pageSize: 25, sort: "customerName", dir: "desc" });
    await viewer.memoOutstanding.customerItems({ memoOutIds: [ID] });
    expect(memoOutstanding.customerItems).toHaveBeenCalledWith({ memoOutIds: [ID] });
    await viewer.memoOutstanding.customerOptions({});
    expect(memoOutstanding.customerOptions).toHaveBeenCalledTimes(1);

    // Grant: exactly memo-outstanding-customer:VIEW; the vendor report or memo-out grants are not enough.
    for (const grants of [["memo-outstanding-vendor:VIEW", "memo-out:VIEW", "customer:VIEW"], ["memo-outstanding-customer:PRINT"], []]) {
      const caller = router.createCaller(context(grants));
      await expect(caller.memoOutstanding.customerSummary({})).rejects.toMatchObject({ code: "FORBIDDEN", message: "PERMISSION_DENIED" });
      await expect(caller.memoOutstanding.customerList({ pageSize: 10 })).rejects.toMatchObject({ code: "FORBIDDEN" });
      await expect(caller.memoOutstanding.customerItems({ memoOutIds: [ID] })).rejects.toMatchObject({ code: "FORBIDDEN" });
      await expect(caller.memoOutstanding.customerOptions({})).rejects.toMatchObject({ code: "FORBIDDEN" });
    }
    // The vendor grant reads only the vendor report.
    await expect(router.createCaller(context(["memo-outstanding-customer:VIEW"])).memoOutstanding.vendorSummary({})).rejects.toMatchObject({ code: "FORBIDDEN" });

    // Bounds: no Reserve / vendor sort, 26 ids, 51 customers, a reversed range, vendor-only fields.
    const ids = (count: number) => Array.from({ length: count }, (_, n) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`);
    await expect(viewer.memoOutstanding.customerList({ pageSize: 10, sort: "reservePcs" } as never)).rejects.toMatchObject({ code: "BAD_REQUEST" });
    await expect(viewer.memoOutstanding.customerList({ pageSize: 10, sort: "vendorName" } as never)).rejects.toMatchObject({ code: "BAD_REQUEST" });
    await expect(viewer.memoOutstanding.customerItems({ memoOutIds: ids(26) })).rejects.toMatchObject({ code: "BAD_REQUEST" });
    await expect(viewer.memoOutstanding.customerItems({ memoOutIds: [] })).rejects.toMatchObject({ code: "BAD_REQUEST" });
    await expect(viewer.memoOutstanding.customerSummary({ customerIds: ids(51) })).rejects.toMatchObject({ code: "BAD_REQUEST" });
    await expect(viewer.memoOutstanding.customerSummary({ from: "2026-11-03", to: "2026-11-02" })).rejects.toMatchObject({ code: "BAD_REQUEST" });
    await expect(viewer.memoOutstanding.customerSummary({ vendorIds: [ID] } as never)).rejects.toMatchObject({ code: "BAD_REQUEST" });
    await expect(viewer.memoOutstanding.customerItems({ memoReceiveIds: [ID] } as never)).rejects.toMatchObject({ code: "BAD_REQUEST" });
    expect(memoOutstanding.customerList).toHaveBeenCalledTimes(1);
    expect(memoOutstanding.customerItems).toHaveBeenCalledTimes(1);
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

  it("GP-MT-RS reserve: exact grants per procedure, CSRF on writes and approve, strict From Stock input, reads with reserve VIEW", async () => {
    const ID2 = "0b9f3c4e-1d2a-4b3c-8d4e-5f6a7b8c9d0f";
    const line = { source: "MANUAL" as const, stoneCodeId: null, stoneCode: "", stone: "Ruby", shape: "", size: "", color: "", clarity: "", cutting: "", quality: "",
      lot: "", location: "", cerType: "", cerNo: "", pcs: 1, weightCt: "1", priceUnit: "PER_CT" as const, unitPrice: "100", discount: { type: "NONE" as const, value: "0" }, itemNote: "", photoIds: [] as string[] };
    const body = { docDate: "2026-11-02", dueDate: "2026-11-30", currency: "THB", exchangeRate: null, ref: "", documentNote: "", customerId: ID, shippingAddressId: ID2, invoiceAddressId: ID2,
      discount: { type: "NONE" as const, value: "0" }, tax: { enabled: false, rate: "7", includeInPrice: false }, serviceCharges: [], labor: null,
      lines: [{ ...line, memoStockId: ID2 }] };
    const versioned = { id: ID, expectedVersion: 1 };
    const all = ["VIEW", "ADD", "EDIT", "DELETE", "APPROVE"].map((action) => `reserve:${action}`);
    const caller = router.createCaller(context(all));

    await caller.reserve.list({ status: "APPROVED", partyId: ID });
    await caller.reserve.get({ id: ID });
    await caller.reserve.nextNumber({ docDate: "2026-11-02" });
    await caller.reserve.options({ customerId: ID });
    await caller.reserve.create(body);
    await caller.reserve.update({ ...body, ...versioned });
    await caller.reserve.delete(versioned);
    await caller.reserve.approve(versioned);
    expect(reserve.list).toHaveBeenCalledWith(expect.objectContaining({ status: "APPROVED", partyId: ID, limit: 50 }));
    expect(reserve.options).toHaveBeenCalledWith(ID);
    expect(reserve.create).toHaveBeenCalledWith("user-1", expect.objectContaining({ lines: [expect.objectContaining({ memoStockId: ID2 })] }));
    expect(reserve.update).toHaveBeenCalledWith("user-1", ID, 1, expect.objectContaining({ customerId: ID }));
    expect(reserve.approve).toHaveBeenCalledWith("user-1", ID, 1);

    const only = (action: string) => router.createCaller(context([`reserve:${action}`]));
    await expect(only("VIEW").reserve.create(body)).rejects.toMatchObject({ code: "FORBIDDEN", message: "PERMISSION_DENIED" });
    await expect(only("ADD").reserve.update({ ...body, ...versioned })).rejects.toMatchObject({ code: "FORBIDDEN" });
    await expect(only("EDIT").reserve.delete(versioned)).rejects.toMatchObject({ code: "FORBIDDEN" });
    await expect(only("EDIT").reserve.approve(versioned)).rejects.toMatchObject({ code: "FORBIDDEN" });
    await expect(only("ADD").reserve.list({})).rejects.toMatchObject({ code: "FORBIDDEN" });
    await expect(router.createCaller(context(["memo-out:APPROVE", "memo-out:VIEW"])).reserve.approve(versioned)).rejects.toMatchObject({ code: "FORBIDDEN" });
    const noCsrf = router.createCaller(context(all, { csrfVerified: false }));
    await expect(noCsrf.reserve.create(body)).rejects.toMatchObject({ message: "CSRF_INVALID" });
    await expect(noCsrf.reserve.update({ ...body, ...versioned })).rejects.toMatchObject({ message: "CSRF_INVALID" });
    await expect(noCsrf.reserve.delete(versioned)).rejects.toMatchObject({ message: "CSRF_INVALID" });
    await expect(noCsrf.reserve.approve(versioned)).rejects.toMatchObject({ message: "CSRF_INVALID" });
    expect(reserve.create).toHaveBeenCalledTimes(1);
    expect(reserve.approve).toHaveBeenCalledTimes(1);

    // Strict input: every row From Stock (owner 2026-11-02, the Memo Out rev 3 rule), Sale Price, one row per item, status enum, no photos.
    await expect(caller.reserve.create({ ...body, lines: [{ ...line, memoStockId: null }] })).rejects.toMatchObject({ code: "BAD_REQUEST" });
    await expect(caller.reserve.create({ ...body, lines: [{ ...line, memoStockId: ID2, unitPrice: "0" }] })).rejects.toMatchObject({ code: "BAD_REQUEST" });
    await expect(caller.reserve.create({ ...body, lines: [{ ...line, memoStockId: ID2 }, { ...line, memoStockId: ID2 }] })).rejects.toMatchObject({ code: "BAD_REQUEST" });
    await expect(caller.reserve.create({ ...body, lines: [{ ...line, memoStockId: ID2, photoIds: [ID] }] })).rejects.toMatchObject({ code: "BAD_REQUEST" });
    await expect(caller.reserve.list({ status: "DRAFT" } as never)).rejects.toMatchObject({ code: "BAD_REQUEST" });

    // From Stock and the currency list read with reserve VIEW.
    await router.createCaller(context(["reserve:VIEW"])).memoStock.list({ limit: 50 });
    expect(memoStock.list).toHaveBeenLastCalledWith(expect.objectContaining({ limit: 50 }));
    await router.createCaller(context(["reserve:VIEW"])).currency.options();
    expect(currency.options).toHaveBeenCalledTimes(1);
    await expect(router.createCaller(context(["reserve:ADD"])).memoStock.list({})).rejects.toMatchObject({ code: "FORBIDDEN" });

    reserve.approve.mockRejectedValueOnce(new HttpException({ error: { code: "RESERVE_PENDING_SHORT", message: "x" } }, 409));
    await expect(caller.reserve.approve(versioned)).rejects.toMatchObject({ code: "CONFLICT", message: "RESERVE_PENDING_SHORT" });
  });

  it("GP-MT-PO purchase order: exact grant per procedure, CSRF on writes and approve, keyed-in lines only, currency options with purchase-order VIEW", async () => {
    const ID2 = "0b9f3c4e-1d2a-4b3c-8d4e-5f6a7b8c9d0f";
    const line = { source: "MANUAL" as const, stoneCodeId: null, stoneCode: "", stone: "Ruby", shape: "", size: "", color: "", clarity: "", cutting: "", quality: "",
      lot: "", location: "Safe A", cerType: "", cerNo: "", pcs: 1, weightCt: "1", priceUnit: "PER_CT" as const, unitPrice: "100", discount: { type: "NONE" as const, value: "0" }, itemNote: "", photoIds: [] as string[] };
    const body = { docDate: "2026-11-04", dueDate: "2026-12-04", currency: "THB", exchangeRate: null, ref: "", documentNote: "", lines: [line],
      discount: { type: "NONE" as const, value: "0" }, tax: { enabled: false, rate: "7", includeInPrice: false }, serviceCharges: [], labor: null, vendorId: ID, addressId: ID2 };
    const versioned = { id: ID, expectedVersion: 1 };
    const all = ["VIEW", "ADD", "EDIT", "DELETE", "APPROVE"].map((action) => `purchase-order:${action}`);
    const caller = router.createCaller(context(all));

    await caller.purchaseOrder.list({ q: "PO", status: "APPROVED", partyId: ID });
    await caller.purchaseOrder.get({ id: ID });
    await caller.purchaseOrder.nextNumber({ docDate: "2026-11-04" });
    await caller.purchaseOrder.options({ vendorId: ID });
    await caller.purchaseOrder.create(body);
    await caller.purchaseOrder.update({ ...body, ...versioned });
    await caller.purchaseOrder.delete(versioned);
    await caller.purchaseOrder.approve(versioned);
    expect(purchaseOrder.list).toHaveBeenCalledWith(expect.objectContaining({ status: "APPROVED", partyId: ID, limit: 50 }));
    expect(purchaseOrder.options).toHaveBeenCalledWith(ID);
    expect(purchaseOrder.create).toHaveBeenCalledWith("user-1", expect.objectContaining({ vendorId: ID, addressId: ID2, lines: [expect.objectContaining({ location: "Safe A" })] }));
    expect(purchaseOrder.update).toHaveBeenCalledWith("user-1", ID, 1, expect.objectContaining({ vendorId: ID }));
    expect(purchaseOrder.approve).toHaveBeenCalledWith("user-1", ID, 1);

    // Exact grant per procedure; other menus' grants are refused.
    const only = (action: string) => router.createCaller(context([`purchase-order:${action}`]));
    await expect(only("VIEW").purchaseOrder.create(body)).rejects.toMatchObject({ code: "FORBIDDEN", message: "PERMISSION_DENIED" });
    await expect(only("ADD").purchaseOrder.update({ ...body, ...versioned })).rejects.toMatchObject({ code: "FORBIDDEN" });
    await expect(only("EDIT").purchaseOrder.delete(versioned)).rejects.toMatchObject({ code: "FORBIDDEN" });
    await expect(only("EDIT").purchaseOrder.approve(versioned)).rejects.toMatchObject({ code: "FORBIDDEN" });
    await expect(only("ADD").purchaseOrder.list({})).rejects.toMatchObject({ code: "FORBIDDEN" });
    await expect(router.createCaller(context(["memo-receive:VIEW", "purchase:VIEW"])).purchaseOrder.options({})).rejects.toMatchObject({ code: "FORBIDDEN" });
    await expect(router.createCaller(context(["memo-receive:APPROVE"])).purchaseOrder.approve(versioned)).rejects.toMatchObject({ code: "FORBIDDEN" });
    // CSRF on every mutation, checked before the service.
    const noCsrf = router.createCaller(context(all, { csrfVerified: false }));
    await expect(noCsrf.purchaseOrder.create(body)).rejects.toMatchObject({ code: "FORBIDDEN", message: "CSRF_INVALID" });
    await expect(noCsrf.purchaseOrder.update({ ...body, ...versioned })).rejects.toMatchObject({ message: "CSRF_INVALID" });
    await expect(noCsrf.purchaseOrder.delete(versioned)).rejects.toMatchObject({ message: "CSRF_INVALID" });
    await expect(noCsrf.purchaseOrder.approve(versioned)).rejects.toMatchObject({ message: "CSRF_INVALID" });
    expect(purchaseOrder.create).toHaveBeenCalledTimes(1);
    expect(purchaseOrder.approve).toHaveBeenCalledTimes(1);

    // UT-PO-B01 keyed-in lines only (Q-PO-05): no STOCK source, no memoStockId, no line id; location ≤ 40; ≤ 5 distinct photos.
    await expect(caller.purchaseOrder.create({ ...body, lines: [{ ...line, source: "STOCK" }] } as never)).rejects.toMatchObject({ code: "BAD_REQUEST" });
    await expect(caller.purchaseOrder.create({ ...body, lines: [{ ...line, memoStockId: ID }] } as never)).rejects.toMatchObject({ code: "BAD_REQUEST" });
    await expect(caller.purchaseOrder.create({ ...body, lines: [{ ...line, id: ID2 }] } as never)).rejects.toMatchObject({ code: "BAD_REQUEST" });
    await expect(caller.purchaseOrder.create({ ...body, lines: [{ ...line, location: "x".repeat(41) }] })).rejects.toMatchObject({ code: "BAD_REQUEST" });
    await expect(caller.purchaseOrder.create({ ...body, lines: [{ ...line, photoIds: [ID, ID] }] })).rejects.toMatchObject({ code: "BAD_REQUEST" });
    await expect(caller.purchaseOrder.create({ ...body, lines: [{ ...line, photoIds: Array.from({ length: 6 }, (_, n) => `00000000-0000-4000-8000-00000000010${n}`) }] })).rejects.toMatchObject({ code: "BAD_REQUEST" });
    await expect(caller.purchaseOrder.create({ ...body, lines: [{ ...line, discount: { type: "AMOUNT", value: "101" } }] })).rejects.toMatchObject({ code: "BAD_REQUEST" });
    await expect(caller.purchaseOrder.list({ status: "DRAFT" } as never)).rejects.toMatchObject({ code: "BAD_REQUEST" });
    expect(purchaseOrder.create).toHaveBeenCalledTimes(1);

    await router.createCaller(context(["purchase-order:VIEW"])).currency.options();
    expect(currency.options).toHaveBeenCalledTimes(1);
  });

  it("GP-MT-PU purchase: exact grant per procedure, CSRF on writes and approve, validation after the grant with field errors, currency options with purchase VIEW, memoStock.list not opened", async () => {
    const ID2 = "0b9f3c4e-1d2a-4b3c-8d4e-5f6a7b8c9d0f";
    const ID3 = "0b9f3c4e-1d2a-4b3c-8d4e-5f6a7b8c9d10";
    const base = { stoneCodeId: null, stoneCode: "", stone: "Ruby", shape: "", size: "", color: "", clarity: "", cutting: "", quality: "",
      lot: "", location: "", cerType: "", cerNo: "", pcs: 1, weightCt: "1", priceUnit: "PER_CT" as const, unitPrice: "100", discount: { type: "NONE" as const, value: "0" }, itemNote: "", photoIds: [] as string[] };
    const manual = { ...base, source: "MANUAL" as const };
    const stock = { ...base, source: "STOCK" as const, memoStockId: ID2, memoGroup: "IN_STOCK" as const };
    const fromPo = { ...base, source: "PURCHASE_ORDER" as const, purchaseOrderLineId: ID3 };
    const body = { docDate: "2026-11-04", dueDate: "2026-12-04", currency: "THB", exchangeRate: null, ref: "", documentNote: "", lines: [manual, stock, fromPo],
      discount: { type: "NONE" as const, value: "0" }, tax: { enabled: false, rate: "7", includeInPrice: false }, serviceCharges: [], labor: null, vendorId: ID, addressId: ID2 };
    const versioned = { id: ID, expectedVersion: 1 };
    const picker = { vendorId: ID, currency: "THB" };
    const all = ["VIEW", "ADD", "EDIT", "DELETE", "APPROVE"].map((action) => `purchase:${action}`);
    const caller = router.createCaller(context(all));

    await caller.purchase.list({ q: "PU", status: "APPROVED", partyId: ID });
    await caller.purchase.get({ id: ID });
    await caller.purchase.nextNumber({ docDate: "2026-11-04" });
    await caller.purchase.options({ vendorId: ID });
    await caller.purchase.memoStock({ ...picker, status: "SOLD" });
    await caller.purchase.purchaseOrderLines(picker);
    await caller.purchase.create(body);
    await caller.purchase.update({ ...body, lines: [{ ...manual, id: ID3 }, stock], ...versioned });
    await caller.purchase.delete(versioned);
    await caller.purchase.approve(versioned);
    expect(purchase.list).toHaveBeenCalledWith(expect.objectContaining({ status: "APPROVED", partyId: ID, limit: 50 }));
    expect(purchase.get).toHaveBeenCalledWith(ID);
    expect(purchase.options).toHaveBeenCalledWith(ID);
    expect(purchase.memoStock).toHaveBeenCalledWith(expect.objectContaining({ vendorId: ID, currency: "THB", status: "SOLD", limit: 50 }));
    expect(purchase.purchaseOrderLines).toHaveBeenCalledWith(expect.objectContaining({ status: "ALL", limit: 50 }));
    expect(purchase.create).toHaveBeenCalledWith("user-1", expect.objectContaining({ vendorId: ID, lines: [expect.objectContaining({ source: "MANUAL" }), expect.objectContaining({ memoStockId: ID2, memoGroup: "IN_STOCK" }), expect.objectContaining({ purchaseOrderLineId: ID3 })] }));
    expect(purchase.update).toHaveBeenCalledWith("user-1", ID, 1, expect.objectContaining({ lines: [expect.objectContaining({ id: ID3 }), expect.anything()] }));
    expect(purchase.delete).toHaveBeenCalledWith("user-1", ID, 1);
    expect(purchase.approve).toHaveBeenCalledWith("user-1", ID, 1);

    // Exact grant per procedure; grants on other menus (purchase-order, memo-receive) are refused.
    const only = (action: string) => router.createCaller(context([`purchase:${action}`]));
    await expect(only("VIEW").purchase.create(body)).rejects.toMatchObject({ code: "FORBIDDEN", message: "PERMISSION_DENIED" });
    await expect(only("ADD").purchase.update({ ...body, ...versioned })).rejects.toMatchObject({ code: "FORBIDDEN" });
    await expect(only("EDIT").purchase.delete(versioned)).rejects.toMatchObject({ code: "FORBIDDEN" });
    await expect(only("EDIT").purchase.approve(versioned)).rejects.toMatchObject({ code: "FORBIDDEN" });
    await expect(only("ADD").purchase.list({})).rejects.toMatchObject({ code: "FORBIDDEN" });
    await expect(only("ADD").purchase.memoStock(picker)).rejects.toMatchObject({ code: "FORBIDDEN" });
    await expect(router.createCaller(context(["purchase-order:VIEW", "memo-receive:VIEW"])).purchase.purchaseOrderLines(picker)).rejects.toMatchObject({ code: "FORBIDDEN" });
    await expect(router.createCaller(context(["purchase-order:APPROVE"])).purchase.approve(versioned)).rejects.toMatchObject({ code: "FORBIDDEN" });
    // CSRF on every mutation, checked before the service.
    const noCsrf = router.createCaller(context(all, { csrfVerified: false }));
    await expect(noCsrf.purchase.create(body)).rejects.toMatchObject({ code: "FORBIDDEN", message: "CSRF_INVALID" });
    await expect(noCsrf.purchase.update({ ...body, ...versioned })).rejects.toMatchObject({ message: "CSRF_INVALID" });
    await expect(noCsrf.purchase.delete(versioned)).rejects.toMatchObject({ message: "CSRF_INVALID" });
    await expect(noCsrf.purchase.approve(versioned)).rejects.toMatchObject({ message: "CSRF_INVALID" });
    // Validation runs after the grant: a user without the grant learns nothing about the input shape.
    await expect(only("VIEW").purchase.create({ ...body, lines: [] })).rejects.toMatchObject({ code: "FORBIDDEN" });
    expect(purchase.create).toHaveBeenCalledTimes(1);
    expect(purchase.approve).toHaveBeenCalledTimes(1);

    // UT-PU-B01 (router part): contract field errors.
    const fieldErrors = async (promise: Promise<unknown>) => {
      try { await promise; } catch (error) { return (error as { cause?: { getResponse(): { error: { fieldErrors: unknown } } } }).cause?.getResponse().error.fieldErrors; }
      throw new Error("expected a refusal");
    };
    expect(await fieldErrors(caller.purchase.create({ ...body, lines: [{ ...stock, discount: { type: "PERCENT", value: "5" } }] }))).toEqual([{ path: "lines.0.discount", code: "not_allowed" }]);
    expect(await fieldErrors(caller.purchase.create({ ...body, lines: [{ ...manual, memoStockId: ID2 }] }))).toEqual([{ path: "lines.0.memoStockId", code: "not_allowed" }]);
    expect(await fieldErrors(caller.purchase.create({ ...body, lines: [stock, { ...stock }] }))).toEqual([{ path: "lines.1.memoStockId", code: "duplicate" }]);
    expect(await fieldErrors(caller.purchase.create({ ...body, lines: [{ ...manual, id: ID3 }] } as never))).toEqual([{ path: "lines.0", code: "unrecognized_keys" }]);
    expect(await fieldErrors(caller.purchase.memoStock({ ...picker, status: "RESERVED" } as never))).toEqual([{ path: "status", code: "invalid_value" }]);
    expect(await fieldErrors(caller.purchase.list({ from: "2026-02-01", to: "2026-01-01" }))).toEqual([{ path: "to", code: "before_from" }]);
    expect(purchase.create).toHaveBeenCalledTimes(1);

    // Domain codes kept.
    purchase.approve.mockRejectedValueOnce(new HttpException({ error: { code: "PURCHASE_PENDING_SHORT", message: "x", fieldErrors: [{ path: "lines.0.pcs", code: "exceeds_available" }] } }, 409));
    await expect(caller.purchase.approve(versioned)).rejects.toMatchObject({ code: "CONFLICT", message: "PURCHASE_PENDING_SHORT" });
    purchase.create.mockRejectedValueOnce(new HttpException({ error: { code: "PURCHASE_REFERENCE_INVALID", message: "x" } }, 422));
    await expect(caller.purchase.create(body)).rejects.toMatchObject({ code: "UNPROCESSABLE_CONTENT", message: "PURCHASE_REFERENCE_INVALID" });

    // currency.options with purchase:VIEW; memoStock.list still refuses purchase:VIEW (SA-PU-12).
    await router.createCaller(context(["purchase:VIEW"])).currency.options();
    expect(currency.options).toHaveBeenCalledTimes(1);
    await expect(router.createCaller(context(["purchase:VIEW"])).memoStock.list({ vendorId: ID })).rejects.toMatchObject({ code: "FORBIDDEN" });
    expect(memoStock.list).not.toHaveBeenCalled();
  });
  it("GP-SD-01 transaction-soft-delete: restore needs <menu> DELETE + CSRF on all 8 routers; list {deleted: true} needs VIEW only", async () => {
    const versioned = { id: ID, expectedVersion: 2 };
    const docs = [
      ["quotation", "quotation", quotation], ["memoOut", "memo-out", memoOut], ["reserve", "reserve", reserve], ["memoOutReturn", "memo-out-return", memoOutReturn],
      ["memoReceive", "memo-receive", memoReceive], ["memoReturn", "memo-return", memoReturn], ["purchaseOrder", "purchase-order", purchaseOrder], ["purchase", "purchase", purchase],
    ] as const;
    type DocCaller = { restore(input: unknown): Promise<unknown>; list(input: unknown): Promise<unknown> };
    const doc = (grants: string[], key: string, overrides: Partial<MasterContext> = {}) =>
      (router.createCaller(context(grants, overrides)) as unknown as Record<string, DocCaller>)[key];
    for (const [key, menu, service] of docs) {
      await doc([`${menu}:DELETE`], key).restore(versioned);
      expect(service.restore).toHaveBeenCalledWith("user-1", ID, 2);
      for (const grants of [[`${menu}:VIEW`], [`${menu}:EDIT`], [`${menu}:VIEW`, `${menu}:EDIT`, `${menu}:ADD`, `${menu}:APPROVE`]]) {
        await expect(doc(grants, key).restore(versioned)).rejects.toMatchObject({ code: "FORBIDDEN", message: "PERMISSION_DENIED" });
      }
      await expect(doc([`${menu}:DELETE`], key, { csrfVerified: false }).restore(versioned)).rejects.toMatchObject({ code: "FORBIDDEN", message: "CSRF_INVALID" });
      // Same strict schema as delete.
      await expect(doc([`${menu}:DELETE`], key).restore({ id: "nope", expectedVersion: 2 })).rejects.toMatchObject({ code: "BAD_REQUEST" });
      await expect(doc([`${menu}:DELETE`], key).restore({ ...versioned, extra: 1 })).rejects.toMatchObject({ code: "BAD_REQUEST" });
      expect(service.restore).toHaveBeenCalledTimes(1);
      // The Deleted list view: VIEW only, no CSRF; deleted is passed through and defaults to false.
      await doc([`${menu}:VIEW`], key, { csrfVerified: false }).list({ deleted: true });
      expect(service.list).toHaveBeenLastCalledWith(expect.objectContaining({ deleted: true }));
      await doc([`${menu}:VIEW`], key).list({});
      expect(service.list).toHaveBeenLastCalledWith(expect.objectContaining({ deleted: false }));
      await expect(doc([`${menu}:VIEW`], key).list({ deleted: "yes" })).rejects.toMatchObject({ code: "BAD_REQUEST" });
      await expect(doc([`${menu}:DELETE`], key).list({ deleted: true })).rejects.toMatchObject({ code: "FORBIDDEN" });
    }
    // Purchase reports the restore / list refusal as contract field errors.
    const fieldErrors = async (promise: Promise<unknown>) => {
      try { await promise; } catch (error) { return (error as { cause?: { getResponse(): { error: { fieldErrors: unknown } } } }).cause?.getResponse().error.fieldErrors; }
      throw new Error("expected a refusal");
    };
    expect(await fieldErrors(doc(["purchase:DELETE"], "purchase").restore({ id: ID, expectedVersion: 0 }))).toEqual([{ path: "expectedVersion", code: "too_small" }]);
    expect(await fieldErrors(doc(["purchase:VIEW"], "purchase").list({ deleted: "yes" }))).toEqual([{ path: "deleted", code: "invalid_type" }]);
    // Domain codes kept.
    memoReceive.restore.mockRejectedValueOnce(new HttpException({ error: { code: "MEMO_RECEIVE_STATUS_INVALID", message: "x" } }, 409));
    await expect(doc(["memo-receive:DELETE"], "memoReceive").restore(versioned)).rejects.toMatchObject({ code: "CONFLICT", message: "MEMO_RECEIVE_STATUS_INVALID" });
    memoOut.approve.mockRejectedValueOnce(new HttpException({ error: { code: "MEMO_OUT_DELETED", message: "x" } }, 409));
    await expect(router.createCaller(context(["memo-out:APPROVE"])).memoOut.approve(versioned)).rejects.toMatchObject({ code: "CONFLICT", message: "MEMO_OUT_DELETED" });
  });

  it("GP-MT-POS purchaseOutstanding.*: purchase-outstanding VIEW on every procedure; sort whitelist and bounds (SA-POS-05)", async () => {
    const viewer = router.createCaller(context(["purchase-outstanding:VIEW"]));
    await viewer.purchaseOutstanding.summary({ q: " MR ", vendorIds: [ID], from: "2026-01-01", to: "2026-11-06" });
    expect(memoOutstanding.purchaseSummary).toHaveBeenCalledWith({ q: "MR", vendorIds: [ID], from: "2026-01-01", to: "2026-11-06" });
    await viewer.purchaseOutstanding.list({ pageSize: 25, sort: "balancePcs", dir: "desc" });
    expect(memoOutstanding.purchaseList).toHaveBeenCalledWith({ page: 1, pageSize: 25, sort: "balancePcs", dir: "desc" });
    for (const sort of ["purchasePcs", "salePcs", "openValue", "vendorName"] as const) await viewer.purchaseOutstanding.list({ pageSize: 10, sort });
    await viewer.purchaseOutstanding.items({ memoReceiveIds: [ID] });
    expect(memoOutstanding.purchaseItems).toHaveBeenCalledWith({ memoReceiveIds: [ID] });
    await viewer.purchaseOutstanding.options({});
    expect(memoOutstanding.purchaseOptions).toHaveBeenCalledTimes(1);

    // Grant: exactly purchase-outstanding:VIEW; the memo reports and purchase grants are not enough.
    for (const grants of [["memo-outstanding-vendor:VIEW", "purchase:VIEW", "purchase-order:VIEW"], ["purchase-outstanding:PRINT"], []]) {
      const caller = router.createCaller(context(grants));
      await expect(caller.purchaseOutstanding.summary({})).rejects.toMatchObject({ code: "FORBIDDEN", message: "PERMISSION_DENIED" });
      await expect(caller.purchaseOutstanding.list({ pageSize: 10 })).rejects.toMatchObject({ code: "FORBIDDEN" });
      await expect(caller.purchaseOutstanding.items({ memoReceiveIds: [ID] })).rejects.toMatchObject({ code: "FORBIDDEN" });
      await expect(caller.purchaseOutstanding.options({})).rejects.toMatchObject({ code: "FORBIDDEN" });
    }
    await expect(viewer.memoOutstanding.vendorSummary({})).rejects.toMatchObject({ code: "FORBIDDEN" });

    // Bounds: memo-report sort keys, 26 ids, a reversed range.
    const ids = (count: number) => Array.from({ length: count }, (_, n) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`);
    await expect(viewer.purchaseOutstanding.list({ pageSize: 10, sort: "soldPcs" } as never)).rejects.toMatchObject({ code: "BAD_REQUEST" });
    await expect(viewer.purchaseOutstanding.list({ pageSize: 10, sort: "reservePcs" } as never)).rejects.toMatchObject({ code: "BAD_REQUEST" });
    await expect(viewer.purchaseOutstanding.items({ memoReceiveIds: ids(26) })).rejects.toMatchObject({ code: "BAD_REQUEST" });
    await expect(viewer.purchaseOutstanding.summary({ from: "2026-11-06", to: "2026-11-01" })).rejects.toMatchObject({ code: "BAD_REQUEST" });
    expect(memoOutstanding.purchaseList).toHaveBeenCalledTimes(5);
  });
});
