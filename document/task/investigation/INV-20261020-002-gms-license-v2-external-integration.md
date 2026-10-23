# INV-20261020-002 — GMS external license-server v2 integration unavailable

## Tracking

- Ticket revision: 1
- Status: deferred by owner for mock-only development; remains a production cutover prerequisite
- Category: integration-blocker
- Owner: backend
- Date: 2026-10-20 (Asia/Bangkok)
- Feature: `gms-platform-migration`, GP-AUTH-05; approved SA license-contract revision 2
- Source: HEAD `44d5eb9` plus changed license source/test manifest SHA-256 `DA864B678034A64B42AB7F11E6B54EE1980ABEDA26E4440254CD66AFEAF2662B`
- Root cause: no implemented external license-server v2 or production request-rate evidence to verify the upstream data boundary
- Owner direction: "ยังไม่ต้องทำ แค่ mock ไว้ก่อนเหมือนที่เคยทำตอนเดิม เพราะเดี๋ยวจะทำแยก repo กัน" on 2026-10-20

## Failure and evidence

GP-LIC-04 passes with a controlled Prisma boundary mock; GP-LIC-03 exercises a real local HTTP server. An isolated disposable PostgreSQL 18.6 container was started on a random localhost port with no project volume. All seven auth migrations applied. GP-LIC-05 exercised real HTTP → service → PostgreSQL for signed active proof, reachable revoke, outage fallback, fixed DB-time deadline and explicit 404: 3/3 pass. The container was stopped and removed after verification. No shared or production database was used.

The external license-server implementation is outside this repository and unverified. Its v2 header/406 negotiation, signing keys, explicit-denial mapping and request-rate capacity still lack integration evidence. Concurrent online ordering is tracked separately in INV-20261020-001. The affected TODO remains open.

Commands completed: isolated `prisma migrate deploy` 7/7, GP-LIC-05 3/3, auth Vitest 50/50, typecheck, build, lint and `git diff --check` pass. These results do not count as external-service or load verification.

## Shared corrective ledger

- Corrective pass limit: 3, initial correction included
- Passes allocated: 0
- Stop reason: verification-unavailable; no diagnosed integration failure to retry

## Next prerequisite

Continue local development with the approved mock v2 token. When the separate license-server repository is ready, obtain its implementation and a safe test environment. Confirm header/406 behavior, signing-key overlap, explicit revoke/404, outage/429 mapping and measured per-instance request capacity before production route activation. Address concurrency in INV-20261020-001. A changed schema/contract/flow still requires SA approval. The owner deferred external implementation on 2026-10-20; this record does not authorize deployment.
