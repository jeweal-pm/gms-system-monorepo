import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { getQueryKey } from "@trpc/react-query";
import { createElement, type ComponentProps, type ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ApprovalSetupPage } from "@/features/approval-setup/components/ApprovalSetupPage";
import { updateFailure, type ApprovalSettingItem } from "@/features/approval-setup/model";
import { approveMenuFor, type ApproveMenu } from "@/features/approve-center/menus";
import { useApprovalSetting } from "@/features/trade-document/approval-flow";
import { authTrpc, createAuthTrpcClient } from "@/lib/auth-trpc";
import { createMasterTrpcClient, masterTrpc } from "@/lib/master-trpc";
import { readDomainError } from "@/lib/trpc-error";

/**
 * IT-AS-S01…S02 (approval-setup FE-AS-008 / FE-AS-011): Setup › Approval through the app's provider stack and the real
 * tRPC link + CSRF fetch wrapper against a controlled `/api/master/trpc` server.
 */

vi.mock("next/navigation", () => ({
  usePathname: () => "/setup/approval",
  useRouter: () => ({ replace: vi.fn(), push: vi.fn() }),
}));

type Call = { path: string; method: string; input: unknown; csrf: string | null };
type Reply = { status?: number; body: unknown };
const ok = (data: unknown): Reply => ({ body: { result: { data } } });
const fail = (status: number, domainCode: string, details?: Record<string, number>): Reply => ({
  status,
  body: { error: { message: domainCode, code: -32000, data: { code: "CONFLICT", httpStatus: status, domainCode, details } } },
});

