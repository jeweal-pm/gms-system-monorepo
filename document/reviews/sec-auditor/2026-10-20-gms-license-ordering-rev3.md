# Scoped sec-auditor review — ordered GMS license v2 decisions

- Date: 2026-10-20 (Asia/Bangkok)
- Mode: changed-code guidance using Cloudflare web/auth, data lifecycle and availability references; no full audit
- Execution: custom sec-auditor agent remained unavailable at the usage limit, so the parent applied its instructions sequentially. This is not an independent agent review.
- Source: HEAD `44d5eb9` plus SHA-256 `63ABA554AA9651CB673D41035429EFB094306CE08808778543312994A3A7A96C` of the nine changed license source, schema, migration and test files
- Scope: `backend-api-auth/src/license/{license.client.ts,license.config.ts,license.service.ts,license.types.ts}`, `backend-api-auth/prisma/{schema.prisma,migrations/20261020160000_license_current_decision_order/migration.sql}`, and `backend-api-auth/test/license/license-current*.test.ts`
- Trust boundaries: authenticated user ID to immutable license subject, remote signed v2 response to database decision, concurrent decision ordering, transient-outage fallback
- Result: **clear for the staged ADR-0028 ordering implementation**; GP-AUTH-05 route/cutover remains unreviewed and open

The service now resolves the immutable username from its own user row, rejects missing/disabled users, verifies EdDSA/issuer/audience/instance/subject/version/three-day lifetime, and writes v2 decisions to a separate table from the v1 cache. A PostgreSQL sequence is allocated before each remote call; compare-and-set accepts only a greater order, and stale positive replies fail closed. Explicit 404/revoked/invalid/4xx/429 results store a token-free `DENIED` marker. Timeout/5xx alone may use a signed latest `ACTIVE` row within DB-time grace and both signed/natural expiry. SQL parameters bind user ID, order and token; no client input selects a SQL identifier or key URL. The HTTP client still makes one bounded request and caps response bytes.

Evidence: isolated PostgreSQL 18.6 migration 8/8; out-of-order active→404 and active→revoked local HTTP/DB tests pass across two service instances; auth suite 54/54 with one test worker, typecheck/build/lint pass. The first concurrent full-suite run timed out in an existing JWKS test at Vitest's 5-second limit while PostgreSQL was running; no assertion failed in the changed license tests. A single-worker rerun passed. The temporary database container was stopped and removed.

Limits: no private service-authenticated route exists, so its caller credential and session binding are not part of this review. The real license server is deferred by owner to a separate repository; local mock and bounded HTTP fixture were used. Production DB role grants and 4 GB/2 vCPU load need validation before cutover. No new actionable finding was confirmed in the staged ordering scope; the original concurrency ticket remains linked to the pending private-route criterion.
