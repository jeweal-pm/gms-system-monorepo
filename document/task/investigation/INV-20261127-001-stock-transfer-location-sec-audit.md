# INV-20261127-001 — Stock Transfer Location: Load rewrite/reverse can miss a concurrently created transfer row

## Tracking

- Ticket revision: 1
- Status: pending-review
- Owner: backend
- Priority: awaiting user review
- Auditor / mode / run ID: sec-auditor / focused pre-handoff review (guidance mode, not a full audit) / no run ID
- Date and audit scope: 2026-11-27; feature `stock-transfer-location` (ADR-0060, api-contract SA rev 1). Inventory module
  `src/modules/stock-transfer-location/**`, `src/modules/stock/{transfer,lots,card,card-kinds,stock}.ts`, `src/app.ts`,
  `src/platform/**` diff, migration `20261124120000_stock_transfer_location`; master `src/inventory-internal/**`
  (`PUT stock-id-issues`), migration `20261124120000_stock_id_issue`; frontend `features/stock-transfer-location/**`,
  route pages, `memo-stock-modal.tsx`, approve-center, approval-setup, navigation, stock-card model.
- Source commit, dirty paths, and relevant content hashes: HEAD `047a10c` plus the uncommitted/untracked working tree of
  branch `feat/24-11-26-stock-transfer-location`; sha256 prefixes `stock/stock.ts` c133ad24facfdff6, `stock/transfer.ts`
  e5331c5ef6e41c85, `stock-transfer-location/service.ts` a0ec97df4f947939
- Related ticket / root-cause fingerprint: related to INV-20261117-003 F2 (tx1 in-use re-check, `lockUnused`); new cause.
  Fingerprint `inventory:lockLoadStocks:transfer-child-invisible-in-statement-snapshot`
- Category: vulnerability (data integrity / race condition)
- Verdict: needs_validation (static trace of PostgreSQL READ COMMITTED semantics; no concurrent DB test was run)
- Vulnerability severity: not assigned (needs validation; estimated Medium if confirmed — two authorized users, timing window)

## Evidence and impact

