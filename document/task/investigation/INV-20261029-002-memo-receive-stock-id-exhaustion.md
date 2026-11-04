# INV-20261029-002 — One user can use up the year's Memo Receive Stock IDs

## Tracking

- Ticket revision: 2 (2026-11-04: Purchase added as a second consumer of the same counter; root cause and proposed options unchanged)
- Status: pending-review
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

- Approved ticket revision:
- Actual user instruction / approval evidence:
- Approval date:
