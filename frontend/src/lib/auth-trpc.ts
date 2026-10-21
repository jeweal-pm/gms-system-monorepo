import { httpBatchLink } from "@trpc/client";
import { createTRPCReact } from "@trpc/react-query";
import type { AuthRouter } from "@gem-crm/backend-api-auth/src/trpc/auth-trpc.router";
import { createDomainTrpcFetch } from "./domain-trpc-fetch";

export const authTrpc = createTRPCReact<AuthRouter>();

export function createAuthTrpcClient() {
  return authTrpc.createClient({
    links: [httpBatchLink({ url: "/api/auth/trpc", fetch: createDomainTrpcFetch() })],
  });
}
