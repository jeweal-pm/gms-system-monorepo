# INV-20261127-002 — Stock Transfer Location: edit-after-effect lock order can deadlock (unmapped 500)

## Tracking

- Ticket revision: 1
- Status: pending-review
- Owner: backend
- Priority: awaiting user review
- Auditor / mode / run ID: security-auditor / focused pre-handoff review (read-only) / no run tree
- Date and audit scope: 2026-11-27; feature `stock-transfer-location` (ADR-0060), uncommitted working tree on
  `feat/24-11-26-stock-transfer-location`: backend-api-inventory `src/modules/stock-transfer-location/**`,
  `src/modules/stock/{transfer,lots,card,card-kinds,stock}.ts`, `src/app.ts`, `src/platform/**` diff, migration
  `20261124120000_stock_transfer_location` + rollback; backend-api-master `src/inventory-internal/**`
  (`PUT /stock-id-issues/{type}/{id}`), migration `20261124120000_stock_id_issue` + rollback; frontend
  `src/features/stock-transfer-location/**`, `app/(app)/inventory/stock-transfer-location/**`, `memo-stock-modal.tsx`,
  approve-center, approval-setup, navigation, stock-card model.
- Source commit, dirty paths, and relevant content hashes: HEAD `047a10c` + dirty/untracked paths above (git status
  2026-11-27). sha256 prefixes: inventory `stock-transfer-location/service.ts` a0ec97df4f947939, `stock/transfer.ts`
  e5331c5ef6e41c85; master `inventory-internal/stock-id-issue.ts` f93ca172971fc8f5.
- Related ticket / root-cause fingerprint: `stock-transfer-update-two-phase-row-lock` (none existing).
- Category: hardening
- Verdict: not-applicable

## Evidence and impact

- Affected files and line numbers:
  - `backend-api-inventory/src/modules/stock-transfer-location/service.ts:197-200` (`update`, auto-approved branch):
    `reverseTransfer(...)` then `this.apply(...)` in one transaction.
  - `backend-api-inventory/src/modules/stock/transfer.ts:165-170` (reverse locks old sources + old new rows
    `ORDER BY s."id" FOR UPDATE`) and `transfer.ts:95-97` (apply locks the NEW sources `ORDER BY s."id" FOR UPDATE`).
  - `backend-api-inventory/src/platform/db.ts:7` (`WRITE_TX` 4 s); no mapping of PostgreSQL `40P01` in `src/`.
- Prerequisites / entry point: authenticated users with `stock-transfer-location` EDIT on auto-approved documents
  (`PUT /api/inventory/v1/stock-transfer-location/{id}`), or one such edit concurrent with another writer that locks an
  overlapping stock set in id order (Sale own-stock, holds, Load edit, another transfer).
- Trace: each phase is id-ordered, but the union is not. Edit A holds {old set of A} and then requests {new set of A};
  a concurrent edit B holding {old set of B} requests {new set of B}. When A's new set contains a row in B's old set
  and vice versa (e.g. two documents swapping sources), the two transactions wait on each other.
- Observed impact: PostgreSQL detects the cycle (deadlock_timeout) and aborts one transaction; the error is not mapped,
  so the client gets a generic 500 instead of a retryable 409. Atomicity holds (the transaction rolls back; Stock IDs
  issued for that revision are replayed on retry), so there is no stock corruption or authorization effect. This is
  a robustness gap, not an exploitable vulnerability.
- Missing validation fact: not reproduced (no live DB run in this review; read-only static trace).
- Raw report/run links: none.

## Proposed work

- Allowed code scope and assigned implementation role: backend, `backend-api-inventory/src/modules/stock/transfer.ts`,
  `src/modules/stock-transfer-location/service.ts`, related tests.
- Suggested remediation: in the auto-approved edit path, take ONE id-ordered `FOR UPDATE` over the union of
  {old sources, old new rows, new sources} before reversing (e.g. a `lockStocks(tx, ids)` helper called before
  `reverseTransfer` / `applyTransfer`; re-locking already-held rows is a no-op). Optionally map `40P01` / `40001` to
  `409 VERSION_CONFLICT`-style retryable responses.
