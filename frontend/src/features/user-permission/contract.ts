import type { inferRouterClient } from "@trpc/client";
import type { AuthRouter } from "@gem-crm/backend-api-auth/src/trpc/auth-trpc.router";

/**
 * ADR-0020 (user-permission UI revision 2) contract types, derived from the
 * auth service `AuthRouter`. Only `Client` is used by hooks; the view-model mapping
 * in api.ts depends on these aliases.
 */
export type Client = inferRouterClient<AuthRouter>;
type Output<T extends (...args: never[]) => Promise<unknown>> = Awaited<ReturnType<T>>;

export type CatalogOutput = Output<Client["permission"]["catalog"]["query"]>;
export type UserListOutput = Output<Client["userAdmin"]["list"]["query"]>;
export type UserDetailOutput = Output<Client["userAdmin"]["get"]["query"]>;
export type LocationOptionsOutput = Output<Client["userAdmin"]["locationOptions"]["query"]>;
export type CreateUserInput = Parameters<Client["userAdmin"]["create"]["mutate"]>[0];
export type UpdateUserInput = Parameters<Client["userAdmin"]["update"]["mutate"]>[0];
