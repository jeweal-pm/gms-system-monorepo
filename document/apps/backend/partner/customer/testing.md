# Backend verification: partner + gateway / customer

- Source UI revision / SA revision: 1 / 1 (pending-review)
- Approved API/schema/authorization references: none yet. Planned against [API](api-contract.md), [database](database-diagram.md), [authorization](authorization.md), [errors](error-handling.md)

No test runner is installed (no Vitest/Jest in any manifest; tech-stack ledger). Scripts available
after scaffolding: partner `typecheck` (prisma generate + tsc), `build`, `lint`, `db:migrate`,
`db:migrate:dev`; gateway `typecheck`, `build`, `lint`; root `pnpm -r lint|typecheck|build`.
Runtime cases run manually against the dev Compose stack (mock license) with `curl` (direct partner
calls from inside the Compose network, e.g. `docker compose exec backend-api-gateway node -e "fetch(…)"`)
and the browser through `/api/trpc`. Results of the 2026-10-14 backend run are at the end of this file.

| Case ID | Rule / operation / TODO ID | Setup | Action | Expected outcome | Check type | Evidence / result |
|---|---|---|---|---|---|---|
| BT-CUS-00 | D-01 migrations table / BE-CUS-002 | DB with auth migrated; count rows in `public._prisma_migrations` | partner `db:migrate` | `to_regclass('partner._prisma_migrations')` not null, contains the customer migration; `public._prisma_migrations` count unchanged; auth `prisma migrate status` still "up to date" | migration + SQL | not run |
| BT-CUS-01 | schema / BE-CUS-002 | after BT-CUS-00 | `prisma validate`; `prisma migrate diff --from-migrations prisma/migrations --to-schema prisma/schema.prisma --script` | validate passes; diff empty (D-03 partial index not dropped); CHECKs present in `pg_constraint` | static + SQL | not run |
| BT-CUS-02 | create happy path / BE-CUS-005, 008 | user with `customer:ADD`; 2 invoice + 1 shipping address, none marked default | `customer.create` | `{id, updatedAt}`; 1 customer + 3 address rows; first of each type `is_default`; `created_by` = caller ID; `email` stored lowercase; `code_key` = lower(code) | manual runtime + SQL | not run |
| BT-CUS-03 | required/shape validation / BE-CUS-004, 007 | — | create with empty name, bad email, missing invoice array, 11 shipping addresses, `taxId` on shipping, unknown key `id` | `BAD_REQUEST` `VALIDATION_ERROR` with matching `fieldErrors` paths; nothing written | manual runtime | not run |
| BT-CUS-04 | default rule / BE-CUS-004 | — | create with two invoice defaults | `VALIDATION_ERROR` `{path:"invoiceAddresses",code:"multiple_defaults"}` | manual runtime | not run |
| BT-CUS-05 | code uniqueness / BE-CUS-005 | customer with code `C-0001` | create `c-0001 ` (case + trailing space); create two customers with `code: null`; two parallel creates with code `X-1` | 409 `CUSTOMER_CODE_TAKEN` + field `code`; two null-code customers allowed; parallel → one success, one 409 | manual runtime | not run |
| BT-CUS-06 | list search/paging / BE-CUS-006 | seed 120 customers (script, dev only) incl. inactive | list `limit:50` and follow cursors; `q` by name fragment and by code fragment (mixed case, with `%` and `_`); `active:false` | pages of 50/50/20, no duplicates/gaps, `total` = 120 on every page; search matches name OR code case-insensitively; `%`/`_` treated literally; inactive filter correct; `limit:51` → 400 | manual runtime | not run |
| BT-CUS-07 | update + stale / BE-CUS-005 | saved customer, two browser tabs | tab 1 saves with changed addresses; tab 2 saves with old `expectedUpdatedAt` | tab 1 ok, address set fully replaced (positions 1..n, new IDs); tab 2 → 409 `CUSTOMER_STALE`; no change from tab 2 | manual runtime + SQL | not run |
| BT-CUS-08 | delete / BE-CUS-005 | customer with 4 addresses | `customer.delete` twice | first `{ok:true}` and 0 address rows remain; second → 404 `CUSTOMER_NOT_FOUND` | manual runtime + SQL | not run |
| BT-CUS-09 | get / not found / BE-CUS-005 | — | `customer.get` with random UUID; with non-UUID | 404 `CUSTOMER_NOT_FOUND`; 400 `VALIDATION_ERROR` | manual runtime | not run |
| BT-CUS-10 | permissions / BE-CUS-008 | user A with only `customer:VIEW`; user B with none; Super Admin | A: list/get/options ok, create/update/delete → 403 `PERMISSION_DENIED`; B: all → 403; Super Admin: all ok | as stated | manual runtime | not run |
| BT-CUS-11 | session/license / existing | no cookie; restricted license (mock) | any `customer.*` | `UNAUTHORIZED`; `LICENSE_*` unchanged | manual runtime | not run |
| BT-CUS-12 | service token / BE-CUS-003, 011 | inside Compose network | call partner `/internal/v1/customers` without token, with wrong token, with correct token; from host `curl localhost:3201` | 401, 401, 200; host connection refused (no published port in base Compose) | manual runtime | not run |
| BT-CUS-13 | actor header / BE-CUS-003 | correct token | POST without `X-Actor-User-Id`; body containing `createdBy` | 400 `VALIDATION_ERROR` each; nothing written | manual runtime | not run |
| BT-CUS-14 | partner unavailable / BE-CUS-007 | stop partner container; then set a wrong token in gateway | `customer.list`, `customer.create` | `SERVICE_UNAVAILABLE` `PARTNER_UNAVAILABLE` within ~3 s / 5 s; user **not** logged out; gateway logs token rejection as error without the token value | manual runtime + log review | not run |
| BT-CUS-15 | options / BE-CUS-006 | — | `customer.options`; create with currency `XXX`-like value not in list and country `ZZ` | sorted lists with names (THB, USD present; TH, US present); 400 `unknown` field errors | manual runtime | not run |
| BT-CUS-16 | body limit / BE-CUS-003 | inside network | POST 300 KB JSON directly to partner | 413; gateway valid max input (20 addresses at max lengths) accepted and < 256 KB | manual runtime | not run |
| BT-CUS-17 | logs / BE-CUS-005, 007 | all mutations | inspect partner + gateway logs | no service token, name, code, email, phone, tax ID or address text; events contain actor/customer IDs | log review | not run |
| BT-CUS-18 | regression / ADR-0018 check 10 | full dev stack | login, user-permission list/create, license status | unchanged behavior | manual runtime | not run |
| BT-CUS-19 | static checks / all | implemented code | `pnpm -r lint`, `pnpm -r typecheck`, `pnpm -r build`, `docker compose -f docker-compose.yml -f docker-compose.dev.yml config -q` | pass | static | not run |
| BT-CUS-20 | capacity / BE-CUS-011 | dev stack with 10 000 seeded customers | measure partner RSS idle/under 20 parallel list calls; list p95; create p95 | recorded numbers; RSS well under 512 MiB; no guarantee claimed | measurement | not run |
| BT-CUS-21 | startup ordering / BE-CUS-011 | fresh volume | `docker compose up` (auth + partner migrate concurrently) | both migrations succeed (or the infra-chosen restart/ordering recovers) | manual runtime | not run |

