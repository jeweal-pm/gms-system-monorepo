import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { getQueryKey } from "@trpc/react-query";
import { createElement, isValidElement, type ComponentProps, type ReactElement, type ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, describe, expect, it, vi } from "vitest";
import SaleRoutePage from "@/app/(app)/sale/sale/page";
import SaleDetailRoutePage from "@/app/(app)/sale/sale/[id]/page";
import { navigationHref, navigationLabelFor, REAL_PAGE_HREFS, sidebarSections } from "@/features/home/navigation";
import {
  canViewSale,
  createReserveRowGuard,
  EditSalePage,
  SALE_BINDING,
  SALE_CONFIG,
  SALE_DENIED,
  SALE_EMPTY_ROW_TEXT,
  SALE_KIND,
  SALE_NOT_FOUND,
  saleConfig,
  SaleItemTable,
  SalePage,
  type SaleBinding,
  type SaleOptions,
} from "@/features/sale/components/SalePage";
import { ReserveLinePicker, SaleStockPicker } from "@/features/sale/components/sale-pickers";
import { SALE_PHOTOS, saleKeys } from "@/features/sale/api";
import { inventoryApprovalKeys } from "@/features/inventory/approval";
import { todayIso } from "@/features/quotation/lib/format";
import { emptySale, lotToSaleLine, reserveLineToSaleLine, type SaleFormValues } from "@/features/sale/form";
import type { ConfirmRequest } from "@/features/quotation/components/use-confirm";
import { authTrpc, createAuthTrpcClient } from "@/lib/auth-trpc";
import { createMasterTrpcClient, masterTrpc } from "@/lib/master-trpc";
import { CUSTOMER_B, ID, reserveLine, saleOut, stockItem } from "./fixtures";

/**
 * IT-SL-02 / UT-SL-05 / IT-SL-05 (sale FE-SL-002…009): the route pages on the live binding (inventory REST adapter,
 * caches seeded under the hooks' real query keys, no request sent) and the page config with a typed test binding.
 */

vi.mock("next/navigation", () => ({
  usePathname: () => "/sale/sale",
  useRouter: () => ({ replace: vi.fn(), push: vi.fn() }),
}));
afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

function withProviders(queryClient: QueryClient, children: ReactNode) {
  const authProps = { client: createAuthTrpcClient(), queryClient } as ComponentProps<typeof authTrpc.Provider>;
  const masterProps = { client: createMasterTrpcClient(), queryClient } as ComponentProps<typeof masterTrpc.Provider>;
  return createElement(QueryClientProvider, { client: queryClient }, createElement(authTrpc.Provider, authProps, createElement(masterTrpc.Provider, masterProps, children)));
}
function seeded(permissions: string[] | null) {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false, enabled: false } } });
  if (permissions) queryClient.setQueryData(getQueryKey(authTrpc.permission.mine, undefined, "query"), { isSuperAdmin: false, permissions });
  queryClient.setQueryData(getQueryKey(masterTrpc.currency.options, undefined, "query"), {
    items: [{ code: "THB", name: "Thai Baht", active: true, sellingRate: null, buyingRate: null }],
    baseCode: "THB",
  });
  queryClient.setQueryData(getQueryKey(masterTrpc.approvalSetting.list, undefined, "query"), {
    items: [{ type: "reserve", requireApproval: true, available: true, version: 1, updatedAt: "2026-11-10T00:00:00.000Z", updatedByName: null, waiting: null }],
  });
  return queryClient;
}
const decoded = (html: string) => html.replaceAll("&#x27;", "'").replaceAll("&amp;", "&");
const render = (queryClient: QueryClient, element: ReactElement) => decoded(renderToStaticMarkup(withProviders(queryClient, element)));
const button = (html: string, label: string) => new RegExp(`<button[^>]*>(?:(?!</button>).)*${label}(?:(?!</button>).)*</button>`).exec(html)?.[0] ?? "";

