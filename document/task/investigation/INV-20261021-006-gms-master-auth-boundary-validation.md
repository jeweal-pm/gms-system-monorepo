# INV-20261021-006 — GMS master authorization boundary needs runtime validation

## Tracking

- Ticket revision: 1
- Status: resolved (selected local-development boundary and rollout scope)
- Owner: backend
- Priority: selected for remediation
- Auditor / mode / run ID: sec-auditor and security-auditor / focused changed-code review / none
- Date and audit scope: 2026-10-21; approved GMS master JWT, live authorization, license and CSRF adapter slice
- Source commit, dirty paths, and relevant content hashes: initial reviewed code manifest SHA-256 `028c22ca95d9e0f191901c6baeaab75648744287c3cc50db5039f4759b472a97`; final source/config manifest SHA-256 `9f9134c57c1db93236280bf8592e65f8fdf0343611f496dca6dbf29c93b2ce3c` (sorted path + per-file SHA-256 manifest recorded below). Both final scoped reviews apply to this exact hash.
- Related ticket / root-cause fingerprint: `gms-master/authorization-boundary-unmounted-and-upstream-unverified`; related [INV-20261020-002](INV-20261020-002-gms-license-v2-external-integration.md)
- Category: hardening
- Verdict: not-applicable
- Vulnerability severity: none

## Evidence and impact

- Affected files and line numbers: `backend-api-partner/src/master/auth-context.ts:155-179`; `backend-api-partner/test/master/auth-context.test.ts:87-93`; `backend-api-partner/test/master/auth-context.http.integration.test.ts:47-70`; `backend-api-partner/test/master/auth-context.db.integration.test.ts:5-8,17-50`; `document/apps/backend/master/gms-platform/testing.md`.
- Attacker prerequisites and reachable entry point: no mounted master route was found in the reviewed scope; this is a required validation gap before activation, not a confirmed reachable vulnerability.
- Concrete trust boundary and source-to-sink trace: the adapter validates the access JWT, obtains current session/grants from the auth-owned view and returns `csrfVerified` plus an injected license state in context. Static router guards require mutation CSRF and eligible license. The adapter/container composition remains unmounted, the HTTP test exercises GET only, and no live role/view/license integration was run. The `checkLicense` callback is optional and defaults to unavailable; the actual private service-authenticated license endpoint and DB SELECT-role provisioning are not implemented/verified.
- Observed impact and independent verification evidence: both focused reviewers returned `needs-validation`; neither found a confirmed auth bypass in the unmounted slice. The auth suite passed 60 with 13 skipped; partner passed 293 with 17 skipped. Both DB-backed authorization/login cases skipped because dedicated test URLs were absent. See the linked auth/master testing documents.
- Missing validation fact / capability: demonstrate the deployed route uses this adapter before any domain access; prove invalid/missing mutation Origin/CSRF marker and unavailable license are denied over HTTP; verify the dedicated master DB role can read only the required auth view; define/approve the service-auth transport for the private current-license check and use a trusted JWKS URL for deployment.
- Sanitized evidence sufficient for owner review: both reviewers examined the same code/test manifest SHA-256 `028c22ca95d9e0f191901c6baeaab75648744287c3cc50db5039f4759b472a97`. A later documentation-only update added full-suite counts; code/tests remained unchanged.
- Raw report/run links (local, ignored evidence may not exist on another checkout): reviewer reports are recorded in `document/apps/backend/auth/gms-platform/testing.md` and `document/apps/backend/master/gms-platform/testing.md`.

## Proposed work

