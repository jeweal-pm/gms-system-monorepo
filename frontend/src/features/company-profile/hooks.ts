"use client";

import { toSelectOptions } from "@/features/partner/options";
import { retryTransient } from "@/lib/trpc-error";
import { trpc } from "@/providers/app-providers";

/**
 * Company profile data hooks over the typed tRPC client (`companyProfile.*`, FE-CP-009). One record,
 * no polling; options cached for the session; reads retried only for transient failures; mutations
 * never retried. The logo bytes go through REST (api.ts `uploadLogo`).
 */

export function useCompanyProfile() {
  return trpc.companyProfile.get.useQuery(undefined, { staleTime: 30_000, retry: retryTransient });
}

export function useCompanyProfileOptions() {
  return trpc.companyProfile.options.useQuery(undefined, { select: toSelectOptions, staleTime: Infinity, retry: retryTransient });
}

export function useSaveCompanyProfile() {
  return trpc.companyProfile.save.useMutation({ retry: false, gcTime: 0 });
}

export function useRemoveCompanyLogo() {
  return trpc.companyProfile.removeLogo.useMutation({ retry: false, gcTime: 0 });
}

/** Writes a fresh profile into the `companyProfile.get` cache after a mutation or logo upload. */
export function useCompanyProfileCache() {
  const utils = trpc.useUtils();
  return utils.companyProfile.get;
}
