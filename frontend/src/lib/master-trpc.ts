import { httpBatchLink } from "@trpc/client";
import { createTRPCReact } from "@trpc/react-query";
import type { MasterRouter } from "@gem-crm/backend-api-master/src/master/router";
import { createDomainTrpcFetch } from "./domain-trpc-fetch";

export const masterTrpc = createTRPCReact<MasterRouter>();

export function createMasterTrpcClient() {
  return masterTrpc.createClient({
    links: [httpBatchLink({ url: "/api/master/trpc", fetch: createDomainTrpcFetch() })],
  });
}
