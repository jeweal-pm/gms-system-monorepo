"use client";

import { useQueryClient, type QueryClient } from "@tanstack/react-query";
import { getQueryKey } from "@trpc/react-query";
import { createContext, useContext, useEffect, useMemo, type ReactNode } from "react";
import { masterTrpc } from "@/lib/master-trpc";
import {
  DEFAULT_DECIMAL_PLACES,
  formatMoney,
  formatUnitPrice,
  formatWeight,
  priceInputDecimals,
  weightInputDecimals,
  type DecimalPlaces,
} from "@/lib/number-format";
import { DECIMAL_SETUP_STALE_MS, placesFrom, removeLegacyStorage, retryDecimalSetupRead, type DecimalSetup, type DecimalSetupOutput } from "./api";

/**
 * Website-wide number format (FE-DEC-102, ADR-0040): the Decimal Setup places plus the bound formatters and input
 * caps every page uses. Display: weight/price places 0–4. Typing: min(places, storage scale) (owner Q-DEC-08).
 */
export type NumberFormat = DecimalPlaces & {
  /** Max decimals a weight field accepts: min(weightPlaces, 3). */
  weightInputDecimals: number;
  /** Max decimals a money field accepts: min(pricePlaces, 2). */
  priceInputDecimals: number;
  weight: (value: string | number) => string;
  money: (value: string | number) => string;
  unitPrice: (value: string | number) => string;
};

export function numberFormatFor(places: DecimalPlaces): NumberFormat {
  const { weightPlaces, pricePlaces } = places;
  return {
    weightPlaces,
    pricePlaces,
    weightInputDecimals: weightInputDecimals(weightPlaces),
    priceInputDecimals: priceInputDecimals(pricePlaces),
    weight: (value) => formatWeight(value, weightPlaces),
    money: (value) => formatMoney(value, pricePlaces),
    unitPrice: (value) => formatUnitPrice(value, pricePlaces),
  };
}

const DEFAULT_FORMAT = numberFormatFor(DEFAULT_DECIMAL_PLACES);
/** Outside the provider (tests, print pop-ups) the website defaults 2 / 2 apply. */
export const NumberFormatContext = createContext<NumberFormat>(DEFAULT_FORMAT);

export function useNumberFormat(): NumberFormat {
  return useContext(NumberFormatContext);
}

/** The shared `decimalSetup.get` query (one cache entry; the Decimal Setup page and the provider both observe it). */
export function useDecimalSetupQuery(options: { refetchOnMount?: boolean | "always" } = {}) {
  const query = masterTrpc.decimalSetup.get.useQuery(undefined, {
    staleTime: DECIMAL_SETUP_STALE_MS,
    retry: retryDecimalSetupRead,
    ...options,
  });
  return query as unknown as Omit<typeof query, "data" | "refetch"> & {
    data?: DecimalSetupOutput;
    refetch: () => Promise<{ data?: DecimalSetupOutput }>;
  };
}

/** The tRPC cache key of `decimalSetup.get` (api-contract.md "Frontend cache contract"). */
export const decimalSetupQueryKey = () => getQueryKey(masterTrpc.decimalSetup.get, undefined, "query");

/** After a save: every open tab re-formats at once from the returned setup; the invalidate re-reads it afterwards. */
export function applySavedSetup(queryClient: QueryClient, result: DecimalSetupOutput): Promise<void> {
  const queryKey = decimalSetupQueryKey();
  queryClient.setQueryData(queryKey, result);
  return queryClient.invalidateQueries({ queryKey });
}

export function useSaveDecimalSetup() {
  const queryClient = useQueryClient();
  const mutation = masterTrpc.decimalSetup.save.useMutation({
    retry: false,
    onSuccess: (result) => void applySavedSetup(queryClient, result),
  });
  return mutation as unknown as {
    mutate: (input: { weightPlaces: number; pricePlaces: number; expectedVersion: number }, options?: { onSuccess?: (result: { setup: DecimalSetup }) => void; onError?: (error: unknown) => void }) => void;
    isPending: boolean;
  };
}

/**
 * Mounted once inside the signed-in App Shell (FE-DEC-102). Reads the setting once per load; while it loads or
 * when it fails, pages use weight 2 / price 2 with no banner (Q-DEC-16). Also deletes the rev 1 value (Q-DEC-17).
 */
export function DecimalSetupProvider({ children }: { children: ReactNode }) {
  const query = useDecimalSetupQuery();
  const { weightPlaces, pricePlaces } = placesFrom(query.data);
  const value = useMemo(() => numberFormatFor({ weightPlaces, pricePlaces }), [weightPlaces, pricePlaces]);

  useEffect(() => removeLegacyStorage(), []);

  return <NumberFormatContext.Provider value={value}>{children}</NumberFormatContext.Provider>;
}
