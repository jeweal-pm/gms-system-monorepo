import { describe, expect, it } from "vitest";
import { approveMenuFor, type AvailableMenu } from "@/features/approve-center/menus";
import { DASH, DEFAULT_SORT, detailSubLine, pendingInput, rowsOf, searchQuery, shortDate, stoneSummary, submittedTime, submitterText, toApprovalRow } from "@/features/approve-center/model";
import { listItem, page, RS1, sourceTwoItems } from "./fixtures";

/** UT-AP-04 (FE-AP-004 → FE-AP-009): `approval.pending` row → ApprovalRow, sub line per menu, stones, search + sort input. */
const menu = (slug: string) => approveMenuFor(slug) as AvailableMenu;

describe("UT-AP-04 row adapter (FE-AP-009 enriched rows)", () => {
  it("maps the server row: party name, qty, lines, stones, submitter, version, revisionCount, last review", () => {
    expect(toApprovalRow(listItem())).toEqual({
      id: RS1,
      docNo: "RS2611002",
      docDate: "2026-11-01",
      dueDate: "2026-11-05",
      partyName: "Siam Gems Co., Ltd.",
      lineCount: 2,
      stoneNames: ["Sapphire"],
      moreStoneCount: 0,
      totalPcs: 130,
      totalWeightCt: "19.600",
      grandTotal: "172020.00",
      currency: "USD",
      submittedBy: "Mint",
      submittedAt: "2026-11-01T04:20:00.000Z",
      version: 4,
      revisionCount: 0,
      lastReview: null,
    });
  });

  it("'—' for an empty party name; an empty due date is no date", () => {
    expect(toApprovalRow(listItem({ party: { id: "p", code: "", name: "" } })).partyName).toBe(DASH);
    expect(toApprovalRow(listItem({ dueDate: "" })).dueDate).toBeNull();
  });

  it("keeps server order, drops non-pending items and repeated ids across pages", () => {
    const rows = rowsOf([page(sourceTwoItems()), page([listItem(), listItem({ id: "y", status: "APPROVED" })])]);
    expect(rows.map((row) => row.docNo)).toEqual(["RS2611002", "RS2611003"]);
    expect(rowsOf(undefined)).toEqual([]);
  });

  it("Detail sub line per menu: due label, lines, stones", () => {
    const row = toApprovalRow(listItem());
    expect(detailSubLine(menu("reserve"), row)).toBe("Hold until 05/11/26 · 2 lines · Sapphire");
    expect(detailSubLine(menu("memo-out"), row)).toBe("Due 05/11/26 · 2 lines · Sapphire");
    expect(detailSubLine(menu("quotation"), row)).toBe("Valid until 05/11/26 · 2 lines · Sapphire");
    expect(detailSubLine(menu("memo-return"), row)).toBe("2 lines · Sapphire");
    expect(detailSubLine(menu("reserve"), { ...row, dueDate: null, lineCount: 1, stoneNames: [] })).toBe("1 line");
  });

  it("stone names: the server's ≤ 3 names, then +k", () => {
    expect(stoneSummary(["Ruby", "Sapphire", "Emerald"], 2)).toBe("Ruby, Sapphire, Emerald +2");
    expect(stoneSummary(["Ruby", "Sapphire"], 0)).toBe("Ruby, Sapphire");
  });

  it("dates: dd/mm/yy doc dates; submitted dd/mm/yyyy HH:mm in Asia/Bangkok; submitter name or '—'", () => {
    expect(shortDate("2026-11-01")).toBe("01/11/26");
    expect(shortDate(null)).toBe(DASH);
    expect(submittedTime("2026-11-01T04:20:00.000Z")).toBe("01/11/2026 11:20");
    expect(submitterText({ submittedBy: "Mint" })).toBe("Mint");
    expect(submitterText({ submittedBy: null })).toBe(DASH);
    expect(submitterText({ submittedBy: "  " })).toBe(DASH);
  });

  it("search: trimmed, ≤ 100 characters, omitted when empty; pending input = type, server sort, 50 a page", () => {
    expect(searchQuery("  RS26  ")).toBe("RS26");
    expect(searchQuery("   ")).toBeUndefined();
    expect(searchQuery("a".repeat(120))).toHaveLength(100);
    expect(pendingInput(menu("reserve"), undefined, DEFAULT_SORT)).toEqual({ type: "reserve", sort: "submittedAt", dir: "asc", limit: 50 });
    expect(pendingInput(menu("purchase-order"), "Siam", { key: "detail", dir: "desc" })).toEqual({ type: "purchase-order", sort: "party", dir: "desc", limit: 50, q: "Siam" });
    expect(pendingInput(menu("quotation"), undefined, { key: "document", dir: "asc" }).sort).toBe("docNo");
    expect(pendingInput(menu("quotation"), undefined, { key: "qty", dir: "asc" }).sort).toBe("qty");
    expect(pendingInput(menu("quotation"), undefined, { key: "value", dir: "asc" }).sort).toBe("value");
  });
});
