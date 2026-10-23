# Verification: auth private license boundary

- Source / SA revision: `INV-20261021-006-r1` / 1; approved for implementation (2026-10-21); design only, checks not run.
- Contract: [API](api-contract.md), [authorization](authorization.md), [errors](error-handling.md), [sequence](sequence-diagram.md), [DB boundary](database-diagram.md).

| Case | Required test evidence |
|---|---|
| Caller credential | Correct dedicated token succeeds; missing, malformed, duplicate, wrong, and `PARTNER_SERVICE_TOKEN` do not; timing-safe comparison; token absent from all logs. |
| User/session binding | Unknown user, another user's sid, expired/revoked session and inactive user are denied; caller-supplied username/subject is rejected by strict schema. |
| License outcome | Use local mock only: eligible, expiring, required, expired, revoked, outage within grace, outage with no proof/expired proof, invalid signature, DB/ordered-write failure. Assert no token is serialized and no stale response becomes eligible. |
| Mounted CSRF boundary | Real HTTP through mounted master tRPC: invalid/missing Origin, duplicate headers, missing marker, cross-site Fetch Metadata reject before auth-license endpoint and before any customer/vendor service mock call. Valid same-origin mutation proceeds only after all gates. Safe GET is not rejected by CSRF. |
| Database privileges | Isolated disposable PostgreSQL on dedicated non-default loopback port; explicit auth/master test URLs. The actual non-owner runtime role can SELECT the view and its partner DML objects; base auth reads/writes, other schemas, migration tables, functions and sequence checks fail. No shared developer DB. |
| Network boundary | Infra evidence shows Nginx has no route to `/internal/*`, endpoint is reachable only through the dedicated private service network, no host-published auth port bypasses policy, and no external license server is assumed. |
| Rollback | Disable route/secret and return Nginx to legacy frontend/gateway route; database grants can be revoked without deleting data; confirm legacy path works. |

Backend must add/update unit and integration tests for every changed route, guard, context and license adapter; run focused and full service suites, typecheck/lint/build, then both scoped security reviewers against the same final source revision. Prior outcomes are not evidence for this new mounted contract: auth DB tests and partner DB test were skipped/unavailable. Parent maintains the shared remediation ledger; selected ticket's first code correction pass is allocated by parent immediately before implementation, not by this design.
