import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { getQueryKey } from "@trpc/react-query";
import { createElement, type ComponentProps, type ReactElement, type ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, describe, expect, it, vi } from "vitest";
import LoadToStockRoutePage from "@/app/(app)/inventory/load-to-stock/page";
import { isNavItemActive, navigationHref, sidebarSections, type NavLink } from "@/features/home/navigation";
import { inventoryApprovalKeys } from "@/features/inventory/approval";
import { applyPick, emptyLoad, loadKeys, loadToStockCalls, toLoadInput, type LoadFormValues } from "@/features/load-to-stock/api";
import { copyLinePhotos, EditLoadToStockPage, IN_USE_NOTE, loadFlow, LOAD_DENIED, photoLines } from "@/features/load-to-stock/components/LoadToStockPage";
import { LoadModeDialog } from "@/features/load-to-stock/components/load-mode-dialog";
import { EMPTY_LOAD_TEXT, LoadTable, rowLocationOptions, type LoadTableProps } from "@/features/load-to-stock/components/load-table";
import { PICKER_EMPTY_TEXT, PICKER_SEARCH_PLACEHOLDER, PurchaseLinePicker } from "@/features/load-to-stock/components/purchase-line-picker";
import { LoadSourceTable } from "@/features/load-to-stock/components/load-source-table";
import { todayIso } from "@/features/quotation/lib/format";
import { authTrpc, createAuthTrpcClient } from "@/lib/auth-trpc";
import { createMasterTrpcClient, masterTrpc } from "@/lib/master-trpc";
import { controlledInventory, envelope, L1, L2, L3, LINE1, LINE2, LINE3, LINES, LOAD_ID, loadOut, VENDOR } from "./fixtures";

/**
 * IT-LS-01…06 (FE-LS-002…010, FE-LS-012, FE-LS-016/017): the route page and components through the app's provider stack,
 * rendered from seeded caches under the hooks' real query keys, and the REST calls through the real inventory client
 * against a controlled `/api/inventory/v1` server. No live backend.
 */
vi.mock("next/navigation", () => ({ usePathname: () => "/inventory/load-to-stock", useRouter: () => ({ replace: vi.fn(), push: vi.fn() }) }));
afterEach(() => vi.restoreAllMocks());

const ALL = ["load-to-stock:VIEW", "load-to-stock:ADD", "load-to-stock:EDIT", "load-to-stock:DELETE"];
const OPTIONS = { companyCurrency: "THB", stone: { codes: [], stones: [], shapes: [], sizes: [], colors: [], clarities: [], cuttings: [], qualities: [] }, locations: ["Safe A", "Shelf 1"] };

