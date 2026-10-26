import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { mapSaveError, savedRowOrder } from "@/features/document-setup/api";
import { filterTransactions, TransactionsDrawer } from "@/features/document-setup/components/transactions-drawer";
import { firstInvalidField } from "@/features/document-setup/document-setup-page";
import { compareRowDates, displayDate, formatDocumentNumber, rowStatuses, todayIso } from "@/features/document-setup/numbering";
import { defaultFormValues, documentSetupFormSchema, newRowValues, toFormValues, toSaveInput, type DocumentSetupFormValues, type DocumentTransaction } from "@/features/document-setup/schema";
import { navigationHref, SETUP_MENU_KEYS } from "@/features/home/navigation";
import { gatewayError } from "../partner/helpers";

/** UT-DS-01…08: Document Setup (document-setup UI rev 1, owner 2026-10-23). */

const transactions: DocumentTransaction[] = [
  { transactionKey: "quotation", label: "Quotation", defaultCode: "QT", configured: false, code: null },
  { transactionKey: "purchase-order", label: "Purchase Order", defaultCode: "PO", configured: true, code: "PO" },
];

const values = (overrides: Partial<DocumentSetupFormValues> = {}): DocumentSetupFormValues => ({
  name: "PURCHASE ORDER",
  code: "po",
  startFrom: "180001",
  rows: [{ key: "a", effectiveDate: "2026-01-01", prefix: "po", separator: "-", startNo: "180001", used: false }],
  declaration: "Thanks  ",
  ...overrides,
});

const issues = (input: DocumentSetupFormValues) => {
  const parsed = documentSetupFormSchema.safeParse(input);
  return parsed.success ? {} : Object.fromEntries(parsed.error.issues.map((issue) => [issue.path.join("."), issue.message]));
};

describe("form schema (form-guidelines.md)", () => {
  it("UT-DS-01 accepts a valid setup and reports each rule with its message", () => {
    expect(issues(values())).toEqual({});
    expect(issues(values({ name: " ", code: "", startFrom: "" }))).toMatchObject({ name: "Name is required", code: "Code is required", startFrom: "Start From is required" });
    expect(issues(values({ name: "x".repeat(121), code: "TOO-LONG-CODE", startFrom: "0" }))).toMatchObject({
      name: "Name must be at most 120 characters", code: "Use up to 10 letters, digits, - or /", startFrom: "Enter a number from 1 to 999,999,999",
    });
    expect(issues(values({ rows: [] }))).toMatchObject({ rows: "Add at least one numbering row" });
    expect(issues(values({
      rows: [
        { key: "a", effectiveDate: "", prefix: "P O", separator: "--x", startNo: "1000000000", used: false },
        { key: "b", effectiveDate: "2026-01-01", prefix: "", separator: "", startNo: "1", used: false },
        { key: "c", effectiveDate: "2026-01-01", prefix: "", separator: "", startNo: "", used: false },
      ],
    }))).toMatchObject({
      "rows.0.effectiveDate": "Date is required",
      "rows.0.prefix": "Use up to 10 letters, digits, - / or .",
      "rows.0.separator": "Use up to 3 of - / . _",
      "rows.0.startNo": "Enter a number from 1 to 999,999,999",
      "rows.2.effectiveDate": "Another row already starts on this date",
      "rows.2.startNo": "Start No is required",
    });
    expect(issues(values({ declaration: "x".repeat(2001) }))).toMatchObject({ declaration: "Declaration must be at most 2,000 characters" });
  });
});

describe("numbering helpers", () => {
  it("UT-DS-02 Example = Prefix + Suffix + number, no padding (Q-DS-04/05)", () => {
    expect(formatDocumentNumber("po", "-", "180001")).toBe("PO-180001");
    expect(formatDocumentNumber("", "", 7)).toBe("7");
    expect(formatDocumentNumber("QT", "/", "12")).toBe("QT/12");
  });

  it("UT-DS-03 the latest date on or before today is In use, later ones Upcoming; rows sort by date", () => {
    expect(rowStatuses(["2027-01-01", "2026-01-01", "2026-06-01", ""], "2026-10-23")).toEqual(["upcoming", "past", "in-use", null]);
    expect(rowStatuses(["2026-10-23"], "2026-10-23")).toEqual(["in-use"]);
    expect(rowStatuses(["2026-10-23", "2026-10-23"], "2026-10-23")).toEqual(["in-use", "past"]);
    const rows = [{ effectiveDate: "2027-01-01" }, { effectiveDate: "" }, { effectiveDate: "2026-01-01" }];
    expect([...rows].sort(compareRowDates).map((row) => row.effectiveDate)).toEqual(["2026-01-01", "2027-01-01", ""]);
    expect(displayDate("2026-10-23")).toBe("23/10/2026");
    expect(todayIso(new Date(2026, 9, 23, 23, 30))).toBe("2026-10-23");
  });
});

