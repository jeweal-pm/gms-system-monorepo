import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { createElement, type ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { FormProvider, useForm } from "react-hook-form";
import { describe, expect, it } from "vitest";
import { MEMO_OUT_KIND } from "@/features/memo-out/components/MemoOutPage";
import { MEMO_RECEIVE_KIND } from "@/features/memo-receive/defaults";
import { PURCHASE_KIND } from "@/features/purchase/components/PurchasePage";
import { ItemEditorPanel } from "@/features/quotation/components/items/ItemEditorPanel";
import { itemColumns, ItemTable } from "@/features/quotation/components/items/ItemTable";
import { DEFAULT_PRICE_TITLE, DocumentKindContext, QUOTATION_KIND, type DocumentKind } from "@/features/quotation/document-kind";
import { calculateTotals } from "@/features/quotation/lib/calculate";
import { emptyLine, emptyQuotation } from "@/features/quotation/lib/defaults";
import { customerStockConfig } from "@/features/trade-document/customer-stock-config";
import { DOCUMENT_PHOTOS } from "@/features/trade-document/document-photos";

/** UT-PU-02 (purchase FE-PU-001): `DocumentKind.priceTitle`, default "Sale Price". */

const noop = () => undefined;
const line = { ...emptyLine(), stone: "Ruby", stoneCode: "RU-1", pcs: "1", weightCt: "1.000", unitPrice: "100" };
const RESERVE_KIND = customerStockConfig({
  photos: DOCUMENT_PHOTOS.reserve, noun: "reserve", title: "Reserve", newHref: "/pre-sale/reserve", detailHref: (id) => id, useApi: () => { throw new Error("not called"); },
  mapSaveError: () => ({ fieldErrors: [], message: "" }), mapRestoreError: () => ({ message: "", refetch: false }), pickerTitle: "Add From Stock", approvedStock: "held", noStock: "held", notePlaceholder: "", noteHint: "", daybook: null,
}).kind as DocumentKind;

function table(kind: DocumentKind) {
  return renderToStaticMarkup(
    createElement(
      DocumentKindContext.Provider,
      { value: kind },
      createElement(ItemTable, {
        lines: [line],
        currency: "USD",
        totals: calculateTotals({ ...emptyQuotation(), lines: [line] }),
        selectedIndex: null,
        checkedKeys: new Set<string>(),
        readOnly: false,
        onSelectRow: noop,
        onToggleCheck: noop,
        onToggleAll: noop,
        onRowAction: noop,
        onAddRow: noop,
      }),
    ),
  );
}

function Form({ children }: { children: ReactNode }) {
  const form = useForm({ defaultValues: { ...emptyQuotation(), lines: [line] } });
  return createElement(FormProvider, form as never, children);
}

function panel(kind: DocumentKind) {
  return renderToStaticMarkup(
    createElement(
      QueryClientProvider,
      { client: new QueryClient() },
      createElement(
        DocumentKindContext.Provider,
        { value: kind },
        createElement(Form, null, createElement(ItemEditorPanel, { index: 0, total: 1, readOnly: false, onPrev: noop, onNext: noop, onNextRow: noop, onRemove: noop, onClose: noop })),
      ),
    ),
  );
}

const headers = (html: string) => (html.match(/<span class="block">([^<]+)<\/span>/g) ?? []).map((h) => h.replace(/<[^>]+>/g, ""));

describe("UT-PU-02 price column title and row-panel price label", () => {
  it("itemColumns defaults to Sale Price and takes the kind's title", () => {
    expect(DEFAULT_PRICE_TITLE).toBe("Sale Price");
    expect(itemColumns(true).map((c) => c.title)).toContain("Sale Price");
    expect(itemColumns(true, true, true, "Price").find((c) => c.sub === "Unit")?.title).toBe("Price");
  });

  it("existing kinds (Quotation, Memo Receive, Memo Out, Reserve) still show Sale Price", () => {
    for (const kind of [QUOTATION_KIND, MEMO_RECEIVE_KIND, MEMO_OUT_KIND, RESERVE_KIND]) {
      expect(kind.priceTitle).toBeUndefined();
      expect(headers(table(kind))).toContain("Sale Price");
      expect(panel(kind)).toContain(">Sale Price<");
    }
  });

  it("purchase shows Price (Unit) in the table and Price in the row panel, never Sale Price", () => {
    const html = table(PURCHASE_KIND);
    const titles = headers(html);
    expect(titles).toEqual(["Stone Code", "Location", "Stone", "Color · Clarity", "Cer Type", "Pcs", "Weight (ct)", "Price", "Amount"]);
    expect(html).not.toContain("Sale Price");
    const row = panel(PURCHASE_KIND);
    expect(row).toContain(">Price<");
    expect(row).not.toContain("Sale Price");
  });
});
