/**
 * Memo Receive data access (memo-receive UI rev 3/4 + SA rev 1/2, ADR-0034): `memoReceive.*` on the master tRPC router
 * plus the binary line-photo route (SA revision 2).
 * `memoReceive.options` gives the vendors, currencies, numbering state and stone lists in one call (it replaces the
 * vendor, stone master and Document Setup reads); exchange rates still come from `currency.options`, which the
 * backend grants to `memo-receive:VIEW`. Components use only this file.
 */
import { skipToken } from "@tanstack/react-query";
import type { InferQueryLikeData } from "@trpc/react-query/shared";
import { useCallback } from "react";
import { partnerAccess, type PartnerAccess, type PermissionMine } from "@/features/partner/access";
import { fromTradeDocument, toTradeDocumentInput, uploadLinePhoto, type QuotationDetail } from "@/features/quotation/api";
import type { StoneChoices } from "@/features/quotation/document-kind";
import { isFilledLine } from "@/features/quotation/schema";
import { authTrpc } from "@/lib/auth-trpc";
import { masterTrpc } from "@/lib/master-trpc";
import { isCallerLicenseCode, readDomainError, retryTransient } from "@/lib/trpc-error";
import type { MemoReceiveFormValues, MemoReceiveStatus } from "./schema";

export type MemoReceiveDetail = InferQueryLikeData<typeof masterTrpc.memoReceive.get>;
export type MemoReceiveOptions = InferQueryLikeData<typeof masterTrpc.memoReceive.options>;
export type MemoReceiveInput = ReturnType<typeof toMemoReceiveInput>;

export const MEMO_RECEIVE_MENU = "memo-receive";
/** The mock store of rev 1/2 (ADR-0033 D1); removed from the browser on load (rev 3). */
export const LEGACY_STORAGE_KEY = "gms.memo-receive.v1";
const HEADER_FIELDS = ["docDate", "dueDate", "vendorId", "addressId", "currency", "exchangeRate", "ref", "documentNote"] as const;

// ---- permissions (UX only; the server checks every call) ----

export type MemoReceiveAccess = PartnerAccess & { approve: boolean };

export function memoReceiveAccess(mine: PermissionMine): MemoReceiveAccess {
  const approve = mine.isSuperAdmin || mine.permissions === "ALL" || mine.permissions.includes(`${MEMO_RECEIVE_MENU}:APPROVE`);
  return { ...partnerAccess(mine, MEMO_RECEIVE_MENU), approve };
}

export function useMemoReceiveAccess(): MemoReceiveAccess | undefined {
  const mine = authTrpc.permission.mine.useQuery(undefined, { staleTime: 30_000, retry: false });
  return mine.data ? memoReceiveAccess(mine.data) : undefined;
}

/** Rev 3: forget the old browser-only memo receives. Storage may be blocked; nothing else depends on it. */
export function removeLegacyStore(storage: Pick<Storage, "removeItem"> | undefined = typeof window === "undefined" ? undefined : window.localStorage) {
  try {
    storage?.removeItem(LEGACY_STORAGE_KEY);
  } catch {
    // Blocked storage: there is nothing to remove.
  }
}

// ---- photos (REST, SA revision 2: SA-MR-15/16) ----

export const MEMO_RECEIVE_PHOTO_ROUTE = "/api/v1/memo-receive/photos";
/** Read link of a Memo Receive line photo (memo-receive VIEW, immutable cache). */
export const memoReceivePhotoUrl = (id: string) => `${MEMO_RECEIVE_PHOTO_ROUTE}/${encodeURIComponent(id)}`;
/** Uploads one JPEG/PNG ≤ 5 MB (memo-receive ADD or EDIT); returns its photo id. Same checks and messages as Quotation. */
export const uploadMemoReceivePhoto = (file: File): Promise<string> => uploadLinePhoto(MEMO_RECEIVE_PHOTO_ROUTE, file);

// ---- form ↔ contract ----

/**
 * Form values → contract input. Empty rows are dropped; a row loaded from the server sends its `id` so it keeps its
 * Stock ID (SA-MR-04), a new row sends none. No Stone Code id, no Location (rev 3); each row sends its photo ids in
 * order, the main photo first (rev 4, SA-MR-17).
 */
