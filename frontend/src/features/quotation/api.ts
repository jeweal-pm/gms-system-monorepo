/**
 * Quotation data access (ADR-0025 D2 → ADR-0032 / SA quotation rev 1): the typed master tRPC router
 * `quotation.*` plus the binary photo route. Components use only the hooks and mappers in this file.
 */
import { skipToken } from "@tanstack/react-query";
import type { InferQueryLikeData } from "@trpc/react-query/shared";
import { authTrpc } from "@/lib/auth-trpc";
import { masterTrpc } from "@/lib/master-trpc";
import { isCallerLicenseCode, readDomainError, retryTransient } from "@/lib/trpc-error";
import { stockItems, type StockItem } from "./mock/stock";
import { isFilledLine, type QuotationFormValues, type QuotationLine } from "./schema";

export type QuotationDetail = InferQueryLikeData<typeof masterTrpc.quotation.get>;
export type QuotationOptions = InferQueryLikeData<typeof masterTrpc.quotation.options>;
export type QuotationListItem = InferQueryLikeData<typeof masterTrpc.quotation.list>["items"][number];
export type QuotationStatus = QuotationDetail["status"];

export const quotationKeys = {
  stock: (filter: StockFilter) => ["quotation", "stock", filter] as const,
};

// ---- permissions (UX only; the server checks every call) ----

export type QuotationAction = "VIEW" | "ADD" | "EDIT" | "DELETE" | "CANCEL" | "APPROVE" | "PRINT";
export type QuotationAccess = Record<Lowercase<QuotationAction>, boolean>;

export function quotationAccess(mine: { isSuperAdmin: boolean; permissions: "ALL" | readonly string[] } | undefined): QuotationAccess {
  const can = (action: QuotationAction) => Boolean(mine && (mine.isSuperAdmin || mine.permissions === "ALL" || mine.permissions.includes(`quotation:${action}`)));
  return { view: can("VIEW"), add: can("ADD"), edit: can("EDIT"), delete: can("DELETE"), cancel: can("CANCEL"), approve: can("APPROVE"), print: can("PRINT") };
}

export function useQuotationAccess(): QuotationAccess | undefined {
  const mine = authTrpc.permission.mine.useQuery(undefined, { staleTime: 30_000, retry: false });
  return mine.data ? quotationAccess(mine.data) : undefined;
}

/** Edit/Submit are allowed only before approval (SA-QT-03). */
/** Quotation has no approval step (owner 2026-10-27): every saved, non-cancelled quotation can be edited or deleted. */
export const isEditableStatus = (status: QuotationStatus | undefined) => status !== undefined && status !== "CANCELLED";

// ---- form ↔ contract ----

export const photoUrl = (id: string) => `/api/v1/quotation/photos/${id}`;
const orZero = (value: string) => (value.trim() === "" ? "0" : value.trim());

/** The trade-document part of a form (quotation; memo out, memo out return ADR-0033): all but party and status. */
export type TradeDocumentFormValues = Omit<QuotationFormValues, "status" | "statusReason" | "customerId" | "shippingAddressId" | "invoiceAddressId">;

/** Form values → contract input; empty rows are dropped, totals are left to the server. */
export function toQuotationInput(values: QuotationFormValues) {
  return {
    ...toTradeDocumentInput(values),
    customerId: values.customerId,
    shippingAddressId: values.shippingAddressId,
    invoiceAddressId: values.invoiceAddressId,
  };
}

/** Shared part of a document input: dates, currency, lines (empty rows dropped) and the summary. */
export function toTradeDocumentInput(values: TradeDocumentFormValues) {
  return {
    docDate: values.docDate,
    dueDate: values.dueDate,
    currency: values.currency,
    exchangeRate: values.exchangeRate.trim() === "" ? null : values.exchangeRate.trim(),
    ref: values.ref.trim(),
    documentNote: values.documentNote.trim(),
    lines: values.lines.filter(isFilledLine).map((line) => ({
      source: "MANUAL" as const,
      stoneCodeId: line.stoneCodeId || null,
      stoneCode: line.stoneCode,
      stone: line.stone,
      shape: line.shape,
      size: line.size,
      color: line.color,
      clarity: line.clarity,
      cutting: line.cutting,
      quality: line.quality,
      lot: line.lot,
      location: line.locationId,
      cerType: line.cerType,
      cerNo: line.cerNo,
      pcs: Number.parseInt(orZero(line.pcs), 10),
      weightCt: orZero(line.weightCt),
      priceUnit: line.priceUnit,
      unitPrice: orZero(line.unitPrice),
      discount: line.discountValue.trim() === "" ? { type: "NONE" as const, value: "0" } : { type: line.discountType, value: line.discountValue.trim() },
      itemNote: line.itemNote.trim(),
      photoIds: line.photos.map((photo) => photo.id),
    })),
    discount: values.discount.enabled ? { type: values.discount.type, value: orZero(values.discount.value) } : { type: "NONE" as const, value: "0" },
    tax: { enabled: values.tax.enabled, rate: orZero(values.tax.rate), includeInPrice: values.tax.includeInPrice },
    serviceCharges: values.serviceCharges.map((charge) => ({ type: charge.chargeId as "SHIPPING", amount: orZero(charge.amount) })),
    labor: values.labor.enabled
      ? { work: values.labor.work.trim(), basis: values.labor.basis, qty: orZero(values.labor.qty), rate: orZero(values.labor.rate) }
      : null,
  };
}

