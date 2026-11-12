import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { getQueryKey } from "@trpc/react-query";
import { createElement, type ComponentProps, type ReactElement, type ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import ApproveRoutePage from "@/app/(app)/approve/page";
import { ToastProvider } from "@/components/ui/toast";
import { documentClients, detailQueryKey as previewKey, pendingQueryKey, summaryQueryKey, useReviewCalls } from "@/features/approve-center/api";
import { ApproveMenuPage } from "@/features/approve-center/components/ApproveCenterPage";
import { DocumentPreviewModal } from "@/features/approve-center/components/DocumentPreviewModal";
import { ReviewDialog } from "@/features/approve-center/components/ReviewDialog";
import { approveMenuFor, type AvailableMenu } from "@/features/approve-center/menus";
import { actionFailure, approveFailure, DEFAULT_SORT, listLoadError, pendingInput, reviewFieldError, rowsOf, runBulkApprove } from "@/features/approve-center/model";
import { Sidebar } from "@/features/home/sidebar";
import { authTrpc, createAuthTrpcClient } from "@/lib/auth-trpc";
import { createMasterTrpcClient, masterTrpc } from "@/lib/master-trpc";
import { listItem, page, reserveDetail, RS1, RS2, sourceTwoItems, summary } from "./fixtures";

/**
 * IT-AP-01…09 (approve-center FE-AP-001…010, approval-setup FE-AS-009/013): the Approve pages, the sidebar badge and
 * the approval calls through the app's provider stack (React Query + auth / master tRPC) and the real tRPC link + CSRF
 * fetch wrapper against a controlled `/api/master/trpc` server. Static renders read seeded caches under the hooks' real
 * query keys.
 */

vi.mock("next/navigation", () => ({
  usePathname: () => "/approve/reserve",
  useRouter: () => ({ replace: vi.fn(), push: vi.fn() }),
}));

type Call = { path: string; method: string; input: unknown; csrf: string | null };
type Reply = { status?: number; body: unknown };
const ok = (data: unknown): Reply => ({ body: { result: { data } } });
const fail = (status: number, domainCode: string, fieldErrors?: { path: string; code: string }[]): Reply => ({
  status,
  body: { error: { message: domainCode, code: -32000, data: { code: "CONFLICT", httpStatus: status, domainCode, fieldErrors } } },
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
const quotation = approveMenuFor("quotation") as AvailableMenu;
const ALL_GRANTS = ["reserve", "memo-receive", "memo-return", "memo-out", "memo-out-return", "purchase-order", "purchase", "quotation", "load-to-stock", "merge-split", "stock-transfer-location"].flatMap(
  (leaf) => [`${leaf}:VIEW`, `${leaf}:APPROVE`],
);
const reserveInput = pendingInput(reserve, undefined, DEFAULT_SORT);

/** Permissions, `approval.summary` (Reserve 2, Purchase 1, Quotation off by default) and Reserve's first page (source 02). */
function seeded(permissions: string[], data = summary()) {
  const queryClient = new QueryClient();
  queryClient.setQueryData(getQueryKey(authTrpc.permission.mine, undefined, "query"), { isSuperAdmin: false, permissions });
  queryClient.setQueryData(summaryQueryKey(), data);
  queryClient.setQueryData(pendingQueryKey(reserveInput), { pages: [page(sourceTwoItems(), { nextCursor: "c2" })], pageParams: [null] });
  return queryClient;
}

const decoded = (html: string) => html.replaceAll("&#x27;", "'").replaceAll("&amp;", "&");
const render = (queryClient: QueryClient, element: ReactElement) => decoded(renderToStaticMarkup(withProviders(queryClient, element)));
const panelOf = (html: string) => /<nav aria-labelledby="[^"]*" class="hidden h-full w-gms-sidebar[\s\S]*?<\/nav>/.exec(html)?.[0] ?? "";
const badgeIn = (panel: string, label: string) => new RegExp(`>${label.replace(/[()/]/g, "\\$&")}</span>(<span[^>]*>(?:<span[^>]*>[^<]*</span>)?([^<]+))?`).exec(panel)?.[2] ?? null;

/** Captures the hooks after one render; the calls then go through the real link to the controlled server. */
function probe(queryClient: QueryClient, menu: AvailableMenu = reserve) {
  const captured: { calls?: ReturnType<typeof useReviewCalls>; utils?: ReturnType<typeof masterTrpc.useUtils> } = {};
  function Probe() {
    captured.calls = useReviewCalls(menu);
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

  it("APPROVE without VIEW still lists the pending documents (approval-setup authorization.md, G11)", () => {
    const html = render(seeded(["reserve:APPROVE"]), createElement(ApproveMenuPage, { slug: "reserve" }));
    expect(html).toContain("RS2611002");
    expect(html).not.toContain("permission to view");
  });
});

describe("IT-AP-02 counts from approval.summary: panel badges and the sidebar total", () => {
  it("one summary request through the real link (GET, no input)", async () => {
    respond = () => ok(summary());
    const { utils } = probe(seeded(ALL_GRANTS));
    const result = await utils.client.approval.summary.query();
    expect(result.types.find((type) => type.type === "quotation")?.requireApproval).toBe(false);
    expect(calls).toEqual([{ path: "approval.summary", method: "GET", input: undefined, csrf: "1" }]);
  });

  it("Reserve 2, Purchase 1, Quotation off, no badge at 0 or on inventory menus; sidebar 3", () => {
    const queryClient = seeded(ALL_GRANTS);
    const panel = panelOf(render(queryClient, createElement(ApproveMenuPage, { slug: "reserve" })));
    expect(badgeIn(panel, "Reserve")).toBe("2");
    expect(badgeIn(panel, "Purchase")).toBe("1");
    expect(badgeIn(panel, "Quotation")).toBe("off");
    expect(badgeIn(panel, "Memo Out")).toBeNull();
    expect(badgeIn(panel, "Load to Stock")).toBeNull();
    const sidebar = render(queryClient, createElement(Sidebar, { pathname: "/approve/reserve" }));
    expect(sidebar).toMatch(/>Approve<\/span><span[^>]*>(<span[^>]*>[^<]*<\/span>)?3<span class="sr-only"> waiting for approval<\/span>/);
  });

  it("FE-AS-009: any type turned off shows 'off'; Quotation turned on gets a count", () => {
    const queryClient = seeded(ALL_GRANTS, summary({ quotation: 4, reserve: 0 }, ["memo-out"]));
    const panel = panelOf(render(queryClient, createElement(ApproveMenuPage, { slug: "reserve" })));
    expect(badgeIn(panel, "Quotation")).toBe("4");
    expect(badgeIn(panel, "Memo Out")).toBe("off");
    expect(badgeIn(panel, "Reserve")).toBeNull();
  });

  it("the sidebar shows 99+ at the summary cap and nothing at 0", () => {
    expect(render(seeded(ALL_GRANTS, summary({ reserve: 100 })), createElement(Sidebar, { pathname: "/" }))).toContain("99+");
    expect(render(seeded(ALL_GRANTS, summary({})), createElement(Sidebar, { pathname: "/" }))).not.toContain("waiting for approval");
  });
});

describe("IT-AP-03 pending table from approval.pending", () => {
  it("lists the rows in server order with the enriched cells and 'Showing n of N' from the summary", () => {
    const html = render(seeded(ALL_GRANTS), createElement(ApproveMenuPage, { slug: "reserve" }));
    expect(html).toMatch(/<h1[^>]*>Reserve<\/h1>/);
    expect(html).toContain('placeholder="Search no., customer, stone, Stock ID"');
    expect(html.indexOf("RS2611002")).toBeLessThan(html.indexOf("RS2611003"));
    expect(html).toContain("Showing 2 of 2");
    expect(html).toContain("Hold until 05/11/26 · 2 lines · Sapphire");
    expect(html).toContain("130 pcs");
    expect(html).toContain(">Mint<");
    expect(html).toContain(">Load more<");
    expect(html.match(/data-approve-index="\d"/g)).toHaveLength(2);
    expect(calls).toEqual([]);
  });

  it("the pending request carries type, search, sort, direction and cursor through the real link", async () => {
    respond = () => ok(page(sourceTwoItems()));
    const { utils } = probe(seeded(ALL_GRANTS));
    const input = pendingInput(approveMenuFor("purchase-order") as AvailableMenu, "Siam", { key: "value", dir: "desc" });
    const result = await utils.client.approval.pending.query({ ...input, cursor: "c1" });
    expect(rowsOf([result]).map((row) => row.docNo)).toEqual(["RS2611002", "RS2611003"]);
    expect(calls[0]).toMatchObject({ path: "approval.pending", method: "GET", input: { type: "purchase-order", q: "Siam", sort: "value", dir: "desc", limit: 50, cursor: "c1" } });
  });

  it("a stale cursor (VALIDATION_ERROR cursor) resets paging; APPROVAL_TYPE_OFF switches to the off state", async () => {
    const { utils } = probe(seeded(ALL_GRANTS));
    respond = () => fail(400, "VALIDATION_ERROR", [{ path: "cursor", code: "invalid" }]);
    const stale = await utils.client.approval.pending.query({ ...reserveInput, cursor: "bad" }).catch((error: unknown) => error);
    expect(listLoadError(stale, reserve).resetPaging).toBe(true);
    respond = () => fail(409, "APPROVAL_TYPE_OFF");
    const off = await utils.client.approval.pending.query(reserveInput).catch((error: unknown) => error);
    expect(listLoadError(off, reserve)).toMatchObject({ off: true, message: "Approval is off for Reserve." });
    // Paging reset drops the loaded pages of that list only.
    const queryClient = seeded(ALL_GRANTS);
    const { calls: fresh } = probe(queryClient);
    respond = () => ok(page([]));
    await fresh.resetPaging(reserveInput);
    expect(queryClient.getQueryData(pendingQueryKey(reserveInput))).toBeUndefined();
  });

  it("a type whose approval is off shows the off state without a list request; Quotation ON lists like the others", () => {
    const off = render(seeded(ALL_GRANTS), createElement(ApproveMenuPage, { slug: "quotation" }));
    expect(off).toContain("Approval is off for Quotation. Its documents are approved when they are saved.");
    expect(off).not.toContain("data-approve-index");
    const queryClient = seeded(ALL_GRANTS, summary({ quotation: 1 }, []));
    queryClient.setQueryData(pendingQueryKey(pendingInput(quotation, undefined, DEFAULT_SORT)), {
      pages: [page([listItem({ type: "quotation", id: RS2, docNo: "QT2611001" })])],
      pageParams: [null],
    });
    const on = render(queryClient, createElement(ApproveMenuPage, { slug: "quotation" }));
    expect(on).toContain("QT2611001");
    expect(on).toContain("Valid until 05/11/26");
    expect(render(queryClient, createElement(ApproveMenuPage, { slug: "transfer-location" }))).toContain("Transfer Location approvals will appear here once its page is built.");
    expect(render(queryClient, createElement(ApproveMenuPage, { slug: "sale" }))).toMatch(/<h1[^>]*>Menu not found<\/h1>/);
    expect(calls).toEqual([]);
  });

  it("/approve waits for permissions and counts before opening a menu", () => {
    expect(render(new QueryClient(), createElement(ApproveRoutePage))).toContain("Opening Approve…");
  });
});

describe("IT-AP-04 approve one (FE-AP-009: no get first)", () => {
  it("approve with the row's version, POST with CSRF; invalidation marks the summary, the lists and the settings stale", async () => {
    respond = () => ok({ id: RS1, version: 5 });
    const queryClient = seeded(ALL_GRANTS);
    queryClient.setQueryData(getQueryKey(masterTrpc.approvalSetting.list, undefined, "query"), { items: [] });
    const { calls: api } = probe(queryClient);
    await api.approve(RS1, 4);
    expect(calls.map(({ path, method, input, csrf }) => ({ path, method, input, csrf }))).toEqual([{ path: "reserve.approve", method: "POST", input: { id: RS1, expectedVersion: 4 }, csrf: "1" }]);
    respond = () => ok(summary());
    await api.invalidate("approve");
    expect(queryClient.getQueryState(summaryQueryKey())?.isInvalidated).toBe(true);
    expect(queryClient.getQueryState(pendingQueryKey(reserveInput))?.isInvalidated).toBe(true);
    expect(queryClient.getQueryState(getQueryKey(masterTrpc.approvalSetting.list, undefined, "query"))?.isInvalidated).toBe(true);
    expect(queryClient.getQueryState(getQueryKey(authTrpc.permission.mine, undefined, "query"))?.isInvalidated).toBe(false);
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
    const denied = await api.approve(RS1, 4).catch((error: unknown) => error);
    expect(approveFailure(denied, reserve, "RS2611002").refetchAccess).toBe(true);
  });
});

describe("IT-AP-05 approve selected", () => {
  it("runs one approve per document with its listed version, one request at a time, and keeps going after a failure", async () => {
    respond = (_path, input) => ((input as { id: string }).id === RS2 ? fail(409, "RESERVE_STATUS_INVALID") : ok({ version: 8 }));
    const { calls: api } = probe(seeded(ALL_GRANTS));
    const rows = rowsOf([page(sourceTwoItems().map((item, index) => ({ ...item, version: 7 + index })))]);
    const outcome = await runBulkApprove(rows, api, reserve, () => false, () => undefined);
    expect(calls.map((call) => `${call.path} ${JSON.stringify(call.input)}`)).toEqual([
      `reserve.approve {"id":"${RS1}","expectedVersion":7}`,
      `reserve.approve {"id":"${RS2}","expectedVersion":8}`,
    ]);
    expect(fetches).toBe(2);
    expect(outcome.ok).toBe(1);
    expect(outcome.failed.get(RS2)?.toast).toBe("RS2611003 is no longer pending.");
  });
});

describe("IT-AP-06 preview data (rev 2, FE-AP-014)", () => {
  it("the modal's get shares the tRPC cache key and goes through the real link; Quotation has a client too", async () => {
    expect(previewKey("reserve", RS1)).toEqual(getQueryKey(masterTrpc.reserve.get, { id: RS1 }, "query"));
    expect(previewKey("quotation", RS1)).toEqual(getQueryKey(masterTrpc.quotation.get, { id: RS1 }, "query"));
    respond = () => ok(reserveDetail());
    const { utils } = probe(seeded(ALL_GRANTS));
    const detail = await documentClients(utils.client).reserve.get.query({ id: RS1 });
    expect(detail.version).toBe(4);
    expect(calls.map(({ path, method, input, csrf }) => ({ path, method, input, csrf }))).toEqual([{ path: "reserve.get", method: "GET", input: { id: RS1 }, csrf: "1" }]);
  });
});

describe("IT-AP-07 preview modal through the providers (rev 2, FE-AP-014/015; FE-AP-010 footer)", () => {
  const rowOf = (id: string) => rowsOf([page(sourceTwoItems())]).find((entry) => entry.id === id)!;
  const modal = (queryClient: QueryClient, id = RS1, error: string | null = null) =>
    render(queryClient, createElement(DocumentPreviewModal, { menu: reserve, row: rowOf(id), busy: false, error, onClose: () => undefined, onApprove: () => undefined, onReject: () => undefined, onRevise: () => undefined }));

  it("renders the loaded document: title, submitter, THB values, Reject… / Revise… / Approve enabled", () => {
    const queryClient = seeded(ALL_GRANTS);
    queryClient.setQueryData(previewKey("reserve", RS1), reserveDetail());
    queryClient.setQueryData(getQueryKey(masterTrpc.currency.options, undefined, "query"), { items: [], baseCode: "THB" });
    const html = modal(queryClient);
    expect(html).toContain("Pending approval");
    expect(html).toMatch(/Reserve<span class="ml-2">RS2611002<\/span>/);
    expect(html).toContain("Submitted by Mint · 01/11/26 11:20");
    expect(html).toContain("Value (THB)");
    expect(html).toContain("962,875.84");
    expect(html).toMatch(/aria-label="Reject RS2611002…"[^>]*>Reject…<\/button>/);
    expect(html).toMatch(/aria-label="Revise RS2611002…"[^>]*>Revise…<\/button>/);
    expect(html).toMatch(/>Approve<\/button>/);
    expect(html).not.toContain("coming soon");
  });

  it("a document already sent back once has Revise… disabled with the info text", () => {
    const queryClient = seeded(ALL_GRANTS);
    queryClient.setQueryData(previewKey("reserve", RS2), reserveDetail({ id: RS2, docNo: "RS2611003", revisionCount: 1 }));
    const html = modal(queryClient, RS2);
    expect(html).toContain("Already sent back once. Approve or reject it.");
    expect(html).not.toContain('aria-label="Revise RS2611003…"');
  });

  it("a document that stopped waiting hides the actions and says so; a failed action shows its message", () => {
    const queryClient = seeded(ALL_GRANTS);
    queryClient.setQueryData(previewKey("reserve", RS1), reserveDetail({ status: "APPROVED" }));
    const html = modal(queryClient);
    expect(html).toContain("RS2611002 is no longer waiting for approval.");
    expect(html).not.toMatch(/>Approve<\/button>/);
    expect(html).not.toContain(">Reject…<");
    const withError = modal(queryClient, RS1, "RS2611002 was changed by someone else.");
    expect(withError).toContain('role="alert"');
    expect(withError).toContain("RS2611002 was changed by someone else.");
  });
});

describe("IT-AP-08 Reject… / Revise… calls (FE-AP-010, FE-AS-013)", () => {
  it("reject {id, expectedVersion, reason} and requestRevision {id, expectedVersion, note} POST with CSRF; Quotation too", async () => {
    respond = () => ok({ id: RS1, version: 5 });
    const { calls: api } = probe(seeded(ALL_GRANTS));
    await api.reject(RS1, 4, "Wrong customer");
    await api.requestRevision(RS1, 4, "Fix the price");
    const { calls: qt } = probe(seeded(ALL_GRANTS), quotation);
    await qt.reject(RS2, 2, "Expired");
    expect(calls.map(({ path, method, input, csrf }) => ({ path, method, input, csrf }))).toEqual([
      { path: "reserve.reject", method: "POST", input: { id: RS1, expectedVersion: 4, reason: "Wrong customer" }, csrf: "1" },
      { path: "reserve.requestRevision", method: "POST", input: { id: RS1, expectedVersion: 4, note: "Fix the price" }, csrf: "1" },
      { path: "quotation.reject", method: "POST", input: { id: RS2, expectedVersion: 2, reason: "Expired" }, csrf: "1" },
    ]);
  });

  it("server refusals map: reason missing inline, _REVISE_LIMIT / _CHANGED / _STATUS_INVALID / _DELETED refetch", async () => {
    const { calls: api } = probe(seeded(ALL_GRANTS));
    respond = () => fail(400, "VALIDATION_ERROR", [{ path: "note", code: "too_small" }]);
    const blank = await api.requestRevision(RS1, 4, " ").catch((error: unknown) => error);
    expect(reviewFieldError("revise", blank)).toBe("Enter the reason before choosing Revise");
    for (const [code, toast] of [
      ["RESERVE_REVISE_LIMIT", "RS2611002 was already sent back once. Approve or reject it."],
      ["RESERVE_CHANGED", "RS2611002 was changed by someone else. The list was refreshed."],
      ["RESERVE_STATUS_INVALID", "RS2611002 is no longer pending."],
      ["RESERVE_DELETED", "RS2611002 was deleted."],
    ] as const) {
      respond = () => fail(409, code);
      const error = await api.requestRevision(RS1, 4, "x").catch((caught: unknown) => caught);
      expect(reviewFieldError("revise", error)).toBeNull();
      expect(actionFailure(error, reserve, "RS2611002", "revise")).toMatchObject({ toast, refetch: true });
    }
  });

  it("the dialog renders the required reason field with the action's label, counter and submit button", () => {
    const reject = render(new QueryClient(), createElement(ReviewDialog, { target: { kind: "reject", docNo: "RS2611002" }, pending: false, error: null, onCancel: () => undefined, onSubmit: () => undefined }));
    expect(reject).toContain("Reject RS2611002?");
    expect(reject).toMatch(/<label[^>]*>Reason for reject <span aria-hidden="true"/);
    expect(reject).toContain('maxLength="500"');
    expect(reject).toContain("0/500");
    expect(reject).toMatch(/<button type="submit"[^>]*>Reject<\/button>/);
    const revise = render(new QueryClient(), createElement(ReviewDialog, { target: { kind: "revise", docNo: "RS2611002" }, pending: false, error: "Enter the reason before choosing Revise", onCancel: () => undefined, onSubmit: () => undefined }));
    expect(revise).toContain("Send RS2611002 back for revision?");
    expect(revise).toContain('aria-invalid="true"');
    expect(revise).toMatch(/role="alert"[^>]*>Enter the reason before choosing Revise</);
    expect(revise).toMatch(/<button type="submit"[^>]*>Revise<\/button>/);
    const closed = render(new QueryClient(), createElement(ReviewDialog, { target: null, pending: false, error: null, onCancel: () => undefined, onSubmit: () => undefined }));
    expect(closed).not.toContain("<form");
  });
});
