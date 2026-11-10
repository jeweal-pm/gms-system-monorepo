import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { getQueryKey } from "@trpc/react-query";
import { createElement, type ComponentProps, type ReactElement, type ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import ApproveRoutePage from "@/app/(app)/approve/page";
import { ToastProvider } from "@/components/ui/toast";
import { documentClients, detailQueryKey as previewKey, listQueryKey, useApproveCalls } from "@/features/approve-center/api";
import { ApproveMenuPage } from "@/features/approve-center/components/ApproveCenterPage";
import { DocumentPreviewModal } from "@/features/approve-center/components/DocumentPreviewModal";
import { approveMenuFor, type AvailableMenu } from "@/features/approve-center/menus";
import { approveFailure, COUNT_INPUT, pendingListInput, rowsOf, runBulkApprove } from "@/features/approve-center/model";
import { Sidebar } from "@/features/home/sidebar";
import { authTrpc, createAuthTrpcClient } from "@/lib/auth-trpc";
import { createMasterTrpcClient, masterTrpc } from "@/lib/master-trpc";
import { listItem, page, reserveDetail, RS1, RS2, sourceTwoItems } from "./fixtures";

/**
 * IT-AP-01…05 (approve-center FE-AP-001…006): the Approve pages, the sidebar badge and the approve calls through the
 * app's provider stack (React Query + auth / master tRPC) and the real tRPC link + CSRF fetch wrapper against a
 * controlled `/api/master/trpc` server. Static renders read seeded caches under the hooks' real query keys.
 */

vi.mock("next/navigation", () => ({
  usePathname: () => "/approve/reserve",
  useRouter: () => ({ replace: vi.fn(), push: vi.fn() }),
}));

type Call = { path: string; method: string; input: unknown; csrf: string | null };
type Reply = { status?: number; body: unknown };
const ok = (data: unknown): Reply => ({ body: { result: { data } } });
const fail = (status: number, domainCode: string): Reply => ({
  status,
  body: { error: { message: domainCode, code: -32000, data: { code: "CONFLICT", httpStatus: status, domainCode } } },
});

let calls: Call[] = [];
let fetches = 0;
let respond: (path: string, input: unknown) => Reply = () => ok(null);
beforeEach(() => {
  calls = [];
  fetches = 0;
  respond = () => ok(null);
  vi.stubGlobal("fetch", vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    fetches += 1;
    const url = new URL(String(input), "http://localhost");
    const paths = url.pathname.replace("/api/master/trpc/", "").split(",");
    const method = init?.method ?? "GET";
    const inputs = (method === "GET" ? JSON.parse(url.searchParams.get("input") ?? "{}") : JSON.parse(String(init?.body ?? "{}"))) as Record<string, unknown>;
    const csrf = new Headers(init?.headers).get("x-gms-csrf");
    const results = paths.map((path, index) => {
      calls.push({ path, method, input: inputs[index], csrf });
      return respond(path, inputs[index]);
    });
    const status = results.find((result) => result.status)?.status ?? 200;
    return new Response(JSON.stringify(results.map((result) => result.body)), { status, headers: { "content-type": "application/json" } });
  }));
});
afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

function withProviders(queryClient: QueryClient, children: ReactNode) {
  const authProps = { client: createAuthTrpcClient(), queryClient } as ComponentProps<typeof authTrpc.Provider>;
  const masterProps = { client: createMasterTrpcClient(), queryClient } as ComponentProps<typeof masterTrpc.Provider>;
  return createElement(
    QueryClientProvider,
    { client: queryClient },
    createElement(authTrpc.Provider, authProps, createElement(masterTrpc.Provider, masterProps, createElement(ToastProvider, null, children))),
  );
}

const reserve = approveMenuFor("reserve") as AvailableMenu;
const ALL_GRANTS = ["reserve", "memo-receive", "memo-return", "memo-out", "memo-out-return", "purchase-order", "purchase", "quotation", "load-to-stock", "merge-split", "stock-transfer-location"].flatMap(
  (leaf) => [`${leaf}:VIEW`, `${leaf}:APPROVE`],
);

/** Permissions plus counts (Reserve 2, Purchase 1, others 0) and Reserve's first page (source 02). */
function seeded(permissions: string[], counts: Partial<Record<string, number>> = { reserve: 2, purchase: 1 }) {
  const queryClient = new QueryClient();
  queryClient.setQueryData(getQueryKey(authTrpc.permission.mine, undefined, "query"), { isSuperAdmin: false, permissions });
  for (const proc of ["reserve", "memoReceive", "memoReturn", "memoOut", "memoOutReturn", "purchaseOrder", "purchase"] as const) {
    queryClient.setQueryData(listQueryKey(proc, COUNT_INPUT, "query"), page([], { total: counts[proc] ?? 0 }));
  }
  queryClient.setQueryData(listQueryKey("reserve", pendingListInput(undefined), "infinite"), {
    pages: [page([...sourceTwoItems(), listItem({ id: "deleted", docNo: "RS-DEL", deletedAt: "2026-11-03T00:00:00Z" })], { total: 2 })],
    pageParams: [null],
  });
  return queryClient;
}