function seeded(permissions: string[], requireApproval = true) {
  const queryClient = new QueryClient();
  queryClient.setQueryData(getQueryKey(authTrpc.permission.mine, undefined, "query"), { isSuperAdmin: false, permissions });
  queryClient.setQueryData(loadKeys.options(), OPTIONS);
  queryClient.setQueryData(loadKeys.nextNumber(todayIso()), { docNo: "LSGMS2609001" });
  queryClient.setQueryData(loadKeys.vendors(""), { pages: [{ items: [VENDOR], nextCursor: null }], pageParams: [null] });
  queryClient.setQueryData(inventoryApprovalKeys.settings(), { items: [{ type: "load-to-stock", requireApproval, version: 1 }] });
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
/** The `<input>` tag carrying `marker` (React puts `value` last, so attribute order is not fixed). */
const inputTag = (html: string, marker: string) => html.match(/<input[^>]*>/g)?.find((tag) => tag.includes(marker)) ?? "";
const radio = (html: string, value: string) => inputTag(html, `value="${value}"`);
const iconButton = (html: string, label: string) => new RegExp(`<button[^>]*aria-label="${label}"[^>]*>`).exec(html)?.[0] ?? "";

describe("IT-LS-05 page shell, access and approval flow (FE-LS-002, FE-LS-009, FE-LS-014)", () => {
  it("new document: number preview, header fields, Currency = company currency (read-only), From Purchase, empty Load, Duplicate disabled", () => {
    const html = render(seeded(ALL), createElement(LoadToStockRoutePage));
    expect(html).toContain("Load to Stock No.:");
    expect(html).toContain("LSGMS2609001");
    expect(html).toContain("Number preview");
    for (const label of ["Doc Date", "Account", "Currency", "Ref."]) expect(html).toContain(`>${label}`);
    expect(html).not.toContain("Rfe.");
    expect(html).toMatch(/aria-readonly="true"[^>]*><span class="truncate">THB<\/span>/);
    expect(button(html, "From Purchase")).not.toContain('disabled=""');
    expect(html).toContain("0 items");
    expect(html).toContain(EMPTY_LOAD_TEXT);
    expect(iconButton(html, "Duplicate")).toContain('disabled=""');
    expect(iconButton(html, "Scan to add")).toContain('disabled=""');
    expect(html).not.toContain("Send to approve");
  });

  it("Company Profile without a currency: the Currency field says so (Save would be refused)", () => {
    const queryClient = seeded(ALL);
    queryClient.setQueryData(loadKeys.options(), { ...OPTIONS, companyCurrency: null });
    expect(render(queryClient, createElement(LoadToStockRoutePage))).toContain("The company currency isn't set.");
  });

  it("no VIEW: the permission message only", () => {
    const html = render(seeded(["quotation:VIEW"]), createElement(LoadToStockRoutePage));
    expect(html).toContain(LOAD_DENIED);
    expect(html).not.toContain("Load to Stock No.:");
  });

  it("approval ON (inventory setting), Draft: status chip, Send to approve, Edit / Delete enabled; rows, Stock ID 'Auto', Totals", () => {
    const queryClient = seeded(ALL, true);
    queryClient.setQueryData(loadKeys.get(LOAD_ID), loadOut());
    const html = render(queryClient, createElement(EditLoadToStockPage, { id: LOAD_ID }));
    expect(html).toContain("LSGMS2609001");
    expect(html).toContain(">Draft<");
    expect(button(html, "Send to approve")).not.toBe("");
    expect(button(html, "Edit")).not.toContain('disabled=""');
    expect(html).toContain("Stock ID on save");
    expect(html).toContain(">Auto<");
    expect(html).toContain("From PU2610-031");
    expect(html).toContain("Totals");
    expect(html).toContain("456,663.00");
    // View mode: From Purchase disabled until Edit.
    expect(button(html, "From Purchase")).toContain('disabled=""');
  });

  it("Pending: locked (no Edit / Delete), waiting note; approval OFF + stock used: Edit / Delete disabled with the reason", () => {
    const pending = seeded(ALL, true);
    pending.setQueryData(loadKeys.get(LOAD_ID), loadOut({ status: "PENDING_APPROVAL" }));
    const locked = render(pending, createElement(EditLoadToStockPage, { id: LOAD_ID }));
    expect(locked).toContain("Pending Approval");
    expect(locked).toContain("Waiting for approval · Read-only");
    expect(button(locked, "Edit")).toBe("");
    expect(button(locked, "Send to approve")).toBe("");

    const used = seeded(ALL, false);
    used.setQueryData(loadKeys.get(LOAD_ID), loadOut({ status: "APPROVED", inUse: true, approval: { ...loadOut().approval, requireApproval: false, autoApproved: true } }));
    const html = render(used, createElement(EditLoadToStockPage, { id: LOAD_ID }));
    expect(html).toContain(IN_USE_NOTE);
    expect(button(html, "Edit")).toContain('disabled=""');
    expect(button(html, "Delete")).toContain('disabled=""');
  });

  it("while the document loads: Loading…; a syncing load cannot be edited", () => {
    const queryClient = seeded(ALL);
    const missing = render(queryClient, createElement(EditLoadToStockPage, { id: "nope" }));
    expect(missing).toContain("Loading…");
    expect(loadFlow(loadOut({ syncing: true })).canEdit).toBe(false);
  });
});

describe("IT-LS-01 Add From Purchase picker (FE-LS-004)", () => {
  const input = { vendorId: VENDOR.id, q: "", from: "", to: "", excludeLineIds: [L2] };

  it("vendor's lines with remaining, without the lines on the document; OK disabled until ticked; search placeholder (DV-06)", () => {
    const queryClient = seeded(ALL);
    queryClient.setQueryData(loadKeys.search(input), { pages: [{ items: [LINE1, LINE2, LINE3, { ...LINE3, purchaseLineId: "zero", remainingPcs: 0 }], nextCursor: "c2", total: 60 }], pageParams: [null] });
    const html = render(queryClient, createElement(PurchaseLinePicker, { vendorId: VENDOR.id, companyCurrency: "THB", excludeLineIds: [L2], onCancel: vi.fn(), onConfirm: vi.fn() }));
    expect(html).toContain("Add From Purchase");
    expect(html).toContain(`placeholder="${PICKER_SEARCH_PLACEHOLDER}"`);
    expect(html).toContain("PU2610-031");
    expect(html).toContain("PU2610-038");
    expect(html).not.toContain("RU-RUBDVGVS2AA");
    expect(html.match(/aria-label="Select [^"]* from PU/g)).toHaveLength(2);
    expect(html).toContain("per ct · rate 36.20");
    expect(html).toContain("650,876.00");
    expect(button(html, "OK")).toContain('disabled=""');
    expect(button(html, "Load more")).not.toBe("");
  });

  it("design 148: shared picker look; Stone Code over 'New on load · lot chip' without the Auto badge; PU No. first", () => {
    const queryClient = seeded(ALL);
    queryClient.setQueryData(loadKeys.search(input), { pages: [{ items: [LINE1], nextCursor: null, total: 1 }], pageParams: [null] });
    const html = render(queryClient, createElement(PurchaseLinePicker, { vendorId: VENDOR.id, companyCurrency: "THB", excludeLineIds: [L2], onCancel: vi.fn(), onConfirm: vi.fn() }));
    expect(html).toContain('<thead class="sticky top-0 z-10 bg-gms-table-head text-left">');
    expect(html).toContain("<span>New on load</span>");
    expect(html).not.toContain(">Auto</span>");
    expect(html.indexOf("PU No.")).toBeLessThan(html.indexOf("Stone Code"));
    expect(html).toContain('<tr class="cursor-pointer border-b border-gms-border bg-white hover:bg-gms-row-hover">');
  });

  it("empty: 'No purchase lines left to load'", () => {
    const queryClient = seeded(ALL);
    queryClient.setQueryData(loadKeys.search({ ...input, excludeLineIds: [] }), { pages: [{ items: [], nextCursor: null, total: 0 }], pageParams: [null] });
    const html = render(queryClient, createElement(PurchaseLinePicker, { vendorId: VENDOR.id, companyCurrency: "THB", excludeLineIds: [], onCancel: vi.fn(), onConfirm: vi.fn() }));
    expect(html).toContain(PICKER_EMPTY_TEXT);
  });
});

