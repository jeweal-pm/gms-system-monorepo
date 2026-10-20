# Scoped sec-auditor review — GMS license v2 customer client

- Date: 2026-10-20 (Asia/Bangkok)
- Mode: changed-code guidance, not a full Cloudflare audit
- Execution: custom sec-auditor agent failed at the usage limit; parent applied the role instructions sequentially. This is not an independent subagent review.
- Source: HEAD `44d5eb9` plus SHA-256 `DA864B678034A64B42AB7F11E6B54EE1980ABEDA26E4440254CD66AFEAF2662B` of the seven changed license source/test files
- Scope: `backend-api-auth/src/license/{license.client.ts,license.config.ts,license.service.ts,license.types.ts}` and `backend-api-auth/test/license/license-current*.test.ts`; remote license response, signed claims, persisted positive proof, outage fallback, isolated PostgreSQL sequential integration
- Result: **needs-validation** for GP-AUTH-05 cutover; [INV-20261020-001](../../task/investigation/INV-20261020-001-gms-license-v2-cache-order.md)

The v2 request uses the approved header on a single bounded attempt. The service requires EdDSA key ID, configured issuer/audience, instance, subject, signed v2 claim and three-day lifetime. Its fallback uses DB time, signed expiry and natural license expiry. Tests cover explicit 404/revocation, unsupported v1, 429 and 0/2-day boundaries. The existing protected routes still use v1.

The ordering of concurrent online decisions is not database-enforced, and the future private endpoint's user ID/subject binding is not implemented. An older active response could be written after a newer denial before an outage; the staged method has no reachable route today. Isolated PostgreSQL sequential checks passed after this review's initial draft; concurrency remains unverified. The exact external server is deferred by owner for mock-only development. No secrets or signed token bytes were written to the review record. Do not mark GP-AUTH-05 complete or activate the method until the ticket and concurrency evidence are resolved.
