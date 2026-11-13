# INV-20261113-001 — INV fixes review (sec-auditor + security-auditor, same revision): report timeout surfaces as an unmapped 500 (Part A); Stock ID year-boundary duplicate across Memo Receive and Purchase (Part B)

> Parent note (2026-11-13): both reviewers wrote this id in parallel; sec-auditor's write replaced security-auditor's first version. Part A is sec-auditor's finding (below as written). Part B restores security-auditor's finding from its hand-back report. One ticket, one revision, one ledger per part.

## Tracking

- Ticket revision: 1
- Status: pending-review (Part A open, owner to handle later; Part B resolved by design 2026-11-13, ADR-0051)
- Owner: backend
- Priority: awaiting user review
- Auditor / mode / run ID: sec-auditor / focused pre-handoff review (guidance mode, read-only) / no run ID
- Date and audit scope: 2026-11-13; `git diff HEAD` plus untracked files on branch `fix/12-11-26-inv` covering the pass-1 fixes of INV-20261029-002, INV-20261031-002, INV-20261029-004 and INV-20261110-001
- Source commit, dirty paths, and relevant content hashes: base `2126ec01`; uncommitted diff of `backend-api-master/src`, `backend-api-auth/src`, `pnpm-lock.yaml`, `pnpm-workspace.yaml` (sha256 of that diff `2794dd7217869ab564a6fce758a87ce98e959a592c9ac26862c0149cba489226`); untracked `json-body.ts` + both 20261113 migrations sha256 `7615de203a1090c5ca1320a65e63f4bac29c2da9f22432113e7245cbd18a586b`
- Related ticket / root-cause fingerprint: INV-20261029-004 (its Resolution pass 1 states a slow report "fails fast as `DEPENDENCY_UNAVAILABLE`"); INV-20261026-002 (prior needs_validation note that the master tRPC `errorFormatter` echoes `error.message` for unmapped errors). Fingerprint: `memo-outstanding.reportRead → P2010(57014) → documentErrors.map passthrough → tRPC errorFormatter domainCode=error.message`
- Category: hardening
- Verdict: not-applicable

## Evidence and impact

- Affected files and line numbers:
  - `backend-api-master/src/trade-document/memo-outstanding.service.ts:57-66` (`reportRead`, `SET LOCAL statement_timeout = 2000`) and the catch blocks at about :326, :374, :458, :507 and the purchase equivalents (`memoReceiveErrors.map` / `memoOutErrors.map`).
  - `backend-api-master/src/trade-document/document-errors.ts` `map`: maps P2002, P2003 and `isPrismaUnavailable`; anything else is returned unchanged.
  - `backend-api-master/src/common/persistence.ts:18` `UNAVAILABLE_CODES = P1001, P1002, P1008, P1017, P2024, P2028`; `isPoolTimeout` regex matches only pool/connection/transaction-expiry messages.
  - `backend-api-master/src/master/router.ts:93-108` `errorFormatter`: for a non-`HttpException` cause, `domainCode = error.message`; `trpc-handler.ts` has no `onError` sanitizer.
- Attacker prerequisites and reachable entry point: an authenticated user with the Memo Outstanding / From Customer / Purchase Outstanding report grant; a summary or list call whose statement exceeds 2 s (large history, contention, or a broad filter). Not a privilege boundary bypass.
- Concrete trust boundary and source-to-sink trace (static): PostgreSQL cancels the statement with SQLSTATE `57014` → `@prisma/adapter-pg` 7.10.0 `convertDriverError` has no case for `57014` and returns kind `postgres` → Prisma client raw-query path raises `PrismaClientKnownRequestError` `P2010` "Raw query failed. Code: `57014`. Message: `canceling statement due to statement timeout`" → `documentErrors.map` does not recognise P2010 and the message does not match `isPoolTimeout` → the error is rethrown unchanged → tRPC 11.19 `getTRPCErrorFromUnknown` wraps it as `INTERNAL_SERVER_ERROR` with `message = cause.message` → `errorFormatter` puts that message in both `shape.message` and `data.domainCode` → returned to the browser.
- Observed impact and independent verification evidence:
  1. Contract/behaviour gap in the INV-20261029-004 fix: the timeout yields `500 INTERNAL_SERVER_ERROR`, not the `503 PARTNER_UNAVAILABLE` ("DEPENDENCY_UNAVAILABLE") stated in the ticket resolution and service comment; the frontend cannot distinguish "report too slow, retry" from a server bug, and `partner.unhandled_error`-style alerting is not raised with a `db_unavailable` event.
  2. Information exposure (low): the raw Prisma/PostgreSQL error string becomes the client-visible `domainCode`/message. The 57014 text itself contains no SQL or data, but it confirms backend/driver internals and the unsanitised path is now reachable on demand by anyone who can make a report slow.
  - The new unit test `memo-outstanding.service.test.ts` only asserts that `SET LOCAL statement_timeout` is issued; no test exercises the timeout error mapping.
