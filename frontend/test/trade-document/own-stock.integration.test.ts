import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { getQueryKey } from "@trpc/react-query";
import { createElement, type ComponentProps, type ReactElement, type ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { actionFailure } from "@/features/approve-center/model";
import { holdersText, mapLoadSaveError } from "@/features/load-to-stock/api";
import { inUseNote, IN_USE_NOTE } from "@/features/load-to-stock/components/LoadToStockPage";
import { mapMemoOutReturnSaveError } from "@/features/memo-out-return/api";
import { MemoOutstandingModal } from "@/features/memo-out-return/components/MemoOutstandingModal";
import { mapSaveError as mapQuotationSaveError, fromQuotation, toQuotationInput, type QuotationDetail } from "@/features/quotation/api";
import { emptyLine, emptyQuotation } from "@/features/quotation/lib/defaults";
import { quotationSchema, type QuotationFormValues } from "@/features/quotation/schema";
import { EditReservePage } from "@/features/reserve/components/ReservePage";
import { mapReserveSaveError } from "@/features/reserve/api";
import { customerStockConfig } from "@/features/trade-document/customer-stock-config";
import {
  customerStockSaveError,
  emptyCustomerStock,
  fromCustomerStock,
  lotToStockLine,
  pickedStockIds,
  stockRowCount,
  toCustomerStockInput,
  type CustomerStockDetail,
  type CustomerStockFormValues,
} from "@/features/trade-document/customer-stock";
import { fromStockInput, isOwnStockItem, ownStockUnavailable, pickKey, type FromStockItem } from "@/features/trade-document/from-stock-api";
import { MemoStockModal } from "@/features/trade-document/memo-stock-modal";
import { MEMO_LOT, OWN_LOT, memoLot, ownLot } from "./lot-fixture";
import { INVENTORY_UNAVAILABLE_TEXT, STOCK_BUSY_TEXT, SYNCING_HINT, syncRefetchInterval, withSyncingHint } from "@/features/trade-document/stock-row-errors";
import { InventoryApiError } from "@/lib/inventory-client";
import { authTrpc, createAuthTrpcClient } from "@/lib/auth-trpc";
import { createMasterTrpcClient, masterTrpc } from "@/lib/master-trpc";
import { gatewayError, issuesByPath } from "../partner/helpers";
import { FLOW_DETAIL } from "./flow-fixture";

/**
 * load-to-stock phase 2 (ADR-0052 D16–D20, quotation ui-spec Revision 3, reserve Revision 2, memo-out Revision 4,
 * memo-out-return Revision 5): own stock in From Stock. UT-LS-P2-FE-01…12 (pure mapping) and IT-LS-P2-FE-01…06 (the
 * pickers, the Reserve page and `fromStock.list` through the app's provider stack and the real tRPC link against a
 * controlled `/api/master/trpc` server).
 */

vi.mock("next/navigation", () => ({
  usePathname: () => "/pre-sale/reserve",
  useRouter: () => ({ replace: vi.fn(), push: vi.fn() }),
}));
vi.mock("next/link", async () => {
  const { createElement: h } = await import("react");
  return { default: ({ href, children, ...rest }: { href: string; children: unknown }) => h("a", { href, ...rest }, children as never) };
});

type Call = { path: string; method: string; input: unknown };
let calls: Call[] = [];
let respond: (path: string, input: unknown) => unknown = () => null;
beforeEach(() => {
  calls = [];
  respond = () => null;
  vi.stubGlobal("fetch", vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = new URL(String(input), "http://localhost");
    const paths = url.pathname.replace("/api/master/trpc/", "").split(",");
    const method = init?.method ?? "GET";
    const inputs = (method === "GET" ? JSON.parse(url.searchParams.get("input") ?? "{}") : JSON.parse(String(init?.body ?? "{}"))) as Record<string, unknown>;
    const body = paths.map((path, index) => {
      calls.push({ path, method, input: inputs[index] });
      return { result: { data: respond(path, inputs[index]) } };
    });
    return new Response(JSON.stringify(body), { status: 200, headers: { "content-type": "application/json" } });
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
const decoded = (html: string) => html.replaceAll("&#x27;", "'").replaceAll("&amp;", "&");
const render = (queryClient: QueryClient, element: ReactElement) => decoded(renderToStaticMarkup(withProviders(queryClient, element)));
const newClient = () => new QueryClient({ defaultOptions: { queries: { retry: false } } });

const ID = "11111111-1111-4111-8111-111111111111";
const MEMO = "22222222-2222-4222-8222-222222222222";
const OWN = "33333333-3333-4333-8333-333333333333";

const memoItem: FromStockItem = memoLot;
const ownItem: FromStockItem = ownLot;
const customerValues = (lines: CustomerStockFormValues["lines"]): CustomerStockFormValues => ({
  ...emptyCustomerStock(), docDate: "2026-11-18", dueDate: "2026-12-18", customerId: ID, shippingAddressId: ID, invoiceAddressId: ID, currency: "THB", lines,
});
const quotationValues = (lines: QuotationFormValues["lines"]): QuotationFormValues => ({
  ...emptyQuotation(), docDate: "2026-11-18", dueDate: "2026-12-18", customerId: ID, shippingAddressId: ID, invoiceAddressId: ID, currency: "THB", lines,
});
const exceeds = (path: string) => ({ path, code: "exceeds_pending", params: { availablePcs: 1, availableWeightCt: "0.700" } });

describe("UT-LS-P2-FE-01 fromStock.lots input and keys (FE-LS-P2-01, FE-LOT-002)", () => {
  it("sends only the set filters with limit 50; a row is keyed by its lotKey; UNAVAILABLE on any page shows the notice", () => {
    expect(fromStockInput({ q: " ru ", from: "", to: "2026-11-30" })).toEqual({ limit: 50, q: "ru", to: "2026-11-30" });
    expect(pickKey(memoItem)).toBe(MEMO_LOT);
    expect(pickKey(ownItem)).toBe(OWN_LOT);
    expect(isOwnStockItem(ownItem)).toBe(true);
    expect(isOwnStockItem(memoItem)).toBe(false);
    expect(ownStockUnavailable([{ ownStock: "OK" }, { ownStock: "UNAVAILABLE" }])).toBe(true);
    expect(ownStockUnavailable([{ ownStock: "OK" }])).toBe(false);
    expect(ownStockUnavailable(undefined)).toBe(false);
  });
});

describe("UT-LS-P2-FE-02 our-stock rows (FE-LS-P2-04)", () => {
  it("an our-stock lot becomes a From Stock row: Location name, full available as cap, empty Sale Price, lotKey only, no Stock ID (no cost read)", () => {
    const row = lotToStockLine(ownItem);
    expect(row).toMatchObject({ source: "STOCK", stockId: "", lotKey: OWN_LOT, locationId: "BKK-01", stone: "Ruby", pcs: "3", weightCt: "2.100", priceUnit: "PER_PCS", unitPrice: "",
      memoStockId: "", ownStockId: "", stockPendingPcs: "3", stockPendingWeightCt: "2.100" });
    expect(JSON.stringify(row)).not.toContain("999.00");
    const memoRow = lotToStockLine(memoItem);
    expect(memoRow).toMatchObject({ lotKey: MEMO_LOT, memoStockId: "", ownStockId: "", locationId: "Memo" });
    expect(pickedStockIds([row, memoRow, emptyLine()])).toEqual(new Set([OWN_LOT, MEMO_LOT]));
    expect(stockRowCount([row, memoRow, emptyLine()])).toBe(2);
  });

  it("Reserve / Memo Out input names the lotKey alone; a saved lot line (and a legacy item line) loads back with its cap and no Stock ID", () => {
    const input = toCustomerStockInput(customerValues([{ ...lotToStockLine(ownItem), pcs: "2", unitPrice: "1500" }, { ...lotToStockLine(memoItem), unitPrice: "100" }]));
    expect(input.lines.map((line) => [line.lotKey, line.memoStockId, line.ownStockId])).toEqual([[OWN_LOT, null, null], [MEMO_LOT, null, null]]);
    const base = { id: ID, stoneCodeId: null, stoneCode: "RU-OV", shape: "", size: "", color: "", clarity: "", cutting: "", quality: "", lot: "", cerType: "", cerNo: "",
      priceUnit: "PER_PCS" as const, discount: { type: "NONE" as const, value: "0" }, discountAmount: "0.00", itemNote: "", photoIds: [], outstandingPcs: null, outstandingWeightCt: null };
    const detail = {
      id: ID, docNo: "RS-1", status: "APPROVED", version: 2, docDate: "2026-11-18", dueDate: "2026-12-18",
      customerId: ID, customer: { code: "C001", name: "Aom" }, shippingAddressId: ID, shippingAddressText: "S", invoiceAddressId: ID, invoiceAddressText: "I",
      currency: "THB", exchangeRate: null, ref: "", documentNote: "",
      lines: [
        { ...base, source: "OWN_STOCK" as const, stone: "Ruby", location: "BKK-01", pcs: 2, weightCt: "1.400", unitPrice: "1500.00", amount: "3000.00", memoStockId: null, ownStockId: null, stockId: null, lotKey: OWN_LOT, allocated: true, stockPendingPcs: 3, stockPendingWeightCt: "2.100" },
        { ...base, id: MEMO, source: "OWN_STOCK" as const, stone: "Ruby", location: "BKK-01", pcs: 1, weightCt: "0.700", unitPrice: "1500.00", amount: "1500.00", memoStockId: null, ownStockId: OWN, stockId: null, lotKey: null, allocated: true, stockPendingPcs: 3, stockPendingWeightCt: "2.100" },
      ],
      discount: { type: "NONE", value: "0" }, tax: { enabled: false, rate: "7", includeInPrice: false }, serviceCharges: [], labor: null,
      totals: { subtotal: "3000.00", discountAmount: "0.00", priceBeforeTax: "3000.00", taxAmount: "0.00", chargesAmount: "0.00", laborAmount: "0.00", grandTotal: "3000.00" },
      approvedAt: null, approvedBy: null, createdAt: "", createdBy: "", updatedAt: "", deletedAt: null, deletedBy: null, syncState: "IDLE" as const, ...FLOW_DETAIL,
    } satisfies CustomerStockDetail;
    const loaded = fromCustomerStock(detail, (id) => id).lines;
    expect(loaded[0]).toMatchObject({ source: "STOCK", stockId: "", lotKey: OWN_LOT, locationId: "BKK-01", memoStockId: "", ownStockId: "", stockPendingPcs: "3", pcs: "2" });
    // A legacy line (saved before lots, Q-LOT-09) keeps its item id for the server but still shows no Stock ID.
    expect(loaded[1]).toMatchObject({ stockId: "", lotKey: "", ownStockId: OWN });
  });
});

describe("UT-LS-P2-FE-03 Quotation 2a (FE-LS-P2-05)", () => {
  it("our-stock rows send OWN_STOCK + ownStockId without stone code, are capped with 'More than available', and load back", () => {
    const own = { ...lotToStockLine(ownItem), unitPrice: "1500" };
    const input = toQuotationInput(quotationValues([own, { ...lotToStockLine(memoItem), unitPrice: "100" }]));
    expect(input.lines[0]).toMatchObject({ source: "OWN_STOCK", lotKey: OWN_LOT, ownStockId: null, memoStockId: null, stoneCodeId: null, stoneCode: "" });
    expect(input.lines[1]).toMatchObject({ source: "STOCK", lotKey: MEMO_LOT, memoStockId: null, ownStockId: null });
    expect(issuesByPath(quotationSchema, quotationValues([{ ...own, pcs: "4", weightCt: "3" }]))).toEqual({ "lines.0.pcs": "More than available", "lines.0.weightCt": "More than available" });
    expect(issuesByPath(quotationSchema, quotationValues([{ ...own, unitPrice: "" }]))).toEqual({ "lines.0.unitPrice": "Enter the sale price" });
    const saved: QuotationDetail["lines"][number] = {
      id: "l1", source: "OWN_STOCK", memoStockId: null, ownStockId: null, stockId: null, lotKey: OWN_LOT, allocated: true, stockPendingPcs: 3, stockPendingWeightCt: "2.100", stoneCodeId: null, stoneCode: "RU-OV",
      stone: "Ruby", shape: "", size: "", color: "", clarity: "", cutting: "", quality: "", lot: "", location: "BKK-01", cerType: "", cerNo: "", pcs: 1, weightCt: "0.700",
      priceUnit: "PER_PCS", unitPrice: "1500.00", discount: { type: "NONE", value: "0" }, discountAmount: "0.00", amount: "1500.00", itemNote: "", photoIds: [],
    };
    const detail = { ...({} as QuotationDetail), id: ID, docNo: "QT-1", version: 1, docDate: "2026-11-18", dueDate: "2026-12-18", currency: "THB", exchangeRate: null, ref: "", documentNote: "",
      lines: [saved], discount: { type: "NONE", value: "0" }, tax: { enabled: false, rate: "7", includeInPrice: false }, serviceCharges: [], labor: null, status: "DRAFT",
      statusReason: null, customerId: ID, shippingAddressId: ID, invoiceAddressId: ID } as QuotationDetail;
    expect(fromQuotation(detail).lines[0]).toMatchObject({ source: "STOCK", lotKey: OWN_LOT, ownStockId: "", memoStockId: "", stockId: "", locationId: "BKK-01", stockPendingPcs: "3" });
  });

  it("Save errors: above available, gone, duplicate, INVENTORY_UNAVAILABLE (nothing saved); Memo rows keep 'More than pending'", () => {
    const save = (domainCode: string, fieldErrors?: unknown[]) => mapQuotationSaveError(gatewayError({ domainCode, fieldErrors: fieldErrors as never }));
    expect(save("VALIDATION_ERROR", [exceeds("lines.1.pcs")]).message).toBe("Row 2: More than available");
    expect(save("VALIDATION_ERROR", [{ path: "lines.0.pcs", code: "exceeds_pending" }]).message).toBe("Row 1: More than pending");
    expect(save("QUOTATION_REFERENCE_INVALID", [{ path: "lines.0.ownStockId", code: "invalid_reference" }]).message).toBe("Row 1: This stock item no longer exists. Remove the row.");
    expect(save("VALIDATION_ERROR", [{ path: "lines.2.ownStockId", code: "duplicate" }]).message).toBe("Row 3: This stock item is already on the quotation.");
    expect(save("INVENTORY_UNAVAILABLE")).toEqual({ fieldErrors: [], message: INVENTORY_UNAVAILABLE_TEXT });
  });
});

describe("UT-LS-P2-FE-04 Reserve / Memo Out / Memo Out Return errors (FE-LS-P2-06/07)", () => {
  it("our stock short → 'Row N: only x pcs left'; 503 and BUSY have their own text; the short approval text is unchanged", () => {
    const err = (domainCode: string, fieldErrors?: unknown[]) => gatewayError({ domainCode, fieldErrors: fieldErrors as never });
    expect(mapReserveSaveError(err("VALIDATION_ERROR", [exceeds("lines.0.pcs")])).message).toBe("Row 1: only 1 pcs left");
    expect(mapReserveSaveError(err("RESERVE_REFERENCE_INVALID", [{ path: "lines.1.ownStockId", code: "invalid_reference" }])).message).toBe("Row 2: This stock item no longer exists. Remove the row.");
    expect(mapReserveSaveError(err("INVENTORY_UNAVAILABLE")).message).toBe(INVENTORY_UNAVAILABLE_TEXT);
    expect(mapReserveSaveError(err("RESERVE_BUSY")).message).toBe(STOCK_BUSY_TEXT);
    const memoOut = customerStockSaveError("MEMO_OUT", "memo out");
    expect(memoOut(err("MEMO_OUT_BUSY")).message).toBe(STOCK_BUSY_TEXT);
    expect(memoOut(err("MEMO_OUT_PENDING_SHORT")).message).toBe("Some stock items no longer have enough pending. Edit the row and save again. Nothing was saved.");
    expect(memoOut(err("VALIDATION_ERROR", [{ path: "docDate", code: "required" }])).message).toBe("Some details couldn't be saved. Check the form and try again.");
    expect(mapMemoOutReturnSaveError(err("INVENTORY_UNAVAILABLE")).message).toBe(INVENTORY_UNAVAILABLE_TEXT);
    expect(mapMemoOutReturnSaveError(err("MEMO_OUT_RETURN_BUSY")).message).toBe(STOCK_BUSY_TEXT);
    expect(mapMemoOutReturnSaveError(err("MEMO_OUT_RETURN_OUTSTANDING_SHORT")).message).toContain("already returned by another document");
  });

  it("Approve menu: INVENTORY_UNAVAILABLE and <CODE>_BUSY keep the row with a reason; PENDING_SHORT unchanged", () => {
    const menu = { label: "Reserve" } as never;
    expect(actionFailure(gatewayError({ domainCode: "INVENTORY_UNAVAILABLE" }), menu, "RS-1", "approve")).toMatchObject({ toast: `Couldn't approve RS-1. ${INVENTORY_UNAVAILABLE_TEXT}.`, refetch: false });
    expect(actionFailure(gatewayError({ domainCode: "RESERVE_BUSY" }), menu, "RS-1", "approve")).toMatchObject({ toast: `RS-1: ${STOCK_BUSY_TEXT}.`, refetch: false });
    expect(actionFailure(gatewayError({ domainCode: "RESERVE_PENDING_SHORT" }), menu, "RS-1", "approve").link).toBe(true);
  });

  it("syncState: SYNCING refetches every 5 s and adds the grey hint after the status note; IDLE stops", () => {
    expect(syncRefetchInterval({ state: { data: { syncState: "SYNCING" } } })).toBe(5000);
    expect(syncRefetchInterval({ state: { data: { syncState: "IDLE" } } })).toBe(false);
    expect(syncRefetchInterval({ state: { data: undefined } })).toBe(false);
    expect(withSyncingHint({ text: "Approved · Read-only", tone: "muted" })).toEqual({ text: `Approved · Read-only · ${SYNCING_HINT}`, tone: "muted" });
    expect(withSyncingHint(null)).toEqual({ text: "Updating our stock…", tone: "muted" });
  });
});

describe("UT-LS-P2-FE-05 Load in use names its holders (SA rev 2)", () => {
  it("the note and the IN_USE toast list the holding documents; none keeps the old text", () => {
    expect(holdersText([{ documentType: "reserve", documentNo: "RS-1" }, { documentType: "memo-out", documentNo: null }, { documentType: "reserve", documentNo: "RS-1" }])).toBe("RS-1, Memo Out");
    expect(inUseNote([{ documentType: "memo-out", documentNo: "MO-9" }])).toBe("Some stock from this load is already used by MO-9 · Read-only");
    expect(inUseNote([])).toBe(IN_USE_NOTE);
    const error = new InventoryApiError(409, "LOAD_TO_STOCK_IN_USE", "in use", null, { stockIds: ["260010"], holders: [{ documentType: "reserve", documentNo: "RS-1" }] });
    expect(mapLoadSaveError(error).message).toBe("Some stock from this load is already used by RS-1; it can't be changed.");
    expect(mapLoadSaveError(new InventoryApiError(409, "LOAD_TO_STOCK_IN_USE", "in use")).message).toBe("Some stock from this load is already used; it can't be changed.");
  });
});

describe("IT-LS-P2-FE-01 shared From Stock picker (FE-LS-P2-03, FE-LOT-001/002)", () => {
  const seed = (pages: unknown[]) => {
    const queryClient = newClient();
    queryClient.setQueryData(getQueryKey(masterTrpc.fromStock.lots, fromStockInput({ q: "", from: "", to: "" }), "infinite"), { pages, pageParams: pages.map(() => null) });
    return queryClient;
  };
  const picker = (pickedIds = new Set<string>()) => createElement(MemoStockModal, { title: "Add From Stock", fromStock: true, showPrice: false, emptyText: "No stock with anything pending.", pickedIds, onCancel: () => undefined, onConfirm: () => undefined });

  it("one list of lots: Memo rows show Memo, our rows their Location and the Load ref; no Stock ID anywhere, no cost, no tabs", () => {
    const html = render(seed([{ items: [ownItem, memoItem], nextCursor: null, ownStock: "OK" }]), picker());
    expect(html).toContain('<td class="px-3 py-2 align-top">BKK-01</td>');
    expect(html).toContain('<td class="px-3 py-2 align-top">Memo</td>');
    expect(html).toContain('LS-0001<span class="ml-1.5 text-[11px] font-normal text-gms-text-secondary">Load</span>');
    expect(html).toContain('aria-label="Select RU-OV from LS-0001"');
    expect(html).toContain('aria-label="Select lot L-7"');
    expect(html).toContain("Lot / Stone Code");
    expect(html).toContain("Search Lot, Stone, Stone Code, Cer No., Doc No.");
    expect(html).not.toMatch(/Stock ID/);
    expect(html).not.toContain("260010");
    expect(html).not.toContain("999.00");
    expect(html).not.toContain("Our stock is unavailable");
    expect(html).not.toContain('role="tablist"');
  });

  it("Sale (ADR-0058): our stock rows come first with their real Location, then Memo Stock lots; the notice shows when our stock is down", () => {
    const sale = (ownStock: "OK" | "UNAVAILABLE") => render(seed([{ items: [ownItem, memoItem], nextCursor: null, ownStock }]), createElement(MemoStockModal, { title: "Add From Stock", fromStock: true, showPrice: false, emptyText: "none", pickedIds: new Set<string>(), onCancel: () => undefined, onConfirm: () => undefined }));
    expect(sale("OK")).toContain("L-7");
    expect(sale("OK")).toContain("RU-OV");
    expect(sale("OK").indexOf("RU-OV")).toBeLessThan(sale("OK").indexOf("L-7"));
    expect(sale("UNAVAILABLE")).toContain("Our stock is unavailable");
  });

  it("our stock down: notice with Retry above the Memo rows; an empty list shows the notice, not the empty text", () => {
    const down = render(seed([{ items: [memoItem], nextCursor: null, ownStock: "UNAVAILABLE" }]), picker());
    expect(down).toContain('<span role="status">Our stock is unavailable</span> — <button type="button" class="font-medium underline">Retry</button>');
    expect(down).toContain("L-7");
    const empty = render(seed([{ items: [], nextCursor: null, ownStock: "UNAVAILABLE" }]), picker());
    expect(empty).toContain("Our stock is unavailable");
    expect(empty).not.toContain("No stock with anything pending.");
  });

  it("rows already on the document are left out by lotKey", () => {
    const html = render(seed([{ items: [ownItem, memoItem], nextCursor: null, ownStock: "OK" }]), picker(new Set([OWN_LOT])));
    expect(html).not.toContain("RU-OV");
    expect(html).toContain("L-7");
  });

  it("Reserve / Memo Out config opens the From Stock list, leaves picked rows out and maps both sources", () => {
    const config = customerStockConfig({ noun: "reserve", title: "Reserve", newHref: "/r", detailHref: (id) => id, useApi: () => ({}) as never, mapSaveError: () => ({ fieldErrors: [], message: "" }),
      mapRestoreError: () => ({ message: "", refetch: false }), pickerTitle: "Add From Stock", approvalType: "reserve", notePlaceholder: "", noteHint: "", daybook: null, photos: { upload: null, url: (id: string) => id } as never });
    expect(config.pickHint).toBe("Pick stones from stock (Memo Stock and our stock)");
    const onAdd = vi.fn();
    const element = config.picker!.render({ values: customerValues([lotToStockLine(ownItem)]), onClose: () => undefined, onAdd }) as ReactElement<{ fromStock: boolean; pickedIds: Set<string>; onConfirm: (items: FromStockItem[]) => void }>;
    expect(element.props.fromStock).toBe(true);
    expect([...element.props.pickedIds]).toEqual([OWN_LOT]);
    element.props.onConfirm([memoItem, ownItem]);
    expect(onAdd.mock.calls[0]![0]).toMatchObject([{ lotKey: MEMO_LOT, memoStockId: "", ownStockId: "" }, { lotKey: OWN_LOT, memoStockId: "", ownStockId: "", locationId: "BKK-01" }]);
  });

  it("Memo Return's vendor picker still reads memoStock.list (unchanged)", () => {
    const queryClient = newClient();
    const html = render(queryClient, createElement(MemoStockModal, { title: "Add Memo Stock", vendorId: ID, currency: "THB", showPrice: true, emptyText: "none", pickedIds: new Set<string>(), onCancel: () => undefined, onConfirm: () => undefined }));
    expect(html).toContain("Loading…");
    expect(html).not.toContain("Our stock is unavailable");
  });
});

describe("IT-LS-P2-FE-02 fromStock.lots through the real link", () => {
  it("GETs fromStock.lots with the filter and the next page's cursor", async () => {
    respond = (_path, input) => ({ items: [], nextCursor: (input as { cursor?: string }).cursor ? null : "c1", ownStock: "OK" });
    const queryClient = newClient();
    let utils: ReturnType<typeof masterTrpc.useUtils> | undefined;
    function Probe() {
      utils = masterTrpc.useUtils();
      return null;
    }
    renderToStaticMarkup(withProviders(queryClient, createElement(Probe)));
    await utils!.fromStock.lots.fetchInfinite(fromStockInput({ q: "ru", from: "2026-11-01", to: "" }), { pages: 2, getNextPageParam: (page) => page.nextCursor ?? undefined });
    expect(calls.map((call) => [call.path, call.method])).toEqual([["fromStock.lots", "GET"], ["fromStock.lots", "GET"]]);
    expect(calls[0]!.input).toMatchObject({ q: "ru", from: "2026-11-01", limit: 50 });
    expect(calls[1]!.input).toMatchObject({ cursor: "c1" });
  });
});

describe("IT-LS-P2-FE-03 Reserve page shows 'Updating our stock…' while SYNCING (Q-LS-P2-05)", () => {
  const detail = (syncState: "IDLE" | "SYNCING") => ({
    id: ID, docNo: "RS-1", status: "APPROVED", version: 3, docDate: "2026-11-18", dueDate: "2026-12-18",
    customerId: ID, customer: { code: "C001", name: "Aom" }, shippingAddressId: ID, shippingAddressText: "S", invoiceAddressId: null, invoiceAddressText: "I",
    currency: "THB", exchangeRate: null, ref: "", documentNote: "", lines: [], discount: { type: "NONE", value: "0" },
    tax: { enabled: false, rate: "7", includeInPrice: false }, serviceCharges: [], labor: null,
    totals: { subtotal: "0.00", discountAmount: "0.00", priceBeforeTax: "0.00", taxAmount: "0.00", chargesAmount: "0.00", laborAmount: "0.00", grandTotal: "0.00" },
    approvedAt: null, approvedBy: null, createdAt: "", createdBy: "", updatedAt: "", deletedAt: null, deletedBy: null, syncState, ...FLOW_DETAIL, canEdit: false, canDelete: false,
  });
  const page = (syncState: "IDLE" | "SYNCING") => {
    const queryClient = newClient();
    queryClient.setQueryData(getQueryKey(authTrpc.permission.mine, undefined, "query"), { isSuperAdmin: false, permissions: ["reserve:VIEW"] });
    queryClient.setQueryData(getQueryKey(masterTrpc.approvalSetting.list, undefined, "query"), { items: [{ type: "reserve", requireApproval: true, available: true, version: 1, updatedAt: "2026-11-10T00:00:00.000Z", updatedByName: null, waiting: null }] });
    queryClient.setQueryData(getQueryKey(masterTrpc.reserve.get, { id: ID }, "query"), detail(syncState));
    return render(queryClient, createElement(EditReservePage, { id: ID }));
  };

  it("SYNCING: hint after the status note; IDLE: no hint", () => {
    expect(page("SYNCING")).toContain(`Approved · Read-only · ${SYNCING_HINT}`);
    expect(page("IDLE")).not.toContain(SYNCING_HINT);
  });
});

describe("IT-LS-P2-FE-04 Memo Out Return: Location column in Memo Outstanding (FE-LS-P2-07, Q-LS-P2-04)", () => {
  it("shows Memo or the stock's Location name after Stock ID · Lot", () => {
    const queryClient = newClient();
    const row = (patch: Record<string, unknown>) => ({
      memoOutLineId: ID, memoOut: { id: ID, docNo: "MO-7", docDate: "2026-10-31", dueDate: "2026-11-30" }, memoStockId: MEMO, ownStockId: null, source: "MEMO_STOCK", stockId: "260003", lot: "L-7",
      location: "Memo", stone: "Ruby", shape: "", size: "", color: "", clarity: "", cutting: "", quality: "", cerType: "", cerNo: "", itemNote: "", outPcs: 1, outWeightCt: "1.000",
      returnedPcs: 0, returnedWeightCt: "0.000", outstandingPcs: 1, outstandingWeightCt: "1.000", priceUnit: "PER_CT", unitPrice: "10.00", amount: "10.00", currency: "THB", ...patch,
    });
    queryClient.setQueryData(getQueryKey(masterTrpc.memoOutReturn.outstanding, { customerId: ID, currency: "THB", limit: 50 }, "infinite"), {
      pages: [{ items: [row({}), row({ memoOutLineId: OWN, memoStockId: null, ownStockId: OWN, source: "OWN_STOCK", stockId: "260010", location: "BKK-01" })], nextCursor: null }],
      pageParams: [null],
    });
    const html = render(queryClient, createElement(MemoOutstandingModal, { customerId: ID, currency: "THB", pickedIds: new Set<string>(), onCancel: () => undefined, onConfirm: () => undefined }));
    expect(html).toMatch(/Stock ID<\/span>[^]*Lot<\/span>[^]*Location<\/span>/);
    expect(html).toContain('<td class="px-3 py-2 align-top">Memo</td>');
    expect(html).toContain('<td class="px-3 py-2 align-top">BKK-01</td>');
    // Design 141: the OUTSTANDING group is green (header 30 %, sub-header 18 %, cells 8 %); the lot is a chip under the Stock ID.
    expect(html).toContain('bg-gms-group-green-head">Outstanding</th>');
    expect(html.match(/bg-gms-group-green-sub/g)).toHaveLength(2);
    expect(html.match(/bg-gms-group-green-cell/g)).toHaveLength(4);
    expect(html).toContain('<div class="font-medium">260003</div><div class="mt-1"><span class="inline-flex items-center rounded-gms-sm bg-gms-warning-subtle');
    expect(html).toMatch(/Memo Out No\.<\/span><span class="mt-0\.5 block text-xs font-normal text-gms-text-muted">Doc Date<\/span>/);
  });
});

