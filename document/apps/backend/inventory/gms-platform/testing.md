# Verification plan: inventory / GMS platform migration

- SA revision 1; approved-design; see central TODO gates; execution **not run** (design only)
- Follow [automated testing](../../../../workflow/automated-testing.md), [security review](../../../../workflow/security-review.md).

| Case | Acceptance | Unit/integration coverage to add |
|---|---|---|
| GP-IT-01 | Typed input, decimal strings, max 200, pagination and location scope | Hono handlers/validators and PostgreSQL integration |
| GP-IT-02 | JWT/grant/session/CSRF failures deny; reachable revoked license denies; transient outage honors only configured signed fallback; DB/view outage fails closed | Auth verifier units and real HTTP/DB/license-server integration |
| GP-IT-03 | Parallel posts on same item/location/lot never negative; stable lock order | N-way PostgreSQL concurrency integration on PG16 and 18 |
| GP-IT-04 | Duplicate line aggregate, idempotency same/different body, gap-free counter on rollback | Posting unit and transactional integration |
| GP-IT-05 | Append-only movements and compensating correction; no cross-schema writes | Migration/trigger/permission integration |
| GP-IT-06 | Selected storage/queue driver contract and 4 GB p95/RSS | Only when approved feature and profiles exist; no claim of execution |

Every added/changed module, function/API receives unit and integration tests in implementation. DB16/18 migrations, production image load and restore checks must be recorded before rollout. Parent runs both focused security reviews on final diff; status **pending, not run**. Three diagnosed integration data-connection correction passes maximum before investigation ticket.
