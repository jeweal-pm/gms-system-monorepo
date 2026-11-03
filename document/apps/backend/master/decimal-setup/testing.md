# Backend verification: master / decimal-setup

- Source UI revision / SA revision: 2 / 1 (pending-review)
- Approved API/schema/authorization references: [api-contract](api-contract.md), [database-diagram](database-diagram.md), [authorization](authorization.md)

## Automated coverage

Follow [automated testing](../../../../workflow/automated-testing.md). All cases planned; none run yet.

| Target / behavior | Unit case ID and test path | Integration case ID and test path | Real boundary / isolated fixture | Command and result |
|---|---|---|---|---|
| `saveDecimalSetupBodySchema` ranges, integers, strict | UT-DEC-B01 `backend-api-master/test/decimal-setup/decimal-setup.service.test.ts` | — | pure | `pnpm --filter backend-api-master test` — not run |
| `DecimalSetupService.get` (row, missing row → defaults v0) | UT-DEC-B02 same | — | Prisma mocked | not run |
| `save` update ok / version mismatch → CHANGED / v0 create / P2002 → CHANGED / DB down → PARTNER_UNAVAILABLE | UT-DEC-B03…B06 same | — | Prisma mocked | not run |
| Router: `get` allowed with no grants; denied without session / licence; `save` needs `decimal-setup:EDIT` + CSRF | UT-DEC-B07 `backend-api-master/test/master/router.test.ts` (GP-MT-DEC) | IT-DEC-B01 `backend-api-master/test/master/auth-context.http.integration.test.ts` (service mock added) | tRPC caller / HTTP adapter | not run |
| `requireMasterSession` error order | UT-DEC-B08 `backend-api-master/test/master/authorization.test.ts` (create if absent) | — | pure | not run |
| Migration: table, CHECKs, seed row, no drift | — | IT-DEC-B02 dev DB: `prisma migrate deploy` + `migrate diff` | real PostgreSQL (dev) | not run |
| Auth catalog 42 leaves / 360 cells, `decimal-setup` has VIEW+EDIT only | UT-CAT-01 (updated) `backend-api-auth/test/permission/catalog.test.ts` | — | pure | `pnpm --filter backend-api-auth test` — not run |

Also run `typecheck` and `lint` scripts of `backend-api-master` and `backend-api-auth` (discover names in each package.json).

## Security review before handoff

| Reviewer | Source revision / changed scope | Status | Evidence / ticket IDs |
|---|---|---|---|
| `sec-auditor` | final BE + FE diff for decimal-setup rev 2 | pending | — |
| `security-auditor` | same revision | pending | — |

Focus: `get` exposes no data beyond two integers; `save` keeps grant + CSRF; no injection surface (integers only).

## Service acceptance

| Case ID | Rule / operation / TODO ID | Setup | Action | Expected outcome | Check type | Evidence / result |
|---|---|---|---|---|---|---|
| AC-DEC-01 | get, BE-DEC-003 | licensed user with zero grants | call `decimalSetup.get` through nginx | 200 `{setup: {2, 2, version 1}}` | live | not run |
| AC-DEC-02 | save, BE-DEC-003 | user with `decimal-setup:VIEW` only | save | 403 `PERMISSION_DENIED` | live | not run |
| AC-DEC-03 | save | admin with EDIT | save weight 3 price 0, expected 1 | 200 version 2; get returns 3/0 | live | not run |
| AC-DEC-04 | concurrency | two sessions loaded v2 | both save | second → 409 `DECIMAL_SETUP_CHANGED` | live | not run |
| AC-DEC-05 | ranges | admin | save weight 4 or price 3 | 400 `VALIDATION_ERROR` | live | not run |
| AC-DEC-06 | SA-DEC-05 | setting price 0 | create a quotation with unit price 100.50 via API | accepted, stored 100.50 (server unchanged) | live | not run |
| AC-DEC-07 | cleanup | — | restore 2/2 after live checks | row back to 2/2 | live | not run |
