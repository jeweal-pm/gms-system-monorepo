"use client";

import { keepPreviousData, useQuery, useQueryClient } from "@tanstack/react-query";
import { useCallback } from "react";
import { INVENTORY_QUERY_KEY } from "@/features/inventory/query-keys";
import { useMemoOutstandingAccess } from "@/features/memo-outstanding-vendor/api";
import { inventoryRequest, type InventoryClientDeps } from "@/lib/inventory-client";
import { isCallerLicenseCode, readDomainError, retryTransient } from "@/lib/trpc-error";
import { STOCK_CARD_MENU_KEY, toQuery, type ListState, type TxnState } from "./model";
import { cardHeaderSchema, cardsPageSchema, optionsSchema, transactionsPageSchema } from "./types";

/**
 * stock-card FE-SC-004/005/006 (SA revision 1 api-contract, ADR-0056): the read-only Stock Card calls on the inventory
 * REST client (`/api/inventory/v1/stock-card`) and their TanStack Query hooks. Components use only this module and
 * model.ts. No mock data: until the service answers, every hook shows its loading / error state.
 */

const KEY = [...INVENTORY_QUERY_KEY, "stock-card"] as const;
export const stockCardKeys = {
  all: KEY,
  options: () => [...KEY, "options"] as const,
  list: (state: ListState) => [...KEY, "list", state] as const,
  header: (cardKey: string) => [...KEY, "header", cardKey] as const,
  txn: (cardKey: string, state: TxnState) => [...KEY, "txn", cardKey, state] as const,
};

const base = "/stock-card";
const cardPath = (cardKey: string) => `${base}/cards/${encodeURIComponent(cardKey)}`;

/** The raw calls (one per contract route). `deps` lets the tests use a controlled fetch. */
export function stockCardCalls(deps: InventoryClientDeps = {}) {
  return {
    options: () => inventoryRequest(`${base}/options`, { schema: optionsSchema }, deps),
    cards: (state: ListState, signal?: AbortSignal) => inventoryRequest(`${base}/cards`, { query: toQuery(state), schema: cardsPageSchema, signal }, deps),
    header: (cardKey: string, signal?: AbortSignal) => inventoryRequest(cardPath(cardKey), { schema: cardHeaderSchema, signal }, deps),
    transactions: (cardKey: string, state: TxnState, signal?: AbortSignal) =>
      inventoryRequest(`${cardPath(cardKey)}/transactions`, { query: toQuery(state), schema: transactionsPageSchema, signal }, deps),
  };
}

export const stockCardApi = stockCardCalls();

// ---- permissions (UX only; the server checks stock-card:VIEW on every call) ----

export const useStockCardAccess = () => useMemoOutstandingAccess(STOCK_CARD_MENU_KEY);

// ---- hooks ----

const reads = { retry: retryTransient } as const;

export function useStockCardOptions(enabled: boolean) {
  return useQuery({ queryKey: stockCardKeys.options(), queryFn: () => stockCardApi.options(), staleTime: 60_000, enabled, ...reads });
}

/** List page: 30 s fresh, the previous page stays visible while the next one loads. A reversed date range is not sent. */
export function useStockCards(state: ListState, enabled: boolean) {
  return useQuery({
    queryKey: stockCardKeys.list(state),
    queryFn: ({ signal }) => stockCardApi.cards(state, signal),
    staleTime: 30_000,
    placeholderData: keepPreviousData,
    enabled,
    ...reads,
  });
}

export function useStockCardHeader(cardKey: string, enabled: boolean) {
  return useQuery({ queryKey: stockCardKeys.header(cardKey), queryFn: ({ signal }) => stockCardApi.header(cardKey, signal), staleTime: 30_000, enabled, ...reads });
}

export function useStockCardTransactions(cardKey: string, state: TxnState, enabled: boolean) {
  return useQuery({
    queryKey: stockCardKeys.txn(cardKey, state),
    queryFn: ({ signal }) => stockCardApi.transactions(cardKey, state, signal),
    staleTime: 30_000,
    placeholderData: keepPreviousData,
    enabled,
    ...reads,
  });
}

/** Refresh: drop every Stock Card read (list, header, transactions, options) and fetch the visible ones again. */
export function useRefreshStockCard() {
  const client = useQueryClient();
  return useCallback(() => client.invalidateQueries({ queryKey: stockCardKeys.all }), [client]);
}

// ---- errors (frontend error-handling, backend error-handling) ----

export const isPermissionDenied = (error: unknown) => readDomainError(error).domainCode === "PERMISSION_DENIED";

/** The key is unknown, malformed or its stock is gone: the server answers all three the same way. */
export const isCardMissing = (error: unknown) => {
  const { domainCode, httpStatus } = readDomainError(error);
  return domainCode === "STOCK_CARD_NOT_FOUND" || domainCode === "NOT_FOUND" || httpStatus === 404;
};

export const LIST_ERROR = "Couldn't load Stock Card.";
export const TXN_ERROR = "Couldn't load transactions.";
export const CARD_MISSING = "This stock card no longer exists.";

/** Inline banner text of a failed read; PERMISSION_DENIED is shown as the no-access text instead. Never an id or a stack. */
export function loadErrorMessage(error: unknown, fallback: string = LIST_ERROR): string {
  const { domainCode } = readDomainError(error);
  if (domainCode === "UNAUTHORIZED") return "Your session has ended. Sign in again.";
  if (domainCode === "AUTHORIZATION_UNAVAILABLE" || domainCode === "AUTH_UNAVAILABLE") return "Couldn't check your access right now. Try again.";
  if (isCallerLicenseCode(domainCode)) return "Your license doesn't allow this page right now.";
  if (domainCode === "VALIDATION_ERROR") return "Some filters aren't valid. Check them and try again.";
  if (domainCode === "STOCK_CARD_TOO_LARGE") return "Too many transactions; narrow the date range.";
  if (domainCode === "STOCK_CARD_TIMEOUT") return "Took too long. Narrow the date range or search.";
  if (domainCode === "STOCK_CARD_BUSY") return "The report is busy right now. Try again in a moment.";
  if (domainCode === "SERVICE_UNAVAILABLE" || domainCode === "NETWORK_ERROR") return `${fallback} The inventory service can't be reached.`;
  return fallback;
}
