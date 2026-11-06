/**
 * Purchase Order data access (purchase-order UI rev 1 + SA rev 1, ADR-0041): `purchaseOrder.*` on the master tRPC router
 * plus the binary line-photo route. `purchaseOrder.options` gives the vendors, currencies, numbering state and stone
 * lists with codes in one call; exchange rates come from `currency.options`, which the backend grants to
 * `purchase-order:VIEW`. Components use only this file.
 */
import { skipToken } from "@tanstack/react-query";
import type { InferQueryLikeData } from "@trpc/react-query/shared";
import { useCallback } from "react";
import { partnerAccess, type PartnerAccess, type PermissionMine } from "@/features/partner/access";
import { fromTradeDocument, toTradeDocumentInput, uploadLinePhoto, type QuotationDetail } from "@/features/quotation/api";
import type { StoneChoices } from "@/features/quotation/document-kind";
import { authTrpc } from "@/lib/auth-trpc";
import { masterTrpc } from "@/lib/master-trpc";
import { daybookInput, daybookQueryOptions, deletedMessage, mapDocumentRestoreError } from "@/features/trade-document/document-api";
import { isCallerLicenseCode, readDomainError, retryTransient } from "@/lib/trpc-error";
import type { PurchaseOrderFormValues, PurchaseOrderStatus } from "./schema";

export type PurchaseOrderDetail = InferQueryLikeData<typeof masterTrpc.purchaseOrder.get>;
export type PurchaseOrderOptions = InferQueryLikeData<typeof masterTrpc.purchaseOrder.options>;
export type PurchaseOrderInput = ReturnType<typeof toPurchaseOrderInput>;

export const PURCHASE_ORDER_MENU = "purchase-order";
const HEADER_FIELDS = ["docDate", "dueDate", "vendorId", "addressId", "currency", "exchangeRate", "ref", "documentNote"] as const;

// ---- permissions (UX only; the server checks every call) ----

export type PurchaseOrderAccess = PartnerAccess & { approve: boolean };

export function purchaseOrderAccess(mine: PermissionMine): PurchaseOrderAccess {
  const approve = mine.isSuperAdmin || mine.permissions === "ALL" || mine.permissions.includes(`${PURCHASE_ORDER_MENU}:APPROVE`);
  return { ...partnerAccess(mine, PURCHASE_ORDER_MENU), approve };
}

export function usePurchaseOrderAccess(): PurchaseOrderAccess | undefined {
  const mine = authTrpc.permission.mine.useQuery(undefined, { staleTime: 30_000, retry: false });
  return mine.data ? purchaseOrderAccess(mine.data) : undefined;
}

// ---- photos (REST, SA-PO-11) ----

export const PURCHASE_ORDER_PHOTO_ROUTE = "/api/v1/purchase-order/photos";
/** Read link of a Purchase Order line photo (purchase-order VIEW, immutable cache). */
export const purchaseOrderPhotoUrl = (id: string) => `${PURCHASE_ORDER_PHOTO_ROUTE}/${encodeURIComponent(id)}`;
/** Uploads one JPEG/PNG ≤ 5 MB (purchase-order ADD or EDIT); returns its photo id. Same checks and messages as Quotation. */
export const uploadPurchaseOrderPhoto = (file: File): Promise<string> => uploadLinePhoto(PURCHASE_ORDER_PHOTO_ROUTE, file);

// ---- form ↔ contract ----

/**
 * Form values → contract input: the shared keyed-in lines (MANUAL, stone code, location, photos in order; empty rows
 * dropped) and the vendor. A PO never sends From Stock fields (Q-PO-05).
 */
export function toPurchaseOrderInput(values: PurchaseOrderFormValues) {
  return { ...toTradeDocumentInput(values), vendorId: values.vendorId, addressId: values.addressId };
}