const OPTIONS = {
  customers: [
    { id: ID, code: "C001", name: "Aom", active: true, currency: "THB", addresses: [{ id: ID, type: "SHIPPING", label: "Shop", isDefault: true }, { id: CUSTOMER_B, type: "INVOICE", label: "HQ", isDefault: true }] },
  ],
  companyCurrency: "THB",
  numbering: { configured: true },
  stone: { stoneCodes: [], parts: {} },
} as unknown as SaleOptions;

const picked: string[] = [];
/** A typed stand-in for FE-SL-004…009 (tests only): static options and number preview; writes are never called here. */
const binding = (patch: Partial<SaleBinding> = {}): SaleBinding => ({
  useApi: () => ({
    options: OPTIONS,
    companyCurrency: "THB",
    nextDocNo: "SL-26110001",
    create: () => Promise.reject(new Error("not called")),
    update: () => Promise.reject(new Error("not called")),
    remove: () => Promise.reject(new Error("not called")),
    submit: () => Promise.reject(new Error("not called")),
    restore: () => Promise.reject(new Error("not called")),
    invalidate: () => Promise.resolve(),
    busy: false,
  }),
  useDetail: () => ({ isPending: false, error: null, loaded: null }),
  loadError: () => "Couldn't load this sale.",
  mapSaveError: () => ({ fieldErrors: [], message: "" }),
  mapRestoreError: () => ({ message: "", refetch: false }),
  approvalType: "reserve",
  daybook: null,
  fromReserve: () => {
    picked.push("reserve");
    return createElement("div", null, "Add From Reserve");
  },
  fromStock: () => {
    picked.push("stock");
    return createElement("div", null, "Add From Stock");
  },
  ...patch,
});

describe("FE-SL-002 / FE-SL-008 access and routes (TC-SL-01/02, UT-SL-08)", () => {
  it("reads the existing sale leaf; the sidebar Sale item opens /sale/sale", () => {
    expect(canViewSale({ isSuperAdmin: false, permissions: ["sale:VIEW"] })).toBe(true);
    expect(canViewSale({ isSuperAdmin: false, permissions: ["reserve:VIEW"] })).toBe(false);
    expect(canViewSale(undefined)).toBe(false);
    expect(REAL_PAGE_HREFS.sale).toBe("/sale/sale");
    expect(navigationHref({ label: "Sale", slug: "sale" })).toBe("/sale/sale");
    // The sidebar item itself (owner 2026-11-18: it still opened the /modules/sale placeholder).
    const sidebarSale = sidebarSections.flatMap((section) => section.items).find((item) => item.kind === "link" && item.id === "sale");
    expect(sidebarSale).toMatchObject({ href: "/sale/sale", activePrefix: "/sale/sale" });
    expect(navigationLabelFor("/sale/sale")).toBe("Sale");
  });

  it("live binding: loading, no-VIEW text on both routes", () => {
    expect(render(seeded(null), createElement(SaleRoutePage))).toContain("Loading…");
    const denied = render(seeded(["reserve:VIEW"]), createElement(SaleRoutePage));
    expect(denied).toContain(SALE_DENIED);
    expect(denied).toContain("You don't have permission to view sales.");
    // `use(params)` reads an already-fulfilled thenable synchronously in a static render.
    const params = Object.assign(Promise.resolve({ id: ID }), { status: "fulfilled", value: { id: ID } });
    expect(render(seeded(["reserve:VIEW"]), createElement(SaleDetailRoutePage, { params }))).toContain(SALE_DENIED);
  });
});

/** The live route's reads seeded under their real keys (queries are disabled, so nothing is fetched). */
function live(permissions: string[]) {
  const queryClient = seeded(permissions);
  queryClient.setQueryData(saleKeys.options(undefined), OPTIONS);
  queryClient.setQueryData(saleKeys.options(ID), OPTIONS);
  queryClient.setQueryData(saleKeys.nextNumber(todayIso()), { docNo: "SL-1002" });
  queryClient.setQueryData(inventoryApprovalKeys.settings(), { items: [{ type: "sale", requireApproval: true, version: 1 }] });
  return queryClient;
}

