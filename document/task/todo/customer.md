# Frontend TODO: customer

- feature-id: `customer`
- revision: 1
- status: approved
- source: three owner-supplied screenshots (2026-10-14) in [source/](../../apps/frontend/customer/source/) (1920×1080 each; assumed 1920×1080 CSS at DPR 1)
- ui-spec: [ui-spec.md](../../apps/frontend/customer/ui-spec.md)
- adr: [ADR-0018](../../adr/0018-customer-master-partner-service.md) revision 1 — **Accepted** 2026-10-14, owner: "อนุมัติ ADR-0018". Binding for this TODO; not re-opened here.
- dependencies: [dependencies.md](../../apps/frontend/customer/dependencies.md) (no new packages)
- backend-bundles: SA revision 1 draft (**pending-review**, written in parallel; not approved): [document/apps/backend/partner/customer/](../../apps/backend/partner/customer/) and [customer-flow.md](../../diagram/customer-flow.md). Infra draft: `document/infra/services/backend-api-partner/1/` (pending). The UI documents are aligned to the SA draft's [api-contract.md](../../apps/backend/partner/customer/api-contract.md).
- approved-revision: UI revision 1 + SA revision 1 + infra bundle backend-api-partner/1
- approved-by: project owner
- approved-at: 2026-10-14T11:45+07:00
- approval-evidence: owner: "อนุมัติ customer ทั้งชุด ใช้ค่าแนะนำ เเต่ป้าย Default สีตัวอักษร #22C55E สีป้าย#C1EFD2". Recommended values adopted: infra D1 keep `node:24.11.0` (separate ticket to bump all images), D2 `f1_partner` owns schema and migrates at start, D3 env secrets with fail-fast token, D4 two internal networks; backend: UI refreshes the list before retrying a timed-out create (no idempotency key); UI Q-CUS-01…05 documented defaults; Q-CUS-06 overridden: Default badge text `#22C55E` on `#C1EFD2`.
- review-bundle: [ui-spec](../../apps/frontend/customer/ui-spec.md), [open questions and conflicts](../../apps/frontend/customer/open-questions.md), [design system](../../apps/frontend/customer/design-system.md), [conventions](../../apps/frontend/customer/conventions.md), [form guidelines](../../apps/frontend/customer/form-guidelines.md), [data fetching](../../apps/frontend/customer/data-fetching.md), [error handling](../../apps/frontend/customer/error-handling.md), [dependencies](../../apps/frontend/customer/dependencies.md), [testing](../../apps/frontend/customer/testing.md), [ADR-0018](../../adr/0018-customer-master-partner-service.md)
- updated-at: 2026-10-14T10:45+07:00

## Implementation items

Status values: `pending` (can start after the owner approves UI revision 1), `blocked` (waits for the named
SA bundle, backend delivery or handoff). Nothing may start before UI approval. Open questions Q-CUS-01…06
are non-blocking; items use the documented defaults unless the owner answers otherwise.

