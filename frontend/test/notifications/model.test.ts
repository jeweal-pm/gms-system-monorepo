import { describe, expect, it } from "vitest";
import {
  bellLabel,
  bodyText,
  countBadge,
  dayLabel,
  documentHref,
  groupByDay,
  groupDigits,
  listHref,
  openHref,
  reasonText,
  timeLabel,
  titleParts,
  typeLabel,
} from "@/features/notifications/model";

/** UT-NT-FE-01…05 (notifications UI rev 1): titles, badges, links and day grouping. */
const now = new Date(2026, 10, 11, 14, 0);
const at = (day: number, hour = 9, minute = 42) => new Date(2026, 10, day, hour, minute);

describe("notification view model", () => {
  it("UT-NT-FE-01 titles, type badge and body follow the ui-spec table", () => {
    expect(titleParts({ type: "approval.pending", docNo: "RS2611002" })).toEqual({ docNo: "RS2611002", action: "waits for your approval" });
    expect(titleParts({ type: "document.approved", docNo: "PU1" }).action).toBe("was approved");
    expect(titleParts({ type: "document.rejected", docNo: "PU1" }).action).toBe("was rejected");
    expect(titleParts({ type: "document.revision_requested", docNo: "PU1" }).action).toBe("was sent back for revision");
    expect(typeLabel("reserve")).toBe("Reserve");
    expect(typeLabel("purchase-order")).toBe("Purchase Order (PO)");
    expect(groupDigits("172020.00")).toBe("172,020.00");
    expect(groupDigits("-1234567")).toBe("-1,234,567");
    expect(groupDigits("abc")).toBe("abc");
    expect(bodyText({ summary: { partyName: "Siam Gems Trading Co., Ltd.", amount: "172020.00", currency: "THB" } })).toBe("Siam Gems Trading Co., Ltd. · 172,020.00 THB");
    // BE-NT-007: the reason is not part of the body; it has its own labelled line.
    expect(bodyText({ summary: { partyName: "Siam Gems", reason: "Price too high" } })).toBe("Siam Gems");
    expect(reasonText({ type: "document.rejected", summary: { reason: " Price too high " } })).toBe("Reason: Price too high");
    expect(reasonText({ type: "document.revision_requested", summary: { reason: "Only 1 pcs" } })).toBe("Note: Only 1 pcs");
    expect(reasonText({ type: "document.approved", summary: { reason: "x" } })).toBeNull();
    expect(reasonText({ type: "document.rejected", summary: { reason: "  " } })).toBeNull();
    expect(reasonText({ type: "document.rejected", summary: {} })).toBeNull();
    expect(typeLabel("quotation")).toBe("Quotation");
    expect(documentHref({ documentType: "quotation", documentId: "q-1" })).toBe("/pre-sale/quotation/q-1");
    // Owner 2026-11-12: a pending approval opens Approve › {type}; the other events open the document.
    expect(openHref({ type: "approval.pending", documentType: "memo-receive", documentId: "m-1" })).toBe("/approve/memo-receive");
    expect(openHref({ type: "approval.pending", documentType: "quotation", documentId: "q-1" })).toBe("/approve/quotation");
    expect(openHref({ type: "document.approved", documentType: "memo-receive", documentId: "m-1" })).toBe("/memo/memo-receive/m-1");
    expect(openHref({ type: "approval.pending", documentType: "unknown", documentId: "x" })).toBeNull();
    expect(bodyText({ summary: {} })).toBe("");
  });

  it("UT-NT-FE-02 the row opens the document; the chevron opens Approve › type for a pending one, else the list", () => {
    expect(documentHref({ documentType: "reserve", documentId: "abc" })).toBe("/pre-sale/reserve/abc");
    expect(documentHref({ documentType: "memo-out-return", documentId: "x" })).toBe("/memo/memo-out-return/x");
    expect(listHref({ documentType: "reserve", type: "approval.pending" })).toBe("/approve/reserve");
    expect(listHref({ documentType: "purchase", type: "document.approved" })).toBe("/purchase-order/purchase");
    expect(documentHref({ documentType: "unknown", documentId: "x" })).toBeNull();
    expect(listHref({ documentType: "load-to-stock", type: "approval.pending" })).toBeNull();
  });

  it("UT-NT-FE-03 the For me badge hides at 0 and caps at 99+; the bell names the unread count", () => {
    expect(countBadge(undefined)).toBeNull();
    expect(countBadge(0)).toBeNull();
    expect(countBadge(6)).toBe("6");
    expect(countBadge(100)).toBe("99+");
    expect(bellLabel(0)).toBe("Notifications");
    expect(bellLabel(6)).toBe("Notifications, 6 unread");
  });

  it("UT-NT-FE-04 day and time labels: Today / Yesterday / dates", () => {
    expect(dayLabel(at(11), now)).toBe("Today");
    expect(dayLabel(at(10, 23, 59), now)).toBe("Yesterday");
    expect(dayLabel(at(2), now)).toBe("02 Nov 2026");
    expect(timeLabel(at(11), now)).toBe("Today at 9:42 AM");
    expect(timeLabel(at(10, 15, 5), now)).toBe("Yesterday at 3:05 PM");
    expect(timeLabel(at(2), now)).toBe("02 Nov at 9:42 AM");
  });

  it("UT-NT-FE-05 items group by day, newest first, and an id repeated across pages shows once", () => {
    const items = [
      { id: "a", createdAt: at(11, 10).toISOString() },
      { id: "b", createdAt: at(11, 9).toISOString() },
      { id: "b", createdAt: at(11, 9).toISOString() },
      { id: "c", createdAt: at(10).toISOString() },
      { id: "d", createdAt: at(2).toISOString() },
    ];
    expect(groupByDay(items, now).map((group) => [group.label, group.items.map((item) => item.id)])).toEqual([
      ["Today", ["a", "b"]],
      ["Yesterday", ["c"]],
      ["02 Nov 2026", ["d"]],
    ]);
  });
});
