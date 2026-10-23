"use client";

import { skipToken } from "@tanstack/react-query";
import { useMemo } from "react";
import { authTrpc } from "@/lib/auth-trpc";
import { masterTrpc } from "@/lib/master-trpc";
import { retryTransient } from "@/lib/trpc-error";
import type { DocumentSetupDetail, DocumentTransaction } from "./schema";

/** Document Setup data over the typed master tRPC client (data-fetching.md, SA rev 1). */
export function useDocumentTransactions() {
  const query = masterTrpc.documentSetup.list.useQuery(undefined, { staleTime: 30_000, retry: retryTransient });
  return query as unknown as Omit<typeof query, "data"> & { data?: { items: DocumentTransaction[] } };
}

export function useDocumentSetup(transactionKey: string | null) {
  const query = masterTrpc.documentSetup.get.useQuery(transactionKey === null ? skipToken : { transactionKey: transactionKey as never }, { staleTime: 30_000, retry: retryTransient });
  return query as unknown as Omit<typeof query, "data" | "refetch"> & { data?: { setup: DocumentSetupDetail | null }; refetch: () => Promise<{ data?: { setup: DocumentSetupDetail | null } }> };
}

export function useSaveDocumentSetup() {
  const mutation = masterTrpc.documentSetup.save.useMutation({ retry: false, gcTime: 0 });
  return mutation as unknown as {
    mutate: (input: Record<string, unknown>, options?: { onSuccess?: (result: { setup: DocumentSetupDetail }) => void; onError?: (error: unknown) => void }) => void;
    isPending: boolean;
    reset: () => void;
  };
}

export function useDocumentSetupCache() {
  const utils = masterTrpc.useUtils();
  const authUtils = authTrpc.useUtils();
  return useMemo(
    () => ({
      invalidateList: () => utils.documentSetup.list.invalidate(),
      setDetail: (transactionKey: string, setup: DocumentSetupDetail) => utils.documentSetup.get.setData({ transactionKey: transactionKey as never }, { setup } as never),
      recheckAccess: () => authUtils.permission.mine.invalidate(),
    }),
    [utils, authUtils],
  );
}