- SA design / contract / flow / dependency change needed: none (internal lock order; the contract is unchanged).
- Acceptance criteria: the edit path acquires all stock row locks in a single id-ordered statement; an integration
  test with two concurrent edits swapping sources finishes without a 500.
- Safe verification plan and prerequisites: local test PostgreSQL only; existing `test/stock-transfer-location`
  harness.

## User selection and approval

- Approved ticket revision:
- Actual user instruction / approval evidence:
- Approval date:
- Separate approved SA bundle/revision, if required:

Do not infer approval from creation of this ticket or approval of a different revision.

## Implementation and resolution

Apply [bounded remediation](../../workflow/remediation.md); counts persist across roles,
revisions, and sessions for the same cause. Do not allocate a fresh budget on handoff.

- Selected work ID / root-cause fingerprint: stock-transfer-update-two-phase-row-lock
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

## Review record (same source revision): boundaries checked with no finding

- Authn/authz + CSRF: all 13 routes sit under `api.use("*", session)` (`app.ts`; session + trusted-origin CSRF) and the
  256 KiB JSON cap; each checks the live grant on leaf `stock-transfer-location` (VIEW/ADD/EDIT/DELETE; approve /
  revise / reject use `canApprove` = APPROVE + VIEW). `/approval/pending?type=stock-transfer-location` checks
  `canApprove`; summary returns nothing without it; notification `scope=all` filters by VIEW.
- Internal token: the new master `PUT stock-id-issues/:documentType/:documentId` inherits the class-level
  `@UseGuards(InventoryServiceTokenGuard)`; type is an allow-list enum (unknown → 404), id `parseId`, body strict
  (`revision` 1..2e9, `count` 1..200), `X-Actor-User-Id` audit only.
- SQL: all statements are Prisma tagged templates / `Prisma.sql` parameters; `Prisma.raw` only for enum-mapped sort
  columns/direction (`read.ts` `SORT_COLUMN`); LIKE input escaped; cursors regex/shape-validated; `exclude` ≤ 200 UUIDs.
- Transactions: every write uses a guarded `UPDATE … WHERE version = expected AND status … AND applied_revision = …`
  (row lock) before work; double approve / edit-vs-approve resolve to `VERSION_CONFLICT` / `STOCK_TRANSFER_STATUS`;
  apply re-checks ACTIVE / location / on hand under `FOR UPDATE`; duplicate `fromStockUuid` rejected by schema and by
  unique index `stock_transfer_line_from_key` (so the `UPDATE … FROM (VALUES …)` never sees duplicate ids);
  `stock.stock_id` is unique.
- Stock ID issue idempotency: per-document advisory lock, lower revision → `STOCK_ID_ISSUE_STALE` (mapped to 409),
  same revision replays a prefix, growth appends only missing ids (total ≤ 200, table CHECK), ids never reused.
- Reverse integrity (D9): new rows must be ACTIVE, version 1, on hand = pcs, no hold, no non-TRANSFER_IN movement;
  sources must be ACTIVE with `version = applied_from_version`; every stock writer in `src/` bumps `version`. Load to
  Stock edit/reverse refuses rows born by or feeding an ACTIVE transfer row (`lockLoadStocks`).
- Bounded resources: ≤ 200 lines, set-based statements, pages ≤ 50, summary counts capped at 100, two master calls
  before the transaction (none inside).
- Frontend: no `dangerouslySetInnerHTML` / raw HTML / dynamic redirect; ids path-encoded with `encodeURIComponent`;
  responses schema-parsed; text rendered through React escaping.
- Design-consistent observations (not findings; owner/SA decisions already in ADR-0060 / api-contract and the Sale
  pattern): an auto-approved document stays editable/deletable and re-applies immediately even if approval was
  switched ON later; a REJECTED document can be deleted and restored to DRAFT. Each edit of an applied document
  retires up to 200 Stock IDs and leaves up to 200 REVERSED stock rows (bounded per request, no rate limit beyond the
  platform's).
- Limits: static read-only review; tests not run by this reviewer; no live DB concurrency reproduction.
