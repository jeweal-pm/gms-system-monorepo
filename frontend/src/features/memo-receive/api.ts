/**
 * Memo Receive data access (ADR-0033 D1). Real reads from the existing master APIs — vendors, currencies,
 * stone master, Document Setup — each under its own permission; Memo Receive documents themselves come
 * from the mock store until the Memo Receive API exists. Components use only this file.
 */
import { skipToken, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useCallback, useMemo } from "react";
import { partnerAccess, type PartnerAccess } from "@/features/partner/access";
import { PhotoUploadError, PHOTO_MAX_BYTES, PHOTO_TYPES } from "@/features/quotation/api";
import type { StoneChoices } from "@/features/quotation/document-kind";
import type { PhotoRef } from "@/features/quotation/schema";
import { sizePartCode } from "@/features/stone-master/stone-code";
import { authTrpc } from "@/lib/auth-trpc";
import { masterTrpc } from "@/lib/master-trpc";
import { readDomainError, retryTransient } from "@/lib/trpc-error";
import type { NumberingRow } from "./numbering";
import type { MemoReceiveFormValues } from "./schema";
import {
  createMemoReceive,
  deleteMemoReceive,
  getMemoReceive,
  listMemoReceives,
  MemoReceiveError,
  previewDocNo,
  updateMemoReceive,
} from "./store";

export const MEMO_RECEIVE_MENU = "memo-receive";
const VENDOR_PAGE = 50;

// ---- permissions (UX only; the future Memo Receive API checks every call) ----

export function useMemoReceiveAccess(): PartnerAccess | undefined {
  const mine = authTrpc.permission.mine.useQuery(undefined, { staleTime: 30_000, retry: false });
  return mine.data ? partnerAccess(mine.data, MEMO_RECEIVE_MENU) : undefined;
}

/** Short, field-level text for a master list that can't load (ADR-0033 D1: no mock in its place). */
export function masterLoadMessage(error: unknown, what: string): string {
  const { domainCode } = readDomainError(error);
  if (domainCode === "PERMISSION_DENIED") return `You don't have permission to view ${what}.`;
  if (domainCode === "UNAUTHORIZED") return "Your session has ended. Sign in again.";
  return `Couldn't load ${what}. Try again.`;
}

// ---- vendors (Setup › Vendor) ----

export type VendorChoice = { id: string; label: string };
export type VendorAddress = { id: string; label: string; isDefault: boolean };

/** Active vendors, first 50 by name (vendor.list keyset page). */
export function useVendorChoices() {
  return masterTrpc.vendor.list.useQuery(
    { active: true, limit: VENDOR_PAGE },
    { staleTime: 60_000, retry: retryTransient, select: (page) => page.items.map((v) => ({ id: v.id, label: v.code ? `${v.code} · ${v.name}` : v.name })) },
  );
}

/** One vendor with its addresses and currency, for the Address select and defaults (Q-MR-06). */
export function useVendor(id: string) {
  return masterTrpc.vendor.get.useQuery(id ? { id } : skipToken, {
    staleTime: 60_000,
    retry: retryTransient,
    select: (vendor) => ({
      id: vendor.id,
      label: vendor.code ? `${vendor.code} · ${vendor.name}` : vendor.name,
      currencyCode: vendor.currencyCode,
      addresses: vendor.invoiceAddresses.map((a): VendorAddress => ({
        id: a.id,
        label: [a.name, a.address, [a.city, a.state, a.postcode].filter(Boolean).join(" ")].filter(Boolean).join(", "),
        isDefault: a.isDefault,
      })),
    }),
  });
}

export function useFetchVendor() {
  const utils = masterTrpc.useUtils();
  return useCallback((id: string) => utils.vendor.get.fetch({ id }, { staleTime: 60_000 }), [utils]);
}

// ---- currencies (Setup › Currency) ----

export function useCurrencyOptions() {
  return masterTrpc.currency.options.useQuery(undefined, { staleTime: 60_000, retry: retryTransient });
}

// ---- stone master ----

