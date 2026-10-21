import type { inferRouterClient } from "@trpc/client";
import type { MasterRouter } from "@gem-crm/backend-api-master/src/master/router";

/**
 * customer contract types inferred from `MasterRouter` (`customer.*`,
 * SA revision 1, delivered 2026-10-14; FE-CUS-014). See
 * document/apps/backend/partner/customer/api-contract.md.
 */

type CustomerClient = inferRouterClient<MasterRouter>["customer"];

export type CustomerListInput = NonNullable<Parameters<CustomerClient["list"]["query"]>[0]>;
export type CustomerListOutput = Awaited<ReturnType<CustomerClient["list"]["query"]>>;
export type CustomerListItem = CustomerListOutput["items"][number];
export type CustomerDetail = Awaited<ReturnType<CustomerClient["get"]["query"]>>;
export type CustomerOptionsOutput = Awaited<ReturnType<CustomerClient["options"]["query"]>>;
export type CustomerCreateInput = Parameters<CustomerClient["create"]["mutate"]>[0];
export type CustomerUpdateInput = Parameters<CustomerClient["update"]["mutate"]>[0];
export type CustomerMutationOutput = Awaited<ReturnType<CustomerClient["create"]["mutate"]>>;
/** Create input = the shared customer fields (update adds `id` + `expectedUpdatedAt`). */
export type CustomerFieldsInput = CustomerCreateInput;

/** Page size used by the drawer (ADR-0018 cap). */
export const CUSTOMER_PAGE_SIZE = 50;
/** `customer.list` `q` limit. */
export const CUSTOMER_SEARCH_MAX = 100;
