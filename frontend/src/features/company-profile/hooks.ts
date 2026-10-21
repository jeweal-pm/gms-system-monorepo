"use client";

import { toSelectOptions } from "@/features/partner/options";
import { retryServiceRead, serviceRestartRetryDelay } from "@/lib/trpc-error";
import { masterTrpc } from "@/lib/master-trpc";

/**
 * Company profile data hooks over the typed tRPC client (`companyProfile.*`, FE-CP-009). One record,
 * no polling; options cached for the session; reads retried only for transient failures; mutations
 * never retried. The logo bytes go through REST (api.ts `uploadLogo`).
 */

export function useCompanyProfile() {
  return masterTrpc.companyProfile.get.useQuery(undefined, {
    staleTime: 30_000,
    retry: retryServiceRead,
    retryDelay: serviceRestartRetryDelay,
  });
}

export function useCompanyProfileOptions() {
  return masterTrpc.companyProfile.options.useQuery(undefined, {
    select: toSelectOptions,
    staleTime: Infinity,
    retry: retryServiceRead,
    retryDelay: serviceRestartRetryDelay,
  });
}

export function useSaveCompanyProfile() {
  return masterTrpc.companyProfile.save.useMutation({ retry: false, gcTime: 0 });
}

export function useRemoveCompanyLogo() {
  return masterTrpc.companyProfile.removeLogo.useMutation({ retry: false, gcTime: 0 });
}

/** Writes a fresh profile into the `companyProfile.get` cache after a mutation or logo upload. */
export function useCompanyProfileCache() {
  const utils = masterTrpc.useUtils();
  return utils.companyProfile.get;
}
