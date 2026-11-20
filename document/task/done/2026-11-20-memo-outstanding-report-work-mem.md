# Memo Outstanding report timeout — local fix

- Investigation: [INV-20261029-004](../investigation/INV-20261029-004-memo-outstanding-report-aggregates-full-history.md), revision 3, corrective pass 2 of 3.
- User authorization: 2026-11-20, “งั้นคุณแก้ที”.
- Changed code: `backend-api-master/src/trade-document/memo-outstanding.service.ts` sets `work_mem = 16MB` with `SET LOCAL` inside the existing report transaction. The setting applies to the six summary/list paths for Vendor, Customer, and Purchase Outstanding. The global PostgreSQL setting, 2s statement timeout, 2.5s READ_TX, pool, schema and API contract are unchanged.
- Test change: `backend-api-master/test/trade-document/memo-outstanding.service.test.ts` now asserts the bounded transaction-local setting.

## Evidence and verification

- Current local data: about 100k `memo_receive` and 123,970 `memo_stock` rows.
- Read-only PostgreSQL `EXPLAIN (ANALYZE, BUFFERS, SETTINGS, SUMMARY)` of the vendor summary query: 1,440 ms with the existing 4MB setting and 1,234 temp blocks written; 817 ms at 16MB with no temp I/O and a 25.6MB HashAggregate.
- Focused unit test: 4/4 passed. Scoped ESLint passed.
- Full backend suite: 60 files passed / 639 tests passed; 16 files / 106 tests skipped. One unrelated `IT-MAUTH-DB-U1` failed because the container injects `MASTER_AUTHZ_DATABASE_URL`, while that test expects it unset.
- `IT-MOV`, `IT-MOC`, and `IT-POS` database integrations skipped because no disposable `PARTNER_TEST_DATABASE_URL` is configured. The application database was not used for integration tests.
- A standalone `tsc --noEmit` attempt was interrupted near the 1GB container memory limit. The `api-master` Nest watch compile then completed with `Found 0 errors`.
- Restarted only local `api-master`. Prisma generation succeeded; `migrate deploy` reported no pending migrations. Container is healthy and `/health/ready` returned 200.
- Focused source review: parent applied the `sec-auditor` and `security-auditor` instructions sequentially because custom reviewer roles were unavailable. Both reviews were clear on the changed trust boundary. Source SHA-256: `ede0fdbd3a3b6626b364468c6af343d8bfba95dda6fb74f6ded8815c01e392fe`.

## Status

The code fix is running locally. Investigation remains `needs-validation` only for the skipped disposable-database integration cases; no further correction pass is authorized without new failure evidence.
