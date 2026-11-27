import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { getQueryKey } from "@trpc/react-query";
import { createElement, type ComponentProps, type ReactElement, type ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ToastProvider } from "@/components/ui/toast";
import { mergeSettings } from "@/features/approval-setup/model";
import { SettingRow } from "@/features/approval-setup/components/ApprovalSetupPage";
import { detailQueryKey, inventoryCountState, inventoryPendingInput } from "@/features/approve-center/api";
import { ApproveMenuPage } from "@/features/approve-center/components/ApproveCenterPage";
import { loadToStockDocumentClient, loadToStockPreview, toPendingItem } from "@/features/approve-center/inventory";
import { approveMenuFor, type AvailableMenu } from "@/features/approve-center/menus";
import { DEFAULT_SORT, pendingInput, summaryCount } from "@/features/approve-center/model";
import { inventoryApprovalCalls, inventoryApprovalKeys, isInventoryApprovalType } from "@/features/inventory/approval";
import { inventoryNotificationCalls, inventoryNotificationKeys } from "@/features/inventory/notifications";
import { NotificationsPanel } from "@/features/notifications/components/NotificationsBell";
import { combineFeeds, NOTIFICATION_PAGE_SIZE, splitIdsBySource, type FeedState, type NotificationItem } from "@/features/notifications/model";
import { INVENTORY_STREAM, MASTER_STREAM, startNotificationStream } from "@/features/notifications/stream";
import { authTrpc, createAuthTrpcClient } from "@/lib/auth-trpc";
import { createMasterTrpcClient, masterTrpc } from "@/lib/master-trpc";
import { controlledInventory, envelope, LOAD_ID, loadOut } from "./fixtures";

/**
 * IT-LS-07…10: the inventory approval platform in the shared pages — Approve Center (FE-LS-011), Approval Setup
 * (FE-LS-014) and the notification bell's second feed and stream (FE-LS-015) — through seeded caches and the real
 * inventory client against a controlled server.
 */
vi.mock("next/navigation", () => ({ usePathname: () => "/approve/load-to-stock", useRouter: () => ({ replace: vi.fn(), push: vi.fn() }) }));
afterEach(() => vi.restoreAllMocks());

function withProviders(queryClient: QueryClient, children: ReactNode) {
  const authProps = { client: createAuthTrpcClient(), queryClient } as ComponentProps<typeof authTrpc.Provider>;
  const masterProps = { client: createMasterTrpcClient(), queryClient } as ComponentProps<typeof masterTrpc.Provider>;
  return createElement(QueryClientProvider, { client: queryClient }, createElement(authTrpc.Provider, authProps, createElement(masterTrpc.Provider, masterProps, createElement(ToastProvider, null, children))));
}
const decoded = (html: string) => html.replaceAll("&#x27;", "'").replaceAll("&amp;", "&");
const render = (queryClient: QueryClient, element: ReactElement) => decoded(renderToStaticMarkup(withProviders(queryClient, element)));

const menu = approveMenuFor("load-to-stock") as AvailableMenu;
const pendingItem = { id: LOAD_ID, docNo: "LSGMS2609001", docDate: "2026-11-17", partyName: "Siam Gems", submittedAt: "2026-11-17T03:00:00.000Z", submittedByName: "Mint", totalPcs: 40, totalWeightCt: "29.300", valueBase: "1387835.60", revisionCount: 0 };

