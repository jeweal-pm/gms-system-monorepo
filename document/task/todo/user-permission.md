# Frontend TODO: user-permission

- feature-id: `user-permission`
- revision: 1
- status: approved-ui (SA/backend pending separate approval)
- source: five owner-supplied screenshots, copied to [source/](../../apps/frontend/user-permission/source/) (3840×2160 ×4, 1368×436 dialog crop; assumed 1920×1080 CSS at DPR 2)
- ui-spec: [ui-spec.md](../../apps/frontend/user-permission/ui-spec.md)
- dependencies: [dependencies.md](../../apps/frontend/user-permission/dependencies.md) (DEP-UP-01, DEP-UP-02 proposed; nothing installed)
- backend-bundles: SA revision 1 (pending-review): [document/apps/backend/auth/user-permission/](../../apps/backend/auth/user-permission/); see Backend items below.
- approved-revision: 1 (UI only)
- approved-by: owner (developer_07)
- approved-at: 2026-10-12
- approval-evidence: 2026-10-12 owner: "ตอบคำถาม หน้า user permission จะเป็นหนึ่งใน feature หลักเฉยๆที่สามารถ ให้ super admin นั้นสามารถ มา set permission ของ user ได้ว่า user สามารถ VIEW ADD EDIT DELETE  CANCEL Price frontend backend ทำ หน้า user permission ให้หน่อย". Owner answer recorded: the page is a core feature where Super Admin sets each user's VIEW/ADD/EDIT/DELETE/CANCEL/Price permissions (answers Q-UP-20 purpose/access: Super Admin). This approves UI revision 1 for implementation; it does not approve SA contracts, schema, ADRs, or package installs (DEP-UP-01/02 remain proposed).
- review-bundle: [ui-spec](../../apps/frontend/user-permission/ui-spec.md), [open questions and conflicts](../../apps/frontend/user-permission/open-questions.md), [design system](../../apps/frontend/user-permission/design-system.md), [conventions](../../apps/frontend/user-permission/conventions.md), [form guidelines](../../apps/frontend/user-permission/form-guidelines.md), [data fetching](../../apps/frontend/user-permission/data-fetching.md), [error handling](../../apps/frontend/user-permission/error-handling.md), [dependencies](../../apps/frontend/user-permission/dependencies.md), [testing](../../apps/frontend/user-permission/testing.md), [flow](../../diagram/user-permission-flow.md), [ledger rows](../../adr/tech-stack.md)
- updated-at: 2026-10-12T10:45+07:00

## Implementation items

Status values: `pending` (can start after UI approval), `blocked` (waiting on the named question,
SA approval or a handoff). Nothing may start before the owner approves revision 1.

| Done | ID | Status | Owner | Task / component | Allowed files | Depends on / requires-sa | Acceptance criteria | Verification |
|---|---|---|---|---|---|---|---|---|
| [ ] | FE-UP-001 | pending | frontend | Route `/setup/user-permission` inside `AppShell` with breadcrumb `Home › Setup › User and permission`; add a sidebar "Setup" entry | `frontend/src/app/setup/user-permission/**`; `frontend/src/features/user-permission/**`; `frontend/src/features/home/navigation.ts` (frontend-home scope, cross-scope handoff) | UI approval; route name confirmation | Route renders for a licensed session; breadcrumb matches S1; existing session/license redirects unchanged | typecheck/lint/build; TC-UP-01 |
| [ ] | FE-UP-002 | pending | frontend | SetupTabs (C-02): 8 tabs, active underline, links to existing `/modules/<slug>` pages where they exist; General/Notifications without a route are shown as disabled (proposal) | `frontend/src/features/setup/**` | FE-UP-001; Q-UP-21 (styling only) | Matches S1 spacing/colors; `aria-current="page"`; keyboard focus visible | TC-UP-01; visual compare with S1 |
| [ ] | FE-UP-003 | blocked (actions) / pending (layout) | frontend | Page header + toolbar (C-03/C-04/C-05): title, subtitle, Print, Excel, Duplicate, Refresh, Create User | `frontend/src/features/user-permission/**` | Q-UP-16 (Print/Excel/Refresh behavior), Q-UP-18 (subtitle) | Layout and states match S1/S5; icon buttons labeled; Duplicate disabled without a saved selection | TC-UP-02 |
| [ ] | FE-UP-004 | pending (layout) / blocked (rules) | frontend | Personal Information card: Photo tile, Active switch, OutlinedTextField, PasswordField, PhoneField, Location MultiSelect (C-06..C-12) | `frontend/src/features/user-permission/**` | Q-UP-01, 07, 08, 09, 10, 11, 12, 14, 22; DEP-UP-01/02 only if approved | Matches S1–S3 (3-column fluid grid, notched labels, chip, flag + dial code); correct `autocomplete`/`inputMode`; keyboard combobox | TC-UP-03, 07, 08 |
| [ ] | FE-UP-005 | blocked | frontend | Zod schema + RHF validation and error presentation (S2) | `frontend/src/features/user-permission/**` | Q-UP-01 (required set), Q-UP-07/08; C-04/C-05 | Blur-then-change timing; submit focuses the first error; password 4–64, not trimmed; error visuals match S2 | TC-UP-04, 05, 06 |
| [ ] | FE-UP-006 | pending (component) / blocked (catalog, count) | frontend | PermissionMatrix + tri-state Checkbox (C-13/C-14): groups, collapse, column Select All, derived count badge | `frontend/src/features/user-permission/**` | Q-UP-02, Q-UP-04, Q-UP-13; catalog requires-sa (C-07) | Tri-state logic per ui-spec; non-applicable cells excluded; accessible names "{Menu} {Action}"; matches S1/S3 | TC-UP-09..12 |
| [ ] | FE-UP-007 | pending (UI) / blocked (limit data) | frontend | UsersDrawer + UserListItem (C-16/C-17): toggle tab, count badge, search, helper text, draft/saved/super-admin items, push layout | `frontend/src/features/user-permission/**` | Q-UP-05, Q-UP-17, Q-UP-28; list data requires-sa | Matches S1/S2/S5; `aria-expanded`; client search; empty-result state | TC-UP-13, 14 |
| [ ] | FE-UP-008 | blocked | frontend | Duplicate flow: copy from the selected saved user into a new draft + success toast | `frontend/src/features/user-permission/**` | Q-UP-03, Q-UP-04, Q-UP-16; FE-UP-010 | Personal fields cleared, permissions copied, toast text approved, drawer shows "New user / Not saved yet" | TC-UP-15 |
| [ ] | FE-UP-009 | pending (dialog) / blocked (trigger, rules) | frontend | ConfirmDialog (C-19) for delete with loading state | `frontend/src/features/user-permission/**` | Q-UP-15, C-06; delete API requires-sa | Matches S4; focus starts on "Keep user", focus is trapped and returns to the trigger; Esc ignored while deleting; error stays in the dialog | TC-UP-16, 17 |
| [ ] | FE-UP-010 | pending | frontend | Toast (C-18) with an `aria-live` region, top-center | `frontend/src/features/user-permission/**` | Q-UP-24 (duration) | Matches S5; max 3; does not steal focus; close button | TC-UP-18 |
| [ ] | FE-UP-011 | pending | frontend + parent | Add the sampled tokens from [design-system.md](../../apps/frontend/user-permission/design-system.md) to `@theme` | `frontend/src/app/globals.css` (shared; parent serializes) | Q-UP-27 (font/teal reconciliation) | No hard-coded hex values in feature components; existing pages unchanged visually | TC-UP-23; build |
| [ ] | FE-UP-012 | partial: first slice implemented (catalog, list/usage, get read-only, create, delete, locationOptions); update/photo/export wait for BE-UP-007/009/012; runtime verification pending service restart | frontend | Replace the fixture adapter with approved tRPC operations (list/get/create/update/delete/catalog/locations/export) | `frontend/src/features/user-permission/api.ts` and hooks | SA rev 1 approved (2026-10-12); C-01..C-08 | Data matches the contract; invalidation rules in data-fetching.md; no password in cache/logs | TC-UP-19, 20 |
| [ ] | FE-UP-013 | blocked | frontend | Photo upload wiring + preview/remove | `frontend/src/features/user-permission/**`; `frontend/src/app/api/**` only if SA requires a proxy (integration-owned) | **requires-sa** + infra storage review (SA-UP-06); Q-UP-11 | Type/size limits enforced client- and server-side; preview; errors per error-handling.md | manual browser check |
| [ ] | FE-UP-014 | implemented; runtime verification pending service restart | frontend | Page access guard / access-denied state | `frontend/src/features/user-permission/**` | SA rev 1 approved; `permission.mine`; Q-UP-20 answered (Super Admin) | Unauthorized users see the denied state; no data request is made | TC-UP-21 |
| [ ] | FE-UP-015 | blocked | frontend | Unsaved-changes confirmation | `frontend/src/features/user-permission/**` | Q-UP-19 | Dirty form prompts before switching user/refresh/navigation | manual |
| [ ] | FE-UP-016 | blocked | frontend | Responsive behavior (proposal in ui-spec) | `frontend/src/features/user-permission/**`, `frontend/src/features/setup/**` | Q-UP-23 | No page-level horizontal scroll; the matrix scroller has a sticky MENU column | TC-UP-22 |
| [ ] | FE-UP-017 | implemented (visual check pending) | frontend (frontend-home scope) | Align the global AppShell with the source sidebar/header: reusable Sidebar + Topbar + content slot, breadcrumbs as data, nav `href` model, avatar menu, fullscreen, bell placeholder, mobile drawer | `frontend/src/features/home/**`, `frontend/src/app/**` pages using the shell, `frontend/src/app/globals.css` (sole writer this run) | Q-UP-21 answered by owner 2026-10-14 (approval below); sources 06–08 | Home and other pages still work; matches 06-sidebar/07-topbar/08-shell; session guard unchanged; `aria-current`, labeled nav, visible focus | typecheck + lint pass (2026-10-14); browser visual compare **not run** (see progress note) |
| [ ] | FE-UP-018 | pending | frontend → manual-tester | Verification: typecheck, lint, build, browser checks at 1920×1080 and the proposed widths; manual-tester journey | none (checks only) | All implemented items | Actual commands/results recorded; unexecuted cases marked not run | testing.md |

