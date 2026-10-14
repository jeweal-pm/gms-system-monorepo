# Handoff: customer backend → parent / frontend / infra / devops

- Feature ID / UI revision: `customer` / 1
- SA revision / source UI revision: 1 / 1 ([bundle](../../apps/backend/partner/customer/architecture.md)); infra bundle `backend-api-partner/1`
- From role/scope: backend (senior-nestjs-developer), claim [tasks/customer-backend.md](../tasks/customer-backend.md)
- To role/scope / parent integration owner: parent → infra (BE-CUS-011), frontend (wire fixtures to tRPC), devops (BE-CUS-012)
- Exact TODO IDs and source documents: BE-CUS-001…010, 013 (backend part), 014 (partial), 015 in [customer.md](../../task/todo/customer.md); ADR-0018 rev 1
- Approval status, approved revision, and owner evidence: approved, owner 2026-10-14T11:45+07:00 "อนุมัติ customer ทั้งชุด ใช้ค่าแนะนำ เเต่ป้าย Default สีตัวอักษร #22C55E สีป้าย#C1EFD2" (UI 1 + SA 1 + infra backend-api-partner/1, D1–D4 recommended, no idempotency key)
- Required contract / diagrams / ADRs: [api-contract.md](../../apps/backend/partner/customer/api-contract.md) incl. "Implementation notes (backend, 2026-10-14)", [error-handling.md](../../apps/backend/partner/customer/error-handling.md), [authorization.md](../../apps/backend/partner/customer/authorization.md)
- Dependency ledger entries and installation status: no new package; lockfile importer `backend-api-partner` added ([tech-stack row](../../adr/tech-stack.md))
- Allowed code/document paths: as in the task claim

## Delivered contract (actual, verified)

tRPC (browser via `/api/trpc`), all `permittedProcedure("customer", …)`:

| Operation | Permission | Input → output | Domain errors (`data.domainCode`) |
|---|---|---|---|
| `customer.list` query | VIEW | `{q?, active?, cursor?, limit? (1–50, default 50)}` → `{items[{id,name,code,active,updatedAt}], nextCursor, total}` | `VALIDATION_ERROR` (bad cursor `[{path:"cursor",code:"invalid"}]`), `PERMISSION_DENIED`, `PARTNER_UNAVAILABLE` |
| `customer.get` query | VIEW | `{id: uuid}` → `CustomerDetail` | `CUSTOMER_NOT_FOUND`, `VALIDATION_ERROR`, `PERMISSION_DENIED`, `PARTNER_UNAVAILABLE` |
| `customer.options` query | VIEW | none → `{currencies[{code,name}] (162, by code), countries[{code,name}] (249, by name)}` | `PERMISSION_DENIED`, `PARTNER_UNAVAILABLE` |
| `customer.create` mutation | ADD | customer fields → `{id, updatedAt}` | `VALIDATION_ERROR`, `CUSTOMER_CODE_TAKEN` (`[{path:"code",code:"duplicate"}]`), `PERMISSION_DENIED`, `PARTNER_UNAVAILABLE` |
| `customer.update` mutation | EDIT | `{id, expectedUpdatedAt (ms precision, Z), ...all fields}` → `{id, updatedAt}` | + `CUSTOMER_NOT_FOUND`, `CUSTOMER_STALE` |
| `customer.delete` mutation | DELETE | `{id}` → `{ok: true}` | `CUSTOMER_NOT_FOUND` (treat as already deleted), `PERMISSION_DENIED`, `PARTNER_UNAVAILABLE` |

tRPC codes: `BAD_REQUEST` 400, `FORBIDDEN` 403, `NOT_FOUND` 404, `CONFLICT` 409, `PAYLOAD_TOO_LARGE` 413, `SERVICE_UNAVAILABLE` 503 (`PARTNER_UNAVAILABLE`, never `UNAUTHORIZED` for token problems), `INTERNAL_SERVER_ERROR`. Field-error paths are dot-joined (`invoiceAddresses.0.postcode`); codes are zod 4 issue codes plus `duplicate`, `unknown`, `multiple_defaults`, `invalid`. Unknown keys → `{path:"(root)" or nested object path, code:"unrecognized_keys"}`. Zero defaults in an array → first entry stored as default. Create is not idempotent: after a create/update timeout, refetch list/record before allowing resubmit (owner decision).

Additive: `dashboard.shortcutGroups` Customer item is `{label:"Customer", slug:"customer", href:"/setup/customer"}` (others unchanged). **Frontend follow-up:** `frontend/src/features/home/home-dashboard.tsx` builds `/modules/${item.slug}` and ignores `href`; use `navigationHref(item)` (already in `navigation.ts`) so the dashboard tile opens `/setup/customer`. Backend did not touch frontend source.

## Changed files