| Done | ID | Status | Owner | Task / component | Allowed files | Depends on / requires-sa | Acceptance criteria | Verification |
|---|---|---|---|---|---|---|---|---|
| [ ] | FE-CUS-001 | in-progress (implemented 2026-10-14; browser checks not run) | frontend + parent | **Promote shared primitives** (move, not copy) per [conventions](../../apps/frontend/customer/conventions.md#shared-primitives-reuse-and-promotion): Button/IconButton, Card/CountBadge, FieldShell/TextField, PhoneField, Switch, Checkbox, ConfirmDialog, Toast → `components/ui/`; `phone.ts`, `readDomainError`/`retryTransient`/`isCallerLicenseCode` → `lib/`. Add: IconButton `aria-disabled`+tooltip, TextField disabled state, `SelectField`, `LabeledCheckbox`, `Badge` variants. Update user-permission imports only. | `frontend/src/components/ui/**` (new shared scope, parent claim); `frontend/src/lib/phone.ts`, `frontend/src/lib/trpc-error.ts` (integration-frontend-shared, parent serializes); `frontend/src/features/user-permission/**` (import paths only) | UI approval; parent scope claim for user-permission + new shared scope | No file left duplicated; user-permission behavior/appearance unchanged; no new package | typecheck, lint; TC-CUS-31 |
| [ ] | FE-CUS-002 | in-progress (implemented 2026-10-14; browser checks not run) | frontend | Route `/setup/customer` in `AppShell` (breadcrumb `Home › Setup › Customer`); add the "Customer" Setup tab (after "User and permission", Q-CUS-04) | `frontend/src/app/setup/customer/**`; `frontend/src/features/setup/setup-tabs.tsx`; `frontend/src/features/customer/**` | FE-CUS-001 | Route renders for a licensed session; tab active with `aria-current="page"`; existing session/license redirects unchanged | TC-CUS-01 |
| [ ] | FE-CUS-003 | in-progress (implemented 2026-10-14; browser checks not run) | frontend (frontend-home scope) | Sidebar Partner Master › Customer → `/setup/customer`: optional `href` on navigation items, used by `AppShell` for the link and the active state | `frontend/src/features/home/navigation.ts`, `frontend/src/features/home/app-shell.tsx` (cross-scope handoff; parent serializes) | FE-CUS-002; ADR §5 | Customer link opens `/setup/customer` and shows active; every other sidebar link unchanged; `/modules/customer` still renders (no removal) | TC-CUS-01; build |
| [ ] | FE-CUS-004 | in-progress (implemented 2026-10-14; browser checks not run) | frontend | Access guard + permission helper (`access.ts`): `permission.mine` (existing approved contract); VIEW gate; ADD/EDIT/DELETE flags; `"ALL"` for Super Admin; re-check on `PERMISSION_DENIED` | `frontend/src/features/customer/**` | FE-CUS-002 | No `customer.*` request without VIEW; denied/pending/error states per error-handling.md | TC-CUS-02, 03 |
| [ ] | FE-CUS-005 | in-progress (implemented 2026-10-14; browser checks not run) | frontend | Page header + toolbar (C-03/C-04): title per mode, "Customer list {total}", Print, Excel (`aria-disabled` + tooltip), Duplicate, Refresh, Delete (new), Create Customer / Save; visibility by permission | `frontend/src/features/customer/**` | FE-CUS-001, 004; Q-CUS-02/03 defaults | Matches S1 layout; [toolbar table](../../apps/frontend/customer/ui-spec.md#header-toolbar); labeled icon buttons; hidden when not permitted | TC-CUS-03, 04 |
| [ ] | FE-CUS-006 | in-progress (implemented 2026-10-14; browser checks not run) | frontend | Customer Information card: Code Name, Name\*, Currency\* (`SelectField`), Active switch, Basic Information (First\*, Middle, Last, Phone (optional), Email\*); 3-column grid capped ~1290 px | `frontend/src/features/customer/**` | FE-CUS-001; Q-CUS-01 default (US/TH) | Matches S1/S2 (notched labels, asterisks, grid cap); correct `autocomplete`/`inputMode`; read-only mode | TC-CUS-05, 09 |
| [ ] | FE-CUS-007 | in-progress (implemented 2026-10-14; browser checks not run) | frontend | Address cards (C-10/C-11/C-13): Invoice + Shipping side by side; accordion items with #n, Default badge, trash (#2+), default checkbox semantics (P-01), Country select enabling State/City text inputs (DV-04), dashed add buttons with corrected Shipping text (DV-06), 1–10 per type | `frontend/src/features/customer/**` | FE-CUS-001 | Matches S1–S3; first item not removable; exactly one default per type; add disabled at 10; State/City disabled until Country | TC-CUS-10..14 |
| [ ] | FE-CUS-008 | in-progress (implemented 2026-10-14; browser checks not run) | frontend | Zod schema + RHF (`useFieldArray`) mirroring ADR-0018 §3 exactly; error presentation (S1), item error frame (DV-12), auto-expand + focus first error | `frontend/src/features/customer/**` | FE-CUS-006, 007 | Every rule in [form-guidelines](../../apps/frontend/customer/form-guidelines.md); blur-then-change timing; button never disabled for invalid form | TC-CUS-06..09, 15; Node logic script over `schema.ts` |
| [ ] | FE-CUS-009 | in-progress (implemented, live data wired 2026-10-14; browser checks not run) | frontend | Customers drawer (C-15/C-16): title "Customers" + total, search (debounced, server), draft row showing the typed Name/Code Name, rows Name / Code Name, status dot, Inactive badge, selection, infinite paging (50) + Load more, loading/empty/no-match/error | `frontend/src/features/customer/**` | FE-CUS-001; data shape SA-CUS-02 | Matches S1/S3; push layout S2; `aria-expanded` toggle; ≤ 50 rows per request | TC-CUS-16..20 |
| [ ] | FE-CUS-010 | in-progress (implemented 2026-10-14; browser checks not run) | frontend | Unsaved-changes guard: discard ConfirmDialog for Refresh, row switch, draft row, Duplicate; `beforeunload` while dirty | `frontend/src/features/customer/**` | FE-CUS-008 | No prompt when clean; Keep editing preserves values; Esc = keep | TC-CUS-21 |
| [ ] | FE-CUS-011 | in-progress (implemented 2026-10-14; browser checks not run) | frontend | Duplicate: copy the saved customer into a new draft, clear Code Name and address IDs, toast, focus Name | `frontend/src/features/customer/**` | FE-CUS-005, 010 | Per TC-CUS-22; requires ADD | TC-CUS-22 |
| [ ] | FE-CUS-012 | in-progress (implemented, live delete wired 2026-10-14; browser checks not run) | frontend | Delete customer ConfirmDialog (permanent delete copy), `Deleting...`, success/gone/error handling | `frontend/src/features/customer/**` | FE-CUS-001, 005 | Per error-handling.md; focus starts on "Keep customer", returns to Delete; Esc ignored while deleting | TC-CUS-23 |
| [ ] | FE-CUS-013 | in-progress (implemented 2026-10-14; browser checks not run) | frontend | Print: `CustomerPrintView` (saved data, all addresses) + `print:` utilities hiding shell/drawer/toolbar; no library | `frontend/src/features/customer/**` (fallback: a feature CSS module for `@media print`) | FE-CUS-005 | Print preview shows only the saved customer; unsaved edits not printed; enabled only for a loaded saved customer | TC-CUS-24 |
| [ ] | FE-CUS-014 | in-progress (wired to `trpc.customer.*` 2026-10-14; API checks pass, browser checks not run) | frontend | Replace the fixture adapter with `trpc.customer.list/get/create/update/delete/options`; query keys, invalidation, `expectedUpdatedAt`, no mutation retry, bounded paging | `frontend/src/features/customer/api.ts`, `hooks.ts`, and their callers in `frontend/src/features/customer/**` | **requires-sa**: SA bundle approved (SA-CUS-01..08) + backend delivers `customer.*` | Data matches the approved contract; rules in data-fetching.md; create/update/delete/list/get work end to end | TC-CUS-25 |
| [ ] | FE-CUS-015 | in-progress (mapping implemented 2026-10-14; checked against live errors except PARTNER_UNAVAILABLE; browser checks not run) | frontend | Server error mapping: `CUSTOMER_CODE_TAKEN`, `VALIDATION_ERROR` paths → fields/items, `CUSTOMER_STALE` banner + Reload, `CUSTOMER_NOT_FOUND`, `PARTNER_UNAVAILABLE`, `PERMISSION_DENIED`, `UNAUTHORIZED`, `LICENSE_*` | `frontend/src/features/customer/**` | FE-CUS-014; SA-CUS-04, SA-CUS-07 | Per [error-handling](../../apps/frontend/customer/error-handling.md); raw server messages never shown; values preserved | TC-CUS-26..28 |
| [ ] | FE-CUS-016 | in-progress (implemented 2026-10-14; browser checks not run) | frontend + parent | Add tokens `gms-success-subtle`, `gms-success-text`, `gms-status-active`, `gms-field-disabled` to `@theme` | `frontend/src/app/globals.css` (shared; parent serializes) | Q-CUS-06 default | No hex values in `features/customer/**`; existing pages unchanged | TC-CUS-29; build |
| [ ] | FE-CUS-017 | in-progress (implemented 2026-10-14; browser checks not run) | frontend | Responsive behavior (proposal) incl. address cards container query | `frontend/src/features/customer/**` | Q-CUS-05 default | No horizontal page scroll at 1280/1024/768/390 | TC-CUS-30 |
| [ ] | FE-CUS-018 | pending | frontend → manual-tester | Verification: typecheck, lint, build (where allowed), browser checks at 1920×1080 and proposed widths, keyboard walkthrough; manual-tester journey | none (checks only) | all implemented items | Actual commands/results recorded; unexecuted cases marked not run | [testing](../../apps/frontend/customer/testing.md), TC-CUS-32 |

Required SA inputs (from [data-fetching.md](../../apps/frontend/customer/data-fetching.md#requirements-for-the-sa-bundle)):
SA-CUS-01 zod shapes via `AppRouter`; SA-CUS-02 list cursor/order/total/search; SA-CUS-03 address payload shape and ID
retention; SA-CUS-04 `fieldErrors` path format; SA-CUS-05 server rule parity (email format, trimming, phone, default);
SA-CUS-06 create/update return the full customer; SA-CUS-07 gateway error formatting for `customer.*`; SA-CUS-08 options
locale; SA-CUS-09 `document/diagram/customer-flow.md`.

## Backend items (BE-CUS-*)

- source-ui-revision: 1
- sa-revision: 1 — bundle [apps/backend/partner/customer/](../../apps/backend/partner/customer/), status `pending-review`
- approved-revision / approved-by / approved-at / approval-evidence: SA revision 1, project owner, 2026-10-14T11:45+07:00, see header evidence
- Backend status 2026-10-14: BE-CUS-001…010 and 015 done (evidence: [testing.md results](../../apps/backend/partner/customer/testing.md#results--backend-run-2026-10-14-branch-feat14-10-26-customer-no-compose-wiring-yet), [handoff](../../coordination/handoffs/customer-backend.md)); BE-CUS-013 backend part done (api-contract notes, tech-stack row; service-index rows remain parent/infra/devops); BE-CUS-014 partial — BT-CUS-12 host check, 14 against the Compose service, 19 compose config/frontend image, 20 load, 21 wait for BE-CUS-011. BE-CUS-010 verified with per-Dockerfile builds (partner, dev, gateway, auth); `docker compose build` itself awaits BE-CUS-011. `docker:dev:install` restart list not yet extended with partner (add with BE-CUS-011).
- Infra status 2026-10-14: BE-CUS-011 done for the local dev stack (Compose base/dev, `.env.example`, `docker:dev:install` with `CI=true` + explicit store dir and partner restart, `.pnpm-store` ignored). Verified: config base/dev, hardened base one-off (uid 1000, read-only, cap_drop ALL, pids 128, 0.35/512M), gateway→partner `customer.options` 200 via frontend, token 401/401/401/200, no published port/host refused, frontend/auth cannot resolve or reach partner, no partner egress, data preserved ([testing.md](../../apps/backend/partner/customer/testing.md#results--infra-be-cus-011-run-2026-10-14-branch-feat14-10-26-customer-local-dev-stack), [infra record](../../infra/services/backend-api-partner/1/security.md#implementation-record-be-cus-011-2026-10-14)). Open: BT-CUS-20 load, BT-CUS-21 fresh volume, N5/production `f1_partner` bootstrap (needs deployment authorization).
- Merged by the parent from the SA report on 2026-10-14. Compose/env/Dockerfile snippets in the SA report are superseded by the infra bundle where they differ (hardening, networks, secrets).

| Done | ID | Task | Owner / allowed paths | Depends on | Acceptance | Verification |
|---|---|---|---|---|---|---|
| [x] | BE-CUS-001 | Scaffold `@gem-crm/backend-api-partner` | backend (sole writer, parent-serialized): `backend-api-partner/{package.json,tsconfig*.json,nest-cli.json,Dockerfile}` | SA + infra approval | package.json matches dependencies.md; no new package versions in the lockfile | `pnpm install`, BT-CUS-19 |
| [x] | BE-CUS-002 | Prisma project + `<ts>_customer` migration (D-01/02/03, CHECKs) | backend: `backend-api-partner/prisma.config.ts`, `backend-api-partner/prisma/**` (parent-serialized) | 001 | migrations table in `partner._prisma_migrations`; `public` untouched; `migrate diff` empty | BT-CUS-00, 01 |
| [x] | BE-CUS-003 | `main.ts`/`app.module.ts`, constant-time token guard, actor header, `/health/live` + `/health/ready`, 256 KB body, pino redact, exception filter, production token ≥ 32 / not default | backend: `backend-api-partner/src/{main.ts,app.module.ts,internal-auth/**,health/**,database/**}` | 001, 002 | 401 without/with wrong token; 413 over 256 KB | BT-CUS-12, 13, 16 |
| [x] | BE-CUS-004 | zod schemas, default-address rules, reference data (`Intl` currencies, ISO 3166 codes) | `backend-api-partner/src/customer/{customer.schemas.ts,reference-data.ts}` | 003 | field-error paths/codes per api-contract | BT-CUS-03, 04, 15 |
| [x] | BE-CUS-005 | create/get/update/delete in transactions, optimistic update, P2002 → `CUSTOMER_CODE_TAKEN`, event logs | `backend-api-partner/src/customer/**` | 004 | per sequence diagrams 3–5 | BT-CUS-02, 05, 07, 08, 09, 17 |
| [x] | BE-CUS-006 | list (escaped ILIKE, keyset cursor, total) and options | `backend-api-partner/src/customer/**` | 004 | pages of 50 without gaps/duplicates; correct total | BT-CUS-06, 15 |
| [x] | BE-CUS-007 | gateway `callPartner` (token + `X-Actor-User-Id`, 3 s/5 s timeouts, no retry, error mapping, 1 MiB response cap) | `backend-api-gateway/src/trpc/partner-client.ts` | 003 | partner 401/5xx/timeout → `PARTNER_UNAVAILABLE`; token never logged | BT-CUS-14 |
| [x] | BE-CUS-008 | gateway `customer-schemas.ts` + `customer.*` router with `permittedProcedure("customer", …)` | `backend-api-gateway/src/trpc/{customer-schemas.ts,router.ts}` | 007 | input/output per api-contract; permissions enforced | BT-CUS-10, 11 |
| [x] | BE-CUS-009 | gateway `maxBodySize` 1 MiB; production refuses start without `PARTNER_SERVICE_TOKEN` | `backend-api-gateway/src/main.ts` (integration) | 008 | option name matches tRPC 11.19.0 | BT-CUS-19 |
| [x] | BE-CUS-010 | Workspace/build: root scripts, lockfile importer, partner `COPY` line in every Dockerfile, dev-image generate, `ownership.yaml` | parent | 001 | `docker compose … build` passes | BT-CUS-19 |
| [ ] | BE-CUS-013 | Post-implementation docs: api-contract notes, tech-stack row, infra/devops service-index rows | backend + parent | 005–011 | implemented vs proposed clearly separated | review |
| [ ] | BE-CUS-014 | Run BT-CUS-00…21 and record results | backend | 001–011 | no pass claimed without a real run | testing.md |
| [x] | BE-CUS-015 | Frontend handoff (actual contract, error codes, IDs) | backend → parent | 014 | `document/coordination/handoffs/customer-backend.md` | — |

## Infra/DevOps items

- Infra bundle: [backend-api-partner/1/security.md](../../infra/services/backend-api-partner/1/security.md), approved 2026-10-14 with recommended D1–D4 (see header evidence).

| Done | ID | Task | Owner / allowed paths | Depends on | Acceptance | Verification |
|---|---|---|---|---|---|---|
| [x] | BE-CUS-011 | Compose base/dev, new `backend-api-partner/Dockerfile` hardening, `.env.example` per the infra bundle (non-root, read-only root, cap_drop, internal networks, log rotation, no published port in base) | infra (sole writer, parent-serialized): `docker-compose*.yml`, `.env.example`, `backend-api-partner/Dockerfile` | infra bundle approved, BE-CUS-003 | limits total 3.2 vCPU / 5.5 GiB; partner unreachable from host/browser in base | BT-CUS-12, 20, 21 |
| [x] | BE-CUS-012 | CI + service-images matrix includes partner (runtime env only, uid 1000, readiness `/health/ready`) | devops: `.github/**`, `document/devops/**` (parent) | BE-CUS-010, 011 | lint/build/typecheck cover partner | devops record |

## Approval and revisions

| Revision | Date | Evidence | Decision |
|---|---|---|---|
| 1 | 2026-10-14 | Parent instruction to ui-spec: "Feature `customer`, UI revision 1. Produce the UI specification bundle and the central TODO for owner review." Inputs: ADR-0018 rev 1 (Accepted, "อนุมัติ ADR-0018"); owner 2026-10-14: "frontend backend ทำadr มาให้อ่านหน่อยหน้านี้คือ customer อยู่ใน setup เหมือน userpermissoin ขอเพิ่มปุ่ม delete ด้วยเหมือน permission ใน design ยังไม่มีก็จะมี create get put delete ธรรมดาเลย" | Spec/TODO prepared; **pending owner review**. Not approved for implementation. ADR approval does not approve this UI bundle (ADR-0018 last paragraph). |

To approve, the owner states approval of `customer` UI revision 1 (optionally answering Q-CUS-01…06; otherwise
the documented defaults apply). Answers that change flow, source, API, schema or package choice create
revision 2 and list the affected item IDs. UI approval does not approve the SA bundle.

## Handoffs, evidence, and completion

- SA request: needs SA-CUS-01…09 above; the parent records the handoff under `document/coordination/handoffs/` (not written by ui-spec in this run).
- Cross-scope handoffs needed at implementation: frontend-home (FE-CUS-003), shared UI scope + user-permission imports (FE-CUS-001), `globals.css` (FE-CUS-016).
- Integration results, customer test report, completion report: none yet.

### Frontend implementation record (2026-10-14, senior-react-developer)

- Selected work: FE-CUS-001…013, 016, 017 on UI revision 1 (owner approval above); claim [customer-frontend.md](../../coordination/tasks/customer-frontend.md). Branch `feat/14-10-26-customer`, not committed.
- Data: typed FIXTURE ADAPTER `frontend/src/features/customer/fixture.ts` shaped like SA rev 1 `api-contract.md` (57 synthetic customers, 10 currencies, 12 countries); mutations always reject with "Saving isn't connected yet. Nothing was saved." `permission.mine` is live.
- Checks run (in `f1-system-frontend-1`): `npx tsc --noEmit` exit 0; `npx eslint src` exit 0 (0 errors, 2 pre-existing warnings in `features/auth/login-form.tsx`); Node logic script over schema/mappers/access/fixture 44 passed, 0 failed; HTTP 200 for `/setup/customer`, `/setup/user-permission`, `/modules/customer`, `/` after a frontend restart; signed-in `permission.mine` → `{"isSuperAdmin":true,"permissions":"ALL"}`; no hex values in `features/customer/**`.
- Not run: `next build` (would write into the dev server's shared `.next` volume), every browser/visual/keyboard TC (no browser automation installed). Rows stay unchecked until FE-CUS-018.
- Deviations: <768 px toolbar wraps instead of a "More" menu (Q-CUS-05 proposal; avoids a new menu component); sidebar links now carry `aria-current="page"` when active (FE-CUS-003, accessibility only).
- Remaining for FE-CUS-014/015: see the swap notes at the top of `frontend/src/features/customer/api.ts`. (Superseded by the integration record below.)

### Frontend integration record (2026-10-14, FE-CUS-014/015, after backend handoff)

- Source: [customer-backend handoff](../../coordination/handoffs/customer-backend.md) and api-contract "Implementation notes (backend, 2026-10-14)". Coordinator instruction: "Continue with FE-CUS-014 and FE-CUS-015: the backend is delivered."
- Code: `hooks.ts` uses `trpc.customer.list.useInfiniteQuery`, `get/options.useQuery`, `create/update/delete.useMutation`, `useUtils()` invalidation/fetch; `contract.ts` infers types from `AppRouter`; `fixture.ts` deleted; `api.ts` `mapSaveError` handles CUSTOMER_CODE_TAKEN, VALIDATION_ERROR paths (0-based, incl. `unknown` currency/country and `multiple_defaults`), CUSTOMER_STALE (banner + Reload), CUSTOMER_NOT_FOUND (read-only, Save hidden, list refreshed), PERMISSION_DENIED, UNAUTHORIZED, LICENSE_*, PARTNER_UNAVAILABLE. Owner decision applied: an uncertain create failure refreshes the list before another submit is allowed. Save sends the `updatedAt` of the version loaded into the form (a background refetch cannot hide a stale conflict). Dashboard: `home-dashboard.tsx` uses `navigationHref(item)`.
- Checks: tsc exit 0; eslint exit 0 (2 pre-existing warnings); live tRPC run via the same-origin proxy (options/list/create/get/search/update/stale/delete/not-found/bad cursor) — results in [testing.md](../../apps/frontend/customer/testing.md); live error mapping 16/16; schema/mapper logic 39/39; all `FECUS*` test rows deleted (0 remaining).
- Not run: browser cases (no browser automation), live PARTNER_UNAVAILABLE (partner not stopped while infra verifies Compose; mapping checked with a constructed 503 error), `next build`.
- Observation for backend (not changed here): gateway VALIDATION_ERROR responses for shape failures put the raw zod issue JSON in the tRPC `message`; the UI never shows `message`, but the contract says `message` = domain code.

## Corrective work

No corrective work is open. If a defect arises during implementation, link one root-cause ledger and apply
[bounded remediation](../../workflow/remediation.md): default pass limit 3, record the allocated/active pass and
per-pass evidence, and share the counts with backend. New revisions, reviewers or sessions do not reset them.
