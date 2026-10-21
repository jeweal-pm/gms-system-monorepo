# INV-20261021-004 — GMS file-storage database integration verification unavailable

## Tracking

- Ticket revision: 2
- Status: resolved
- Category: integration-blocker
- Owner: backend
- Date, source commit and relevant dirty paths: 2026-10-21; HEAD plus changed-file manifest SHA-256 `5d6b78fc9d09ba698244ba4dc98267bec50b2a907925aa1276f8f9f00265d700`; auth and partner storage modules, Prisma schemas and migrations
- Related feature TODO/item IDs and testing document: `gms-file-storage-migration` GF-04/GF-05; [testing plan](../../apps/backend/storage/gms-file-migration/testing.md)
- Approved UI/SA/API contract revisions: SA revision 3; ADR-0029/0030
- Root-cause fingerprint and related investigation ticket: `gms-storage/isolated-postgres-fixture-and-env-selection`; none

## Failure and evidence

- Data boundary and expected behavior: verify auth-photo and company-logo service/API behavior with their Prisma migrations and a dedicated isolated PostgreSQL database, plus temporary filesystem storage; UI remove/replacement/account deletion must retain file bytes and metadata.
- Sanitized failure signature and observed behavior: the first auth PostgreSQL test fixture exceeded the username column length and was corrected. The initial partner migration command used `DATABASE_URL` instead of `PARTNER_DATABASE_URL`; it applied the additive migration to the local dev DB on port 5432. Read-only inspection found zero rows in the new table and one migration record; the exact newly added table, nullable column and migration record were rolled back. Follow-up inspection confirmed all three are absent from the dev DB. No file bytes or prior DB rows were changed.
- Test case IDs, commands, results and environment/fixture details: the isolated PostgreSQL test container `gms-auth-refresh-it-20261021` at `127.0.0.1:55439` was used; auth and partner migrations both deployed successfully there. `pnpm test` with `AUTH_TEST_DATABASE_URL` passed 64 with 6 unrelated skips; partner `pnpm test` with `PARTNER_TEST_DATABASE_URL` passed 287 with 15 unrelated skips. Auth DB retention test: 2/2; partner DB retention test: 1/1. Typecheck, lint and builds passed for both services.
- Missing fact or prerequisite, if any: none for isolated DB migration and persistence verification. Production host/database operations remain separately gated by GF-07/GF-08.
- Impacted acceptance criteria and remaining working scope: GF-04/GF-05 DB migration and transaction/persistence integration acceptance verified in the disposable DB; production rollout and migration utility remain in their separate TODOs.

## Shared corrective ledger

- Corrective pass limit: 3 (initial correction included)
- Passes allocated: 2
- Stop reason: none; verification passed

| Pass | Owner / source revision | Evidence and causal hypothesis | Meaningful change | Verification and failure signature | Next fact |
|---|---|---|---|---|---|
| 1 | backend / GMS revision 3 | Auth fixture username exceeded its database column bound | Use a unique test username within the schema limit | Auth database retention test passed 2/2 | None |
| 2 | parent / GMS revision 3 | Partner tests require `PARTNER_DATABASE_URL`; the first migration command used the auth variable and targeted 5432 | Rolled back only the newly added empty table/nullable column/migration record from 5432; use dedicated port 55439 and correct variable in the integration fixture | Partner migration deployed on 55439; DB retention test passed 1/1; dev DB objects confirmed absent | None |

## Proposed next step and review

- Smallest next diagnostic or prerequisite: none for this ticket. Keep tests pointed at the dedicated non-default port and use service-specific database variables.
- Proposed owner and allowed paths: none; source verification completed.
- SA review needed for a changed contract/schema/flow/dependency: no, if only creating an isolated verification fixture; yes for any contract or schema change.
- Acceptance criteria and safe verification plan: migrations deployed to the dedicated test-only database; auth replace/remove/account-delete test and partner replace/remove test verified metadata tombstones and bytes through real Prisma plus temporary filesystem; test rows and temporary files were cleaned; accidental dev-DB additions were removed and absence verified.
- Actual user selection of this ticket/revision (fill only when selected): not applicable; verification blocker resolved without application-code remediation.
- Completion report and final verification (fill only after resolution): recorded in `document/apps/backend/storage/gms-file-migration/testing.md`.
