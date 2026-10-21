# Verification plan: master / GMS platform migration

- SA revision 1; approved-design; see central TODO gates; execution **not run** (design only)
- Follow [automated testing](../../../../workflow/automated-testing.md) and [security review](../../../../workflow/security-review.md) after approved code.

| Case | Acceptance | Unit/integration coverage to add/update |
|---|---|---|
| GP-MT-01 | Each moved procedure has old/new schema/error parity and bounded list <=200 | Router/schema units + real master DB and frontend client integration |
| GP-MT-02 | JWT invalid/unknown kid/expired and revoked local grant/session deny; reachable license revocation denies; outage uses only bounded 0/2-day signed fallback | Verifier units + domain HTTP/DB and license-server integration |
| GP-MT-03 | PRICE masked, exact ADD/EDIT/DELETE grants enforced, no browser actor-header trust | Serialization units + role/permission integration |
| GP-MT-04 | Customer/vendor running numbers and optimistic conflicts unchanged | Current feature regression suites + concurrent DB integration |
| GP-MT-05 | Company logo streaming/storage migration preserves hash/version and rollback path | Storage contract and migration integration |
| GP-MT-06 | Backfill row count/checksum/index parity and old route rollback | PG16/18 migrations + staging verification |

Record actual command/evidence per changed module, function and API before handoff. Parent routes final code through sec-auditor and security-auditor; status **pending, not run**. A repeated integration data connection failure follows the three-pass investigation rule.

## Customer/vendor router slice (2026-10-21)

- Added a domain tRPC router for current customer/vendor services with bounded list input, strict UUID/body validation, exact menu/action grants, current authorization/license fail-closed checks, CSRF requirement for mutations, and sanitized domain-error mapping. It is intentionally not mounted because the verified JWT/current-authorization/license/CSRF adapter is not implemented; GP-MASTER-01/02 remain open.
- `pnpm --filter @gem-crm/backend-api-partner test -- --maxWorkers=1`: **282 passed / 15 skipped**. Typecheck, lint, build, and `git diff --check` passed. No HTTP integration or live auth context test was run for this unmounted slice.
- Source manifest: HEAD `d2ac3f3` plus SHA-256 `21c830e4f1c92567fccd049fdb9ddd090696f7a1d15cceea931efcd71493575a`; focused parent fallback security reviews are linked above in the auth verification document. The clear verdict is limited to the staged router and authorization guard and does not approve mounting it.