describe("IT-SL-02 live Sale page (FE-SL-006, owner 2026-11-20 \"ทำหน้า sale ให้เสร็จ\")", () => {
  it("new sale: number preview from the API, header, From Reserve then From Stock, Save enabled with ADD, no not-connected text", () => {
    const html = render(live(["sale:VIEW", "sale:ADD"]), createElement(SaleRoutePage));
    expect(html).toContain("Sale No.:");
    expect(html).toContain("SL-1002");
    expect(html).toContain("Number preview");
    expect(html).not.toContain("Not connected");
    for (const label of ["Doc Date", "Customer", "Shipping Address", "Invoice Address", "Due Date", "Currency", "Ref."]) expect(html).toContain(`>${label}`);
    const fromReserve = html.indexOf(button(html, "From Reserve"));
    const fromStock = html.indexOf(button(html, "From Stock"));
    expect(fromReserve).toBeGreaterThan(-1);
    expect(fromStock).toBeGreaterThan(fromReserve);
    expect(html).not.toMatch(/>s*Add rows*</);
    expect(html).toContain(SALE_EMPTY_ROW_TEXT);
    expect(button(html, "Save")).not.toContain('disabled=""');
    expect(render(live(["sale:VIEW"]), createElement(SaleRoutePage))).not.toContain("Create New");
  });

  it("saved sale: the API document in position order with its source captions, status and Edit", () => {
    const queryClient = live(["sale:VIEW", "sale:EDIT"]);
    queryClient.setQueryData(saleKeys.get(ID), saleOut());
    const params = Object.assign(Promise.resolve({ id: ID }), { status: "fulfilled", value: { id: ID } });
    const html = render(queryClient, createElement(SaleDetailRoutePage, { params }));
    expect(html).toContain("SL-1001");
    expect(html).toContain("Draft");
    // Sale keeps the Stock ID of a Reserve line (owner Q3); a lot line has none and shows its caption alone.
    expect(html.indexOf("260014 · from RS-1001")).toBeGreaterThan(-1);
    expect(html.indexOf("from MR-26100012")).toBeGreaterThan(html.indexOf("260014 · from RS-1001"));
    expect(button(html, "Edit")).not.toContain('disabled=""');
  });

  it("the live binding: approval type sale, sale photo route, From Reserve on the reserve-lines picker, From Stock on SaleStockPicker", () => {
    expect(SALE_BINDING.approvalType).toBe("sale");
    expect(SALE_BINDING.photos).toBe(SALE_PHOTOS);
    expect(SALE_CONFIG.photos?.route).toBe("/api/inventory/v1/sale/photos");
    const values: SaleFormValues = { ...emptySale(), customerId: ID, currency: "USD", lines: [reserveLineToSaleLine(reserveLine()), lotToSaleLine(stockItem())] };
    const reserve = SALE_BINDING.fromReserve({ values, onClose: () => undefined, onAdd: () => undefined }) as ReactElement<{ customerId: string; currency: string; excluded: Set<string> }>;
    expect(reserve.type).toBe(ReserveLinePicker);
    expect(reserve.props.customerId).toBe(ID);
    expect(reserve.props.currency).toBe("USD");
    expect([...reserve.props.excluded]).toEqual([reserveLine().reserveLineId]);
    // ADR-0058: the dialog is the Sale binding of the shared lot dialog (own stock + Memo Stock, no Memo-only restriction).
    const stock = SALE_BINDING.fromStock({ values, onClose: () => undefined, onAdd: () => undefined }) as ReactElement<{ values: SaleFormValues }>;
    expect(stock.type).toBe(SaleStockPicker);
    expect(stock.props.values).toBe(values);
  });
});

describe("FE-SL-002 saved sale through a binding", () => {
  it("saved sale through a binding: loading, not found and the load error text", () => {
    const access = ["sale:VIEW"];
    expect(render(seeded(access), createElement(EditSalePage, { id: ID, binding: binding({ useDetail: () => ({ isPending: true, error: null, loaded: null }) }) }))).toContain("Loading…");
    expect(render(seeded(access), createElement(EditSalePage, { id: ID, binding: binding() }))).toContain(SALE_NOT_FOUND);
    expect(render(seeded(access), createElement(EditSalePage, { id: ID, binding: binding({ useDetail: () => ({ isPending: false, error: new Error("x"), loaded: null }) }) }))).toContain(
      "Couldn't load this sale.",
    );
  });
});