- Allowed code scope and assigned implementation role: backend auth/master adapters, focused tests and verification docs; parent owns shared manifests/Compose. Infra only after approved adapter contract and selected rollout.
- Suggested remediation: keep the master router unmounted and fail closed until the private license service-auth contract, DB role grants and route composition are implemented and exercised. Add mounted HTTP mutation denial and unavailable-license integration cases; verify the actual role's view-only access and production JWKS transport.
- SA design / contract / flow / dependency change needed: yes for the exact private service-auth contract and DB-role grant/activation boundary if not already resolved by an accepted revision; preserve the existing approved mock-only local-development instruction.
- Acceptance criteria: integration tests prove eligible JWT plus current view works; revoked/expired session/grants, unavailable license, invalid/missing CSRF and DB errors deny before service access; role privilege checks confirm only required view access; route activation has a documented rollback and both same-source scoped reviews.
- Safe verification plan and prerequisites: use a disposable PostgreSQL instance on a dedicated non-5432 loopback port with explicit auth and partner URLs/roles; never test against the developer database or production. Use a controlled mock for local license tests only; no external license-server or production claim.

## User selection and approval

- Approved ticket revision: 1
- Actual user instruction / approval evidence: user replied "แก้เลย" after parent asked whether to authorize backend fixes for INV-20261021-006 revision 1 and INV-20261021-007 revision 1.
- Approval date: 2026-10-21
- Separate approved SA bundle/revision, if required: `INV-20261021-006-r1` SA revision 1 / ADR-0031 plus auth/master service deltas and infra research revision 1 were approved for implementation on 2026-10-21 by the owner's explicit instruction to proceed without another approval wait. See [SA review bundle](../../reviews/sa/2026-10-21-gms-inv006-auth-boundary-rev1.md). Scope exclusions remain binding.

## Implementation and resolution

- Selected work ID / root-cause fingerprint: `INV-20261021-006-r1` / `gms-master/authorization-boundary-unmounted-and-upstream-unverified`
- Corrective pass limit: 3 (initial fix included)
- Passes allocated: 2
- Active pass: none; pass 2 completed and verified.
- User-authorized extension and new limit: none
- Stop reason / missing prerequisite: none for the exact SA revision 1 scope. Work must stop at the documented scope boundary; unrelated contracts or migration steps require their own documented basis.
- Reopen evidence and explicit selection: none

| Pass | Owner(s) / input revision or hash | Causal hypothesis / new evidence | Meaningful change | Authorized verification / result / failure signature | Next fact or terminal decision |
| 1 | backend / selected ticket r1; approved ADR-0026; SA revision 1 / ADR-0031 approved 2026-10-21 | Adapter reported `csrfVerified:false`; auth private decision, dedicated view reader and mounted route had not been integrated | Implemented within selected scope | Final source/config manifest SHA-256 `4b37c5e79724985d1076944ef8326b7c1d83ba02c0d4bbe5585b8f5099f53ae4`; auth 10 focused cases pass; partner focused adapter/CSRF/client/handler 16 pass; reader-role DB integration 3 pass on disposable PG 18.6 loopback port 55441/no project volume; full auth 63/13 skipped, partner 307/19 skipped, gateway 236/7 skipped; auth/partner typecheck/lint/build pass; details in auth/master testing records | Parent to route both final same-source scoped reviews; no deploy is claimed |

