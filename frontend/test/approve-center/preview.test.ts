import { readFileSync } from "node:fs";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { ApprovalTable } from "@/features/approve-center/components/ApprovalTable";
import { PreviewBody } from "@/features/approve-center/components/DocumentPreviewModal";
import { approveMenuFor, type AvailableMenu } from "@/features/approve-center/menus";
import { DEFAULT_SORT, rowsOf, sortRows } from "@/features/approve-center/model";
import {
  converts,
  currencyText,
  isStillPending,
  lineValue,
  multiplyDecimal,
  previewView,
  stoneCodeText,
  submittedLine,
  sumDecimal,
  waitingText,
} from "@/features/approve-center/preview";
import { numberFormatFor } from "@/features/decimal-setup/number-format-provider";
import { page, RS1, reserveDetail, sourceTwoItems } from "./fixtures";

/** Approve Center UI rev 2 (FE-AP-013…015, owner 2026-11-10): the document preview modal. */
const reserve = approveMenuFor("reserve") as AvailableMenu;
const memoReceive = approveMenuFor("memo-receive") as AvailableMenu;
const format = numberFormatFor({ weightPlaces: 2, pricePlaces: 2 });
const decoded = (html: string) => html.replaceAll("&#x27;", "'").replaceAll("&amp;", "&");

