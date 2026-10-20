# Scoped security-auditor review — GMS license v2 customer client

- Date: 2026-10-20 (Asia/Bangkok)
- Execution: custom security-auditor agent failed at the usage limit; parent applied this role's focused instructions after the sec-auditor pass. These are sequential parent fallback reviews, not independent agent results.
- Source: HEAD `44d5eb9` plus SHA-256 `DA864B678034A64B42AB7F11E6B54EE1980ABEDA26E4440254CD66AFEAF2662B` of the same seven license source/test files
- Scope: license-server HTTP boundary, token verifier, configuration, database cache and planned private authorization boundary in `backend-api-auth/src/license/`; related tests and approved revision 2 contract
- Result: **needs-validation** for GP-AUTH-05 cutover; same root cause and [INV-20261020-001](../../task/investigation/INV-20261020-001-gms-license-v2-cache-order.md)

The reviewed method is not wired to a route. It checks each invocation online, rejects v1 tokens for v2, denies unsigned/invalid claims, and limits fallback to transient unavailability. The final source and added isolated PostgreSQL suite passed 50/50 auth tests, with typecheck, build and lint passing. The actual external license-server is deferred by owner for mock-only development, documented in [INV-20261020-002](../../task/investigation/INV-20261020-002-gms-license-v2-external-integration.md).

Before exposing a private endpoint, validate its caller credential and user ID/immutable subject binding. Prevent a delayed active reply from overwriting a newer explicit denial in `LicenseCache`; demonstrate the ordering under concurrent requests and outage. Until then the security gate for the affected TODO remains open. This review did not assert a reachable exploit or run a full codebase audit.
