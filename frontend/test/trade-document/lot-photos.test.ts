import { describe, expect, it } from "vitest";
import { lotPhotos, lotToStockLine, lotUnitPrice } from "@/features/trade-document/customer-stock";
import { lotToSaleLine, type SaleLine } from "@/features/sale/form";
import type { FromStockItem } from "@/features/trade-document/from-stock-api";
import { lotToLine } from "@/features/memo-return/api";
import { applyMerge, findMergePairs, memoStockToPurchaseLine } from "@/features/purchase/form";
import { memoRow } from "../purchase/fixtures";
import { stockItem } from "../sale/fixtures";

/** Owner 2026-11-24: a picked Memo Stock lot references the photos of its Memo Receive lines (no copy); own stock brings none. */
const url = (id: string) => `/api/v1/doc/photos/${id}`;
const memo = (patch: Record<string, unknown> = {}) => ({ ...stockItem(), photoIds: ["p1", "p2"], ...patch }) as FromStockItem;

describe("lot photos by reference", () => {
  it("a Memo Stock lot brings its photo ids as rows with the document's own photo route, at most 5", () => {
    // The preview URL names the lot (the row is not saved yet, so no line links the file); the server checks the file belongs to it.
    const lot = `?lotKey=${encodeURIComponent(memo().lotKey)}`;
    expect(lotPhotos(memo(), url)).toEqual([{ id: "p1", name: "Photo 1", url: `/api/v1/doc/photos/p1${lot}` }, { id: "p2", name: "Photo 2", url: `/api/v1/doc/photos/p2${lot}` }]);
    expect(lotPhotos(memo({ photoIds: ["a", "b", "c", "d", "e", "f"] }), url)).toHaveLength(5);
  });

  it("own-stock rows, rows without a photo route and lots without photos bring none", () => {
    expect(lotPhotos(memo({ source: "OWN_STOCK" }), url)).toEqual([]);
    expect(lotPhotos(memo(), undefined)).toEqual([]);
    expect(lotPhotos(stockItem(), url)).toEqual([]);
  });

  it("Quotation / Reserve / Memo Out rows and Sale rows carry them; the lot row still has no Stock ID", () => {
    const line = lotToStockLine(memo(), url);
    expect(line.photos.map((photo) => photo.id)).toEqual(["p1", "p2"]);
    expect(line.stockId).toBe("");
    const sale: SaleLine = lotToSaleLine(memo(), undefined, url);
    expect(sale.photos.map((photo) => photo.url)).toEqual([`/api/v1/doc/photos/p1?lotKey=${memo().lotKey}`, `/api/v1/doc/photos/p2?lotKey=${memo().lotKey}`]);
    expect(sale.stockId).toBe("");
    expect(lotToStockLine(memo()).photos).toEqual([]);
  });

});

describe("lot price prefill", () => {
  const priced = (patch: Record<string, unknown> = {}) => memo({ salePrice: "900.00", saleAmount: "2700.00", saleCurrency: "USD", ...patch });
  it("a Memo Stock lot's price starts the row's Sale Price when it is in the document currency; otherwise empty", () => {
    expect(lotUnitPrice(priced(), "USD")).toBe("900.00");
    expect(lotUnitPrice(priced(), "THB")).toBe("");
    expect(lotUnitPrice(priced({ salePrice: null }), "USD")).toBe("");
    expect(lotUnitPrice(priced({ salePrice: "0.00" }), "USD")).toBe("");
    expect(lotToStockLine(priced(), url, "USD").unitPrice).toBe("900.00");
    expect(lotToStockLine(priced(), url, "THB").unitPrice).toBe("");
    expect(lotToStockLine(priced()).unitPrice).toBe("");
    expect(lotToSaleLine(priced(), { currency: "USD", exchangeRate: "", companyCurrency: "THB" }).unitPrice).toBe("900.00");
    expect(lotToSaleLine(priced(), { currency: "THB", exchangeRate: "", companyCurrency: "THB" }).unitPrice).toBe("");
  });
});

describe("Purchase and Memo Return carry the memo photos too", () => {
  it("Purchase rows (Memo Stock button) bring the lot's photos by reference; a merged Sold + In-stock row keeps both parts' photos (<= 5)", () => {
    const sold = memoStockToPurchaseLine({ ...memoRow({ memoGroup: "SOLD" }), photoIds: ["a", "b"] } as never, url);
    const inStock = memoStockToPurchaseLine({ ...memoRow({ memoGroup: "IN_STOCK" }), photoIds: ["b", "c", "d", "e", "f"] } as never, url);
    expect(sold.photos.map((photo) => photo.url)).toEqual([`/api/v1/doc/photos/a?lotKey=${memoRow().lotKey}`, `/api/v1/doc/photos/b?lotKey=${memoRow().lotKey}`]);
    const pair = findMergePairs([sold, inStock], []);
    const merged = applyMerge([sold, inStock], pair).rows.find((line) => line.memoGroup === "MERGED");
    expect(merged?.photos.map((photo) => photo.id)).toEqual(["a", "b", "c", "d", "e"]);
    expect(memoStockToPurchaseLine(memoRow()).photos).toEqual([]);
  });

  it("Memo Return rows bring them with the Memo Return photo route", () => {
    const line = lotToLine({ ...stockItem(), photoIds: ["m1"] } as never, url);
    expect(line.photos).toEqual([{ id: "m1", name: "Photo 1", url: `/api/v1/doc/photos/m1?lotKey=${stockItem().lotKey}` }]);
    expect(lotToLine(stockItem() as never).photos).toEqual([]);
  });
});
