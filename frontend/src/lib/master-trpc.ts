import { httpBatchLink } from "@trpc/client";
import { createTRPCReact } from "@trpc/react-query";
import { createContext } from "react";
import type { MasterRouter } from "@gem-crm/backend-api-master/src/master/router";
import { createDomainTrpcFetch } from "./domain-trpc-fetch";

export const masterTrpcContext = createContext(null);
export const masterTrpc = createTRPCReact<MasterRouter>({ context: masterTrpcContext });

export function createMasterTrpcClient() {
  return masterTrpc.createClient({
    links: [httpBatchLink({ url: "/api/master/trpc", fetch: createDomainTrpcFetch() })],
  });
}