/** Saved quotation → form values (rows keep a client key for useFieldArray). */
export function fromQuotation(detail: QuotationDetail): QuotationFormValues {
  return {
    ...fromTradeDocument(detail, photoUrl),
    status: detail.status,
    statusReason: detail.statusReason ?? undefined,
    customerId: detail.customerId,
    shippingAddressId: detail.shippingAddressId ?? "",
    invoiceAddressId: detail.invoiceAddressId ?? "",
  };
}

/** The contract fields every saved trade document returns (quotation and the memo documents share them). */
export type TradeDocumentDetail = Pick<QuotationDetail, "id" | "docNo" | "version" | "docDate" | "dueDate" | "currency" | "exchangeRate" | "ref" | "lines" | "discount" | "tax" | "serviceCharges" | "labor" | "documentNote">;

/** Shared part of a saved document → form values; `url` builds photo links for the document's photo route. */
export function fromTradeDocument(detail: TradeDocumentDetail, url: (id: string) => string): TradeDocumentFormValues {
  return {
    id: detail.id,
    docNo: detail.docNo,
    version: detail.version,
    docDate: detail.docDate,
    dueDate: detail.dueDate,
    currency: detail.currency,
    exchangeRate: detail.exchangeRate ?? "",
    ref: detail.ref,
    lines: detail.lines.map((line): QuotationLine => ({
      key: line.id,
      source: "MANUAL",
      stockId: "",
      lot: line.lot,
      stoneCodeId: line.stoneCodeId ?? "",
      stoneCode: line.stoneCode,
      locationId: line.location,
      stone: line.stone,
      shape: line.shape,
      size: line.size,
      color: line.color,
      clarity: line.clarity,
      cutting: line.cutting,
      quality: line.quality,
      cerType: line.cerType,
      cerNo: line.cerNo,
      pcs: String(line.pcs),
      weightCt: line.weightCt,
      priceUnit: line.priceUnit,
      unitPrice: line.unitPrice,
      discountType: line.discount.type === "AMOUNT" ? "AMOUNT" : "PERCENT",
      discountValue: line.discount.type === "NONE" ? "" : line.discount.value,
      stonePartOrder: [],
      photos: line.photoIds.map((id, index) => ({ id, name: `Photo ${index + 1}`, url: url(id) })),
      itemNote: line.itemNote,
    })),
    discount: detail.discount.type === "NONE"
      ? { enabled: false, type: "PERCENT", value: "" }
      : { enabled: true, type: detail.discount.type, value: detail.discount.value },
    tax: detail.tax,
    serviceCharges: detail.serviceCharges.map((charge) => ({ chargeId: charge.type, amount: charge.amount })),
    labor: detail.labor ? { enabled: true, ...detail.labor } : { enabled: false, work: "", basis: "PCS", qty: "", rate: "" },
    documentNote: detail.documentNote,
  };
}

// ---- hooks ----

export function useQuotationDetail(id: string | null) {
  return masterTrpc.quotation.get.useQuery(id === null ? skipToken : { id }, { staleTime: 30_000, retry: retryTransient });
}

export function useQuotationOptions(customerId?: string) {
  return masterTrpc.quotation.options.useQuery(customerId ? { customerId } : {}, { staleTime: 60_000, retry: retryTransient });
}

/** Preview of the next document number for a new quotation (SA-QT-04). */
export function useNextNumber(docDate: string, enabled: boolean) {
  return masterTrpc.quotation.nextNumber.useQuery(enabled && /^\d{4}-\d{2}-\d{2}$/.test(docDate) ? { docDate } : skipToken, { staleTime: 10_000, retry: retryTransient });
}

/** Daybook: newest first, no cancelled documents (owner 2026-10-26, Q-QT-06). */
export function useDaybook() {
  return masterTrpc.quotation.list.useQuery({ limit: 50 }, { staleTime: 15_000, retry: retryTransient });
}

export function useQuotationMutations() {
  const utils = masterTrpc.useUtils();
  const options = { retry: false, gcTime: 0 } as const;
  return {
    create: masterTrpc.quotation.create.useMutation(options),
    update: masterTrpc.quotation.update.useMutation(options),
    remove: masterTrpc.quotation.delete.useMutation(options),
    invalidate: () => Promise.all([utils.quotation.list.invalidate(), utils.quotation.get.invalidate(), utils.quotation.nextNumber.invalidate()]),
  };
}

// ---- photos (REST, SA-QT-10) ----

export const PHOTO_TYPES = ["image/jpeg", "image/png"] as const;
export const PHOTO_MAX_BYTES = 5 * 1024 * 1024;

export class PhotoUploadError extends Error {}

