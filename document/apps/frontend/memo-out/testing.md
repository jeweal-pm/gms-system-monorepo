# Testing: memo-out

| ID | Level | What | Status |
|---|---|---|---|
| UT-MO-01 | frontend unit | sidebar Memo Out → `/memo/memo-out`; `memo-out:VIEW` gates the page | revision 1 |
| UT-MO-02 | frontend unit | shared header renders the "Memo Out No.:" label and its Create New link; Quotation defaults unchanged | revision 1 |
| TC-MO-01 | browser (:8080) | page layout matches source 01; Save/Edit/Delete disabled with the preview notice; From Stock disabled; rail Summary and empty Daybook | revision 1 |
| UT-MO-B* / IT-MO-* | backend + integration | save, numbering, references, stock | after the SA revision (FE-MO-002…004) |

## Revision 2 (SA revision 2): passed 2026-10-31 (evidence in the [TODO](../../../task/todo/memo-out.md))

| ID | Level | What |
|---|---|---|
| UT-MO-B11…B15 | backend unit | stock line save rules (missing item, duplicate, > pending, no Sale Price, copied fields, source STOCK); manual lines unchanged; status PENDING_APPROVAL; update/delete after approval → STATUS_INVALID |
| GP-MT-MO2 | router | `memoOut.approve` needs APPROVE + CSRF; `memoStock.list` readable with memo-out VIEW, `vendorId` optional |
| IT-MO-01…05 | DB integration (disposable PostgreSQL) | save reserves nothing; approve moves pending → Reserve and keeps `memo_stock_balance`; over-pull guard (two memo outs, second short → PENDING_SHORT, nothing changes); parallel approvals never exceed pending; manual-only document approves with no stock change; migration turns DRAFT into PENDING_APPROVAL |
| UT-MO-201…205 | frontend unit | From Stock row mapping (Stock ID, read-only fields, full pending, empty Sale Price); schema (≤ pending, > 0, Sale Price required on stock rows only); Approve visibility and messages; status badges; picker leaves picked items out |
| TC-MO-02 | browser (:8080) | approved Memo Receive → From Stock → part of an item + a manual row → Save (stock unchanged) → Approve → Memo Stock pending and Memo Outstanding Reserve change; second memo out over the rest → PENDING_SHORT |