- Missing validation fact / capability (if any): not executed against a database (read-only review; no target code execution). Confirm with an integration test that sets a tiny timeout (or `pg_sleep`) and asserts the tRPC response code/body.
- Sanitized evidence sufficient for owner review: yes (trace above; no payloads or data).
- Raw report/run links: none (focused review, no run tree).

## Proposed work

- Allowed code scope and assigned implementation role: backend; `backend-api-master/src/trade-document/memo-outstanding.service.ts`, `document-errors.ts` and/or `common/persistence.ts`, plus tests.
- Suggested remediation: in `reportRead` (or the shared mapper) treat a P2010 whose driver code is `57014` (query_canceled / statement timeout) as unavailable and return `503 PARTNER_UNAVAILABLE` with a `*.db_unavailable` / `*.report_timeout` log event; optionally (separate, general hardening already noted in INV-20261026-002) make the tRPC `errorFormatter` return a fixed `INTERNAL_SERVER_ERROR` code/message for non-`HttpException` causes.
- SA design / contract / flow / dependency change needed: no; this realises the behaviour the approved INV-20261029-004 resolution already states.
- Acceptance criteria: a report statement exceeding the timeout returns `503 PARTNER_UNAVAILABLE` with no Prisma/PostgreSQL text in the response; an automated test covers the mapping; existing IT-MOV / IT-MOC / IT-POS suites still pass.
- Safe verification plan and prerequisites: local test database only; unit test with a mocked P2010/57014 error plus one DB integration test using a lowered `statement_timeout`.

## User selection and approval

- Approved ticket revision:
- Actual user instruction / approval evidence:
- Approval date:
- Separate approved SA bundle/revision, if required:

Do not infer approval from creation of this ticket or approval of a different revision.

## Implementation and resolution

Apply [bounded remediation](../../workflow/remediation.md); counts persist across roles,
revisions, and sessions for the same cause. Do not allocate a fresh budget on handoff.
If the parent treats this as a defect of the INV-20261029-004 fix, the passes count against
that ticket's existing ledger rather than a new budget.

- Selected work ID / root-cause fingerprint:
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

## Review notes (sec-auditor, same revision; no separate tickets)

Checked and found no actionable issue:

- Lock modes (INV-20261031-002): `FOR NO KEY UPDATE` on `memo_stock`, `memo_out_line`, `purchase_order_line` still self-conflicts, so concurrent approvals/reversals of the same rows serialise as before; it conflicts with the `FOR UPDATE` taken by row deletes and by `memo-receive.service.ts:204`, and the subsequent UPDATEs touch only non-key columns (PostgreSQL would take `NO KEY UPDATE` for them anyway). Only FK `KEY SHARE` checks of draft-line inserts stop waiting; quantities are still re-checked under the lock at approval. No integrity regression found.
- Stock ID issuing (INV-20261029-002): one parameterised `INSERT … ON CONFLICT` with prior-year floor under `FOR SHARE`; arithmetic stays within int4 and VARCHAR(10) at `STOCK_NO_MAX = 2,000,000,000`; unique indexes on `memo_stock.stock_id` / `memo_receive_line.stock_id` remain the backstop. Residual (not ticketed): at the New-Year boundary a save that computed the old year before midnight can, if the old year has already carried into the next prefix and the new year issued first, collide; the unique index rejects it (P2002 → `*_CHANGED` 409, client retry), so no duplicate is stored. Cursor regexes `\d{6,10}` are bounded.
- Report SQL (INV-20261029-004): all predicates/sorts are `Prisma.sql` parameters or whitelisted fragments; `$executeRawUnsafe` interpolates only a numeric constant; `SET LOCAL` is scoped to the `READ_TX` transaction (2.5 s, RepeatableRead).
- body-parser (INV-20261110-001): the lockfile contains a single `body-parser@2.4.0` (express 5.2.1 now resolves it), `qs@6.17.1` added as its dependency, `eslint-plugin-import` snapshot key normalisation only (no version change); `backend-api-gateway`/`backend-api-partner` have no package manifests; every Dockerfile copies `pnpm-workspace.yaml` and runs `pnpm install --frozen-lockfile`, so the override applies to all built runtimes. `authJsonBody()` keeps `limit: "32kb"` (enforced on the inflated body) with default inflate, identical to the previous config. Limit: the advisory ID and 2.4.0 integrity hash were not verified against the registry (offline review).
- Migrations: CHECK replacements and the new partial index/statistics need only table ownership (migration role). `CREATE INDEX` (non-concurrent, inside the Prisma migration transaction) blocks `memo_stock` writes for the build duration; acceptable at current table sizes, worth scheduling outside business hours if `memo_stock` grows large.