describe("IT-LS-07 Approve Center: Load to Stock from backend-api-inventory (FE-LS-011)", () => {
  it("the menu is available with its document page and vendor party", () => {
    expect(menu).toMatchObject({ availability: "available", proc: "loadToStock", documentBase: "/inventory/load-to-stock", party: "vendor" });
    expect(isInventoryApprovalType(menu.type)).toBe(true);
  });

  it("the pending list renders the inventory rows in the shared table (value in the company currency, no line count)", () => {
    const queryClient = new QueryClient();
    queryClient.setQueryData(getQueryKey(authTrpc.permission.mine, undefined, "query"), { isSuperAdmin: false, permissions: ["load-to-stock:VIEW", "load-to-stock:APPROVE"] });
    queryClient.setQueryData(getQueryKey(masterTrpc.currency.options, undefined, "query"), { items: [], baseCode: "THB" });
    queryClient.setQueryData(inventoryApprovalKeys.summary(), { items: [{ type: "load-to-stock", count: 1 }], countCap: 100 });
    queryClient.setQueryData(inventoryApprovalKeys.settings(), { items: [{ type: "load-to-stock", requireApproval: true, version: 1 }] });
    queryClient.setQueryData(inventoryApprovalKeys.pending(inventoryPendingInput(pendingInput(menu, undefined, DEFAULT_SORT), menu.type)), { pages: [{ items: [pendingItem], nextCursor: null }], pageParams: [null] });
    const html = render(queryClient, createElement(ApproveMenuPage, { slug: "load-to-stock" }));
    expect(html).toMatch(/<h1[^>]*>Load to Stock<\/h1>/);
    expect(html).toContain("LSGMS2609001");
    expect(html).toContain("Siam Gems");
    expect(html).toContain("1,387,835.60 THB");
    expect(html).not.toContain("0 lines");
  });

  it("counts: inventory summary + settings in master's summary shape; off when the inventory setting is off", () => {
    const state = inventoryCountState({ status: "success", data: { items: [{ type: "load-to-stock", count: 3 }], countCap: 100 } }, { status: "success", data: { items: [{ type: "load-to-stock", requireApproval: true }] } });
    expect(summaryCount(state, menu)).toEqual({ status: "success", total: 3 });
    const off = inventoryCountState({ status: "success", data: { items: [], countCap: 100 } }, { status: "success", data: { items: [{ type: "load-to-stock", requireApproval: false }] } });
    expect(summaryCount(off, menu)).toEqual({ status: "success", off: true });
    expect(inventoryCountState({ status: "error" }, { status: "success", data: { items: [] } })).toEqual({ status: "error" });
    expect(inventoryCountState({ status: "pending" }, { status: "success", data: { items: [] } })).toEqual({ status: "pending" });
  });

  it("approve / reject / revise: the current version is read first (SA rev 1 pending rows have none); preview mapping", async () => {
    const server = controlledInventory((call) => {
      if (call.method === "GET") return { body: loadOut({ status: "PENDING_APPROVAL", version: 7 }) };
      return { body: { id: LOAD_ID, version: 8, status: call.path.endsWith("/approve") ? "APPROVED" : call.path.endsWith("/reject") ? "REJECTED" : "REVISION_REQUESTED" } };
    });
    const { loadToStockCalls } = await import("@/features/load-to-stock/api");
    const client = loadToStockDocumentClient(loadToStockCalls({ fetch: server.fetch, renew: async () => false }));
    await client.approve.mutate({ id: LOAD_ID, expectedVersion: toPendingItem(pendingItem, "THB").version });
    await client.reject.mutate({ id: LOAD_ID, expectedVersion: 7, reason: "Wrong lot" });
    await client.requestRevision.mutate({ id: LOAD_ID, expectedVersion: 7, note: "Fix price" });
    expect(server.calls.map((call) => `${call.method} ${call.path.replace(`/api/inventory/v1/load-to-stock/${LOAD_ID}`, "")}`)).toEqual(["GET ", "POST /approve", "POST /reject", "POST /request-revision"]);
    expect(server.calls[1]!.body).toEqual({ expectedVersion: 7 });
    expect(server.calls[2]!.body).toEqual({ expectedVersion: 7, reason: "Wrong lot" });
    expect(server.calls[3]!.body).toEqual({ expectedVersion: 7, note: "Fix price" });
    const preview = loadToStockPreview(loadOut());
    expect(preview).toMatchObject({ docNo: "LSGMS2609001", currency: "THB", exchangeRate: null, vendor: { name: "Siam Gems" }, totals: { grandTotal: "456663.00" } });
    expect(preview.lines[0]).toMatchObject({ stoneCode: "SA-RBLDEXVS1AAA", pcs: 7, amount: "456663.00", location: "Safe A" });
    expect(detailQueryKey("loadToStock", LOAD_ID)).toEqual(["inventory", "load-to-stock", "preview", LOAD_ID]);
  });
});