const decoded = (html: string) => html.replaceAll("&#x27;", "'").replaceAll("&amp;", "&");
const render = (queryClient: QueryClient, element: ReactElement) => decoded(renderToStaticMarkup(withProviders(queryClient, element)));
const panelOf = (html: string) => /<nav aria-labelledby="[^"]*" class="hidden h-full w-gms-sidebar[\s\S]*?<\/nav>/.exec(html)?.[0] ?? "";

/** Captures the hooks after one render; the calls then go through the real link to the controlled server. */
function probe(queryClient: QueryClient) {
  const captured: { calls?: ReturnType<typeof useApproveCalls>; utils?: ReturnType<typeof masterTrpc.useUtils> } = {};
  function Probe() {
    captured.calls = useApproveCalls(reserve);
    captured.utils = masterTrpc.useUtils();
    return null;
  }
  renderToStaticMarkup(withProviders(queryClient, createElement(Probe)));
  return captured as Required<typeof captured>;
}

describe("IT-AP-01 visibility through permission.mine", () => {
  it("shows every item in the sidebar order to a user with all grants", () => {
    const html = render(seeded(ALL_GRANTS), createElement(ApproveMenuPage, { slug: "reserve" }));
    const panel = panelOf(html);
    const labels = [...panel.matchAll(/<span class="min-w-0 flex-1 truncate">([^<]+)<\/span>/g)].map((match) => match[1]);
    expect(labels).toEqual(["Quotation", "Reserve", "Memo Receive", "Memo Return", "Memo Out", "Memo Out Return", "Purchase Order (PO)", "Purchase", "Load to Stock", "Merge/Split Stock", "Transfer Location"]);
    expect(panel).toMatch(/aria-current="page"[^>]*href="\/approve\/reserve"/);
  });

  it("shows only the items with APPROVE; other menus explain the missing grant; the sidebar hides Approve without any", () => {
    const queryClient = seeded(["reserve:VIEW", "reserve:APPROVE"]);
    const panel = panelOf(render(queryClient, createElement(ApproveMenuPage, { slug: "reserve" })));
    expect(panel).toContain(">Reserve<");
    expect(panel).not.toContain(">Purchase<");
    expect(render(queryClient, createElement(ApproveMenuPage, { slug: "purchase" }))).toContain("You don't have permission to approve Purchase documents.");
    expect(render(seeded(["reserve:VIEW"]), createElement(Sidebar, { pathname: "/" }))).not.toContain('href="/approve"');
    expect(render(queryClient, createElement(Sidebar, { pathname: "/approve/reserve" }))).toMatch(/aria-current="page"[^>]*href="\/approve"/);
  });

  it("APPROVE without VIEW shows the permission text and no table", () => {
    const html = render(seeded(["reserve:APPROVE"]), createElement(ApproveMenuPage, { slug: "reserve" }));
    expect(html).toContain("You don't have permission to view Reserve documents.");
    expect(html).not.toContain("RS2611002");
  });
});

describe("IT-AP-02 counts: panel badges and the sidebar total", () => {
  it("count requests go through the real link as status PENDING_APPROVAL, limit 1", async () => {
    respond = () => ok(page([], { total: 2 }));
    const { utils } = probe(seeded(ALL_GRANTS));
    const result = await documentClients(utils.client).reserve.list.query(COUNT_INPUT);
    expect(result.total).toBe(2);
    expect(calls).toEqual([{ path: "reserve.list", method: "GET", input: { status: "PENDING_APPROVAL", limit: 1 }, csrf: "1" }]);
  });

  it("Reserve 2, Purchase 1, Quotation off, no badge at 0 or on inventory menus; sidebar 3", () => {
    const queryClient = seeded(ALL_GRANTS);
    const panel = panelOf(render(queryClient, createElement(ApproveMenuPage, { slug: "reserve" })));
    const badge = (label: string) => new RegExp(`>${label.replace(/[()/]/g, "\\$&")}</span>(<span[^>]*>(?:<span[^>]*>[^<]*</span>)?([^<]+))?`).exec(panel)?.[2] ?? null;
    expect(badge("Reserve")).toBe("2");
    expect(badge("Purchase")).toBe("1");
    expect(badge("Quotation")).toBe("off");
    expect(badge("Memo Out")).toBeNull();
    expect(badge("Load to Stock")).toBeNull();
    const sidebar = render(queryClient, createElement(Sidebar, { pathname: "/approve/reserve" }));
    expect(sidebar).toMatch(/>Approve<\/span><span[^>]*>(<span[^>]*>[^<]*<\/span>)?3<span class="sr-only"> waiting for approval<\/span>/);
  });

  it("the sidebar shows 99+ and nothing at 0", () => {
    expect(render(seeded(ALL_GRANTS, { reserve: 120 }), createElement(Sidebar, { pathname: "/" }))).toContain("99+");
    expect(render(seeded(ALL_GRANTS, {}), createElement(Sidebar, { pathname: "/" }))).not.toContain("waiting for approval");
  });
});

