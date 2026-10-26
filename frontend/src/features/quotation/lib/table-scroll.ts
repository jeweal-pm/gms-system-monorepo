/** The item table shows at most this many rows; the rest scroll (owner 2026-10-23). */
export const VISIBLE_ITEM_ROWS = 5;

/**
 * Height that fits the header, the first `limit` rows and the footer. Rows differ in height
 * (empty, filled, with item note), so the heights are measured rather than fixed. `scrollbarHeight` is the
 * horizontal scrollbar under the table (0 when the table fits the width), so the fifth row is not cut off.
 * Returns null when every row already fits, so the table keeps its natural height.
 */
export function visibleRowsHeight(
  headHeight: number,
  rowHeights: readonly number[],
  footHeight: number,
  scrollbarHeight = 0,
  limit = VISIBLE_ITEM_ROWS,
): number | null {
  if (rowHeights.length <= limit) return null;
  const rows = rowHeights.slice(0, limit).reduce((sum, h) => sum + h, 0);
  return Math.ceil(headHeight + rows + footHeight + scrollbarHeight);
}
