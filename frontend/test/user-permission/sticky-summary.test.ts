import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { useForm } from "react-hook-form";
import { describe, expect, it } from "vitest";
import { PermissionMatrix } from "@/features/user-permission/components/permission-matrix";
import { locationSummary, PersonalSummaryBar, SUMMARY_BAR_HEIGHT } from "@/features/user-permission/components/personal-summary-bar";
import { emptyUserForm, type UserFormValues } from "@/features/user-permission/schema";
import { DRAWER_PUSH_CLASS, PC_LAYOUT_QUERY } from "@/lib/drawer-layout";
import { isScrolledPast } from "@/features/user-permission/use-scrolled-past";

/** UT-UP-STICKY-01…05: the page scrolls and a compact Personal Information summary sticks (owner 2026-10-21). */

const rect = (bottom: number) => ({ bottom }) as DOMRectReadOnly;

describe("isScrolledPast", () => {
  it("UT-UP-STICKY-01 true only when the card has left through the top (not the bottom) of the scroll area", () => {
    const rootBounds = { top: 96 } as DOMRectReadOnly;
    expect(isScrolledPast({ isIntersecting: false, boundingClientRect: rect(40), rootBounds })).toBe(true);
    expect(isScrolledPast({ isIntersecting: true, boundingClientRect: rect(300), rootBounds })).toBe(false);
    expect(isScrolledPast({ isIntersecting: false, boundingClientRect: rect(2000), rootBounds })).toBe(false);
  });
});

describe("PersonalSummaryBar", () => {
  it("UT-UP-STICKY-02 location names follow option order", () => {
    const options = [{ id: "a", label: "Primary" }, { id: "b", label: "Bangkok HQ" }, { id: "c", label: "Chanthaburi" }];
    expect(locationSummary(options, ["b", "a"])).toBe("Primary, Bangkok HQ");
    expect(locationSummary(options, [])).toBe("");
  });

  it("UT-UP-STICKY-03 shows name, @username, Active, locations, the counter and Personal info", () => {
    function Harness() {
      const form = useForm<UserFormValues>({
        defaultValues: { ...emptyUserForm(), name: "Nattaya S.", username: "nattaya.s", locationIds: ["a", "b"] },
      });
      return createElement(PersonalSummaryBar, {
        form,
        readOnly: true,
        superAdmin: false,
        isSelf: false,
        locations: [{ id: "a", label: "Primary" }, { id: "b", label: "Bangkok HQ" }],
        photoSrc: null,
        permissionCount: { enabled: 59, applicable: 176 },
        onExpand: () => {},
      });
    }
    const html = renderToStaticMarkup(createElement(Harness));
    expect(html).toContain(`height:${SUMMARY_BAR_HEIGHT}px`);
    // Owner design 2026-10-21: square corners and the 0 4px 14px #18202A1A shadow.
    expect(html).toContain("rounded-none");
    expect(html).toContain("shadow-[0px_4px_14px_0px_#18202A1A]");
    expect(html).toContain("Nattaya S.");
    expect(html).toContain("@nattaya.s");
    expect(html).toContain('id="user-active-summary"');
    expect(html).toContain("Primary, Bangkok HQ");
    expect(html).toContain("<strong");
    expect(html).toContain(">59</strong> of 176 on");
    expect(html).toContain("Personal info");
  });
});

describe("PermissionMatrix", () => {
  it("UT-UP-STICKY-04 the table is not height-limited and its header and Select All always stick below the summary", () => {
    const html = renderToStaticMarkup(createElement(PermissionMatrix, { nodes: [], values: {}, collapsed: new Set<string>(), onToggleGroup: () => {}, forceExpand: false }));
    // No scrolling wrapper: it would capture the sticky rows (owner 2026-10-21).
    expect(html).not.toMatch(/overflow-(x-)?auto/);
    expect(html).toContain("min-w-[640px]");
    expect(html).toContain("@max-[720px]:w-[24%]");
    // Each layer overlaps the one above by 1 px, so zoom rounding leaves no seam.
    expect(html).toContain("sticky top-[95px] z-20");
    expect(html).toContain("sticky top-[136px] z-10");
    expect(html).toContain("text-gms-label @min-[880px]:text-gms-body");
  });

  it("UT-UP-STICKY-05 summary height + its 24 px gap equals the table's sticky offset", () => {
    expect(24 + SUMMARY_BAR_HEIGHT).toBe(96);
  });
});

describe("Users drawer layout", () => {
  it("UT-UP-STICKY-06 on a PC the open drawer pushes the content; on a touch tablet it overlays", () => {
    expect(DRAWER_PUSH_CLASS).toBe("pointer-fine:min-[1366px]:pr-[360px]! min-[1440px]:pr-[360px]!");
  });
});

describe("Users drawer default", () => {
  it("UT-UP-STICKY-07 open by default on a PC, closed on an iPad in landscape (same rule as the push layout)", () => {
    expect(PC_LAYOUT_QUERY).toBe("(min-width: 1440px), (pointer: fine) and (min-width: 1366px)");
    // The push class and the default-open query describe the same screens.
    expect(DRAWER_PUSH_CLASS).toContain("min-[1440px]:");
    expect(DRAWER_PUSH_CLASS).toContain("pointer-fine:min-[1366px]:");
  });
});