describe("IT-LS-08 Approval Setup and approval settings from inventory (FE-LS-014)", () => {
  const masterItem = (type: string) => ({ type, requireApproval: true, available: true, version: 2, updatedAt: "2026-11-10T00:00:00.000Z", updatedByName: null, waiting: 0 });

  it("master rows without the inventory types + inventory rows; the inventory types are switchable; waiting = pending + revision", () => {
    const merged = mergeSettings([masterItem("reserve"), masterItem("load-to-stock")], [
      { type: "load-to-stock", requireApproval: false, version: 4, waitingCount: { pending: 2, revision: 1 } },
      { type: "merge-split", requireApproval: true, version: 1 },
    ]);
    expect(merged?.map((item) => [item.type, item.available, item.version, item.waiting])).toEqual([
      ["reserve", true, 2, 0],
      ["load-to-stock", true, 4, 3],
      ["merge-split", true, 1, null],
    ]);
    expect(mergeSettings(undefined, [])).toBeUndefined();
  });

  it("the Load to Stock row shows its inventory setting with an enabled switch", () => {
    const setting = mergeSettings([], [{ type: "load-to-stock", requireApproval: true, version: 4, waitingCount: { pending: 0, revision: 0 } }])![0];
    const html = renderToStaticMarkup(
      createElement("table", null, createElement("tbody", null, createElement(SettingRow, { menu: approveMenuFor("load-to-stock")!, setting, canEdit: true, canOpenApprove: true, saving: false, onToggle: vi.fn() }))),
    );
    expect(html).toContain("Load to Stock");
    expect(html).not.toContain("Not available yet");
    expect(html).toMatch(/role="switch"[^>]*aria-checked="true"/);
  });

  it("GET / PUT /approval-settings through the real client; HAS_WAITING keeps its counts", async () => {
    const server = controlledInventory((call) =>
      call.method === "PUT" ? { status: 409, body: envelope("APPROVAL_SETTING_HAS_WAITING", { pending: 1, revision: 1 }) } : { body: { items: [{ type: "load-to-stock", requireApproval: true, version: 4 }] } },
    );
    const calls = inventoryApprovalCalls({ fetch: server.fetch, renew: async () => false });
    await expect(calls.settings()).resolves.toMatchObject({ items: [{ type: "load-to-stock", version: 4 }] });
    const error = await calls.updateSetting("load-to-stock", false, 4).catch((caught: unknown) => caught);
    expect(server.calls[1]).toMatchObject({ method: "PUT", path: "/api/inventory/v1/approval-settings/load-to-stock", body: { requireApproval: false, expectedVersion: 4 } });
    const { updateFailure } = await import("@/features/approval-setup/model");
    expect(updateFailure(error, approveMenuFor("load-to-stock")!, true)).toEqual({ kind: "blocked", total: 2 });
  });
});

