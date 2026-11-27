import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { getQueryKey } from "@trpc/react-query";
import { createElement, type ComponentProps, type ReactElement, type ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, describe, expect, it, vi } from "vitest";
import StockTransferLocationRoutePage from "@/app/(app)/inventory/stock-transfer-location/page";
import { mergeSettings } from "@/features/approval-setup/model";
import { detailQueryKey, invalidateAfterReview } from "@/features/approve-center/api";
import { stockTransferDocumentClient, stockTransferPreview } from "@/features/approve-center/inventory";
import { approveMenuFor } from "@/features/approve-center/menus";
import { isNavItemActive, navigationHref, sidebarSections, type NavLink } from "@/features/home/navigation";
import { inventoryApprovalKeys, isInventoryApprovalType } from "@/features/inventory/approval";
import { docHref } from "@/features/stock-card/model";
import { transferKeys } from "@/features/stock-transfer-location/api";
import { EditStockTransferLocationPage, TRANSFER_DENIED, TRANSFER_DELETED_TEXT } from "@/features/stock-transfer-location/components/StockTransferLocationPage";
import { EMPTY_ROW_TEXT, ROW_TONE, TransferTable, type TransferTableProps } from "@/features/stock-transfer-location/components/transfer-table";
import { lotToRow } from "@/features/stock-transfer-location/form";
import { todayIso } from "@/features/quotation/lib/format";
import { APPROVAL_DOCUMENTS, mapFlowError } from "@/features/trade-document/flow-status";
import { inDateRange, MemoStockModal, transferLotKey, transferPickerRow } from "@/features/trade-document/memo-stock-modal";
import { authTrpc, createAuthTrpcClient } from "@/lib/auth-trpc";
import { InventoryApiError } from "@/lib/inventory-client";
import { createMasterTrpcClient, masterTrpc } from "@/lib/master-trpc";
import { controlled, ID, S1, S2, stockLot, transferOut } from "./fixtures";

/**
 * IT-STL-01…05 (FE-STL-001…005): the route page and grid through the app's provider stack (seeded caches under the
 * hooks' real keys), the From Stock picker variant, and the platform wiring (navigation, Approval Setup, Approve
 * Center, flow status, Stock Card link). REST through the real inventory client against a controlled server.
 */
vi.mock("next/navigation", () => ({ usePathname: () => "/inventory/stock-transfer-location", useRouter: () => ({ replace: vi.fn(), push: vi.fn() }) }));
afterEach(() => vi.restoreAllMocks());

const ALL = ["stock-transfer-location:VIEW", "stock-transfer-location:ADD", "stock-transfer-location:EDIT", "stock-transfer-location:DELETE"];
const LOCATIONS = ["BKK-01", "Safe A", "Shelf 1"];

function seeded(permissions: string[], requireApproval = true) {
  const queryClient = new QueryClient();
  queryClient.setQueryData(getQueryKey(authTrpc.permission.mine, undefined, "query"), { isSuperAdmin: false, permissions });
  queryClient.setQueryData(transferKeys.options(), { locations: LOCATIONS, numbering: { configured: true } });
  queryClient.setQueryData(transferKeys.nextNumber(todayIso()), { docNo: "STGMS2611001" });
  queryClient.setQueryData(inventoryApprovalKeys.settings(), { items: [{ type: "stock-transfer-location", requireApproval, version: 1 }] });
  return queryClient;
}

function withProviders(queryClient: QueryClient, children: ReactNode) {
  const authProps = { client: createAuthTrpcClient(), queryClient } as ComponentProps<typeof authTrpc.Provider>;
  const masterProps = { client: createMasterTrpcClient(), queryClient } as ComponentProps<typeof masterTrpc.Provider>;
  return createElement(QueryClientProvider, { client: queryClient }, createElement(authTrpc.Provider, authProps, createElement(masterTrpc.Provider, masterProps, children)));
}
const decoded = (html: string) => html.replaceAll("&#x27;", "'").replaceAll("&amp;", "&").replaceAll("&quot;", '"');
const render = (queryClient: QueryClient, element: ReactElement) => decoded(renderToStaticMarkup(withProviders(queryClient, element)));
const button = (html: string, label: string) => new RegExp(`<button[^>]*>(?:(?!</button>).)*${label}(?:(?!</button>).)*</button>`).exec(html)?.[0] ?? "";
const iconButton = (html: string, label: string) => new RegExp(`<button[^>]*aria-label="${label}"[^>]*>`).exec(html)?.[0] ?? "";
const count = (html: string, text: string) => html.split(text).length - 1;

