import type { inferRouterClient } from "@trpc/client";
import type { AppRouter } from "@gem-crm/backend-api-gateway/src/trpc/router";

/**
 * vendor contract types inferred from the gateway `AppRouter` (`vendor.*`, SA revision 1 +
 * ADR-0019 revision 1, approved and delivered 2026-10-15; FE-VEN-010). See
 * document/apps/backend/partner/vendor/api-contract.md and coordination/handoffs/vendor-backend.md.
 */

type VendorClient = inferRouterClient<AppRouter>["vendor"];

export type VendorListInput = NonNullable<Parameters<VendorClient["list"]["query"]>[0]>;
export type VendorListOutput = Awaited<ReturnType<VendorClient["list"]["query"]>>;
export type VendorListItem = VendorListOutput["items"][number];
export type VendorDetail = Awaited<ReturnType<VendorClient["get"]["query"]>>;
export type VendorInvoiceAddress = VendorDetail["invoiceAddresses"][number];
export type VendorOptionsOutput = Awaited<ReturnType<VendorClient["options"]["query"]>>;
export type VendorCreateInput = Parameters<VendorClient["create"]["mutate"]>[0];
export type VendorUpdateInput = Parameters<VendorClient["update"]["mutate"]>[0];
export type VendorMutationOutput = Awaited<ReturnType<VendorClient["create"]["mutate"]>>;
/** Create input = the shared vendor fields (update adds `id` + `expectedUpdatedAt`). */
export type VendorFieldsInput = VendorCreateInput;

/** Page size used by the drawer (ADR-0019 cap, `limit` 1–50). */
export const VENDOR_PAGE_SIZE = 50;
/** `vendor.list` `q` limit. */
export const VENDOR_SEARCH_MAX = 100;
