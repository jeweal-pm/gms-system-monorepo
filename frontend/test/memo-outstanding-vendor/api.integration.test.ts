import { QueryClient } from "@tanstack/react-query";
import { createTRPCClient, httpBatchLink } from "@trpc/client";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { MasterRouter } from "@gem-crm/backend-api-master/src/master/router";
import { isPermissionDenied } from "@/features/memo-outstanding-vendor/api";
import { OutstandingTable } from "@/features/memo-outstanding-vendor/components/outstanding-table";
import { DEFAULT_VIEW, loadDocItems, openDocIds, toListInput, emptyListState } from "@/features/memo-outstanding-vendor/model";
import { createDomainTrpcFetch } from "@/lib/domain-trpc-fetch";
import { DOC_A, DOC_B, item, row } from "./fixtures";

/**
 * IT-MOV-F1: the page's data path against a controlled tRPC server (same link and fetch wrapper as
 * createMasterTrpcClient): vendorList input, batched vendorItems → item cache → table rows, and the error envelope.
 */
type Call = { path: string; input: unknown };

function controlledServer(respond: (path: string, input: unknown) => { status?: number; body: unknown }) {
  const calls: Call[] = [];
  const fetchStub = vi.fn(async (input: RequestInfo | URL) => {
    const url = new URL(String(input), "http://localhost");
    const paths = url.pathname.replace("/api/master/trpc/", "").split(",");
    const inputs = JSON.parse(url.searchParams.get("input") ?? "{}") as Record<string, unknown>;
    const results = paths.map((path, index) => {
      calls.push({ path, input: inputs[index] });
      return respond(path, inputs[index]);
    });
    const status = results.find((result) => result.status)?.status ?? 200;
    return new Response(JSON.stringify(results.map((result) => result.body)), { status, headers: { "content-type": "application/json" } });
  });
  const client = createTRPCClient<MasterRouter>({ links: [httpBatchLink({ url: "/api/master/trpc", fetch: createDomainTrpcFetch(fetchStub as typeof fetch) })] });
  return { client, calls, fetchStub };
}

afterEach(() => vi.restoreAllMocks());

describe("IT-MOV-F1 list and items through the tRPC client", () => {
  it("sends the list input, then loads the open page's items in one batched GET and renders them", async () => {
    const listed = [row(), row({ memoReceiveId: DOC_B, docNo: "MR-2", dueInDays: -3 })];
    const { client, calls, fetchStub } = controlledServer((path, input) => {
      if (path === "memoOutstanding.vendorList") return { body: { result: { data: { items: listed, total: 2, page: 1, pageSize: 25 } } } };
      const ids = (input as { memoReceiveIds: string[] }).memoReceiveIds;
      return { body: { result: { data: { items: ids.map((id) => item({ id: `item-${id}`, memoReceiveId: id })) } } } };
    });

    const page = await client.memoOutstanding.vendorList.query(toListInput(emptyListState()));
    expect(calls[0]).toEqual({ path: "memoOutstanding.vendorList", input: { page: 1, pageSize: 25 } });

    const queryClient = new QueryClient();
    const fetchItems = (memoReceiveIds: string[]) => client.memoOutstanding.vendorItems.query({ memoReceiveIds });
    const open = openDocIds(page.items, "expanded", new Set());
    const byDoc = await loadDocItems(queryClient, open, fetchItems);
    await loadDocItems(queryClient, [DOC_A], fetchItems);
    expect(calls.filter((call) => call.path === "memoOutstanding.vendorItems")).toEqual([{ path: "memoOutstanding.vendorItems", input: { memoReceiveIds: [DOC_A, DOC_B] } }]);
    expect(fetchStub).toHaveBeenCalledTimes(2);
    const [, init] = fetchStub.mock.calls[1] as unknown as [string, RequestInit];
    expect(new Headers(init.headers).get("x-gms-csrf")).toBe("1");
    expect(init.credentials).toBe("include");

    const markup = renderToStaticMarkup(createElement(OutstandingTable, {
      entries: page.items.map((entry) => ({ row: entry, items: byDoc.get(entry.memoReceiveId) })),
      prefs: DEFAULT_VIEW, sort: { key: "dueDate", dir: "asc" }, onSort: () => undefined, isOpen: () => true, onToggleOpen: () => undefined,
      itemsLoading: false, itemsError: false, onRetryItems: () => undefined, selected: new Set([`item-${DOC_B}`]), onToggleItem: () => undefined,
    }));
    expect(markup).toContain("MR-1");
    expect(markup).toContain("3d overdue");
    expect(markup.match(/Blue Sapphire/g)).toHaveLength(2);
    expect(markup.match(/type="checkbox"[^>]*checked=""/g)).toHaveLength(1);
  });

  it("reads PERMISSION_DENIED from the server envelope", async () => {
    const { client } = controlledServer(() => ({
      status: 403,
      body: { error: { message: "PERMISSION_DENIED", code: -32603, data: { code: "FORBIDDEN", httpStatus: 403, domainCode: "PERMISSION_DENIED" } } },
    }));
    const error = await client.memoOutstanding.vendorSummary.query({}).catch((caught: unknown) => caught);
    expect(isPermissionDenied(error)).toBe(true);
  });
});
