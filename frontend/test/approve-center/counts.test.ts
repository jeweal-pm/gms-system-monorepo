import { getQueryKey } from "@trpc/react-query";
import { describe, expect, it } from "vitest";
import { pendingQueryKey, summaryQueryKey } from "@/features/approve-center/api";
import { APPROVE_MENUS, approveMenuFor, type AvailableMenu } from "@/features/approve-center/menus";
import { approvalTotal, capCount, DEFAULT_SORT, landingMenu, menuBadge, pendingInput, summaryCount, type CountState } from "@/features/approve-center/model";
import { masterTrpc } from "@/lib/master-trpc";
import { summary } from "./fixtures";

/** UT-AP-03 (FE-AP-003 -> FE-AP-009 / FE-AS-009, Q-AP-04/05/07): badges, the sidebar total and the landing menu. */
const reserve = approveMenuFor("reserve")!;
const ok = (total: number): CountState => ({ status: "success", total });

describe("UT-AP-03 counts", () => {
  it("panel badge: count, 99+, none at 0 / loading / error, off for a type turned off, none for not-available menus", () => {
    expect(menuBadge(reserve, ok(2))).toEqual({ kind: "count", text: "2" });
    expect(menuBadge(reserve, ok(150))).toEqual({ kind: "count", text: "99+" });
    expect(menuBadge(reserve, ok(0))).toEqual({ kind: "none" });
    expect(menuBadge(reserve, { status: "pending" })).toEqual({ kind: "none" });
    expect(menuBadge(reserve, { status: "error" })).toEqual({ kind: "none" });
    expect(menuBadge(reserve, undefined)).toEqual({ kind: "none" });
    expect(menuBadge(approveMenuFor("quotation")!, { status: "success", off: true })).toEqual({ kind: "off" });
    expect(menuBadge(approveMenuFor("quotation")!, ok(3))).toEqual({ kind: "count", text: "3" });
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

  it("summary -> per-menu count: ON types count (0 when absent), OFF types off, unpermitted / inventory undefined, loading / error", () => {
    const data = summary({ reserve: 2, purchase: 100 }, ["quotation", "memo-out"]);
    const of = (slug: string) => summaryCount({ status: "success", data }, approveMenuFor(slug)!);
    expect(of("reserve")).toEqual(ok(2));
    expect(of("purchase")).toEqual(ok(100));
    expect(of("memo-receive")).toEqual(ok(0));
    expect(of("quotation")).toEqual({ status: "success", off: true });
    expect(of("memo-out")).toEqual({ status: "success", off: true });
    expect(of("load-to-stock")).toBeUndefined();
    const onlyReserve = { items: [{ type: "reserve", count: 1 }], countCap: 100, types: [{ type: "reserve", requireApproval: true }] };
    expect(summaryCount({ status: "success", data: onlyReserve }, approveMenuFor("purchase")!)).toBeUndefined();
    expect(summaryCount({ status: "pending" }, approveMenuFor("reserve")!)).toEqual({ status: "pending" });
    expect(summaryCount({ status: "error" }, approveMenuFor("reserve")!)).toEqual({ status: "error" });
  });

  it("summary and pending queries use the tRPC keys, so invalidating the approval router refreshes both", () => {
    expect(summaryQueryKey()).toEqual(getQueryKey(masterTrpc.approval.summary, undefined, "query"));
    expect(summaryQueryKey()[0]).toEqual(["approval", "summary"]);
    const input = pendingInput(approveMenuFor("reserve") as AvailableMenu, "RS26", DEFAULT_SORT);
    expect(pendingQueryKey(input)).toEqual(getQueryKey(masterTrpc.approval.pending, input, "infinite"));
    expect(pendingQueryKey(input)[0]).toEqual(["approval", "pending"]);
  });
});
