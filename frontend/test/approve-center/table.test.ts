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
  RESUBMITTED_TEXT,
  REVISE_LIMIT_REASON,
  rowsOf,
  selectedInOrder,
  selectionScope,
  toggleAll,
  toggleOne,
} from "@/features/approve-center/model";
import { page, RS1, RS2, sourceTwoItems } from "./fixtures";

/** UT-AP-05 (FE-AP-004/006/009) table, sort and selection; UT-AP-09 (FE-AP-010 / FE-AS-013) Reject / Revise actions. */
const reserve = approveMenuFor("reserve") as AvailableMenu;
const rows = () => rowsOf([page(sourceTwoItems())]);
const decoded = (html: string) => html.replaceAll("&#x27;", "'").replaceAll("&amp;", "&");

function render(patch: Partial<Parameters<typeof ApprovalTable>[0]> = {}) {
  const noop = () => undefined;
  return decoded(
    renderToStaticMarkup(
      createElement(ApprovalTable, {
        menu: reserve,
        rows: rows(),
        sort: DEFAULT_SORT,
        onSort: noop,
        selected: new Set<string>(),
        onToggleRow: noop,
        onToggleAll: noop,
        busyIds: new Set<string>(),
        locked: false,
        errors: new Map(),
        onApprove: noop,
        onReject: noop,
        onRevise: noop,
        onOpen: noop,
        ...patch,
      }),
    ),
  );
}

describe("UT-AP-05 sort", () => {
  it("defaults to oldest submitted first (Q-AP-11); the table keeps the server's order (FE-AP-009)", () => {
    expect(DEFAULT_SORT).toEqual({ key: "submitted", dir: "asc" });
    const reversed = [...rows()].reverse();
    const html = render({ rows: reversed });
    expect(html.indexOf("RS2611003")).toBeLessThan(html.indexOf("RS2611002"));
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
    const sorted = rows();
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

  it("renders the enriched cells (FE-AP-009): doc number + date, party + due / lines / stones, pcs + cts, value, submitter + time, Pending", () => {
    const html = render();
    expect(html).toContain(`data-preview-id="${RS1}"`);
    expect(html).not.toContain("href=");
    expect(html).toContain("01/11/26");
    expect(html).toContain("Siam Gems Co., Ltd.");
    expect(html).toContain("Hold until 05/11/26 · 2 lines · Sapphire");
    expect(html).toContain("130 pcs");
    expect(html).toContain("19.60 cts");
    expect(html).toContain("172,020.00 USD");
    expect(html).toContain(">Mint<");
    expect(html).toContain("01/11/2026 11:20");
    expect(html).not.toContain("Last saved");
    expect(html.match(/>Pending</g)).toHaveLength(2);
    // RS2611003 has no submitter name and was sent again after a Revise.
    expect(html).toContain(">—<");
    expect(html.match(new RegExp(RESUBMITTED_TEXT, "g"))).toHaveLength(1);
    expect(html.indexOf("RS2611002")).toBeLessThan(html.indexOf("RS2611003"));
  });

  it("checkbox labels, checked rows", () => {
    const html = render({ selected: new Set([RS2]) });
    expect(html).toContain('aria-label="Select all"');
    expect(html).toContain('aria-label="Select RS2611002"');
    expect(html.match(/type="checkbox"[^>]*checked=""/g)).toHaveLength(1);
  });

  it("a busy row's actions are disabled; a lock disables every action; a row error is linked and may offer the document", () => {
    const busy = render({ busyIds: new Set([RS1]) });
    expect(busy.match(/<button[^>]*data-approve-index[^>]*disabled=""/g)).toHaveLength(1);
    expect(busy.match(/<button[^>]*aria-label="Reject RS2611002…"[^>]*disabled=""/g)).toHaveLength(1);
    expect(busy.match(/<button[^>]*aria-label="Reject RS2611003…"[^>]*disabled=""/g)).toBeNull();
    expect(busy).toContain('aria-busy="true"');
    expect(render({ locked: true }).match(/<button[^>]*data-approve-index[^>]*disabled=""/g)).toHaveLength(2);
    const failed = render({ errors: new Map([[RS1, { message: "Some stock items no longer have enough pending. Open the document to fix it.", link: true }]]) });
    expect(failed).toContain(`aria-describedby="approve-error-${RS1}"`);
    expect(failed).toContain(`id="approve-error-${RS1}"`);
    expect(failed).toContain("Open RS2611002");
  });
});

describe("UT-AP-09 Reject… / Revise… (FE-AP-010, FE-AS-013)", () => {
  it("Reject… is enabled on every row; Revise… is enabled until the document was sent back once, then disabled with the info tooltip", () => {
    const html = render();
    expect(html.match(/<button type="button" aria-haspopup="dialog" aria-label="Reject RS26110\d\d…"[^>]*>Reject…</g)).toHaveLength(2);
    expect(html).toMatch(/<button type="button" aria-haspopup="dialog" aria-label="Revise RS2611002…"[^>]*>Revise…</);
    expect(html).not.toContain('aria-label="Revise RS2611003…"');
    expect(html.match(/aria-disabled="true"[^>]*>Revise…</g)).toHaveLength(1);
    expect(html.match(new RegExp(`role="tooltip"[^>]*>${REVISE_LIMIT_REASON}<`, "g"))).toHaveLength(1);
    expect(html).not.toContain("coming soon");
  });

  it("the disabled Revise stays focusable (no disabled attribute) and is described by its tooltip", () => {
    const html = decoded(renderToStaticMarkup(createElement(UnavailableAction, { label: "Revise…", reason: REVISE_LIMIT_REASON })));
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
