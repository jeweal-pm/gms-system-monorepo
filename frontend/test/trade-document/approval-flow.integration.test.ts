import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { getQueryKey } from "@trpc/react-query";
import { createElement, isValidElement, type ComponentProps, type ReactElement, type ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { EditReservePage } from "@/features/reserve/components/ReservePage";
import { EditQuotationPage } from "@/features/quotation/components/QuotationPage";
import { useDocumentFlow, type DocumentFlowState } from "@/features/trade-document/approval-flow";
import { daybookState, DocumentDaybook } from "@/features/trade-document/document-api";
import { flowOf, type DocFlow } from "@/features/trade-document/flow-status";
import { authTrpc, createAuthTrpcClient } from "@/lib/auth-trpc";
import { createMasterTrpcClient, masterTrpc } from "@/lib/master-trpc";
import { FLOW_DETAIL } from "./flow-fixture";

/**
 * IT-AS-F01…F05 (approval-setup FE-AS-010 / FE-AS-012, ADR-0050): the shared document flow hook, a document page and
 * the Daybook through the app's provider stack (React Query + auth / master tRPC) and the real tRPC link + CSRF fetch
 * wrapper against a controlled `/api/master/trpc` server that answers in the master error envelope.
 */

vi.mock("next/navigation", () => ({
  usePathname: () => "/pre-sale/reserve",
  useRouter: () => ({ replace: vi.fn(), push: vi.fn() }),
}));
vi.mock("next/link", async () => {
  const { createElement: h } = await import("react");
  return { default: ({ href, children, ...rest }: { href: string; children: unknown }) => h("a", { href, ...rest }, children as never) };
});

type Call = { path: string; method: string; input: unknown; csrf: string | null };
type Reply = { status?: number; body: unknown };
const ok = (data: unknown): Reply => ({ body: { result: { data } } });
const fail = (status: number, domainCode: string, details?: Record<string, unknown>): Reply => ({
  status,
  body: { error: { message: domainCode, code: -32000, data: { code: "CONFLICT", httpStatus: status, domainCode, ...(details ? { details } : {}) } } },
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

const ID = "11111111-1111-4111-8111-111111111111";
const SETTING_KEY = getQueryKey(masterTrpc.approvalSetting.list, undefined, "query");
const setting = (type: string, requireApproval: boolean) => ({ items: [{ type, requireApproval, available: true, version: 2, updatedAt: "2026-11-10T00:00:00.000Z", updatedByName: null, waiting: null }] });

function client(permissions: string[], settingData?: unknown) {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  queryClient.setQueryData(getQueryKey(authTrpc.permission.mine, undefined, "query"), { isSuperAdmin: false, permissions });
  if (settingData) queryClient.setQueryData(SETTING_KEY, settingData);
  return queryClient;
}

type Harness = { state: DocumentFlowState; toasts: string[]; reloads: string[]; errors: unknown[]; confirmed: string[] };

/** Renders the hook once (static) with the real reserve `submit` mutation; the returned handlers then run for real. */
function probe(queryClient: QueryClient, flow: DocFlow, answer = true): Harness {
  const harness: Partial<Harness> = { toasts: [], reloads: [], errors: [], confirmed: [] };
  function Probe() {
    const submit = masterTrpc.reserve.submit.useMutation({ retry: false });
    harness.state = useDocumentFlow({
      type: "reserve",
      saved: { id: ID, docNo: "RS-1", version: 3 },
      flow,
      deleted: false,
      access: { add: true, edit: true, delete: true },
      editing: false,
      dirty: false,
      busy: false,
      submit: (args) => submit.mutateAsync(args),
      confirm: async (request) => {
        harness.confirmed!.push(request.title);
        return answer;
      },
      toast: (message) => harness.toasts!.push(message),
      reload: async (message) => {
        harness.reloads!.push(message);
      },
      onError: (error) => harness.errors!.push(error),
    });
    return null;
  }
  renderToStaticMarkup(withProviders(queryClient, createElement(Probe)));
  return harness as Harness;
}

const draft = (patch: Partial<DocFlow> = {}): DocFlow => ({ status: "DRAFT", autoApproved: false, revisionCount: 0, canEdit: true, canDelete: true, canSubmit: true, usedBy: null, review: null, ...patch });
const click = async (node: ReactNode) => {
  expect(isValidElement(node)).toBe(true);
  await (node as ReactElement<{ onClick: () => Promise<void> | void }>).props.onClick();
  // onSend runs detached (`void onSend()`); let its awaits settle.
  for (let i = 0; i < 20; i++) await new Promise((resolve) => setTimeout(resolve, 0));
};

describe("IT-AS-F01 Send to approve through master tRPC (FE-AS-010)", () => {
  it("asks, then posts reserve.submit {id, expectedVersion} with the CSRF header and reloads with the sent message", async () => {
    respond = (path) => (path === "reserve.submit" ? ok({ id: ID, version: 4, status: "PENDING_APPROVAL", submittedAt: "2026-11-12T03:00:00.000Z" }) : ok(null));
    const harness = probe(client(["reserve:VIEW", "reserve:ADD"], setting("reserve", true)), draft());
    await click(harness.state.sendButton);
    expect(harness.confirmed).toEqual(["Send RS-1 to approve?"]);
    expect(calls).toEqual([{ path: "reserve.submit", method: "POST", input: { id: ID, expectedVersion: 3 }, csrf: "1" }]);
    expect(harness.reloads).toEqual(["Sent RS-1 to approve"]);
    expect(harness.errors).toEqual([]);
  });

  it("a cancelled confirm sends nothing", async () => {
    const harness = probe(client(["reserve:VIEW", "reserve:ADD"], setting("reserve", true)), draft(), false);
    await click(harness.state.sendButton);
    expect(calls).toEqual([]);
    expect(harness.reloads).toEqual([]);
  });

  it("RESERVE_APPROVAL_OFF (stale page): says approval is off, reads the setting again and reloads the document", async () => {
    respond = (path) => {
      if (path === "reserve.submit") return fail(409, "RESERVE_APPROVAL_OFF");
      if (path === "approvalSetting.list") return ok(setting("reserve", false));
      return ok(null);
    };
    const queryClient = client(["reserve:VIEW", "reserve:EDIT"], setting("reserve", true));
    const harness = probe(queryClient, draft());
    await click(harness.state.sendButton);
    expect(harness.toasts).toEqual(["Approval is now off for Reserve. Save to approve it."]);
    expect(calls.map((call) => [call.path, call.method])).toEqual([["reserve.submit", "POST"], ["approvalSetting.list", "GET"]]);
    expect((queryClient.getQueryData(SETTING_KEY) as ReturnType<typeof setting>).items[0].requireApproval).toBe(false);
    expect(harness.reloads).toEqual(["Approval is now off for Reserve. Save to approve it."]);
    expect(harness.errors).toEqual([]);
  });

  it("any other error goes to the page's own mapping (stale version)", async () => {
    respond = () => fail(409, "RESERVE_CHANGED");
    const harness = probe(client(["reserve:VIEW", "reserve:ADD"], setting("reserve", true)), draft());
    await click(harness.state.sendButton);
    expect(harness.errors).toHaveLength(1);
    expect(harness.toasts).toEqual([]);
  });
});

describe("IT-AS-F02 Save / Delete errors from the master envelope (error-handling.md)", () => {
  it("RESERVE_IN_USE names the using document from data.details and reloads read-only", async () => {
    respond = () => fail(409, "RESERVE_IN_USE", { usedBy: "MO-2611004 (deleted)" });
    const harness = probe(client(["reserve:VIEW", "reserve:DELETE"], setting("reserve", false)), draft({ status: "APPROVED", autoApproved: true }));
    const error = await createMasterTrpcClient().reserve.delete.mutate({ id: ID, expectedVersion: 3 }).catch((e: unknown) => e);
    expect(calls).toEqual([{ path: "reserve.delete", method: "POST", input: { id: ID, expectedVersion: 3 }, csrf: "1" }]);
    expect(await harness.state.handleError(error, "delete")).toBe(true);
    expect(harness.toasts).toEqual(["RS-1 can't be changed: its items are used in MO-2611004 (deleted)."]);
    expect(harness.reloads).toHaveLength(1);
  });

  it("RESERVE_STATUS_INVALID reloads; an unrelated code is not handled", async () => {
    respond = () => fail(403, "PERMISSION_DENIED");
    const harness = probe(client(["reserve:VIEW", "reserve:EDIT"], setting("reserve", true)), draft());
    const api = createMasterTrpcClient();
    const denied = await api.reserve.delete.mutate({ id: ID, expectedVersion: 3 }).catch((e: unknown) => e);
    expect(await harness.state.handleError(denied, "delete")).toBe(false);
    respond = () => fail(409, "RESERVE_STATUS_INVALID");
    const invalid = await api.reserve.delete.mutate({ id: ID, expectedVersion: 3 }).catch((e: unknown) => e);
    expect(await harness.state.handleError(invalid, "save")).toBe(true);
    expect(harness.toasts).toEqual(["RS-1 can't be changed in its current status."]);
  });
});

const reserveDetail = (patch: Record<string, unknown> = {}) => ({
  id: ID, docNo: "RS-1", status: "PENDING_APPROVAL", version: 3, docDate: "2026-11-12", dueDate: "2026-12-12",
  customerId: ID, customer: { code: "C001", name: "Aom" }, shippingAddressId: ID, shippingAddressText: "S", invoiceAddressId: null, invoiceAddressText: "I",
  currency: "THB", exchangeRate: null, ref: "", documentNote: "", lines: [], discount: { type: "NONE", value: "0" },
  tax: { enabled: false, rate: "7", includeInPrice: false }, serviceCharges: [], labor: null,
  totals: { subtotal: "0.00", discountAmount: "0.00", priceBeforeTax: "0.00", taxAmount: "0.00", chargesAmount: "0.00", laborAmount: "0.00", grandTotal: "0.00" },
  approvedAt: null, approvedBy: null, createdAt: "", createdBy: "", updatedAt: "", deletedAt: null, deletedBy: null,
  ...FLOW_DETAIL, canEdit: false, canDelete: false, ...patch,
});
const button = (html: string, label: string) => new RegExp(`<button[^>]*>(?:(?!</button>).)*${label}(?:(?!</button>).)*</button>`).exec(html)?.[0] ?? "";

describe("IT-AS-F03 Reserve page (approval ON) through the route component", () => {
  const ALL = ["reserve:VIEW", "reserve:ADD", "reserve:EDIT", "reserve:DELETE", "reserve:APPROVE"];
  const page = (detail: ReturnType<typeof reserveDetail>, permissions = ALL, settingData: unknown = setting("reserve", true)) => {
    const queryClient = client(permissions, settingData);
    queryClient.setQueryData(getQueryKey(masterTrpc.reserve.get, { id: ID }, "query"), detail);
    return renderToStaticMarkup(withProviders(queryClient, createElement(EditReservePage, { id: ID })));
  };

  it("Pending: no Approve button even with reserve:APPROVE, no Edit / Delete, read-only text", () => {
    const html = page(reserveDetail());
    expect(html).toContain("Pending Approval");
    expect(html).toContain("Waiting for approval");
    expect(html).not.toContain("lucide-circle-check");
    expect(button(html, "Send to approve")).toBe("");
    expect(button(html, "> Delete")).toBe("");
  });

  it("Draft: Draft badge, Edit / Delete and Send to approve enabled", () => {
    const html = page(reserveDetail({ status: "DRAFT", canEdit: true, canDelete: true, canSubmit: true, submittedAt: null }));
    expect(html).toContain(">Draft<");
    expect(button(html, "Send to approve")).not.toContain('disabled=""');
    expect(button(html, "> Edit")).not.toContain('disabled=""');
    expect(button(html, "> Delete")).not.toContain('disabled=""');
  });

  it("flowOf(get) feeds the page: the server flags decide Edit even with the grant", () => {
    const detail = reserveDetail({ status: "DRAFT", canEdit: false, canDelete: false, canSubmit: true });
    expect(flowOf(detail as never)).toMatchObject({ status: "DRAFT", canEdit: false });
    expect(button(page(detail), "> Edit")).toContain('disabled=""');
  });
});

describe("IT-AS-F04 Quotation page (approval OFF by default)", () => {
  const quotation = (patch: Record<string, unknown> = {}) => ({ ...reserveDetail({ docNo: "QT-1", status: "APPROVED", autoApproved: true, canEdit: true, canDelete: true }), statusReason: null, ...patch });
  const page = (detail: Record<string, unknown>, settingData: unknown = setting("quotation", false)) => {
    const queryClient = client(["quotation:VIEW", "quotation:ADD", "quotation:EDIT", "quotation:DELETE"], settingData);
    queryClient.setQueryData(getQueryKey(masterTrpc.quotation.get, { id: ID }, "query"), detail);
    return renderToStaticMarkup(withProviders(queryClient, createElement(EditQuotationPage, { id: ID })));
  };

  it("an auto-approved quotation stays editable and deletable; no Send to approve while OFF", () => {
    const html = page(quotation());
    expect(html).toContain(">Approved<");
    expect(button(html, "> Edit")).not.toContain('disabled=""');
    expect(button(html, "> Delete")).not.toContain('disabled=""');
    expect(button(html, "Send to approve")).toBe("");
  });

  it("Quotation ON: a Draft offers Send to approve", () => {
    const html = page(quotation({ status: "DRAFT", autoApproved: false, canSubmit: true }), setting("quotation", true));
    expect(button(html, "Send to approve")).not.toContain('disabled=""');
  });
});

describe("IT-AS-F05 Daybook rows from reserve.list (FE-AS-012)", () => {
  it("one row per document with the latest status dot and the revise / reject reason under the customer", async () => {
    const items = [
      { id: "1", docNo: "RS-4", docDate: "2026-11-12", status: "REVISION_REQUESTED", customerName: "Aom", autoApproved: false, revisionCount: 1, review: { action: "REVISE", note: "Wrong weight", at: "2026-11-12T01:00:00.000Z", byName: "Boss" } },
      { id: "2", docNo: "RS-3", docDate: "2026-11-11", status: "PENDING_APPROVAL", customerName: "Ben", autoApproved: false, revisionCount: 0, review: null },
      { id: "3", docNo: "RS-2", docDate: "2026-11-10", status: "APPROVED", customerName: "Cat", autoApproved: false, revisionCount: 0, review: null },
      { id: "4", docNo: "RS-1", docDate: "2026-11-09", status: "REJECTED", customerName: "Dan", autoApproved: false, revisionCount: 0, review: { action: "REJECT", note: "Duplicate", at: "2026-11-10T01:00:00.000Z", byName: "Boss" } },
    ];
    respond = (path) => (path === "reserve.list" ? ok({ items, nextCursor: null, total: 4 }) : ok(null));
    const page = await createMasterTrpcClient().reserve.list.query({ limit: 50 });
    expect(calls.map((call) => call.path)).toEqual(["reserve.list"]);
    const state = daybookState(
      { isPending: false, isError: false, error: null, hasNextPage: false, isFetchingNextPage: false, fetchNextPage: () => undefined, data: { pages: [page] } },
      () => "x",
      (item) => String(item.customerName ?? ""),
    );
    const html = renderToStaticMarkup(createElement(DocumentDaybook, { plural: "reserves", href: (id) => `/pre-sale/reserve/${id}`, state, requireApproval: true }));
    expect(html.match(/<li>/g)).toHaveLength(4);
    expect(html).toContain('title="Revise"');
    expect(html).toContain('title="Pending approval"');
    expect(html).toContain('title="Approved"');
    expect(html).toContain('title="Rejected"');
    expect(html).toContain(">Wrong weight<");
    expect(html).toContain(">Duplicate<");
  });
});
