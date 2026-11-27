# INV-20261124-001 — Stock Adjustment inventory suite verification blocker

## Tracking

- Ticket revision: 1
- Status: needs-validation
- Category: integration-blocker
- Owner: backend
- Date, source commit and relevant dirty paths: 2026-11-24; base `9357bcc`; dirty feature source under `backend-api-inventory/` and shared integrations listed in `document/task/todo/stock-adjustment.md`.
- Related feature TODO/item IDs and testing document: `stock-adjustment`, BE-SAJ-008; [backend testing](../../apps/backend/inventory/stock-adjustment/testing.md).
- Approved UI/SA/API contract revisions: UI rev 1, SA rev 1, ADR-0059 Accepted.
- Root-cause fingerprint and related investigation ticket: `stock-adjustment:inventory-full-suite-verification:2026-11-24`; root cause is not established. No duplicate ticket found for this feature's full-suite validation run.

## Failure and evidence

- Data boundary and expected behavior: disposable PostgreSQL `f1_system` used by the `backend-api-inventory` integration suite; BE-SAJ-008 requires the full inventory Vitest suite to pass.
- Sanitized failure signature and observed behavior: suite completed with 5 failing files (21 total; 14 passed, 2 skipped), 197 tests passed and 26 failed. Stock Adjustment unit/read/PostgreSQL integration cases passed. Failures surfaced in Sale reserve fixture foreign-key cleanup and subsequent requests, Stock Value timeout/busy/query-count cases, and one own-stock query-budget assertion. The run did not establish whether these are fixture/capacity effects, an existing baseline, or a regression; no pre-change baseline was captured.
- Test case IDs, commands, results and environment/fixture details: command and counts recorded in [backend testing](../../apps/backend/inventory/stock-adjustment/testing.md). Run used a disposable database with one Vitest worker and the local constrained Docker environment. No production data was used.
- Missing fact or prerequisite, if any: a stable inventory integration test environment and a clean baseline/re-run that separates fixture cleanup, query-budget, and resource-timeout failures.
- Impacted acceptance criteria and remaining working scope: BE-SAJ-008 remains unchecked. Focused Stock Adjustment verification passed; implementation work and FE unit/integration suites remain usable. No failing assertion was weakened and no unrelated suite was changed.

## Shared corrective ledger

- Corrective pass limit: 3 (initial correction included)
- Passes allocated: 0
- Stop reason: verification-unavailable

| Pass | Owner / source revision | Evidence and causal hypothesis | Meaningful change | Verification and failure signature | Next fact |
|---|---|---|---|---|---|
| — | — | No Stock Adjustment test failure was isolated; the broad suite produced failures with unproven relation to this feature. | None | Full suite result above; focused Stock Adjustment tests passed. | Run the documented full suite in a stable disposable test environment and compare the failing cases with a pre-feature baseline before attributing them to this feature. |

## Proposed next step and review

- Smallest next diagnostic or prerequisite: provide a stable disposable inventory test database/runtime, then reproduce the recorded failing cases without altering assertions.
- Proposed owner and allowed paths: backend; test harness and integration-test setup only after a concrete failure hypothesis is established.
- SA review needed for a changed contract/schema/flow/dependency: no, unless diagnosis requires changing the accepted design.
- Acceptance criteria and safe verification plan: all focused Stock Adjustment tests pass and the full inventory suite passes in the isolated test environment; retain the failure signature and environment details.
- Actual user selection of this ticket/revision (fill only when selected): direct feature instruction authorizes completing the selected TODO; this blocker itself records missing verification, not an additional code-change authorization.
- Completion report and final verification (fill only after resolution): pending.
