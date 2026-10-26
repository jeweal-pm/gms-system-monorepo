import { describe, expect, it } from "vitest";
import { VISIBLE_ITEM_ROWS, visibleRowsHeight } from "@/features/quotation/lib/table-scroll";

describe("visibleRowsHeight", () => {
  it("shows 5 rows", () => {
    expect(VISIBLE_ITEM_ROWS).toBe(5);
  });
  it("keeps the natural height while every row fits", () => {
    expect(visibleRowsHeight(70, [59, 59, 59, 59, 59], 44)).toBeNull();
    expect(visibleRowsHeight(70, [], 44)).toBeNull();
  });
  it("fits the header, the first 5 rows and the footer when there are more", () => {
    expect(visibleRowsHeight(70, [59, 59, 59, 59, 59, 59], 44)).toBe(70 + 5 * 59 + 44);
  });
  it("uses each row's measured height and rounds up", () => {
    expect(visibleRowsHeight(70.4, [92, 72, 59, 59, 59, 300, 300], 44)).toBe(Math.ceil(70.4 + 341 + 44));
  });
  it("adds the horizontal scrollbar so the fifth row is not cut off", () => {
    expect(visibleRowsHeight(70, [59, 59, 59, 59, 59, 59], 44, 10)).toBe(70 + 5 * 59 + 44 + 10);
  });
});
