import { z } from "zod";
import { inventoryRequest, type InventoryClientDeps } from "@/lib/inventory-client";
import { INVENTORY_QUERY_KEY } from "./query-keys";

/**
 * load-to-stock FE-LS-015 (ADR-0052 D12, ADR-0049 D10): backend-api-inventory's notification feed, same shapes as
 * master's (`documentType: "load-to-stock"`). Each service stays authoritative for its own items and read state.
 */
const itemSchema = z.object({
  id: z.string(),
  type: z.enum(["approval.pending", "document.approved", "document.rejected", "document.revision_requested"]),
  documentType: z.string(),
  documentId: z.string(),
  docNo: z.string(),
  summary: z
    .object({ partyName: z.string().optional(), amount: z.string().optional(), currency: z.string().optional(), reason: z.string().optional() })
    .catch({}),
  createdAt: z.string(),
  readAt: z.string().nullable(),
});
const pageSchema = z.object({ items: z.array(itemSchema), nextCursor: z.string().nullable() });
const countSchema = z.object({ count: z.number().int().min(0) });
const updatedSchema = z.object({ updated: z.number().int() });

export const inventoryNotificationKeys = {
  all: () => [...INVENTORY_QUERY_KEY, "notifications"] as const,
  unread: () => [...INVENTORY_QUERY_KEY, "notifications", "unread-count"] as const,
  list: (scope: string) => [...INVENTORY_QUERY_KEY, "notifications", "list", scope] as const,
};

export function inventoryNotificationCalls(deps: InventoryClientDeps = {}) {
  return {
    unreadCount: () => inventoryRequest("/notifications/unread-count", { schema: countSchema }, deps),
    list: (scope: "for-me" | "all", cursor?: string | null, limit = 20) => inventoryRequest("/notifications", { query: { scope, cursor, limit }, schema: pageSchema }, deps),
    markRead: (ids: string[]) => inventoryRequest("/notifications/mark-read", { method: "POST", body: { ids: ids.slice(0, 50) }, schema: updatedSchema }, deps),
    markAllRead: () => inventoryRequest("/notifications/mark-all-read", { method: "POST", body: {}, schema: updatedSchema }, deps),
  };
}

export const inventoryNotificationApi = inventoryNotificationCalls();