describe("IT-LS-02 load-mode dialog (FE-LS-005)", () => {
  const dialog = (props: Partial<ComponentProps<typeof LoadModeDialog>>) =>
    render(seeded(ALL), createElement(LoadModeDialog, { picked: LINES, documentMode: "", currency: "THB", onBack: vi.fn(), onCreate: vi.fn(), ...props }));

  it("three lines: summary, the three cards with computed texts, None selected, 'Create 3 load rows'", () => {
    const html = dialog({});
    expect(html).toContain("How should these PU lines go into stock?");
    expect(html).toContain("You picked <strong>3 PU lines</strong>");
    expect(html).toContain("65,087.60 THB per pc");
    expect(html).toContain("3 load rows, same as the PU lines");
    expect(html).toContain("3 load rows → 3 stocks");
    expect(html).toContain("3 lines → 1 row · 40 pcs · 29.30 ct · average 47,366.40 THB per ct");
    expect(html).toContain("Sapphire Oval 5.0×7.0 mm (PU2610-038, 66,065.00 THB per pc)");
    expect(radio(html, "NONE")).toContain('checked=""');
    expect(button(html, "Create 3 load rows")).not.toContain('disabled=""');
    expect(button(html, "Back to list")).not.toBe("");
  });

  it("one line: Merge disabled with the reason; mixed units are allowed", () => {
    const html = dialog({ picked: [LINE1] });
    expect(radio(html, "MERGE")).toContain('disabled=""');
    expect(html).toContain("Pick at least 2 lines to merge");
    const mixed = dialog({ picked: [LINE1, { ...LINE2, priceUnit: "PER_PCS" }] });
    expect(radio(mixed, "MERGE")).not.toContain('disabled=""');
  });

  it("a later pick keeps the document's mode: other cards disabled with 'This document is in {mode} mode'", () => {
    const html = dialog({ picked: [LINE3], documentMode: "SPLIT" });
    expect(radio(html, "SPLIT")).toContain('checked=""');
    expect(radio(html, "NONE")).toContain('disabled=""');
    expect(html).toContain("This document is in Split mode");
    const merge = dialog({ picked: [LINE3], existing: [LINE1, LINE2], documentMode: "MERGE" });
    expect(merge).toContain("Add to the merged row");
    expect(merge).toContain("3 lines → 1 row · 40 pcs");
  });
});