describe("IT-STL-01 page shell, access and approval flow (FE-STL-001, FE-STL-004)", () => {
  it("new document: number preview, Doc Date + Ref., Item card with From Stock and scan, 5 empty rows, Print / Excel / Duplicate disabled", () => {
    const html = render(seeded(ALL), createElement(StockTransferLocationRoutePage));
    expect(html).toContain("Transfer Location No.:");
    expect(html).toContain("STGMS2611001");
    for (const label of [">Doc Date", ">Ref."]) expect(html).toContain(label);
    expect(html).toContain("0 items");
    expect(button(html, "From Stock")).not.toContain('disabled=""');
    expect(iconButton(html, "Scan to add")).not.toContain('disabled=""');
    expect(count(html, EMPTY_ROW_TEXT)).toBe(5);
    expect(html).toContain("NEW LOCATION");
    for (const label of ["Print", "Export Excel", "Duplicate"]) expect(iconButton(html, label)).toContain('disabled=""');
    expect(html).not.toContain("Send to approve");
  });

  it("no VIEW: the permission message only", () => {
    const html = render(seeded(["quotation:VIEW"]), createElement(StockTransferLocationRoutePage));
    expect(html).toContain(TRANSFER_DENIED);
    expect(html).not.toContain("Transfer Location No.:");
  });

  it("approval ON, Draft: badge, Send to approve, Edit enabled; lines in position order, then 3 empty rows; view mode is read-only", () => {
    const queryClient = seeded(ALL, true);
    queryClient.setQueryData(transferKeys.get(ID), transferOut());
    const html = render(queryClient, createElement(EditStockTransferLocationPage, { id: ID }));
    expect(html).toContain("STGMS2611001");
    expect(html).toContain(">Draft<");
    expect(button(html, "Send to approve")).not.toBe("");
    expect(button(html, "Edit")).not.toContain('disabled=""');
    expect(html.indexOf("RU-RUBDEXVVS1AAA")).toBeLessThan(html.indexOf("SA-BLUE"));
    expect(html).toContain("85,000.00 USD");
    expect(html).toContain("per cts");
    expect(html).toContain("per pcs");
    expect(html).toContain("2 items");
    expect(count(html, 'data-empty-row=""')).toBe(3);
    expect(html).not.toContain(EMPTY_ROW_TEXT);
    expect(button(html, "From Stock")).toContain('disabled=""');
  });

  it("approval OFF, auto-approved: Approved badge, no Send; Pending is locked; a deleted transfer shows the banner", () => {
    const off = seeded(ALL, false);
    off.setQueryData(transferKeys.get(ID), transferOut({ status: "APPROVED", autoApproved: true, approval: { requireApproval: false, autoApproved: true, revisionCount: 0, submitted: null, review: null } }));
    const approved = render(off, createElement(EditStockTransferLocationPage, { id: ID }));
    expect(approved).toContain(">Approved<");
    expect(button(approved, "Send to approve")).toBe("");
    expect(button(approved, "Edit")).not.toBe("");

    const pending = seeded(ALL, true);
    pending.setQueryData(transferKeys.get(ID), transferOut({ status: "PENDING_APPROVAL" }));
    const locked = render(pending, createElement(EditStockTransferLocationPage, { id: ID }));
    expect(locked).toContain("Waiting for approval · Read-only");
    expect(button(locked, "Edit")).toBe("");

    const gone = seeded(ALL, true);
    gone.setQueryData(transferKeys.get(ID), transferOut({ deleted: true }));
    const deleted = render(gone, createElement(EditStockTransferLocationPage, { id: ID }));
    expect(deleted).toContain(TRANSFER_DELETED_TEXT);
    expect(button(deleted, "Restore")).not.toBe("");
  });
});

