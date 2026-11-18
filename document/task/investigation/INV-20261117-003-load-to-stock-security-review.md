# INV-20261117-003 — Load to Stock focused security review (security-auditor)

## Tracking

- Ticket revision: 1
- Status: resolved
- Owner: backend (F1, F2)
- Priority: awaiting user review
- Auditor / mode / run ID: security-auditor / focused technical review (read-only) / no run tree
- Date and audit scope: 2026-11-17; feature load-to-stock (ADR-0052, SA bundle
  `document/apps/backend/inventory/load-to-stock/`, infra `document/infra/services/backend-api-inventory/1/security.md`):
  `backend-api-inventory/src/**`, `backend-api-master/src/inventory-internal/**`, master diffs (service-token guard,
  purchase `usedBy`, Stock ID issuing, numbering, approval types), master migration `20261117090000_load_to_stock_allocation`
  and rollback, inventory migration/roles SQL, auth license-caller diff and authz-reader SQL, `docker/nginx/gms-dev.conf`,
  `frontend/src/lib/inventory-client.ts`, `frontend/src/features/load-to-stock/**`
- Source commit, dirty paths, and relevant content hashes: HEAD `4254526` on `feat/17-11-26-load` plus the uncommitted
  working tree (64 modified tracked files + untracked `backend-api-inventory/`, `backend-api-master/src/inventory-internal/`,
  new migrations/roles SQL, frontend load-to-stock/inventory files). SHA-256 prefixes: `app.ts` 68ca4740d9d3ff07,
  `photos.ts` 444929592adf844e, `service.ts` ea22ab043b7542d7, `stock.ts` a5ad2c783e53c3ac, `saga.ts` ecc24b91496483df,
  master `allocation.ts` c95528e694f278a6
- Related ticket / root-cause fingerprint: INV-20261117-001 (hono versions; satisfied: hono 4.13.18, @hono/node-server
  2.1.7 locked). INV-20261117-002 is sec-auditor's parallel record and is not touched here.
- Category: F1 vulnerability; F2 hardening
- Verdict: F1 needs_validation; F2 not-applicable
- Vulnerability severity: none assigned (no confirmed vulnerability)

## Evidence and impact

### F1 — Photo upload parses the multipart body before the concurrency limiter (memory exhaustion, needs_validation)

- Affected files and line numbers: `backend-api-inventory/src/app.ts:108-116` (`await c.req.formData()` at line 113);
  `backend-api-inventory/src/modules/load-to-stock/photos.ts:62-79` (`writes.run(...)` limiter at line 65, second copy
  `new Uint8Array(await file.arrayBuffer())` at line 66).
- Attacker prerequisites and reachable entry point: an authenticated, licensed user with `load-to-stock:ADD` or `:EDIT`
  (or Super Admin) and a trusted Origin (CSRF check passes from the app itself). Entry `POST /api/inventory/v1/load-to-stock/photos`
  via nginx `location ^~ /api/inventory/v1/load-to-stock/photos` (`client_max_body_size 6m`, no `limit_conn`/`limit_req`).