describe("IT-LS-03 / IT-LS-04 Load table (FE-LS-003, FE-LS-006…008, FE-LS-017)", () => {
  const props = (values: Pick<LoadFormValues, "mode" | "rows" | "sources">, extra: Partial<LoadTableProps> = {}): LoadTableProps => ({
    values,
    currency: "THB",
    locations: ["Safe A", "Shelf 1"],
    readOnly: false,
    selectedKey: null,
    checkedKeys: new Set(),
    rowErrors: new Map(),
    onSelect: vi.fn(),
    onOpenPanel: vi.fn(),
    onToggleCheck: vi.fn(),
    onToggleAll: vi.fn(),
    onRemove: vi.fn(),
    onChange: vi.fn(),
    onSplit: vi.fn(),
    onRemoveGroup: vi.fn(),
    onPickEmpty: vi.fn(),
    ...extra,
  });
  const table = (values: Pick<LoadFormValues, "mode" | "rows" | "sources">, extra?: Partial<LoadTableProps>) => render(seeded(ALL), createElement(LoadTable, props(values, extra)));
  const base = { ...emptyLoad("2026-11-17"), vendorId: VENDOR.id };

  it("None: one row per line, Location required select starting empty, Pcs / Weight editable, price per ct in THB (DV-02), Totals", () => {
    const html = table(applyPick(base, LINES, "NONE"));
    expect(html.match(/aria-label="Remove load row/g)).toHaveLength(3);
    expect(html.match(/Select location/g)).toHaveLength(3);
    expect(html).toContain("Parcel");
    expect(inputTag(html, "Pcs of load row 1")).toContain('value="10"');
    expect(inputTag(html, "Pcs of load row 1")).not.toContain("readOnly");
    expect(html).toContain("52,490.00 THB");
    expect(html).toContain("1,387,835.60");
    expect(html).not.toContain("+ Split");
  });

  it("Split: a group row per line with '→ No location yet', '1 load row', the line's remaining and + Split", () => {
    const html = table(applyPick(base, [LINE1, LINE2], "SPLIT"));
    expect(html.match(/data-split-group=/g)).toHaveLength(2);
    expect(html).toContain("PU2610-031 · Sapphire Oval 5.0×7.0 mm");
    expect(html).toContain("→ No location yet");
    expect(html).toContain("1 load row");
    expect(html).toContain("10 pcs · 12.40 cts");
    expect(button(html, "Split")).not.toBe("");
  });

  it("Merge: one row, 'From PU2610-031 + PU2610-038', pcs / weight locked, average price and amount", () => {
    const html = table(applyPick(base, LINES, "MERGE"));
    expect(html.match(/aria-label="Remove load row/g)).toHaveLength(1);
    expect(html).toContain("From PU2610-031 + PU2610-038");
    expect(inputTag(html, "Pcs of load row 1")).toContain('value="40"');
    expect(inputTag(html, "Pcs of load row 1")).toContain('readOnly=""');
    expect(html).toContain("47,366.40 THB");
    expect(html).toContain("average per ct");
    expect(html).toContain("1,387,835.60");
  });

  it("row errors show 'Row n: …'; a stored inactive location stays selectable (FE-LS-017)", () => {
    const values = applyPick(base, [LINE1], "NONE");
    const html = table(values, { rowErrors: new Map([[0, "Location is required"]]) });
    expect(html).toContain("Row 1: Location is required");
    expect(rowLocationOptions(["Safe A"], "Old shelf").map((option) => option.value)).toEqual(["Old shelf", "Safe A"]);
    expect(rowLocationOptions(["Safe A"], "safe a").map((option) => option.value)).toEqual(["Safe A"]);
    expect(rowLocationOptions(["Safe A"], "").map((option) => option.value)).toEqual(["Safe A"]);
  });

  it("Item table: picked lines read-only with 'New on load Auto', 'From {PU} · date', remaining and amount", () => {
    const html = render(seeded(ALL), createElement(LoadSourceTable, { sources: [LINE1], companyCurrency: "THB" }));
    expect(html).toContain("New on load");
    expect(html).toContain("From PU2610-031 · 02/10/26");
    expect(html).toContain("BKK-01");
    expect(html).toContain("1,450.00 USD");
    expect(html).toContain("650,876.00");
    expect(html).not.toContain("<input");
  });
});

describe("IT-LS-06 calls through the real inventory client (FE-LS-010, FE-LS-016)", () => {
  it("create / update / submit / delete: paths, bodies with expectedVersion, same-origin cookie", async () => {
    const server = controlledInventory((call) => {
      if (call.path.endsWith("/submit")) return { body: { id: LOAD_ID, version: 5, status: "PENDING_APPROVAL", submittedAt: "2026-11-17T03:00:00.000Z" } };
      if (call.path.endsWith("/delete")) return { body: { id: LOAD_ID, version: 6 } };
      return { status: call.method === "POST" ? 201 : 200, body: { id: LOAD_ID, docNo: "LSGMS2609001", version: 4, status: "DRAFT", stockIds: [null] } };
    });
    const calls = loadToStockCalls({ fetch: server.fetch, renew: async () => false });
    const values = { ...applyPick({ ...emptyLoad("2026-11-17"), vendorId: VENDOR.id }, [LINE1], "NONE") };
    const input = toLoadInput({ ...values, rows: values.rows.map((row) => ({ ...row, location: "Safe A", stockPrice: "60000", salePrice: "80000" })) });
    await expect(calls.create(input)).resolves.toMatchObject({ id: LOAD_ID, status: "DRAFT" });
    await calls.update(LOAD_ID, { ...input, expectedVersion: 4 });
    await calls.submit(LOAD_ID, 4);
    await calls.remove(LOAD_ID, 5);
    expect(server.calls.map((call) => `${call.method} ${call.path}`)).toEqual([
      "POST /api/inventory/v1/load-to-stock",
      `PUT /api/inventory/v1/load-to-stock/${LOAD_ID}`,
      `POST /api/inventory/v1/load-to-stock/${LOAD_ID}/submit`,
      `POST /api/inventory/v1/load-to-stock/${LOAD_ID}/delete`,
    ]);
    expect(server.calls[0]!.body).toMatchObject({ mode: "NONE", vendorId: VENDOR.id, rows: [{ location: "Safe A", stockPrice: "60000.00", salePrice: "80000.00", sources: [{ purchaseLineId: L1, pcs: 10 }] }] });
    expect(server.calls[1]!.body).toMatchObject({ expectedVersion: 4 });
    expect(server.calls[2]!.body).toEqual({ expectedVersion: 4 });
    expect(server.calls.every((call) => call.credentials === "same-origin")).toBe(true);
  });

  it("get / search / photos-from-purchase-line parse the contract; a refused write keeps the envelope", async () => {
    const server = controlledInventory((call) => {
      if (call.path.endsWith("/purchase-lines/search")) return { body: { items: [LINE1], nextCursor: null, total: 1 } };
      if (call.path.endsWith("/photos/from-purchase-line")) return { body: { ids: ["p1", "p2"] } };
      if (call.method === "PUT") return { status: 409, body: envelope("LOAD_TO_STOCK_CHANGED", { currentVersion: 9 }) };
      return { body: loadOut() };
    });
    const calls = loadToStockCalls({ fetch: server.fetch, renew: async () => false });
    await expect(calls.get(LOAD_ID)).resolves.toMatchObject({ docNo: "LSGMS2609001", rows: [{ location: "Safe A" }] });
    await expect(calls.search({ vendorId: VENDOR.id, excludeLineIds: [L2] })).resolves.toMatchObject({ total: 1 });
    expect(server.calls[1]!.body).toEqual({ vendorId: VENDOR.id, excludeLineIds: [L2], limit: 50 });
    await expect(calls.photosFromPurchaseLine(L3)).resolves.toEqual({ ids: ["p1", "p2"] });
    const error = await calls.update(LOAD_ID, { ...toLoadInput(loadOutValues()), expectedVersion: 1 }).catch((caught: unknown) => caught);
    expect(error).toMatchObject({ status: 409, code: "LOAD_TO_STOCK_CHANGED", details: { currentVersion: 9 } });
  });

  it("PU photos are copied for every picked line with photos (Merge: only the suggested line), ≤ 3 at a time; a failed copy is counted", async () => {
    expect(photoLines(LINES, "NONE", false).map((ref) => ref.purchaseLineId)).toEqual([L1, L3]);
    expect(photoLines(LINES, "MERGE", false).map((ref) => ref.purchaseLineId)).toEqual([L3]);
    expect(photoLines(LINES, "MERGE", true)).toEqual([]);
    let running = 0;
    let peak = 0;
    const copy = vi.fn(async (id: string) => {
      running += 1;
      peak = Math.max(peak, running);
      await new Promise((resolve) => setTimeout(resolve, 1));
      running -= 1;
      if (id === "bad") throw new Error("x");
      return { ids: [`${id}-p`] };
    });
    const lines = ["a", "b", "c", "d", "bad"].map((id) => ({ ...LINE1, purchaseLineId: id }));
    const { photos, failed } = await copyLinePhotos(lines, copy);
    expect(peak).toBeLessThanOrEqual(3);
    expect(failed).toBe(1);
    expect(photos.get("d")).toEqual(["d-p"]);
  });
});

describe("FE-LS-012 navigation", () => {
  it("the sidebar Load to Stock opens the page and stays active on saved documents (DV-10)", () => {
    const inventory = sidebarSections.find((section) => section.id === "inventory")!;
    const item = inventory.items.find((entry): entry is NavLink => entry.kind === "link" && entry.id === "load-to-stock")!;
    expect(navigationHref({ slug: "load-to-stock", label: "Load to Stock" } as never)).toBe("/inventory/load-to-stock");
    expect(item.href).toBe("/inventory/load-to-stock");
    expect(isNavItemActive(item, "/inventory/load-to-stock")).toBe(true);
    expect(isNavItemActive(item, `/inventory/load-to-stock/${LOAD_ID}`)).toBe(true);
    expect(isNavItemActive(item, "/pre-sale/quotation")).toBe(false);
  });
});

function loadOutValues() {
  return { ...emptyLoad("2026-11-17"), vendorId: VENDOR.id, mode: "NONE" as const, sources: [LINE1], rows: [] };
}
