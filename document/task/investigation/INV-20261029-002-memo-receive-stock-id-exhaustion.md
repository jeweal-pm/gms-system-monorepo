# INV-20261029-002 — One user can use up the year's Memo Receive Stock IDs

## Tracking

- Ticket revision: 2 (2026-11-04: Purchase added as a second consumer of the same counter; root cause and proposed options unchanged)
- Status: resolved (2026-11-13, pass 1; see Resolution)
- Owner: backend (rule change needs SA / owner decision Q-MR-09)
- Priority: awaiting user review
- Auditor / mode / run ID: security-auditor, focused pre-handoff review, 2026-10-29
- Date and audit scope: 2026-10-29; memo-receive rev 3 working-tree changes on `feat/29-10-26-integrate-memo-receive` (base e1b8bcb)
- Source commit, dirty paths, and relevant content hashes: uncommitted; `backend-api-master/src/trade-document/memo-receive.service.ts`, `document-engine.ts`
- Related ticket / root-cause fingerprint: monotonic per-year counter `memo_stock_id_counter` with a 9,999 ceiling and no reuse; open owner question Q-MR-09
- Category: vulnerability
- Verdict: needs_validation (no severity until Q-MR-09 and the trust level of ADD/EDIT holders are known)

## Evidence and impact

- `memo-receive.service.ts:19,41-53`: the counter only goes up and stops at 9,999. `:92`: every line sent without `id` takes a new number, on create and on update. `document-engine.ts:281`: pending documents can be deleted, and their numbers are never reused (SA-MR-04).
- Entry point: `memoReceive.create` / `update`, which need `memo-receive:ADD` / `EDIT` and CSRF. A direct tRPC call can leave out line ids, even though the UI sends them.
- Impact: about 50 creates of 200 lines, or repeated updates that resend lines without ids, reach 9,999. After that, every create and every update that adds a line fails with `MEMO_RECEIVE_STOCK_ID_EXHAUSTED` for the whole company until the next year. Recovery needs a manual database change. There is no rate limit on master tRPC mutations: nginx `limit_req` covers login only (`docker/nginx/gms-dev.conf`).
- Revision 2 addition (sec-auditor, focused pre-handoff review of purchase BE-PU-002…004, 2026-11-04; source HEAD `279d4ad` + uncommitted working tree; `backend-api-master/src/purchase/purchase.service.ts` blob 38f84e37): Purchase now issues numbers from the same `memo_stock_id_counter` through `issueStockIds(tx, needed, …, purchaseStockIdExhausted)` (`purchase.service.ts:52-57`). Every MANUAL / PURCHASE_ORDER line takes a new number on `purchase.create`, and on `purchase.update` unless the line resends its saved `id` and both the saved and the new line are non-STOCK (a STOCK → MANUAL flip also takes a new number). Pending purchases are deletable (`purchase.delete`) without reuse. Entry points: `purchase.create` / `update` (`purchase:ADD` / `EDIT` + CSRF). The effect is shared: purchase saves can exhaust the year for Memo Receive (`MEMO_RECEIVE_STOCK_ID_EXHAUSTED`) and vice versa (`PURCHASE_STOCK_ID_EXHAUSTED`). Static analysis only; the counter ceiling, no-reuse rule and missing mutation rate limit are unchanged, so the verdict stays `needs_validation`. Any chosen option must cover both documents.

## Proposed work

- Options (owner / SA to choose):
  - a per-user rate limit on create/update;
  - a log or metric alert when the counter passes 80%;
  - an approved admin recovery path;
  - a wider Stock ID format (Q-MR-09);
  - an owner risk acceptance.
- Acceptance: one principal cannot use up the yearly range in a short time, or the owner records a risk acceptance under Q-MR-09.

## User selection and approval

- Approved ticket revision: current
- Actual user instruction / approval evidence: owner 2026-11-13: "INV-20261029-002 ถ้าเลขมันถึง 269999 ให้ขึ้นเป็น 270000 เลย" — decision for Q-MR-09: no ceiling; the running number carries into the next prefix (269999 → 270000) instead of refusing; fix now
- Approval date: 2026-11-13

## Resolution (pass 1)