describe("IT-STL-02 grid (FE-STL-002)", () => {
  const props = (patch: Partial<TransferTableProps> = {}): TransferTableProps => ({
    rows: [{ ...lotToRow(stockLot()), key: "k1" }, { ...lotToRow(stockLot({ stockUuid: S2, priceUnit: "PER_PCS" })), key: "k2" }],
    locations: LOCATIONS,
    readOnly: false,
    checkedKeys: new Set(["k2"]),
    rowErrors: new Map(),
    onToggleCheck: vi.fn(),
    onToggleAll: vi.fn(),
    onRemove: vi.fn(),
    onLocation: vi.fn(),
    onPcs: vi.fn(),
    onWeight: vi.fn(),
    onPickEmpty: vi.fn(),
    ...patch,
  });

  it("left part read-only, teal right part with Select Location and 0 placeholders; checked row light teal; 3 empty rows", () => {
    const html = render(new QueryClient(), createElement(TransferTable, props()));
    for (const head of ["Stone Code", "LOCATION", "LOT", "PCS", "WEIGHT", "PRICE", "NEW LOCATION"]) expect(html).toContain(head);
    expect(count(html, "Select Location")).toBe(2);
    expect(count(html, 'placeholder="0"')).toBe(4);
    expect(html).toContain("0.62");
    expect(html).toMatch(new RegExp(`class="[^"]*${ROW_TONE.selected.replace(/[[\]#]/g, "\\$&")}[^"]*" aria-selected="true" data-row-key="k2"`));
    expect(html).toContain('aria-selected="false" data-row-key="k1"');
    expect(count(html, EMPTY_ROW_TEXT)).toBe(3);
  });

  it("a row error (e.g. 409 on hand) shows under its row", () => {
    const html = render(new QueryClient(), createElement(TransferTable, props({ rowErrors: new Map([["k1", "Only 1 pcs / 0.500 ct on hand now"]]) })));
    expect(html).toContain('role="alert">Row 1: Only 1 pcs / 0.500 ct on hand now');
  });
});

describe("IT-STL-03 From Stock picker variant (FE-STL-003)", () => {
  const exclude = [S2];
  const picker = (pickedIds = new Set<string>()) =>
    createElement(MemoStockModal, { source: "stock-transfer-location", title: "From Stock", showPrice: false, emptyText: "No stock with on hand to move.", exclude, pickedIds, onCancel: () => undefined, onConfirm: () => undefined });
  const seed = (items: unknown[]) => {
    const queryClient = new QueryClient();
    queryClient.setQueryData(transferKeys.stock({ q: "", exclude }), { pages: [{ items, nextCursor: null }], pageParams: [null] });
    return queryClient;
  };

  it("reads the transfer stock cache (exclude in the key): on hand, Stock Price with unit, Location; excluded / picked lots left out", () => {
    const html = render(seed([stockLot(), stockLot({ stockUuid: S2, lotKey: "OS-X", attrs: { ...stockLot().attrs, stoneCode: "EXCLUDED" } })]), picker());
    expect(html).toContain("From Stock");
    expect(html).toContain("Search Stock ID, Lot, Stone Code, Ref. No.");
    expect(html).toContain("RU-RUBDEXVVS1AAA");
    expect(html).toContain("Stock Price");
    expect(html).toContain("85,000.00 USD");
    expect(html).toContain("BKK-01");
    expect(html).toContain("LSGMS2609001");
    expect(html).not.toContain("EXCLUDED");
    expect(render(seed([stockLot()]), picker(new Set([transferLotKey(stockLot())])))).toContain("No stock with on hand to move.");
  });

  it("row mapping and the Ref. date filter", () => {
    expect(transferPickerRow(stockLot())).toMatchObject({ lotKey: "OS-260014", location: "BKK-01", pendingPcs: 1, pendingWeightCt: "0.620", unitPrice: "85000.00", currency: "USD", ref: { docNo: "LSGMS2609001" } });
    expect(transferLotKey({ lotKey: "", stockUuid: S1 })).toBe(S1);
    expect([inDateRange("2026-09-01", "", ""), inDateRange("2026-09-01", "2026-09-02", ""), inDateRange("2026-09-01", "", "2026-09-01")]).toEqual([true, false, true]);
  });

  it("the picker request sends q and exclude to the stock route", async () => {
    const { calls, sent } = controlled(() => ({ body: { items: [], nextCursor: null } }));
    await calls.stock({ q: "L-2609", exclude: [S1, S2] });
    expect(sent[0]!.url).toBe(`/api/inventory/v1/stock-transfer-location/stock?q=L-2609&exclude=${encodeURIComponent(`${S1},${S2}`)}&limit=50`);
  });
});