describe("IT-SL-02 page composition with a binding (TC-SL-01 shell)", () => {
  it("number preview, Sale No., customer header, From Reserve then From Stock, no Add row, empty-row text, note 0 / 250", () => {
    const html = render(seeded(["sale:VIEW", "sale:ADD"]), createElement(SalePage, { binding: binding() }));
    expect(html).toContain("Sale No.:");
    expect(html).toContain("SL-26110001");
    expect(html).toContain("Number preview");
    for (const label of ["Doc Date", "Customer", "Shipping Address", "Invoice Address", "Due Date", "Currency", "Ref."]) expect(html).toContain(`>${label}`);
    const fromReserve = html.indexOf(button(html, "From Reserve"));
    const fromStock = html.indexOf(button(html, "From Stock"));
    expect(fromReserve).toBeGreaterThan(-1);
    expect(fromStock).toBeGreaterThan(fromReserve);
    expect(html).not.toMatch(/>\s*Add row\s*</);
    expect(html).toContain(SALE_EMPTY_ROW_TEXT);
    expect(html).toContain("5 rows");
    expect(html).toContain("/ 250");
    expect(html).toContain("Printed on the sale for the customer");
    // Pickers render only when opened.
    expect(picked).toEqual([]);
  });

  it("view-only holders get a disabled Save (ADD gate)", () => {
    const html = render(seeded(["sale:VIEW"]), createElement(SalePage, { binding: binding() }));
    expect(button(html, "Save")).toContain('disabled=""');
  });
});

describe("UT-SL-05 SALE config (FE-SL-003)", () => {
  const config = saleConfig(binding());
  const values: SaleFormValues = { ...emptySale(), customerId: ID, currency: "THB" };

  it("picker = From Reserve (blocked without customer / currency), secondaryPicker = From Stock (not blocked)", () => {
    expect(config.noLabel).toBe("Sale No.:");
    expect(config.pickLabel).toBe("From Reserve");
    expect(config.secondaryPicker?.label).toBe("From Stock");
    expect(config.picker!.blockedReason({ ...values, customerId: "" })).toBe("Choose a customer first");
    expect(config.picker!.blockedReason({ ...values, currency: "" })).toBe("Choose a currency first");
    expect(config.picker!.blockedReason(values)).toBeNull();
    expect(config.picker!.addedToast(1)).toBe("Added 1 item from Reserve");
    expect(config.secondaryPicker!.addedToast!(2)).toBe("Added 2 items from Stock");
    const reserveDialog = config.picker!.render({ values, onClose: () => undefined, onAdd: () => undefined });
    const stockDialog = config.secondaryPicker!.render!({ values: emptySale(), onClose: () => undefined, onAdd: () => undefined });
    expect(isValidElement(reserveDialog) && isValidElement(stockDialog)).toBe(true);
    expect(picked).toEqual(["reserve", "stock"]);
  });

  it("pick-only stock-quantity kind (no Add row; empty row opens From Reserve), 250 note, schema and mapping from form.ts", async () => {
    expect(SALE_KIND).toMatchObject({ stockQuantity: true, pickOnly: true, emptyRowText: SALE_EMPTY_ROW_TEXT, documentNote: { max: 250 } });
    expect(config.kind).toBe(SALE_KIND);
    // Never the Quotation photo route; the page uploads through SALE_PHOTOS (FE-SL-007).
    await expect(SALE_KIND.uploadPhoto(new File([""], "a.png"))).rejects.toThrow("need the sale photo route");
    expect(config.emptyRowText).toBe(SALE_EMPTY_ROW_TEXT);
    expect(config.itemTable).toBe(SaleItemTable);
    expect(SALE_KIND.stockNote!(reserveLineToSaleLine(reserveLine()))).toBe("Reserved 2 pcs / 1.36 ct · RS-26110001");
    expect(config.empty().lines).toHaveLength(5);
    expect(config.partyId(values)).toBe(ID);
    expect(config.detailHref(ID)).toBe(`/sale/sale/${ID}`);
  });
});

