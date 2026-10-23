# INV-20261020-001 — GMS license v2 cache ordering before route activation

## Tracking

- Ticket revision: 1
- Status: needs-validation; cache ordering corrected, private endpoint criterion remains unverified
- Category: vulnerability
- Verdict: needs_validation; no severity assigned because the v2 method is not exposed by a protected route
- Owner: backend
- Date: 2026-10-20 (Asia/Bangkok)
- Feature: `gms-platform-migration`, GP-AUTH-05; approved SA license-contract revision 2
- Discovery source: HEAD `44d5eb9` plus staged v2 manifest SHA-256 `DA864B678034A64B42AB7F11E6B54EE1980ABEDA26E4440254CD66AFEAF2662B`
- Auditor: parent sequential fallback for sec-auditor and security-auditor; the two custom agents failed at the usage limit

## Evidence and impact

`backend-api-auth/src/license/license.service.ts` `resolveCurrentStatus` stores a signed result in `LicenseCache` after the remote reply, and deletes the row after an explicit 404. Concurrent calls for the same user can complete in a different order from the remote decisions: an earlier active response can write after a later 404 deletion. A subsequent outage could then read that positive proof. The current code does not expose this method from a protected route, so this is a required cutover validation gap rather than a demonstrated reachable exploit.

The method also accepts `userId` and license subject separately. A future private service endpoint must derive or verify this pairing from an authenticated principal; the staged method itself does not do so. Isolated PostgreSQL integration passed sequential cases, but did not validate this concurrency or a live private endpoint. No external server exists here to validate its boundary.

## Proposed work

- Require a monotonic, database-enforced ordering of per-user online decisions, including explicit missing/revoked states, before GP-AUTH-05 activation. Prevent an older successful response from overwriting a newer denial.
- Bind the requested user and immutable license subject to authenticated local identity at the private endpoint.
- Cover overlapping active/404/revoked/outage requests and mismatched identity with isolated PostgreSQL integration tests, then repeat scoped security review.
- If the ordering mechanism changes schema or the approved private API contract, obtain the separate SA-document approval first.

## User selection and resolution

- Approved ticket revision: 1
- Actual user instruction selecting this ticket: owner reply "อนุมัติแก้ INV-20261020-001" on 2026-10-20
- Separate SA bundle: [revision 3 approved](../../reviews/sa/2026-10-20-gms-license-ordering-rev3.md), [ADR-0028 Accepted](../../adr/0028-gms-license-current-decision-order.md); owner reply "อนุมัติ SA revision 3 และ ADR-0028" on 2026-10-20
- Corrective passes allocated: 1 of 3 (initial code correction allocated after SA approval)
- Pass 1 hypothesis: a database sequence issued before each remote check and a separate per-user compare-and-set decision row prevent older active replies from overwriting later explicit denial across processes; no database connection is held during the remote call. Verification: unit cases, isolated PostgreSQL out-of-order cases, auth suite/typecheck/build/lint, then scoped security review.

## Pass 1 implementation and result

- Source after correction: HEAD `44d5eb9` plus nine-file SHA-256 `63ABA554AA9651CB673D41035429EFB094306CE08808778543312994A3A7A96C`.
- Changed paths: `backend-api-auth/prisma/schema.prisma`, `prisma/migrations/20261020160000_license_current_decision_order/migration.sql`, `src/license/license.service.ts`, and matching license tests. Existing v1 `LicenseCache`/protected routes remain unchanged.
- Outcome: isolated PostgreSQL migration **8/8**; forced out-of-order active→404 and active→signed-revoke calls across two `LicenseService` instances leave the row `DENIED`; stale active call returns 503; outage cannot reuse that proof. The service derives the immutable subject from the auth user row. Auth suite **54/54** with one worker; typecheck, build, lint and `git diff --check` passed. The first two-worker run timed out in an existing JWKS test under concurrent fixture load; bounded one-worker rerun passed without code correction.
- Focused parent fallback reviews of the same final source: [sec-auditor clear for staged ordering](../../reviews/sec-auditor/2026-10-20-gms-license-ordering-rev3.md), [security-auditor clear for staged ordering](../../reviews/security-auditor/2026-10-20-gms-license-ordering-rev3.md). Custom agents were unavailable at their usage limit; no independent agent result is claimed.
- Remaining boundary: no private service-authenticated route exists yet. Its caller credential and verified session/user binding remain in GP-AUTH-05, outside the activated surface. The separate external license server and production load evidence are deferred by owner. Keep this ticket `needs-validation` for the original private-endpoint acceptance criterion; do not treat the staged service as a route cutover.
- Corrective ledger: pass 1 achieved the cache-ordering criterion; no second pass allocated. Stop reason for unresolved endpoint criterion: `verification-unavailable` until a private route exists with an approved service-credential contract. Do not reset this ledger on that later handoff.
- Completed staged ordering slice: [2026-10-20 report](../done/2026-10-20-gms-license-v2-ordering-staged.md). Ticket remains open for its endpoint criterion.