## Part B — security-auditor: Stock ID race at the year boundary can duplicate an ID across tables

- Reviewer / mode: security-auditor, focused read-only review, 2026-11-13. Revision: base `2126ec01` plus the uncommitted `fix/12-11-26-inv` tree (diff sha256 `2794dd72…a9226`; `json-body.ts` plus the `20261113090000` migration `a30fc620…c964f`).
- Category: vulnerability (data integrity). Verdict: needs_validation. Severity: none assigned. Owner: backend.
- Related: INV-20261029-002 (pass 1 carry-over rule). Its "Remaining risk" note says the unique indexes always refuse a duplicate; that is wrong for the Memo Receive / Purchase pair.

### Evidence and impact

- `backend-api-master/src/trade-document/memo-receive.service.ts:73-87` `issueStockIds`: for year Y, the start number comes only from counter rows with `year < Y`. Both callers read the clock before the statement and may then wait on locks (`memo-receive.service.ts:128`, `purchase/purchase.service.ts:60`).
- Trace, with year 26 already past 9,999 at 270005:
  1. A year-27 save issues 270006 and commits.
  2. A save that read the clock just before Bangkok midnight (year 26) was waiting on a lock. It then updates the year-26 row and also issues 270006.
- Same document type: the unique index refuses it (`memo_receive_line_stock_id_key` / `memo_stock_stock_id_key`, migration `20261029090000:162,168`; `purchase_line_issued_stock_id_key`, `20261104150000:159`).
- Memo Receive vs Purchase: they share the counter, but no constraint spans both tables, so both saves can commit the same Stock ID.
- Before the carry-over rule, years could not overlap, so this path is new.
- Likelihood: low. It needs a year past 9,999 numbers and saves straddling Bangkok New Year's midnight.
- Static only. Reproduction plan: disposable PostgreSQL with an injected stale clock. Commit a year-(Y+1) save of one type, then run a year-Y save of the other type, and check for a duplicate.

### Proposed work (owner to choose)

- Serialize issuance behind one fixed lock (a single counter row or an advisory lock) and compute the start from all years, not only earlier ones.
- Or refuse and retry when a counter row for a later year already exists.
- And/or add a cross-table uniqueness guarantee for issued Stock IDs. That is a schema change outside the approved design, so it needs SA approval.
- Acceptance: a two-session test with a stale-year save of the other document type never produces a duplicate Stock ID.
- Note: sec-auditor (Part A record, review notes) saw the same edge for the same-type case and judged the unique index enough; the cross-table case is what makes it a finding.

### Resolution (2026-11-13, by design: ADR-0051)

- [ADR-0051](../../adr/0051-purchase-lines-without-stock-id.md) (Accepted by the owner 2026-11-13) removes Purchase as a caller of `issueStockIds`: MANUAL / PURCHASE_ORDER purchase lines store no Stock ID, STOCK lines copy the Memo Stock item's existing id. Memo Receive is again the only user of `memo_stock_id_counter`, so the cross-table Memo Receive / Purchase duplicate cannot occur. The same-type case stays refused by `memo_receive_line_stock_id_key` / `memo_stock_stock_id_key`.
- The proposed single issuing lock is not needed and was not built. A future Load to Stock design that issues from the same counter must re-check this edge in its own ADR.
- Implementation (backend, branch `fix/12-11-26-inv`, uncommitted): `purchase.service.ts` line hook no longer issues; `issueStockIds` lost its `exhausted` parameter; `PURCHASE_STOCK_ID_EXHAUSTED` removed; migration `20261113110000_purchase_line_stock_id_nullable` (nullable `stock_id`, existing MANUAL / PO ids cleared, CHECK `purchase_line_stock_id_source_check`, `purchase_line_issued_stock_id_key` dropped).
- Verification: IT-PU-B09 (Purchase does not move the counter; Memo Receive 769999 → 770000 around a MANUAL / PO purchase), IT-PU-B10 (migration replay), IT-PU-B11; full backend-api-master suite on disposable PostgreSQL 727 passed / 15 skipped; backend-api-auth 111 passed / 6 skipped. No corrective pass consumed (design change, not a fix attempt). Part A remains open.
