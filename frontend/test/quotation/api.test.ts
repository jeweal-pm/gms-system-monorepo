import { afterEach, describe, expect, it, vi } from "vitest";
import {
  fromQuotation,
  isEditableStatus,
  loadErrorMessage,
  mapSaveError,
  PhotoUploadError,
  quotationAccess,
  toQuotationInput,
  uploadQuotationPhoto,
  type QuotationDetail,
} from "@/features/quotation/api";
import { emptyLine, emptyQuotation } from "@/features/quotation/lib/defaults";
import type { QuotationFormValues } from "@/features/quotation/schema";
import { gatewayError } from "../partner/helpers";

/** UT-QT-01…08: quotation data boundary (SA quotation rev 1, FE-QT-001…005). */

const ID = "11111111-1111-4111-8111-111111111111";

const values = (patch: Partial<QuotationFormValues> = {}): QuotationFormValues => ({
  ...emptyQuotation(),
  docDate: "2026-10-26",
  dueDate: "2026-11-25",
  customerId: ID,
  shippingAddressId: ID,
  invoiceAddressId: ID,
  currency: "USD",
  exchangeRate: "36.25",
  lines: [
    { ...emptyLine(), stoneCodeId: ID, stoneCode: "RU-1", stone: "Ruby", locationId: "BKK-01", pcs: "2", weightCt: "1.12", unitPrice: "65000", photos: [{ id: "p1", name: "a.jpg", url: "/x" }] },
    emptyLine(),
  ],
  ...patch,
});

const detail: QuotationDetail = {
  id: ID, docNo: "QT-1", status: "REJECTED", version: 3, docDate: "2026-10-26", dueDate: "2026-11-25",
  customerId: ID, customer: { code: "C001", name: "Siam Gems" }, shippingAddressId: ID, shippingAddressText: "A", invoiceAddressId: null, invoiceAddressText: "B",
  currency: "USD", exchangeRate: "36.25", ref: "PO-1", documentNote: "Note",
  lines: [{
    id: "l1", source: "MANUAL", stoneCodeId: null, stoneCode: "", stone: "Ruby", shape: "", size: "", color: "", clarity: "", cutting: "", quality: "",
    lot: "L1", location: "BKK-01", cerType: "GIA", cerNo: "1", pcs: 1, weightCt: "1.120", priceUnit: "PER_CT", unitPrice: "65000.00", discount: { type: "PERCENT", value: "5" }, discountAmount: "3640.00", amount: "69160.00", itemNote: "", photoIds: ["p1", "p2"],
  }],
  discount: { type: "AMOUNT", value: "100" },
  tax: { enabled: true, rate: "7", includeInPrice: false },
  serviceCharges: [{ type: "SHIPPING", amount: "100.00" }],
  labor: null,
  totals: { subtotal: "72800.00", discountAmount: "100.00", priceBeforeTax: "72700.00", taxAmount: "5089.00", chargesAmount: "100.00", laborAmount: "0.00", grandTotal: "77889.00" },
  statusReason: "Price too high", createdAt: "", createdBy: "u", updatedAt: "", approvedAt: null, approvedBy: null,
};

afterEach(() => vi.unstubAllGlobals());

describe("form ↔ contract", () => {
  it("UT-QT-01 drops empty rows, sends decimal strings, maps toggles to NONE/null and photos to ids", () => {
    const input = toQuotationInput(values());
    expect(input.lines).toHaveLength(1);
    expect(input.lines[0]).toMatchObject({ source: "MANUAL", stoneCodeId: ID, location: "BKK-01", pcs: 2, weightCt: "1.12", unitPrice: "65000", photoIds: ["p1"] });
    expect(input.discount).toEqual({ type: "NONE", value: "0" });
    expect(input.lines[0].discount).toEqual({ type: "NONE", value: "0" });
    const withAmount = toQuotationInput(values({ lines: [{ ...values().lines[0], discountAmount: " 150 " }] }));
    expect(withAmount.lines[0].discount).toEqual({ type: "AMOUNT", value: "150" });
    expect(input.labor).toBeNull();
    expect(input.exchangeRate).toBe("36.25");
    expect(toQuotationInput(values({ exchangeRate: " " })).exchangeRate).toBeNull();
    const enabled = toQuotationInput(values({
      discount: { enabled: true, type: "PERCENT", value: "" },
      labor: { enabled: true, work: " Setting ", basis: "WEIGHT", qty: "1.5", rate: "" },
      serviceCharges: [{ chargeId: "HANDLING", amount: "" }],
    }));
    expect(enabled.discount).toEqual({ type: "PERCENT", value: "0" });
    expect(enabled.labor).toEqual({ work: "Setting", basis: "WEIGHT", qty: "1.5", rate: "0" });
    expect(enabled.serviceCharges).toEqual([{ type: "HANDLING", amount: "0" }]);
  });

  it("UT-QT-02 a saved quotation loads into the form and saves back unchanged", () => {
    const form = fromQuotation(detail);
    expect(form).toMatchObject({ id: ID, docNo: "QT-1", version: 3, status: "REJECTED", statusReason: "Price too high", invoiceAddressId: "" });
    expect(form.lines[0]).toMatchObject({ key: "l1", locationId: "BKK-01", pcs: "1", stoneCodeId: "", discountPercent: "5", discountAmount: "" });
    expect(form.lines[0].photos.map((photo) => photo.url)).toEqual(["/api/v1/quotation/photos/p1", "/api/v1/quotation/photos/p2"]);
    expect(form.discount).toEqual({ enabled: true, type: "AMOUNT", value: "100" });
    const input = toQuotationInput(form);
    expect(input.lines[0]).toMatchObject({ stoneCodeId: null, location: "BKK-01", weightCt: "1.120", photoIds: ["p1", "p2"], discount: { type: "PERCENT", value: "5" } });
    expect(input.serviceCharges).toEqual([{ type: "SHIPPING", amount: "100.00" }]);
  });
});