## Results — backend run 2026-10-14 (branch `feat/14-10-26-customer`, no Compose wiring yet)

Approval: owner 2026-10-14T11:45+07:00 "อนุมัติ customer ทั้งชุด ใช้ค่าแนะนำ เเต่ป้าย Default สีตัวอักษร #22C55E สีป้าย#C1EFD2" (UI rev 1, SA rev 1, infra backend-api-partner/1 with recommended D1–D4).
Method: partner run ad hoc on the dev Compose network (`docker compose run -d --name f1-partner-dev … backend-api-auth`, `node dist/main.js`, random 48-char test token), a second ad-hoc gateway (`f1-gateway-partner-test`, port 4100, `node dist/main.js`) wired to it, scripted `fetch` checks from inside those containers, SQL via `psql` in the postgres container. Test rows used the `BTCUS` prefix and were deleted afterwards; ad-hoc containers and verify images were removed. Direct partner script: 51/51 pass; gateway tRPC script: 21 pass + 1 fixture failure (see BT-CUS-10), then 3 + 1 + 3 targeted passes.

| Case | Result | Evidence |
|---|---|---|
| BT-CUS-00 | **pass** | before: `public._prisma_migrations` 5 rows, no schema `partner`; after `prisma migrate deploy` (URL `?schema=partner`): `to_regclass('partner._prisma_migrations')` set, row `20261014120000_customer` finished, `public` still 5 rows and only `_prisma_migrations` table; auth `prisma migrate status` "Database schema is up to date!" (5 migrations). Fresh scratch DB under the hardened image: `partner._prisma_migrations` 1 row, `public._prisma_migrations` absent (scratch DB dropped) |
| BT-CUS-01 | **pass** | `prisma validate` ok; `prisma migrate diff --from-config-datasource --to-schema prisma/schema.prisma --script --exit-code` → "empty migration", exit 0 (partial index `customer_address_one_default_key` kept, D-03 preview path used, no fallback); 9 CHECK constraints in `pg_constraint` for schema `partner`. `--from-migrations` variant not run (needs a shadow DB); the live-DB diff after deploy is used instead |
| BT-CUS-02 | **pass** | direct + gateway (Super Admin): `{id, updatedAt}`; 2 invoice + 1 shipping, first of each type default, positions 1..n, email lowercase; SQL: `created_by` = actor for all rows, `name_key`/`code_key`/`email` = `lower()` for all rows |
| BT-CUS-03 | **pass** | empty name `name/too_small`, bad email `email/invalid_format`, missing invoice array, 11 shipping `too_big`, `taxId` on shipping `shippingAddresses.0/unrecognized_keys`, unknown key `id` `(root)/unrecognized_keys`, `invoiceAddresses.0.postcode/too_small`, malformed JSON 400, `text/plain` 415; nothing written (total unchanged) |
| BT-CUS-04 | **pass** | `[{"path":"invoiceAddresses","code":"multiple_defaults"}]` (partner) and `shippingAddresses` (gateway) |
| BT-CUS-05 | **pass** | `btcus-c-0001 ` vs `BTCUS-C-0001` → 409 `CUSTOMER_CODE_TAKEN` `[{path:"code",code:"duplicate"}]`; two null/blank-code customers 201; parallel same code → 201 + 409 |
| BT-CUS-06 | **pass** | 120 seeded: pages 50/50/20, 120 unique IDs, `total` 120 on every page; code fragment (11), name fragment (10), `%`/`_` literal (1/0/0), `active=false` 30; `limit=51` 400; bad cursor `[{path:"cursor",code:"invalid"}]`; unknown query key 400; gateway list/limit/cursor same |
| BT-CUS-07 | **pass** | update 200, version advanced; addresses replaced (positions 1,2,3, all new IDs, chosen default kept); stale `expectedUpdatedAt` → 409 `CUSTOMER_STALE`, row unchanged; two back-to-back updates strictly increase; missing id 404; taken code 409; no-millisecond timestamp 400; gateway update/stale same |
| BT-CUS-08 | **pass** | delete `{ok:true}`, repeat 404; SQL: 0 orphan address rows; gateway same |
| BT-CUS-09 | **pass** | random UUID 404 `CUSTOMER_NOT_FOUND`; non-UUID 400 (partner and gateway) |
| BT-CUS-10 | **pass** | first run failed only because the dev DB's `user@demo.com` had **0** grants (not the seed state) — a fixture fact, not a code defect, no corrective pass used; that run is the user-B evidence (all `FORBIDDEN/PERMISSION_DENIED`). User A: temporarily inserted `customer:VIEW` → list/get/options 200, create/update/delete 403 `PERMISSION_DENIED`; grant removed again (0 rows restored). Super Admin: all operations ok |
| BT-CUS-11 | **partial** | no cookie → `UNAUTHORIZED`. Restricted-license case not run (would need changing the mock license) |
| BT-CUS-12 | **partial** | in-network: no token 401, wrong token 401, token prefix 401, correct 200. Host `localhost:3201` refused **not run** — needs BE-CUS-011 Compose service |
| BT-CUS-13 | **pass** | POST/DELETE without actor → 400 `(header).x-actor-user-id`; invalid actor 400; body `createdBy` → 400 `unrecognized_keys`; nothing written |
| BT-CUS-14 | **pass (ad hoc)** | wrong token: list/create → 503 `PARTNER_UNAVAILABLE`, session still 200, gateway log level 50 "partner rejected service token" without the value; unresolvable host 503 (2.3–2.8 s); blackhole IP: 503 after 3.06 s (read) / 5.0 s (write). Rerun with the real Compose partner stopped after BE-CUS-011 |
| BT-CUS-15 | **pass** | 162 currencies sorted by code (THB "Thai Baht", USD), 249 countries sorted by name (TH "Thailand", US); `XQQ`/`ZZ` → `unknown` field errors |
| BT-CUS-16 | **pass** | 300 KB direct POST → 413 `PAYLOAD_TOO_LARGE`; max valid input (20 addresses at max lengths) ≈ 21.5 KB JSON accepted directly and via gateway; gateway body > 1 MiB → 413 (tRPC `maxBodySize`) |
| BT-CUS-17 | **pass (ad-hoc logs)** | partner log (321 lines) and gateway logs: 0 matches for the token, `BTCUS`, email, phone, tax ID, address text, `authorization`, query strings; partner request logs carry only id/method/path; events `customer.created/updated/deleted` with actor/customer IDs, counts and changed field names |
| BT-CUS-18 | **pass (stack)** | stack gateway restarted with new code: login 200, `session.current`, `license.status`, `userAdmin.list`, `permission.mine` 200; `customer.list` fails closed 503 `PARTNER_UNAVAILABLE` (stack gateway has no partner env yet); `dashboard.shortcutGroups` 200 |
| BT-CUS-19 | **partial** | partner typecheck/lint/build exit 0; gateway typecheck/lint/build exit 0; image builds exit 0 for `backend-api-partner/Dockerfile`, `docker/dev.Dockerfile` (partner `db:generate` ran), `backend-api-gateway/Dockerfile`, `backend-api-auth/Dockerfile` (all `--frozen-lockfile`). Not run: root `pnpm -r …` (frontend is another agent's scope), `frontend/Dockerfile` build, `docker compose … config -q` (BE-CUS-011) |
| BT-CUS-20 | **partial** | hardened image idle RSS 80 MiB of 512 MiB; 10 000-row load/p95 not run (needs BE-CUS-011) |
| BT-CUS-21 | **not run** | needs BE-CUS-011 Compose (concurrent auth + partner migrate on fresh volume) |

Infra P5 (read-only root, uid 1000): image `CMD` run with `--read-only --tmpfs /tmp --cap-drop ALL --security-opt no-new-privileges --pids-limit 128 --cpus 0.35 --memory 512m`: `id` uid 1000, `touch /app/x` EROFS, `migrate deploy` ok (existing and fresh DB), `/health/ready` `{"status":"ok"}`. Not verified: running as a non-superuser `f1_partner` role without database `CREATE` (production bootstrap item).
Fail-fast (BE-CUS-003/009): partner exits 1 for a 31-char token, the `.env.example` token in production, and a missing token in development; it throws on start without `PARTNER_DATABASE_URL` in production; gateway throws on start in production without `PARTNER_SERVICE_TOKEN`.

## Results — infra BE-CUS-011 run (2026-10-14, branch `feat/14-10-26-customer`, local dev stack)

Stack: `docker-compose.yml` + `docker-compose.dev.yml` (Docker Engine 29.8.0 / Compose 5.5.1,
Docker Desktop on Windows 11). Partner runs the shared dev image in the dev stack; the hardened
base definition was checked separately with a one-off `docker compose -f docker-compose.yml run`
container (removed afterwards). Infra record: [backend-api-partner/1](../../../../infra/services/backend-api-partner/1/security.md#implementation-record-be-cus-011-2026-10-14).
Token values were never printed; equality was checked by SHA-256 comparison only.

| ID | Result | Evidence |
|---|---|---|
| BT-CUS-12 | **pass** | from the gateway container to `http://backend-api-partner:3201/internal/v1/customers/options`: no token 401, wrong 48-char token 401, 20-char token prefix 401, correct token 200; gateway and partner tokens identical (hash compare); host `curl -m 3 http://localhost:3201/health/live` → exit 7 (connection refused); base Compose renders no `ports` for partner, running container `PortBindings {}`; token string found 0 times in partner + gateway logs |
| BT-CUS-19 | **partial (compose part pass)** | `docker compose -f docker-compose.yml config --quiet` exit 0; `… -f docker-compose.dev.yml config --quiet` exit 0; `config --services` lists `backend-api-partner`; `docker compose -f docker-compose.yml build backend-api-partner` exit 0. A first render failed (`can't set distinct values on 'pids_limit' and 'deploy.resources.limits.pids'`, Compose 5.5.1) and was fixed by using `deploy.resources.limits.pids: 128`. Not run by infra: root `pnpm -r lint/typecheck/build`, `frontend/Dockerfile` build, full `docker compose build` |
| BT-CUS-20 | **partial** | idle only: dev-stack partner (watch mode: pnpm + nest `--watch` + tsc) 400 MiB / 512 MiB, 36 pids, not OOM-killed; hardened base one-off 74.5 MiB / 512 MiB, 12 pids. 10 000-row seeded load / p95 **not run** (would seed the shared dev DB; needs explicit selection) |
| BT-CUS-21 | **not run** | needs a fresh postgres volume; the shared dev volume was deliberately preserved (no `down -v`). Observed on the existing volume: partner `migrate deploy` "No pending migrations", auth unaffected |

Additional infra checks (bundle ids):

| Check | Result | Evidence |
|---|---|---|
| P1 base hardening | pass | one-off base container: `User 1000:1000`, `ReadonlyRootfs true`, `CapDrop [ALL]`, `no-new-privileges:true`, `PidsLimit 128`, `Memory 536870912`, `NanoCpus 350000000`, `Init true`, `/tmp` tmpfs `size=16m,mode=1777,noexec,nosuid,nodev`, networks `partner-api partner-db` only, healthy after ~25 s |
| P2 | pass | `id -u`/`id -g` 1000/1000; `touch /app/x` → Read-only file system; `/tmp` writable |
| P3 gateway → partner | pass | signed in as superadmin via `POST http://localhost:3000/api/auth/sign-in/email` (200); `GET /api/trpc/customer.options` → 200, 162 currencies (THB present), 249 countries, 0.12 s; `customer.list` with `{}` input → 200; unauthenticated `customer.options` → 401; gateway → partner `/health/ready` 200 |
| P4 / P5 | pass | `partner._prisma_migrations` holds `20261014120000_customer` (finished); auth history stays in `public._prisma_migrations`; base one-off (NODE_ENV=production, read-only root, no egress) ran `migrate deploy` without EROFS/ENOENT and started |
| P6 regression | pass (smoke) | `/login` 200, sign-in 200, `session.current` 200; auth and frontend containers running |
| N2 | pass | `dns.lookup('backend-api-partner')` from frontend and backend-api-auth → ENOTFOUND; direct `fetch` to both partner IPs (partner-api, partner-db) from frontend and auth → timeout |
| N3 | pass | see BT-CUS-12 |
| N4 | pass | from partner (dev and base): `https://example.com` → EAI_AGAIN, `http://1.1.1.1` → ENETUNREACH, `backend-api-auth` → ENOTFOUND |
| Data preservation | pass | before / after: `auth."User"` 2 / 2, `public._prisma_migrations` 5 / 5, `partner._prisma_migrations` 1 / 1, `partner.customer` 0 / 0; postgres recreated once (D4), volume `f1-system_postgres-data` kept |
| N5, C1 | not run | N5 needs the production `f1_partner` role (dev uses `f1_user`); C1 load as BT-CUS-20 |