const PART_KINDS = ["stone-name", "shape", "size", "color", "clarity", "cutting", "quality"] as const;
type PartRow = { id: string; code?: string | null; name: string; active?: boolean };
type OptionsData = Partial<Record<"stoneName" | "shape" | "size" | "color" | "clarity" | "cutting" | "quality", PartRow[]>>;

const toChoices = (rows: PartRow[] | undefined) => (rows ?? []).map((row) => ({ name: row.name, code: row.code ?? sizePartCode(row.name) }));

/**
 * Row panel stone choices in the `quotation.options` shape, from `stoneMaster.options`. Memo Receive has no
 * Stone Code (owner 2026-10-28, rev 2), so no codes are loaded.
 */
export function useStoneChoices() {
  const options = masterTrpc.stoneMaster.options.useQuery({ kinds: [...PART_KINDS], include: [] }, { staleTime: 60_000, retry: retryTransient });
  const data = options.data as OptionsData | undefined;

  const stone = useMemo((): StoneChoices | undefined => {
    if (!data) return undefined;
    return {
      codes: [],
      stones: toChoices(data.stoneName),
      shapes: toChoices(data.shape),
      sizes: toChoices(data.size),
      colors: toChoices(data.color),
      clarities: toChoices(data.clarity),
      cuttings: toChoices(data.cutting),
      qualities: toChoices(data.quality),
    };
  }, [data]);

  return { stone, error: options.error };
}

// ---- numbering (Setup › Document Setup, Q-MR-02) ----

export function useNumberingRows() {
  return masterTrpc.documentSetup.get.useQuery({ transactionKey: "memo-receive" as never }, {
    staleTime: 30_000,
    retry: retryTransient,
    select: (result) => ((result as { setup: { rows: NumberingRow[] } | null }).setup?.rows ?? []).map(({ id, effectiveDate, prefix, separator, startNo }) => ({ id, effectiveDate, prefix, separator, startNo })),
  });
}

export { previewDocNo };

// ---- documents (mock store) ----

const keys = {
  all: ["memo-receive"] as const,
  list: ["memo-receive", "list"] as const,
  detail: (id: string) => ["memo-receive", "detail", id] as const,
};

export function useMemoReceiveList() {
  return useQuery({ queryKey: keys.list, queryFn: listMemoReceives, staleTime: 10_000 });
}

export function useMemoReceiveDetail(id: string | null) {
  return useQuery({ queryKey: keys.detail(id ?? ""), queryFn: () => getMemoReceive(id ?? ""), enabled: id !== null, staleTime: 10_000 });
}

export function useMemoReceiveMutations() {
  const client = useQueryClient();
  const invalidate = () => client.invalidateQueries({ queryKey: keys.all });
  return {
    create: useMutation({ mutationFn: (input: { values: MemoReceiveFormValues; rows: NumberingRow[]; vendorName: string }) => createMemoReceive(input.values, input.rows, input.vendorName) }),
    update: useMutation({ mutationFn: (input: { id: string; values: MemoReceiveFormValues; vendorName: string }) => updateMemoReceive(input.id, input.values, input.vendorName) }),
    remove: useMutation({ mutationFn: (id: string) => deleteMemoReceive(id) }),
    invalidate,
  };
}

export const saveErrorMessage = (error: unknown) => (error instanceof MemoReceiveError ? error.message : "Couldn't save. Try again.");

// ---- photos (memory only in revision 1) ----

/** Checks a JPEG/PNG ≤ 5 MB and keeps it for this page session only (ADR-0033 D1). */
export async function keepPhotoInMemory(file: File): Promise<PhotoRef> {
  if (!(PHOTO_TYPES as readonly string[]).includes(file.type)) throw new PhotoUploadError("Use a JPEG or PNG photo.");
  if (file.size > PHOTO_MAX_BYTES) throw new PhotoUploadError("Photos can be up to 5 MB.");
  return { id: crypto.randomUUID(), name: file.name, url: URL.createObjectURL(file) };
}