let calls: Call[] = [];
let respond: (path: string, input: unknown) => Reply = () => ok(null);
beforeEach(() => {
  calls = [];
  respond = () => ok(null);
  vi.stubGlobal("fetch", vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
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
  return createElement(QueryClientProvider, { client: queryClient }, createElement(authTrpc.Provider, authProps, createElement(masterTrpc.Provider, masterProps, children)));
}

const TYPES = ["quotation", "reserve", "memo-receive", "memo-return", "memo-out", "memo-out-return", "purchase-order", "purchase", "load-to-stock", "merge-split", "stock-transfer-location"];
const item = (type: string, patch: Partial<ApprovalSettingItem> = {}): ApprovalSettingItem => ({
  type,
  requireApproval: type !== "quotation",
  available: !["load-to-stock", "merge-split", "stock-transfer-location"].includes(type),
  version: 3,
  updatedAt: "2026-11-10T00:00:00.000Z",
  updatedByName: null,
  waiting: type === "reserve" ? 2 : type === "purchase" ? 100 : 0,
  ...patch,
});
const LIST = { items: TYPES.map((type) => item(type)) };
const listKey = () => getQueryKey(masterTrpc.approvalSetting.list, undefined, "query");

function seeded(permissions: string[], list: { items: ApprovalSettingItem[] } = LIST) {
  const queryClient = new QueryClient();
  queryClient.setQueryData(getQueryKey(authTrpc.permission.mine, undefined, "query"), { isSuperAdmin: false, permissions });
  queryClient.setQueryData(listKey(), list);
  return queryClient;
}
const render = (queryClient: QueryClient, children: ReactNode) => renderToStaticMarkup(withProviders(queryClient, children)).replaceAll("&#x27;", "'");
const rowOf = (html: string, label: string) => html.split("<tr ").find((part) => part.includes(`>${label}</span></th>`)) ?? "";

describe("IT-AS-S01 page from approvalSetting.list (FE-AS-008)", () => {
  it("shows the saved values, waiting counts (100+ at the cap), unavailable rows disabled, and no preview notice", () => {
    const html = render(seeded(["approval-setup:VIEW", "approval-setup:EDIT", "reserve:APPROVE"]), createElement(ApprovalSetupPage));
    expect(html).not.toContain("Preview only");
    expect(rowOf(html, "Quotation")).toContain('aria-checked="false"');
    expect(rowOf(html, "Reserve")).toContain('aria-checked="true"');
    expect(rowOf(html, "Reserve")).toContain('href="/approve/reserve"');
    expect(rowOf(html, "Reserve")).toContain("2 documents");
    expect(rowOf(html, "Purchase")).toContain("100+ documents");
    expect(rowOf(html, "Purchase")).not.toContain("href=");
    expect(rowOf(html, "Transfer Location")).toContain('aria-disabled="true"');
    expect(rowOf(html, "Transfer Location")).toContain("Not available yet");
    expect(html).not.toContain("View only");
    expect(calls).toEqual([]);
  });

  it("FE-AS-011: approval-setup VIEW without EDIT shows read-only switches; no VIEW is refused", () => {
    const viewOnly = render(seeded(["approval-setup:VIEW"]), createElement(ApprovalSetupPage));
    expect(viewOnly).toContain("(View only)");
    expect(rowOf(viewOnly, "Reserve")).toContain('aria-readonly="true"');
    const denied = render(seeded(["reserve:VIEW"]), createElement(ApprovalSetupPage));
    expect(denied).toContain("You don't have access to Approval");
    expect(denied).not.toContain("Approval settings");
  });

  it("counts not returned (null) read '—'", () => {
    const html = render(seeded(["approval-setup:VIEW"], { items: TYPES.map((type) => item(type, { waiting: null })) }), createElement(ApprovalSetupPage));
    expect(rowOf(html, "Reserve")).toContain('aria-label="Not applicable"');
  });

  it("the document pages read the same cache entry (useApprovalSetting), so a saved switch reaches them", () => {
    const queryClient = seeded(["approval-setup:VIEW"]);
    const seen: (boolean | undefined)[] = [];
    function Probe() {
      seen.push(useApprovalSetting("quotation").requireApproval, useApprovalSetting("reserve").requireApproval);
      return null;
    }
    render(queryClient, createElement(Probe));
    expect(seen).toEqual([false, true]);
    queryClient.setQueryData(listKey(), { items: TYPES.map((type) => item(type, { requireApproval: true })) });
    render(queryClient, createElement(Probe));
    expect(seen.slice(2)).toEqual([true, true]);
  });
});

describe("IT-AS-S02 approvalSetting.update through the real link", () => {
  const reserve = approveMenuFor("reserve") as ApproveMenu;

  it("POSTs {type, requireApproval, expectedVersion} with CSRF and returns the saved row", async () => {
    respond = () => ok({ type: "reserve", requireApproval: false, version: 4, updatedAt: "2026-11-12T00:00:00.000Z", updatedByName: "Owner" });
    const client = createMasterTrpcClient();
    const saved = await client.approvalSetting.update.mutate({ type: "reserve", requireApproval: false, expectedVersion: 3 });
    expect(saved.version).toBe(4);
    expect(calls).toEqual([{ path: "approvalSetting.update", method: "POST", input: { type: "reserve", requireApproval: false, expectedVersion: 3 }, csrf: "1" }]);
  });

  it("APPROVAL_SETTING_HAS_WAITING carries {pending, revision} in data.details (G5) → the blocked dialog total", async () => {
    respond = () => fail(409, "APPROVAL_SETTING_HAS_WAITING", { pending: 1, revision: 1 });
    const error = await createMasterTrpcClient().approvalSetting.update.mutate({ type: "reserve", requireApproval: false, expectedVersion: 3 }).catch((caught: unknown) => caught);
    expect(readDomainError(error).details).toEqual({ pending: 1, revision: 1 });
    expect(updateFailure(error, reserve, true)).toEqual({ kind: "blocked", total: 2 });
  });

  it("APPROVAL_SETTING_CHANGED and VALIDATION_ERROR refetch the settings with their messages", async () => {
    respond = () => fail(409, "APPROVAL_SETTING_CHANGED");
    const changed = await createMasterTrpcClient().approvalSetting.update.mutate({ type: "reserve", requireApproval: false, expectedVersion: 1 }).catch((caught: unknown) => caught);
    expect(updateFailure(changed, reserve, true)).toMatchObject({ message: "Approval for Reserve was changed by someone else.", refetchSettings: true });
    respond = () => fail(400, "VALIDATION_ERROR");
    const invalid = await createMasterTrpcClient().approvalSetting.update.mutate({ type: "merge-split", requireApproval: false, expectedVersion: 1 }).catch((caught: unknown) => caught);
    expect(updateFailure(invalid, approveMenuFor("merge-split")!, true)).toMatchObject({ message: "Approval for Merge/Split Stock is not available yet." });
  });
});