- Owner / date: backend, 2026-11-13. Corrective pass 1 of 3 (initial fix); result: resolved. Branch `fix/12-11-26-inv`, base `2126ec01` + uncommitted working tree (not committed or pushed).
- Decision applied: owner Q-MR-09 (2026-11-13) "ถ้าเลขมันถึง 269999 ให้ขึ้นเป็น 270000 เลย". The yearly 9,999 ceiling and its refusal are removed for Memo Receive **and** Purchase (shared counter). This also answers the rate-limit concern of this ticket: nothing can be "used up" in a year any more, so one principal can no longer block the company's saves; no rate limit, alert or recovery path is needed for this cause.
- Rule as implemented (`issueStockIds`, `backend-api-master/src/trade-document/memo-receive.service.ts`):
  - Stock ID = `lpad(year × 10,000 + last_no, 6, '0')`: …269998, 269999, 270000, 270001…; "050001" keeps its padding; 7+ digits only far in the future (VARCHAR(10) holds them).
  - A year's numbers always start after the greatest number issued in earlier years: 2026 ran into 270005 → 2027 starts at 270006. A year that the previous one did not reach starts at …0001 as before.
  - Still one locked statement in the same place of the save transaction (after the Document Setup lock): `WITH prior AS (SELECT … WHERE year < Y ORDER BY year FOR SHARE) INSERT … SELECT Y, n + floor FROM prior ON CONFLICT (year) DO UPDATE SET last_no = GREATEST(last_no + n, EXCLUDED.last_no)`. Lock order: earlier years' rows (shared, ascending) → own row, the same for every caller, so no new deadlock; a save still issuing in the previous year commits before the new year's floor is read.
  - `*_STOCK_ID_EXHAUSTED` (409) is kept only for the INTEGER limit (`last_no` > 2,000,000,000), so the frontend mappings stay valid and nothing overflows.
- Schema (constraint relax only; no column, index or row change): migration `backend-api-master/prisma/migrations/20261113090000_stock_id_carry_over/migration.sql` — `memo_stock_id_counter_values_check` `last_no BETWEEN 0 AND 2000000000` (was ≤ 9999); `memo_receive_line_stock_id_check` / `memo_stock_stock_id_check` `'^[0-9]{6,10}$'` (was exactly 6). A schema change could not be avoided because the old CHECKs would have refused `last_no` 10,000 and any 7-digit id. `schema.prisma` unchanged.
- Other code: keyset cursors accept 6–10 digit Stock IDs (`purchase/purchase-pickers.ts`, `trade-document/memo-stock.service.ts`).
- Tests (all pass):
  - Unit `test/trade-document/memo-receive.test.ts`: UT-MR-ID2 (269998, 270000, 270005, 060001, 1000000, ≤ 10 digits), UT-MR-ID3 (9,998 + 3 → 269999/270000/270001, one statement, `prior … FOR SHARE`, no 9999 in SQL), UT-PU-B05 (exhausted only above `STOCK_NO_MAX`); `test/purchase/purchase.service.test.ts` mock follows the new parameter order.
  - DB `test/trade-document/memo-receive.db.integration.test.ts` IT-MR-02b: 579998 + 3 → 579999, 580000, 580001, then 580002; 2058 starts at 580003 (counter 4); 2059 starts at 590001; two parallel saves across 599998 → 599999, 600000, 600001, 600002 (no duplicate, all line ids unique); only the INTEGER limit refuses and writes nothing. IT-MR-02 (year of the save, parallel) unchanged.
  - DB `test/purchase/purchase.db.integration.test.ts` IT-PU-B09: Memo Receive and Purchase share the counter across 769999 → 770000 → 770001 → 770002.
- Verification: fresh disposable PostgreSQL 18.6 (it-pg, removed afterwards) — master 76 files / 725 passed / 15 skipped (one earlier full run had the known IT-MOC-02 flake, which passed on two reruns and the second full run); auth 24 files / 111 passed / 6 skipped; master and auth `tsc --noEmit` and eslint clean.
- Docs updated: SA-MR-04 (`apps/backend/master/memo-receive/decisions.md`), Q-MR-09 decided (`apps/frontend/memo-receive/open-questions.md`), ui-spec Stock ID note, memo-receive error-handling / sequence / database diagram / testing, ADR-0034 superseded note, purchase SA-PU-10 and error-handling.
- Remaining risk: a save that straddles New Year's midnight in a year that already overflowed could, in a millisecond window, issue a number the new year issued first; the unique Stock ID indexes refuse it (save fails, retry succeeds), never a duplicate. Stock IDs with 7+ digits (only after year 99 overflows) would sort as text before 6-digit ids in `stock_id DESC` lists; far future, noted only. Year 2100 wraps to `00`; unchanged from before.
- Completion report: [2026-11-13 INV fixes](../done/2026-11-13-inv-fixes.md).
- Final status / date: resolved, 2026-11-13.
