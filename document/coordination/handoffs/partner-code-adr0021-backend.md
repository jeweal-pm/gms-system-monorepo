# Handoff: partner Code Name required + running-number suggestion (ADR-0021) — backend → parent / frontend

- Feature ID / UI revision: `customer` UI revision 2, `vendor` UI revision 3
- SA revision / source UI revision: customer SA 2 / UI 2; vendor SA 2 / UI 3
- From role/scope: backend (`senior-nestjs-developer`): `backend-service` (partner), `backend-gateway-rpc`, `backend-api-partner/prisma/**` (integration-owned, single writer in this run)
- To role/scope / parent integration owner: parent → frontend (FE-CUS-020/021, FE-VEN-015/016 already wired against this contract) and parent → `sec-auditor` + `security-auditor`
- Exact TODO IDs and source documents: BE-CUS-016…022 in [customer TODO](../../task/todo/customer.md#revision-adr-0021-backend), BE-VEN-016…022 in [vendor TODO](../../task/todo/vendor.md#revision-adr-0021-backend); [ADR-0021](../../adr/0021-partner-code-running-number-and-record-modes.md); SA bundles [customer](../../apps/backend/partner/customer/api-contract.md#revision-2--adr-0021-implemented-2026-10-16), [vendor](../../apps/backend/partner/vendor/api-contract.md#revision-2--adr-0021-implemented-2026-10-16)
- Approval status, approved revision, and owner evidence: ADR-0021 Accepted; owner 2026-10-16, full quote in the ADR, ending "ทำ adr เเล้วเริ่มทำเลย"
- Required contract / diagrams / ADRs: below; ADR-0018, ADR-0019 (unchanged except the `code` rule)
- Dependency ledger entries and installation status: **no new dependency**. Tests use Node's built-in `node:test` (Node 24.11.0 in the dev image); no `package.json`/lockfile change
- Allowed code/document paths: as listed in the TODO rows
- Integration-owned changes: `backend-api-partner/prisma/schema.prisma` and new migration `backend-api-partner/prisma/migrations/20261016090000_partner_code_required/migration.sql`. No manifest, lockfile, composition root, Docker/Compose or `.env` change
- Infra / DevOps: none. No container, image, network, variable or build change (ADR-0021 §5)
- Resource budget / capacity impact: one read-only aggregate query per `nextCode` call (sequential scan of `customer`/`vendor`, bounded by table size; no transaction, uses the existing pool of 5); no new process, cache or job
- Source revision: branch `feat/16-10-26-fix-design-add-runingnumber`, HEAD `974134c` + uncommitted working tree; backend content hash `7bf1dae7582b00c6`. Not committed or pushed

## Final contract

### tRPC (gateway, browser-facing)

| Procedure | Input | Output | Permission | Errors (`data.domainCode` / `data.fieldErrors`) | Timeout |
|---|---|---|---|---|---|
| `customer.nextCode` query | none | `{ code: string }` e.g. `{ code: "C001" }` | `permittedProcedure("customer", "ADD")` | `UNAUTHORIZED`, `LICENSE_*`, `PERMISSION_DENIED`, `PARTNER_UNAVAILABLE`, `CUSTOMER_NOT_FOUND` (partner 404 fallback only) | 3 s |
| `vendor.nextCode` query | none | `{ code: string }` e.g. `{ code: "V001" }` | `permittedProcedure("vendor", "ADD")` | same with `VENDOR_NOT_FOUND` | 3 s |
| `customer.create` / `customer.update`, `vendor.create` / `vendor.update` | unchanged except `code` | unchanged | unchanged | see `code` errors below; `CUSTOMER_CODE_TAKEN` / `VENDOR_CODE_TAKEN` unchanged | unchanged |

Output `code` matches `^[CV][0-9]{3,19}$`. Format: prefix + the number zero-padded to at least 3 digits
(`C001`, `C999`, `C1000`). Rule: max numeric suffix of codes matching `^[Cc][0-9]+$` / `^[Vv][0-9]+$` with at most 18
significant digits, plus 1; `1` when none match. The max is computed in PostgreSQL as `bigint`. This is a
**suggestion, not a reservation**: if two creates race, one gets `409 *_CODE_TAKEN` and the client refetches `nextCode`.

**`code` input rule (create and update, gateway and partner identical):** `z.string().trim().max(120)` with a custom
check for empty input.

| Input | Result |
|---|---|
| `" C001 "` | stored `"C001"` (trimmed); `code_key = "c001"` |
| `""`, `"   "` | `BAD_REQUEST` / `VALIDATION_ERROR` / `[{path:"code", code:"required"}]` |
| missing key, `null`, non-string | `BAD_REQUEST` / `VALIDATION_ERROR` / `[{path:"code", code:"invalid_type"}]` |
| 121+ characters | `[{path:"code", code:"too_big"}]` |
| same code as another record of the same entity (any case/spaces) | `CONFLICT` / `CUSTOMER_CODE_TAKEN` or `VENDOR_CODE_TAKEN` / `[{path:"code", code:"duplicate"}]` |

Gateway `describeError` now reports a zod `custom` issue by its `params.code` when that is a non-empty string.
This is what makes `required` appear above. Other issue codes are unchanged.

List items and detail outputs always contain a non-empty `code` after the migration. The gateway output schema
still types it as `string | null` for compatibility.

### Partner internal REST

`GET /internal/v1/customers/next-code` and `GET /internal/v1/vendors/next-code`: service token required (401
otherwise), response `200 {"code":"C001"}` / `{"code":"V001"}`. Both are declared before `/:id`. POST/PUT bodies
apply the same `code` rule with the same envelopes. The ADR's `GET /customers/next-code` is mounted under the
existing `/internal/v1` prefix.

### Database

Migration `20261016090000_partner_code_required` backfills rows where `code IS NULL`. Each gets the next running
number in `created_at, id` order, with `code_key = lower(code)`. The migration then sets `code` and `code_key` to
`NOT NULL` on `partner.customer` and `partner.vendor`, so no data is lost. On the dev DB it was applied at partner
start; there were no NULL rows to backfill.

## Verification completed

- partner: `node --test --test-concurrency=1 'test/*.test.mjs'` → 37/37 pass (UT-PC-01…04, IT-PC-01…08)
- gateway: same command → 23/23 pass (UT-GW-PC-01…04, IT-GW-PC-01…04 via `createCaller` and a stub partner, IT-GW-PC-LIVE-01…04 via HTTP `/trpc` with a real session)
- partner and gateway `typecheck` and `lint` exit 0 (`CI=true pnpm --store-dir=/root/.local/share/pnpm/store --filter … typecheck|lint`)
- `prisma validate` ok; `prisma migrate diff --from-config-datasource --to-schema` empty; `migrate status` up to date
- backfill tested on a scratch DB (dropped afterwards): `C011…C013` came after `c010`, and a 24-digit code was ignored; `V999`, `V1000`, `V1001`; an empty table works; a NULL insert is rejected afterwards
- live dev stack: `nextCode` → `C001` / `V001`; create without code → 400; duplicate → 409; all test rows deleted
- Not run: `nest build`/image builds (no build change); security reviews (BE-CUS-022 / BE-VEN-022, parent)

## Blocking / resume

- Blocking: the focused security reviews (`sec-auditor` + `security-auditor`) on hash `7bf1dae7582b00c6` must both be recorded before this handoff counts as final for frontend delivery.
  - Trust boundaries: browser → gateway (`permittedProcedure` ADD on `nextCode`); gateway → partner (service token, actor header).
  - Raw SQL in `nextPartnerCode`: the regex and the digit limit are bound parameters, and the table identifier is fixed.
  - The migration backfill.
- Resume: frontend continues FE-CUS-020/021 and FE-VEN-015/016 validation against this contract. No frontend change is required by the backend result; the frontend record shows it already maps `required`.
- Corrective ledger: pass limit 3, allocated 0, no active pass. No defect was found.
- Rollback note: a previous gateway/frontend that sends `code: null` would now hit a DB NOT NULL error. Roll back only with the forward `DROP NOT NULL` migration described in the database-diagram Revision 2.