export function toMemoReceiveInput(values: MemoReceiveFormValues, savedLineIds: ReadonlySet<string> = new Set()) {
  const shared = toTradeDocumentInput(values);
  // toTradeDocumentInput keeps the filled rows in order, so the n-th input line is the n-th filled row.
  const keys = values.lines.filter(isFilledLine).map((line) => line.key);
  return {
    ...shared,
    lines: shared.lines.map((line, index) => {
      const key = keys[index];
      return {
        source: line.source, stoneCode: line.stoneCode, stone: line.stone, shape: line.shape, size: line.size, color: line.color,
        clarity: line.clarity, cutting: line.cutting, quality: line.quality, lot: line.lot, cerType: line.cerType, cerNo: line.cerNo,
        pcs: line.pcs, weightCt: line.weightCt, priceUnit: line.priceUnit, unitPrice: line.unitPrice, discount: line.discount,
        itemNote: line.itemNote, photoIds: line.photoIds,
        ...(key !== undefined && savedLineIds.has(key) ? { id: key } : {}),
      };
    }),
    vendorId: values.vendorId,
    addressId: values.addressId,
  };
}

/** Saved memo receive → form values; each row keeps its server line id as its key and shows its Stock ID and photos. */
export function fromMemoReceive(detail: MemoReceiveDetail): MemoReceiveFormValues {
  const asTrade = { ...detail, lines: detail.lines.map((line) => ({ ...line, stoneCodeId: null, location: "" })) } as unknown as QuotationDetail;
  const shared = fromTradeDocument(asTrade, memoReceivePhotoUrl);
  return {
    ...shared,
    status: detail.status,
    vendorId: detail.vendorId,
    addressId: detail.addressId ?? "",
    lines: shared.lines.map((line, index) => ({ ...line, stockId: detail.lines[index]?.stockId ?? "" })),
  };
}

/** Server line ids of a saved document (the form keys of its rows). */
export const savedLineIds = (detail: MemoReceiveFormValues | undefined) => new Set(detail?.id ? detail.lines.map((line) => line.key) : []);

/** Stone lists for the row panel; Memo Receive has no Stone Code (rev 2), so there are no codes. */
export function stoneChoices(options: MemoReceiveOptions | undefined): StoneChoices | undefined {
  return options ? ({ ...options.stone, codes: [] } as StoneChoices) : undefined;
}

// ---- errors (error-handling.md, SA rev 1) ----

export type MemoReceiveOutcome = {
  fieldErrors: { name: string; message: string }[];
  message: string;
  /** Load the saved document again (it changed or was approved elsewhere). */
  reload: boolean;
  /** The document is gone: leave for a new one. */
  gone: boolean;
};