describe("IT-STL-04 navigation, Approval Setup, flow status, Stock Card (FE-STL-005)", () => {
  it("Inventory › Stock Transfer Location opens the real page and stays active on a saved one", () => {
    const inventory = sidebarSections.find((section) => section.id === "inventory")!;
    const item = inventory.items.find((entry): entry is NavLink => entry.kind === "link" && entry.id === "stock-transfer-location")!;
    expect(navigationHref({ slug: "stock-transfer-location", label: "Stock Transfer Location" } as never)).toBe("/inventory/stock-transfer-location");
    expect(item.href).toBe("/inventory/stock-transfer-location");
    expect(isNavItemActive(item, `/inventory/stock-transfer-location/${ID}`)).toBe(true);
    expect(isNavItemActive(item, "/inventory/load-to-stock")).toBe(false);
  });

  it("approval type with code STOCK_TRANSFER; Approval Setup lists it as available; Stock Card DOC NO links to it", () => {
    expect(isInventoryApprovalType("stock-transfer-location")).toBe(true);
    expect(APPROVAL_DOCUMENTS["stock-transfer-location"]).toEqual({ code: "STOCK_TRANSFER", menu: "Stock Transfer Location" });
    expect(mapFlowError(new InventoryApiError(409, "STOCK_TRANSFER_REVISE_LIMIT", "x"), "stock-transfer-location", "ST-1", "submit")?.message).toBe("ST-1 was already sent back once. Approve or reject it.");
    expect(mapFlowError(new InventoryApiError(409, "STOCK_TRANSFER_APPROVAL_OFF", "x"), "stock-transfer-location", "ST-1", "submit")?.settingChanged).toBe(true);
    const merged = mergeSettings([], [{ type: "stock-transfer-location", requireApproval: true, version: 1, waitingCount: { pending: 2, revision: 0 } }, { type: "merge-split", requireApproval: true, version: 1 }])!;
    expect(merged.map((entry) => [entry.type, entry.available, entry.waiting])).toEqual([["stock-transfer-location", true, 2], ["merge-split", true, null]]);
    expect(docHref("stock-transfer-location", ID)).toBe(`/inventory/stock-transfer-location/${ID}`);
  });
});

describe("IT-STL-05 Approve Center panel (FE-STL-005)", () => {
  it("the menu is available with its procedure, preview cache key and inventory refresh", async () => {
    expect(approveMenuFor("transfer-location")).toMatchObject({ label: "Transfer Location", availability: "available", proc: "stockTransferLocation", type: "stock-transfer-location", documentBase: "/inventory/stock-transfer-location", party: "none" });
    expect(detailQueryKey("stockTransferLocation", ID)).toEqual(["inventory", "stock-transfer-location", "preview", ID]);
    const keys: unknown[] = [];
    const client = { invalidateQueries: vi.fn(async ({ queryKey }: { queryKey: unknown }) => void keys.push(queryKey)) };
    await invalidateAfterReview(client as never, "stockTransferLocation", "approve");
    expect(keys).toEqual([["inventory"]]);
  });

  it("the document client previews (from → to) and approves / revises / rejects with the current version", async () => {
    const { calls, sent } = controlled((entry) => ({ body: entry.method === "GET" ? transferOut() : { id: ID, version: 3, status: "APPROVED" } }));
    const client = stockTransferDocumentClient(calls);
    const preview = await client.get.query({ id: ID });
    expect(preview).toMatchObject({ docNo: "STGMS2611001", documentNote: "" });
    expect(preview.lines.map((line) => [line.stoneCode, line.location, line.pcs])).toEqual([["RU-RUBDEXVVS1AAA", "BKK-01 → Shelf 1", 1], ["SA-BLUE", "BKK-01 → Safe A", 2]]);
    await client.approve.mutate({ id: ID, expectedVersion: 0 });
    await client.requestRevision.mutate({ id: ID, expectedVersion: 2, note: "fix" });
    await client.reject.mutate({ id: ID, expectedVersion: 2, reason: "no" });
    expect(sent.map((entry) => `${entry.method} ${entry.url.replace("/api/inventory/v1/stock-transfer-location", "")}`)).toEqual([`GET /${ID}`, `GET /${ID}`, `POST /${ID}/approve`, `POST /${ID}/request-revision`, `POST /${ID}/reject`]);
    expect(sent[2]!.body).toEqual({ expectedVersion: 2 });
    expect(stockTransferPreview(transferOut({ docNo: null })).docNo).toBe("");
  });
});
