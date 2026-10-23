# Verification: mounted master auth boundary

- Source / SA revision: `INV-20261021-006-r1` / 1; approved for implementation (2026-10-21); design only, checks not run.
- Related selected review: [INV-20261021-006 r1](../../../../../task/investigation/INV-20261021-006-gms-master-auth-boundary-validation.md).

| Test ID | Required acceptance |
|---|---|
| IT-MAUTH-01 | Mount real HTTP/tRPC composition and prove eligible access reaches customer/vendor service only after all gates. |
| IT-MAUTH-02 | Wrong/missing JWT, unknown key, wrong issuer/audience, expired token, revoked/mismatched session and view outage never call license or domain service. |
| IT-MAUTH-03 | Invalid/missing/duplicate origin, missing/invalid CSRF marker, cross-site fetch metadata mutation return 403 before view/license/domain calls; assert spies/counters are zero. Valid same-origin mutation follows view -> license -> grant -> input -> service order. |
| IT-MAUTH-04 | Auth service endpoint: bad/dedicated/shared caller credential, malformed/extra fields, user/sid mismatch, inactive/expired session, all mock license statuses; response never includes signed token. |
| IT-MAUTH-05 | Separate `MASTER_AUTHZ_DATABASE_URL` role can SELECT the view and cannot access auth base tables, partner/stone schemas, sequences/functions or migration table; missing reader URL has no fallback; existing `PARTNER_DATABASE_URL` still serves existing company-profile/stone/partner procedures unchanged. Dedicated disposable database and explicit role URLs only. |
| IT-MAUTH-06 | Timeout, network reset, malformed auth response and DB outage deny with 503; no retry, no stale cache; upstream remains 1.5s timeout and local mock only. |
| IT-MAUTH-07 | Nginx `/internal/*` 404 and topology check confirms only master/auth can use the private endpoint; no host exposure bypass. |
| IT-MAUTH-08 | Rollback unmount and restore old gateway path; revoke token and role without changing/deleting business/auth rows. |

Backend must correct the selected DB test fixture ticket before running database tests. Use isolated PostgreSQL on a dedicated loopback port, not shared dev DB/production. Then run targeted and full suites, lint/typecheck/build, followed by both focused reviewers on one identical source revision. Current review evidence remains `needs-validation`, not a pass for this design.