/** Saved purchase order → form values (rows keep the server line id as their key). */
export function fromPurchaseOrder(detail: PurchaseOrderDetail): PurchaseOrderFormValues {
  const shared = fromTradeDocument(detail as unknown as QuotationDetail, purchaseOrderPhotoUrl);
  return { ...shared, status: detail.status, vendorId: detail.vendorId, addressId: detail.addressId ?? "" };
}

/** Stone lists with stone codes for the row panel's Stone Code field (SA-PO-10). */
export function stoneChoices(options: PurchaseOrderOptions | undefined): StoneChoices | undefined {
  return options?.stone as StoneChoices | undefined;
}

// ---- errors (SA-PO-14) ----

export type PurchaseOrderOutcome = {
  fieldErrors: { name: string; message: string }[];
  message: string;
  /** Load the saved document again (it was approved elsewhere). */
  reload: boolean;
  /** The document is gone: leave for a new one. */
  gone: boolean;
};

const rowOf = (path: string) => Number(path.split(".")[1] ?? 0) + 1;

export function mapPurchaseOrderError(error: unknown): PurchaseOrderOutcome {
  const { domainCode, fieldErrors } = readDomainError(error);
  const outcome = (message: string, extra: Partial<PurchaseOrderOutcome> = {}): PurchaseOrderOutcome => ({ fieldErrors: [], message, reload: false, gone: false, ...extra });
  const onFields = (message: string) => fieldErrors.flatMap((entry) => {
    if ((HEADER_FIELDS as readonly string[]).includes(entry.path)) return [{ name: entry.path, message: entry.code === "required" ? "Required" : message }];
    if (entry.path.startsWith("lines.")) return [{ name: "lines", message: `Check item row ${rowOf(entry.path)}` }];
    return [];
  });
  const firstRow = fieldErrors.find((entry) => entry.path.startsWith("lines."));
  switch (domainCode) {
    case "VALIDATION_ERROR": {
      const gross = fieldErrors.find((entry) => entry.code === "exceeds_gross");
      if (gross) return outcome(`Row ${rowOf(gross.path)}: the discount is more than the line amount.`, { fieldErrors: onFields("Check this field") });
      if (fieldErrors.some((entry) => entry.code === "exceeds_subtotal")) return outcome("The document discount is more than the subtotal.");
      if (firstRow) return outcome(`Row ${rowOf(firstRow.path)}: check this item.`, { fieldErrors: onFields("Check this field") });
      return outcome("Some details couldn't be saved. Check the form and try again.", { fieldErrors: onFields("Check this field") });
    }
    case "PURCHASE_ORDER_REFERENCE_INVALID":
      if (firstRow) return outcome(`Row ${rowOf(firstRow.path)}: this stone code is no longer available.`, { fieldErrors: onFields("Choose an active option") });
      return outcome("A selected vendor, address or currency is no longer available.", { fieldErrors: onFields("Choose an active option") });
    case "PURCHASE_ORDER_PHOTO_INVALID":
      return outcome(firstRow ? `Row ${rowOf(firstRow.path)}: a photo couldn't be used. Remove it and add it again.` : "A photo couldn't be used. Remove it and add it again.", { fieldErrors: onFields("Check the photos") });
    case "PURCHASE_ORDER_NOT_FOUND":
      return outcome("This purchase order no longer exists.", { gone: true });
    case "PURCHASE_ORDER_DELETED":
      // transaction-soft-delete FE-SD-003: deleted elsewhere; reload it read-only with the banner.
      return outcome(deletedMessage("purchase order"), { reload: true });
    case "PURCHASE_ORDER_CHANGED":
      return outcome("This purchase order was changed by someone else. Reload to see the latest.");
    case "PURCHASE_ORDER_STATUS_INVALID":
      return outcome("This purchase order is already approved.", { reload: true });
    case "PERMISSION_DENIED":
      return outcome("You don't have permission to do this. Nothing was saved.");
    case "CSRF_INVALID":
      return outcome("Your session needs a refresh. Reload the page and try again.");
    case "UNAUTHORIZED":
      return outcome("Your session has ended. Sign in again.");
    case "AUTHORIZATION_UNAVAILABLE":
      return outcome("Couldn't check your access right now. Try again.");
    default:
      if (isCallerLicenseCode(domainCode)) return outcome("Your license doesn't allow this right now. Nothing was saved.");
      return outcome("Couldn't save. Try again.");
  }
}