describe("UT-AP-15 the document number opens the preview (Q-AP-19 modal only)", () => {
  it("is a dialog button, not a link; the row error's 'Open' opens it too", () => {
    const noop = () => undefined;
    const html = renderToStaticMarkup(
      createElement(ApprovalTable, {
        menu: reserve,
        rows: sortRows(rowsOf([page(sourceTwoItems())]), DEFAULT_SORT),
        sort: DEFAULT_SORT,
        onSort: noop,
        selected: new Set<string>(),
        onToggleRow: noop,
        onToggleAll: noop,
        busyIds: new Set<string>(),
        locked: false,
        errors: new Map([[RS1, { message: "Short.", link: true }]]),
        onApprove: noop,
        onOpen: noop,
      }),
    );
    expect(html).toMatch(new RegExp(`<button type="button" data-preview-id="${RS1}" aria-haspopup="dialog"[^>]*>RS2611002</button>`));
    expect(html).toMatch(/<button type="button" aria-haspopup="dialog" class="underline[^>]*>Open RS2611002<\/button>/);
    expect(html).not.toContain("href=");
  });
});

describe("UT-AP-16 value in the company currency (Q-AP-17) and the view model", () => {
  it("exact decimal maths, half-up", () => {
    expect(multiplyDecimal("17980.00", "36.2", 2)).toBe("650876.00");
    expect(multiplyDecimal("0.125", "1", 2)).toBe("0.13");
    expect(multiplyDecimal("-0.125", "1", 2)).toBe("-0.13");
    expect(multiplyDecimal("8618.78", "36.20", 2)).toBe("311999.84");
    expect(sumDecimal(["12.400", "7.200"], 3)).toBe("19.600");
    expect(lineValue("100.5", null, 2)).toBe("100.50");
  });

  it("converts only a foreign-currency document with a rate", () => {
    expect(converts({ currency: "USD", exchangeRate: "36.2" }, "THB")).toBe(true);
    expect(converts({ currency: "THB", exchangeRate: null }, "THB")).toBe(false);
    expect(currencyText({ currency: "USD", exchangeRate: "36.2" }, "THB")).toBe("USD · rate 36.2");
    expect(currencyText({ currency: "THB", exchangeRate: null }, "THB")).toBe("THB");
  });

  it("Reserve: customer, 'Ordered by' + the customer under each stone (Q-AP-20), THB values, totals, no grand-total line when equal (Q-AP-21)", () => {
    const view = previewView(reserve, reserveDetail(), "THB", 2);
    expect(view).toMatchObject({ partyLabel: "Customer", partyName: "Siam Gems Co., Ltd.", docDate: "01/11/26", currency: "USD · rate 36.2", valueCurrency: "THB", orderedBy: true, grandTotal: null });
    expect(view.rows.map((row) => [row.index, row.code, row.stone, row.orderedBy, row.value, row.location])).toEqual([
      [1, "SA-RBLDEXVS1AAA", "Sapphire Oval 5.0×7.0", "Siam Gems Co., Ltd.", "650876.00", "BKK-01"],
      [2, "SA-LBUDVGVS2AA", "Sapphire Round 2.5", "Siam Gems Co., Ltd.", "311999.84", "BKK-01"],
    ]);
    expect(view.totals).toEqual({ pcs: 130, weightCt: "19.600", value: "962875.84" });
  });

  it("a grand total that differs from the line sum (discount, tax, charges) gets its own line", () => {
    expect(previewView(reserve, reserveDetail({ totals: { grandTotal: "25000.00" } }), "THB", 2).grandTotal).toBe("905000.00");
  });

  it("Memo Receive: vendor, no 'Ordered by', Stock ID without a stone code, '—' without a location, own currency without a rate", () => {
    const detail = reserveDetail({
      customer: undefined,
      vendor: { name: "Boyaca Emerald Traders S.A.S." },
      currency: "THB",
      exchangeRate: null,
      lines: [{ stoneCode: "", stockId: "260005", stone: "Emerald", shape: "", size: "", pcs: 1, weightCt: "1.000", amount: "1000.00" }],
      totals: { grandTotal: "1000.00" },
      documentNote: "  ",
    });
    const view = previewView(memoReceive, detail, "THB", 2);
    expect(view).toMatchObject({ partyLabel: "Vendor", partyName: "Boyaca Emerald Traders S.A.S.", orderedBy: false, valueCurrency: "THB", currency: "THB", note: "" });
    expect(view.rows[0]).toMatchObject({ code: "260005", stone: "Emerald", orderedBy: null, value: "1000.00", location: "—" });
    expect(stoneCodeText({ stoneCode: null, stockId: null })).toBe("—");
  });
});

describe("UT-AP-17 header line and pending check", () => {
  const row = rowsOf([page(sourceTwoItems())]).find((entry) => entry.id === RS1)!;

  it("waiting text", () => {
    const since = "2026-11-01T04:20:00.000Z";
    expect(waitingText(since, new Date("2026-11-01T04:50:00Z"))).toBe("waiting < 1 h");
    expect(waitingText(since, new Date("2026-11-01T09:20:00Z"))).toBe("waiting 5 h");
    expect(waitingText(since, new Date("2026-11-02T05:00:00Z"))).toBe("waiting 1 day");
    expect(waitingText(since, new Date("2026-11-07T05:00:00Z"))).toBe("waiting 6 days");
  });

  it("phase 1 has no submitter: 'Last saved dd/mm/yy HH:mm · waiting …'; with one: 'Submitted by …'", () => {
    const now = new Date("2026-11-02T05:00:00Z");
    expect(submittedLine(row, now)).toBe("Last saved 01/11/26 11:20 · waiting 1 day");
    expect(submittedLine({ ...row, submittedBy: "Ann", submittedRole: "Purchasing" }, now)).toBe("Submitted by Ann (Purchasing) · 01/11/26 11:20 · waiting 1 day");
  });

  it("an approved or deleted document is no longer pending", () => {
    expect(isStillPending(reserveDetail())).toBe(true);
    expect(isStillPending(reserveDetail({ status: "APPROVED" }))).toBe(false);
    expect(isStillPending(reserveDetail({ deletedAt: "2026-11-03T00:00:00Z" }))).toBe(false);
  });
});

describe("UT-AP-18 modal body and footer", () => {
  it("renders fields, the lines table with 'Ordered by', totals and the note", () => {
    const html = decoded(renderToStaticMarkup(createElement(PreviewBody, { view: previewView(reserve, reserveDetail(), "THB", 2), docNo: "RS2611002", format })));
    expect(html).toContain(">Customer</dt>");
    expect(html).toContain("USD · rate 36.2");
    expect(html).toContain(">Ordered by</span>");
    expect(html).toContain("Value (THB)");
    expect(html).toContain("650,876.00");
    expect(html).toContain("19.60 cts");
    expect(html).toContain("962,875.84");
    expect(html).toContain('<caption class="sr-only">RS2611002 lines</caption>');
    expect(html).toContain("Prices are valid for 30 days.");
    expect(html).not.toContain("Grand total");
  });

  it("a vendor document has no 'Ordered by'; an empty note reads 'No note'", () => {
    const view = previewView(memoReceive, reserveDetail({ customer: undefined, vendor: { name: "V" }, documentNote: "" }), "THB", 2);
    const html = renderToStaticMarkup(createElement(PreviewBody, { view, docNo: "MR-1", format }));
    expect(html).not.toContain("Ordered by");
    expect(html).toContain(">Vendor</dt>");
    expect(html).toContain("No note");
  });

  it("Approve from the modal uses the loaded version (no second get); Reject…/Revise… stay disabled (Q-AP-18)", () => {
    const source = readFileSync("src/features/approve-center/components/ApproveCenterPage.tsx", "utf8");
    const handler = source.slice(source.indexOf("function onPreviewApprove"), source.indexOf("function closePreview"));
    expect(handler).toContain("version: detail.version");
    expect(handler).not.toContain("prepare");
    const modal = readFileSync("src/features/approve-center/components/DocumentPreviewModal.tsx", "utf8");
    expect(modal).toContain('<UnavailableAction label="Reject…" reason={REJECT_UNAVAILABLE} />');
    expect(modal).toContain('<UnavailableAction label="Revise…" reason={REVISE_UNAVAILABLE} />');
    expect(modal).toContain("dialog.showModal()");
  });
});
