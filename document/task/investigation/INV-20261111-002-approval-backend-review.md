# INV-20261111-002 — Approval backend focused review (sec-auditor + security-auditor, same revision): auto-approved delete race (F1), setting update accepts unavailable types, party-sort cursor, auth view names, go-live dry-run locks

> Renumbered from INV-20261111-001 on 2026-11-12 (dev already has INV-20261111-001 notification-stream). Merged record (parent, 2026-11-11): both reviewers wrote INV-20261111-002 in parallel for the same revision. Part A is sec-auditor (items 1–2), Part B is security-auditor (F1, H1, H2). One ticket, one revision, one corrective ledger.

## Owner decision (2026-11-12)

- Owner reply "ต่อเลย" to the proposal "แก้ INV-20261111-002 ตามนี้": **fix** F1 (lock the source header when a dependent document applies effects; two-session DB test), item 1 (refuse unavailable types in `approvalSetting.update`), item 2 (party cursor only from live PENDING rows), H2 (dry run per document with immediate rollback, no long locks); **accept** H1 as a risk (the reader role already reads every user's ids and grants) and correct the ADR-0046 D5 wording.
- Corrective ledger: pass 1 of 3 (initial fix), owner backend, revision 1.

## Part A — sec-auditor
## Tracking

- Ticket revision: 1
- Status: resolved (pass 1, 2026-11-12)
- Owner: backend
- Priority: awaiting user review
- Auditor / mode / run ID: sec-auditor / focused pre-handoff review (guidance mode, static, read-only) / no full-audit run
- Date and audit scope: review revision dated 2026-11-10 (record written 2026-11-11). Working-tree diff against `origin/dev`
  under `backend-api-master/` and `backend-api-auth/` (tracked changes plus untracked approval-setting, approval, scripts,
  migrations and tests). Design: ADR-0046 as amended by ADR-0048, `document/apps/backend/master/approval-setup/*.md`
  (clarifications G1–G15), `document/apps/backend/master/approve-center/*.md`.
- Source commit, dirty paths, and relevant content hashes: HEAD `e6da43b37a87208b6175611f021207ac0dca9ecc` on branch
  `feat/10-11-26-approval-api` plus the uncommitted working tree (72 dirty/untracked paths under the two services).
- Related ticket / root-cause fingerprint: none existing. Fingerprints: `approval-setting-update-unavailable-type`
  (item 1), `approval-pending-party-cursor-unscoped-row` (item 2).
- Category: hardening (both items)
- Verdict: not-applicable (hardening; no exploitable trust-boundary failure confirmed)
- Vulnerability severity: none (hardening)

## Evidence and impact

### Item 1 — `approvalSetting.update` changes the three future inventory types (G6 not enforced)

- Affected files and line numbers:
  - `backend-api-master/src/approval-setting/approval-setting.schemas.ts:18-22` — `type: z.enum(APPROVAL_TYPES)` accepts all
    11 keys, including `load-to-stock`, `merge-split`, `stock-transfer-location`.
  - `backend-api-master/src/approval-setting/approval-setting.service.ts:79-104` — `update` checks `isApprovalDocType` only
    for the waiting-count guard; any other type is switched and its version bumped.
  - Contract: `document/apps/backend/master/approval-setup/architecture.md` G6 — "`approvalSetting.update` for a type with
    `available = false` → `VALIDATION_ERROR` (field `type`, "Not available yet")". No test covers this refusal
    (`test/approval-setting/*` has none).
- Attacker prerequisites and reachable entry point: an authenticated, licensed user with `approval-setup:EDIT` and a
  valid CSRF token, calling the tRPC mutation `approvalSetting.update` directly (the UI does not offer the switch).
- Trace: tRPC `approvalSetting.update` → `permitted("approval-setup","EDIT",true)` → schema (accepts) → service `update`
  → `tx.approvalSetting.update` writes `require_approval`.
- Impact: a privileged settings editor can pre-set the future inventory types to OFF. When those document modules ship
  and read this row with `readApprovalSetting`, Save would auto-approve (stock effects without review) unless the
  release resets the row. The actor already holds the approval-switch authority, so this is a contract-enforcement gap,
  not a privilege escalation.
- Missing validation fact: whether the future inventory releases plan to reseed these rows (would neutralise the effect).

### Item 2 — `approval.pending` party-sort cursor reads the key row without a pending/type-state filter

- Affected files and line numbers: `backend-api-master/src/approval/approval.service.ts:107-115` (`keyValues`, `party`
  case: `SELECT k."<party>_name_snapshot" FROM <table> k WHERE k."id" = <cursor id>`), cursor decoding at `:50-88`
  (base64url JSON, unsigned; `i` accepts any GUID per G15).
- Attacker prerequisites and reachable entry point: an approver of the type (`<menu>:APPROVE`, possibly without
  `<menu>:VIEW`) who knows the UUID of a non-pending (e.g. DRAFT / APPROVED / deleted) document of that type, calling
  `approval.pending` with `sort=party` and a hand-built cursor.
- Trace: input `cursor` → `decodePendingCursor` (shape/sort/dir/q-hash checks only) → `pendingSql` keyset predicate
  compares pending rows against the party name of the arbitrary row id.
- Impact: an ordering oracle only — repeated queries can narrow the lexicographic position of a party name on a
  document the caller is not allowed to open (G11 limits approver-only reads to PENDING_APPROVAL). Requires the target
  UUID (UUIDv7, not exposed to approver-only users), so practical impact is very low.

### Boundaries checked with no finding

- Authorization: `approvalSetting.list` (signed-in; counts only with `approval-setup:VIEW`), `approvalSetting.update`
  (EDIT + CSRF), `<doc>.submit` (ADD or EDIT + CSRF), `approve` / `reject` / `requestRevision` (`canApprove` + CSRF),
  `approval.summary` (filtered to `canApprove` types), `approval.pending` (raw-input type check before validation, then
  `canApprove` again), `<doc>.get` via `viewOrApprover` + `readForViewer` (approver-only denied unless live
  PENDING_APPROVAL; status/deletedAt present in every detail shape), photo GET via `photoReader` +
  `isPendingDocumentPhoto` (G14). No cross-type access: every SQL identifier comes from the fixed registry.
- SQL injection: all raw SQL uses `Prisma.sql` bound values; `Prisma.raw` only on registry constants; `q` is LIKE-escaped
  with `ESCAPE '\'`; cursor is size-limited, schema-validated and bound to sort/dir/q-hash.
- Input validation: `reason` / `note` trimmed 1–500, strict objects (no actor fields accepted); actor id/name come from
  context only. Notes are never logged (length only).
- Integrity: setting row `FOR SHARE` in create/update/submit/restore vs `FOR UPDATE` + same-statement waiting count in
  `update` (turn-OFF guard holds under READ COMMITTED); guarded version-bump header locks; reverse/re-apply under
  id-ordered `memo_stock` / `memo_out_line` / `purchase_order_line` `FOR UPDATE` with bucket checks and FK RESTRICT as
  final guard; CHECK constraints in the three master migrations are consistent with the code paths.
- Auth view `user_name`: own User.name only, appended column, existing grants preserved, no new privileges; used only
  for snapshots, normalised to ≤ 200 chars, never for authorization.
- Go-live `src/scripts/approve-pending.ts`: not imported by any HTTP module; `--apply` requires `GO_LIVE_ACTOR_ID`
  matching `^[A-Za-z0-9:_.@-]{1,64}$`; dry run rolled back. The 120 s dry-run lock window is documented in G12.
- Resource bounds: summary/waiting counts capped at 100 per type; pending page ≤ 50 under a 2.5 s READ_TX; no new
  pools, caches or background jobs.
- Limitations: static review only; no tests or database executed by the auditor. Design-accepted behaviours (creator
  may approve own document, `updatedByName` visible to all signed-in users, `usedBy` doc numbers in error details,
  auto-approved edits after turning ON) were not re-litigated.

## Proposed work

- Allowed code scope and assigned implementation role: backend — `backend-api-master/src/approval-setting/*`,
  `backend-api-master/src/approval/approval.service.ts`, and their tests.
- Suggested remediation:
  1. In `approvalSetting.update`, refuse `!isApprovalDocType(input.type)` with `validationException([{ path: "type",
     code: "not_available" }])` before opening the transaction (or narrow the update schema to `APPROVAL_DOC_TYPES`
     with the same field error), per G6. Add a unit/router test for the refusal.
  2. In `keyValues` (`party`), scope the subquery to the pending set:
     `WHERE k."id" = $id AND k."status" = 'PENDING_APPROVAL' AND k."deleted_at" IS NULL` (a cursor row that left the
     set then yields NULL → empty page, or map it to `VALIDATION_ERROR cursor`). Add a test with a non-pending cursor id.
- SA design / contract / flow / dependency change needed: none (both restore the approved G6/G11 intent).
- Acceptance criteria: unavailable types return `VALIDATION_ERROR` with field `type` and no row change; a party cursor
  naming a non-pending/deleted row cannot influence ordering; existing approval-setting and approval suites pass.
- Safe verification plan and prerequisites: backend unit + DB integration tests on the local test database.

## User selection and approval

- Approved ticket revision: 1
- Actual user instruction / approval evidence: owner reply "ต่อเลย" to "แก้ INV-20261111-002 ตามนี้" (see Owner decision)
- Approval date: 2026-11-12
- Separate approved SA bundle/revision, if required: none (internal locking, G6/G11 intent, docs wording)

Do not infer approval from creation of this ticket or approval of a different revision.

## Implementation and resolution

Apply [bounded remediation](../../workflow/remediation.md); counts persist across roles,
revisions, and sessions for the same cause. Do not allocate a fresh budget on handoff.

- Selected work ID / root-cause fingerprint:
- Corrective pass limit: 3 (initial fix included)
- Passes allocated: 1
- Active pass: none (pass 1 succeeded)
- User-authorized extension and new limit: none
- Stop reason / missing prerequisite: none
- Reopen evidence and explicit selection: none

| Pass | Owner(s) / input revision or hash | Causal hypothesis / new evidence | Meaningful change | Authorized verification / result / failure signature | Next fact or terminal decision |
|---|---|---|---|---|---|
| 1 | backend / HEAD e6da43b + working tree (2026-11-12) | Item 1: `update` never checked `available`; item 2: party cursor subquery unscoped | Refuse `!isApprovalDocType` (VALIDATION_ERROR type/not_available); party cursor row must be live PENDING_APPROVAL (pre-check -> VALIDATION_ERROR cursor; subquery scoped) | Unit UT-AS-B07b, UT-AP-B12/B12b; DB party-cursor check in approval.db.integration; full master suite 694 passed / 15 skipped | resolved |

- Assigned owner and start date: backend, 2026-11-12
- Changed files / implementation revision: see "Resolution (pass 1)" below (uncommitted working tree on `feat/10-11-26-approval-api`)
- Checks performed, results, and limitations: see "Resolution (pass 1)"
- Follow-up auditor and verification evidence: re-review decision belongs to the parent (no resend of unchanged code)
- Remaining risk or reopened validation gap: see "Resolution (pass 1)"
- Completion report under document/task/done/: [2026-11-12-inv-20261111-002-approval-backend-review.md](../done/2026-11-12-inv-20261111-002-approval-backend-review.md)
- Final status / date: resolved / 2026-11-12


## Part B — security-auditor (original title: INV-20261111-002 — Approval backend: auto-approved soft delete races a dependent approval (Memo Stock / PO balances), plus two hardening notes)

## Tracking

- Ticket revision: 1
- Status: resolved (pass 1, 2026-11-12)
- Owner: backend
- Priority: awaiting user review
- Auditor / mode / run ID: security-auditor / focused pre-handoff review / none (no full audit run)
- Date and audit scope: 2026-11-11 (review requested 2026-11-10); working-tree diff `git diff origin/dev -- backend-api-master backend-api-auth` plus untracked files under those two services (approval backend, ADR-0046 amended by ADR-0048, clarifications G1–G15)
- Source commit, dirty paths, and relevant content hashes: HEAD `e6da43b37a87208b6175611f021207ac0dca9ecc` with uncommitted changes (57 tracked files, 2569+/968−, plus untracked `approval-setting/`, `approval/`, `scripts/approve-pending.ts`, `trade-document/document-totals.ts`, three master migrations, one auth migration); sha256 of the tracked diff (first 16 hex) `f0da39f62c8f4e70`. The tracked diff grew by 9 lines while the review ran; line numbers below were re-read at the end of the review.
- Related ticket / root-cause fingerprint: `approval-auto-approved-soft-delete-no-dependent-lock`; related history INV-20261031-001 (pooled Reserve release), INV-20261031-002 (FK/FOR UPDATE deadlock)
- Category: F1 vulnerability (data-integrity race); H1, H2 hardening
- Verdict: F1 needs_validation; H1/H2 not-applicable
- Vulnerability severity: omitted (F1 not confirmed by reproduction)

## Evidence and impact

### F1 — Soft delete of an auto-approved Memo Out / Purchase Order does not lock against a concurrent dependent approval (needs_validation)

- Affected files and line numbers:
  - `backend-api-master/src/trade-document/document-engine.ts:417-429` — `delete()` locks only the header (`lockHeader`), runs `effects.usedBy` (plain read), then `effects.reverse`, then sets `deleted_at`. The soft delete does not touch the line rows, so no foreign-key or row lock conflicts with a document that names those lines.
  - `backend-api-master/src/trade-document/memo-out.service.ts` `memoOutUsedBy` — plain read of `memo_out_return_line`. No lock.
  - `backend-api-master/src/trade-document/memo-out-return.service.ts:84-91` — `prepare` checks the Memo Out header `status`/`deletedAt` with a plain snapshot read. `:236-241` `lockOutLines` locks only `memo_out_line` `FOR UPDATE`, not the `memo_out` header. `:265-` apply then calls `releaseToMemoStock`.
  - `backend-api-master/src/trade-document/memo-stock.service.ts:115-122` — `releaseToMemoStock` re-reads the item's pooled `reserved_*` under `FOR UPDATE` and passes when the pool still holds the quantity.
  - `backend-api-master/src/purchase/purchase-stock.ts:267,285` — `takeForPurchase` locks `purchase_order_line` with `FOR UPDATE OF l` only. The `deleted` / `status` check reads the `purchase_order` header without a lock. `purchase-order.service.ts:39` `purchaseOrderUsedBy` is a plain read.
- Attacker prerequisites and reachable entry point: two authorized users acting at the same time (or one user with two tabs) while the type's approval is OFF, or while an approver approves. Entry points are `memoOut.delete` (`memo-out:DELETE` + CSRF) concurrent with `memoOutReturn.create`/`update`/`approve`/`restore`, and `purchaseOrder.delete` concurrent with `purchase.create`/`update`/`approve`. No privilege bypass is needed. The risk is a concurrency window between authorized writes.
- Trace (Memo Out, READ COMMITTED, the default `WRITE_TX`):
  1. T1 `memoOut.delete(M)`: `lockHeader(M)` → `memoOutUsedBy(M)` = null → `releaseToMemoStock` locks item S, `reserved −= q`, `pending += q`.
  2. T2 `memoOutReturn.create` (OFF → auto-approve): `prepare` sees M as APPROVED and not deleted (T1 has not committed) → inserts a return line naming M's line (FK `KEY SHARE` on `memo_out_line`, no conflict) → `lockOutLines` (no conflict) → `releaseToMemoStock` waits for S.
  3. T1 sets `deleted_at` and commits. T2 gets S, re-reads `reserved`. If another live Memo Out or Reserve also holds quantity on S (the Reserve bucket is pooled, INV-20261031-001), the check passes and T2 applies `reserved −= q`, `pending += q` again and commits.
- Impact: the same stone quantity returns to `pending` twice. Memo Stock then shows availability that does not exist, and another Memo Out, Reserve, Memo Return or Purchase can take it. `memo_out_line.returned_*` of a deleted Memo Out is also incremented. `memo_stock_balance` does not catch this, because each bucket stays non-negative. The Purchase Order variant leaves a deleted auto-approved PO with `purchased_* > 0` and an approved Purchase naming it. A later restore to DRAFT then yields a PO whose lines cannot be edited (FK RESTRICT). That variant has a bounded impact.
- The edit (reapply) path is not affected: it deletes the line rows, so the FK or row lock serializes it with the dependent document. In the worst case PostgreSQL's deadlock detector aborts one transaction. The Memo Receive reversal is also safe: its `memo_stock` delete conflicts with the `KEY SHARE` lock of any new referencing line.
- Missing validation fact: there is no two-session DB reproduction yet. The window is short, a few milliseconds to the length of one write transaction. The double release also needs pooled Reserve quantity on the same item.

### H1 — Auth view `user_name` is readable for every session row, not only the caller's (hardening; privacy overlap → compliance-auditor)

- `backend-api-auth/prisma/migrations/20261107090000_current_authorization_user_name/migration.sql` appends `u."name" AS user_name` to `auth.current_authorization`. The view has no row filter. `gms_master_authz_reader` keeps `SELECT` on the whole view, so the reader credential can list the display names of all users who have a session row.
- `document/apps/backend/master/approve-center/authorization.md` (D5) says the reader "still cannot read … other users' names". At the database level, only the master query (`authz-database.ts` `WHERE user_id = … AND session_id = …`) enforces this. The same role could already read other users' ids, roles and permission arrays, so the extra exposure is display names only. Reaching it requires a compromised master process or DB credential. This is not an exploit by itself.
- Grants are preserved by `CREATE OR REPLACE VIEW` (verified: same column order, `security_barrier` kept, no new GRANT).

### H2 — Go-live dry run holds production row locks for up to 120 s (hardening, availability)

- `backend-api-master/src/scripts/approve-pending.ts:42,157-174`: the dry run approves every pending document inside one transaction (`DRY_RUN_TX` timeout 120 s). It takes `FOR UPDATE` locks on headers, `memo_stock` and `purchase_order_line` and keeps them until the final rollback. The header comment says "bounded so a lock is never held for long".
- While the dry run is in progress, normal writes that touch those rows wait up to `maxWait`/`timeout` (2 s / 4 s), then fail as 503 or timeout. On the 2 vCPU host, a large pending backlog makes this worse.
- Other checks on the command found nothing: it is not reachable over HTTP, it is not imported by `app.module`, `GO_LIVE_ACTOR_ID` is validated by `ACTOR_PATTERN`, identifiers come from the fixed registry, the SAVEPOINT strings are constants, and it pages 200 rows at a time.

## Proposed work

- Allowed code scope and assigned implementation role: backend (`backend-api-master/src/trade-document/**`, `src/purchase/purchase-stock.ts`, `src/scripts/approve-pending.ts`, tests). For H1, a decision by SA, compliance-auditor or the owner comes first.
- Suggested remediation:
  - F1: in each dependent apply, lock the source header and re-check it under that lock. In `lockOutLines`, join `memo_out` and lock `FOR SHARE OF d` together with `FOR UPDATE OF l` (or lock the distinct `memo_out` headers `FOR SHARE` first), then require `status = 'APPROVED' AND deleted_at IS NULL`. In `takeForPurchase`, use `FOR UPDATE OF l` plus `FOR SHARE OF d`. The header UPDATE in `delete()` then serializes with these locks, and the dependent re-check or `usedBy` sees the committed state. Alternative: lock the Memo Out lines (`SELECT … FOR UPDATE` on `memo_out_line` / `purchase_order_line` of the document) in `delete()` before `usedBy`. Keep the documented lock order consistent: own header → source header → lines → memo_stock → purchase_order_line.
  - H1: either accept this and correct the D5 wording, or expose names through a filtered path (for example a `security_barrier` view or function keyed by session id) so the reader role cannot select all rows.
  - H2: run the dry run only in a maintenance window or with writes paused (document this in the runbook), or reduce the timeout and run it per type or per page.
- SA design / contract / flow / dependency change needed: F1 none (internal locking only; lock-order note in the approval-setup architecture). H1 needs an SA/ADR-0046 D5 decision. H2 none (runbook note only).
- Acceptance criteria: a two-session DB integration test in which `memoOut.delete` and an auto-approving `memoOutReturn.create` naming the same lines overlap (with pooled Reserve on the item) ends with exactly one of them committed, or with the return refused, and `memo_stock` pending/reserved equal to a serial execution. The equivalent test for `purchaseOrder.delete` against `purchase.create` must leave no approved Purchase referencing a deleted PO.
- Safe verification plan and prerequisites: run against the local test database only (existing `*.db.integration.test.ts` harness), with two Prisma transactions coordinated by an advisory lock or barrier. No live services.

## User selection and approval

- Approved ticket revision: 1
- Actual user instruction / approval evidence: owner reply "ต่อเลย" to "แก้ INV-20261111-002 ตามนี้" (see Owner decision)
- Approval date: 2026-11-12
- Separate approved SA bundle/revision, if required: none (internal locking, G6/G11 intent, docs wording)

Do not infer approval from creation of this ticket or approval of a different revision.

## Implementation and resolution

Apply [bounded remediation](../../workflow/remediation.md); counts persist across roles,
revisions, and sessions for the same cause. Do not allocate a fresh budget on handoff.

- Selected work ID / root-cause fingerprint: approval-auto-approved-soft-delete-no-dependent-lock
- Corrective pass limit: 3 (initial fix included)
- Passes allocated: 1
- Active pass: none (pass 1 succeeded)
- User-authorized extension and new limit: none
- Stop reason / missing prerequisite: none
- Reopen evidence and explicit selection: none

| Pass | Owner(s) / input revision or hash | Causal hypothesis / new evidence | Meaningful change | Authorized verification / result / failure signature | Next fact or terminal decision |
|---|---|---|---|---|---|
| 1 | backend / HEAD e6da43b + working tree (2026-11-12) | F1 reproduced with two sessions (pre-fix: MOR commits alongside the Memo Out delete = double release; approved Purchase on a deleted PO). H2: one 120 s dry-run transaction | Dependent locks source headers FOR SHARE (`lockSourceHeaders`) before prepare/line writes and in `apply`, re-checks live; dry run one rolled-back transaction per document | IT-AS-B15 fails without FOR SHARE, passes with it (5/5 repeats); UT-AS-B15, UT-AS-B12b, IT-AS-B12; full master 694/15, auth 107/6, tsc, eslint | resolved |

- Assigned owner and start date: backend, 2026-11-12
- Changed files / implementation revision: see "Resolution (pass 1)" below (uncommitted working tree on `feat/10-11-26-approval-api`)
- Checks performed, results, and limitations: see "Resolution (pass 1)"
- Follow-up auditor and verification evidence: re-review decision belongs to the parent (no resend of unchanged code)
- Remaining risk or reopened validation gap: see "Resolution (pass 1)"
- Completion report under document/task/done/: [2026-11-12-inv-20261111-002-approval-backend-review.md](../done/2026-11-12-inv-20261111-002-approval-backend-review.md)
- Final status / date: resolved / 2026-11-12

## Resolution (pass 1)

Owner backend, 2026-11-12, corrective pass 1 of 3 (both fingerprints). All five items verified; status `resolved`.
Done report: [2026-11-12-inv-20261111-002-approval-backend-review.md](../done/2026-11-12-inv-20261111-002-approval-backend-review.md).

### Changes

- **F1**: new `backend-api-master/src/trade-document/source-lock.ts` `lockSourceHeaders(tx, "memoOut" | "purchaseOrder", lineIds)`
  maps the source lines to their headers (plain primary-key read) and locks the distinct headers `FOR SHARE` in id order,
  returning `live` (APPROVED and not deleted) as read under the lock. The engine (`document-engine.ts`) gains the
  `lockSources` hook, called in `create` and `update` whenever the Save applies effects, before `prepare`, line writes and
  the old effects' reversal. Memo Out Return (`memo-out-return.service.ts`) uses it in `lockSources` and again at the start
  of `apply` (approve, restore, go-live) and refuses a source that is no longer live with
  `MEMO_OUT_RETURN_REFERENCE_INVALID` (`lines.N.memoOutLineId`). Purchase (`purchase.service.ts` `lockSources`,
  `purchase-stock.ts` `takeForPurchase`) locks the PO headers before memo_stock; the existing PO-line read then re-checks
  APPROVED / not deleted against committed state. The source's soft delete or edit already locks its own header first
  (the guarded version bump takes `FOR NO KEY UPDATE`, which conflicts with `FOR SHARE`) before `usedBy`; this is now
  documented on `delete()`.
  Lock order (approval-setup architecture item 5): setting → dependent header → source header(s) `FOR SHARE` (id order)
  → memo_out_line → memo_stock → purchase_order_line. No cycle is introduced: the dependent takes the source header before
  any line insert (FK `KEY SHARE`) or line/stock lock, and the source writer holds nothing the dependent needs before
  the header.
  Other pairs checked: Memo Out, Reserve, Memo Return and Purchase STOCK lines against Memo Receive's `memo_stock` are
  guarded by the `memo_stock` `FOR UPDATE` locks (the Memo Receive reversal locks and checks the rows, then deletes them
  under the RESTRICT key). Purchase and Reserve have no dependents. Quotation has no effects.
- **Item 1**: `approval-setting.service.ts` `update` refuses `!isApprovalDocType(type)` with `VALIDATION_ERROR`
  `[{path: "type", code: "not_available"}]` before any read or write (G6).
- **Item 2**: in `approval.service.ts`, for `sort=party` with a cursor, `pending` first checks that the cursor id is a
  live PENDING_APPROVAL row of the type (one primary-key read in the same READ_TX). Any other row returns
  `VALIDATION_ERROR cursor` and the client resets paging. The key subquery is also scoped to
  `status = 'PENDING_APPROVAL' AND deleted_at IS NULL`.
- **H2**: `scripts/approve-pending.ts` dry run now tries each document in its own transaction (`APPLY_TX`, 4 s) that is
  rolled back at once. Pages are read outside any transaction. `DRY_RUN_TX` (120 s) and the savepoints are removed. Each
  document is predicted against the pre-run state. The header comment, G12 and a report note say that competing
  documents may show WOULD_APPROVE and still be deleted by `--apply`.
- **H1**: docs only. ADR-0046 item 7, approve-center `decisions.md` D5 and `authorization.md` now state that the reader
  role can read the display names of all users with a session row (as it already reads their ids and grants), that master
  queries only its caller's row, and that the risk was accepted on 2026-11-12.

### Tests and evidence

- New `test/approval-setting/approval-source-lock.db.integration.test.ts` (IT-AS-B15): the two sessions under test plus a
  third session that holds a lock.
  - Memo Out Return: the holder locks the memo_stock row, `memoOut.delete` waits inside its reversal, and then the
    auto-approving Memo Out Return starts.
  - Purchase Order: a test-only trigger on that PO's lines waits on an advisory lock after the purchase's PO check, and
    then `purchaseOrder.delete` starts.
  - **Before the fix** (and again with only `FOR SHARE` removed), both tests fail. The return committed alongside the
    delete (`{ ok: true }` instead of REFERENCE_INVALID, which is the double release), and an approved Purchase named a
    deleted PO.
  - **After the fix**, both pass. The Memo Out Return is refused and the buckets are pending 7 / reserved 3, the same as
    serial execution. The PO delete is refused with `PURCHASE_ORDER_IN_USE` and the PO line shows purchased 2. Five
    repeat runs were green.
- New `test/trade-document/source-lock.test.ts` (UT-AS-B15). Updated tests:
  - `approval-setting.service.test.ts` (UT-AS-B07b)
  - `approval.service.test.ts` (UT-AP-B12 SQL and UT-AP-B12b)
  - `approval.db.integration.test.ts`: a party cursor naming a sent-back or unknown row returns the cursor error; a live
    row still pages.
  - `purchase-stock.test.ts`: the header lock comes first.
  - `approve-pending.test.ts` (UT-AS-B12b): one rolled-back transaction per document.
  - `approve-pending.db.integration.test.ts`: the Reserve is now WOULD_APPROVE in the dry run and DELETED by apply.
- Test database: disposable `postgres:18.6-alpine` (`it-pg`, 127.0.0.1:55439) with master and auth migrated and the
  reader role provisioned; removed afterwards.
  - Master full suite: **694 passed / 15 skipped** (71 files).
  - Auth suite: **107 passed / 6 skipped**.
  - `tsc --noEmit` and `eslint src "test/**/*.ts"` are clean.
  - `f1-system-api-master-1` was restarted and is healthy. No volumes were changed.

### Remaining risk

- The dry run no longer models stock taken by earlier documents of the same run. This trade-off is accepted and
  documented.
- A deadlock window that existed before this fix is unchanged: a source *edit* (line replacement) that overlaps a
  dependent document can still end with PostgreSQL's deadlock detector aborting one of the two transactions, with no
  data change.
- H1 is accepted as a risk; the code is unchanged.
