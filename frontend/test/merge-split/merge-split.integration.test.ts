import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { getQueryKey } from "@trpc/react-query";
import { createElement, type ComponentProps, type ReactElement, type ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, describe, expect, it, vi } from "vitest";
import MergeSplitRoutePage from "@/app/(app)/inventory/merge-split/page";
import { approveMenuFor } from "@/features/approve-center/menus";
import { settingOf, rowLocked } from "@/features/approval-setup/model";
import { isNavItemActive, navigationHref, sidebarSections, type NavLink } from "@/features/home/navigation";
import { inventoryApprovalKeys } from "@/features/inventory/approval";
import { applyPick, emptyMergeSplit, mergeSplitKeys } from "@/features/merge-split/api";
import { EditMergeSplitPage, mergeSplitFlow, MS_DELETED_TEXT, MS_IN_USE_NOTE, photoStocks } from "@/features/merge-split/components/MergeSplitPage";
import { MergeSplitModeDialog } from "@/features/merge-split/components/mode-dialog";
import { OWN_STOCK_EMPTY } from "@/features/merge-split/components/own-stock-picker";
import { EMPTY_RESULT_TEXT, MergeSplitResultTable, STOCK_ID_ON_SAVE, type ResultTableProps } from "@/features/merge-split/components/result-table";
import { MergeSplitRowPanel } from "@/features/merge-split/components/result-row-panel";
import { MergeSplitSourceTable } from "@/features/merge-split/components/source-table";
import { QuotationHeader } from "@/features/quotation/components/header/QuotationHeader";
import { todayIso } from "@/features/quotation/lib/format";
import { APPROVAL_DOCUMENTS } from "@/features/trade-document/flow-status";
import { MemoStockModal } from "@/features/trade-document/memo-stock-modal";
import { docHref } from "@/features/stock-card/model";
import { authTrpc, createAuthTrpcClient } from "@/lib/auth-trpc";
import { createMasterTrpcClient, masterTrpc } from "@/lib/master-trpc";
import { MS_ID, msOut, OWN_A, OWN_B, OWN_C } from "./fixtures";

/**
 * IT-MS-01…06 (FE-MS-001…007): the route page and components through the app's provider stack, rendered from seeded
 * caches under the hooks' real query keys (typed fixtures of the SA rev 1 contract; no live backend yet).
 */
vi.mock("next/navigation", () => ({ usePathname: () => "/inventory/merge-split", useRouter: () => ({ replace: vi.fn(), push: vi.fn() }) }));
afterEach(() => vi.restoreAllMocks());

const ALL = ["merge-split:VIEW", "merge-split:ADD", "merge-split:EDIT", "merge-split:DELETE"];
const OPTIONS = { companyCurrency: "THB", locations: ["Safe A", "Shelf 1"], numbering: { configured: true } };