export function mapMemoReceiveError(error: unknown): MemoReceiveOutcome {
  const { domainCode, fieldErrors } = readDomainError(error);
  const outcome = (message: string, extra: Partial<MemoReceiveOutcome> = {}): MemoReceiveOutcome => ({ fieldErrors: [], message, reload: false, gone: false, ...extra });
  const onFields = (message: string) => fieldErrors.flatMap((entry) => {
    if ((HEADER_FIELDS as readonly string[]).includes(entry.path)) return [{ name: entry.path, message: entry.code === "required" ? "Required" : message }];
    if (entry.path.startsWith("lines.")) return [{ name: "lines", message: `Check item row ${Number(entry.path.split(".")[1] ?? 0) + 1}` }];
    return [];
  });
  switch (domainCode) {
    case "VALIDATION_ERROR": {
      if (fieldErrors.some((entry) => entry.code === "unknown_line")) return outcome("An item of this memo receive changed. Refresh to see the latest.");
      const gross = fieldErrors.find((entry) => entry.code === "exceeds_gross");
      if (gross) return outcome(`Item row ${Number(gross.path.split(".")[1] ?? 0) + 1}: the discount is more than the line amount.`, { fieldErrors: onFields("Check this field") });
      if (fieldErrors.some((entry) => entry.code === "exceeds_subtotal")) return outcome("The document discount is more than the subtotal.");
      return outcome("Some details couldn't be saved. Check the form and try again.", { fieldErrors: onFields("Check this field") });
    }
    case "MEMO_RECEIVE_REFERENCE_INVALID":
      return outcome("A selected vendor, address or currency is no longer available.", { fieldErrors: onFields("Choose an active option") });
    case "MEMO_RECEIVE_PHOTO_INVALID":
      return outcome("A photo couldn't be used. Remove it and add it again.", { fieldErrors: onFields("Check the photos") });
    case "MEMO_RECEIVE_NOT_FOUND":
      return outcome("This Memo Receive no longer exists.", { gone: true });
    case "MEMO_RECEIVE_CHANGED":
      return outcome("Someone changed this document. Refresh to see the latest.");
    case "MEMO_RECEIVE_STATUS_INVALID":
      return outcome("Already approved", { reload: true });
    case "MEMO_RECEIVE_STOCK_ID_EXHAUSTED":
      return outcome("Stock ID limit reached for this year. Contact the administrator.");
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

export function memoReceiveLoadError(error: unknown, what = "this memo receive"): string {
  const { domainCode } = readDomainError(error);
  if (domainCode === "MEMO_RECEIVE_NOT_FOUND") return "This Memo Receive no longer exists.";
  if (domainCode === "PERMISSION_DENIED") return "You don't have permission to view memo receives.";
  if (isCallerLicenseCode(domainCode)) return "Your license doesn't allow opening memo receives right now.";
  if (domainCode === "UNAUTHORIZED") return "Your session has ended. Sign in again.";
  return `Couldn't load ${what}. Try again.`;
}

// ---- reads ----

export function useMemoReceiveDetail(id: string | null) {
  return masterTrpc.memoReceive.get.useQuery(id === null ? skipToken : { id }, { staleTime: 30_000, retry: retryTransient });
}

export function useMemoReceiveDaybook() {
  return masterTrpc.memoReceive.list.useQuery({ limit: 50 }, { staleTime: 15_000, retry: retryTransient });
}

/** Vendors, currencies, numbering state and stone lists; `vendorId` keeps a saved, now inactive vendor listed. */
export function useMemoReceiveOptions(vendorId: string | undefined) {
  return masterTrpc.memoReceive.options.useQuery(vendorId ? { vendorId } : {}, { staleTime: 60_000, retry: retryTransient });
}

/** Exchange rates (Setup › Currency, read-only here). */
export function useCurrencyRates() {
  return masterTrpc.currency.options.useQuery(undefined, { staleTime: 60_000, retry: retryTransient });
}

/** Number preview for a new document (Document Setup › Memo Receive). */
export function useNextMemoReceiveNo(docDate: string, isNew: boolean) {
  return masterTrpc.memoReceive.nextNumber.useQuery(isNew && /^\d{4}-\d{2}-\d{2}$/.test(docDate) ? { docDate } : skipToken, { staleTime: 10_000, retry: retryTransient });
}

// ---- writes ----

export function useMemoReceiveWrites() {
  const utils = masterTrpc.useUtils();
  const writes = { retry: false, gcTime: 0 } as const;
  const create = masterTrpc.memoReceive.create.useMutation(writes);
  const update = masterTrpc.memoReceive.update.useMutation(writes);
  const remove = masterTrpc.memoReceive.delete.useMutation(writes);
  const approve = masterTrpc.memoReceive.approve.useMutation(writes);
  const invalidate = useCallback(
    () => Promise.all([utils.memoReceive.list.invalidate(), utils.memoReceive.get.invalidate(), utils.memoReceive.nextNumber.invalidate()]),
    [utils],
  );
  /** The latest saved document, straight from the server. */
  const reload = useCallback(async (id: string) => {
    await invalidate();
    return utils.memoReceive.get.fetch({ id }, { staleTime: 0 });
  }, [invalidate, utils]);
  return {
    create: create.mutateAsync,
    update: update.mutateAsync,
    remove: remove.mutateAsync,
    approve: approve.mutateAsync,
    invalidate,
    reload,
    busy: create.isPending || update.isPending || remove.isPending || approve.isPending,
  };
}

export const isPendingApproval = (status: MemoReceiveStatus | undefined) => status === "PENDING_APPROVAL";