- Affected files and line numbers:
  - `backend-api-inventory/src/modules/stock/stock.ts:54-61` (`lockLoadStocks`: one `SELECT … FOR UPDATE OF s` statement
    that both locks the Load's ACTIVE rows and computes `transferred` with an `EXISTS` sub-select).
  - `backend-api-inventory/src/modules/load-to-stock/service.ts:207-214` (`lockUnused`, the tx1 re-check) and
    `:164`, `:174` (callers that then reverse / rewrite stock).
  - `backend-api-inventory/src/modules/stock/stock.ts:64-76` (`reverseStocks`) and `:93-101` (`applyStockEdit` sets
    `pcs` / `on_hand_pcs` / `weight_ct` / cost to absolute Load values for kept rows).
  - `backend-api-inventory/src/modules/stock/transfer.ts:95-125` (`applyTransfer` locks the source row, reduces it, and
    INSERTs a new ACTIVE row that copies `load_id` and sets `transferred_from_uuid`).
- Attacker prerequisites and reachable entry point: two authenticated users acting at nearly the same time (or one user in
  two tabs): user A with `stock-transfer-location` ADD/EDIT/APPROVE applying a transfer of a stock row from Load L
  (`POST /stock-transfer-location`, `PUT /{id}`, `POST /{id}/approve`); user B with `load-to-stock` EDIT/DELETE editing or
  deleting the auto-approved Load L, whose saga reaches tx1 while A's transaction is open. Transfer apply does not check the
  Load's `sync_state`, so transfers are possible during the whole Load saga.
- Concrete trust boundary and source-to-sink trace:
  1. A's `applyTransfer` locks source S (load_id L) `FOR UPDATE`, subtracts the moved quantity/cost from S, INSERTs new row
     N (load_id L, ACTIVE, `transferred_from_uuid = S`) and has not committed yet.
  2. B's tx1 runs `lockLoadStocks(L)`; the statement snapshot is taken now, then it blocks on S's row lock.
  3. A commits. In READ COMMITTED, PostgreSQL re-checks only the locked row's WHERE against its newest version
     (EvalPlanQual). Rows and sub-selects of the statement still use the statement snapshot: N is not visible, so it is
     neither returned nor locked, and `EXISTS (… c.transferred_from_uuid = s.id …)` is false. S's newest version has
     `on_hand_pcs = pcs` (both reduced), so S is not "in use" either.
  4. `lockUnused` returns no in-use rows; tx1 reverses S (`reverseStocks`) or rewrites S back to the full Load quantity and
     cost (`applyStockEdit`), and master releases / re-allocates the purchase lines.
- Observed impact and independent verification evidence (static only): N remains an ACTIVE stock row with quantity and
  cost while its Load is reversed or rewritten to the full quantity, i.e. stock and cost are duplicated or orphaned
  outside the purchase allocation, and Stock Card / Stock Value report it. Not reproduced; the trace relies on documented
  PostgreSQL behaviour ("subsequent rows" and sub-queries use the statement snapshot; only the target row is re-fetched).
  The opposite ordering (Load first) is safe: `applyTransfer` re-reads S under lock and refuses a non-ACTIVE row.
  Transfer reversal vs. other writers is safe: every stock writer bumps `stock.version`, and `reverseTransfer` compares it.
- Missing validation fact / capability (if any): a two-session integration test against PostgreSQL (start transfer apply,
  pause before commit, start Load delete/edit tx1, commit transfer, observe tx1 result). No DB/sandbox was used in review.
- Sanitized evidence sufficient for owner review: the file/line trace above; no data or credentials involved.
- Raw report/run links: none (focused review, no run tree).

## Proposed work

- Allowed code scope and assigned implementation role: backend; `backend-api-inventory/src/modules/stock/stock.ts`
  (`lockLoadStocks`) and its tests; optionally `stock/transfer.ts`.
- Suggested remediation (any one, smallest first):
  - Split `lockLoadStocks` into the lock statement, then a second statement in the same transaction (fresh READ COMMITTED
    snapshot, after the locks are held) that re-selects the Load's ACTIVE rows and computes `transferred` / in-use; refuse
    when the second result contains rows that were not locked or any transferred row.
  - Or have `applyTransfer` take the same per-Load serialization as the Load saga (e.g. lock the Load header row or a
    per-Load advisory key for each distinct `load_id` of the sources, in a fixed order) and refuse sources whose Load is
    `SYNCING`.
- SA design / contract / flow / dependency change needed: none for the first option (internal locking only). The second
  option adds a refusal while a Load syncs; record it in the ADR-0060 D9 notes if chosen.
- Acceptance criteria: with a transfer committed between tx1's statement start and its lock acquisition, the Load edit /
  delete is refused `409 LOAD_TO_STOCK_IN_USE` (SyncHold) and no stock row is reversed or rewritten; existing Load and
  transfer suites still pass.
- Safe verification plan and prerequisites: integration test on the local test database with two Prisma clients and a
  controlled pause (e.g. `pg_advisory_lock` barrier or a deferred commit), no live services.

## Other boundaries inspected (no ticket)

- Authorization: every `/stock-transfer-location*` route checks its live grant (VIEW/ADD/EDIT/DELETE; submit ADD or EDIT;
  approve/revise/reject `canApprove` = APPROVE + VIEW); `/approval/pending?type=stock-transfer-location`, summary and
  notification scope `all` are gated likewise. CSRF and body cap come from the platform middleware on `/api/inventory/v1`.
- Internal token: master `PUT /internal/v1/inventory/stock-id-issues/:type/:id` is under the class-level
  `InventoryServiceTokenGuard` + `@InventoryInternalRoute()`; type allow-listed, id parsed, body strict (count 1–200).
- IDOR: client line ids are kept only when they belong to the document (`existingIds`); the line write-back is scoped by
  `transfer_id`. No per-owner model exists in this ERP beyond grants (unchanged pattern).
- SQL: all values are bound; the only `Prisma.raw` (pending sort column/direction) comes from a fixed map keyed by a zod
  enum; LIKE input is escaped; cursors are charset/shape-validated.
- Data exposure: picker and detail return Stock Price (contract) but no cost, unit cost or vendor.
- Races / idempotency: guarded updates on `version` + `applied_revision` + status; stock rows locked in id order; Stock ID
  issue serialized per document by an advisory lock, replays per revision, stale revision refused.
- Bounds: lines 1–200, unique source per document, exclude ≤ 200 UUIDs, page ≤ 50, text lengths capped.
- XSS: React text rendering only; no `dangerouslySetInnerHTML`; hrefs use `encodeURIComponent(id)`.
- Reverse path: refuses when a new row is not pristine (version 1, on hand = pcs, no hold, no other movement) or a source
  version moved since apply; sources and ledger restored in one transaction.
- Design note (not a vulnerability): delete of a REJECTED document followed by restore returns it to DRAFT, so "Reject is
  final" is not absolute; this matches the contract and the Sale pattern.

## User selection and approval

- Approved ticket revision:
- Actual user instruction / approval evidence:
- Approval date:
- Separate approved SA bundle/revision, if required:

Do not infer approval from creation of this ticket or approval of a different revision.

## Implementation and resolution

Apply [bounded remediation](../../workflow/remediation.md); counts persist across roles,
revisions, and sessions for the same cause. Do not allocate a fresh budget on handoff.

- Selected work ID / root-cause fingerprint: inventory:lockLoadStocks:transfer-child-invisible-in-statement-snapshot
- Corrective pass limit: 3 (initial fix included)
- Passes allocated: 0
- Active pass: none
- User-authorized extension and new limit: none
- Stop reason / missing prerequisite: none
- Reopen evidence and explicit selection: none

| Pass | Owner(s) / input revision or hash | Causal hypothesis / new evidence | Meaningful change | Authorized verification / result / failure signature | Next fact or terminal decision |
|---|---|---|---|---|---|

- Assigned owner and start date:
- Changed files / implementation revision:
- Checks performed, results, and limitations:
- Follow-up auditor and verification evidence:
- Remaining risk or reopened validation gap:
- Completion report under document/task/done/:
- Final status / date:
