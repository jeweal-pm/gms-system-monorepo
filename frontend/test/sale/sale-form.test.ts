import { describe, expect, it } from "vitest";
import {
  clearReserveRows,
  emptySale,
  lotToSaleLine,
  pickedReserveLineIds,
  pickedStockIds,
  reserveLineToSaleLine,
  reserveRowCount,
  SALE_HREF,
  SALE_LINES_MAX,
  saleHeaderChangeConfirm,
  saleHref,
  saleLineSource,
  salePickerBlocked,
  saleSchema,
  saleStockNote,
  saleTableLine,
  toSaleInput,
  type SaleFormValues,
  type SaleLine,
} from "@/features/sale/form";
import { ID, LOT, RESERVE_LINE, reserveLine, STOCK, stockItem } from "./fixtures";

/** UT-SL-01…04 and UT-SL-06: the Sale form model (sale UI rev 1 + SA rev 1, FE-SL-003). */

const valid = (lines: SaleLine[]): SaleFormValues => ({
  ...emptySale(),
  docDate: "2026-11-18",
  dueDate: "2026-11-30",
  customerId: ID,
  shippingAddressId: ID,
  invoiceAddressId: ID,
  currency: "THB",
  lines: [...lines, ...emptySale().lines.slice(lines.length)],
});
const issues = (values: SaleFormValues) => {
  const result = saleSchema.safeParse(values);
  return result.success ? [] : result.error.issues.map((issue) => [issue.path.join("."), issue.message]);
};

describe("UT-SL-01 new sale and routes", () => {
  it("starts as a Draft with five empty rows and no source; routes under /sale/sale", () => {
    const sale = emptySale();
    expect(sale.status).toBe("DRAFT");
    expect(sale.lines).toHaveLength(5);
    expect(sale.lines.every((line) => line.saleSource === "" && line.reserveLineId === "" && line.memoStockId === "")).toBe(true);
    expect(SALE_HREF).toBe("/sale/sale");
    expect(saleHref(ID)).toBe(`/sale/sale/${ID}`);
  });

  it("requires the customer, both addresses, Due Date ≥ Doc Date and at least one row", () => {
    const empty = issues({ ...emptySale(), dueDate: "2026-11-01", docDate: "2026-11-18" }).map(([path]) => path);
    expect(empty).toEqual(expect.arrayContaining(["customerId", "shippingAddressId", "invoiceAddressId", "dueDate", "lines"]));
  });

  it("allows at most 200 rows", () => {
    const many = Array.from({ length: SALE_LINES_MAX + 1 }, () => reserveLineToSaleLine(reserveLine()));
    expect(issues({ ...valid([]), lines: many }).some(([, message]) => message === "Up to 200 rows")).toBe(true);
  });
});

describe("UT-SL-02 picked rows: reserve line and memo stock mapping, price prefill", () => {
  it("a Reserve line fills a locked row at its open quantity with the Reserve price (2 dp)", () => {
    const line = reserveLineToSaleLine(reserveLine());
    expect(line).toMatchObject({
      source: "STOCK", saleSource: "RESERVE", reserveLineId: RESERVE_LINE, memoStockId: STOCK, sourceDocNo: "RS-26110001",
      stockId: "260003", stoneCode: "TM-OV", locationId: "Memo", pcs: "2", weightCt: "1.360", priceUnit: "PER_CT", unitPrice: "12500.46",
      stockPendingPcs: "2", stockPendingWeightCt: "1.36",
    });
    expect(saleLineSource(line)).toBe("RESERVE");
  });

  it("a Memo Stock lot fills a From Stock row at its pending with an empty Sale Price, its Memo Receive No. and no Stock ID", () => {
    const line = lotToSaleLine(stockItem());
    expect(line).toMatchObject({
      source: "STOCK", saleSource: "STOCK", reserveLineId: "", memoStockId: "", lotKey: LOT, sourceDocNo: "MR-26100012",
      stockId: "", locationId: "Memo", pcs: "3", weightCt: "2.100", priceUnit: "PER_PCS", unitPrice: "", stockPendingPcs: "3", stockPendingWeightCt: "2.100",
    });
  });
});

describe("UT-SL-03 row rules (Q-SL-06/08)", () => {
  it("accepts quantities up to the cap and a Sale Price > 0", () => {
    expect(issues(valid([{ ...reserveLineToSaleLine(reserveLine()), pcs: "2", weightCt: "1.36" }, { ...lotToSaleLine(stockItem()), unitPrice: "900" }]))).toEqual([]);
  });

  it("0 quantity, above the cap and a missing price are row errors naming the cap", () => {
    const reserve = { ...reserveLineToSaleLine(reserveLine()), pcs: "3", weightCt: "1.5" };
    const stock = { ...lotToSaleLine(stockItem()), pcs: "0", weightCt: "0" };
    const found = issues(valid([reserve, stock]));
    expect(found).toEqual(
      expect.arrayContaining([
        ["lines.0.pcs", "More than the reserved 2 pcs"],
        ["lines.0.weightCt", "More than the reserved 1.36 ct"],
        ["lines.1.pcs", "Enter the quantity"],
        ["lines.1.unitPrice", "Enter the sale price"],
      ]),
    );
    const overStock = issues(valid([{ ...lotToSaleLine(stockItem()), pcs: "4", unitPrice: "1" }]));
    expect(overStock).toContainEqual(["lines.0.pcs", "More than the available 3 pcs"]);
    expect(issues(valid([{ ...reserveLineToSaleLine(reserveLine()), unitPrice: "0" }]))).toContainEqual(["lines.0.unitPrice", "Enter the sale price"]);
  });

  it("a filled row without a picker source is refused (pick-only)", () => {
    const typed = { ...emptySale().lines[0]!, stone: "Ruby", pcs: "1", unitPrice: "10" };
    expect(issues(valid([typed]))).toContainEqual(["lines.0.pcs", "Pick this item From Reserve or From Stock"]);
  });
});

describe("UT-SL-04 toSaleInput (api-contract SaleInput / LineInput)", () => {
  it("sends the customer, both addresses and per row only the contract line fields", () => {
    const reserve = { ...reserveLineToSaleLine(reserveLine()), pcs: "1", weightCt: "0.68", discountValue: "5", itemNote: "  gift  " };
    const stock = { ...lotToSaleLine(stockItem()), lineId: "saved-line", unitPrice: "950" };
    const input = toSaleInput(valid([reserve, stock]));
    expect(input).toMatchObject({ customerId: ID, shippingAddressId: ID, invoiceAddressId: ID, currency: "THB", docDate: "2026-11-18", dueDate: "2026-11-30" });
    expect(input.lines).toEqual([
      { source: "RESERVE", reserveLineId: RESERVE_LINE, pcs: 1, weightCt: "0.68", unitPrice: "12500.46", discount: { type: "PERCENT", value: "5" }, itemNote: "gift", photoIds: [] },
      { id: "saved-line", source: "STOCK", lotKey: LOT, pcs: 3, weightCt: "2.100", unitPrice: "950", discount: { type: "NONE", value: "0" }, itemNote: "", photoIds: [] },
    ]);
  });
});

describe("UT-SL-05a picker helpers", () => {
  it("From Reserve is blocked until a customer, then a currency, is chosen", () => {
    expect(salePickerBlocked({ customerId: "", currency: "THB" })).toBe("Choose a customer first");
    expect(salePickerBlocked({ customerId: ID, currency: "" })).toBe("Choose a currency first");
    expect(salePickerBlocked({ customerId: ID, currency: "THB" })).toBeNull();
  });

  it("each picker leaves out only its own rows already on the document", () => {
    const lines = [reserveLineToSaleLine(reserveLine()), lotToSaleLine(stockItem({ lotKey: "other" })), ...emptySale().lines];
    expect([...pickedReserveLineIds(lines)]).toEqual([RESERVE_LINE]);
    // The Reserve row's Memo Stock item is not "picked From Stock".
    expect([...pickedStockIds(lines)]).toEqual(["other"]);
    expect(STOCK).toBeTruthy();
  });

  it("row panel note and table caption name the source", () => {
    expect(saleStockNote(reserveLineToSaleLine(reserveLine()))).toBe("Reserved 2 pcs / 1.36 ct · RS-26110001");
    expect(saleStockNote(lotToSaleLine(stockItem()))).toBe("Available 3 pcs / 2.100 ct");
    expect(saleStockNote(emptySale().lines[0]!)).toBeNull();
    expect(saleTableLine(reserveLineToSaleLine(reserveLine())).stockId).toBe("260003 · from RS-26110001");
    // A lot line has no Stock ID: the caption stands alone (Sale shows the Stock ID of reserve / legacy lines, owner Q3).
    expect(saleTableLine(lotToSaleLine(stockItem())).stockId).toBe("from MR-26100012");
    const empty = emptySale().lines[0]!;
    expect(saleTableLine(empty)).toBe(empty);
  });
});

describe("UT-SL-06 customer / currency change clears From Reserve rows only (Q-SL-05)", () => {
  it("empties From Reserve rows, keeps From Stock rows, and does nothing without them", () => {
    const stock = lotToSaleLine(stockItem());
    const lines = [reserveLineToSaleLine(reserveLine()), stock, ...emptySale().lines.slice(2)];
    expect(reserveRowCount(lines)).toBe(1);
    const cleared = clearReserveRows(lines)!;
    expect(cleared).toHaveLength(lines.length);
    expect(cleared[0]).toMatchObject({ saleSource: "", reserveLineId: "", stockId: "", pcs: "" });
    expect(cleared[1]).toBe(stock);
    expect(clearReserveRows([stock])).toBeNull();
  });

  it("asks with the row count and the changed field", () => {
    expect(saleHeaderChangeConfirm(1, "customer")).toEqual({
      title: "Change the customer?",
      body: "This removes the 1 row taken From Reserve. Rows taken From Stock stay.",
      cancelLabel: "Keep customer",
      confirmLabel: "Change customer",
    });
    expect(saleHeaderChangeConfirm(2, "currency").body).toContain("2 rows");
  });
});
