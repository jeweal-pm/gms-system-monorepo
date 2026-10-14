# Task claim: customer backend (BE-CUS-001…010, 013 docs, 014 checks, 015 handoff)

- Agent/vendor: senior-nestjs-developer (backend), launched by the parent integration owner
- Feature ID / UI revision: `customer` / 1
- SA revision (when applicable): 1 ([bundle](../../apps/backend/partner/customer/architecture.md)); infra bundle `backend-api-partner/1` ([security.md](../../infra/services/backend-api-partner/1/security.md))
- Source TODO and review bundle: [document/task/todo/customer.md](../../task/todo/customer.md) "Backend items"; ADR-0018 rev 1
- User approval evidence: owner 2026-10-14T11:45+07:00: "อนุมัติ customer ทั้งชุด ใช้ค่าแนะนำ เเต่ป้าย Default สีตัวอักษร #22C55E สีป้าย#C1EFD2" — approves UI rev 1, SA rev 1, infra bundle backend-api-partner/1 with recommended options (D1 keep `node:24.11.0`; D2 `f1_partner` owns schema `partner`, `migrate deploy` at container start, DEV keeps `f1_user`; D3 env secrets with fail-fast token; D4 two internal networks; create timeout = UI refreshes list before retry, no idempotency key).
- Branch / worktree: `feat/14-10-26-customer` (main checkout; no commit/push)
- Ownership scope from `document/coordination/ownership.yaml`: backend-service (`backend-api-partner/src/**`), backend-gateway-rpc (`backend-api-gateway/src/trpc/**`); integration-owned files below assigned by the parent for BE-CUS-010
- Allowed paths: `backend-api-partner/**`; `backend-api-gateway/src/trpc/{partner-client.ts,customer-schemas.ts,router.ts}`; `backend-api-gateway/src/main.ts`; root `package.json` scripts; `pnpm-lock.yaml` (pnpm only); the partner `COPY` line in `backend-api-auth/Dockerfile`, `backend-api-gateway/Dockerfile`, `frontend/Dockerfile`, `docker/dev.Dockerfile` (+ partner `db:generate`); `document/coordination/ownership.yaml` (`backend-api-partner/prisma/**`); SA bundle implementation notes/testing results; `document/adr/tech-stack.md` ledger row; this claim and handoff `document/coordination/handoffs/customer-backend.md`. NOT: `docker-compose*.yml`, `.env.example`, `frontend/src/**`, `backend-api-auth/src/**`.
- Expected output and acceptance criteria: TODO rows BE-CUS-001…010 acceptance; BT-CUS checks run where possible without Compose
- Dependency proposals / approved installations: none new (new lockfile importer only)
- Integration-owned edits requested: listed under allowed paths (assigned by parent)
- Status: ready-for-integration (2026-10-14; BE-CUS-011 Compose wiring pending with infra)
- Verification evidence and next handoff: see [handoff](../handoffs/customer-backend.md) and [testing.md](../../apps/backend/partner/customer/testing.md)

## Corrective-work ledger (when fixing a defect)

- Work ID / root-cause fingerprint / duplicate links: none opened
- Pass limit: 3 (initial fix included)
- Passes allocated: 0
- Active pass: none

## Deviations recorded

- Pool `connectionTimeoutMillis` 2 000 ms per SA architecture/error-handling (infra text "suggest 5 000"; both finite; 2 s keeps pool wait under the gateway 3 s read timeout).
- Committed migration SQL is fully `"partner".`-qualified (generated with a URL without `schema`), independent of `search_path`.
- BT-CUS-01 drift check against the live DB (`--from-config-datasource`) because `--from-migrations` needs a shadow DB.
- Gateway enforces the one-default rule in the procedure (not zod `superRefine`) to emit `multiple_defaults` through the unchanged `describeError`.
- `name_key`, `code_key`, `email` lowered by PostgreSQL `lower()` in the write transaction (JS/PG case-mapping parity for CHECKs).
- Optional infra readiness `rolsuper` guard not implemented (would fail the local base Compose that defaults to `f1_user`).
- Root `docker:dev:install` restart list not extended until the Compose service exists.
- Coordinator addition: `dashboard.shortcutGroups` Customer `href: "/setup/customer"` (additive; frontend dashboard must honor `href`).
