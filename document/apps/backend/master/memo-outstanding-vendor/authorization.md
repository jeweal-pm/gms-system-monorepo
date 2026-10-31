# Authorization: memo-outstanding-vendor (SA revision 1, 2026-10-29, approved 2026-10-29)

- The existing catalog leaf `memo-outstanding-vendor` has all nine actions, so the catalog does not change. `MasterMenu` gains `memo-outstanding-vendor`.
- Every `memoOutstanding.vendor*` procedure needs `memo-outstanding-vendor:VIEW` through the ADR-0031 boundary (session, live grants, license). These are reads, so no CSRF is needed.
- The page needs no `memo-receive`, `vendor` or `currency` grant, because vendor choices come from `vendorOptions`. The Doc Number link opens the Memo Receive page, which still checks `memo-receive:VIEW` itself.
- PRINT shows the Print buttons and EXCEL shows the Excel button (unavailable). Both are frontend-only, as on other pages.
- Prices and the grand total go to every VIEW holder (Q-MOV-07).
