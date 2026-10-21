# Backend tests: company-profile (SA 2, approved)

Follow the existing partner/gateway test setup (see the vendor [testing](../vendor/testing.md) results for commands). Cases:

| ID | Layer | Case | Expected |
|---|---|---|---|
| BT-CP-01 | partner | GET with no row | `{ profile: null }` |
| BT-CP-02 | partner | first save (`expectedVersion: null`) | row id 1, version 1, `updated_by` = actor |
| BT-CP-03 | partner | second first-save | 409 `CONFLICT` |
| BT-CP-04 | partner | update with stale version | 409; row unchanged |
| BT-CP-05 | partner | unknown country/currency | 400 with field paths |
| BT-CP-06 | partner | rich text with `<script>`-like text, unknown node type, `javascript:` link, depth 9, 2,001 nodes, 5,001 chars | 400 for each except plain text, which is stored as text |
| BT-CP-07 | partner | logo PNG 1 KB, JPEG 10 MB exactly | 200; version +1; sha256 stored |
| BT-CP-08 | partner | logo 10 MB + 1, GIF bytes with `image/png` type, PNG bytes with `image/jpeg` type | 413 / 415 / 415 |
| BT-CP-09 | partner | logo before first save | 404 `COMPANY_PROFILE_NOT_FOUND` |
| BT-CP-10 | partner | remove logo; GET logo | version +1; 404 |
| BT-CP-11 | partner | missing/wrong service token | 401 |
| BT-CP-12 | gateway | VIEW only: get ok; save/logo PUT/remove | 403 `PERMISSION_DENIED` |
| BT-CP-13 | gateway | logo PUT without/with foreign `Origin` | 403 |
| BT-CP-14 | gateway | logo GET headers | `Cache-Control` immutable, `nosniff`, stored type |
| BT-CP-15 | gateway | partner stopped | `PARTNER_UNAVAILABLE` |
| BT-CP-16 | migration | apply on the current dev DB; CHECKs reject id 2 and size mismatch | ok / errors |

Checks: `pnpm --filter @gem-crm/backend-api-partner typecheck`, `… lint`, `… build`, gateway the same; `db:migrate` in the dev container.

## Results — 2026-10-16 (parent, branch `feat/14-10-26-vendor`, local Docker dev stack)

| Check | Result |
|---|---|
| `pnpm --filter @gem-crm/backend-api-partner typecheck` / `lint` | pass / pass |
| `pnpm --filter @gem-crm/backend-api-gateway typecheck` / `lint` | pass / pass |
| Migration `20261016050000_company_profile` | applied on container start ("All migrations have been successfully applied"); 6 routes mapped |
| BT-CP-01…11 (partner internal, run from inside the gateway container with its own token; 23 checks) | **all pass**: null before save; logo before save 404; first save v1; duplicate first save 409; stale 409; unknown country/currency 400 with paths; rich text rejects unknown node, `javascript:` link, depth 9, 2,001 nodes, 5,001 chars; script-like text stored as plain text; empty doc → null; PNG upload; JPEG exactly 10,485,760 bytes overwrites; GET serves the new bytes; 10 MB + 1 → 413; GIF-as-PNG, PNG-as-JPEG, image/gif → 415; no token 401; wrong token on logo PUT 401 before buffering; remove → v+1; GET after removal 404 |
| Storage folder after the run | empty (no temp files); file lived only in volume `f1-system_partner-storage`; nothing under `backend-api-partner/storage/` in git |
| BT-CP-12…15 (gateway session/permission/headers) | partially: unauthenticated tRPC get → 401, REST GET/PUT → 401 (direct and through the Next `/api/v1` proxy). Permission (VIEW-only user), cache headers and partner-down not run (no test session credentials) |
| BT-CP-16 CHECK rejection | not run separately (CHECKs present in the migration) |
| Builds | not run (agent environment cannot run Turbopack/Nest builds reliably) |
| Test data | the test row was deleted afterwards |

Incident during the run: after the partner container was recreated it used the new `PARTNER_SERVICE_TOKEN` from the owner's re-created `.env`, while the gateway (only restarted) still had the old one, so every gateway→partner call returned 401. Fixed by recreating the gateway (`up -d --no-deps backend-api-gateway`); afterwards all cases passed.

## Unit tests (Vitest 5.0.3, folder `test/`) — 2026-10-16

Owner request: "frontend backend ทำ unit test case ส่วนของ company-profile ให้ฉันด้วย" + choice "โค้ด test ในโฟลเดอร์ test/" (2026-10-16). Runner: `vitest@5.0.3` (devDependency, exact, released 2026-09-30). Config `vitest.config.mts` (2 fork workers), `test/setup.ts` silences Nest logs. Script: `pnpm --filter <workspace> test`. The existing `node:test` files (`test/partner-code*.test.mjs`, other feature) are not run by Vitest and not linted by the new `eslint src "test/**/*.ts"` scope.