describe("IT-SL-05 customer / currency change guard (TC-SL-07)", () => {
  type Name = Parameters<Parameters<typeof createReserveRowGuard>[0]["setValue"]>[0];
  function harness(start: SaleFormValues, answer: boolean) {
    let values = structuredClone(start);
    const asked: ConfirmRequest[] = [];
    const queue: (() => void)[] = [];
    const guard = createReserveRowGuard({
      getValues: () => values,
      setValue: (name: Name, value: never) => {
        values = { ...values, [name]: value };
      },
      confirm: (request) => {
        asked.push(request);
        return Promise.resolve(answer);
      },
      defer: (run) => queue.push(run),
    });
    /** A user picks another customer; the header then fills its addresses and currency (as QuotationInfoForm does). */
    const changeCustomer = async (id: string, currency: string) => {
      values = { ...values, customerId: id };
      guard.onWatch({ name: "customerId", type: "change" });
      values = { ...values, shippingAddressId: "new-ship", invoiceAddressId: "new-inv", currency, exchangeRate: "36.5" };
      guard.onWatch({ name: "currency" });
      queue.shift()?.();
      await new Promise((resolve) => setTimeout(resolve, 0));
    };
    /** A user picks another currency only; the header then fills its rate. */
    const changeCurrency = async (currency: string) => {
      values = { ...values, currency };
      guard.onWatch({ name: "currency", type: "change" });
      values = { ...values, exchangeRate: "36.5" };
      guard.onWatch({ name: "exchangeRate" });
      queue.shift()?.();
      await new Promise((resolve) => setTimeout(resolve, 0));
    };
    return { get values() { return values; }, asked, guard, changeCustomer, changeCurrency, queue };
  }
  const start = (): SaleFormValues => ({
    ...emptySale(), customerId: ID, shippingAddressId: ID, invoiceAddressId: ID, currency: "THB", exchangeRate: "",
    lines: [reserveLineToSaleLine(reserveLine()), lotToSaleLine(stockItem()), ...emptySale().lines.slice(2)],
  });

  it("OK clears only the From Reserve rows and keeps the new customer", async () => {
    const h = harness(start(), true);
    await h.changeCustomer(CUSTOMER_B, "USD");
    expect(h.asked.map((request) => request.title)).toEqual(["Change the customer?"]);
    expect(h.values.customerId).toBe(CUSTOMER_B);
    expect(h.values.lines[0]!.saleSource).toBe("");
    expect(h.values.lines[1]!.saleSource).toBe("STOCK");
  });

  it("Cancel puts back the customer, addresses, currency and rate and keeps every row", async () => {
    const h = harness(start(), false);
    await h.changeCustomer(CUSTOMER_B, "USD");
    expect(h.values).toMatchObject({ customerId: ID, shippingAddressId: ID, invoiceAddressId: ID, currency: "THB", exchangeRate: "" });
    expect(h.values.lines[0]!.saleSource).toBe("RESERVE");
  });

  it("no From Reserve rows, or a reset (not a user change): nothing is asked", async () => {
    const noReserve = harness({ ...start(), lines: emptySale().lines }, true);
    await noReserve.changeCustomer(CUSTOMER_B, "USD");
    expect(noReserve.asked).toEqual([]);
    expect(noReserve.values.customerId).toBe(CUSTOMER_B);
    const reset = harness(start(), true);
    reset.guard.onWatch({});
    expect(reset.asked).toEqual([]);
  });

  it("a currency change alone asks about the currency; Cancel restores it; an address edit asks nothing", async () => {
    const h = harness(start(), false);
    h.guard.onWatch({ name: "shippingAddressId", type: "change" });
    expect(h.queue).toHaveLength(0);
    await h.changeCurrency("USD");
    expect(h.asked.map((request) => request.title)).toEqual(["Change the currency?"]);
    expect(h.values).toMatchObject({ currency: "THB", exchangeRate: "" });
  });
});

