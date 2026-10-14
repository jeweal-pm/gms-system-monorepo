# Frontend acceptance and verification: customer

- UI revision: 1
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