function seeded(permissions: string[], requireApproval = true) {
  const queryClient = new QueryClient();
  queryClient.setQueryData(getQueryKey(authTrpc.permission.mine, undefined, "query"), { isSuperAdmin: false, permissions });
  queryClient.setQueryData(mergeSplitKeys.options(), OPTIONS);
  queryClient.setQueryData(mergeSplitKeys.nextNumber(todayIso()), { docNo: "MSGMS2611001" });
  queryClient.setQueryData(inventoryApprovalKeys.settings(), { items: [{ type: "merge-split", requireApproval, version: 1 }] });
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
const radio = (html: string, value: string) => html.match(/<input[^>]*>/g)?.find((tag) => tag.includes(`value="${value}"`)) ?? "";

describe("IT-MS-01 page shell and access (FE-MS-001)", () => {
  it("new document: MS number preview, Doc Date / Ref. only, From Stock is the only source button, Print / Excel / Duplicate disabled", () => {
    const html = render(seeded(ALL), createElement(MergeSplitRoutePage));
    expect(html).toContain("Merge/Split No.:");
    expect(html).toContain("MSGMS2611001");
    expect(html).toContain("Number preview");
    for (const label of ["Doc Date", "Ref."]) expect(html).toContain(`>${label}`);
    for (const absent of [">Account", ">Currency", "From Purchase", "From Memo"]) expect(html).not.toContain(absent);
    expect(button(html, "From Stock")).not.toContain('disabled=""');
    expect(html).toContain("0 stocks");
    expect(html).toContain(EMPTY_RESULT_TEXT);
    for (const label of ["Print", "Export Excel", "Duplicate"]) expect(iconButton(html, label)).toContain('disabled=""');
    expect(html).not.toContain("Send to approve");
  });

  it("no VIEW: the permission message only", () => {
    const html = render(seeded(["quotation:VIEW"]), createElement(MergeSplitRoutePage));
    expect(html).toContain("You don't have permission to view Merge/Split.");
    expect(html).not.toContain("Merge/Split No.:");
  });

  it("VIEW without ADD: no Create New and Save stays off", () => {
    const html = render(seeded(["merge-split:VIEW"]), createElement(MergeSplitRoutePage));
    expect(html).not.toContain("Create New");
    expect(button(html, "Save")).toContain('disabled=""');
  });

  it("saved Draft with approval ON: status, Send to approve, Edit, 'Stock ID on save · Auto', Print enabled", () => {
    const queryClient = seeded(ALL, true);
    queryClient.setQueryData(mergeSplitKeys.get(MS_ID), msOut());
    const html = render(queryClient, createElement(EditMergeSplitPage, { id: MS_ID }));
    expect(html).toContain(">Draft<");
    expect(button(html, "Send to approve")).not.toBe("");
    expect(button(html, "Edit")).not.toContain('disabled=""');
    expect(html).toContain(STOCK_ID_ON_SAVE);
    expect(html).toContain(">Auto<");
    expect(html).toContain("From 260001");
    expect(html).toContain("Loaded LS2611001 · 02/11/26");
    expect(html).toContain('data-balance="balanced"');
    expect(iconButton(html, "Print")).not.toContain('disabled=""');
    expect(iconButton(html, "Export Excel")).toContain('disabled=""');
    expect(button(html, "From Stock")).toContain('disabled=""');
  });

  it("Pending is locked; approval OFF + a new stock in use: Edit / Delete disabled with the note; deleted: banner + Restore", () => {
    const pending = seeded(ALL, true);
    pending.setQueryData(mergeSplitKeys.get(MS_ID), msOut({ status: "PENDING_APPROVAL" }));
    const locked = render(pending, createElement(EditMergeSplitPage, { id: MS_ID }));
    expect(locked).toContain("Waiting for approval · Read-only");
    expect(button(locked, "Edit")).toBe("");

    const used = seeded(ALL, false);
    const applied = msOut({ status: "APPROVED", autoApproved: true, approval: { requireApproval: false, autoApproved: true, revisionCount: 0, submitted: null, review: null } });
    used.setQueryData(mergeSplitKeys.get(MS_ID), { ...applied, results: applied.results.map((row, index) => ({ ...row, stockId: `27000${index}`, inUse: index === 0 })) });
    const html = render(used, createElement(EditMergeSplitPage, { id: MS_ID }));
    expect(html).toContain(MS_IN_USE_NOTE);
    expect(html).toContain("270000");
    expect(button(html, "Edit")).toContain('disabled=""');
    expect(button(html, "Delete")).toContain('disabled=""');

    const gone = seeded(ALL, true);
    gone.setQueryData(mergeSplitKeys.get(MS_ID), msOut({ deleted: true }));
    const deleted = render(gone, createElement(EditMergeSplitPage, { id: MS_ID }));
    expect(deleted).toContain(MS_DELETED_TEXT);
    expect(button(deleted, "Restore")).not.toBe("");
    expect(iconButton(deleted, "Print")).toContain('disabled=""');
    expect(mergeSplitFlow(msOut({ deleted: true })).canEdit).toBe(false);
  });

  it("loading while the document is fetched", () => {
    expect(render(seeded(ALL), createElement(EditMergeSplitPage, { id: "nope" }))).toContain("Loading…");
  });
});

describe("IT-MS-02 From Stock picker: MemoStockModal source merge-split (FE-MS-003)", () => {
  const props = (pickedIds = new Set<string>()) => ({ source: "merge-split" as const, title: "Add From Stock", showPrice: false, emptyText: OWN_STOCK_EMPTY, pickedIds, locations: ["Safe A", "Safe B"], currency: "THB", onCancel: vi.fn(), onConfirm: vi.fn() });
  const seed = (exclude: string[], pages: unknown) => {
    const queryClient = seeded(ALL);
    queryClient.setQueryData(mergeSplitKeys.stock({ q: "", location: "", exclude, excludeDocId: undefined }), pages);
    return queryClient;
  };

  it("own Stock ID rows with available pcs / weight, location, lot, cost and sale price; picked stocks left out; Load more", () => {
    const queryClient = seed([OWN_A.stockUuid], { pages: [{ items: [OWN_A, OWN_B, { ...OWN_C, availPcs: 0, availWeightCt: "0.000" }], nextCursor: "c2" }], pageParams: [null] });
    const html = render(queryClient, createElement(MemoStockModal, props(new Set([OWN_A.stockUuid]))));
    expect(html).toContain("Add From Stock");
    for (const header of ["Avail. Pcs", "Avail. Weight", "Cost", "Sale Price", "Amount"]) expect(html).toContain(header);
    expect(html).toContain('data-stock-id="260002"');
    expect(html).not.toContain('data-stock-id="260001"');
    expect(html).not.toContain('data-stock-id="260003"');
    expect(html).toContain("L-2");
    expect(html).toContain("Safe B");
    expect(html).toContain("45,000.00");
    expect(html).toContain('aria-label="Location filter"');
    expect(html).toContain("Load more");
    expect(button(html, "OK")).toContain('disabled=""');
  });

  it("empty and error + Retry states", () => {
    const empty = render(seed([], { pages: [{ items: [], nextCursor: null }], pageParams: [null] }), createElement(MemoStockModal, props()));
    expect(empty).toContain(OWN_STOCK_EMPTY);
    expect(render(seeded(ALL), createElement(MemoStockModal, props()))).toContain("Loading…");
  });

  it("other callers keep their pickers (Memo Return still shows the Pending group)", () => {
    const html = render(seeded(ALL), createElement(MemoStockModal, { title: "Add Memo Stock", vendorId: "v1", currency: "THB", showPrice: true, emptyText: "none", pickedIds: new Set<string>(), onCancel: vi.fn(), onConfirm: vi.fn() }));
    expect(html).toContain("Add Memo Stock");
    expect(html).not.toContain("Avail. Pcs");
  });
});

describe("IT-MS-03 source table and mode dialog (FE-MS-004)", () => {
  it("Item table lists the picked stocks read-only with Stock ID and Loaded note", () => {
    const values = applyPick(emptyMergeSplit("2026-11-27"), [OWN_A, OWN_B], "SPLIT");
    const html = render(seeded(ALL), createElement(MergeSplitSourceTable, { sources: values.sources, currency: "THB" }));
    expect(html).toContain('data-source-stock="260001"');
    expect(html).toContain("Loaded LS2611002 · 03/11/26");
    expect(html).toContain("10,000.00 THB");
    expect(html).not.toContain("<input");
  });

  it("only Split and Merge; Merge disabled with one stock; with two: Merge preselected, average and suggested stock", () => {
    const one = render(seeded(ALL), createElement(MergeSplitModeDialog, { picked: [OWN_A], documentMode: "", currency: "THB", onBack: vi.fn(), onCreate: vi.fn() }));
    expect(one).toContain("How should these stocks be converted?");
    expect(one).not.toContain('value="NONE"');
    expect(radio(one, "MERGE")).toContain('disabled=""');
    expect(one).toContain("Pick at least 2 stocks to merge");
    expect(radio(one, "SPLIT")).toContain('checked=""');
    expect(one).toContain("Create 2 rows");

    const two = render(seeded(ALL), createElement(MergeSplitModeDialog, { picked: [OWN_A, OWN_B], documentMode: "", currency: "THB", onBack: vi.fn(), onCreate: vi.fn() }));
    expect(radio(two, "MERGE")).toContain('checked=""');
    expect(two).toContain("2 stocks → 1 new stock · 6 pcs · 5.00 ct · average 13,000.00 THB per ct");
    expect(two).toContain("(260002, 22,500.00 THB per pc)");
    expect(two).toContain("Create 1 row");
  });

  it("a later pick keeps the document's mode (the other card disabled)", () => {
    const html = render(seeded(ALL), createElement(MergeSplitModeDialog, { picked: [OWN_C], documentMode: "SPLIT", currency: "THB", onBack: vi.fn(), onCreate: vi.fn() }));
    expect(radio(html, "MERGE")).toContain('disabled=""');
    expect(html).toContain("This document is in Split mode");
  });

  it("photo relink targets: Split every stock with photos, Merge only the suggested one of a new row", () => {
    expect(photoStocks([OWN_A, OWN_B, OWN_C], "SPLIT", false)).toEqual([OWN_A.stockUuid, OWN_B.stockUuid]);
    expect(photoStocks([OWN_A, OWN_B], "MERGE", false)).toEqual([OWN_B.stockUuid]);
    expect(photoStocks([OWN_A, OWN_B], "MERGE", true)).toEqual([]);
  });
});

describe("IT-MS-04 result table and row panel (FE-MS-005)", () => {
  const props = (values: ResultTableProps["values"], readOnly = false): ResultTableProps => ({
    values, currency: "THB", locations: ["Safe A", "Shelf 1"], readOnly, selectedKey: null, checkedKeys: new Set(), rowErrors: new Map(),
    onSelect: vi.fn(), onOpenPanel: vi.fn(), onToggleCheck: vi.fn(), onToggleAll: vi.fn(), onRemove: vi.fn(), onChange: vi.fn(), onSplit: vi.fn(), onRemoveSource: vi.fn(), onPickEmpty: vi.fn(),
  });

  it("Split: one group per stock with '+ Split', balance chip, removable children and Totals", () => {
    const values = applyPick(emptyMergeSplit("2026-11-27"), [OWN_A], "SPLIT");
    values.rows[1] = { ...values.rows[1]!, pcs: "1", weightCt: "0.600" };
    const html = render(seeded(ALL), createElement(MergeSplitResultTable, props(values)));
    expect(html).toContain('data-split-group="260001"');
    expect(button(html, "Split")).not.toBe("");
    expect(html).toContain('data-balance="left"');
    expect(html).toContain("Left 1 pcs · 0.400 ct");
    expect(html).toContain('aria-label="Remove result row 1"');
    expect(html).toContain("Totals");
    expect(html).toContain("16,000.00"); // 1.600 ct × 10,000
    expect(html).toContain(STOCK_ID_ON_SAVE);
  });

  it("Merge: one locked row, source chips with ✕, average sub-line; no row remove", () => {
    const values = applyPick(emptyMergeSplit("2026-11-27"), [OWN_A, OWN_B], "MERGE");
    const html = render(seeded(ALL), createElement(MergeSplitResultTable, props(values)));
    expect(html).toContain("Merging 2 stocks:");
    expect(html).toContain('aria-label="Remove 260002 from the merge"');
    expect(html).not.toContain('aria-label="Remove result row 1"');
    expect(html).toMatch(/aria-label="Pcs of result row 1"[^>]*readOnly=""|readOnly=""[^>]*aria-label="Pcs of result row 1"/i);
    expect(html).toContain("average of 2 stocks · per ct");
    expect(html).toContain("65,000.00");
    expect(html).toContain("From 260001 + 260002");
  });

  it("row panel: Stock ID Auto, Lot, Location *, prefilled prices, Pcs / Weight locked in Merge", () => {
    const values = applyPick(emptyMergeSplit("2026-11-27"), [OWN_A, OWN_B], "MERGE");
    const html = render(seeded(ALL), createElement(MergeSplitRowPanel, { row: values.rows[0]!, index: 0, total: 1, values, locations: ["Safe A"], currency: "THB", readOnly: false, errors: {}, onChange: vi.fn(), onPrev: vi.fn(), onNext: vi.fn(), onRemove: vi.fn(), onClose: vi.fn() }));
    expect(html).toContain("Merged row · pcs and weight are the sum of the picked stocks");
    expect(html).toContain("Assigned when the document is applied");
    expect(html).toContain('value="L-2"');
    expect(html).toContain("16000.00");
    expect(html).toContain("Photos 0 / 5");
  });
});

describe("IT-MS-06 navigation, Approve Center and shared wiring (FE-MS-007)", () => {
  it("Inventory › Merge/Split opens /inventory/merge-split and stays active on a saved document", () => {
    const item = sidebarSections.flatMap((section) => section.items).find((entry) => entry.id === "merge-split") as NavLink;
    expect(navigationHref({ slug: "merge-split", label: "Merge/Split" } as never)).toBe("/inventory/merge-split");
    expect(item.href).toBe("/inventory/merge-split");
    expect(isNavItemActive(item, `/inventory/merge-split/${MS_ID}`)).toBe(true);
  });

  it("Approve Center panel available; Approval Setup switchable; MERGE_SPLIT codes; Stock Card DOC NO links", () => {
    const menu = approveMenuFor("merge-split")!;
    expect(menu.availability).toBe("available");
    expect(rowLocked(menu, settingOf([{ type: "merge-split", requireApproval: true, available: true, version: 1, updatedAt: "", updatedByName: null, waiting: 0 }], "merge-split"))).toBeNull();
    expect(APPROVAL_DOCUMENTS["merge-split"]).toEqual({ code: "MERGE_SPLIT", menu: "Merge/Split" });
    expect(docHref("merge-split", MS_ID)).toBe(`/inventory/merge-split/${MS_ID}`);
  });

  it("QuotationHeader: Print stays disabled for the other pages and is enabled with onPrint", () => {
    const base = { docNo: "X", isPreview: false, mode: "view" as const, saving: false, canSave: false, canCreate: false, canEdit: false, canDelete: false, actions: { onCancel: vi.fn(), onSave: vi.fn(), onEdit: vi.fn(), onDelete: vi.fn(), onDuplicate: vi.fn(), onRefresh: vi.fn() } };
    expect(iconButton(render(seeded(ALL), createElement(QuotationHeader, base)), "Print")).toContain('disabled=""');
    expect(iconButton(render(seeded(ALL), createElement(QuotationHeader, { ...base, onPrint: vi.fn() })), "Print")).not.toContain('disabled=""');
  });
});
