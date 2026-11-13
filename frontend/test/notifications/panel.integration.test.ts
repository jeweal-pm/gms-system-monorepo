import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { getQueryKey } from "@trpc/react-query";
import { createElement, type ComponentProps, type ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { NotificationsBell, NotificationsPanel } from "@/features/notifications/components/NotificationsBell";
import { NOTIFICATION_PAGE_SIZE, type NotificationItem } from "@/features/notifications/model";
import { createMasterTrpcClient, masterTrpc } from "@/lib/master-trpc";

/**
 * IT-NT-FE-01…04 (FE-NT-001/002): the bell and panel through the app's master tRPC provider, rendered from seeded
 * caches under the hooks' real query keys; the mark-read calls go through the real link and CSRF fetch wrapper.
 */
vi.mock("next/navigation", () => ({ useRouter: () => ({ push: vi.fn(), replace: vi.fn() }) }));

const ID1 = "0b9f3c4e-1d2a-4b3c-8d4e-5f6a7b8c9d01";
const ID2 = "0b9f3c4e-1d2a-4b3c-8d4e-5f6a7b8c9d02";
const today = new Date();
today.setHours(9, 42, 0, 0);
const item = (overrides: Partial<NotificationItem>): NotificationItem => ({
  id: ID1, type: "approval.pending", documentType: "reserve", documentId: "doc-1", docNo: "RS2611002",
  summary: { partyName: "Siam Gems Trading Co., Ltd.", amount: "172020.00", currency: "THB" }, createdAt: today.toISOString(), readAt: null, ...overrides,
});

type Call = { path: string; method: string; input: unknown; csrf: string | null };
let calls: Call[] = [];
beforeEach(() => {
  calls = [];
  vi.stubGlobal("fetch", vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = new URL(String(input), "http://localhost");
    const method = init?.method ?? "GET";
    const path = url.pathname.replace("/api/master/trpc/", "");
    const body = method === "GET" ? JSON.parse(url.searchParams.get("input") ?? "{}") : JSON.parse(String(init?.body ?? "{}"));
    calls.push({ path, method, input: body[0], csrf: new Headers(init?.headers).get("x-gms-csrf") });
    return new Response(JSON.stringify([{ result: { data: { updated: 1 } } }]), { status: 200, headers: { "content-type": "application/json" } });
  }));
});
afterEach(() => vi.unstubAllGlobals());

function render(queryClient: QueryClient, children: ReactNode) {
  const masterProps = { client: createMasterTrpcClient(), queryClient } as ComponentProps<typeof masterTrpc.Provider>;
  return renderToStaticMarkup(createElement(QueryClientProvider, { client: queryClient }, createElement(masterTrpc.Provider, masterProps, children)));
}

function seeded(count: number, items: NotificationItem[] | null) {
  const queryClient = new QueryClient();
  queryClient.setQueryData(getQueryKey(masterTrpc.notification.unreadCount, undefined, "query"), { count });
  if (items) {
    queryClient.setQueryData(getQueryKey(masterTrpc.notification.list, { scope: "for-me", limit: NOTIFICATION_PAGE_SIZE }, "infinite"), {
      pages: [{ items, nextCursor: null }],
      pageParams: [null],
    });
  }
  return queryClient;
}

const panel = (unread: number) => createElement(NotificationsPanel, { id: "np", unread, onClose: () => undefined });

