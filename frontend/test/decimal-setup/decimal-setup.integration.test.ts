import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { createTRPCClient, httpBatchLink } from "@trpc/client";
import { getQueryKey } from "@trpc/react-query";
import { createElement, type ComponentProps, type FunctionComponent, type ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { MasterRouter } from "@gem-crm/backend-api-master/src/master/router";
import { mapSaveError, toSaveInput, type DecimalSetupOutput } from "@/features/decimal-setup/api";
import { DecimalSetupPage } from "@/features/decimal-setup/decimal-setup-page";
import { applySavedSetup, DecimalSetupProvider, decimalSetupQueryKey, useNumberFormat } from "@/features/decimal-setup/number-format-provider";
import { ItemTable } from "@/features/quotation/components/items/ItemTable";
import { calculateTotals } from "@/features/quotation/lib/calculate";
import { emptyLine, emptyQuotation } from "@/features/quotation/lib/defaults";
import { authTrpc, createAuthTrpcClient } from "@/lib/auth-trpc";
import { createDomainTrpcFetch } from "@/lib/domain-trpc-fetch";
import { createMasterTrpcClient, masterTrpc } from "@/lib/master-trpc";

/**
 * IT-DEC-F1…F4 (decimal-setup TODO rev 2, FE-DEC-101…105): the real tRPC link + CSRF fetch wrapper against a
 * controlled `/api/master/trpc` server → React Query cache → DecimalSetupProvider → pages that format numbers.
 */
type Call = { path: string; method: string; input: unknown; csrf: string | null };
type Reply = { status?: number; body: unknown };

const SETUP = (patch: Partial<DecimalSetupOutput["setup"]> = {}): DecimalSetupOutput => ({
  setup: { weightPlaces: 3, pricePlaces: 0, version: 4, updatedAt: "2026-11-03T08:10:00.000Z", updatedBy: "usr_admin", ...patch },
});
const ok = (data: unknown): Reply => ({ body: { result: { data } } });
const fail = (status: number, code: string, domainCode: string): Reply => ({ status, body: { error: { message: domainCode, code: -32000, data: { code, httpStatus: status, domainCode } } } });

function controlledServer(respond: (path: string, input: unknown) => Reply) {
  const calls: Call[] = [];
  const fetchStub = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
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
  });
  const client = createTRPCClient<MasterRouter>({ links: [httpBatchLink({ url: "/api/master/trpc", fetch: createDomainTrpcFetch(fetchStub as typeof fetch) })] });
  return { client, calls };
}

/** The app's provider stack (AppProviders) around `children`, sharing one QueryClient. */
function withProviders(queryClient: QueryClient, children: ReactNode) {
  const authProps = { client: createAuthTrpcClient(), queryClient } as ComponentProps<typeof authTrpc.Provider>;
  const masterProps = { client: createMasterTrpcClient(), queryClient } as ComponentProps<typeof masterTrpc.Provider>;
  return createElement(
    QueryClientProvider,
    { client: queryClient },
    createElement(authTrpc.Provider, authProps, createElement(masterTrpc.Provider, masterProps, children)),
  );
}

const Probe: FunctionComponent = () => {
  const nf = useNumberFormat();
  return createElement("output", null, `places ${nf.weightPlaces}/${nf.pricePlaces} caps ${nf.weightInputDecimals}/${nf.priceInputDecimals}`);
};

const line = { ...emptyLine(), stone: "Ruby", stoneCode: "RU-1", pcs: "2", weightCt: "1.235", unitPrice: "24000.25", priceUnit: "PER_PCS" as const };
const itemTable = createElement(ItemTable, {
  lines: [line],
  currency: "THB",
  totals: calculateTotals({ ...emptyQuotation(), lines: [line] }),
  selectedIndex: null,
  checkedKeys: new Set<string>(),
  readOnly: true,
  onSelectRow: () => undefined,
  onToggleCheck: () => undefined,
  onToggleAll: () => undefined,
  onRowAction: () => undefined,
  onAddRow: () => undefined,
});

afterEach(() => vi.restoreAllMocks());

describe("IT-DEC-F1 get → cache → provider → quotation table", () => {
  it("reads decimalSetup.get once (GET, no input) and every page in the shell shows 3 / 0", async () => {
    const { client, calls } = controlledServer(() => ok(SETUP()));
    const queryClient = new QueryClient();
    const queryKey = decimalSetupQueryKey();
    expect(queryKey).toEqual(getQueryKey(masterTrpc.decimalSetup.get, undefined, "query"));
    await queryClient.fetchQuery({ queryKey, queryFn: () => client.decimalSetup.get.query() });
    expect(calls).toEqual([{ path: "decimalSetup.get", method: "GET", input: undefined, csrf: "1" }]);

    const html = renderToStaticMarkup(withProviders(queryClient, createElement(DecimalSetupProvider, null, createElement(Probe), itemTable)));
    expect(html).toContain("places 3/0 caps 3/0");
    expect(html).toContain("1.235 cts");
    expect(html).toContain("48,001 THB");
    expect(calls).toHaveLength(1);
  });
});

