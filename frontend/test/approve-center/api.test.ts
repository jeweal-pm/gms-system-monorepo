import { describe, expect, it } from "vitest";
import { approveMenuFor, type AvailableMenu } from "@/features/approve-center/menus";
import { DASH, detailSubLine, pendingListInput, rowsOf, searchQuery, shortDate, stoneSummary, submittedTime, submitterText, toApprovalRow } from "@/features/approve-center/model";
import { listItem, page, sourceTwoItems } from "./fixtures";

/** UT-AP-04 (FE-AP-004): list item → ApprovalRow, "—" for phase-1 gaps, sub line per menu, stone names, search input. */
const menu = (slug: string) => approveMenuFor(slug) as AvailableMenu;

describe("UT-AP-04 row adapter", () => {
  it("maps a customer document and leaves the phase-2 fields empty", () => {
    expect(toApprovalRow(listItem())).toEqual({
      id: listItem().id,
      docNo: "RS2611002",
      docDate: "2026-11-01",
      dueDate: "2026-11-05",
      partyName: "Siam Gems Co., Ltd.",
      grandTotal: "172020.00",
      currency: "USD",
      submittedAt: "2026-11-01T04:20:00.000Z",
      submittedAtIsLastSaved: true,
    });
  });

  it("reads the vendor name for vendor documents and '—' when there is no name", () => {
    expect(toApprovalRow(listItem({ customerName: undefined, vendorName: "Gem Source" })).partyName).toBe("Gem Source");
    expect(toApprovalRow(listItem({ customerName: undefined })).partyName).toBe(DASH);
  });

  it("drops deleted and non-pending items across pages", () => {
    const rows = rowsOf([page(sourceTwoItems()), page([listItem({ id: "x", deletedAt: "2026-11-03T00:00:00Z" }), listItem({ id: "y", status: "APPROVED" })])]);
    expect(rows.map((row) => row.docNo)).toEqual(["RS2611003", "RS2611002"]);
    expect(rowsOf(undefined)).toEqual([]);
  });

  it("Detail sub line per menu with what phase 1 has", () => {
    const row = toApprovalRow(listItem());
    expect(detailSubLine(menu("reserve"), row)).toBe("Hold until 05/11/26");
    expect(detailSubLine(menu("memo-out"), row)).toBe("Due 05/11/26");
    expect(detailSubLine(menu("memo-return"), row)).toBe(DASH);
    expect(detailSubLine(menu("reserve"), { ...row, dueDate: null })).toBe(DASH);
    expect(detailSubLine(menu("reserve"), { ...row, lineCount: 1, stoneNames: ["Ruby"] })).toBe("Hold until 05/11/26 · 1 line · Ruby");
    expect(detailSubLine(menu("purchase"), { ...row, lineCount: 4, stoneNames: [] })).toBe("4 lines");
  });

  it("stone names: distinct, in line order, at most 3, then +k", () => {
    expect(stoneSummary(["Ruby", "Sapphire", "Ruby", "Emerald", "Diamond", "Spinel"])).toBe("Ruby, Sapphire, Emerald +2");
    expect(stoneSummary(["Ruby", "Sapphire"])).toBe("Ruby, Sapphire");
  });

  it("dates: dd/mm/yy doc dates; submitted dd/mm/yyyy HH:mm in Asia/Bangkok; submitter '—' until SA-AP-02", () => {
    expect(shortDate("2026-11-01")).toBe("01/11/26");
    expect(shortDate(null)).toBe(DASH);
    expect(submittedTime("2026-11-01T04:20:00.000Z")).toBe("01/11/2026 11:20");
    const row = toApprovalRow(listItem());
    expect(submitterText(row)).toBe(DASH);
    expect(submitterText({ ...row, submittedBy: "Mint", submittedRole: "Sales" })).toBe("Mint (Sales)");
    expect(submitterText({ ...row, submittedBy: "Mint" })).toBe("Mint");
  });

  it("search: trimmed, ≤ 100 characters, omitted when empty; the list input asks for pending documents, 50 a page", () => {
    expect(searchQuery("  RS26  ")).toBe("RS26");
    expect(searchQuery("   ")).toBeUndefined();
    expect(searchQuery("a".repeat(120))).toHaveLength(100);
    expect(pendingListInput(undefined)).toEqual({ status: "PENDING_APPROVAL", limit: 50 });
    expect(pendingListInput("Siam")).toEqual({ status: "PENDING_APPROVAL", limit: 50, q: "Siam" });
  });
});