describe("notifications bell and panel", () => {
  it("IT-NT-FE-01 the bell shows a red dot and names the unread count; none when all read", () => {
    const html = render(seeded(6, null), createElement(NotificationsBell));
    expect(html).toContain('aria-label="Notifications, 6 unread"');
    expect(html).toContain('aria-haspopup="dialog"');
    expect(html).toContain('aria-expanded="false"');
    expect(html).toContain("data-unread-dot");
    expect(render(seeded(0, null), createElement(NotificationsBell))).not.toContain("data-unread-dot");
  });

  it("IT-NT-FE-02 the panel: header, tabs with the For me badge, Today group, unread (#E2F0F0) and read rows", () => {
    const html = render(seeded(6, [item({}), item({ id: ID2, type: "document.approved", docNo: "PU2611001", documentType: "purchase", readAt: today.toISOString() })]), panel(6));
    expect(html).toContain('role="dialog"');
    expect(html).toContain("w-[440px]");
    expect(html).toContain("h-[650px]");
    expect(html).toContain(">Notifications</h2>");
    expect(html).toMatch(/<button type="button"[^>]*>Mark all as read<\/button>/);
    expect(html).toContain('role="tablist"');
    expect(html).toMatch(/aria-selected="true"[^>]*><span aria-hidden="true" data-tab-underline="true" class="absolute inset-x-0 bottom-0 h-\[3px\] bg-\[#006A70\]"><\/span>For me<span data-count-badge[^>]*><span class="sr-only">, <\/span>6/);
    // Owner design 2026-11-12: the second tab reads "Overview"; only the selected tab has the full-width underline.
    expect(html).toMatch(/aria-selected="false"[^>]*>Overview<\/button>/);
    expect(html.match(/data-tab-underline/g)).toHaveLength(1);
    expect(html).toContain(">Today</h3>");
    expect(html).toContain('<span class="font-semibold">RS2611002</span> waits for your approval');
    expect(html).toContain("Siam Gems Trading Co., Ltd. · 172,020.00 THB");
    expect(html).toContain("Today at 9:42 AM");
    expect(html.match(/data-unread="true"/g)).toHaveLength(1);
    expect(html).toContain("bg-[#E2F0F0] hover:bg-[#A3C9CC]");
    expect(html).toContain("bg-gms-surface hover:bg-[#FBFBFB]");
    expect(html).toContain('aria-label="Open list page for Reserve"');
    expect(html).toContain('aria-label="Open list page for Purchase"');
    expect(html).toContain(">Open list page</span>");
    expect(html).not.toContain("data-notification-reason");
    // Inbox components (owner design 2026-11-12): 32 px avatar (white on unread, #F4F6F8 on read), 6 px dot, plain chevron.
    expect(html).toContain("size-8 shrink-0 items-center justify-center rounded-full bg-white");
    expect(html).toContain("size-8 shrink-0 items-center justify-center rounded-full bg-[#F4F6F8]");
    expect(html).toContain("size-1.5 rounded-full bg-gms-danger");
    expect(html).not.toMatch(/aria-label="Open list page for [^"]+" class="[^"]*bg-\[/);
  });

  it("IT-NT-FE-05 (BE-NT-007) rejected / sent-back rows show the approver reason on its own line, full text on hover", () => {
    const reason = "ราคาไม่ตรงกับใบเสนอ กรุณาตรวจสอบอีกครั้ง";
    const html = render(seeded(2, [
      item({ type: "document.rejected", documentType: "quotation", docNo: "QT2611001", summary: { partyName: "Siam Gems", amount: "1000.00", currency: "THB", reason } }),
      item({ id: ID2, type: "document.revision_requested", summary: { partyName: "Siam Gems", reason: "Only 1 pcs" } }),
    ]), panel(2));
    expect(html).toContain("<span class=\"font-semibold\">QT2611001</span> was rejected");
    expect(html).toContain(`title="Reason: ${reason}"`);
    expect(html).toContain(`>Reason: ${reason}</span>`);
    expect(html).toContain(">Note: Only 1 pcs</span>");
    expect(html).toContain("Siam Gems · 1,000.00 THB");
    expect(html).toContain("aria-label=\"Open list page for Quotation\"");
  });

  it("IT-NT-FE-03 loading shows 5 skeleton items; an empty list shows the hint; nothing unread disables Mark all", () => {
    const loading = render(seeded(0, null), panel(0));
    expect(loading).toContain('aria-busy="true"');
    expect(loading.match(/<li aria-hidden="true"/g)).toHaveLength(5);
    const empty = render(seeded(0, []), panel(0));
    expect(empty).toContain("Alerts about your organization and account will show here");
    expect(empty).toMatch(/<button type="button" disabled=""[^>]*>Mark all as read<\/button>/);
    expect(empty).not.toContain("data-count-badge");
  });

  it("IT-NT-FE-04 mark read / mark all go out as CSRF-marked POST mutations with the caller's ids", async () => {
    const client = createMasterTrpcClient();
    await client.notification.markRead.mutate({ ids: [ID1] });
    await client.notification.markAllRead.mutate();
    expect(calls).toEqual([
      { path: "notification.markRead", method: "POST", input: { ids: [ID1] }, csrf: "1" },
      { path: "notification.markAllRead", method: "POST", input: undefined, csrf: "1" },
    ]);
  });
});