- New: `backend-api-partner/**` (package.json, tsconfig*.json, nest-cli.json, Dockerfile, prisma.config.ts, prisma/schema.prisma, prisma/migrations/{migration_lock.toml,20261014120000_customer/migration.sql}, src/{main.ts,app.module.ts,config.ts,common/*,database/*,internal-auth/*,health/*,customer/*})
- Gateway: `src/trpc/{partner-client.ts (new), customer-schemas.ts (new), router.ts}`, `src/main.ts`
- Shared (BE-CUS-010): root `package.json` (`dev`, `db:generate`, `db:migrate` cover partner; migrate serialized with `--workspace-concurrency=1`), `pnpm-lock.yaml`, partner `COPY` line in `backend-api-auth/Dockerfile`, `backend-api-gateway/Dockerfile`, `frontend/Dockerfile`, `docker/dev.Dockerfile` (+ partner `db:generate`), `document/coordination/ownership.yaml` (`backend-api-partner/prisma/**`)
- Migration applied to the dev DB: `partner._prisma_migrations` → `20261014120000_customer`; `public` untouched

## Infra (BE-CUS-011) — env to wire

- Partner container: `PARTNER_DATABASE_URL` (must keep `?schema=partner`; runtime strips it and uses adapter `{schema:"partner"}`), `PARTNER_SERVICE_TOKEN` (≥ 32 chars; production refuses the `.env.example` value `local-development-partner-token-change-before-deploy-0000` — keep `.env.example` byte-identical to that or tell backend), `PORT` (default 3201), `NODE_ENV`, `NODE_OPTIONS=--max-old-space-size=320`, `PRISMA_HIDE_UPDATE_MESSAGE`/`CHECKPOINT_DISABLE` (already set in the image). Listens `0.0.0.0:3201`; health `GET /health/live`, `GET /health/ready` (no token).
- Gateway container: `PARTNER_SERVICE_URL=http://backend-api-partner:3201`, `PARTNER_SERVICE_TOKEN` (same value; production gateway refuses start if < 32 chars).
- Dev override: partner command `db:generate && db:migrate && exec … dev` per infra bundle; dev volumes `dev-partner-node-modules`, `dev-partner-prisma`; the dev gateway also needs the two `PARTNER_*` variables, otherwise `customer.*` returns `PARTNER_UNAVAILABLE`.
- Root `docker:dev:install` restart list: add `backend-api-partner` together with the Compose service (not done; it would fail before the service exists).
- Verified for infra: image CMD runs as uid 1000 with `--read-only`, `/tmp` tmpfs, cap_drop ALL, no-new-privileges, 0.35 CPU / 512 MiB; `migrate deploy` ok on existing and fresh DB; idle RSS 80 MiB. Not verified: `f1_partner` non-superuser without database `CREATE`. Optional readiness `rolsuper` guard (infra req. 4) not implemented — base Compose defaults to superuser `f1_user` with `NODE_ENV=production`, so it would fail readiness locally.

## DevOps (BE-CUS-012)

New package `@gem-crm/backend-api-partner` (`lint`, `typecheck` = prisma generate + tsc, `build`), image `backend-api-partner/Dockerfile` (linux/amd64, uid 1000, port 3201, readiness `/health/ready`), runtime-only vars above (never build args). All four existing Dockerfiles changed (one `COPY` line) → all images rebuild.

- Resource budget / capacity impact: +0.35 vCPU / 512 MiB per ADR-0018 (total 3.2 / 5.5 GiB); pg pool max 5, acquire timeout 2 s, idle 30 s
- Verification completed / not run: see [testing.md results](../../apps/backend/partner/customer/testing.md); not run: BT-CUS-12 host check, BT-CUS-14 against Compose partner, BT-CUS-19 compose config + frontend image + root `pnpm -r`, BT-CUS-20 load, BT-CUS-21 (all need BE-CUS-011), BT-CUS-11 restricted-license case
- Blocking item, if any: none for frontend wiring against the contract; live end-to-end needs BE-CUS-011
- Resume action and destination: parent → infra BE-CUS-011 → frontend replaces fixtures with `trpc.customer.*` + dashboard `href` → devops BE-CUS-012 → rerun BT-CUS-12/14/19/20/21
- Corrective work: none opened (BT-CUS-10 first-run failure was a dev-DB fixture fact, not a defect); passes allocated 0
- Deviations from the SA bundle: listed in the claim and final report — pool `connectionTimeoutMillis` 2 000 ms (SA) instead of infra's suggested 5 000; committed migration SQL is schema-qualified; BT-CUS-01 diff uses the live DB (`--from-config-datasource`) not `--from-migrations`; gateway default rule checked in the handler; `name_key`/`code_key`/`email` lowered by PostgreSQL; update via `updateMany` + app-computed version (allowed alternative)