describe("IT-AP-03 pending table", () => {
  it("lists the loaded pending rows oldest first, leaves out deleted ones, and shows the total", () => {
    const html = render(seeded(ALL_GRANTS), createElement(ApproveMenuPage, { slug: "reserve" }));
    expect(html).toContain("<h1");
    expect(html).toMatch(/<h1[^>]*>Reserve<\/h1>/);
    expect(html).toContain('placeholder="Search no., customer, stone, Stock ID"');
    expect(html.indexOf("RS2611002")).toBeLessThan(html.indexOf("RS2611003"));
    expect(html).not.toContain("RS-DEL");
    expect(html).toContain("Showing 2 of 2");
    expect(html).toContain("Hold until 05/11/26");
    // Two row buttons; the confirm dialog's own Approve is closed.
    expect(html.match(/data-approve-index="\d"/g)).toHaveLength(2);
    expect(calls).toEqual([]);
  });

  it("the row list request carries the search and never asks for deleted documents", async () => {
    respond = () => ok(page(sourceTwoItems()));
    const { utils } = probe(seeded(ALL_GRANTS));
    const result = await documentClients(utils.client).purchaseOrder.list.query({ ...pendingListInput("Siam"), cursor: "c1" });
    expect(rowsOf([result]).map((row) => row.docNo)).toEqual(["RS2611003", "RS2611002"]);
    expect(calls[0]).toMatchObject({ path: "purchaseOrder.list", input: { status: "PENDING_APPROVAL", limit: 50, q: "Siam", cursor: "c1" } });
    expect(calls[0].input).not.toHaveProperty("deleted");
  });

  it("Quotation (off) shows the source 01 empty state; inventory menus 'Not available yet'; unknown slug 'Menu not found'; none call the API", () => {
    const queryClient = seeded(ALL_GRANTS);
    const quotation = render(queryClient, createElement(ApproveMenuPage, { slug: "quotation" }));
    expect(quotation).toContain("Nothing waiting");
    expect(quotation).toContain("Every document in this menu has been reviewed.");
    expect(render(queryClient, createElement(ApproveMenuPage, { slug: "transfer-location" }))).toContain("Transfer Location approvals will appear here once its page is built.");
    const unknown = render(queryClient, createElement(ApproveMenuPage, { slug: "sale" }));
    expect(unknown).toMatch(/<h1[^>]*>Menu not found<\/h1>/);
    expect(calls).toEqual([]);
  });

  it("/approve waits for permissions and counts before opening a menu", () => {
    expect(render(new QueryClient(), createElement(ApproveRoutePage))).toContain("Opening Approve…");
  });
});

describe("IT-AP-04 approve one", () => {
  it("get → approve with that version, POST with CSRF; invalidation marks the counts and the list stale", async () => {
    respond = (path) => (path === "reserve.get" ? ok({ id: RS1, docNo: "RS2611002", version: 4, lines: [{}, {}] }) : ok({ id: RS1, version: 5 }));
    const queryClient = seeded(ALL_GRANTS);
    const { calls: api } = probe(queryClient);
    expect(await api.prepare(RS1)).toEqual({ version: 4, lineCount: 2 });
    await api.approve(RS1, 4);
    expect(calls.map(({ path, method, input, csrf }) => ({ path, method, input, csrf }))).toEqual([
      { path: "reserve.get", method: "GET", input: { id: RS1 }, csrf: "1" },
      { path: "reserve.approve", method: "POST", input: { id: RS1, expectedVersion: 4 }, csrf: "1" },
    ]);
    respond = () => ok(page([], { total: 1 }));
    await api.invalidate();
    expect(queryClient.getQueryState(listQueryKey("reserve", COUNT_INPUT, "query"))?.isInvalidated).toBe(true);
    expect(queryClient.getQueryState(listQueryKey("reserve", pendingListInput(undefined), "infinite"))?.isInvalidated).toBe(true);
    expect(queryClient.getQueryState(listQueryKey("purchase", COUNT_INPUT, "query"))?.isInvalidated).toBe(false);
  });

  it("server errors arrive with their domain codes and map to the documented messages", async () => {
    const { calls: api } = probe(seeded(ALL_GRANTS));
    respond = () => fail(409, "RESERVE_CHANGED");
    const changed = await api.approve(RS1, 4).catch((error: unknown) => error);
    expect(approveFailure(changed, reserve, "RS2611002")).toMatchObject({ toast: "RS2611002 was changed by someone else. The list was refreshed.", refetch: true });
    respond = () => fail(409, "RESERVE_PENDING_SHORT");
    const short = await api.approve(RS1, 4).catch((error: unknown) => error);
    expect(approveFailure(short, reserve, "RS2611002")).toMatchObject({ link: true });
    respond = () => fail(403, "PERMISSION_DENIED");
    const denied = await api.prepare(RS1).catch((error: unknown) => error);
    expect(approveFailure(denied, reserve, "RS2611002").refetchAccess).toBe(true);
  });
});