describe("defaults and mapping", () => {
  it("UT-DS-04 a never-set-up transaction gets Name = label uppercase, its code and one row today", () => {
    const form = defaultFormValues(transactions[0], "2026-10-23");
    expect(form).toMatchObject({ name: "QUOTATION", code: "QT", startFrom: "1", declaration: "" });
    expect(form.rows).toEqual([expect.objectContaining({ effectiveDate: "2026-10-23", prefix: "QT", separator: "-", startNo: "1", used: false })]);
  });

  it("UT-DS-05 a new row copies the last row's Prefix/Suffix and starts at Start From", () => {
    expect(newRowValues(values({ startFrom: "500" }), "2026-12-01")).toMatchObject({ effectiveDate: "2026-12-01", prefix: "po", separator: "-", startNo: "500" });
    expect(newRowValues(values({ rows: [], code: "rs" }), "2026-12-01")).toMatchObject({ prefix: "RS", separator: "-", startNo: "180001" });
  });

  it("UT-DS-06 save input is trimmed, uppercased, numeric and date-sorted; detail round-trips to the form", () => {
    const input = toSaveInput("purchase-order", values({
      rows: [
        { key: "b", effectiveDate: "2027-01-01", prefix: "po ", separator: "/", startNo: "1", used: false },
        { key: "a", effectiveDate: "2026-01-01", prefix: "po", separator: "-", startNo: "180001", used: false },
      ],
    }), 3);
    expect(input).toEqual({
      transactionKey: "purchase-order", name: "PURCHASE ORDER", code: "PO", startFrom: 180001, declaration: "Thanks", expectedVersion: 3,
      rows: [
        { effectiveDate: "2026-01-01", prefix: "PO", separator: "-", startNo: 180001 },
        { effectiveDate: "2027-01-01", prefix: "PO", separator: "/", startNo: 1 },
      ],
    });
    const form = toFormValues({ transactionKey: "purchase-order", name: "PO", code: "PO", startFrom: 1, declaration: "", version: 2, updatedAt: "2026-10-23T00:00:00.000Z", rows: [{ id: "r", effectiveDate: "2026-01-01", prefix: "PO", separator: "-", startNo: 9, used: true }] });
    expect(form.rows).toEqual([expect.objectContaining({ effectiveDate: "2026-01-01", startNo: "9", used: true })]);
  });
});

describe("errors", () => {
  const trpcError = (domainCode: string, fieldErrors?: { path: string; code: string }[]) => gatewayError({ domainCode, fieldErrors });

  it("UT-DS-07 maps code taken, changed, validation rows (server order → form rows), permission and unknown errors", () => {
    expect(mapSaveError(trpcError("DOCUMENT_SETUP_CODE_TAKEN"))).toEqual({ fieldErrors: [{ name: "code", message: "This code is already used" }], formError: null });
    expect(mapSaveError(trpcError("DOCUMENT_SETUP_CHANGED"))).toMatchObject({ stale: true, formError: expect.stringContaining("Reload") });
    // SA-QT-05: rows that issued quotation numbers are locked.
    expect(mapSaveError(trpcError("DOCUMENT_SETUP_ROW_IN_USE"))).toMatchObject({ stale: true, formError: expect.stringContaining("can't be changed or removed") });
    const order = savedRowOrder({ rows: [{ effectiveDate: "2027-01-01" }, { effectiveDate: "2026-01-01" }] as DocumentSetupFormValues["rows"] });
    expect(order).toEqual([1, 0]);
    expect(mapSaveError(trpcError("VALIDATION_ERROR", [{ path: "rows.0.effectiveDate", code: "duplicate" }, { path: "name", code: "too_big" }]), order).fieldErrors).toEqual([
      { name: "rows.1.effectiveDate", message: "Another row already starts on this date" },
      { name: "name", message: "Check this field" },
    ]);
    expect(mapSaveError(trpcError("PERMISSION_DENIED"))).toMatchObject({ recheckAccess: true });
    expect(mapSaveError(new Error("network")).formError).toBe("Couldn't save. Try again.");
  });

  it("UT-DS-07b focuses the first invalid field in visual order, including row cells", () => {
    expect(firstInvalidField({ declaration: { type: "x" }, code: { type: "x" } } as never)).toBe("code");
    expect(firstInvalidField({ rows: [undefined, { startNo: { type: "x" } }] } as never)).toBe("rows.1.startNo");
    expect(firstInvalidField({})).toBeNull();
  });
});

describe("drawer and navigation", () => {
  it("UT-DS-08 drawer lists transactions with code or Not set up; search filters by name or code; Setup links the real page", () => {
    expect(filterTransactions(transactions, "po").map((item) => item.transactionKey)).toEqual(["purchase-order"]);
    expect(filterTransactions(transactions, "QT").map((item) => item.transactionKey)).toEqual(["quotation"]);
    expect(filterTransactions(transactions, " ")).toHaveLength(2);
    const html = renderToStaticMarkup(createElement(TransactionsDrawer, { open: true, items: transactions, status: "success", onRetry: vi.fn(), selectedKey: "purchase-order", onSelect: vi.fn(), onClose: vi.fn() }));
    expect(html).toContain("Transactions");
    expect(html).toContain("Not set up");
    expect(html).toMatch(/aria-current="true"[^>]*>[\s\S]*Purchase Order/);
    expect(navigationHref({ label: "Document Setup", slug: "document-setup" })).toBe("/setup/document-setup");
    expect(SETUP_MENU_KEYS).toContain("document-setup");
  });
});
