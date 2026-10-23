# Completion: INV-20261021-007 revision 1

- Feature/ticket: `INV-20261021-007` revision 1; work ID `INV-20261021-007-r1`.
- Owner approval: user instructed `แก้เลย` on 2026-10-21 after the two ticket revisions were presented.
- Root cause: the database fixture guarded `PARTNER_TEST_DATABASE_URL`, while partner Prisma reads `PARTNER_DATABASE_URL` and otherwise has a development fallback to port 5432.
- Changed source: [master DB integration fixture](../../../backend-api-partner/test/master/auth-context.db.integration.test.ts), SHA-256 `9f6b4248e2034a2038988b75fe61b0236a81e80411cb54cc113b13059377a4af`.
- Behavior: both URLs are validated before either Prisma import; only explicit PostgreSQL URLs targeting the same `f1_system` database on `127.0.0.1` and a non-5432 port are accepted. The fixture sets `DATABASE_URL` and `PARTNER_DATABASE_URL` from those validated values before dynamic imports. Missing, malformed, non-loopback, default-port, or mismatched inputs reject before the import callback.

## Verification

- Targeted fixture guard and PostgreSQL integration: **5 passed** (U1 missing URL, U2 unsafe/malformed/default port, U3 mismatched target, U4 stale ambient URL overridden before import, I1 real auth fixture writes and partner auth-view read/revocation/inactive-account checks).
- Integration database: disposable PostgreSQL 18.6, loopback `127.0.0.1:55439`, no project volumes; migrations applied to that disposable instance. `partner_it` had only `USAGE` on schema `auth` and `SELECT` on `auth.current_authorization`. The container was stopped and removed after the run.
- Full partner suite with DB URLs unset and heap bounded: **297 passed, 17 skipped** across 22 files. The earlier unbounded run exited with a V8 allocation failure; the bounded run completed successfully.
- Partner typecheck, lint and build passed with `NODE_OPTIONS=--max-old-space-size=1024`.
- `sec-auditor` and `security-auditor` each returned **clear** for the selected database-target isolation criterion against the exact source SHA-256 above. Both relied on the documented disposable-database execution evidence rather than independently rerunning it. No code changed after review.

## Scope and remaining state

Ticket acceptance is complete and recorded as resolved in [INV-20261021-007](../investigation/INV-20261021-007-partner-master-test-database-target.md). No app runtime behavior, Compose configuration, container, image, database volume, service identity, route mount or deployment was changed. The broader master authorization boundary remains tracked separately by [INV-20261021-006](../investigation/INV-20261021-006-gms-master-auth-boundary-validation.md) and GP-MASTER-01/02.