- Trust boundary and trace: request body (≤ 5 MiB + 64 KiB, `bodyLimit` in `app.ts:81-82`) → `c.req.formData()` buffers
  the whole multipart body per request with no concurrency bound → only afterwards `photos.upload` enters
  `Limiter(3)`, which then copies the file again into a `Uint8Array`. The 3-slot limiter therefore bounds disk writes,
  not request buffering; N parallel uploads hold ≈ N × 5 MiB (plus the parser's own copy) of external memory.
- Observed impact: production limits for the container are 256 MiB with `--max-old-space-size=160`
  (`document/infra/services/backend-api-inventory/1/security.md:34`). Some tens of concurrent 5 MiB uploads by one
  permitted user could push RSS past the container limit and OOM-kill the only inventory process (all Load to Stock
  users, SSE streams, and in-flight saga drives are interrupted; saga recovers by lease/sweep). This is an availability
  impact only; no data exposure.
- Missing validation fact: real per-request RSS for a 5 MiB multipart upload on the built image and the concurrency at
  which the 256 MiB limit is reached (infra notes RSS is not measured, security.md:89). Not executed here (no target
  code was run; read-only review).
- Sanitized evidence: code trace above; no payloads stored.

### F2 — Applied edit/delete does not re-assert "stock not in use" in the apply transaction (hardening)

- Affected files and line numbers: `backend-api-inventory/src/modules/load-to-stock/service.ts:282-288` and `:400-403`
  (in-use check in tx0 under `FOR UPDATE`), `service.ts:162-183` (`applyOp` tx1 calls `lockLoadStocks` but ignores
  `inUse`), `backend-api-inventory/src/modules/stock/stock.ts:57-69` and `:75-111` (reverse / overwrite set
  `on_hand_* = pcs` and zero the stock).
- Observation: between tx0 (check) and tx1 (apply, after the master HTTP call, possibly a later sweep/re-drive) the
  stock row locks are released. In this revision no code path moves quantity out of `on_hand` (no reserve / memo-out /
  sale / hold writer exists in `backend-api-inventory/src`), so the gap is not reachable now and the CHECK
  `stock_pcs_balance_check` would make a conflicting tx1 fail rather than corrupt data. When later modules (merge-split,
  transfer, phase-2 holds) start using load stock, a consumer that ignores the load's `sync_state = 'SYNCING'` could
  take stock that the pending apply then reverses or rewrites, or leave the op failing repeatedly in tx1 after master
  already applied the allocation.
- Not an exploit in this revision; recorded so the invariant is explicit before the first stock consumer ships.

### Checked with no actionable finding

- Per-endpoint grants (`app.ts`): VIEW on list/detail/options/vendors/search/photo read; ADD on create and next-number;
  EDIT on update; ADD|EDIT on submit and photo upload/copy; DELETE on delete; APPROVE+VIEW on approve / revise / reject /
  pending; `approval-setup:EDIT` on setting update, counts only with `approval-setup:VIEW`; summary filtered by
  `canApprove`. Document access is menu-level by design (no per-owner rows); self-approval is allowed by Q-AS-31.
  Auth chain: cookie → EdDSA JWT (issuer/audience/kid regex, bounded JWKS, unknown-kid refresh throttle) → live
  `auth.current_authorization` row → license (fail closed) → CSRF (trusted Origin or same-origin Fetch Metadata).
- State machine: guarded single-statement updates on `id + version + status + deleted_at IS NULL + sync_state = 'IDLE'`
  for update / submit / approve / revise / reject / delete; Pending and reviewed-Approved/Rejected are not editable;
  revise limit enforced in SQL (`revision_count = 0`); submit refused while approval is OFF; OFF refused while documents
  wait (setting row FOR UPDATE vs FOR SHARE in document transactions).
- Concurrency: two approves of one load → one wins on version/sync_state; two loads on one PU line → master locks lines
  `FOR UPDATE` and re-checks `loaded ≤ qty` with the old allocation (`allocation.ts:120-188`); same-load PUTs serialize
  on the `load_allocation` row (upsert lock); same revision replays require the same hash, lower revision → STALE;
  sweep/re-drive claim a 15 s lease (master call ≤ 5 s), and `DONE` is set by a guarded update so only one tx1 applies.
- Master internal API: `/internal/v1/inventory/*` uses its own token guard (SHA-256 digest, constant-time, refuses if
  equal to the partner token); the global partner guard skips only these routes; no global prefix; nginx returns 404 for
  `/internal` and `/internal/`; master port not published. `files/:id/content` serves only ready Purchase line photos of
  approved, live Purchases.
- `PURCHASE_IN_USE`: `purchaseUsedByLoad` runs in update/delete after the header `FOR NO KEY UPDATE`, which conflicts with
  the allocation's Purchase `FOR SHARE`; reviewed-approved Purchases are not editable at all; DB CHECK and the
  `ON DELETE RESTRICT` FK from `load_allocation_line` are backstops.
- Stock ID: fixed `pg_advisory_xact_lock` before the clock read, taken last by both callers (Memo Receive, allocation);
  unique Stock ID indexes remain the backstop.
- Migrations: master migration is expand-only except deleting three `approval_setting` rows; no FK references
  `approval_setting`, and the inventory table seeds them ON (the safer default; any prior OFF choice in master is not
  carried over — a product note, not a security issue). Rollback refuses while allocation lines exist. Inventory app
  role: DML on schema `inventory` only, `stock_movement` UPDATE/DELETE/TRUNCATE revoked, `_prisma_migrations` revoked;
  authz reader: SELECT on two auth views only, refuses if PUBLIC holds auth data privileges.
- Photos: type sniffed from bytes (JPEG/PNG), stored type served with `nosniff`, storage prefix allow-list, path from
  DB key only; read limited to `load-to-stock:VIEW` (same audience as the documents).
- SSE / notifications: hub pushes only `{id,type,documentType}` to the recipient user ids written in the same
  transaction; actor excluded; "all" scope only with `load-to-stock:VIEW`; mark-read scoped to the caller's user id;
  stream ends before access-token expiry; cross-site Fetch Metadata refused.
- Errors: fixed message per code, generic 500, DB/master faults mapped to 503 without internals; master 401/403 mapped
  to 500 and logged.
- SQL: all raw SQL parameterized; `Prisma.raw` only from fixed maps; LIKE patterns escaped.
- Frontend: same-origin fetch with cookie only, relative-path guard, Zod-checked responses, `encodeURIComponent` on ids,
  no HTML sinks.

## Proposed work

- Allowed code scope and assigned implementation role: backend, `backend-api-inventory/src/app.ts`,
  `backend-api-inventory/src/modules/load-to-stock/photos.ts`, `service.ts`/`stock.ts` (F2 only), with tests under
  `backend-api-inventory/test/`. Nginx `limit_conn` for the photo location would be an infra change (separate selection).
- Suggested remediation:
  - F1: acquire the upload slot before reading the body (e.g. a middleware on `/load-to-stock/photos` that takes a
    `Limiter` slot or refuses 429 before `formData()`), and avoid the second full copy (stream to storage or reuse the
    parsed bytes); optionally a small per-user upload rate. Measure RSS with concurrent 5 MiB uploads.
  - F2: in `applyOp` for `UPDATE`/`DELETE`, keep the `lockLoadStocks` result and refuse/hold if `inUse` is non-empty, and
    document that every future stock consumer must refuse stock of a load whose `sync_state = 'SYNCING'`.
- SA design / contract / flow / dependency change needed: none for F1. F2's "consumers must honor SYNCING" rule should be
  added to the stock-component contract when the first consumer is designed (SA review at that time).
- Acceptance criteria: F1 — with the container limits, ≥ 50 concurrent 5 MiB uploads are refused (429) or served
  without exceeding the memory limit; existing photo tests pass. F2 — a test where stock becomes in use between tx0 and
  tx1 leaves the stock untouched and the op in a defined, recoverable state.
- Safe verification plan and prerequisites: local dev stack only (no live services), production-equivalent memory
  limits, synthetic JPEG bytes.

## User selection and approval

- Approved ticket revision:
- Actual user instruction / approval evidence:
- Approval date:
- Separate approved SA bundle/revision, if required:

Do not infer approval from creation of this ticket or approval of a different revision.

## Implementation and resolution

Apply [bounded remediation](../../workflow/remediation.md); counts persist across roles, revisions, and sessions for
the same cause. Do not allocate a fresh budget on handoff.

- Selected work ID / root-cause fingerprint: F1 `inventory-photo-upload-unbounded-buffering`; F2 `load-apply-inuse-recheck`
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
- Checks performed, results, and limitations: review was static; no tests or target code were executed.
- Follow-up auditor and verification evidence:
- Remaining risk or reopened validation gap: F1 memory threshold unmeasured; DB-level PUBLIC grants on other schemas in
  the shared database were not inspected live.
- Completion report under document/task/done/:
- Final status / date:

### Resolution (backend, corrective pass 1 of 3, 2026-11-17)

- Authorization: owner 2026-11-17 "แก้ F1 F2" (direct fix instruction, relayed by the parent).
- F1: upload slot acquired before the multipart body is parsed (`backend-api-inventory/src/app.ts`), 429 `RATE_LIMITED` when 3 uploads/copies are in flight, released on all paths; the file is streamed into storage without a second full copy (`src/modules/load-to-stock/photos.ts` `uploadHeld`). Contract/error docs updated.
- F2: "stock not in use" re-checked under the stock locks inside the apply transaction for applied edit/delete (`src/modules/load-to-stock/service.ts` `lockUnused`, `src/platform/sync/saga.ts` `SyncHold`): 409 `LOAD_TO_STOCK_IN_USE`, nothing reversed/overwritten, op parked STUCK (`in_use`) with the load SYNCING until `sync:redrive`; consumer rule SA-LS-18 in `decisions.md`.
- Verification: `backend-api-inventory` vitest 45/45 on a fresh disposable PostgreSQL with provisioned roles (new cases "INV-20261117-003 F1" and "F2"), tsc + ESLint clean. Evidence: `document/apps/backend/inventory/load-to-stock/testing.md` "Corrective pass 1".
- Remaining: F1 memory threshold under the 256 MiB container limit not measured on the production host (bounded by design: ≤ 3 bodies of ≤ 5.06 MiB); changed code not re-reviewed by the auditors (parent decides).
