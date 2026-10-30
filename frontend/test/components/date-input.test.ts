import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { DateInput, formatDateText, maskDateText, monthGrid, parseDateText } from "@/components/ui/date-input";

/** UT-DATE-01…04: English dd/mm/yyyy date field (owner 2026-10-28: no Thai "วว/ดด/ปปปป" placeholder). */

describe("DateInput", () => {
  it("UT-DATE-01 renders an English dd/mm/yyyy text field, not the browser date control", () => {
    const html = renderToStaticMarkup(createElement(DateInput, { value: "2026-10-28", onChange: () => {}, "aria-label": "Doc Date" }));
    expect(html).toContain('type="text"');
    expect(html).not.toContain('type="date"');
    expect(html).toContain('placeholder="dd/mm/yyyy"');
    expect(html).toContain('value="28/10/2026"');
    expect(html).toContain('aria-label="Open calendar"');
    expect(renderToStaticMarkup(createElement(DateInput, { value: "", onChange: () => {} }))).toContain('value=""');
  });

  it("UT-DATE-02 converts between ISO and dd/mm/yyyy, rejecting impossible dates", () => {
    expect(formatDateText("2026-10-28")).toBe("28/10/2026");
    expect(formatDateText("")).toBe("");
    expect(parseDateText("28/10/2026")).toBe("2026-10-28");
    expect(parseDateText("29/02/2028")).toBe("2028-02-29");
    for (const bad of ["29/02/2026", "31/04/2026", "00/10/2026", "28/13/2026", "28/10/26", "28/10"]) expect(parseDateText(bad)).toBeNull();
  });

  it("UT-DATE-03 masks typing into dd/mm/yyyy", () => {
    expect(maskDateText("2")).toBe("2");
    expect(maskDateText("2810")).toBe("28/10");
    expect(maskDateText("28102026")).toBe("28/10/2026");
    expect(maskDateText("28/10/2026999")).toBe("28/10/2026");
    expect(maskDateText("ab28x")).toBe("28");
  });

  it("UT-DATE-04 month grid: six Sunday-first weeks", () => {
    const october = monthGrid(2026, 9);
    expect(october).toHaveLength(42);
    expect(october[0]).toEqual({ iso: "2026-09-27", day: 27, inMonth: false });
    expect(october.find((cell) => cell.iso === "2026-10-01")).toEqual({ iso: "2026-10-01", day: 1, inMonth: true });
    expect(october.filter((cell) => cell.inMonth)).toHaveLength(31);
  });
});

describe("Due Date not before Doc Date (owner 2026-10-29)", () => {
  it("UT-DATE-06 isBeforeDate compares complete ISO dates only", async () => {
    const { isBeforeDate } = await import("@/components/ui/date-input");
    expect(isBeforeDate("2026-10-14", "2026-10-29")).toBe(true);
    expect(isBeforeDate("2026-10-29", "2026-10-29")).toBe(false);
    expect(isBeforeDate("2026-11-01", "2026-10-29")).toBe(false);
    expect(isBeforeDate("", "2026-10-29")).toBe(false);
    expect(isBeforeDate("2026-10-14", "")).toBe(false);
    expect(isBeforeDate("2026-10-14", undefined)).toBe(false);
  });

  it("UT-DATE-07 every transaction schema refuses a Due Date before the Doc Date with the shared message", async () => {
    const { DUE_BEFORE_DOC_MESSAGE, quotationSchema } = await import("@/features/quotation/schema");
    const { emptyQuotation } = await import("@/features/quotation/lib/defaults");
    const { memoReturnSchema, emptyMemoReturn } = await import("@/features/memo-return/api");
    const { memoReceiveSchema } = await import("@/features/memo-receive/schema");
    const { emptyMemoReceive } = await import("@/features/memo-receive/defaults");
    const dueIssue = (result: { error?: { issues: { path: PropertyKey[]; message: string }[] } }) => result.error?.issues.find((issue) => issue.path.join(".") === "dueDate")?.message;
    const dates = { docDate: "2026-10-29", dueDate: "2026-10-14" };
    expect(dueIssue(quotationSchema.safeParse({ ...emptyQuotation(), ...dates }))).toBe(DUE_BEFORE_DOC_MESSAGE);
    expect(dueIssue(memoReturnSchema.safeParse({ ...emptyMemoReturn(), ...dates }))).toBe(DUE_BEFORE_DOC_MESSAGE);
    expect(dueIssue(memoReceiveSchema.safeParse({ ...emptyMemoReceive(), ...dates }))).toBe(DUE_BEFORE_DOC_MESSAGE);
    expect(dueIssue(quotationSchema.safeParse({ ...emptyQuotation(), docDate: "2026-10-29", dueDate: "2026-10-29" }))).toBeUndefined();
  });
});