| Workspace | File | Cases | Covers |
|---|---|---|---|
| partner | `test/company-profile/rich-text.test.ts` | UT-CP-P01…P11 | allow-list, normalization, unsafe links, unknown nodes/keys, depth, node count, text-node limit |
| partner | `test/company-profile/company-profile.schemas.test.ts` | UT-CP-P20…P27 | save body (strict, trim, email lowering, field errors, rich-text codes, 5,000/10,000 limits), logo query |
| partner | `test/company-profile/logo-storage.test.ts` | UT-CP-P30…P35 | file written to `storage/company-profile/logo`, overwrite leaves no temp file, removal, signature checks |
| partner | `test/company-profile/company-profile.service.test.ts` | UT-CP-P40…P58 | get/options, first save, conflict, stale version, not found, membership errors, DB outage, logo upload/overwrite/415/413/conflict, get logo, missing file, removal (Prisma and file system mocked at their module boundary) |
| gateway | `test/company-profile/rich-text.test.ts` | UT-CP-G01…G05 | gateway copy behaves like partner |
| gateway | `test/company-profile/company-profile-schemas.test.ts` | UT-CP-G10…G15 | input/output shapes, unsafe rich text, malformed upstream logo |
| gateway | `test/company-profile/partner-client.test.ts` | UT-CP-G20…G26 | raw PUT headers/body, error mapping 415/413/409/404/401/500, network, binary GET, size limit, timeout |
| gateway | `test/company-profile/company-profile-logo.controller.test.ts` | UT-CP-G30…G42 | 401/licence/403, cache headers, unexpected type, 404, EDIT, 415 (CSRF guard), 400 version, 413 declared and streamed, forwarding, 409 |
| gateway | `test/company-profile/company-profile.router.test.ts` | UT-CP-G50…G56 | VIEW/EDIT rules, validation before partner, partner paths |

| Command | Result |
|---|---|
| `pnpm --filter @gem-crm/backend-api-partner test` | **76 passed** (4 files) |
| `pnpm --filter @gem-crm/backend-api-gateway test` | **49 passed** (5 files) |
| typecheck / lint (both, now including `test/**/*.ts`) | pass / pass |
| Mutation check | JPEG signature reduced to its first byte → first run **not caught**; added two signature cases (UT-CP-P35), rerun → caught (1 failed), source restored, suite green |

## GMS host storage location (2026-10-21)

- Local dev now bind-mounts host `C:\dev\f1-system\storage` at `/app/backend-api-master/storage`; uploaded logo keys are under `storage/files/partner/company-profile/YYYY/MM/<uuid>.<ext>` on the host, outside the container writable layer.
- Before the mount change, all four existing files (three immutable logo objects and the legacy logo) were copied from the retained `partner-storage` named volume. Source and host SHA-256 values match; the old volume remains untouched for rollback. No uploaded bytes were deleted.
- The production host path is `/srv/gms/storage` per infra revision 3; production host ownership, capacity, backup and cutover checks remain gated under GF-06…08. This local check is not production deployment evidence.

Not covered by these unit tests (recorded, not claimed): HTTP/DB integration with an isolated test database (the BT-CP live run above covers it manually; automated integration needs a test DB and was not requested), gateway VIEW-only/partner-down against real services, builds.

- Runtime verification (2026-10-21): API health returned 200; the signed-in Company Profile page and existing logo rendered through Nginx. pi-master bind source is host C:\dev\f1-system\storage; retained named volume was not removed and no file bytes were deleted.

## Flat module storage layout (owner instruction, 2026-10-21; superseded filename detail below)

New company-logo objects use a module-selected filename under `storage/files/company-profile/` (UUIDv7 plus validated extension by default). Existing `partner/company-profile/YYYY/MM/<uuid>.<ext>` objects remain readable and permanently retained; the application does not move or delete them. At this stage of implementation, logo storage/service tests passed 38/38 and auth photo tests passed 27/27. Runtime container reload/upload was not part of this change, so the existing logo remains at its previous key until a later upload creates a new flat-key version.

## Owner follow-up: module-selected filenames (2026-10-21)

Current code writes new company logos to `storage/files/company-profile/<filename>`; a module may provide a safe basename with the content-matching extension or omit it to use UUIDv7. Auth photo storage uses the same option under `storage/files/user-photo/`. Final tests passed: company-profile 40/40 and auth photo 29/29. Both security reviewers returned advisory with no newly confirmed vulnerability. Historical objects remain at their original immutable paths; no runtime reload or upload was performed.