describe("IT-LS-09 notification bell: two feeds (FE-LS-015)", () => {
  const today = new Date();
  today.setHours(9, 0, 0, 0);
  const item = (id: string, minutes: number, patch: Partial<NotificationItem> = {}): NotificationItem => ({
    id, type: "approval.pending", documentType: "reserve", documentId: "d", docNo: id.toUpperCase(), summary: {}, createdAt: new Date(today.getTime() + minutes * 60_000).toISOString(), readAt: null, ...patch,
  });
  const feed = (items: NotificationItem[], patch: Partial<FeedState> = {}): FeedState => ({ items, isPending: false, isError: false, hasNextPage: false, isFetchingNextPage: false, isFetchNextPageError: false, ...patch });

  it("merges newest first; one feed failing leaves the other; both failing is an error; pending only while nothing settled", () => {
    const merged = combineFeeds(feed([item("m1", 1), item("m2", -5)]), feed([item("i1", 0, { source: "inventory" })]));
    expect(merged.items.map((entry) => entry.id)).toEqual(["m1", "i1", "m2"]);
    expect(combineFeeds(feed([item("m1", 1)]), feed([], { isError: true, isPending: true }))).toMatchObject({ isError: false, isPending: false, feedErrors: 1 });
    expect(combineFeeds(feed([], { isError: true }), feed([], { isError: true }))).toMatchObject({ isError: true });
    expect(combineFeeds(feed([]), feed([], { isPending: true }))).toMatchObject({ isPending: true });
    expect(splitIdsBySource(["m1", "i1"], [{ id: "i1", source: "inventory" }])).toEqual({ master: ["m1"], inventory: ["i1"] });
  });

  it("the panel shows the inventory item beside master's, opening its Approve menu", () => {
    const queryClient = new QueryClient();
    queryClient.setQueryData(getQueryKey(masterTrpc.notification.unreadCount, undefined, "query"), { count: 1 });
    queryClient.setQueryData(getQueryKey(masterTrpc.notification.list, { scope: "for-me", limit: NOTIFICATION_PAGE_SIZE }, "infinite"), { pages: [{ items: [item("m1", -10, { docNo: "RS2611002" })], nextCursor: null }], pageParams: [null] });
    queryClient.setQueryData(inventoryNotificationKeys.unread(), { count: 1 });
    queryClient.setQueryData(inventoryNotificationKeys.list("for-me"), { pages: [{ items: [item("ls1", 0, { documentType: "load-to-stock", docNo: "LSGMS2609001" })], nextCursor: null }], pageParams: [null] });
    const html = render(queryClient, createElement(NotificationsPanel, { id: "np", unread: 2, onClose: () => undefined }));
    expect(html).toContain("LSGMS2609001");
    expect(html).toContain("RS2611002");
    expect(html.indexOf("LSGMS2609001")).toBeLessThan(html.indexOf("RS2611002"));
    expect(html).toContain("Load to Stock");
  });

  it("inventory feed calls: unread count, list, mark-read (≤ 50 ids) and mark-all-read with CSRF header, same origin", async () => {
    const server = controlledInventory((call) => {
      if (call.path.endsWith("/unread-count")) return { body: { count: 2 } };
      if (call.path.endsWith("/notifications")) return { body: { items: [], nextCursor: null } };
      return { body: { updated: 1 } };
    });
    const calls = inventoryNotificationCalls({ fetch: server.fetch, renew: async () => false });
    await expect(calls.unreadCount()).resolves.toEqual({ count: 2 });
    await calls.list("for-me", null, 20);
    await calls.markRead(Array.from({ length: 60 }, (_, index) => `id${index}`));
    await calls.markAllRead();
    expect(server.calls.map((call) => `${call.method} ${call.path}`)).toEqual([
      "GET /api/inventory/v1/notifications/unread-count",
      "GET /api/inventory/v1/notifications",
      "POST /api/inventory/v1/notifications/mark-read",
      "POST /api/inventory/v1/notifications/mark-all-read",
    ]);
    expect(server.calls[1]!.query).toEqual({ scope: "for-me", limit: "20" });
    expect((server.calls[2]!.body as { ids: string[] }).ids).toHaveLength(50);
    expect(server.calls.every((call) => call.csrf === "1" && call.credentials === "same-origin")).toBe(true);
  });

  it("one native EventSource per service: separate URL and lock; no token in the URL; stopping closes it", async () => {
    type Source = { url: string; closed: boolean; addEventListener: () => void; close: () => void; onerror: null };
    const sources: Source[] = [];
    const lockNames: string[] = [];
    const createEventSource = (url: string) => {
      const source: Source = { url, closed: false, addEventListener: () => undefined, close: () => { source.closed = true; }, onerror: null };
      sources.push(source);
      return source as never;
    };
    const locks = {
      request: (name: string, _options: { signal: AbortSignal }, callback: () => Promise<void>) => {
        lockNames.push(name);
        void callback();
        return Promise.resolve();
      },
    };
    const deps = { createEventSource, renew: async () => true, onNotification: vi.fn(), onReady: vi.fn(), locks };
    const stopMaster = startNotificationStream({ ...deps, names: MASTER_STREAM });
    const stopInventory = startNotificationStream({ ...deps, names: INVENTORY_STREAM });
    await Promise.resolve();
    expect(sources.map((source) => source.url)).toEqual(["/api/master/notifications/stream", "/api/inventory/v1/notifications/stream"]);
    expect(sources.every((source) => !/[?&](token|access)/i.test(source.url))).toBe(true);
    expect(lockNames).toEqual([MASTER_STREAM.lockName, INVENTORY_STREAM.lockName]);
    expect(new Set([MASTER_STREAM.channelName, INVENTORY_STREAM.channelName, MASTER_STREAM.leaderKey, INVENTORY_STREAM.leaderKey]).size).toBe(4);
    stopInventory();
    expect(sources[1]!.closed).toBe(true);
    expect(sources[0]!.closed).toBe(false);
    stopMaster();
    expect(sources[0]!.closed).toBe(true);
  });
});
