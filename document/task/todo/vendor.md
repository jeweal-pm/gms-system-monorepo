# Frontend TODO: vendor

- feature-id: `vendor`
- revision: 3 (ADR-0021; see [Revision (ADR-0021) frontend](#revision-adr-0021-frontend)); revision 2 rows below are unchanged
- status: in-progress (UI revision 2 approved; SA revision 1 + ADR-0019 approved 2026-10-15; backend started)
- source: six owner-supplied screenshots (2026-10-15), four unique, in [source/](../../apps/frontend/vendor/source/) (3840×2160 each; assumed 1920×1080 CSS at DPR 2)
- ui-spec: [ui-spec.md](../../apps/frontend/vendor/ui-spec.md)
- pattern: [customer](customer.md) UI revision 1 (approved 2026-10-14)
- dependencies: [dependencies.md](../../apps/frontend/vendor/dependencies.md) (no new packages)
- backend-bundles: SA revision 1 (**approved** 2026-10-15): [ADR-0019](../../adr/0019-vendor-master.md) (Accepted) and [apps/backend/partner/vendor/](../../apps/backend/partner/vendor/architecture.md); [vendor-flow.md](../../diagram/vendor-flow.md) refined. No infra/devops change (SA-VEN-07).
- approved-revision: UI revision 2 (revision 1 + the owner answers Q-VEN-01/02/03 below). SA revision 1 + ADR-0019 revision 1: approved 2026-10-15T11:00+07:00, owner 2026-10-15: "อนุมัติ ADR-0019 และ SA vendor rev 1".
- approved-by: project owner
- approved-at: 2026-10-15T10:00+07:00
- approval-evidence: owner: "frontend and backend ช่วยทำ ui และ api หน้า Vendor ให้ตรงตาม ref หน่อย"; answers in the same exchange: Phone "ไม่บังคับ (เหมือน Customer)" (Q-VEN-02), default address " default ไม่ต้องติ๊ก" (Q-VEN-03), labels "เหมือน Customer" (Q-VEN-01). Q-VEN-04/05/06 use the documented defaults. The instruction to build the API does not approve an SA bundle that does not exist yet; backend code waits for separate SA approval.
- review-bundle: [ui-spec](../../apps/frontend/vendor/ui-spec.md), [open questions](../../apps/frontend/vendor/open-questions.md), [design system](../../apps/frontend/vendor/design-system.md), [conventions](../../apps/frontend/vendor/conventions.md), [form guidelines](../../apps/frontend/vendor/form-guidelines.md), [data fetching](../../apps/frontend/vendor/data-fetching.md), [error handling](../../apps/frontend/vendor/error-handling.md), [dependencies](../../apps/frontend/vendor/dependencies.md), [testing](../../apps/frontend/vendor/testing.md), [vendor-flow](../../diagram/vendor-flow.md)
- updated-at: 2026-10-15T09:00+07:00

## Implementation items

Status values: `pending` (can start after the owner approves UI revision 1), `blocked` (waits for the named SA
bundle or backend delivery). Nothing starts before UI approval. Q-VEN-01, 04, 05, 06 are non-blocking with
documented defaults; Q-VEN-02/03 feed SA-VEN-03, and FE-VEN-007 uses the defaults until SA approves the rules.

| Done | ID | Status | Owner | Task / component | Allowed files | Depends on / requires-sa | Acceptance criteria | Verification |
|---|---|---|---|---|---|---|---|---|
| [ ] | FE-VEN-001 | implemented 2026-10-15 (browser regression TC-VEN-20 not run) | frontend + parent | **Extract Partner Master components** from customer to `features/partner/` per [conventions](../../apps/frontend/vendor/conventions.md#extraction-from-customer); customer imports them; add AddressItem `layout="wide"` and single-type list card | `frontend/src/features/partner/**` (new), `frontend/src/features/customer/**` (cross-scope claim) | UI approval | Customer unchanged in look/behavior; no duplicated component; no customer import inside `features/partner/**` | typecheck, lint; TC-VEN-20 |
| [ ] | FE-VEN-002 | implemented 2026-10-15; Home shortcut `href` delivered by BE-VEN-008 (TC-VEN-01 not run) | frontend (+ frontend-home handoff) | Route `/setup/vendor` (breadcrumbs `[Home, Setup, Vendor]`); Setup tab "Vendor" before "Customer" (Q-VEN-05); sidebar Partner Master › Vendor and `navigationGroups` Vendor `href` → `/setup/vendor` | `frontend/src/app/setup/vendor/**`, `frontend/src/features/setup/setup-tabs.tsx`, `frontend/src/features/home/navigation.ts` | FE-VEN-001; Home shortcut also needs SA-VEN-06 (gateway `href`) | All entry points open `/setup/vendor`; `/modules/vendor` still renders | TC-VEN-01 |
| [ ] | FE-VEN-003 | implemented 2026-10-15 (browser not run) | frontend | Access guard with menu key `vendor` (`permission.mine`, existing contract) | `frontend/src/features/vendor/**` | FE-VEN-001 | No `vendor.*` request without VIEW; pending/error/denied states | TC-VEN-02, 03 |
| [ ] | FE-VEN-004 | implemented 2026-10-15 (browser not run) | frontend | Page header + toolbar: "Add/Edit Vendor", "Vendor list {n}", Print, Excel (disabled), Duplicate, Refresh, Delete, Create Vendor / Save; hidden by permission | `frontend/src/features/vendor/**` | FE-VEN-001, 003 | Matches S1; customer toolbar rules | TC-VEN-03, 04 |
| [ ] | FE-VEN-005 | implemented 2026-10-15 (browser not run) | frontend | Vendor Information card (labels per Q-VEN-01; Phone required flag per Q-VEN-02) | `frontend/src/features/vendor/**` | FE-VEN-001 | Matches S1/S2; read-only mode | TC-VEN-05 |
| [ ] | FE-VEN-006 | implemented 2026-10-15 (browser not run) | frontend | Invoice Address card only, full width; 4-column wide item grid (VD-03); 1–10 items; default address optional (Q-VEN-03 answer: new items unchecked, at most one, can be unchecked, no error when none) | `frontend/src/features/vendor/**` | FE-VEN-001 | Matches S1/S2 (S2 = unchecked default); no Shipping card; S4 red frame not used (no default is valid) | TC-VEN-06, 07 |
| [ ] | FE-VEN-007 | implemented 2026-10-15, rules provisional until SA-VEN-03 approval (Node logic check passed; browser not run) | frontend | Zod schema + RHF from the partner schema building blocks; error presentation, item error frame, expand + focus first error | `frontend/src/features/vendor/**` | FE-VEN-005, 006; **requires-sa** SA-VEN-03 for the final rules | Matches form-guidelines.md and, after SA approval, the approved contract exactly | TC-VEN-08..10; Node logic script |
| [ ] | FE-VEN-008 | implemented on the fixture adapter 2026-10-15 (browser not run) | frontend | Vendors drawer: title + total, search, draft row, rows (Q-VEN-04), status dot, Inactive badge, paging | `frontend/src/features/vendor/**` | FE-VEN-001; final list shape SA-VEN-02 | Matches S1; push layout S2; ≤ 50 rows per request | TC-VEN-11..13 |
| [ ] | FE-VEN-009 | implemented on the fixture adapter 2026-10-15 (browser not run) | frontend | Discard guard, Duplicate, Delete dialog, Print view (vendor copy) | `frontend/src/features/vendor/**` | FE-VEN-004, 007 | Per error-handling.md | TC-VEN-14..17 |
| [ ] | FE-VEN-010 | implemented 2026-10-15 against the delivered contract (typecheck vs `AppRouter` passed; live calls not run: no partner in the dev stack) | frontend | Replace the fixture adapter with `trpc.vendor.*` (or the shared options procedure) | `frontend/src/features/vendor/api.ts`, `hooks.ts`, `contract.ts` and callers | **requires-sa**: SA-VEN-01..05 approved + backend delivers | Data matches the approved contract; mutations never retried | TC-VEN-18 |
| [ ] | FE-VEN-011 | implemented 2026-10-15 (Node mapper check 26/26 passed; live error cases not run: no partner in the dev stack) | frontend | Server error mapping for the approved vendor error codes | `frontend/src/features/vendor/**` | FE-VEN-010; SA-VEN-05 | Per error-handling.md; values kept | TC-VEN-19 |
| [ ] | FE-VEN-012 | implemented 2026-10-15 (TC-VEN-21 not run) | frontend | Responsive behavior (customer rules + address grid 4 → 2 → 1) | `frontend/src/features/vendor/**`, `frontend/src/features/partner/**` | FE-VEN-006 | No horizontal page scroll at 1280/1024/768/390 | TC-VEN-21 |
| [ ] | FE-VEN-013 | partial: typecheck, lint, HTTP and Node logic checks done; browser, keyboard and manual-tester not run | frontend → manual-tester | Verification: typecheck, lint, browser checks at 1920×1080 and the proposed widths, keyboard walkthrough, customer regression; manual-tester journey | none (checks only) | all implemented items | Actual commands/results recorded; unexecuted cases marked not run | [testing](../../apps/frontend/vendor/testing.md), TC-VEN-22 |

Required SA inputs: SA-VEN-01…08 in [data-fetching.md](../../apps/frontend/vendor/data-fetching.md#requirements-for-the-sa-bundle).
No new container is expected (Vendor lives in the existing `backend-api-partner`); SA-VEN-07 confirms capacity
and routes any runtime change to infra.

## Frontend progress (UI revision 2)

- 2026-10-15, frontend (parent instruction; scope FE-VEN-001…009 and 012, independent of backend). Claimed paths:
  `frontend/src/features/partner/**` (new), `frontend/src/features/vendor/**` (new), `frontend/src/features/customer/**`,
  `frontend/src/app/setup/vendor/**`, `frontend/src/features/setup/setup-tabs.tsx`, `frontend/src/features/home/navigation.ts`.
  No package, lockfile, `globals.css`, provider, Docker or backend change.
- **FE-VEN-001:** shared Partner Master module in `features/partner/` (`access`, `entity`, `schema` building blocks,
  `options`, `hooks`, `address-types`, and components: address item with `layout="split" | "wide"` and
  `defaultRule="exactlyOne" | "atMostOne"`, address list card, information card, page header, presentational drawer,
  delete/discard dialogs, print view + CSS module, page parts such as access guard, drawer toggle and banners). Customer now uses
  them through thin wrappers (`customers-drawer.tsx`, `delete-customer-dialog.tsx`); its moved files were deleted.
  `features/partner/**` imports no customer or vendor code. The state machine stays in each `<entity>-page.tsx` (conventions).
- **FE-VEN-002:** `/setup/vendor` route with breadcrumbs `Home › Setup › Vendor`; Setup tab "Vendor" before "Customer";
  sidebar Partner Master › Vendor and `navigationGroups` Vendor `href` → `/setup/vendor`; `/modules/vendor` still renders.
  The Home shortcut uses the gateway `shortcutGroups` (BE-VEN-008 adds the `href`).
- **FE-VEN-010 boundary (first run):** vendor data used a typed fixture adapter until the backend was delivered.
  That adapter was removed in the second run below.
- First-run checks (inside `f1-system-frontend-1`): `pnpm --filter frontend typecheck` exit 0; `pnpm --filter frontend lint`
  exit 0 with 0 errors and 2 warnings, both already present before this work (`features/auth/login-form.tsx`);
  HTTP 200 for `/setup/vendor`, `/setup/customer`, `/modules/vendor` and `/setup/user-permission` after a frontend container
  restart (before the restart, `/setup/vendor` returned 404 because the dev server had not picked up the new route);
  throwaway Node logic checks: 14/14 schema assertions and 13/13 fixture assertions passed. Browser, visual, keyboard and
  manual-tester cases were **not run** (see [testing](../../apps/frontend/vendor/testing.md)).
- **2026-10-15, second run: FE-VEN-010/011** (parent instruction after the owner approved SA rev 1 + ADR-0019 rev 1, and
  the backend delivered per [vendor-backend.md](../../coordination/handoffs/vendor-backend.md)).
  - FE-VEN-010: the fixture adapter is deleted. `hooks.ts` now uses `trpc.vendor.list` (`useInfiniteQuery`), `get`,
    `options` (its own cache entry), and `create`/`update`/`delete` (`retry: false`), with the same exports.
    `contract.ts` types come from `inferRouterClient<AppRouter>["vendor"]`. Save sends the `updatedAt` of the version
    loaded into the form as `expectedUpdatedAt`. `isDefault` is sent as ticked (zero or one default).
  - FE-VEN-011: `api.ts` reads only `data.domainCode` and `data.fieldErrors`, never `message`:
    - `VENDOR_CODE_TAKEN` → Code Name field;
    - `VENDOR_STALE` → banner + Reload;
    - `VENDOR_NOT_FOUND` → per-operation copy (load / deleted on save / already deleted);
    - `VALIDATION_ERROR` → `invoiceAddresses.N.field` and information fields; `unknown` → field error + options refetch;
      `multiple_defaults` → banner; anything unmapped → generic banner;
    - `PERMISSION_DENIED` → copy + `permission.mine` invalidated (also from detail, options and list errors);
    - `UNAUTHORIZED`, `LICENSE_*` → their own copy;
    - `PARTNER_UNAVAILABLE`, network failures and unknown codes → "Vendor service is unavailable…". After an uncertain
      create, the list is refreshed before a resubmit is allowed (reused customer decision, as the handoff states).
  - Shared helper: the field-error mapping moved to `features/partner/errors.ts`, with the same rules and copy as customer.
    Customer's own copy was not changed in this run.
  - Checks:
    - typecheck exit 0 against the delivered `AppRouter`; lint exit 0 (only the 2 existing warnings);
    - throwaway Node check of the real mappers with `TRPCClientError.from(...)` gateway envelopes: 26/26 passed;
    - HTTP 200 for `/setup/vendor` and `/setup/customer`;
    - unauthenticated `GET /api/trpc/vendor.options` and `vendor.list` return 401 `UNAUTHORIZED` from the gateway
      procedures, so the procedures are routed.
  - The `PARTNER_UNAVAILABLE` banner could not be confirmed live: that needs a signed-in session, and this run had none.
    Live create/edit/delete cases were **not run: no partner in the dev stack** (no `backend-api-partner` container and
    no `PARTNER_*` variables; parent/owner environment gap).

## Backend items (BE-VEN-*)

- source-ui-revision: 2
- sa-revision: 1 — bundle [apps/backend/partner/vendor/](../../apps/backend/partner/vendor/architecture.md) ([decisions](../../apps/backend/partner/vendor/decisions.md), [API](../../apps/backend/partner/vendor/api-contract.md), [authorization](../../apps/backend/partner/vendor/authorization.md), [sequence](../../apps/backend/partner/vendor/sequence-diagram.md), [database](../../apps/backend/partner/vendor/database-diagram.md), [errors](../../apps/backend/partner/vendor/error-handling.md), [dependencies](../../apps/backend/partner/vendor/dependencies.md), [testing](../../apps/backend/partner/vendor/testing.md)), [ADR-0019](../../adr/0019-vendor-master.md) (Accepted), [vendor-flow](../../diagram/vendor-flow.md)
- status: **approved** 2026-10-15; backend **done** 2026-10-15 (BE-VEN-001…010; handoff [vendor-backend.md](../../coordination/handoffs/vendor-backend.md))
- approved-revision: SA revision 1 + ADR-0019 revision 1
- approved-by: project owner
- approved-at: 2026-10-15T11:00+07:00
- approval-evidence: owner 2026-10-15: "อนุมัติ ADR-0019 และ SA vendor rev 1"
- dependencies: none new ([dependencies.md](../../apps/backend/partner/vendor/dependencies.md)); infra/devops not triggered (no container, env, network, volume, workflow change)
- Answers SA-VEN-01…08: 01 ADR-0019 + tables `vendor`/`vendor_address`; 02 `vendor.*` + list as customer, second line = Code Name; 03 field rules = customer, phone optional, 1–10 addresses, default 0 or 1; 04 `vendor.options`; 05 error codes + permanent delete + document copy rule; 06 dashboard `href`; 07 no capacity/infra change; 08 flow refined

Order: 001 → 002 → 003 → 004/005 → 006; 007 → 008 (gateway may run in parallel with 003–006 after 001); 009 → 010.
"Parent-serialized" paths are integration-owned: the parent assigns backend as the single writer.

| Done | ID | Status | Owner | Task | Allowed files | Depends on / FE IDs | Acceptance criteria | Verification |
|---|---|---|---|---|---|---|---|---|
| [x] | BE-VEN-001 | done 2026-10-15 (typecheck/lint 0; BT-VEN-18 79/79 identical to pre-change baseline) | backend | **Extract partner shared helpers** to `src/common/`: move `cursor.ts`, `reference-data.ts`; new `partner-schemas.ts` (optText, phone, invoice address input, at-most-one-default refine, list query, id, limits) and `persistence.ts` (escapeLike, toIso, normalizedKeys, unavailable detection, `persistenceErrorMapper` factory); customer imports them | `backend-api-partner/src/common/**`, `backend-api-partner/src/customer/**` | SA approval | Customer exports, shapes, codes, auto-default and logs unchanged; no customer logic left duplicated in vendor | partner typecheck/lint/build; BT-VEN-18 |
| [x] | BE-VEN-002 | done 2026-10-15 (`20261015031643_vendor`; BT-VEN-00/01 pass; BT-VEN-20 not run) | backend (parent-serialized) | Prisma models `Vendor`, `VendorAddress` + migration `<ts>_vendor` with 8 CHECKs and partial unique `(vendor_id) WHERE is_default` | `backend-api-partner/prisma/schema.prisma`, `backend-api-partner/prisma/migrations/<ts>_vendor/**` | 001 | Additive only; no change to customer objects; `migrate diff` empty | BT-VEN-00, 01, 20 (if selected) |
| [x] | BE-VEN-003 | done 2026-10-15 (BT-VEN-04/05 pass) | backend | `vendor.schemas.ts` (create/update/list/id; default 0..1), `vendor.errors.ts` (shared mapper with `VENDOR_*`), messages in `common/errors.ts` | `backend-api-partner/src/vendor/**`, `backend-api-partner/src/common/errors.ts` | 001 | Field paths/codes per api-contract; zero defaults valid | BT-VEN-04, 05 |
| [x] | BE-VEN-004 | done 2026-10-15 (BT-VEN-07/10/13/15/16 pass) | backend | `vendor.controller.ts` (`/internal/v1/vendors`, `options` before `:id`, actor + JSON checks) and service `list`, `get`, `options` | `backend-api-partner/src/vendor/**` | 002, 003 | Pages ≤ 50 without gaps; total; 404 `VENDOR_NOT_FOUND`; options identical to customer | BT-VEN-07, 10, 13, 15, 16 |
| [x] | BE-VEN-005 | done 2026-10-15 (BT-VEN-02/03/06/08/09/17 pass) | backend | Service `create`, `update` (optimistic, full replacement, defaults as sent), `delete` (hard, cascade); event logs | `backend-api-partner/src/vendor/**` | 004 | Per sequence diagrams 3–5; `VENDOR_CODE_TAKEN`/`VENDOR_STALE`; no default promotion | BT-VEN-02, 03, 06, 08, 09, 17 |
| [x] | BE-VEN-006 | done 2026-10-15 (guard + filter apply; BT-VEN-13 pass) | backend (parent-serialized) | Register `VendorController`, `VendorService` | `backend-api-partner/src/app.module.ts` | 004, 005 | Guard and filter apply to vendor routes | BT-VEN-13 |
| [x] | BE-VEN-007 | done 2026-10-15 (gateway typecheck/lint/build 0; BT-VEN-14/18 pass) | backend | Gateway `partner-schemas.ts` (shared blocks, `assertAtMostOneDefault`, list/id inputs, outputs); `customer-schemas.ts` rebuilt on it with identical exports; `callPartner` `notFoundCode` parameter (customer passes `CUSTOMER_NOT_FOUND`) | `backend-api-gateway/src/trpc/{partner-schemas.ts,customer-schemas.ts,partner-client.ts,router.ts}` | 001 (pattern) | Customer tRPC contract byte-identical in behavior | gateway typecheck/lint/build; BT-VEN-14, 18 |
| [x] | BE-VEN-008 | done 2026-10-15 (BT-VEN-11/15/19 pass; dashboard `href` live) | backend | `vendor-schemas.ts`; `vendor` sub-router with `permittedProcedure("vendor", …)` for list/get/options/create/update/delete; `shortcutGroups` Vendor `href: "/setup/vendor"` | `backend-api-gateway/src/trpc/{vendor-schemas.ts,router.ts}` | 007; FE-VEN-002, 010 | Inputs/outputs/permissions per api-contract and authorization; `AppRouter` exports `vendor.*` types | BT-VEN-11, 12, 15, 19 |
| [x] | BE-VEN-009 | done 2026-10-15 (results in testing.md; 12 partial, 20 not run, 21 partial) | backend | Run BT-VEN-00…21 (selected destructive cases only) and append results to testing.md | `document/apps/backend/partner/vendor/testing.md` | 001–008 | No pass claimed without a real run; not-run cases listed with reason | testing.md |
| [x] | BE-VEN-010 | done 2026-10-15 (api-contract implementation notes; handoff vendor-backend.md) | backend → parent | api-contract "Implementation notes" (implemented vs proposed); frontend handoff with actual contract, codes and FE IDs | `document/apps/backend/partner/vendor/api-contract.md`, `document/coordination/handoffs/vendor-backend.md` | 009; FE-VEN-010, 011 | Frontend can wire without guessing | review |

### Backend progress (SA revision 1)

- 2026-10-15, backend (parent assignment; backend was the single writer for `backend-api-partner/src/app.module.ts` and
  `backend-api-partner/prisma/**` in this run). No package, lockfile, Dockerfile, Compose, `.env.example`, `.github/**`, auth or
  frontend change; nothing committed or pushed.
- Delivered: partner `src/common/{cursor,reference-data}.ts` (moved), `src/common/{partner-schemas,persistence,request}.ts`,
  `src/vendor/**`, customer module rebuilt on the shared helpers (behavior byte-identical), 3 vendor messages in
  `src/common/errors.ts`, `app.module.ts` registration, `Vendor`/`VendorAddress` models + migration
  `20261015031643_vendor`; gateway `src/trpc/{partner-schemas,vendor-schemas}.ts` (new), `customer-schemas.ts`,
  `partner-client.ts` (`notFoundCode`), `router.ts` (`vendor.*` + dashboard Vendor `href: "/setup/vendor"`).
- Checks: partner and gateway typecheck/lint/build exit 0; partner Dockerfile build exit 0 (idle RSS 72.5 MiB); vendor
  runtime script 75/75, BT-VEN-14 7/7, customer regression BT-VEN-18 79/79 before BE-VEN-003 and at the end (identical to the
  pre-change baseline); frontend `tsc` against the new `AppRouter` 0 errors. Details:
  [testing.md](../../apps/backend/partner/vendor/testing.md#results--backend-run-2026-10-15-branch-feat14-10-26-vendor).
- Contract: unchanged from SA revision 1 (implementation notes in
  [api-contract.md](../../apps/backend/partner/vendor/api-contract.md#implementation-notes-backend-2026-10-15)).
- FE-VEN-010/011 prerequisites are met on the backend side (the FE rows stay with frontend). Live browser checks need the
  dev stack's partner wiring: the running stack has no partner container and `.env` has no `PARTNER_SERVICE_TOKEN` (see the
  handoff "Environment gap"). The dev DB now holds both partner migrations; all test rows were removed.
- Corrective work: none opened; 0 passes used.

## Approval and revisions

| Revision | Date | Evidence | Decision |
|---|---|---|---|
| SA 1 | 2026-10-15 | owner 2026-10-15: "อนุมัติ ADR-0019 และ SA vendor rev 1" | **SA revision 1 and ADR-0019 revision 1 approved.** Backend BE-VEN-001…010 may start; then frontend FE-VEN-010/011. |
| 2 | 2026-10-15 | Owner: "frontend and backend ช่วยทำ ui และ api หน้า Vendor ให้ตรงตาม ref หน่อย" + answers Q-VEN-01 (Customer labels), Q-VEN-02 (Phone optional), Q-VEN-03 (default address not required; new item starts unchecked; at most one default) | **UI revision 2 approved.** Changed rule (Q-VEN-03) affects FE-VEN-006, 007 and SA-VEN-03. SA bundle still needs separate approval. |
| 1 | 2026-10-15 | Owner: "หน้า Vendor flow คล้ายๆหน้า Customer เลย ช่วยทำ uxui spec ให้หน่อย" with six screenshots | Spec/TODO prepared; **pending owner review**. Not approved for implementation; SA/backend not requested for approval yet. |

To approve, the owner states approval of `vendor` UI revision 1 (optionally answering Q-VEN-01…06; otherwise the
documented defaults apply). Answers that change flow, source, API, schema or package choice create revision 2 and
list the affected item IDs. UI approval does not approve the SA bundle.

## Handoffs, evidence, and completion

- SA request: [vendor-sa.md](../../coordination/handoffs/vendor-sa.md) (requested; not started).
- Cross-scope handoffs needed at implementation: customer feature + new partner module (FE-VEN-001), frontend-home `navigation.ts` (FE-VEN-002), gateway dashboard `href` (SA-VEN-06).
- Integration results, customer test report, completion report: none yet.

## Corrective work

No corrective work is open. If a defect arises during implementation, link one root-cause ledger and apply
[bounded remediation](../../workflow/remediation.md): default pass limit 3, record the allocated/active pass and
per-pass evidence, and share the counts with backend. New revisions, reviewers or sessions do not reset them.

## Revision (ADR-0021) frontend

- source-ui-revision: 3 ([rev3-01](../../apps/frontend/vendor/source/rev3-01-shared-header-reference.png), [rev3-02](../../apps/frontend/vendor/source/rev3-02-drawer-row-code-name.png); same images as customer rev 2); spec: [ui-spec revision 3](../../apps/frontend/vendor/ui-spec.md#revision-3-adr-0021)
- governing decision: [ADR-0021](../../adr/0021-partner-code-running-number-and-record-modes.md) — Accepted 2026-10-16
- approved-by / approved-at: project owner, 2026-10-16
- approval-evidence: owner 2026-10-16: "...vendor คนเเรกเป็น V001 ... ทำ adr เเล้วเริ่มทำเลย" (full quote in ADR-0021)
- contract used: gateway `vendor.nextCode` (query, `vendor:ADD`, `{code:"V001"}`), `code` required on create/update, `VENDOR_CODE_TAKEN` / `VALIDATION_ERROR {path:"code",code:"required"}` — observed live on 2026-10-16 (see [testing](../../apps/frontend/vendor/testing.md#revision-3-adr-0021-checks-2026-10-16)); backend handoff path: `document/coordination/handoffs/partner-code-adr0021-backend.md` (not present when this record was written)
- claimed paths: as in [customer.md](customer.md#revision-adr-0021-frontend) (one change for both entities through `features/partner/**`)
- source revision: working tree on `feat/16-10-26-fix-design-add-runingnumber` over HEAD `974134c` (uncommitted)

| Done | ID | Status | Owner | Task / component | Allowed files | Depends on | Acceptance criteria | Verification |
|---|---|---|---|---|---|---|---|---|
| [ ] | FE-VEN-014 | implemented 2026-10-16; needs-validation (browser not run, no test runner) | frontend | Header + modes as customer FE-CUS-019 with "Add Vendor" / record name, "Vendor List N", Create Vendor; Invoice Address only (unchanged) | `frontend/src/features/partner/components/partner-page-header.tsx`, `frontend/src/features/vendor/vendor-page.tsx` | ADR-0021 §3 | As FE-CUS-019 | UT-ADR21-03a…k; TC-VEN-23…27 |
| [ ] | FE-VEN-015 | implemented 2026-10-16; needs-validation | frontend | Code Name required `*` (shared schema/mapper), sent trimmed | `frontend/src/features/partner/**`, `frontend/src/features/vendor/api.ts` | ADR-0021 §1 | As FE-CUS-020 | UT-ADR21-01a…h, 04b, 04d, 04f, 04g; IT-ADR21-03/04 |
| [ ] | FE-VEN-016 | implemented 2026-10-16; needs-validation | frontend | Prefill from `vendor.nextCode`; `VENDOR_CODE_TAKEN` → field error + refetch | `frontend/src/features/vendor/{hooks.ts,vendor-page.tsx,api.ts}`, `frontend/src/features/partner/{hooks.ts,code-suggestion.ts}` | ADR-0021 §2; backend `vendor.nextCode` | As FE-CUS-021 | UT-ADR21-02a…g, 04d; IT-ADR21-01/02; TC-VEN-28/29 |
| [ ] | FE-VEN-017 | implemented 2026-10-16; needs-validation | frontend | Drawer rows bold Code Name / Name (shared drawer); supersedes Q-VEN-04 default | `frontend/src/features/partner/components/partner-drawer.tsx` | ADR-0021 §4 | Matches rev3-02 | IT-ADR21-05; TC-VEN-30 |
| [ ] | FE-VEN-018 | **blocked** — no frontend unit/integration runner installed; dependency additions not authorized in this run | frontend → parent (dependency review) | Automated unit + integration tests for FE-VEN-014…017 | test files under `frontend/src/features/{partner,vendor}/**` once a runner is approved | owner-approved runner proposal | Mapped cases run and pass | testing.md |
| [ ] | FE-VEN-019 | security part done — sec-auditor + security-auditor 2026-10-16: **advisory pass, no confirmed issue**, same tree (HEAD `974134c` + 17 backend / 30 total files; reviewer hash `87b94f89b8d8d24b`/`cf22cb98f572a23d`, test-doc recipe `7bf1dae7582b00c6` — same content, different recipes; backend tests re-run on it 37/37 + 23/23). Hardening → INV-20261016-001 (pending owner review); browser checks TC-VEN-23…30 + manual-tester still pending | parent → `sec-auditor` + `security-auditor`; frontend → manual-tester | Focused security reviews on the same revision; browser checks TC-VEN-23…30; manual-tester journey | none | FE-VEN-014…017 | Both reviews recorded; browser results recorded | security-review.md; testing.md |

Record (2026-10-16, frontend): same run and evidence as [customer FE-CUS-019…025](customer.md#revision-adr-0021-frontend) (typecheck/lint exit 0; logic 34/34; live tRPC 15/15 incl. vendor `nextCode` V001 → V002, `VENDOR_CODE_TAKEN`, blank code `required`; `/setup/vendor` 200 signed in). Browser, automated suite and security reviews not run; this revision stays unresolved until FE-VEN-018/019 pass.

Record (2026-10-16, frontend, Vitest — FE-VEN-018 update): owner instructions "frontend backend ทำ unit test case ส่วนของ vendor customer ให้หน่อยเหมือน companyprofile" and "ทำunit test ให้อยู่ใน folder test สิเหมือนใน companyprofile". The runner now exists (Vitest 5.0.3), so FE-VEN-018 is **no longer blocked by a missing runner**. Unit tests added under `frontend/test/{partner,vendor}/` (no `frontend/src/` file edited, no dependency added): shared UT-ADR21-01a…h, 02a…g, 03a…k, 04f/g and UT-PTN-*; vendor UT-ADR21-04b/d, UT-VEN-S01…S09, UT-VEN-A01…A22 and contract checks IT-VEN-C01…C03 (mapper output accepted by the gateway's strict `createVendorInputSchema`, `shippingAddresses` rejected). `pnpm test`: 195 passed (10 files); typecheck exit 0; lint exit 0 (2 existing warnings). No defect found. Still open: hook/adapter integration and component behavior (need a DOM test library, not installed or approved). **FE-VEN-018 stays unresolved** (unit part passing). Map and gaps: [testing](../../apps/frontend/vendor/testing.md#automated-tests-vitest-2026-10-16).

## Revision (ADR-0021) backend

- governing decision: [ADR-0021](../../adr/0021-partner-code-running-number-and-record-modes.md) — Accepted 2026-10-16; source UI revision 3, SA revision 2
- approval-evidence: owner 2026-10-16 (full quote in ADR-0021, ending "ทำ adr เเล้วเริ่มทำเลย"); parent instruction: "Implement the backend for ADR-0021 … on the current branch `feat/16-10-26-fix-design-add-runingnumber`"
- SA bundle revision 2: [api-contract](../../apps/backend/partner/vendor/api-contract.md#revision-2--adr-0021-implemented-2026-10-16), [database](../../apps/backend/partner/vendor/database-diagram.md#revision-2--adr-0021-implemented-2026-10-16), [errors](../../apps/backend/partner/vendor/error-handling.md#revision-2--adr-0021-implemented-2026-10-16), [testing](../../apps/backend/partner/vendor/testing.md#revision-2--adr-0021-automated-tests-2026-10-16)
- handoff: [partner-code-adr0021-backend.md](../../coordination/handoffs/partner-code-adr0021-backend.md); shared with [customer](./customer.md#revision-adr-0021-backend) (one implementation for both entities)
- source revision tested: HEAD `974134c` + uncommitted backend working tree, content hash `7bf1dae7582b00c6`; not committed

| Done | ID | Status | Owner | Task | Allowed files | Acceptance | Verification |
|---|---|---|---|---|---|---|---|
| [x] | BE-VEN-016 | done 2026-10-16 | backend | `code` required on create/update (partner + gateway): trim, 1–120, empty → `VALIDATION_ERROR` `{path:"code",code:"required"}`; missing/null → `invalid_type`; `VENDOR_CODE_TAKEN` kept; gateway `describeError` reports custom issues by `params.code` | `backend-api-partner/src/common/partner-schemas.ts`, `backend-api-gateway/src/trpc/{partner-schemas.ts,domain-error.ts}` | rules identical at both layers | UT-PC-01/02, UT-GW-PC-01…03, IT-PC-03/06/07, IT-GW-PC-04, LIVE-02/03 — pass |
| [x] | BE-VEN-017 | done 2026-10-16 | backend (prisma path parent-serialized; single writer this run) | Migration `20261016090000_partner_code_required`: backfill NULL codes with `V`+≥3 digits by `created_at, id`, `code_key = lower(code)`, then `code`/`code_key` NOT NULL; `schema.prisma` `String` | `backend-api-partner/prisma/**` | no data loss; diff empty | scratch DB backfill (C011…C013, V999…V1001), dev DB applied, `migrate diff` empty, IT-PC-08 — pass |
| [x] | BE-VEN-018 | done 2026-10-16 | backend | Partner `GET /internal/v1/vendors/next-code` → `{code:"V001"}`; max(suffix of `^[Vv][0-9]+$`, ≤ 18 significant digits)::bigint + 1 in SQL; route before `:id` | `backend-api-partner/src/common/persistence.ts`, `backend-api-partner/src/vendor/vendor.{controller,service}.ts` | format/ordering per ADR-0021 §2 | UT-PC-03/04, IT-PC-01/02/04/05 — pass |
| [x] | BE-VEN-019 | done 2026-10-16 | backend | Gateway `vendor.nextCode` query, no input, `permittedProcedure("vendor","ADD")`, `callPartner` 3 s, output `{code}` validated | `backend-api-gateway/src/trpc/{router.ts,vendor-schemas.ts,partner-schemas.ts}` | ADD/Super Admin only; partner not called when denied | UT-GW-PC-04, IT-GW-PC-01…03, LIVE-01/03/04 — pass |
| [x] | BE-VEN-020 | done 2026-10-16 | backend | Automated unit + integration tests (`node:test`, no new dependency) and full partner/gateway suites; typecheck + lint | `backend-api-partner/test/**`, `backend-api-gateway/test/**` | all pass | partner 37/37, gateway 23/23; partner + gateway `typecheck`/`lint` exit 0 |
| [x] | BE-VEN-021 | done 2026-10-16 | backend | SA bundle revision 2 docs + handoff | `document/apps/backend/partner/vendor/**`, `document/coordination/handoffs/partner-code-adr0021-backend.md` | contract recorded as implemented | review |
| [x] | BE-VEN-022 | done — sec-auditor + security-auditor 2026-10-16: **advisory pass, no confirmed issue**, same tree (HEAD `974134c` + 17 backend / 30 total files; reviewer hash `87b94f89b8d8d24b`/`cf22cb98f572a23d`, test-doc recipe `7bf1dae7582b00c6` — same content, different recipes; backend tests re-run on it 37/37 + 23/23). Hardening → INV-20261016-001 (pending owner review) | parent → `sec-auditor` + `security-auditor` | Focused read-only review of the backend diff (hash `7bf1dae7582b00c6`): trust boundaries gateway→partner (service token, `permittedProcedure` ADD), raw SQL in `nextPartnerCode` (parameterized regex/limit, fixed table identifiers), migration backfill | none (review only) | both results on the same revision; findings staged in investigation | security-review.md |

Record (2026-10-16, backend): dev stack restarted in order partner → gateway; partner log "Applying migration `20261016090000_partner_code_required`" and "All migrations have been successfully applied"; both watch compiles "Found 0 errors". Live: `vendor.nextCode` → `V001` (existing code does not match the running-number pattern); create without code → 400; duplicate → 409 `VENDOR_CODE_TAKEN`. All `BT21*` test rows deleted (customer 0, vendor 0 remaining). Not run: `nest build`/image build (no manifest/Dockerfile change), security reviews (parent). Deviation: the partner path is `/internal/v1/vendors/next-code` (the existing internal prefix), i.e. the ADR's `GET /vendors/next-code`. The gateway list/detail output still types `code` as `string | null` for compatibility although `null` is no longer produced.

Corrective ledger (ADR-0021 backend): pass limit 3; passes allocated 0. No defect was found in backend verification, so no corrective pass was used. The frontend record above lists a frontend-only mapper fix (`required` message); that fix is outside this ledger.

## Revision (customer rev 3 / vendor rev 4) frontend

- source-ui-revision: vendor 4 ([rev4-01](../../apps/frontend/vendor/source/rev4-01-address-card-no-default.png), [rev4-02](../../apps/frontend/vendor/source/rev4-02-address-card-default-checked.png)); spec: [ui-spec revision 4](../../apps/frontend/vendor/ui-spec.md#revision-4-draft-row-and-address-card)
- approved-by / approved-at: project owner, 2026-10-16
- approval-evidence: the owner instruction of 2026-10-16 quoted in [customer.md](customer.md#revision-customer-rev-3--vendor-rev-4-frontend), recorded as approval of customer UI revision 3 and vendor UI revision 4
- contract: unchanged; default rule from ADR-0019 / Q-VEN-03 unchanged (0 or 1 default)
- claimed paths and source revision: as in [customer.md](customer.md#revision-customer-rev-3--vendor-rev-4-frontend) (one change through `features/partner/**`; hash `15b0711a0e4dfed3`)

| Done | ID | Status | Owner | Task / component | Allowed files | Depends on | Acceptance criteria | Verification |
|---|---|---|---|---|---|---|---|---|
| [ ] | FE-VEN-R4-001 | implemented 2026-10-16; needs-validation (browser not run, no test runner) | frontend | Drawer draft row title fixed "New vendor", subtitle "Not saved yet", Draft badge | `frontend/src/features/partner/components/partner-drawer.tsx`, `frontend/src/features/vendor/{vendor-page.tsx,components/vendors-drawer.tsx}` | — | Typing Code Name/Name leaves the draft row unchanged | UT-R3-01b; IT-R3-01; TC-VEN-31 |
| [ ] | FE-VEN-R4-002 | implemented 2026-10-16; needs-validation | frontend | New invoice address card (shared with customer FE-CUS-R3-002), vendor 4-column grid kept | `frontend/src/features/partner/components/{address-item.tsx,address-list-card.tsx}`, `frontend/src/features/vendor/vendor-page.tsx` | — | Matches rev4-01/02 except #1 trash disabled (A-09) | UT-R3-02e; IT-R3-04; TC-VEN-32 |
| [ ] | FE-VEN-R4-003 | implemented 2026-10-16; needs-validation | frontend | Default rule unchanged (0 or 1): toggles freely, ticking one unticks others, new vendor #1 unticked, removing the default leaves none | `frontend/src/features/partner/components/address-list-card.tsx` | ADR-0019 / Q-VEN-03 | As described | UT-R3-02d, UT-R3-03c/e; TC-VEN-33 |
| [ ] | FE-VEN-R4-004 | implemented 2026-10-16; needs-validation | frontend | Trash/read-only rules as FE-CUS-R3-004 | `frontend/src/features/partner/components/{address-item.tsx,address-list-card.tsx}` | — | As FE-CUS-R3-004 | UT-R3-02a/b; IT-R3-02/03; TC-VEN-34 |
| [ ] | FE-VEN-R4-005 | **blocked** — no frontend unit/integration runner; dependency additions not authorized | frontend → parent (dependency review) | Automated tests for FE-VEN-R4-001…004 | test files under `frontend/src/features/{partner,vendor}/**` once a runner is approved | owner-approved runner proposal | Mapped cases run and pass | testing.md |
| [ ] | FE-VEN-R4-006 | security part done — sec-auditor + security-auditor 2026-10-16: **clear, no findings**, both on the same bytes — HEAD `974134c` + 7 files, sha256 of raw concatenation `36a4629f1eeb630d` (the `15b0711a0e4dfed3` recorded earlier was not reproducible; parent re-pinned); browser checks TC-VEN-31…34 + manual-tester pending | parent → `sec-auditor` + `security-auditor`; frontend → manual-tester | Focused security reviews on hash `15b0711a0e4dfed3` (shared with FE-CUS-R3-006); browser checks TC-VEN-31…34 | none | FE-VEN-R4-001…004 | Both reviews and browser results recorded | security-review.md; testing.md |

Record (2026-10-16, frontend): same run and evidence as [customer FE-CUS-R3-001…007](customer.md#revision-customer-rev-3--vendor-rev-4-frontend) (typecheck/lint exit 0; `/setup/vendor` 200 not signed in; "New vendor" logic check pass). This revision stays unresolved until FE-VEN-R4-005/006 pass.

Record (2026-10-16, frontend, Vitest — FE-VEN-R4-005 update): same run as the FE-VEN-018 record above (195 passed, typecheck/lint exit 0, no `frontend/src/` edit). UT-R3-01b ("New vendor") runs in `frontend/test/partner/page-logic.test.ts` and passes; the `atMostOne` default rule is covered at schema level (UT-PTN-S15, UT-VEN-S05/S06). Not coverable without a DOM test library or extraction from components: UT-R3-02a/b/d/e (`address-item.tsx`), UT-R3-03c/e (default changes inside `address-list-card.tsx`, not exported), IT-R3-01…04. **FE-VEN-R4-005 stays unresolved**. Gaps: [testing](../../apps/frontend/vendor/testing.md#coverage-gaps).

## Revision (backend Vitest unit tests, customer + vendor) — 2026-10-16

- approval-evidence and source revision: same as [customer](./customer.md#revision-backend-vitest-unit-tests-customer--vendor--2026-10-16) (HEAD `c583bac` + uncommitted test tree, hash `d1c27cbeb7ddc5a0`; test-only, no `src/` change).
- evidence: [testing "Automated tests (Vitest)"](../../apps/backend/partner/vendor/testing.md#automated-tests-vitest--2026-10-16)

| Done | ID | Status | Owner | Task | Allowed files | Acceptance | Verification |
|---|---|---|---|---|---|---|---|
| [x] | BE-VEN-023 | done 2026-10-16 | backend | Partner Vitest unit tests for vendor (schemas incl. zero-or-one default / `multiple_defaults`, service with Prisma mocked, error mapping incl. P2002 `code_key` → `VENDOR_CODE_TAKEN`, controller route order) | `backend-api-partner/test/{vendor,partner-shared}/**` | all pass; no `src/` change | UT-VEN-P01…P65; partner `pnpm test` 276 passed / 15 skipped; typecheck + lint exit 0 |
| [x] | BE-VEN-024 | done 2026-10-16 | backend | Gateway Vitest unit tests for `vendor-schemas` and router `vendor.*` (permission per action, partner error mapping, timeout → PARTNER_UNAVAILABLE) | `backend-api-gateway/test/{vendor,partner-shared}/**` | all pass | UT-VEN-G01…G34; gateway `pnpm test` 215 passed / 7 skipped; typecheck + lint exit 0 |
| [x] | BE-VEN-025 | done 2026-10-16 — shared with BE-CUS-025 | backend | ADR-0021 `.mjs` port + opt-in live guard (INV-20261016-001, test part) | `backend-api-{partner,gateway}/test/**` | default run never touches DB/session | see BE-CUS-025 |
| [ ] | BE-VEN-026 | open — shared with BE-CUS-026 | parent → infra/devops | `.dockerignore` exclusion of `**/test` (INV-20261016-001, infra part) | root `.dockerignore` | images contain no `test/` | pending owner selection |
| [ ] | BE-VEN-027 | pending — shared with BE-CUS-027 | parent → `sec-auditor` + `security-auditor` | Focused review of the test-only diff | none | both results on the same revision | security-review.md |