Backend/SA requirements (owned by SA; backend TODO items are to be added here by SA after its review):
SA-UP-01 user list + usage/limit, SA-UP-02 get/create/update/delete user with profile fields, SA-UP-03
permission catalog + storage + enforcement, SA-UP-04 location options, SA-UP-05 page authorization,
SA-UP-06 photo storage (infra), SA-UP-07 export/print, SA-UP-08 ADR for admin-managed users/passwords and
license interaction. Details: [SA handoff](../../coordination/handoffs/user-permission-sa.md).

## Backend items (SA revision 1)

- revision: SA 1
- source-ui-revision: 1
- status: approved (scoped first slice: add user + delete user end to end)
- approved-revision: SA 1 as recommended
- approved-by: owner (developer_07)
- approved-at: 2026-10-12
- approval-evidence: 2026-10-12 owner: "frontend backend หน้า user permission ให้สามารถ add user และ delete user ได้". Parent interpretation: an instruction to implement this feature identifies SA revision 1 (the only revision), so it is approved as recommended. Open owner questions take SA defaults until answered: USER_SEAT_LIMIT=3 counting inactive users; catalog v1 (34 menus × 6); Location fixed `primary`; existing regular users start with no grants (dev seed grants demo user VIEW). First slice: list/usage, catalog, create, delete (+ schema, session authz, Super Admin guard). Deferred unless needed: update/edit (BE-UP-007), sign-in inactive hook (BE-UP-011), photo + CSV export (BE-UP-009/012 REST), VIEW-filtered dashboard.
- backend-bundles: [document/apps/backend/auth/user-permission/](../../apps/backend/auth/user-permission/) (decisions, architecture, api-contract, authorization, sequence-diagram, database-diagram, error-handling, dependencies, testing); [ADR-0016](../../adr/0016-per-user-menu-action-permissions.md), [ADR-0017](../../adr/0017-super-admin-managed-users.md) (Proposed)

