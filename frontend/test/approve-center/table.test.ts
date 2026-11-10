import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { ApprovalTable, UnavailableAction } from "@/features/approve-center/components/ApprovalTable";
import { approveMenuFor, type AvailableMenu } from "@/features/approve-center/menus";
import {
  ariaSort,
  DEFAULT_SORT,
  headerCheckState,
  nextSort,
  pruneSelection,
  REJECT_UNAVAILABLE,
  REVISE_UNAVAILABLE,
  rowsOf,
  selectedInOrder,
  selectionScope,
  sortRows,
  toggleAll,
  toggleOne,
  type ApprovalRow,
} from "@/features/approve-center/model";
import { page, RS1, RS2, sourceTwoItems } from "./fixtures";

/** UT-AP-05 (FE-AP-004/006) table, sort and selection; UT-AP-09 (FE-AP-007) Reject / Revise disabled. */
const reserve = approveMenuFor("reserve") as AvailableMenu;
const rows = () => rowsOf([page(sourceTwoItems())]);
const decoded = (html: string) => html.replaceAll("&#x27;", "'").replaceAll("&amp;", "&");

function render(patch: Partial<Parameters<typeof ApprovalTable>[0]> = {}) {
  const noop = () => undefined;
  return decoded(
    renderToStaticMarkup(
      createElement(ApprovalTable, {
        menu: reserve,
        rows: sortRows(rows(), DEFAULT_SORT),
        sort: DEFAULT_SORT,
        onSort: noop,
        selected: new Set<string>(),
        onToggleRow: noop,
        onToggleAll: noop,
        busyIds: new Set<string>(),
        locked: false,
        errors: new Map(),
        onApprove: noop,
        ...patch,
      }),
    ),
  );
}

describe("UT-AP-05 sort", () => {
  it("defaults to oldest submitted first (Q-AP-11)", () => {
    expect(sortRows(rows(), DEFAULT_SORT).map((row) => row.docNo)).toEqual(["RS2611002", "RS2611003"]);
    expect(sortRows(rows(), { key: "submitted", dir: "desc" }).map((row) => row.docNo)).toEqual(["RS2611003", "RS2611002"]);
  });

  it("sorts by document, detail and value; missing values (Qty in phase 1) keep doc no. order", () => {
    expect(sortRows(rows(), { key: "document", dir: "desc" }).map((row) => row.docNo)).toEqual(["RS2611003", "RS2611002"]);
    expect(sortRows(rows(), { key: "detail", dir: "asc" }).map((row) => row.partyName)).toEqual(["Bangkok Jewel House", "Siam Gems Co., Ltd."]);
    expect(sortRows(rows(), { key: "value", dir: "asc" }).map((row) => row.grandTotal)).toEqual(["8450.50", "172020.00"]);
    const mixed: ApprovalRow[] = [{ ...rows()[0], currency: "USD", grandTotal: "1" }, { ...rows()[1], currency: "THB", grandTotal: "9" }];
    expect(sortRows(mixed, { key: "value", dir: "asc" }).map((row) => row.currency)).toEqual(["THB", "USD"]);
    expect(sortRows(rows(), { key: "qty", dir: "desc" }).map((row) => row.docNo)).toEqual(["RS2611002", "RS2611003"]);
  });

  it("header clicks flip the same column and start a new one ascending; aria-sort follows", () => {
    expect(nextSort(DEFAULT_SORT, "submitted")).toEqual({ key: "submitted", dir: "desc" });
    expect(nextSort(DEFAULT_SORT, "value")).toEqual({ key: "value", dir: "asc" });
    expect(ariaSort(DEFAULT_SORT, "submitted")).toBe("ascending");
    expect(ariaSort(DEFAULT_SORT, "value")).toBe("none");
  });
});

describe("UT-AP-05 selection", () => {
  it("header checkbox: unchecked, indeterminate, checked; toggles all loaded rows", () => {
    const list = rows();
    expect(headerCheckState(list, new Set())).toBe("unchecked");
    expect(headerCheckState(list, new Set([RS1]))).toBe("indeterminate");
    expect(headerCheckState(list, new Set([RS1, RS2]))).toBe("checked");
    expect([...toggleAll(list, new Set([RS1]))].sort()).toEqual([RS1, RS2].sort());
    expect(toggleAll(list, new Set([RS1, RS2])).size).toBe(0);
    expect([...toggleOne(new Set([RS1]), RS1)]).toEqual([]);
  });

  it("keeps only listed rows, in table order, and is scoped to search + sort", () => {
    const sorted = sortRows(rows(), DEFAULT_SORT);
    expect([...pruneSelection(new Set([RS1, "gone"]), sorted)]).toEqual([RS1]);
    expect(selectedInOrder(sorted, new Set([RS2, RS1])).map((row) => row.docNo)).toEqual(["RS2611002", "RS2611003"]);
    expect(selectionScope(undefined, DEFAULT_SORT)).not.toBe(selectionScope("RS", DEFAULT_SORT));
    expect(selectionScope(undefined, DEFAULT_SORT)).not.toBe(selectionScope(undefined, { key: "submitted", dir: "desc" }));
  });
});