describe("IT-DEC-F2 load failure falls back to 2 / 2 without a banner (Q-DEC-16)", () => {
  it("a 503 leaves the cache in error and the pages keep the defaults", async () => {
    const { client } = controlledServer(() => fail(503, "INTERNAL_SERVER_ERROR", "PARTNER_UNAVAILABLE"));
    const queryClient = new QueryClient();
    await expect(queryClient.fetchQuery({ queryKey: decimalSetupQueryKey(), queryFn: () => client.decimalSetup.get.query(), retry: false })).rejects.toThrow();
    expect(queryClient.getQueryState(decimalSetupQueryKey())?.status).toBe("error");
    const html = renderToStaticMarkup(withProviders(queryClient, createElement(DecimalSetupProvider, null, createElement(Probe), itemTable)));
    expect(html).toContain("places 2/2 caps 2/2");
    expect(html).toContain("48,000.50 THB");
    expect(html).not.toContain('role="alert"');
  });
});

describe("IT-DEC-F3 save: contract, CSRF, conflict and cache update", () => {
  it("sends weight / price / expectedVersion with CSRF; the result re-formats every tab and is re-read", async () => {
    const saved = SETUP({ weightPlaces: 4, pricePlaces: 4, version: 5 });
    const { client, calls } = controlledServer((path) => (path === "decimalSetup.save" ? ok(saved) : ok(SETUP())));
    const queryClient = new QueryClient();
    await queryClient.fetchQuery({ queryKey: decimalSetupQueryKey(), queryFn: () => client.decimalSetup.get.query() });

    const result = await client.decimalSetup.save.mutate(toSaveInput({ weightPlaces: 4, pricePlaces: 4, expectedVersion: 4 }));
    expect(calls.at(-1)).toEqual({ path: "decimalSetup.save", method: "POST", input: { weightPlaces: 4, pricePlaces: 4, expectedVersion: 4 }, csrf: "1" });

    const invalidated = applySavedSetup(queryClient, result);
    const html = renderToStaticMarkup(withProviders(queryClient, createElement(DecimalSetupProvider, null, createElement(Probe), itemTable)));
    expect(html).toContain("places 4/4 caps 3/2");
    expect(html).toContain("1.2350 cts");
    expect(html).toContain("48,000.5000 THB");
    await invalidated;
    expect(queryClient.getQueryState(decimalSetupQueryKey())?.isInvalidated).toBe(true);
  });

  it("409 DECIMAL_SETUP_CHANGED from the server becomes the conflict message with Reload", async () => {
    const { client } = controlledServer(() => fail(409, "CONFLICT", "DECIMAL_SETUP_CHANGED"));
    const error = await client.decimalSetup.save.mutate({ weightPlaces: 3, pricePlaces: 2, expectedVersion: 1 }).catch((caught: unknown) => caught);
    expect(mapSaveError(error)).toEqual({ message: "Someone else changed the decimal setup. Reload to see the latest values.", conflict: true });
    const forbidden = controlledServer(() => fail(403, "FORBIDDEN", "PERMISSION_DENIED"));
    const denied = await forbidden.client.decimalSetup.save.mutate({ weightPlaces: 3, pricePlaces: 2, expectedVersion: 1 }).catch((caught: unknown) => caught);
    expect(mapSaveError(denied)).toMatchObject({ recheckAccess: true });
  });
});

describe("IT-DEC-F4 Decimal Setup page composition (gate, view mode, last updated)", () => {
  const page = (permissions: string[], data: DecimalSetupOutput = SETUP()) => {
    const queryClient = new QueryClient();
    queryClient.setQueryData(getQueryKey(authTrpc.permission.mine, undefined, "query"), { isSuperAdmin: false, permissions });
    queryClient.setQueryData(decimalSetupQueryKey(), data);
    return renderToStaticMarkup(withProviders(queryClient, createElement(DecimalSetupPage)));
  };
  const button = (html: string, label: string) => new RegExp(`<button[^>]*>(?:(?!</button>).)*${label}(?:(?!</button>).)*</button>`).exec(html)?.[0] ?? "";

  it("with decimal-setup VIEW + EDIT: values shown read-only, Edit on, Save / Cancel off, Last updated shown", () => {
    const html = page(["decimal-setup:VIEW", "decimal-setup:EDIT"]);
    expect(html).toContain(">Decimal Setup<");
    expect(html).toContain("Weight (ct) decimals");
    expect(html).toMatch(/<option value="3" selected="">3<\/option>/);
    expect(html).toMatch(/<option value="0" selected="">0<\/option>/);
    expect(html).toContain("Example 1.235 ct");
    expect(html).toContain("Example 12,346");
    expect(html).toContain("Last updated 03/11/2026 15:10");
    expect(button(html, "Edit")).not.toContain('disabled=""');
    expect(button(html, "Save")).toContain('disabled=""');
    expect(button(html, "Cancel")).toContain('disabled=""');
    expect(html.match(/<select[^>]*disabled/g)).toHaveLength(2);
  });

  it("VIEW only: Edit stays off; the seeded row hides Last updated", () => {
    const html = page(["decimal-setup:VIEW"], SETUP({ version: 1, updatedBy: null }));
    expect(button(html, "Edit")).toContain('disabled=""');
    expect(html).not.toContain("Last updated");
  });

  it("without decimal-setup VIEW (Document Setup grants alone no longer open it) the page is refused", () => {
    const html = page(["document-setup:VIEW", "document-setup:EDIT"]);
    expect(html).not.toContain("Weight (ct) decimals");
    expect(html).toMatch(/permission/i);
  });
});
