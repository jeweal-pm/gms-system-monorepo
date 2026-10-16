# Frontend acceptance and verification: customer

- UI revision: 3 ([revision 3 cases and checks](#revision-3-draft-row-and-address-card-checks-2026-10-16)); revision 2 = ADR-0021 ([revision 2 cases and checks](#revision-2-adr-0021-checks-2026-10-16)). Revision 1 cases TC-CUS-04, 16, 17, 22 are superseded where revision 2 says so; TC-CUS-10, 11, 13 (badge part), 15, 17 and the draft-row part of TC-CUS-40 are superseded by revision 3.
- Reference image and viewport: [source/](source/) screenshots, 1920×1080 CSS (assumed DPR 1)
- Relevant TODO / API / SA revisions: [central TODO](../../../task/todo/customer.md); [ADR-0018](../../../adr/0018-customer-master-partner-service.md) rev 1 (Accepted); SA bundle pending
- ADR observable checks covered: 1, 2, 3 (UI side), 4 (UI side), 5, 6, 7 (UI side), 8, 10

Implementation of FE-CUS-001…017 exists; since FE-CUS-014 (2026-10-14) it uses the live gateway `customer.*` (the fixture adapter was removed). **No browser case has been run** (no browser automation is installed); the Evidence column records only what was actually executed. Run log:

| Date | Check (inside `f1-system-frontend-1`) | Result |
|---|---|---|
| 2026-10-14 | `npx tsc --noEmit` | exit 0 |
| 2026-10-14 | `npx eslint src` | exit 0; 0 errors, 2 pre-existing warnings (`features/auth/login-form.tsx`) |
| 2026-10-14 | Node logic script (jiti) over `schema.ts`, `api.ts` mappers, `access.ts`, `fixture.ts` | 44 passed, 0 failed |
| 2026-10-14 | HTTP GET after `docker compose … restart frontend`: `/setup/customer`, `/setup/user-permission`, `/modules/customer`, `/` | all 200 (server render compiles; client UI not observed) |
| 2026-10-14 | Signed in as the demo Super Admin, `GET /api/trpc/permission.mine` | 200 `{"isSuperAdmin":true,"permissions":"ALL"}` |
| 2026-10-14 | `grep -E "#[0-9a-fA-F]{3,8}" frontend/src/features/customer` | no matches |
| — | `next build` | not run (would write into the dev server's shared `.next` volume) |
| 2026-10-14 (FE-CUS-014/015) | `npx tsc --noEmit` / `npx eslint src` after the tRPC swap | exit 0 / exit 0 (0 errors, 2 pre-existing warnings) |
| 2026-10-14 | Live tRPC through `http://localhost:3000/api/trpc` with a Better Auth cookie (demo Super Admin), host Node script | `options` 200 (162 currencies, 249 countries); `list` 200 (empty DB: 0 items, total 0); `create` (2 invoice + 1 shipping) 200 `{id, updatedAt}`; second create with code in other case 409 `CUSTOMER_CODE_TAKEN` `[{path:"code",code:"duplicate"}]`; postcode 21 chars on invoice #2 400 `VALIDATION_ERROR` `[{path:"invoiceAddresses.1.postcode",code:"too_big"}]`; two shipping defaults 400 `[{path:"shippingAddresses",code:"multiple_defaults"}]`; `get` 200 with positions and defaults as sent; `list q=fecus-c` 200 1 match; `update` 200; update with the old `expectedUpdatedAt` 409 `CUSTOMER_STALE`; `delete` 200 `{ok:true}`; delete again / get / update deleted 404 `CUSTOMER_NOT_FOUND`; bad cursor 400 `[{path:"cursor",code:"invalid"}]` |
| 2026-10-14 | Frontend mappers (`api.ts`) over real `TRPCClientError`s from live calls, run inside `f1-system-frontend-1` | 16 passed, 0 failed (code taken → Code Name field; `unknown` currency → field + options refetch; `invoiceAddresses.1.postcode` → that field; `multiple_defaults` → banner; stale → banner + Reload; delete 404 → "already deleted"; update 404 → not-found banner; get 404 message). PARTNER_UNAVAILABLE checked only with a constructed 503 error |
| 2026-10-14 | Schema/mapper/access logic script (fixture checks removed) | 39 passed, 0 failed |
| 2026-10-14 | Cleanup | every `FECUS*` customer deleted; `list q=FECUS` total 0 |
| 2026-10-14 | Signed-in HTTP GET after frontend restart: `/setup/customer`, `/setup/user-permission`, `/`, `/modules/customer`; `dashboard.shortcutGroups` | all 200; Customer shortcut item `{"label":"Customer","slug":"customer","href":"/setup/customer"}` (dashboard now links via `navigationHref`) |

| Case ID | TODO / component | Starting state | User actions | Expected result | Viewport / keyboard | Evidence / result |
|---|---|---|---|---|---|---|
| TC-CUS-01 | FE-CUS-002/003 | Signed in, licensed, has `customer:VIEW` | Click sidebar Partner Master › Customer; then Setup tab Customer | Both open `/setup/customer`; breadcrumb `Home › Setup › Customer`; Customer tab active (`aria-current="page"`); sidebar item highlighted | 1920×1080 | not run (browser); HTTP 200 for `/setup/customer` only |
| TC-CUS-02 | FE-CUS-004 | User without `customer:VIEW` | Open `/setup/customer` | Access-denied page; network shows no `customer.*` call | — | not run |
| TC-CUS-03 | FE-CUS-004/005 | VIEW only | Inspect toolbar, drawer, form | Print, Refresh, disabled Excel only; no draft row/Create/Save/Duplicate/Delete; form read-only after selecting a row | — | not run |
| TC-CUS-04 | FE-CUS-005 | ADD + EDIT + DELETE, saved customer open | Inspect toolbar | Print, Excel (disabled, tooltip on hover and focus), Duplicate, Refresh, Delete, Save; Tab order left→right | keyboard | not run |
| TC-CUS-05 | FE-CUS-006 | Draft | Compare with S1 (no errors) / S2 | Card header with Active switch on; 3-column grid capped ~1290 px (S2 empty space on the right with drawer collapsed); "Basic Information" subheading; notched labels; asterisks on Name, Currency, First name, Email | 1920×1080; visual compare | not run |
| TC-CUS-06 | FE-CUS-008 | Empty draft | Click Create Customer | Errors on Name, Currency, First name, Email, and every required address field; item frames red; focus on Name; button was enabled before | Enter submits | not run (browser); schema logic: required errors on Name, Currency, First name, Email and required address fields — pass |
| TC-CUS-07 | FE-CUS-008 | Name shows an error | Type a valid name | Error clears on change | — | not run |
| TC-CUS-08 | FE-CUS-008 | — | Enter 201-char Name, 121-char Code Name, 255-char Email, 33-char Tax ID, 21-char Postcode, blur | Each shows its max-length message; Code Name/Middle/Last/Tax ID empty is valid | — | not run (browser); schema logic: each max-length message and empty optional fields — pass |
| TC-CUS-09 | FE-CUS-006/008 | Phone empty | Submit valid form; then type letters; then a too-short number | Empty phone accepted (sent `null`); letters blocked; short number "Enter a valid phone number" | numeric keyboard (`inputMode`) | not run (browser); logic: empty phone → `null`, short number and >15 digits rejected — pass |
| TC-CUS-10 | FE-CUS-007 | Draft | Inspect Invoice and Shipping cards | One item each, expanded, "#1", Default badge, default checked, no trash; Shipping has no Tax ID; button texts "Add another invoice address" / "Add another shipping address" (DV-06) | 1920×1080 | not run |
| TC-CUS-11 | FE-CUS-007 | Draft | Add an invoice address; collapse #1 | Matches S2/S3: count badge 2, #1 collapsed with Default badge, #2 expanded with trash, default unchecked; focus on #2 first field | keyboard Enter/Space on chevron | not run |
| TC-CUS-12 | FE-CUS-007 | 10 invoice items | Inspect add button; add shipping items to 10 | Button disabled with "Up to 10 invoice addresses"; each type limited separately | — | not run |
| TC-CUS-13 | FE-CUS-007 | 3 invoice items, #1 default | Check default on #3; try to uncheck it; remove #3 | Default moves to #3 (only one checked, badge follows); unchecking is blocked with hint; removing #3 makes #1 default; items renumber | — | not run |
| TC-CUS-14 | FE-CUS-007 | Item with no Country | Tab through the item | State/City disabled with "Choose a country first" and skipped; after choosing a Country they are enabled and focusable; changing Country keeps their text | keyboard | not run (browser); schema logic: State/City required only once a Country is chosen — pass |
| TC-CUS-15 | FE-CUS-008 | #2 collapsed with an empty required field | Submit | #2 expands automatically and its first invalid field gets focus (when it is the first error) | — | not run |
| TC-CUS-16 | FE-CUS-009 | Drawer open | Compare with S1/S3 | Title "Customers" + total; search placeholder "Search name or code name..."; rows: bold Name, Code Name second line (or "No code name"), green dot, Inactive badge for inactive | 1920×1080 | not run |
| TC-CUS-17 | FE-CUS-009 | Draft with Name "ACME" and Code Name "C-01" typed | Look at the draft row | Draft row shows "ACME" / "C-01" with Draft badge; empty draft shows "New customer" / "Not saved yet" | — | not run |
| TC-CUS-18 | FE-CUS-009 | > 50 customers | Scroll to the end of the list; use "Load more" by keyboard | Next 50 load; no request while one is in flight; never more than 50 per request | keyboard | not run (browser); fixture logic: 57 rows → pages of 50 + 7 without overlap — pass |
| TC-CUS-19 | FE-CUS-009 | — | Type "vendor-b" quickly | One request after 300 ms idle; results match Name or Code Name case-insensitively; no-match text when empty | — | not run |
| TC-CUS-20 | FE-CUS-009 | Drawer open | Collapse, then expand | Content widens/narrows (S2/S3); focus stays on the toggle; X returns focus to the toggle | — | not run |
| TC-CUS-21 | FE-CUS-010 | Saved customer with an unsaved change | Click another row; Refresh; Duplicate; the draft row; reload the tab | Discard dialog for each in-page action (Keep editing keeps values); native prompt on reload; no prompt when not dirty | Esc = Keep editing | not run |
| TC-CUS-22 | FE-CUS-011 | Saved customer open, has ADD | Duplicate | New draft with all values copied **except Code Name**; addresses copied without IDs; info toast; focus Name; title "Add Customer" | toast does not take focus | not run (browser); mapper logic: Code Name and address IDs cleared — pass |
| TC-CUS-23 | FE-CUS-012 | Saved customer, has DELETE | Delete → Keep customer; Delete → Delete | First closes with focus on Delete; second shows "Deleting...", Esc ignored, then toast "Customer deleted", row gone, draft selected | focus starts on "Keep customer" | not run |
| TC-CUS-24 | FE-CUS-013 | Saved customer with unsaved edits | Print | Print preview shows only the saved customer (all addresses expanded), no shell/drawer/toolbar; unsaved edits not printed | browser print preview | not run |
| TC-CUS-25 | FE-CUS-014 | Backend delivered | Create a customer with 2 invoice + 1 shipping | Saved; drawer shows it; reopening shows the same data and the default flags | — | API level pass (create 2 invoice + 1 shipping, get returns same data and defaults); browser not run |
| TC-CUS-26 | FE-CUS-015 | Two sessions on one customer | Save in A, then save in B | B shows the stale banner; Reload loads A's version | — | API level pass (old `expectedUpdatedAt` → 409 `CUSTOMER_STALE`; mapper → banner + Reload); browser not run |
| TC-CUS-27 | FE-CUS-015 | Existing code "C-01" (any case) | Create another with "c-01" | Code Name error "This code name is already in use" | — | API level pass ("fecus-c-01" after "FECUS-C-01" → `CUSTOMER_CODE_TAKEN`; mapper → "This code name is already in use"); browser not run |
| TC-CUS-28 | FE-CUS-015 | Partner service stopped | Save | Banner "Customer service is unavailable…"; values kept; exactly one request (no retry) | network panel | not run (partner not stopped while infra verifies Compose); mapping checked with a constructed 503 only |
| TC-CUS-29 | FE-CUS-016 | — | Compare colors with S1–S3 | Tokens match samples within anti-aliasing; no hex values in `features/customer/**` (grep) | 1920×1080 | grep part: no hex in `features/customer/**` — pass; visual comparison not run |
| TC-CUS-30 | FE-CUS-017 | — | Resize to 1280, 1024, 768, 390 | Proposed responsive behavior; no horizontal page scroll | widths listed | not run |
| TC-CUS-31 | FE-CUS-001 | After promotion | Open `/setup/user-permission` and run its create/delete/duplicate journey | Unchanged behavior and appearance (regression check for the moved primitives) | 1920×1080 | not run |
| TC-CUS-32 | all | — | Keyboard-only: create with 2 addresses, edit, duplicate, delete | Every control reachable with visible focus; dialogs trap focus and return it | keyboard | not run |

## Checks discovered

`pnpm --filter frontend typecheck`, `pnpm --filter frontend lint`, `pnpm --filter frontend build` exist
(`frontend/package.json`). No unit or E2E runner is installed (tech-stack.md). Pure logic (schema,
default-address invariant, mappers, error mapping, permission helper) can be checked with a throwaway
Node script as user-permission did, but such a script is not a test suite. Use browser observation at
the listed viewports, then run manual-tester for the changed journey; customer reports go in
`document/testing/user-check/`.

## Revision 2 (ADR-0021) checks, 2026-10-16

Source revision: working tree over HEAD `974134c` on `feat/16-10-26-fix-design-add-runingnumber` (uncommitted).
Shared with [vendor revision 3](../vendor/testing.md#revision-3-adr-0021-checks-2026-10-16): the change lives in
`features/partner/**`, so one run covers both entities.

**Automated-testing status: not satisfied.** No unit or integration runner is installed in `frontend/package.json`
(tech-stack.md lists Vitest as a future addition) and this run was not authorized to add dependencies. The case IDs
below are mapped so a suite can implement them as-is; the "throwaway script" results are executed evidence but are
**not** a test suite. FE-CUS-023 stays blocked until an approved runner executes them.

### Target → case map

| Target (changed) | Unit cases | Integration cases |
|---|---|---|
| `partner/schema.ts` `partnerInfoShape.code` (required) | UT-ADR21-01a…h | IT-ADR21-03 |
| `partner/code-suggestion.ts` `shouldPrefillCode`, `replacedTakenCodeMessage` | UT-ADR21-02a…g | TC-CUS-38/39 (browser) |
| `partner/hooks.ts` `useSuggestedCodePrefill` | (hook; covered by integration) | TC-CUS-38/39 (browser); needs a React test renderer once a runner exists |
| `partner/components/partner-page-header.tsx` `partnerHeaderButtons`, `partnerTitle`, `PartnerPageHeader` | UT-ADR21-03a…k | TC-CUS-33…37 (browser) |
| `partner/components/partner-drawer.tsx` row order | — | IT-ADR21-05 (data), TC-CUS-40 (browser) |
| `partner/components/partner-information-card.tsx` Code Name `*` | — | TC-CUS-33 (browser) |
| `partner/errors.ts` `required` code | UT-ADR21-04f, 04g | IT-ADR21-04 |
| `customer/api.ts` `toCustomerFields`, `mapSaveError` (`refetchNextCode`, `required`) | UT-ADR21-04a, 04c, 04e, 04h | IT-ADR21-03, 04 |
| `customer/hooks.ts` `useCustomerNextCode` | — | IT-ADR21-01, 02 |
| `customer/customer-page.tsx` modes / Cancel / Edit / prefill wiring | — | TC-CUS-33…39 (browser) |

### Executed

| Check | Command / method | Result |
|---|---|---|
| Typecheck | `docker compose -f docker-compose.yml -f docker-compose.dev.yml exec -e CI=true frontend pnpm --store-dir=/root/.local/share/pnpm/store typecheck` (after `restart frontend`) | exit 0, against the gateway `AppRouter` that already exposes `customer.nextCode` / `vendor.nextCode` |
| Lint | same container, `pnpm … lint` | exit 0; 0 errors; the 2 existing warnings in `features/auth/login-form.tsx:46` |
| Logic script (throwaway, jiti, real modules, inside the frontend container; deleted after the run) | UT-ADR21-01…04 | 34/34 passed. First run 28/34: the 6 mapper cases failed because the script loaded a second `@trpc/client` copy (harness issue, `instanceof` mismatch); fixed in the script only, no product change |
| Live tRPC through `http://localhost:3000/api/trpc` (host Node script, signed in as the dev demo Super Admin; password not printed) | IT-ADR21-01…05 for customer and vendor | 15/15 passed: IT-01 `customer.nextCode` 200 `C001`; IT-02 create with `C001` 200, then `nextCode` → `C002`; IT-03 blank code `"   "` → 400 `VALIDATION_ERROR [{path:"code",code:"required"}]`; IT-04 `c001` (other case) → 409 `CUSTOMER_CODE_TAKEN [{path:"code",code:"duplicate"}]`; IT-05 `list q=C001` returns the row with `code:"C001"`; cleanup delete 200. Same for vendor (`V001` → `V002`, `VENDOR_CODE_TAKEN`). |
| Defect found by IT-03 | server code `required` was not in the mapper rules | fixed in `partner/errors.ts` and `customer/api.ts`; UT-ADR21-04e/f pass after the fix |
| Routes (signed in) | GET `/setup/customer`, `/setup/vendor`, `/setup/user-permission` | 200 / 200 / 200 (server render only; client UI not observed) |
| Dev log | `docker compose … logs --since 15m frontend` | no compile/runtime error (only the SIGTERM from the requested restart) |
| Not run | browser, visual, keyboard, `next build` (shared `.next` volume), automated suite (no runner), security reviews (parent) | — |

### Revision 2 acceptance cases (browser; all not run)

| Case ID | TODO | Starting state | User actions | Expected result | Evidence |
|---|---|---|---|---|---|
| TC-CUS-33 | FE-CUS-019/020 | ADD+EDIT+DELETE, no selection | Open `/setup/customer` | Title "Add Customer", "Customer List N"; Print/Duplicate disabled, Excel disabled with tooltip, Refresh; Create Customer, Edit, Delete disabled; Cancel, Save enabled; Code Name shows `*` and the suggested `C…` code | not run |
| TC-CUS-34 | FE-CUS-019 | Saved customer selected | Inspect header and form | Title = customer name; form read-only; Create Customer, Edit, Delete enabled; Cancel, Save disabled | not run |
| TC-CUS-35 | FE-CUS-019 | View mode | Edit → change Name → Cancel | Fields editable after Edit (focus Code Name); Cancel restores saved values and returns to view; no discard prompt | not run |
| TC-CUS-36 | FE-CUS-019 | View mode | Edit → change → Save | "Customer saved" toast; back to view with saved values | not run |
| TC-CUS-37 | FE-CUS-019 | VIEW only / EDIT only / no DELETE | Inspect buttons | Create/Edit/Delete hidden without ADD/EDIT/DELETE; Cancel/Save hidden for VIEW only | not run |
| TC-CUS-38 | FE-CUS-021 | Create mode, suggestion `C00n` | Clear Code Name and blur; then Create Customer → Cancel | "Code Name is required"; Cancel returns to the customer open before Create (or a fresh draft with the suggestion) | not run |
| TC-CUS-39 | FE-CUS-021 | Two tabs in create mode with the same suggestion | Save in A, then Save in B | B: Code Name error naming the taken code; the field now holds the next suggestion; saving again succeeds. A value the user typed is never replaced | not run |
| TC-CUS-40 | FE-CUS-022 | Drawer open | Compare with rev2-02 | Bold Code Name, second line Name; green dot Active; "Inactive" badge; draft row shows typed Code Name / Name; search by code or name | not run |

## Revision 3 (draft row and address card) checks, 2026-10-16

Source revision: working tree over HEAD `974134c` on `feat/16-10-26-fix-design-add-runingnumber` (uncommitted, on top of
the uncommitted ADR-0021 work). Changed frontend files: `frontend/src/features/partner/components/{address-item.tsx,address-list-card.tsx,partner-drawer.tsx}`, `frontend/src/features/customer/{customer-page.tsx,components/customers-drawer.tsx}`, `frontend/src/features/vendor/{vendor-page.tsx,components/vendors-drawer.tsx}`. Content hash `15b0711a0e4dfed3` (sha256 prefix of the 7 changed frontend files concatenated in the order listed in the map).
Shared with [vendor revision 4](../vendor/testing.md#revision-4-draft-row-and-address-card-checks-2026-10-16).

**Automated-testing status: not satisfied.** Same gap as revision 2 (A-07): no frontend unit/integration runner is
installed and this run was not authorized to add dependencies. Case IDs are mapped below; FE-CUS-R3-005 stays blocked.

### Target → case map

| Target (changed) | Unit cases | Integration cases |
|---|---|---|
| `partner/components/partner-drawer.tsx` `draftRowTitle`, draft row markup (`draft: boolean`) | UT-R3-01a (customer → "New customer"), UT-R3-01b (vendor → "New vendor") | IT-R3-01: render the drawer with `draft` and a form whose Code Name/Name change; the draft row text stays "New customer" / "Not saved yet"; TC-CUS-41 (browser) |
| `customer/components/customers-drawer.tsx` prop type | — | IT-R3-01 |
| `customer/customer-page.tsx` `draft={access.add}`, removed accordion refs, `focusFirstError` | — | IT-R3-01; IT-R3-04 (submit with an error in invoice #2 focuses its first invalid field); TC-CUS-41, 45 |
| `partner/components/address-item.tsx` card layout, checkbox row, trash enable/disable, read-only | UT-R3-02a…e: trash enabled only for index ≥ 1 and not read-only; checkbox `aria-disabled` when read-only; checkbox `aria-disabled` when `exactlyOne` and default; not locked for `atMostOne`; "#N" label text | IT-R3-02 (render a list in view mode: all checkboxes `aria-disabled`, all trash `disabled`); TC-CUS-42, 43, 44 |
| `partner/components/address-list-card.tsx` `changeDefault`, `removeAt`, focus after remove, no collapse state | UT-R3-03a…f: `exactlyOne` tick #2 → only #2 default; `exactlyOne` untick current default → no change; `atMostOne` tick/untick; remove default under `exactlyOne` → #1 default; remove default under `atMostOne` → none; index 0 not removable | IT-R3-03 (add two items, tick #3, remove #3, focus lands on #2 checkbox); TC-CUS-43, 44 |

### Executed

| Check | Command / method | Result |
|---|---|---|
| Typecheck | `docker compose -f docker-compose.yml -f docker-compose.dev.yml exec -T -e CI=true -e npm_config_store_dir=/root/.local/share/pnpm/store frontend pnpm run typecheck` (`pnpm --store-dir=… run` was rejected by this pnpm as an unknown option for `run`, so the store dir was passed through the environment) | exit 0 (workspace typecheck incl. frontend `tsc --noEmit` "Done") |
| Lint | same container, `pnpm run lint` | exit 0; 0 errors; the 2 existing warnings in `features/auth/login-form.tsx:46` |
| Restart + routes | `docker compose … restart frontend`, then `curl` GET `/setup/customer`, `/setup/vendor` on `http://localhost:3000` (not signed in) | 200 / 200; dev log shows both routes compiled and served 200, no compile/runtime error |
| Logic (throwaway, inside the container, `node --experimental-strip-types` on the real `partner/entity.ts`) | UT-R3-01a/b by mirroring the one-line `draftRowTitle` | "New customer" / "New vendor" — pass (not a test suite) |
| Static check | `grep` for `draft.code`, `draft.name`, `watchedCode` in `frontend/src/features` | no matches — the draft row no longer reads typed values |
| Not run | browser/visual/keyboard (no browser automation), `next build` (shared `.next` volume), UT-R3-02/03 and IT-R3-01…04 (no runner, no React test renderer), manual-tester, security reviews (parent) | — |

The default-address logic (`changeDefault`, `removeAt`) is unchanged from revision 2 except that focus after removal
now goes to the previous card's default checkbox instead of the removed accordion header button.

### Revision 3 acceptance cases (browser; all not run)

| Case ID | TODO | Starting state | User actions | Expected result | Evidence |
|---|---|---|---|---|---|
| TC-CUS-41 | FE-CUS-R3-001 | ADD, create mode, drawer open | Type a Code Name and a Name | Draft row stays "New customer" / "Not saved yet" with the Draft badge; compare rev3-01 (the bug) | not run |
| TC-CUS-42 | FE-CUS-R3-002 | Create mode | Compare Invoice and Shipping cards with rev3-02/03 | "#1" outside on the left; gray rounded card, no chevron, no Default badge; first row checkbox (left) + red trash (right); grid unchanged; dashed "+ Add another invoice address" / "+ Add another shipping address"; count badge | not run |
| TC-CUS-43 | FE-CUS-R3-003 | Create mode, 3 invoice items | Tick #3; click the ticked #3; remove #3 | Only #3 ticked; clicking it again keeps it ticked (`aria-disabled`, hint shown); removing #3 makes #1 default; new customer starts with #1 ticked in both types | not run |
| TC-CUS-44 | FE-CUS-R3-004 | Create mode / view mode | Inspect trash on #1 and #2; switch to view mode | #1 trash disabled with tooltip; #2 removable; in view mode every checkbox and trash is disabled | not run |
| TC-CUS-45 | FE-CUS-R3-002 | Empty required field in invoice #2 | Save | Focus goes to the first invalid field in visual order; the card frame is red | not run |