| 2 | backend / same selected ticket r1; advisory from sec-auditor; user instruction 2026-10-21 to proceed without another approval | `authorizationReader` was optional and defaulted to the shared partner Prisma client; omitted injection could violate the accepted no-fallback contract | Removed shared-Prisma fallback; require injected isolated reader and assert its exact verified subject/session inputs | Partner full suite 307 passed/19 skipped; typecheck/lint/build passed. Final manifest `9f9134c57c1db93236280bf8592e65f8fdf0343611f496dca6dbf29c93b2ce3c`; both scoped reviews clear. Local runtime checks below passed. | Terminal for selected local-development boundary scope; production capacity/cutover remains outside this ticket. |
- Assigned owner and start date: backend / 2026-10-21; parent coordinates SA contract bundle
- Changed files / implementation revision: `INV-20261021-006-r1`; exact frozen manifest: `backend-api-auth/src/app.module.ts`, `backend-api-auth/src/license/master-license.controller.ts`, `backend-api-auth/src/license/license.service.ts`, `backend-api-auth/src/license/license.types.ts`, `backend-api-auth/test/license/master-license.http.integration.test.ts`, `backend-api-auth/test/license/license-current.service.test.ts`, `backend-api-partner/src/app.module.ts`, `backend-api-partner/src/main.ts`, `backend-api-partner/src/master/auth-context.ts`, `backend-api-partner/src/master/authz-database.ts`, `backend-api-partner/src/master/license-client.ts`, `backend-api-partner/src/master/trpc-handler.ts`, `backend-api-partner/test/master/auth-context.test.ts`, `backend-api-partner/test/master/auth-context.http.integration.test.ts`, `backend-api-partner/test/master/authz-database.db.integration.test.ts`, `backend-api-partner/test/master/license-client.test.ts`, `backend-api-partner/test/master/trpc-handler.http.integration.test.ts`, `backend-api-partner/prisma/roles/provision-master-authz-reader.sql`, `docker-compose.gms.dev.yml`, `docker/nginx/gms-dev.conf`. Final manifest SHA-256 is `9f9134c57c1db93236280bf8592e65f8fdf0343611f496dca6dbf29c93b2ce3c`; computed by sorting paths, joining `path + space + lowercase file SHA-256` lines with LF (no final LF), then SHA-256 of the resulting UTF-8 bytes. Parent independently recomputed the same value. Parent serialized both composition roots and partner `main.ts`.
- Checks performed, results, and limitations: focused auth 10/10, partner 16/16, disposable reader DB 3/3; full auth 63 passed/13 skipped, partner 307/19 skipped, gateway 236/7 skipped; auth/partner typecheck, lint and build pass. Full-suite DB skips are not counted as integration evidence. The disposable role test is local PostgreSQL evidence only. Local container runtime evidence is recorded below; no production DB/secret/JWKS/license server or production-capacity verification is claimed.
- Follow-up auditor and verification evidence: both final same-source scoped reviews returned clear: sec-auditor and security-auditor reviewed manifest `9f9134c57c1db93236280bf8592e65f8fdf0343611f496dca6dbf29c93b2ce3c`. Parent completed the approved local-dev rollout and runtime checks in the infra bundle. This resolves the selected adapter/boundary ticket for local development only; it does not complete GP-MASTER-01/02, domain parity, production capacity, or cutover.
- Remaining risk or reopened validation gap: production load/latency/capacity and migration parity/cutover remain unverified and are tracked by the broader migration TODO. No confirmed security issue remains in this selected local-dev scope.
- Local runtime result: dev Compose overlay is running without image rebuild, prune, `down`, volume reset/deletion, DB reset, or data reset. Nginx config test/health passed; Nginx binds only `127.0.0.1:8080`; auth and partner have no published host ports. Internal path variants returned 404; unauthenticated master tRPC returned 401; login and authenticated mounted options returned 200; sign-out returned 200 and replaying the same access token returned 401. Missing/wrong private bearer returned 401. Auth/partner mount the token read-only (`RW=false`; r+ returned `EROFS`); Nginx has no token mount. Secret value was not logged. Docker Desktop displayed mode 777 inside those containers, while the source ACL had no broad Users/Everyone/Authenticated Users entries. Existing Postgres/auth/partner named volume identities were preserved. Nginx had a transient partner DNS resolution failure during initial startup; targeted partner recreation and Nginx re-up restored healthy service discovery without source/config edits. Local idle memory: auth ~500 MiB/1.5 GiB cap, partner ~564 MiB/1 GiB, Nginx ~9 MiB/64 MiB. This is not production capacity evidence.
- Completion report under document/task/done/: [GMS master-auth boundary local-dev verification](../done/gms-master-auth-boundary-local-dev.md)
- Final status / date: resolved for selected local-development scope / 2026-10-21