| Done | ID | Status | Owner | Task | Allowed files | Depends on / FE IDs | Acceptance criteria | Verification |
|---|---|---|---|---|---|---|---|---|
| [x] | BE-UP-001 | done (migration `20261012120000_user_permission` applied to dev DB) | backend + parent | Prisma: `User.active/phone_e164/phone_country`, enum `PermissionAction`, `UserPermission`, `UserLocation`, `UserPhoto`, CHECKs, index; additive migration | `backend-api-auth/prisma/**` (integration-owned; parent serializes) | SA rev 1 approval | Applies on the existing DB; existing users active; no backfill; generated client not hand-edited | `prisma validate`; `db:migrate`; BT-UP-00 |
| [x] | BE-UP-002 | done | backend | Permission catalog v1 constant + key/location validation helpers | `backend-api-auth/src/permission/**` | BE-UP-001; Q-UP-13 content | ≤64 leaves; keys `menu:ACTION`; unknown key rejected | typecheck; BT-UP-07 |
| [x] | BE-UP-003 | done (CRM contract re-verified) | backend | Shared provisioning routine; refactor CRM `createUser` onto it with the CRM contract unchanged | `backend-api-auth/src/user-admin/**`, `backend-api-auth/src/auth/auth.service.ts` | BE-UP-001 | CRM 201/400/409/422/503 behavior identical | BT-UP-17 |
| [x] | BE-UP-004 | done | backend | Session-context returns `authz{isSuperAdmin, permissions}` (uncached) and `active`; Better Auth `additionalFields.active`; 401 when inactive | `backend-api-auth/src/auth/**`, `src/permission/**` | BE-UP-001/002 | Grant change applies on next request; inactive → 401 | BT-UP-01, 13, 16 |
| [x] | BE-UP-005 | done (env var not yet in Compose; code default 3) | backend + parent | User-admin module, `requireSuperAdmin`, `USER_SEAT_LIMIT` parse (0–500, default 3), list + usage | `backend-api-auth/src/user-admin/**`; `src/app.module.ts` (integration-owned) | BE-UP-004; FE-UP-007 | Non-admin 403; list capped at 600; usage counts `role='user'` incl. inactive | BT-UP-02 |
| [ ] | BE-UP-006 | partial: create done; photo deferred (with BE-UP-009/012) | backend | Create: license preflight, Argon2id, seat advisory lock, one transaction, photo magic-byte/size check, token cache + compensation | `backend-api-auth/src/user-admin/**` | BE-UP-003/005; FE-UP-012/013 | Only `role='user'`; no password echo/log; `USER_LIMIT_REACHED`, `USER_LICENSE_*`, `EMAIL_ALREADY_EXISTS` per contract | BT-UP-03..06, 18, 21 |
| [ ] | BE-UP-007 | deferred (not in first slice) | backend | Update: optimistic `expectedUpdatedAt`, set replacement, photo set/remove, password reset (revoke sessions, clear lockout), deactivate (revoke sessions), no email field | `backend-api-auth/src/user-admin/**` | BE-UP-006; FE-UP-012 | `USER_CHANGED` 409; admin rows read-only; email immutable | BT-UP-07..11 |
| [x] | BE-UP-008 | done | backend | Delete: block admin/self, cascade, evict license status cache, no license-server call | `backend-api-auth/src/user-admin/**`, `src/license/license.service.ts` (evict hook) | BE-UP-005; FE-UP-009 | 403 for admin/self; cascades verified; LoginAttempt kept with NULL user | BT-UP-12 |
| [ ] | BE-UP-009 | partial: location options done; photo GET + CSV export deferred | backend | Internal photo GET, location options (static `primary`), CSV export (BOM, formula-escape) | `backend-api-auth/src/user-admin/**` | BE-UP-005; FE-UP-003/004/013 | Headers per contract; ≤600 rows | BT-UP-19, 20 |
| [ ] | BE-UP-010 | partial: authz parse, guards, errorFormatter, `permission.*`, `userAdmin.list/get/create/delete/locationOptions` done; `userAdmin.update` + VIEW-filtered `dashboard.shortcutGroups` deferred | backend | Gateway: parse `authz` (fail closed), `superAdminProcedure`, `permittedProcedure`, `errorFormatter` (domainCode/fieldErrors), `permission.*`, `userAdmin.*`, VIEW-filtered `dashboard.shortcutGroups` | `backend-api-gateway/src/trpc/**`; `src/main.ts` (integration-owned) | BE-UP-004..009; FE-UP-006/007/012/014 | Contract types match api-contract.md; timeouts 3.5/5/6 s; no mutation retry | BT-UP-01, 02, 14, 16 |
| [ ] | BE-UP-011 | deferred (inactive users fail closed at session-context; see Backend progress) | backend | Sign-in after-hook: correct password + inactive → delete new session, 403 `ACCOUNT_INACTIVE` | `backend-api-auth/src/auth/auth.ts` | BE-UP-004 | Wrong password keeps the existing 401/423; no enumeration | BT-UP-10, 15 |
| [ ] | BE-UP-012 | deferred | backend + parent | Gateway REST photo/export routes with the same license + Super Admin checks; tRPC body cap 1 MiB; auth `express.json` 1 MB on user-admin routes only; Pino redaction for `password`/`photo` | `backend-api-gateway/src/app.controller.ts` (or a new controller); both `src/main.ts`, `src/app.module.ts` (integration-owned) | BE-UP-009/010 | 413 over cap; global 32 KB limit unchanged; no bytes/passwords in logs | BT-UP-18, 19, 21 |
| [ ] | BE-UP-013 | partial: dev seed done; Compose/`.env.example` var pending parent | parent + backend | `USER_SEAT_LIMIT` in Compose/`.env.example`; dev seed grants the demo user VIEW on all menus | `docker-compose*.yml`, `.env.example` (parent); `backend-api-auth/src/scripts/seed.ts` | BE-UP-005; owner answer on the limit | Env var only; no container/volume change | compose config validation |
| [ ] | BE-UP-014 | partial: first-slice checks recorded; `build` not run; live services need restart | backend | Run lint/typecheck/build/prisma validate, record measured latency, return the actual contract to frontend | none (checks + docs) | BE-UP-001..013 | Actual commands/results recorded; no unsupported latency claim | BT-UP-22, 23 |

Frontend follow-ups from SA rev 1 (apply after SA approval, with FE-UP-012): Username validates as email and is read-only on edit; password optional on edit (blank keeps current); Super Admin rows read-only; map `USER_LICENSE_*` / `USER_LIMIT_REACHED`; browser-side photo resize (canvas); Print = `window.print()`, Excel = CSV download. Other scopes: `ACCOUNT_INACTIVE` on the login form (frontend-auth); sidebar filtered by `permission.mine` (frontend-home).

## Approval and revisions

