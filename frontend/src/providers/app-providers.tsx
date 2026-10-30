"use client";

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { installFocusModality } from "@/lib/focus-modality";
import { authTrpc, createAuthTrpcClient } from "@/lib/auth-trpc";
import { masterTrpc, createMasterTrpcClient } from "@/lib/master-trpc";

export function AppProviders({ children }: Readonly<{ children: React.ReactNode }>) {
  const [queryClient] = useState(() => new QueryClient());
  const [authClient] = useState(createAuthTrpcClient);
  const [masterClient] = useState(createMasterTrpcClient);
  useEffect(() => installFocusModality(document), []);

  return (
    <QueryClientProvider client={queryClient}>
      <authTrpc.Provider client={authClient} queryClient={queryClient}>
        <masterTrpc.Provider client={masterClient} queryClient={queryClient}>{children}</masterTrpc.Provider>
      </authTrpc.Provider>
    </QueryClientProvider>
  );
}
