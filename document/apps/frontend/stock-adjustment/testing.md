# Testing: stock-adjustment (UI revision 1, approved 2026-11-24)

These tests follow [automated-testing](../../../workflow/automated-testing.md). Use Vitest and Testing Library, with the API mocked at the fetch layer.

| ID | Level | Target | Checks |
|---|---|---|---|
| UT-SAJ-01 | unit | `form.ts` diff | Physical − Stock for pcs/cts/price; "–" until filled; decimal-safe (1.12 − 0.10 = 1.02) |
| UT-SAJ-02 | unit | `form.ts` validation | required header fields; ≥ 1 picked row; Physical Pcs/Cts required; ranges |
| UT-SAJ-03 | unit | `api.ts` | request shapes; error mapping (STOCK_CHANGED, IN_USE, LINE_UNAVAILABLE, VERSION_CONFLICT) |
| IT-SAJ-01 | integration | page | new document: 5 empty rows, number preview, From Stock disabled-toast without location |
| IT-SAJ-02 | integration | From Stock | requests `location` = Main Location; excludes already-picked lots; adds rows with Stock values and default Physical Price |
| IT-SAJ-03 | integration | location change | confirm dialog clears rows |
| IT-SAJ-04 | integration | save OFF / ON | OFF → Approved (auto) and stock-card queries invalidated; ON → Draft, then Send to approve |
| IT-SAJ-05 | integration | stale row | 409 STOCK_CHANGED shows the row message and keeps edits |
| IT-SAJ-06 | integration | Approve Center | panel lists pending adjustments; approve works |
| UT-SAJ-04 | unit | navigation | Inventory › Stock Adjustment links to the real page |

Manual checks (manual-tester), TC-SAJ-01…: count a lot down to 0 and confirm it disappears from From Stock; count up and confirm Stock Card shows an ADJUST IN line; change Physical Price and confirm Stock Value.
