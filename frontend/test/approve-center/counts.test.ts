import { getQueryKey } from "@trpc/react-query";
import { describe, expect, it } from "vitest";
import { listQueryKey } from "@/features/approve-center/api";
import { APPROVE_MENUS, approveMenuFor } from "@/features/approve-center/menus";
import { approvalTotal, capCount, COUNT_INPUT, landingMenu, menuBadge, pendingListInput, type CountState } from "@/features/approve-center/model";
import { masterTrpc } from "@/lib/master-trpc";

/** UT-AP-03 (FE-AP-003, Q-AP-04/05/06/07): badges, the sidebar total and the landing menu. */
const reserve = approveMenuFor("reserve")!;
const ok = (total: number): CountState => ({ status: "success", total });

describe("UT-AP-03 counts", () => {
  it("panel badge: count, 99+, none at 0 / loading / error, off for Quotation, none for not-available menus", () => {
    expect(menuBadge(reserve, ok(2))).toEqual({ kind: "count", text: "2" });
    expect(menuBadge(reserve, ok(150))).toEqual({ kind: "count", text: "99+" });
    expect(menuBadge(reserve, ok(0))).toEqual({ kind: "none" });
    expect(menuBadge(reserve, { status: "pending" })).toEqual({ kind: "none" });
    expect(menuBadge(reserve, { status: "error" })).toEqual({ kind: "none" });
    expect(menuBadge(reserve, undefined)).toEqual({ kind: "none" });
    expect(menuBadge(approveMenuFor("quotation")!, ok(3))).toEqual({ kind: "off" });
    expect(menuBadge(approveMenuFor("load-to-stock")!, ok(1))).toEqual({ kind: "none" });
    expect(capCount(99)).toBe("99");
    expect(capCount(100)).toBe("99+");
  });

  it("sidebar total = sum of the counts once all settle; failed counts add nothing; hidden at 0", () => {
    expect(approvalTotal([ok(2), ok(1), ok(0)])).toBe(3);
    expect(approvalTotal([ok(2), { status: "error" }])).toBe(2);
    expect(approvalTotal([ok(2), { status: "pending" }])).toBeNull();
    expect(approvalTotal([ok(0)])).toBeNull();
    expect(approvalTotal([])).toBeNull();
  });

  it("landing: first visible menu with pending documents, else the first visible menu, else none", () => {
    const counts: Record<string, CountState> = { reserve: ok(0), purchase: ok(4), "memo-out": ok(1) };
    expect(landingMenu(APPROVE_MENUS, (menu) => counts[menu.slug])?.slug).toBe("memo-out");
    expect(landingMenu(APPROVE_MENUS, () => ok(0))?.slug).toBe("quotation");
    expect(landingMenu([], () => undefined)).toBeNull();
  });

  it("count and list queries use the tRPC keys, so document pages and Approve share invalidation", () => {
    expect(COUNT_INPUT).toEqual({ status: "PENDING_APPROVAL", limit: 1 });
    expect(listQueryKey("reserve", COUNT_INPUT, "query")).toEqual(getQueryKey(masterTrpc.reserve.list, COUNT_INPUT, "query"));
    const input = pendingListInput("RS26");
    expect(listQueryKey("purchaseOrder", input, "infinite")).toEqual(getQueryKey(masterTrpc.purchaseOrder.list, input, "infinite"));
  });
});
