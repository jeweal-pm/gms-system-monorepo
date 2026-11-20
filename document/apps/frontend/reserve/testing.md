# Testing: reserve (revision 1): passed 2026-11-02 (evidence in the [TODO](../../../task/todo/reserve.md))

| ID | Level | What |
|---|---|---|
| UT-RS-B01…B04 | backend unit | Document Setup key `reserve` numbering; customer party; stock line rules (missing item, duplicate, > pending, no Sale Price, copied fields, source STOCK); manual lines unchanged; PENDING_APPROVAL; update/delete after approval → STATUS_INVALID |
| GP-MT-RS | router | grants per procedure (VIEW/ADD/EDIT/DELETE/APPROVE on `reserve`), CSRF on writes and approve, strict input, `memoStock.list` readable with `reserve:VIEW` |
| IT-RS-01…04 | DB integration (disposable PostgreSQL) | save holds nothing; approve moves pending → Reserve (CHECK memo_stock_balance); over-pull guard shared with Memo Out (a Memo Out and a Reserve over the same item: the second approval is short, nothing changes); manual-only reserve approves with no stock change; Document Setup `used` counts reserves |
| UT-RS-01…05 | frontend unit | sidebar link + routes + access; From Stock row mapping; schema (≤ pending, > 0, Sale Price on stock rows); contract input / saved mapping; errors and approve messages |
| TC-RS-01 | browser (:8080) | approved Memo Receive → Reserve → From Stock → part of an item + a manual row → Save (stock unchanged) → Approve → Memo Stock pending and Memo Outstanding Reserve change |

## Load to Stock phase 2 (2026-11-18)

Own stock in From Stock / Memo Outstanding: results in [quotation testing — Load to Stock phase 2](../quotation/testing.md#load-to-stock-phase-2--own-stock-in-from-stock-revision-3-shared-picker--2026-11-18) (UT-LS-P2-FE-02/04, IT-LS-P2-FE-01/03/04). Live checks and reviews pending.