| Revision | Date | Evidence | Decision |
|---|---|---|---|
| 1 | 2026-10-12 | User: "ui-spec ขอ spec จาก 5 ภาพที่ส่งไป" | Draft spec/TODO prepared; **pending owner review**. Not approved for implementation; SA/backend not approved. |
| 1 | 2026-10-12 | 2026-10-12 owner: "ตอบคำถาม หน้า user permission จะเป็นหนึ่งใน feature หลักเฉยๆที่สามารถ ให้ super admin นั้นสามารถ มา set permission ของ user ได้ว่า user สามารถ VIEW ADD EDIT DELETE  CANCEL Price frontend backend ทำ หน้า user permission ให้หน่อย" | **UI revision 1 approved for implementation.** Frontend builds against a labeled fixture adapter; data items stay blocked on separate SA approval. |
| SA 1 | 2026-10-12 | 2026-10-12 owner: "frontend backend หน้า user permission ให้สามารถ add user และ delete user ได้" | **SA revision 1 approved as recommended; ADR-0016/0017 Accepted.** First slice = add + delete user end to end. |
| FE-UP-017 | 2026-10-14 | 2026-10-14 owner: "frontned ช่วยทำ Nav bar ทั้งตัว ข้างๆและข้างบนเป็น component เอาไว้ใช้กับทุกหน้าหน่อย" (frontend: make the whole nav bar, side and top, as a component for every page), with three new source images (06-sidebar, 07-topbar, 08-shell) and owner-pasted CSS (sidebar 236 px / 100vh / gap 15 / padding 16 14 / #FCFCFC / border-right 1px #EDEDED; topbar 48 px / #FFFFFF / border-bottom 1px #E3E7EC) | **FE-UP-017 approved** (answers Q-UP-21: restyle the global shell). Also approves the frontend-home scope edits it needs. No contract, schema, ADR or package change. |
| FE-UP-017 | 2026-10-14 | 2026-10-14 owner: "frontend อยากให้ตัว top navbar อยากให้เป็นประมาณนี้" with the slide "[FE] Implement Top Navbar" (topbar + open avatar menu: email, Super Admin, Settings, User and permission, Sign out) | **Avatar-menu amendment to FE-UP-017 approved.** Reuses the implemented `permission.mine` contract; no contract, schema, ADR or package change. |

To approve, the owner states approval of `user-permission` UI revision 1 (and ideally answers the blocking
questions). Answers that change flow, source, API, schema or package choice create revision 2 and mark the
affected item IDs.

## Handoffs, evidence, and completion

- SA handoff: [user-permission-sa.md](../../coordination/handoffs/user-permission-sa.md) (pending owner answers; SA bundle needs separate approval)
- Integration results, customer test report, completion report: none yet

### Frontend progress: UI revision 1, fixture phase (2026-10-12)

- Run: `frontend` role, branch `feat/12-10-26-user-permission`. Scope: FE-UP-001..011 against a labeled fixture adapter.
  Parent authorized this role as the sole writer of `frontend/src/app/globals.css` for this run. No package, lockfile,
  provider, proxy, AppShell, backend or Docker changes. DEP-UP-01/02 were not installed.
- Implemented, but no checkbox is ticked, because the browser/visual acceptance cases (TC-UP-01..18, 23, 24) have not run yet:

| ID | State | Notes |
|---|---|---|
| FE-UP-001 | implemented; sidebar entry handed off | `app/setup/user-permission/page.tsx` inside `AppShell` with the breadcrumb string `Home › Setup › User and permission`. The `navigation.ts` entry is **not** added: AppShell links every item to `/modules/<slug>`, so a correct link needs an AppShell `href` change (frontend-home scope, FE-UP-017). Recorded as a cross-scope handoff. |
| FE-UP-002 | implemented | `features/setup/setup-tabs.tsx`. 6 tabs link to existing `/modules/<slug>` pages. General and Notifications are `aria-disabled` (proposal). Active tab uses `aria-current="page"`. |
| FE-UP-003 | layout + Create/Duplicate wired to the fixture | Print and Excel show an info toast "… isn't available yet" (Q-UP-16). Refresh refetches only the users list and keeps form edits (data-fetching.md proposal). Duplicate is enabled only while a saved user is viewed. "User list 1" is rendered literally (Q-UP-18). |
| FE-UP-004 | layout implemented | Photo tile is a button that shows "Photo upload isn't available yet" (FE-UP-013). Phone uses a provisional US +1 (default, per S1) / TH +66 native select with inline SVG flags (Q-UP-09). Location is an APG multi-select combobox with fixture options, and `primary` is preselected as in S1–S5 (Q-UP-10). |
| FE-UP-005 | implemented | RHF + Zod, validated on blur and re-validated on change; submit focuses the first error. Required: Username, Password, Name, Phone No. (per S2) and Location. Asterisks were added to Password and Phone for consistency (assumption, Q-UP-01). Password is 4–64 and never trimmed. English messages are assumed (Q-UP-25). Phone accepts digits and spaces, up to 15 digits (assumption). |
| FE-UP-006 | implemented | Tri-state native checkbox, group and Select All derived state, collapse (`aria-expanded`), names like "{Menu} {Action}", sticky header. The count badge is derived live from checked leaf cells. The fixture catalog is the screenshot subset (12 leaf menus × 6 = 72 applicable), so it reads "0 of 72 on", not 53 (Q-UP-02/13). |
| FE-UP-007 | UI implemented | Push drawer with an edge toggle (`aria-expanded`/`aria-controls`) and an X button that returns focus to the toggle. Badge "used / limit" (Q-UP-17 proposal). Draft item reads "Not saved yet". The Draft badge uses `#9A5B00` text (Q-UP-28 proposal). Search is case-insensitive on name or username, with an empty-result message. Loading skeleton and error + Retry states. |
| FE-UP-008 | implemented against the fixture | Selecting a saved user shows a **read-only view** (assumption; edit mode is Q-UP-14), with S5-style grey checks. Duplicate creates a new draft: personal fields reset, permissions copied as **editable** checked boxes (Q-UP-04), focus moves to Username, success toast. The toast omits "department" because no such field exists (Q-UP-03). |
| FE-UP-009 | dialog implemented; provisional trigger | Native `<dialog>`: focus starts on "Keep user", Esc is ignored while deleting, focus returns to the trigger. The trigger is a provisional "Delete user" button in the read-only view banner (not shown for Super Admin) pending Q-UP-15. The fixture always rejects, so only the "Deleting..." → in-dialog error path is reachable. |
| FE-UP-010 | implemented | Top-center polite live region, max 3. Success/info dismiss after 5 s, error stays (Q-UP-24 proposal). Close button. Does not take focus. |
| FE-UP-011 | implemented | `@theme` tokens in the `gms-` namespace (`bg-gms-primary`, `rounded-gms-md`, …) so Tailwind defaults (such as `rounded-md` used by AppShell) are unchanged. Font is unchanged (Q-UP-27). Grep shows no hex values in `features/user-permission/**` or `features/setup/**`. |

- Data boundary: `frontend/src/features/user-permission/api.ts` (FIXTURE ADAPTER banner) + `hooks.ts` (TanStack Query keys from
  data-fetching.md). Nothing persists. Create resolves `{ persisted: false }` and shows "All fields are valid, but saving isn't
  connected yet. Nothing was saved." Delete always rejects. Create does not use `useMutation`, so the password never enters
  the MutationCache; the password is never logged or returned. A "Sample data" notice is shown under the page title until FE-UP-012.
- Super Admin-only access (owner answer) is **not enforced** in the UI yet. The page renders for any signed-in, licensed
  session and shows fixture data only. Enforcement is FE-UP-014 + SA-UP-05.
- Not in scope this run (still blocked): FE-UP-012..017. Unsaved-change confirmation is FE-UP-015: Duplicate currently
  replaces a dirty draft without asking.
- Verification evidence (2026-10-12, inside the running `frontend` dev container):
  - `pnpm --filter frontend typecheck`: exit 0, no errors.
  - `pnpm --filter frontend lint`: exit 0, 0 errors. Two existing warnings remain in `features/auth/login-form.tsx` (not touched).
  - Node 24 assertion script over `permission-utils.ts`, `schema.ts` and `api.ts`: passed. It covers the TC-UP-09/10/11 matrix
    logic, non-applicable exclusion, the S2 required messages, password 3/65/untrimmed, the location/phone rules and fixture
    non-persistence. This tests logic only, not the UI.
  - `curl http://localhost:3000/` → 200. The served `globals.css` contains the new `--color-gms-*` tokens (hot reload works for edited files).
  - `curl http://localhost:3000/setup/user-permission` → **404**. The file exists inside the container, but the dev
    server's watcher did not register the newly created route directory (Windows bind mount). Touching the files did not help.
    The route needs a frontend dev-server restart, which this role may not perform.
- Not run (verification gaps): `next build` (forbidden in the shared dev container); all browser/visual cases TC-UP-01..18,
  23, 24 (blocked by the 404 above, and no browser tool in this run); manual-tester journey (FE-UP-018).

### Frontend progress: FE-UP-012 first slice + FE-UP-014 (2026-10-12)

- Run: `frontend` role, branch `feat/12-10-26-user-permission`. Approval: UI rev 1 + SA rev 1 as recommended (owner, 2026-10-12:
  "frontend backend หน้า user permission ให้สามารถ add user และ delete user ได้"). Scope: replace the fixture adapter for the
  first-slice procedures, apply the SA rev 1 follow-ups, and add the Super Admin access guard. Allowed paths: `frontend/src/features/user-permission/**`,
  `frontend/src/features/setup/**`, `frontend/src/app/setup/user-permission/**`. No package, lockfile, provider, proxy, AppShell,
  backend, Docker or `globals.css` change. No container was created, stopped, restarted or rebuilt. No corrective pass was opened.
- Changed files (all under `frontend/src/features/user-permission/`): `api.ts` (rewritten: the fixture is removed; contract types come from
  `inferRouterClient<AppRouter>`; view-model mappers; domain-error parsing and mapping), `hooks.ts` (typed tRPC hooks), new `phone.ts`
  (`{country, e164}` mapping), `schema.ts`, `permission-utils.ts`, `user-permission-page.tsx`, `components/{delete-user-dialog,permissions-card,permission-matrix,personal-information-card,users-drawer}.tsx`,
  `components/ui/{switch,phone-field}.tsx`. `features/setup/**` and `app/setup/user-permission/page.tsx` are unchanged.

| ID | State | Notes |
|---|---|---|
| FE-UP-012 | first slice implemented | `permission.catalog` (staleTime ∞), `userAdmin.list` (30 s), `userAdmin.get` (`skipToken` until a user is selected), `userAdmin.locationOptions` (5 min), `userAdmin.create`, `userAdmin.delete`. The "Sample data" notice is removed. The badge reads "{checked applicable cells} of {applicableCount} on" (v1: 204). Create success: form reset (clears the password), list invalidated, the new user selected, toast "User created". Delete success: `get(id)` reset, list invalidated, selection cleared, toast "User deleted". Create uses the vanilla `utils.client.userAdmin.create.mutate` (not `useMutation`), so the password never enters the Query/Mutation cache. There is no `loggerLink`, and nothing is logged. A ref guard blocks double submit. Delete uses `useMutation` with only `{id}`, `gcTime: 0`, `retry: false`. Reads retry at most twice, and only for 5xx/network errors (no retry for 4xx, `LICENSE_*` or 401). |
| FE-UP-014 | implemented | `permission.mine` gates the page. Pending → skeleton. Not Super Admin → `<h1>` "You don't have access to User and permission" + "Back to Home". Error → message + Retry. `userAdmin.*`/`permission.catalog` hooks mount only inside the Super Admin workspace, so no data request is made for others. A later `SUPER_ADMIN_REQUIRED` on list/get/locations/create/delete invalidates `permission.mine`, so the guard re-renders. |
| SA rev 1 follow-ups | applied | Username validates as an email (≤ 254; `inputMode="email"`). Super Admin rows (`isSuperAdmin` or `readOnly`) show "Super Admin accounts are read-only." with no Delete. Phone maps to `{country, e164}` with the existing US +1 / TH +66 selector: spaces removed, a leading trunk `0` dropped (TH `081 234 5678` → `+66812345678`), result must match `^\+[1-9]\d{6,14}$` ("Enter a valid phone number"). Phone stays required in the UI (S2); the API's `null` is only used to display users without a phone. Name ≤ 120. |
| Deferred backend items | kept as UI placeholders | Active switch: ON, `aria-disabled`, visible hint "Deactivating users isn't available yet" (`aria-describedby`), and create always sends `active: true` (BE-UP-011). Photo tile: info toast; `photo` is never sent. Saved users: read-only view ("Editing saved users isn't available yet."). Print/Excel: "… isn't available yet" toasts. |

- Error mapping (create → field error or FormError banner `role="alert"`; delete → in-dialog error; loads → inline + Retry):
  `VALIDATION_ERROR` → `fieldErrors` mapped by path (`email`→Username, `password`, `name`, `phone*`→Phone, `locationKeys`→Location;
  unmapped or `(root)` → banner "Some details couldn't be saved. Check the form and try again."); `PASSWORD_POLICY_VIOLATION` → Password
  "Password must be 4–64 characters"; `EMAIL_ALREADY_EXISTS` → Username "This username is already in use"; `LOCATION_UNKNOWN` → Location
  "Select a location from the list" + refetch options; `PERMISSION_UNKNOWN` → banner + catalog refetch; `USER_LIMIT_REACHED` → banner
  "User limit reached ({limit} of {limit}). Delete a user before adding another." + list refetch; `USER_LICENSE_NOT_ELIGIBLE` → banner
  "This email has no issued license. Contact sales."; `USER_LICENSE_UNVERIFIABLE` → "Couldn't verify the license. Try again.";
  `USER_SERVICE_UNAVAILABLE` / 5xx / network → "Couldn't save the user. Try again." (the form keeps all values, including the password, until success);
  `SUPER_ADMIN_REQUIRED` → banner/dialog error + access re-check; caller `LICENSE_*` → "Your license doesn't allow this right now…";
  401 → "Your session has ended. Sign in again.". Delete: `USER_NOT_FOUND` → close dialog, info toast "This user was already deleted.",
  clear the selection, refetch the list; `SUPER_ADMIN_READ_ONLY` → in-dialog "Super Admin accounts and your own account can't be deleted.";
  others → "Couldn't delete the user. Try again.". Get: `USER_NOT_FOUND` → inline "This user no longer exists…" (no Retry) + list refetch.
  The first server field error receives focus. Raw server messages are never shown.
- Assumptions (owner may change): English copy for the new messages (Q-UP-25). The phone trunk-`0` rule and the E.164 check are the only
  phone rules (Q-UP-09 still open). Duplicating a Super Admin copies every applicable cell ("ALL"). There is no frontend license routing in
  this codebase, so caller `LICENSE_*` errors show a message on this page instead of redirecting. 401 shows a message;
  the AppShell `useSession` redirect still applies when the session is gone. Grants sent on create are limited to cells in the
  loaded catalog (stale keys are dropped client-side). The FormError banner (not a toast) is used for non-field create errors, per error-handling.md.
- Verification evidence (2026-10-12, `docker compose -f docker-compose.yml -f docker-compose.dev.yml exec -T frontend …`):
  - `pnpm --filter frontend typecheck`: exit 0 (`tsc --noEmit`, no output).
  - `pnpm --filter frontend lint`: exit 0, 0 errors, 2 existing warnings in `features/auth/login-form.tsx` (not touched). The first lint run
    flagged `react-hooks/refs` on a submit guard ref; it was moved into `useCreateUser`.
  - Node 24 assertion script (stdin, not saved in the repo) over `phone.ts`, `schema.ts`, `api.ts`, `permission-utils.ts` with
    real `TRPCClientError.from(...)` objects: `PASS 41 assertions` (E.164 mapping, email/name/phone/password/location validation,
    strict create input without `photo` and with `active: true`, the "ALL" expansion, stale-key count, every create/delete domain-code
    mapping, the retry policy, the message fallback for the old gateway). This tests logic only, not the UI.
  - Read-only probes: `GET :3000/setup/user-permission` → **200** (the route now registers). `GET :3000/api/trpc/permission.mine` and
    `:4000/trpc/permission.mine` → **404** "No procedure found": the live gateway still runs the old code.
- Pending a restart of the dev auth + gateway processes (owner approval needed; not done by this role): TC-UP-19/20/21 and every
  browser check of the live flow: access guard for admin@demo vs user@demo, catalog badge "0 of 204 on", list/usage, create success
  (selection + toast + drawer), each server error path, delete success/`USER_NOT_FOUND`, and absence of the password in
  React Query Devtools/cache and network logs. Until the restart, the page shows "Couldn't check your access to this page." (404 from
  `permission.mine`) and makes no `userAdmin.*` request. `next build` and the manual-tester journey (FE-UP-018) are also not run.

### Backend progress: SA revision 1, first slice "add + delete user" (2026-10-12)

- Run: `backend` role, branch `feat/12-10-26-user-permission`. Approval: SA rev 1 as recommended (owner, 2026-10-12, see
  Backend items). Parent made this role the sole writer of `backend-api-auth/prisma/**`, both `src/app.module.ts`, both
  `src/main.ts` and `backend-api-auth/src/scripts/seed.ts` for this run. No package, lockfile, Compose, Docker or `.env*` change;
  no dependency added. Open questions use SA defaults (`USER_SEAT_LIMIT` 3 incl. inactive, catalog v1 34 × 6, location `primary`,
  existing users no grants). No corrective pass was opened.
- Migration: `backend-api-auth/prisma/migrations/20261012120000_user_permission/migration.sql` (hand-written, additive: enum
  `PermissionAction`, `User.active/phone_e164/phone_country`, `UserPermission`, `UserLocation`, `UserPhoto`, index
  `User_role_createdAt_idx`, six CHECK constraints). `UserPhoto` exists but is unused in this slice.
- Changed files: auth `prisma/schema.prisma`, `src/app.module.ts`, `src/auth/{auth.ts,auth.controller.ts,auth.service.ts}`,
  `src/license/license.service.ts` (`evictStatus`), `src/scripts/seed.ts`, new `src/permission/{catalog.ts,grants.ts}`, new
  `src/user-admin/{user-provisioning.service.ts,user-admin.service.ts,user-admin.controller.ts,user-admin.schemas.ts,user-admin.errors.ts,location-options.ts,seat-limit.ts}`;
  gateway `src/main.ts`, `src/trpc/router.ts`, new `src/trpc/{auth-client.ts,domain-error.ts,user-admin-schemas.ts}`.
  Gateway `src/app.module.ts` unchanged (existing `req.body.password` redaction suffices; no body logging).
- tRPC delivered for FE-UP-012/014: `permission.catalog`, `permission.mine`, `userAdmin.list`, `userAdmin.get`,
  `userAdmin.create`, `userAdmin.delete`, `userAdmin.locationOptions`. Shapes match api-contract.md; deviations are in its
  "Implementation notes (first slice)". Not delivered: `userAdmin.update`, photo, CSV export, `ACCOUNT_INACTIVE` sign-in,
  VIEW-filtered `dashboard.shortcutGroups`.
- Verification evidence (2026-10-12, `docker compose -f docker-compose.yml -f docker-compose.dev.yml exec -T`):
  - `prisma validate`: valid. `db:generate`: generated 7.10.0. `db:migrate`: applied `20261012120000_user_permission`.
    `prisma migrate diff --from-config-datasource --to-schema prisma/schema.prisma --script`: empty (no drift). Existing 2 users `active=t`.
  - `pnpm --filter @gem-crm/backend-api-auth typecheck` exit 0; `lint` exit 0. `pnpm --filter @gem-crm/backend-api-gateway typecheck`
    exit 0; `lint` exit 0. `pnpm --filter frontend typecheck` exit 0 (frontend imports `AppRouter`).
  - `db:seed`: "Seeded 2 local demo accounts; the demo user has VIEW on 34 menus." SQL: user@demo.com 34 VIEW grants.
  - Runtime: the **live** auth/gateway dev processes did not load the new code (auth watch restarts fail with `EADDRINUSE`
    because the original PID keeps port 3101; the gateway watcher saw no change on the bind mount). Live `curl :4000/trpc/permission.mine`
    → 404 "No procedure found". So the new code was compiled with `tsc` into container-only `node_modules/.verify-dist` and run as
    short-lived `timeout 480` instances (auth :3199, gateway :4099 → auth :3199) inside the existing containers, then stopped and
    removed. 35/35 scripted checks passed: BT-UP-01 (authz, mine, catalog 11 nodes/34 leaves/204), BT-UP-02 (all 5 `userAdmin.*`
    and direct auth → 403 `SUPER_ADMIN_REQUIRED`), validation (`PASSWORD_POLICY_VIOLATION`, `VALIDATION_ERROR` + fieldErrors,
    `PERMISSION_UNKNOWN`, `LOCATION_UNKNOWN`, duplicates, `photo` rejected), BT-UP-03, BT-UP-04 (expired/revoked 422
    `USER_LICENSE_NOT_ELIGIBLE`, outage 503 `USER_LICENSE_UNVERIFIABLE`, pending created), BT-UP-05 (4th regular user → 409
    `USER_LIMIT_REACHED`, sequential only), BT-UP-06, BT-UP-12 (admin/self 403, delete 200, repeat 404, sessions/accounts/grants
    cascaded, 2 LoginAttempt rows kept with NULL user), BT-UP-13, BT-UP-16 (inactive → session-context 401, `session.current`
    401), existing `dashboard.shortcutGroups`/`license.status` unchanged. BT-UP-17 CRM: wrong key 401, password 400
    `PASSWORD_POLICY_VIOLATION`, expired 422 `LICENSE_REQUIRED`, outage 503 `LICENSE_UNVERIFIABLE`, success 201
    `{userId,email,createdAt}` role `admin` + LicenseCache, duplicate 409 `{error:"EMAIL_ALREADY_EXISTS"}` (same bodies as
    before; the CRM test admin was deleted afterwards). BT-UP-21: temp logs had 0 passwords/emails/phones; events carry IDs and
    field names only. BT-UP-23 (dev, mock, warm, n=30): session-context p50 7.0 ms, p95 57.7 ms (no guarantee claimed).
    All test users were deleted; the DB again holds only the 2 seeded accounts.
- Not run / gaps: `pnpm build` (Nest `deleteOutDir` would delete the bind-mounted `dist` used by the running process);
  parallel seat-cap race (BT-UP-05 concurrency); BT-UP-07..11, 14, 15, 18..20 (deferred items). **Live auth + gateway dev
  services need a restart** before frontend integration can call the new procedures through `:3000`/`:4000`.
- Known first-slice gap (BE-UP-011 deferred): a user created with `active:false` can still obtain a Better Auth session at
  `/api/auth/sign-in/email`; every gateway call then returns `UNAUTHORIZED` (fail closed), and AppShell's `useSession` still
  sees a session. Recommend the frontend send `active: true` only, or hide the switch, until BE-UP-011 ships.
- Parent follow-ups: add `USER_SEAT_LIMIT` to Compose/`.env.example` (BE-UP-013, optional because the code default is 3);
  tech-stack ledger row "none (backend)" can be marked implemented with no new package.

### Frontend progress: FE-UP-017 global AppShell (2026-10-14)

- Approval: owner instruction 2026-10-14 (see the approval table). Claimed scope for this run: `frontend/src/features/home/**`,
  shell-using pages in `frontend/src/app/**` (`page.tsx` via `home-dashboard`, `modules/[slug]`, `setup/user-permission`,
  `settings/profile`), `frontend/src/app/globals.css` (sole writer this run). No package, manifest, provider or contract change.
- Sources copied to [source/](../../apps/frontend/user-permission/source/) (SHA-256):
  - `06-sidebar.png` 472×2160 (236×1080 CSS at DPR 2): `93c0257857978705d1885af47e0b3cd5dc6af31a3bcc2d1d65ddfad051f81efc`
  - `07-topbar.png` 3368×96 (1684×48): `529d43e01ee2a13b8d96b706e1f638c4cb5bd86cce1d42890bd891bb9eb158f4`
  - `08-shell.png` 3840×2160 (1920×1080): `f43e8aa7e781521d95ca311ba21655f33ec6ac7f81f14a3575dfc9d3df3b380a`
- Implemented: `AppShell({ children, breadcrumbs?: { label, href? }[] })` = unchanged session guard + `Sidebar` + `Topbar` +
  `<main>` slot; `Sidebar`, `Breadcrumbs`, `Topbar` (clock, fullscreen, bell placeholder, `AccountMenu`), mobile drawer below `md`.
  The nav model now carries `href` and optional `activePrefix`; Setup links to `/setup/user-permission` and is active for
  `/setup/**`. This also closes the FE-UP-001 sidebar-entry handoff.
- Measured from pixels (device px ÷ 2): item 36 tall, 40 px pitch, radius ~7 (token 8), icon 18 / stroke 1.5, label 15 px;
  group label 13 px `#95A0A9`; active bg `#F5F5F6`; text `#1C252E`; divider 1 px `#EDEDED` 7 px under Purchase Order;
  logo 131.5×36; topbar padding 24, breadcrumbs 13 px (`#656B71` / current `#1C252E`), chevron 12, status dot 6 px `#22C55E`,
  date 13 px `#637381`, icon buttons 32 (icon 20), bell dot 5 px `#3385F0`, avatar 30 px `#1C252E` with white 12 px initials.
- Removed from the sidebar (routes and Home shortcuts kept): Company Profile, Bank, Purchase (PU), Memo In, Memo Return,
  Memo Out, Memo Out Return, Load, Inventory Primary/Consignment/Movement, Memo Outstanding, Receivable, Payable, and the
  Setup group items (Main Location, Sub Location, Currency, Certificate Type, Labour Type; still reachable from SetupTabs).
  Header: the inline Settings link moved into the avatar menu ("Profile settings"); the help (?) icon was removed.
- Verification (2026-10-14, inside the running `frontend` dev container): `pnpm --filter frontend typecheck` exit 0;
  `pnpm --filter frontend lint` exit 0 (0 errors, 2 pre-existing warnings in `features/auth/login-form.tsx`).
  `curl` of `/`, `/setup/user-permission`, `/modules/stone`, `/modules/report-primary`, `/settings/profile` → 200, but the
  dev server still served the **old** shell markup (`w-[187px]` skeleton) and CSS without the new tokens, even after
  touching the files inside the container: the Windows bind-mount change was not picked up. Containers were not restarted.
- Not run / gaps: browser visual compare with 06–08 at 1920×1080 and mobile, keyboard walk-through of the avatar menu and
  drawer, fullscreen in a real browser, `next build`, manual-tester (FE-UP-018). Font stays Arial (Q-UP-27 open); the
  source looks like IBM Plex Sans, so text widths differ. The bell's blue dot is decorative (no notification contract).

- Avatar-menu amendment (2026-10-14, owner slide "[FE] Implement Top Navbar"): `account-menu.tsx` now matches the open
  menu in the slide: header = email (14 px semibold) + role (12 px `#637381`), divider, **Settings** (`/settings/profile`),
  **User and permission** (`/setup/user-permission`, shown only when `permission.mine` says Super Admin), divider, red
  **Sign out**; no icons, 224 px wide, top 41 px under the avatar (sits on the topbar border). Role = "Super Admin" or "User"
  from `permission.mine` (same query key as the page, staleTime 30 s, no retry); blank while loading or on error. The rest of the
  topbar (breadcrumbs, status dot + clock, fullscreen, bell) was already as in the slide and is unchanged. Verification inside
  `f1-system-frontend-1`: `pnpm --filter frontend typecheck` exit 0; `pnpm --filter frontend lint` 0 errors (2 pre-existing
  warnings in `login-form.tsx`). Browser check of the open menu **not run**.

## Revision 2 (ADR-0020) backend

- revision: SA 2 (bundle [document/apps/backend/auth/user-permission/](../../apps/backend/auth/user-permission/)), source UI revision 2 (`source/rev2-01..04`)
- approval: [ADR-0020](../../adr/0020-username-login-and-permission-matrix-v2.md) revision 1 Accepted 2026-10-15, owner (developer_07): "frontend backend อนุมัติ ADR-0020" — an instruction to implement this revision (recorded as given; no further approval inferred)
- run: backend role, 2026-10-15, branch `feat/15-10-26-check-fix-userpermission` (no branch switch, nothing committed or pushed). Parent made backend the single writer of `backend-api-auth/prisma/**` and both services' `src/main.ts` for this run; no package, lockfile, Compose, Dockerfile or `.env*` change
- handoff: [user-permission-v2-backend.md](../../coordination/handoffs/user-permission-v2-backend.md)

| Done | ID | Status | Task | Files | Evidence |
|---|---|---|---|---|---|
| [x] | BE-UP2-001 | done | Migration `20261015120000_username_permission_v2`: enum + APPROVE/PRINT/EXCEL, `User.username` (unique, CHECK) backfilled from lower(email), email → `<id>@users.invalid`, delete all `UserPermission` | `backend-api-auth/prisma/schema.prisma`, `prisma/migrations/20261015120000_username_permission_v2/migration.sql` | applied on dev DB at auth start-up; `migrate diff` empty; 3 users keep login text; 0 grants (BT-UP2-00) |
| [x] | BE-UP2-002 | done | Better Auth `username` plugin (installed 1.7.7), `/sign-in/username`; disabled `/sign-in/email`, `/update-user`, `/change-email`, `/is-username-available`; username policy module | `src/auth/auth.ts`, new `src/auth/username-policy.ts` | BT-UP2-01/02 |
| [x] | BE-UP2-003 | done | Lockout/rate limit/LoginAttempt on `/sign-in/username` (HMAC of normalized username); 401 `INVALID_USERNAME_OR_PASSWORD` + `attemptsRemaining`, 423 `ACCOUNT_LOCKED` + `retryAfterSeconds`; `ACCOUNT_INACTIVE` 403 (closes BE-UP-011) | `src/auth/auth.ts` | BT-UP2-11/12/13 |
| [x] | BE-UP2-004 | done | Catalog v2 (`version 2`, `actions`, `kind`, 39 leaves, 347), bound 576 | `src/permission/catalog.ts`; gateway `src/trpc/user-admin-schemas.ts` | BT-UP2-04 |
| [x] | BE-UP2-005 | done | userAdmin `email`→`username`; new `userAdmin.update` (PATCH; Super Admin lock; `USERNAME_IMMUTABLE`, `USER_CHANGED`, password reset → sessions revoked + lockout cleared; deactivate → sessions revoked); `SUPER_ADMIN_LOCKED` on delete (closes BE-UP-007 except photo) | auth `src/user-admin/{user-admin.service,user-admin.controller,user-admin.schemas,user-admin.errors,user-provisioning.service}.ts`; gateway `src/trpc/{router,auth-client,user-admin-schemas}.ts` | BT-UP2-05..10, 15, 17 |
| [x] | BE-UP2-006 | done | CRM `POST /api/v1/users` `username` + deprecated `email` alias | `src/auth/auth.service.ts` | BT-UP2-16 |
| [x] | BE-UP2-007 | done | License subject = username (session-context, license status/activate, user-admin license gate, provisioning cache) | `src/auth/auth.controller.ts`, `src/license/{license.service,license.client}.ts`, `src/user-admin/user-admin.service.ts` | BT-UP2-03, 16 |
| [x] | BE-UP2-008 | done | Session user `username` (session-context + gateway `SessionUser`); `dashboard.shortcutGroups` v2 keys + `dashboard:VIEW` | auth `src/auth/auth.controller.ts`; gateway `src/main.ts`, `src/trpc/router.ts` | BT-UP2-03, 14 |
| [x] | BE-UP2-009 | done | Dev seed: usernames `superadmin@demo.com` / `user@demo.com`; demo user `dashboard:VIEW` | `src/scripts/seed.ts` | `db:seed` output |
| [x] | BE-UP2-010 | done | SA rev 2 docs: bundle (api-contract, database-diagram, decisions, testing, sequence, authorization, error-handling, architecture, dependencies), spec 0001/0002, login-flow diagram, login test cases | `document/**` listed | this run |
| [ ] | BE-UP2-011 | deferred (deviation) | Super Admin/regular `photo` on update/create (still BE-UP-009/012; strict schemas reject `photo`) | — | — |

Checks (2026-10-15): auth `typecheck` 0, `lint` 0, build-config `tsc` 0; gateway `typecheck` 0, `lint` 0, build-config `tsc` 0;
frontend `tsc --noEmit` 0 errors (read-only); runtime 57/57 ([results](../../apps/backend/auth/user-permission/testing.md#results--sa-revision-2-backend-2026-10-15)).

## Corrective work

Revision 2 backend (2026-10-15): root cause **RC-UP2-1** — after-hook responses built with `ctx.json(body, {status})`
keep Better Auth's original endpoint status (observed: `ACCOUNT_INACTIVE` returned 200; impossible-format username
returned 422). Pass 1 of 3 (initial fix): both responses now use a raw `Response` with an explicit status, like the
existing 423 path. Re-run: 57/57, closed. Passes used: 1. (A test-script quoting bug was fixed at the same time; not a
product defect.)

Otherwise no corrective work is open. If a defect arises during implementation, link one root-cause ledger and apply
[bounded remediation](../../workflow/remediation.md): default pass limit 3, record the allocated/active pass and
per-pass evidence, and share the counts with backend. New revisions, reviewers or sessions do not reset them.

## Revision 2 (ADR-0020) frontend

- revision: UI 2
- status: in-progress
- source: [rev2-01..04](../../apps/frontend/user-permission/source/) (owner screenshots 2026-10-15); [ui-spec revision 2](../../apps/frontend/user-permission/ui-spec.md#revision-2-adr-0020)
- contract: [ADR-0020](../../adr/0020-username-login-and-permission-matrix-v2.md) revision 1; gateway `AppRouter` (`backend-api-gateway/src/trpc/user-admin-schemas.ts`, SA revision 2 shapes)
- approved-revision: UI 2 with ADR-0020 revision 1
- approved-by: owner (developer_07)
- approved-at: 2026-10-15
- approval-evidence: 2026-10-15 owner: "frontend backend อนุมัติ ADR-0020" (instruction to implement)
- task claim: [user-permission-v2-frontend.md](../../coordination/tasks/user-permission-v2-frontend.md)
- open questions (defaults implemented): Q-UP2-01…06 in [open-questions.md](../../apps/frontend/user-permission/open-questions.md#revision-2-adr-0020-questions)

| Done | ID | Status | Owner | Task | Allowed files | Depends on | Acceptance criteria | Verification |
|---|---|---|---|---|---|---|---|---|
| [ ] | FE-UP2-001 | implemented | frontend | Header: title, "User List N", Print / Excel (disabled + tooltip) / Duplicate / Refresh, action row Create User / Cancel / Save / Edit / Delete with create/view/edit states | `frontend/src/features/user-permission/**` | ADR-0020 §4; Q-UP2-02 | Button enablement per mode exactly as rev2-02/03; Delete disabled for Super Admin/self | TC-UP2-01, 02 |
| [ ] | FE-UP2-002 | implemented | frontend | View/edit/create mode state machine: select user = view; Edit; Cancel (restore / return to previous user); Save = create or `userAdmin.update` (`expectedUpdatedAt`, blank password omitted); Duplicate copies details + permissions, clears Username/Password | `frontend/src/features/user-permission/**` | BE `userAdmin.update` | Saved values restored on Cancel; `USER_CHANGED`, `USER_NOT_FOUND`, `SUPER_ADMIN_LOCKED`, `USERNAME_IMMUTABLE` mapped; password never in Query cache | TC-UP2-03..06 |
| [ ] | FE-UP2-003 | implemented | frontend | Permission matrix v2: 9 columns, Select All, Dashboard "—", section headings, groups with chevron + "N sub-menus", leaf/sub-menu styles, search, "All Permissions" filter, Expand/Collapse All, "x of 347 permissions on" | `frontend/src/features/user-permission/**`, `frontend/src/components/ui/checkbox.tsx` (additive `DisabledCheckbox`) | catalog v2; Q-UP2-01, 06 | Matches rev2-01/02; aggregates never sent as grants; counter from catalog `applicableCount` | TC-UP2-07..10 |
| [ ] | FE-UP2-004 | implemented | frontend | Personal Information: Username (create only, 3–64 `[a-z0-9._@+-]` after trim+lowercase, "Used to sign in"), Password optional on edit, Name*, Phone No. optional, Location*, Active switch editable | `frontend/src/features/user-permission/**` | ADR-0020 §1; Q-UP2-04 | Username read-only after creation; client rule equals server rule | TC-UP2-11, 12 |
| [ ] | FE-UP2-005 | implemented | frontend | Super Admin: locked matrix + lock banner (PRINT/EXCEL included), Name/Phone/Location editable via Edit, Username/Password/Active locked, Delete disabled | `frontend/src/features/user-permission/**` | ADR-0020 §3, §4 | Update sends only `name`, `phone`, `locationKeys` (+ `id`, `expectedUpdatedAt`) | TC-UP2-13 |
| [ ] | FE-UP2-006 | implemented | frontend | Drawer: "Users {limit}", search by name/username, rows name + username, draft item only while creating | `frontend/src/features/user-permission/**` | Q-UP2-03 | Matches rev2-02/03 | TC-UP2-14 |
| [ ] | FE-UP2-007 | implemented | frontend | Delete dialog "Delete {username}?" / body / Keep user / Delete | `frontend/src/features/user-permission/**` | — | Copy matches rev2-04 | TC-UP2-15 |
| [ ] | FE-UP2-008 | implemented | frontend | Login by username: `usernameClient()` in the auth client, `authClient.signIn.username`, label "Username", no e-mail format check, `ACCOUNT_INACTIVE` message, demo buttons "Use Username" | `frontend/src/lib/auth-client.ts`, `frontend/src/features/auth/**` | BE `/sign-in/username` | `user1` and `User1` sign in; lockout/attempts messages unchanged | TC-UP2-16, 17 |
| [x] | FE-UP2-009 | done (API level; browser not run) | frontend | Contract integration check against the running gateway (types from `AppRouter`; curl: username sign-in, catalog v2, create/update/delete `fe-up2-test`) | none (checks) | backend handoff | Real responses match the view models | TC-UP2-18 |
| [ ] | FE-UP2-010 | implemented (parent-assigned 2026-10-15, backend deviation 6) | frontend (frontend-home scope) | Avatar menu shows `session.user.username` instead of the internal `<id>@users.invalid` email | `frontend/src/features/home/account-menu.tsx`, `app-shell.tsx` | Q-UP2-05 | Menu header shows the username | manual |

Photo upload (FE-UP-013) remains blocked on photo storage (BE-UP-009); Excel export waits for its own ADR.

### Frontend progress: UI revision 2 (2026-10-15)

- Implemented FE-UP2-001…008 and FE-UP2-010 against the actual backend contract ([handoff](../../coordination/handoffs/user-permission-v2-backend.md)); types come from the gateway `AppRouter` (`features/user-permission/contract.ts`), no local mirror.
- Backend deviations applied: no `photo` field is sent (Photo tile stays a placeholder with the "Photo upload isn't available yet" toast); `usernameClient()` added to the auth client; catalog rows are keyed `${kind}:${key}` (section `purchase` vs leaf `purchase`); the avatar menu shows `username`; `SUPER_ADMIN_LOCKED` mapped for update and delete; `expectedUpdatedAt` always sent from `get().updatedAt`, so `USER_CHANGED` is detected.
- Checks run inside `f1-system-frontend-1`: `npx tsc --noEmit` exit 0; `npx eslint src` 0 errors (2 pre-existing warnings in `login-form.tsx`, line 46). After `docker restart f1-system-frontend-1`: `/login` HTTP 200 with the "Username" label and "Use Username" demo buttons in SSR HTML; `/setup/user-permission` HTTP 200.
- Integration through the frontend same-origin proxies (`localhost:3000/api/auth`, `/api/trpc`), 2026-10-15: `sign-in/username` `superadmin@demo.com` 200 (user body has `username`, internal email); `sign-in/email` 404; wrong password 401 `INVALID_USERNAME_OR_PASSWORD` + `attemptsRemaining: 2`; `permission.catalog` version 2, 9 actions, top level `dashboard` + 8 sections, 39 leaves = 347 cells = `applicableCount`, Dashboard VIEW/APPROVE/PRICE/PRINT/EXCEL, groups Master Code 7 / Memo Outstanding 2 / Account Outstanding 2 / Stock Movement 2 / Closing Stock 2 / Sale Report 3; `userAdmin.list` items carry `username`; create `fe-up2-test` 200; duplicate 409 `USERNAME_TAKEN`; `"user one"` 400 `VALIDATION_ERROR` path `username`; update in the `toUpdateUserInput` shape 200 and `get` shows the new name/phone/permissions; stale `expectedUpdatedAt` 409 `USER_CHANGED`; sign-in as `FE-UP2-Test` (mixed case) 200 and `permission.mine` returned its grants; Super Admin target: `{id, name, phone}` update 200 (values unchanged), `permissions` / `active:false` / delete each 403 `SUPER_ADMIN_LOCKED`; delete `fe-up2-test` 200, repeat 404 `USER_NOT_FOUND`. The test user was deleted.
- Finding: the seeded Super Admin has `locationKeys: []`. Location is required in the form (and `min(1)` in the contract), so editing the Super Admin requires choosing a location before Save. Not a code defect; noted for the owner.
- Not run: every browser/visual check (no browser automation), keyboard walk-throughs, `next build`, manual-tester.