describe("UT-AP-05 table markup (source 02)", () => {
  it("renders the column set, sortable headers with aria-sort, and no sort on Status / Action", () => {
    const html = render();
    for (const label of ["Document", "Detail", "Qty", "Value", "Submitted"]) expect(html).toContain(`>${label}<`);
    expect(html).toContain('aria-sort="ascending"');
    expect(html.match(/<th[^>]*aria-sort=/g)).toHaveLength(5);
    expect(html).toMatch(/<th scope="col"[^>]*>#<\/th>/);
    expect(html).toMatch(/<th scope="col"[^>]*>Status<\/th>/);
    expect(html).toMatch(/<th scope="col"[^>]*>Action<\/th>/);
  });

  it("renders the design cells: doc link + date, party + sub line, value with currency, last-saved time, Pending, '—' for Qty and submitter", () => {
    const html = render();
    expect(html).toContain('href="/pre-sale/reserve/11111111-1111-4111-8111-111111111111"');
    expect(html).toContain("01/11/26");
    expect(html).toContain("Siam Gems Co., Ltd.");
    expect(html).toContain("Hold until 05/11/26");
    expect(html).toContain("172,020.00 USD");
    expect(html).toContain('title="Last saved"');
    expect(html).toContain("01/11/2026 11:20");
    expect(html.match(/>Pending</g)).toHaveLength(2);
    expect(html.match(/—/g)?.length).toBeGreaterThanOrEqual(6);
    expect(html.indexOf("RS2611002")).toBeLessThan(html.indexOf("RS2611003"));
  });

  it("checkbox labels, checked rows", () => {
    const html = render({ selected: new Set([RS2]) });
    expect(html).toContain('aria-label="Select all"');
    expect(html).toContain('aria-label="Select RS2611002"');
    expect(html.match(/type="checkbox"[^>]*checked=""/g)).toHaveLength(1);
  });

  it("a busy row's Approve is disabled; a lock disables every Approve; a row error is linked and may offer the document", () => {
    const busy = render({ busyIds: new Set([RS1]) });
    expect(busy.match(/<button[^>]*data-approve-index[^>]*disabled=""/g)).toHaveLength(1);
    expect(busy).toContain('aria-busy="true"');
    expect(render({ locked: true }).match(/<button[^>]*data-approve-index[^>]*disabled=""/g)).toHaveLength(2);
    const failed = render({ errors: new Map([[RS1, { message: "Some stock items no longer have enough pending. Open the document to fix it.", link: true }]]) });
    expect(failed).toContain(`aria-describedby="approve-error-${RS1}"`);
    expect(failed).toContain(`id="approve-error-${RS1}"`);
    expect(failed).toContain("Open RS2611002");
  });
});

describe("UT-AP-09 Reject… / Revise… disabled", () => {
  it("both render on every row as aria-disabled buttons with an info icon and a tooltip", () => {
    const html = render();
    expect(html.match(/aria-disabled="true"[^>]*>Reject…</g)).toHaveLength(2);
    expect(html.match(/aria-disabled="true"[^>]*>Revise…</g)).toHaveLength(2);
    expect(html.match(new RegExp(`role="tooltip"[^>]*>${REJECT_UNAVAILABLE}<`, "g"))).toHaveLength(2);
    expect(html.match(new RegExp(`role="tooltip"[^>]*>${REVISE_UNAVAILABLE}<`, "g"))).toHaveLength(2);
    expect(REJECT_UNAVAILABLE).toMatch(/coming soon/i);
  });

  it("stays focusable (no disabled attribute) and is described by its tooltip", () => {
    const html = decoded(renderToStaticMarkup(createElement(UnavailableAction, { label: "Reject…", reason: REJECT_UNAVAILABLE })));
    const button = /<button[^>]*>/.exec(html)?.[0] ?? "";
    expect(button).not.toContain('disabled=""');
    expect(button).toContain('aria-describedby="');
    expect(html).toContain("group-focus-within:block");
  });
});

describe("UT-AP-14 header colour (owner 2026-11-09)", () => {
  it("every header cell, Action included, uses the gray header background and nothing overrides it", async () => {
    const { TableHead } = await import("@/features/approve-center/components/ApprovalTable");
    const markup = renderToStaticMarkup(createElement("table", null, createElement(TableHead)));
    const headers = markup.match(/<th [^>]*>/g) ?? [];
    expect(headers).toHaveLength(9);
    for (const header of headers) {
      expect(header).toContain("bg-gms-page");
      expect(header).not.toContain("bg-inherit");
    }
    expect(headers[8]).toContain("sticky right-0");
  });
});
