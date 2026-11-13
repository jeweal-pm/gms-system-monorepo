import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { getQueryKey } from "@trpc/react-query";
import { createElement, isValidElement, type ComponentProps, type ReactElement, type ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import PurchaseRoutePage from "@/app/(app)/purchase-order/purchase/page";
import {
  emptyPurchase,
  fromPurchase,
  mapPurchaseSaveError,
  purchaseRestoreError,
  memoStockToPurchaseLine,
  pickedSourceKeys,
  purchaseOrderLineToPurchaseLine,
  toPurchaseInput,
  usePurchaseApi,
  type PurchaseFormValues,
} from "@/features/purchase/api";
import { EditPurchasePage, MemoStockPickStep, PURCHASE_CONFIG } from "@/features/purchase/components/PurchasePage";
import { MemoStockPicker, pickerInput, PurchaseOrderPicker } from "@/features/purchase/components/purchase-pickers";
import { todayIso } from "@/features/quotation/lib/format";
import { daybookInput } from "@/features/trade-document/document-api";
import { MemoStockModal } from "@/features/trade-document/memo-stock-modal";
import { memoStockInput } from "@/features/trade-document/memo-stock-api";
import { authTrpc, createAuthTrpcClient } from "@/lib/auth-trpc";
import { createMasterTrpcClient, masterTrpc } from "@/lib/master-trpc";
import { ID, memoRow, POL, poRow, savedPurchase, STOCK } from "./fixtures";

/**
 * IT-PU-01…04 (purchase FE-PU-003/004/005/008/009/010 on SA rev 1): the route pages and the purchase API through the
 * app's provider stack (React Query + auth / master tRPC) and the real tRPC link + CSRF fetch wrapper against a
 * controlled `/api/master/trpc` server. Static renders read seeded caches under the hooks' real query keys.
 */

vi.mock("next/navigation", () => ({
  usePathname: () => "/purchase-order/purchase",
  useRouter: () => ({ replace: vi.fn(), push: vi.fn() }),
}));

type Call = { path: string; method: string; input: unknown; csrf: string | null };
type Reply = { status?: number; body: unknown };
const ok = (data: unknown): Reply => ({ body: { result: { data } } });
const fail = (status: number, code: string, domainCode: string, fieldErrors?: { path: string; code: string }[]): Reply => ({
  status,
  body: { error: { message: domainCode, code: -32000, data: { code, httpStatus: status, domainCode, ...(fieldErrors ? { fieldErrors } : {}) } } },
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

const VENDORS = { vendors: [{ id: ID, code: "V001", name: "Aom", active: true, currency: "THB", addresses: [{ id: ID, label: "Head office", isDefault: true }] }] };
function seeded(permissions: string[]) {
  const queryClient = new QueryClient();
  queryClient.setQueryData(getQueryKey(authTrpc.permission.mine, undefined, "query"), { isSuperAdmin: false, permissions });
  queryClient.setQueryData(getQueryKey(masterTrpc.currency.options, undefined, "query"), {
    items: [{ code: "THB", name: "Thai Baht", active: true, sellingRate: null, buyingRate: null }, { code: "USD", name: "US Dollar", active: true, sellingRate: "36.5", buyingRate: "35.9" }],
    baseCode: "THB",
  });
  queryClient.setQueryData(getQueryKey(masterTrpc.purchase.options, {}, "query"), { ...VENDORS, companyCurrency: "THB", numbering: { configured: false } });
  queryClient.setQueryData(getQueryKey(masterTrpc.purchase.options, { vendorId: ID }, "query"), { ...VENDORS, companyCurrency: "THB", numbering: { configured: false } });
  queryClient.setQueryData(getQueryKey(masterTrpc.purchase.nextNumber, { docDate: todayIso() }, "query"), { docNo: "PU-8" });
  return queryClient;
}

const decoded = (html: string) => html.replaceAll("&#x27;", "'").replaceAll("&amp;", "&");
const render = (queryClient: QueryClient, element: ReactElement) => decoded(renderToStaticMarkup(withProviders(queryClient, element)));
/** approval-setup: seeds `approvalSetting.list` (Purchase ON / OFF) under its real query key. */
function withSetting(queryClient: QueryClient, requireApproval: boolean) {
  queryClient.setQueryData(getQueryKey(masterTrpc.approvalSetting.list, undefined, "query"), {
    items: [{ type: "purchase", requireApproval, available: true, version: 1, updatedAt: "2026-11-10T00:00:00.000Z", updatedByName: null, waiting: null }],
  });
  return queryClient;
}

const button = (html: string, label: string) => new RegExp(`<button[^>]*>(?:(?!</button>).)*${label}(?:(?!</button>).)*</button>`).exec(html)?.[0] ?? "";
const ALL = ["purchase:VIEW", "purchase:ADD", "purchase:EDIT", "purchase:DELETE", "purchase:APPROVE"];

/** Captures the hooks after one render; the calls then go through the real link to the controlled server. */
function probe(queryClient: QueryClient, docDate = "2026-11-04", isNew = true) {
  const captured: { api?: ReturnType<typeof usePurchaseApi>; utils?: ReturnType<typeof masterTrpc.useUtils> } = {};
  function Probe() {
    captured.api = usePurchaseApi(undefined, docDate, isNew);
    captured.utils = masterTrpc.useUtils();
    return null;
  }
  renderToStaticMarkup(withProviders(queryClient, createElement(Probe)));
  return captured as Required<typeof captured>;
}

const validValues = (): PurchaseFormValues => ({
  ...emptyPurchase(),
  docDate: "2026-11-04",
  dueDate: "2026-12-04",
  vendorId: ID,
  addressId: ID,
  currency: "THB",
  lines: [memoStockToPurchaseLine(memoRow()), purchaseOrderLineToPurchaseLine(poRow()), ...emptyPurchase().lines.slice(2)],
});

describe("IT-PU-02 purchase page composition (rev 2, wired)", () => {
  it("new purchase: number preview, header, both item buttons active, Price column, design empty-row text, note 0 / 250, no 'can't save' line", () => {
    const html = render(seeded(["purchase:VIEW", "purchase:ADD"]), createElement(PurchaseRoutePage));
    expect(html).toContain("Purchase No.:");
    expect(html).toContain("PU-8");
    expect(html).toContain("Number preview");
    for (const label of ["Doc Date", "Vendor", "Address", "Due Date", "Currency", "Exchange Rate", "Ref."]) expect(html).toContain(`>${label}`);
    expect(html).not.toContain("Vender");
    expect(html).not.toContain("can't be saved yet");
    expect(html).toContain("5 rows");
    expect(button(html, "Memo Stock")).not.toContain('disabled=""');
    expect(button(html, "Purchase Order")).not.toContain('disabled=""');
    expect(html).toContain('title="Pick open lines from this vendor\'s approved purchase orders"');
    expect(html).toContain(">Price<");
    expect(html).not.toContain("Sale Price");
    expect(html.match(/Empty row · click to enter details, or use Memo Stock and Purchase Order to populate\./g)).toHaveLength(5);
    expect(html).toContain("0 / 250");
    expect(html).toContain("Printed on the purchase for the vendor");
    expect(button(html, "Save")).not.toContain('disabled=""');
    expect(button(html, "Edit")).toContain('disabled=""');
    expect(calls).toEqual([]);
  });

  it("without purchase VIEW the page is refused", () => {
    const html = render(seeded(["memo-return:VIEW", "purchase-order:VIEW"]), createElement(PurchaseRoutePage));
    expect(html).toContain("You don't have permission to view purchases.");
    expect(html).not.toContain("Purchase No.:");
  });

  it("FE-AS-010 a Pending purchase is read-only: no Approve, no Edit / Delete / Send to approve, and says why", () => {
    const queryClient = seeded(ALL);
    queryClient.setQueryData(getQueryKey(masterTrpc.purchase.get, { id: ID }, "query"), savedPurchase());
    const html = render(queryClient, createElement(EditPurchasePage, { id: ID }));
    expect(html).toContain("PU-7");
    expect(html).toContain("Pending Approval");
    expect(html).toContain("Waiting for approval · Read-only until it is approved, sent back or rejected");
    expect(html).toContain(">260003 · In stock<");
    // FE-PU-014 (ADR-0051): purchase.get returns stockId null for PO / manual rows; they show "—".
    expect(html).toContain(">— · from PO2611001<");
    expect(html).not.toContain("260012");
    expect(html).not.toContain("260011");
    expect(html).not.toMatch(/>Auto(?: · from [^<]*)?</);
    expect(html).toContain("3 rows");
    expect(button(html, "lucide-circle-check")).toBe("");
    expect(html).not.toMatch(/<button[^>]*>(?:(?!<\/button>).)*> Approve<\/button>/);
    expect(button(html, "Send to approve")).toBe("");
    expect(html).not.toMatch(/<button[^>]*>(?:(?!<\/button>).)*>Delete<\/button>/);
    expect(button(html, "Purchase Order")).toContain('disabled=""');
  });

  it("an approved (reviewed) purchase is read-only: no Approve, no Edit / Delete", () => {
    const queryClient = seeded(ALL);
    queryClient.setQueryData(getQueryKey(masterTrpc.purchase.get, { id: ID }, "query"), savedPurchase({ status: "APPROVED", version: 4 }));
    const html = render(queryClient, createElement(EditPurchasePage, { id: ID }));
    expect(html).toContain("Approved");
    expect(html).toContain("Approved · Read-only");
    expect(button(html, "lucide-circle-check")).toBe("");
    expect(html).not.toMatch(/<button[^>]*>(?:(?!<\/button>).)*>Delete<\/button>/);
  });

  it("FE-AS-010 approval ON: a Draft shows Draft, Edit / Delete and an enabled Send to approve (ADD or EDIT)", () => {
    const queryClient = withSetting(seeded(["purchase:VIEW", "purchase:ADD", "purchase:EDIT", "purchase:DELETE"]), true);
    queryClient.setQueryData(getQueryKey(masterTrpc.purchase.get, { id: ID }, "query"), savedPurchase({ status: "DRAFT", canEdit: true, canDelete: true, canSubmit: true, submittedAt: null, submittedByName: null }));
    const html = render(queryClient, createElement(EditPurchasePage, { id: ID }));
    expect(html).toContain(">Draft<");
    expect(button(html, "Send to approve")).not.toContain('disabled=""');
    expect(button(html, "> Edit")).not.toContain('disabled=""');
    expect(button(html, "> Delete")).not.toContain('disabled=""');
    // VIEW only: Send to approve is not offered.
    const viewer = withSetting(seeded(["purchase:VIEW"]), true);
    viewer.setQueryData(getQueryKey(masterTrpc.purchase.get, { id: ID }, "query"), savedPurchase({ status: "DRAFT", canEdit: false, canDelete: false, canSubmit: false }));
    expect(button(render(viewer, createElement(EditPurchasePage, { id: ID })), "Send to approve")).toBe("");
  });

  it("FE-AS-010 a sent-back purchase shows the revise reason and can be sent again once", () => {
    const queryClient = withSetting(seeded(ALL), true);
    const review = { action: "REVISE", note: "Check row 2 weight", at: "2026-11-05T03:00:00.000Z", byName: "Boss" };
    queryClient.setQueryData(getQueryKey(masterTrpc.purchase.get, { id: ID }, "query"), savedPurchase({ status: "REVISION_REQUESTED", revisionCount: 1, canEdit: true, canDelete: true, canSubmit: true, review }));
    const html = render(queryClient, createElement(EditPurchasePage, { id: ID }));
    expect(html).toContain(">Revise<");
    expect(html).toContain("Revise: Check row 2 weight");
    expect(button(html, "Send to approve")).not.toContain('disabled=""');
    expect(button(html, "> Edit")).not.toContain('disabled=""');
  });

  it("FE-AS-010 a rejected purchase is final: the reason, no Edit / Delete / Send to approve", () => {
    const queryClient = withSetting(seeded(ALL), true);
    const review = { action: "REJECT", note: "Wrong vendor", at: "2026-11-05T03:00:00.000Z", byName: "Boss" };
    queryClient.setQueryData(getQueryKey(masterTrpc.purchase.get, { id: ID }, "query"), savedPurchase({ status: "REJECTED", review }));
    const html = render(queryClient, createElement(EditPurchasePage, { id: ID }));
    expect(html).toContain(">Rejected<");
    expect(html).toContain("Reason: Wrong vendor · Read-only");
    expect(button(html, "Send to approve")).toBe("");
    expect(html).not.toMatch(/<button[^>]*>(?:(?!<\/button>).)*>Delete<\/button>/);
  });

  it("FE-AS-010 approval OFF: an auto-approved purchase stays editable until used; once used it says where", () => {
    const queryClient = withSetting(seeded(ALL), false);
    queryClient.setQueryData(getQueryKey(masterTrpc.purchase.get, { id: ID }, "query"), savedPurchase({ status: "APPROVED", autoApproved: true, canEdit: true, canDelete: true }));
    const html = render(queryClient, createElement(EditPurchasePage, { id: ID }));
    expect(html).toContain(">Approved<");
    expect(html).not.toContain("Read-only");
    expect(button(html, "> Edit")).not.toContain('disabled=""');
    expect(button(html, "> Delete")).not.toContain('disabled=""');
    expect(button(html, "Send to approve")).toBe("");
    const used = withSetting(seeded(ALL), false);
    used.setQueryData(getQueryKey(masterTrpc.purchase.get, { id: ID }, "query"), savedPurchase({ status: "APPROVED", autoApproved: true, usedBy: { docNo: "LS-1 (deleted)" } }));
    const usedHtml = render(used, createElement(EditPurchasePage, { id: ID }));
    expect(usedHtml).toContain("Used in LS-1 (deleted) · Read-only");
    expect(usedHtml).not.toMatch(/<button[^>]*>(?:(?!<\/button>).)*>Delete<\/button>/);
    // A Draft left from before the switch: Save approves it; no Send to approve while OFF.
    const draft = withSetting(seeded(ALL), false);
    draft.setQueryData(getQueryKey(masterTrpc.purchase.get, { id: ID }, "query"), savedPurchase({ status: "DRAFT", canEdit: true, canDelete: true, canSubmit: false }));
    expect(button(render(draft, createElement(EditPurchasePage, { id: ID })), "Send to approve")).toBe("");
  });

  it("IT-SD-F01 a soft-deleted purchase: banner, every write control off, Restore only with DELETE", () => {
    const deletedPurchase = savedPurchase({ version: 4, deletedAt: "2026-11-06T04:20:33.572Z", deletedBy: "someone-else" });
    const queryClient = seeded(ALL);
    queryClient.setQueryData(getQueryKey(masterTrpc.purchase.get, { id: ID }, "query"), deletedPurchase);
    const html = render(queryClient, createElement(EditPurchasePage, { id: ID }));
    expect(html).toContain("Deleted by another user on 06/11/2026 11:20");
    expect(html).toContain('role="status" tabindex="0"');
    expect(button(html, "Restore")).not.toBe("");
    expect(button(html, "lucide-circle-check")).toBe("");
    expect(html).not.toMatch(/<button[^>]*>(?:(?!<\/button>).)*> Edit<\/button>/);
    expect(html).not.toMatch(/<button[^>]*>(?:(?!<\/button>).)*>Delete<\/button>/);
    expect(button(html, "Save")).toContain('disabled=""');
    // Header fields, rows and the note sit in disabled fieldsets; both item pickers are disabled.
    expect(html).not.toMatch(/<fieldset(?![^>]*disabled)[^>]*>/);
    expect(button(html, "Memo Stock")).toContain('disabled=""');
    expect(button(html, "Purchase Order")).toContain('disabled=""');

    const viewer = seeded(["purchase:VIEW", "purchase:EDIT"]);
    viewer.setQueryData(getQueryKey(masterTrpc.purchase.get, { id: ID }, "query"), deletedPurchase);
    expect(button(render(viewer, createElement(EditPurchasePage, { id: ID })), "Restore")).toBe("");
  });
});

describe("IT-SD-F02 restore and the deleted daybook through the real link (FE-SD-001/003)", () => {
  it("restore → POST purchase.restore with { id, expectedVersion } and CSRF; STATUS_INVALID maps to \"no longer deleted\"", async () => {
    respond = (path) => (path === "purchase.restore" ? ok({ id: ID, version: 5, status: "PENDING_APPROVAL" }) : ok(null));
    const { api } = probe(seeded(ALL));
    await expect(api.restore({ id: ID, expectedVersion: 4 })).resolves.toEqual({ id: ID, version: 5, status: "PENDING_APPROVAL" });
    expect(calls).toEqual([{ path: "purchase.restore", method: "POST", input: { id: ID, expectedVersion: 4 }, csrf: "1" }]);
    respond = () => fail(409, "CONFLICT", "PURCHASE_STATUS_INVALID");
    const error = await api.restore({ id: ID, expectedVersion: 5 }).catch((caught: unknown) => caught);
    expect(purchaseRestoreError(error)).toEqual({ message: "This purchase is no longer deleted.", refetch: true });
  });

  it("the daybook asks list without deleted (active only) and no cursor", async () => {
    respond = (_path, input) => ok({ items: [], nextCursor: (input as { cursor?: string }).cursor ? null : "c2", total: 1 });
    const { utils } = probe(seeded(ALL));
    await utils.purchase.list.fetchInfinite(daybookInput());
    expect(calls[0]).toMatchObject({ path: "purchase.list", method: "GET", input: { limit: 50 } });
    expect(calls[0]?.input).not.toHaveProperty("deleted");
    expect(calls[0]?.input).not.toHaveProperty("cursor");
  });
});

describe("IT-PU-01 purchase API wiring (FE-PU-003, SA rev 1 contract)", () => {
  it("create → POST purchase.create with the contract input and CSRF; the result has the number and Stock IDs", async () => {
    respond = (path) => (path === "purchase.create" ? ok({ id: ID, docNo: "PU-8", version: 1, stockIds: ["260003", null] }) : ok(null));
    const { api } = probe(seeded(ALL));
    const input = toPurchaseInput(validValues());
    await expect(api.create(input)).resolves.toEqual({ id: ID, docNo: "PU-8", version: 1, stockIds: ["260003", null] });
    expect(calls).toHaveLength(1);
    expect(calls[0]).toMatchObject({ path: "purchase.create", method: "POST", csrf: "1" });
    expect(calls[0]!.input).toMatchObject({
      vendorId: ID, addressId: ID, currency: "THB",
      lines: [
        { source: "STOCK", memoStockId: STOCK, memoGroup: "IN_STOCK", purchaseOrderLineId: null, discount: { type: "NONE", value: "0" }, photoIds: [] },
        { source: "PURCHASE_ORDER", purchaseOrderLineId: POL, memoStockId: null, memoGroup: null, pcs: 6, weightCt: "3.000", unitPrice: "950.00" },
      ],
    });
  });

  it("get → fromPurchase → update sends the saved line ids and expectedVersion; delete and Send to approve (submit) carry the version", async () => {
    respond = (path) => {
      if (path === "purchase.get") return ok(savedPurchase());
      if (path === "purchase.update") return ok({ id: ID, version: 4, stockIds: ["260003", null, null] });
      if (path === "purchase.delete") return ok({ ok: true });
      if (path === "purchase.submit") return ok({ id: ID, version: 4, status: "PENDING_APPROVAL", submittedAt: "2026-11-12T03:00:00.000Z" });
      return ok(null);
    };
    const { api, utils } = probe(seeded(ALL), "2026-11-04", false);
    const values = fromPurchase(await utils.purchase.get.fetch({ id: ID }));
    await api.update({ ...toPurchaseInput(values), id: ID, expectedVersion: 3 });
    const update = calls.find((call) => call.path === "purchase.update")!;
    expect(update).toMatchObject({ method: "POST", csrf: "1", input: { id: ID, expectedVersion: 3 } });
    expect((update.input as { lines: { id?: string; source: string }[] }).lines.map((line) => [line.id, line.source])).toEqual([
      ["66666666-6666-4666-8666-666666666666", "STOCK"],
      ["77777777-7777-4777-8777-777777777777", "PURCHASE_ORDER"],
      ["55555555-5555-4555-8555-555555555555", "MANUAL"],
    ]);
    await api.remove({ id: ID, expectedVersion: 3 });
    await expect(api.submit({ id: ID, expectedVersion: 3 })).resolves.toMatchObject({ status: "PENDING_APPROVAL", version: 4 });
    expect(calls.filter((call) => call.method === "POST").map((call) => [call.path, call.input])).toEqual([
      ["purchase.update", update.input],
      ["purchase.delete", { id: ID, expectedVersion: 3 }],
      ["purchase.submit", { id: ID, expectedVersion: 3 }],
    ]);
    expect(calls.some((call) => call.path === "purchase.nextNumber")).toBe(false);
  });

  it("Save with approval OFF short → PURCHASE_PENDING_SHORT row errors; save over the cap → VALIDATION_ERROR exceeds_available; conflict → PURCHASE_CHANGED", async () => {
    respond = (path) => {
      if (path === "purchase.update" && (calls.filter((call) => call.path === "purchase.update").length === 1)) return fail(409, "CONFLICT", "PURCHASE_PENDING_SHORT", [{ path: "lines.1.pcs", code: "exceeds_available" }]);
      if (path === "purchase.create") return fail(400, "BAD_REQUEST", "VALIDATION_ERROR", [{ path: "lines.0.weightCt", code: "exceeds_available" }]);
      if (path === "purchase.update") return fail(409, "CONFLICT", "PURCHASE_CHANGED");
      return ok(null);
    };
    const { api } = probe(seeded(ALL));
    const approve = mapPurchaseSaveError(await api.update({ ...toPurchaseInput(validValues()), id: ID, expectedVersion: 1 }).catch((error: unknown) => error));
    expect(approve).toEqual({ fieldErrors: [{ name: "lines.1.pcs", message: "More than the available quantity" }], message: "Row 2: not enough is available any more. Lower the quantity or remove the row, then save again. Nothing was saved." });
    const save = mapPurchaseSaveError(await api.create(toPurchaseInput(validValues())).catch((error: unknown) => error));
    expect(save.message).toBe("Row 1: more than the available quantity. Nothing was saved.");
    const stale = mapPurchaseSaveError(await api.update({ ...toPurchaseInput(validValues()), id: ID, expectedVersion: 1 }).catch((error: unknown) => error));
    expect(stale.message).toBe("This purchase was changed by someone else. Refresh to see the latest.");
  });

  it("invalidate after a write marks purchase.*, purchaseOrder.get and memoOutstanding.* stale, and nothing else", async () => {
    const queryClient = seeded(ALL);
    const keys = {
      list: getQueryKey(masterTrpc.purchase.list, { limit: 50 }, "query"),
      picker: getQueryKey(masterTrpc.purchase.memoStock, pickerInput(ID, "THB", { status: "ALL" as const, q: "", from: "", to: "" }), "infinite"),
      po: getQueryKey(masterTrpc.purchaseOrder.get, { id: ID }, "query"),
      outstanding: getQueryKey(masterTrpc.memoOutstanding.vendorSummary, {} as never, "query"),
      other: getQueryKey(masterTrpc.quotation.list, { limit: 50 }, "query"),
    };
    for (const key of Object.values(keys)) queryClient.setQueryData(key, {});
    const { api } = probe(queryClient);
    await api.invalidate();
    const stale = (key: readonly unknown[]) => queryClient.getQueryState(key)?.isInvalidated;
    expect([stale(keys.list), stale(keys.picker), stale(keys.po), stale(keys.outstanding)]).toEqual([true, true, true, true]);
    expect(stale(keys.other)).toBe(false);
  });
});

/** The picker element a config renders: `<Suspense><Lazy …/></Suspense>`. */
const lazyChild = (node: ReactNode) => {
  expect(isValidElement(node)).toBe(true);
  return (node as ReactElement<{ children: ReactElement<Record<string, unknown>> }>).props.children;
};

describe("IT-PU-03 Add Memo Stock wired (FE-PU-004)", () => {
  const input = pickerInput(ID, "THB", { status: "ALL" as const, q: "", from: "", to: "" });

  it("purchase.memoStock: the input carries status / q / from / to / limit and the next page's cursor", async () => {
    respond = (path, received) => (path === "purchase.memoStock"
      ? ok({ items: [memoRow()], nextCursor: (received as { cursor?: string }).cursor ? null : "MHwyMDI2LTEwLTI5fDI2MDAwMw", counts: { all: 2, sold: 0, inStock: 2 } })
      : ok(null));
    const { utils } = probe(seeded(ALL));
    const filtered = pickerInput(ID, "THB", { status: "IN_STOCK" as const, q: "2600", from: "2026-10-01", to: "2026-10-31" });
    await utils.purchase.memoStock.fetchInfinite(filtered);
    expect(calls[0]).toMatchObject({ path: "purchase.memoStock", method: "GET", input: { vendorId: ID, currency: "THB", status: "IN_STOCK", q: "2600", from: "2026-10-01", to: "2026-10-31", limit: 50 } });
    const queryClient = seeded(ALL);
    const second = probe(queryClient);
    await second.utils.purchase.memoStock.fetchInfinite(input, { pages: 2, getNextPageParam: (page) => page.nextCursor ?? undefined });
    expect(calls.slice(1).map((call) => (call.input as { cursor?: string }).cursor ?? null)).toEqual([null, "MHwyMDI2LTEwLTI5fDI2MDAwMw"]);
  });

  it("the dialog reads the hook's cache: counts, In stock group, rows, Load more; picked rows left out", () => {
    const queryClient = seeded(ALL);
    queryClient.setQueryData(getQueryKey(masterTrpc.purchase.memoStock, input, "infinite"), {
      pages: [{ items: [memoRow(), memoRow({ key: "x:IN_STOCK", memoStockId: "x", stockId: "260002" })], nextCursor: "next", counts: { all: 3, sold: 0, inStock: 3 } }],
      pageParams: [null],
    });
    const html = render(queryClient, createElement(MemoStockPicker, { vendorId: ID, currency: "THB", excluded: new Set(["x:IN_STOCK"]), onCancel: () => undefined, onConfirm: () => undefined }));
    expect(html).toContain(">Add Memo Stock</h2>");
    expect(html).toContain('aria-label="All, 3"');
    expect(html).toContain('aria-label="Sold, 0"');
    expect(html).toContain("Still in stock on memo · buy now or return later");
    expect(html).not.toContain("Sold to customers");
    expect(html).toContain(">260003 · L-2607-007</div>");
    expect(html).not.toContain(">260002 · L-2607-007</div>");
    expect(html).toContain("Load more");
    expect(calls).toEqual([]);
  });

  it("the page's Memo Stock button: picked rows are left out, OK maps rows to purchase lines for the shared form", () => {
    const values = { ...validValues(), lines: [memoStockToPurchaseLine(memoRow())] };
    const onAdd = vi.fn();
    // rev 3: the button opens the pick step that asks the merge question (R3-01) around the Memo Stock picker.
    const step = lazyChild(PURCHASE_CONFIG.picker!.render({ values, onClose: () => undefined, onAdd }));
    expect(step.type).toBe(MemoStockPickStep);
    expect(step.props).toMatchObject({ values, onAdd });
    expect([...pickedSourceKeys(values.lines)]).toEqual([`${STOCK}:IN_STOCK`]);
    expect(memoStockToPurchaseLine(memoRow({ key: "y:SOLD", memoStockId: "y", status: "SOLD" }))).toMatchObject({ source: "STOCK", memoStockId: "y", memoGroup: "SOLD", stockPendingPcs: "2", stockMinPcs: "2" });
  });
});

describe("IT-PU-04 Add Purchase Order wired (FE-PU-009)", () => {
  const input = pickerInput(ID, "THB", { status: "ALL" as const, q: "", from: "", to: "" });

  it("purchase.purchaseOrderLines input and the dialog from the hook's cache (empty on dev until a PO is approved)", async () => {
    respond = (path) => (path === "purchase.purchaseOrderLines" ? ok({ items: [], nextCursor: null, counts: { all: 0, open: 0, partlyPurchased: 0 } }) : ok(null));
    const { utils } = probe(seeded(ALL));
    await utils.purchase.purchaseOrderLines.fetchInfinite(pickerInput(ID, "THB", { status: "PARTLY_PURCHASED" as const, q: "PO26", from: "", to: "" }));
    expect(calls[0]).toMatchObject({ path: "purchase.purchaseOrderLines", method: "GET", input: { vendorId: ID, currency: "THB", status: "PARTLY_PURCHASED", q: "PO26", limit: 50 } });
    const queryClient = seeded(ALL);
    queryClient.setQueryData(getQueryKey(masterTrpc.purchase.purchaseOrderLines, input, "infinite"), {
      pages: [{ items: [poRow()], nextCursor: null, counts: { all: 1, open: 0, partlyPurchased: 1 } }],
      pageParams: [null],
    });
    const html = render(queryClient, createElement(PurchaseOrderPicker, { vendorId: ID, currency: "THB", excluded: new Set<string>(), onCancel: () => undefined, onConfirm: () => undefined }));
    expect(html).toContain(">Add Purchase Order</h2>");
    expect(html).toContain(">PO2611001</div>");
    expect(html).toContain(">01/11/2026</div>");
    expect(html).not.toContain('role="tablist"');
    expect(html).not.toContain("Partly purchased");
    expect(html).not.toContain("Load more");
    const empty = seeded(ALL);
    empty.setQueryData(getQueryKey(masterTrpc.purchase.purchaseOrderLines, input, "infinite"), { pages: [{ items: [], nextCursor: null, counts: { all: 0, open: 0, partlyPurchased: 0 } }], pageParams: [null] });
    expect(render(empty, createElement(PurchaseOrderPicker, { vendorId: ID, currency: "THB", excluded: new Set<string>(), onCancel: () => undefined, onConfirm: () => undefined }))).toContain("No open purchase order lines from this vendor in THB.");
  });

  it("the page's Purchase Order button: PO lines on the form are left out, OK maps rows without a Stock ID (ADR-0051)", () => {
    const values = { ...validValues(), lines: [purchaseOrderLineToPurchaseLine(poRow())] };
    const onAdd = vi.fn();
    const picker = lazyChild(PURCHASE_CONFIG.secondaryPicker!.render!({ values, onClose: () => undefined, onAdd }));
    expect([...(picker.props.excluded as Set<string>)]).toEqual([POL]);
    (picker.props.onConfirm as (rows: unknown[]) => void)([poRow({ purchaseOrderLineId: "z" })]);
    expect(onAdd.mock.calls[0]![0]).toMatchObject([{ source: "STOCK", stockId: "", purchaseOrderLineId: "z", sourceDocNo: "PO2611001", pcs: "6" }]);
  });
});

describe("TC-PU-07 regression: the shared Memo Stock picker keeps its layout (Memo Return / Memo Out), plus the rev 3 Ref. column", () => {
  it("MemoStockModal keeps its two-row Pending header and no tabs or groups; Ref. shows the memo no. over its Doc Date", () => {
    const queryClient = seeded(["memo-return:VIEW"]);
    const filter = { vendorId: ID, currency: "THB", q: "", from: "", to: "" };
    queryClient.setQueryData(getQueryKey(masterTrpc.memoStock.list, memoStockInput(filter)!, "infinite"), {
      pages: [{ items: [{ id: STOCK, stockId: "260003", lot: "L-1", location: "Memo", itemNote: "", stone: "Ruby", shape: "", size: "", color: "", clarity: "", cutting: "", quality: "", cerType: "", cerNo: "", receivedPcs: 2, receivedWeightCt: "1.000", pendingPcs: 2, pendingWeightCt: "1.000", priceUnit: "CTS", unitPrice: "10.00", netUnitPrice: "10.0000", currency: "THB", amount: "10.00", vendor: { id: ID, code: "V001", name: "Aom" }, memoReceive: { id: ID, docNo: "MR-1001", docDate: "2026-10-29", dueDate: "2026-11-29" }, ref: { type: "MEMO_RECEIVE", id: ID, docNo: "MR-1001", docDate: "2026-10-29" } }], nextCursor: null }],
      pageParams: [null],
    });
    const html = render(queryClient, createElement(MemoStockModal, { title: "Add Memo Stock", vendorId: ID, currency: "THB", showPrice: true, emptyText: "none", pickedIds: new Set<string>(), onCancel: () => undefined, onConfirm: () => undefined }));
    expect(html).toContain(">Pending</th>");
    expect(html).toContain(">Ref.</span>");
    expect(html).toContain('<div class="font-medium">MR-1001</div><div class="mt-1 text-xs text-[#6B7480]">29/10/2026</div>');
    expect(html).not.toContain("<span>from MR-1001");
    expect(html).toContain('aria-label="Select 260003 from MR-1001"');
    expect(html).toContain('placeholder="Search Stock ID, Lot, Stone, Cer No."');
    expect(html).not.toContain('role="tablist"');
    expect(html).not.toContain("Still in stock on memo");
  });
});