describe("IT-AP-05 approve selected", () => {
  it("runs get + approve per document, one request at a time, and keeps going after a failure", async () => {
    respond = (path, input) => {
      const id = (input as { id: string }).id;
      if (path === "reserve.get") return ok({ id, version: 7, lines: [] });
      return id === RS2 ? fail(409, "RESERVE_STATUS_INVALID") : ok({ id, version: 8 });
    };
    const { calls: api } = probe(seeded(ALL_GRANTS));
    const rows = rowsOf([page(sourceTwoItems())]).reverse();
    const outcome = await runBulkApprove(rows, api, reserve, () => false, () => undefined);
    expect(calls.map((call) => `${call.path} ${(call.input as { id: string }).id === RS1 ? "RS1" : "RS2"}`)).toEqual(["reserve.get RS1", "reserve.approve RS1", "reserve.get RS2", "reserve.approve RS2"]);
    expect(fetches).toBe(4);
    expect(outcome.ok).toBe(1);
    expect(outcome.failed.get(RS2)?.toast).toBe("RS2611003 is no longer pending.");
  });
});

describe("IT-AP-06 preview data (rev 2, FE-AP-014)", () => {
  it("the modal's get shares the tRPC cache key and goes through the real link with CSRF", async () => {
    expect(previewKey("reserve", RS1)).toEqual(getQueryKey(masterTrpc.reserve.get, { id: RS1 }, "query"));
    respond = () => ok(reserveDetail());
    const { utils } = probe(seeded(ALL_GRANTS));
    const detail = await documentClients(utils.client).reserve.get.query({ id: RS1 });
    expect(detail.version).toBe(4);
    expect(calls.map(({ path, method, input, csrf }) => ({ path, method, input, csrf }))).toEqual([{ path: "reserve.get", method: "GET", input: { id: RS1 }, csrf: "1" }]);
  });
});

describe("IT-AP-07 preview modal through the providers (rev 2, FE-AP-014/015)", () => {
  const row = () => rowsOf([page(sourceTwoItems())]).find((entry) => entry.id === RS1)!;
  const modal = (queryClient: QueryClient) =>
    render(queryClient, createElement(DocumentPreviewModal, { menu: reserve, row: row(), busy: false, error: null, onClose: () => undefined, onApprove: () => undefined }));

  it("renders the loaded document: title, Customer, THB values, footer actions", () => {
    const queryClient = seeded(ALL_GRANTS);
    queryClient.setQueryData(previewKey("reserve", RS1), reserveDetail());
    queryClient.setQueryData(getQueryKey(masterTrpc.currency.options, undefined, "query"), { items: [], baseCode: "THB" });
    const html = modal(queryClient);
    expect(html).toContain("Pending approval");
    expect(html).toMatch(/Reserve<span class="ml-2">RS2611002<\/span>/);
    expect(html).toContain("Last saved 01/11/26 11:20");
    expect(html).toContain("Value (THB)");
    expect(html).toContain("962,875.84");
    expect(html).toMatch(/>Approve<\/button>/);
    expect(html).toContain("Reject is coming soon");
  });

  it("a document that stopped waiting hides Approve and says so; a failed approve shows its message", () => {
    const queryClient = seeded(ALL_GRANTS);
    queryClient.setQueryData(previewKey("reserve", RS1), reserveDetail({ status: "APPROVED" }));
    const html = modal(queryClient);
    expect(html).toContain("RS2611002 is no longer waiting for approval.");
    expect(html).not.toMatch(/>Approve<\/button>/);
    const withError = render(
      queryClient,
      createElement(DocumentPreviewModal, { menu: reserve, row: row(), busy: false, error: "RS2611002 was changed by someone else.", onClose: () => undefined, onApprove: () => undefined }),
    );
    expect(withError).toContain('role="alert"');
    expect(withError).toContain("RS2611002 was changed by someone else.");
  });
});