/** Uploads one JPEG/PNG ≤ 5 MB; returns its photo id. */
export async function uploadQuotationPhoto(file: File): Promise<string> {
  if (!(PHOTO_TYPES as readonly string[]).includes(file.type)) throw new PhotoUploadError("Use a JPEG or PNG photo.");
  if (file.size > PHOTO_MAX_BYTES) throw new PhotoUploadError("Photos can be up to 5 MB.");
  let response: Response;
  try {
    response = await fetch("/api/v1/quotation/photos", {
      method: "POST",
      headers: { "content-type": file.type, "x-gms-csrf": "1" },
      body: file,
      credentials: "same-origin",
    });
  } catch {
    throw new PhotoUploadError("Couldn't upload the photo. Check the connection and try again.");
  }
  if (response.status === 403) throw new PhotoUploadError("You don't have permission to add photos.");
  if (response.status === 413 || response.status === 415 || response.status === 422) throw new PhotoUploadError("This file isn't a supported photo (JPEG or PNG, up to 5 MB).");
  if (!response.ok) throw new PhotoUploadError("Couldn't upload the photo. Try again.");
  const body = (await response.json()) as { photoId?: unknown };
  if (typeof body.photoId !== "string") throw new PhotoUploadError("Couldn't upload the photo. Try again.");
  return body.photoId;
}

// ---- errors (api-contract.md "Errors") ----

export type QuotationField = "docDate" | "dueDate" | "customerId" | "shippingAddressId" | "invoiceAddressId" | "currency" | "exchangeRate" | "ref" | "documentNote" | "lines";
export type SaveOutcome = { fieldErrors: { name: QuotationField; message: string }[]; message: string; stale?: boolean; recheckAccess?: boolean };

const HEADER_FIELDS = new Set<string>(["docDate", "dueDate", "customerId", "shippingAddressId", "invoiceAddressId", "currency", "exchangeRate", "ref", "documentNote"]);

export function mapSaveError(error: unknown): SaveOutcome {
  const { domainCode, fieldErrors } = readDomainError(error);
  const onFields = (message: string) => fieldErrors.flatMap((entry) => {
    if (HEADER_FIELDS.has(entry.path)) return [{ name: entry.path as QuotationField, message: entry.code === "required" ? "Required" : message }];
    if (entry.path.startsWith("lines")) return [{ name: "lines" as const, message: `Check item row ${Number(entry.path.split(".")[1] ?? 0) + 1}` }];
    return [];
  });
  switch (domainCode) {
    case "QUOTATION_REFERENCE_INVALID":
      return { fieldErrors: onFields("Choose an active option"), message: "A selected customer, address or stone code is no longer available." };
    case "QUOTATION_PHOTO_INVALID":
      return { fieldErrors: onFields("Check the photos"), message: "A photo couldn't be used. Remove it and add it again." };
    case "QUOTATION_CHANGED":
      return { fieldErrors: [], message: "Someone else changed this quotation. Refresh to see the latest.", stale: true };
    case "QUOTATION_STATUS_INVALID":
      return { fieldErrors: [], message: "This quotation can't be changed in its current status.", stale: true };
    case "QUOTATION_NOT_FOUND":
      return { fieldErrors: [], message: "This quotation no longer exists." };
    case "VALIDATION_ERROR": {
      const mapped = onFields("Check this field");
      return { fieldErrors: mapped, message: "Some details couldn't be saved. Check the form and try again." };
    }
    case "PERMISSION_DENIED":
      return { fieldErrors: [], message: "You don't have permission to do this. Nothing was saved.", recheckAccess: true };
    default:
      if (isCallerLicenseCode(domainCode)) return { fieldErrors: [], message: "Your license doesn't allow this right now. Nothing was saved." };
      if (domainCode === "UNAUTHORIZED") return { fieldErrors: [], message: "Your session has ended. Sign in again." };
      return { fieldErrors: [], message: "Couldn't save. Try again." };
  }
}

export function loadErrorMessage(error: unknown): string {
  const { domainCode } = readDomainError(error);
  if (domainCode === "QUOTATION_NOT_FOUND") return "This quotation no longer exists.";
  if (domainCode === "PERMISSION_DENIED") return "You don't have permission to view quotations.";
  if (isCallerLicenseCode(domainCode)) return "Your license doesn't allow opening quotations right now.";
  if (domainCode === "UNAUTHORIZED") return "Your session has ended. Sign in again.";
  return "Couldn't load this quotation. Try again.";
}

// ---- From Stock (disabled until the inventory service exists, SA-QT-13) ----

export type StockFilter = { search: string; from: string; to: string };

export async function searchAvailableStock(filter: StockFilter): Promise<StockItem[]> {
  const q = filter.search.trim().toLowerCase();
  return stockItems.filter((item) => {
    if (q && ![item.stoneCode, item.stockId, item.lot, item.stone].some((v) => v.toLowerCase().includes(q))) return false;
    if (filter.from && item.loadedAt < filter.from) return false;
    if (filter.to && item.loadedAt > filter.to) return false;
    return true;
  });
}