export function purchaseOrderLoadError(error: unknown, what = "this purchase order"): string {
  const { domainCode } = readDomainError(error);
  if (domainCode === "PURCHASE_ORDER_NOT_FOUND") return "This purchase order no longer exists.";
  if (domainCode === "PERMISSION_DENIED") return "You don't have permission to view purchase orders.";
  if (isCallerLicenseCode(domainCode)) return "Your license doesn't allow opening purchase orders right now.";
  if (domainCode === "UNAUTHORIZED") return "Your session has ended. Sign in again.";
  return `Couldn't load ${what}. Try again.`;
}

/** transaction-soft-delete FE-SD-003: Restore errors (not deleted any more, changed, gone). */
export const purchaseOrderRestoreError = (error: unknown) => mapDocumentRestoreError(error, "PURCHASE_ORDER", "purchase order");

// ---- reads ----

export function usePurchaseOrderDetail(id: string | null) {
  return masterTrpc.purchaseOrder.get.useQuery(id === null ? skipToken : { id }, { staleTime: 30_000, retry: retryTransient });
}

/** FE-SD-001: the daybook's active or deleted purchase orders, newest first, 50 a page; a new view starts on page one. */
export function usePurchaseOrderDaybook() {
  return masterTrpc.purchaseOrder.list.useInfiniteQuery(daybookInput(), daybookQueryOptions);
}

/** Vendors, currencies, numbering state and stone lists; `vendorId` keeps a saved, now inactive vendor listed. */
export function usePurchaseOrderOptions(vendorId: string | undefined) {
  return masterTrpc.purchaseOrder.options.useQuery(vendorId ? { vendorId } : {}, { staleTime: 60_000, retry: retryTransient });
}

/** Number preview for a new document (Document Setup › Purchase Order). */
export function useNextPurchaseOrderNo(docDate: string, isNew: boolean) {
  return masterTrpc.purchaseOrder.nextNumber.useQuery(isNew && /^\d{4}-\d{2}-\d{2}$/.test(docDate) ? { docDate } : skipToken, { staleTime: 10_000, retry: retryTransient });
}

// ---- writes ----

export function usePurchaseOrderWrites() {
  const utils = masterTrpc.useUtils();
  const writes = { retry: false, gcTime: 0 } as const;
  const create = masterTrpc.purchaseOrder.create.useMutation(writes);
  const update = masterTrpc.purchaseOrder.update.useMutation(writes);
  const remove = masterTrpc.purchaseOrder.delete.useMutation(writes);
  const approve = masterTrpc.purchaseOrder.approve.useMutation(writes);
  const restore = masterTrpc.purchaseOrder.restore.useMutation(writes);
  const invalidate = useCallback(
    () => Promise.all([utils.purchaseOrder.list.invalidate(), utils.purchaseOrder.get.invalidate(), utils.purchaseOrder.nextNumber.invalidate()]),
    [utils],
  );
  /** The latest saved document, straight from the server. */
  const reload = useCallback(async (id: string) => {
    await invalidate();
    return utils.purchaseOrder.get.fetch({ id }, { staleTime: 0 });
  }, [invalidate, utils]);
  return {
    create: create.mutateAsync,
    update: update.mutateAsync,
    remove: remove.mutateAsync,
    approve: approve.mutateAsync,
    restore: restore.mutateAsync,
    invalidate,
    reload,
    busy: create.isPending || update.isPending || remove.isPending || approve.isPending || restore.isPending,
  };
}

export const isPendingApproval = (status: PurchaseOrderStatus | undefined) => status === "PENDING_APPROVAL";