describe("errors", () => {
  it("UT-QT-03 domain codes become field errors or messages", () => {
    expect(mapSaveError(gatewayError({ domainCode: "QUOTATION_REFERENCE_INVALID", httpStatus: 422, fieldErrors: [{ path: "shippingAddressId", code: "invalid_reference" }, { path: "lines.2.stoneCodeId", code: "invalid_reference" }] })).fieldErrors)
      .toEqual([{ name: "shippingAddressId", message: "Choose an active option" }, { name: "lines", message: "Check item row 3" }]);
    expect(mapSaveError(gatewayError({ domainCode: "VALIDATION_ERROR", fieldErrors: [{ path: "exchangeRate", code: "required" }] })).fieldErrors).toEqual([{ name: "exchangeRate", message: "Required" }]);
    expect(mapSaveError(gatewayError({ domainCode: "QUOTATION_CHANGED", httpStatus: 409 }))).toMatchObject({ stale: true });
    expect(mapSaveError(gatewayError({ domainCode: "PERMISSION_DENIED", httpStatus: 403 }))).toMatchObject({ recheckAccess: true });
    expect(mapSaveError(gatewayError({ domainCode: "SOMETHING_ELSE" })).message).toBe("Couldn't save. Try again.");
    expect(loadErrorMessage(gatewayError({ domainCode: "QUOTATION_NOT_FOUND", httpStatus: 404 }))).toBe("This quotation no longer exists.");
  });
});

describe("permissions and status (SA-QT-02/03)", () => {
  it("UT-QT-04 access follows quotation:<ACTION>; only drafts and rejected quotations are editable", () => {
    expect(quotationAccess({ isSuperAdmin: false, permissions: ["quotation:VIEW", "quotation:CANCEL"] })).toMatchObject({ view: true, add: false, edit: false, cancel: true, approve: false });
    expect(quotationAccess({ isSuperAdmin: true, permissions: [] }).delete).toBe(true);
    expect(quotationAccess(undefined).view).toBe(false);
    expect(["DRAFT", "REJECTED", "PENDING_APPROVAL", "APPROVED", "CANCELLED"].map((status) => isEditableStatus(status as never))).toEqual([true, true, false, false, false]);
  });
});

describe("photo upload (SA-QT-10)", () => {
  const file = (type: string, size = 10) => new File([new Uint8Array(size)], "a", { type });

  it("UT-QT-05 rejects other types and files over 5 MB before any request", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    await expect(uploadQuotationPhoto(file("image/gif"))).rejects.toBeInstanceOf(PhotoUploadError);
    await expect(uploadQuotationPhoto(file("image/jpeg", 5 * 1024 * 1024 + 1))).rejects.toThrow("5 MB");
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("UT-QT-06 posts the bytes with the CSRF marker and returns the photo id; server refusals become messages", async () => {
    const fetchMock = vi.fn(async () => new Response(JSON.stringify({ photoId: "p9" }), { status: 201 }));
    vi.stubGlobal("fetch", fetchMock);
    await expect(uploadQuotationPhoto(file("image/png"))).resolves.toBe("p9");
    expect(fetchMock).toHaveBeenCalledWith("/api/v1/quotation/photos", expect.objectContaining({ method: "POST", headers: { "content-type": "image/png", "x-gms-csrf": "1" } }));
    vi.stubGlobal("fetch", vi.fn(async () => new Response("{}", { status: 422 })));
    await expect(uploadQuotationPhoto(file("image/png"))).rejects.toThrow("supported photo");
    vi.stubGlobal("fetch", vi.fn(async () => new Response("{}", { status: 403 })));
    await expect(uploadQuotationPhoto(file("image/png"))).rejects.toThrow("permission");
  });
});
