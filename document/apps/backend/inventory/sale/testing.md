# Backend verification: inventory / sale (SA revision 1, approved 2026-11-18)

Rules: [automated-testing](../../../../workflow/automated-testing.md). Every added/changed module, function and endpoint gets unit + integration tests in its own service. DB integration tests run against the real PostgreSQL test database (existing harnesses `backend-api-inventory/test/support/harness.ts` and the master DB test setup). No mock stores for persistence paths.

## Automated coverage

### Master (`backend-api-master`)

| ID | Target | Check |
|---|---|---|
| UT-SL-M01 | consumption delta planner | increases/decreases per line, summed per item, path mapping |
| IT-SL-M01 | migration | CHECKs reject sold > qty, sold on manual line; indexes exist; down script |
| IT-SL-M02 | `PUT sale-consumptions` RESERVE | reserve_line.sold += q; memo_stock reserved −= q, sold += q; balance CHECK holds; Reserve stays APPROVED |
| IT-SL-M03 | `PUT` STOCK | pending −= q, sold += q; Purchase SOLD group lists the item with `sold − purchased` |
| IT-SL-M04 | partial | 3 of 10 pcs sold → open 7; picker still lists the line with 7 |
| IT-SL-M05 | idempotency | same revision + hash replays (no double move); changed hash / lower revision → `STALE` |
| IT-SL-M06 | concurrency | two consumptions of one Reserve line in parallel → one 200, one `EXCEEDS_AVAILABLE`, totals correct; no deadlock with a parallel Reserve/Memo Out approval on the same item |
| IT-SL-M07 | Memo Out hold safety | item with Memo Out reserved 2 + Reserve line open 1; Sale asking 2 on the Reserve line → refused; Memo Out quantity untouched |
| IT-SL-M08 | unavailable | Reserve deleted / not approved / other customer / other currency / unknown memo stock → `LINE_UNAVAILABLE`, nothing changed |
| IT-SL-M09 | release | empty set releases all; release below `purchased` → `IN_USE`, nothing changed |
| IT-SL-M10 | Reserve used | auto-approved Reserve update/delete after a sale → `RESERVE_IN_USE` with usedBy; parallel update vs consumption serialises |
| IT-SL-M11 | reads | reserve-lines search (customer, currency, q, dates, exclude, keyset, oldest first, ≤ 1 page query); `prepare` caps incl. add-back with `saleId`; ≤ 4 queries |
| IT-SL-M12 | grants | `memoStock.list` and `currency.options` with only `sale:VIEW` succeed; other menus unchanged; internal routes refuse missing/wrong token |
| IT-SL-M13 | numbering | `transactionKey: sale` resolves and marks used; unknown key refused |
| IT-SL-M14 | reserve.get | lines return `soldPcs/soldWeightCt` |

### Inventory (`backend-api-inventory`)

| ID | Target | Check |
|---|---|---|
| UT-SL-B01 | Zod schemas | bounds, source shape, duplicates, decimals, due ≥ doc date, exchange rate rule |
| UT-SL-B02 | flow rules | canEdit/canDelete/canSubmit/canRestore per status, auto-approved, used, syncing |
| UT-SL-B03 | totals | parity fixtures with master `document-totals` / quotation calculate (line discount, header discount, tax included/excluded, labor, charges) |
| UT-SL-B04 | saga generalisation | `SyncDriver` with Sale store/port; **all existing Load to Stock saga tests pass unchanged** |
| IT-SL-B01 | create ON | DRAFT, number issued, nothing applied, ≤ 2 master calls |
| IT-SL-B02 | create OFF | provisional → APPROVED applied; refusal deletes provisional, never listed |
| IT-SL-B03 | approve | both sources applied; notification to creator in the same tx; Approve Center count drops |
| IT-SL-B04 | approve short | `SALE_SOURCE_SHORT`, back to PENDING_APPROVAL, version consistent |
| IT-SL-B05 | crash between steps | kill after master 200 before tx1 → re-drive completes once (master replays); kill before master call → op re-driven |
| IT-SL-B06 | busy / stale / deleted | `SALE_BUSY`, `SALE_CHANGED`, `SALE_DELETED`, `SALE_STATUS_INVALID`, `SALE_REVISE_LIMIT` |
| IT-SL-B07 | edit/delete auto-approved | re-apply with delta; delete releases; `SALE_IN_USE` path |
| IT-SL-B08 | restore | deleted → DRAFT, nothing applied |
| IT-SL-B09 | approval setting | `sale` row read FOR SHARE; turn-OFF refused while pending/revision sales exist |
| IT-SL-B10 | photos | upload ADD/EDIT only, JPEG/PNG signature, ≤ 5 MiB, key under `files/sale/`, read needs link or own upload, unlink keeps bytes + `stored_file`, limiter 429 |
| IT-SL-B11 | HTTP | auth/CSRF/grant per route (table in [authorization](authorization.md)), body cap, `no-store`, error envelope |
| IT-SL-B12 | N+1 budgets | get ≤ 3 local queries + ≤ 1 master call; list 1 query; save ≤ 2 master calls; approve 1 master call |
| IT-SL-B13 | notifications | SUBMITTED to approvers (not actor), APPROVED/REVISE/REJECT to creator, SSE carries ids only |

## Security review before handoff

Route the final changed source revision (master + inventory) once through `sec-auditor` and `security-auditor`; record results in this file; findings go to `document/task/investigation/` (BE-SL-008).

## Service acceptance

- All master and inventory suites pass (commands and counts recorded here by backend).
- ADR-0054 observable checks pass (IT-SL-M02…M10, IT-SL-B03…B07).
- INF-SL-001 nginx probe recorded by infra.
- Measurement: inventory RSS / p95 for a 200-line approve (shared with BE-LS-012).
