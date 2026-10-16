# Frontend acceptance and verification: vendor

- UI revision: 4 ([revision 4 cases and checks](#revision-4-draft-row-and-address-card-checks-2026-10-16)); revision 3 = ADR-0021 ([revision 3 cases and checks](#revision-3-adr-0021-checks-2026-10-16)). TC-VEN-06, 07 (collapse part), 10 and the draft-row part of TC-VEN-11 are superseded by revision 4. Revision 2 = revision 1 + owner answers Q-VEN-01/02/03; cases TC-VEN-04, 11, 16 are superseded where revision 3 says so.
- Reference images: [source/](source/) S1–S4, 1920×1080 CSS (assumed DPR 2)
- TODO: [vendor.md](../../../task/todo/vendor.md); pattern cases: [customer testing](../customer/testing.md)
- Checks discovered: `pnpm --filter frontend typecheck`, `lint`, `build` (run inside `f1-system-frontend-1`; the host has no `node_modules`). No unit/E2E runner is installed; pure logic can be checked with a throwaway Node script, which is not a test suite.
- Data source: first run (FE-VEN-001…009, 012) used the vendor fixture adapter. Since the second run (FE-VEN-010/011, 2026-10-15) the page uses the gateway `vendor.*` through tRPC (SA rev 1 + ADR-0019 rev 1, approved and delivered). The running dev stack has **no partner container** and no `PARTNER_*` variables, so live `vendor.*` calls answer 503 `PARTNER_UNAVAILABLE` there (per the [backend handoff](../../../coordination/handoffs/vendor-backend.md)); live data cases are not run until the parent/owner closes that environment gap.

## Executed checks (2026-10-15, frontend, FE-VEN-001…009 and 012)

| Check | Command / method | Result |
|---|---|---|
| Baseline before edits | `pnpm --filter frontend typecheck`; `pnpm --filter frontend lint` | typecheck exit 0; lint exit 0 with 0 errors and 2 warnings (`features/auth/login-form.tsx:46`, existing) |
| Typecheck after changes | `docker exec f1-system-frontend-1 sh -c "cd /app && pnpm --filter frontend typecheck"` | exit 0 |
| Lint after changes | `docker exec f1-system-frontend-1 sh -c "cd /app && pnpm --filter frontend lint"` | exit 0; 0 errors and the same 2 existing warnings. No new warnings. |
| `next build` | not run | Not run because the parent asked not to (the `.next` volume is shared) |
| Routes respond | `curl` to `http://localhost:3000` | `/setup/vendor` 200, `/setup/customer` 200, `/modules/vendor` 200, `/setup/user-permission` 200 after `docker restart f1-system-frontend-1`. Before the restart `/setup/vendor` was 404 because the dev server had not seen the new route through the bind mount. The server HTML is the client-rendered shell, so this does not check page content. |
| Dev log | `docker logs f1-system-frontend-1` after the restart | No compile or runtime error. One `ECONNREFUSED 172.18.0.3:3101` at 02:53:58Z happened during the auth container's own restart (02:53:33Z), before the frontend restart, so it is not caused by this change. |
| Schema logic (FE-VEN-007; FE-VEN-001 customer regression) | Throwaway Node script that transpiles the real `partner/schema.ts`, `vendor/schema.ts`, `customer/schema.ts` and `lib/phone.ts` inside the container; deleted afterwards | 14/14 passed. Vendor: the draft has one unchecked invoice item and no shipping; empty submit gives exactly the Name, Currency, First name, Email, and item Name/Company Name, Address, Country, Postcode errors (no Phone, State or City error); zero or one default is valid; two defaults and 11 addresses are rejected; State/City are required once a Country is chosen; an empty phone is valid and a short phone gives "Enter a valid phone number". Customer: draft defaults unchanged; empty-submit errors unchanged (item label "Name"); zero defaults rejected; one per type valid. |
| Fixture adapter (FE-VEN-008/009) | Throwaway Node script on the real `vendor/api.ts`; deleted afterwards | 13/13 passed: 8 rows, total 8, only SAMPLE-VENDOR-E inactive; cursor paging; search by code name; no-match; detail has invoice addresses only; Duplicate drops the Code Name and address IDs; create/update/delete reject with "Saving isn't connected yet. Nothing was saved."; save and delete map that message to the banner and the dialog; a missing id maps to "This vendor no longer exists. It may have been deleted." |
| Static rules | `grep` | No customer import inside `features/partner/**`; no hex colors in `features/partner/**` or `features/vendor/**`. |

## Executed checks (2026-10-15, frontend second run, FE-VEN-010/011)

| Check | Command / method | Result |
|---|---|---|
| Typecheck against the delivered contract | `pnpm --filter frontend typecheck` in `f1-system-frontend-1` | exit 0. `contract.ts` types are inferred from `AppRouter["vendor"]`; `toVendorFields`, `toFormValues` and the update input compile against the real strict shapes. |
| Lint | `pnpm --filter frontend lint` | exit 0; 0 errors and the same 2 existing warnings |
| Fixture removed | `grep -i fixture` in `features/vendor`, `features/partner` | no matches |
| Error mappers (FE-VEN-011) | Throwaway Node script on the real `vendor/api.ts`, `partner/errors.ts`, `lib/trpc-error.ts`, with errors built by `TRPCClientError.from(...)` in the gateway envelope (`data.code`, `httpStatus`, `domainCode`, `fieldErrors`) per the handoff code table; deleted afterwards | 26/26 passed. Covered: `VENDOR_CODE_TAKEN` → Code Name field; `VENDOR_STALE` → stale banner; `VENDOR_NOT_FOUND` → deleted banner on save, gone toast on delete, load copy; `VALIDATION_ERROR` paths (`invoiceAddresses.1.postcode`, `name`, `invoiceAddresses.0.name` → "Name/Company Name is required", `phone.e164`); `unknown` currency/country → field errors + options refetch; `multiple_defaults` → banner; `(root)` / `shippingAddresses.*` → generic banner; `PERMISSION_DENIED` → copy + recheck; `PARTNER_UNAVAILABLE` → unavailable copy (edit), uncertain-create copy + list refresh (create), delete dialog copy; 401 without `domainCode` → session ended; `LICENSE_*`; unknown `NOT_FOUND` from an older partner → generic; network `TypeError` → generic; the raw `message` is never used; `toVendorFields` sends exactly the strict keys, trims, nulls and `isDefault` as ticked. |
| Routes | `curl` | `/setup/vendor` 200, `/setup/customer` 200 (no restart needed) |
| Live vendor procedures | `curl /api/trpc/vendor.options`, `vendor.list` without a session | 401 `UNAUTHORIZED` from the gateway procedure, so the procedures are routed. Note: the gateway's dev error body includes `data.stack`, which is existing gateway behavior that this work did not change. |
| `PARTNER_UNAVAILABLE` banner via a real call | needs a signed-in browser session | **not run** (no session or browser in this run) |

No browser was available in either run, so every visual, keyboard and interaction case below stays **not run**.

## Acceptance cases

| Case ID | TODO | Starting state | User actions | Expected result | Viewport / keyboard | Evidence |
|---|---|---|---|---|---|---|
| TC-VEN-01 | FE-VEN-002 | Signed in, `vendor:VIEW` | Sidebar Partner Master › Vendor; Setup tab Vendor; Home shortcut Vendor | All open `/setup/vendor`; breadcrumb `Home › Setup › Vendor`; tab active with `aria-current="page"`, placed before Customer. The Home shortcut `href` is delivered by BE-VEN-008 | 1920×1080 | not run (route, tab and sidebar links are in the code; HTTP 200) |
| TC-VEN-02 | FE-VEN-003 | No `vendor:VIEW` | Open `/setup/vendor` | Access-denied page; no `vendor.*` request | — | not run |
| TC-VEN-03 | FE-VEN-003/004 | VIEW only | Inspect toolbar, drawer, form | Print, Refresh, disabled Excel only; no draft row/Create/Save/Duplicate/Delete; read-only form | — | not run |
| TC-VEN-04 | FE-VEN-004 | Draft with ADD | Compare header with S1 | "Add Vendor", "Vendor list {n}", Print, Excel, Duplicate (disabled), Refresh, "Create Vendor" | 1920×1080 | not run |
| TC-VEN-05 | FE-VEN-005 | Draft | Compare Vendor Information with S1/S2 | Card title, Active switch on, 3-column grid capped ~1290 px, labels per Q-VEN-01, asterisks on Name, Currency, First name, Email (Phone optional, Q-VEN-02) | 1920×1080 | not run |
| TC-VEN-06 | FE-VEN-006 | Draft | Compare Invoice Address with S2 | One full-width card; one item #1 expanded, **no Default badge, box unchecked** (Q-VEN-03), no trash; **4-column grid** (Name + Tax ID quarter width each; Address full; Country/State and City/Postcode halves), same width with the drawer open and closed; no Shipping card | 1920×1080, drawer open/closed | not run |
| TC-VEN-07 | FE-VEN-006 | Draft | Add two invoice addresses; collapse #1; tick #3; tick #2; untick #2; tick #3 and remove #3 | Count 3; #2/#3 have trash; ticking moves the default and only one is ticked; unticking leaves none; removing the default leaves none (no automatic default); renumbering; add disabled at 10 | keyboard on chevron | not run |
| TC-VEN-08 | FE-VEN-007 | Empty draft | Create Vendor | Errors as S3 except Phone (optional), State/City (no error until a Country is chosen) and no default error; item frame red because of field errors; focus on Name; button enabled before | Enter submits | not run (schema errors confirmed by the Node check) |
| TC-VEN-09 | FE-VEN-007 | — | Max lengths, phone letters/short number, email format | Messages per form-guidelines.md | — | not run |
| TC-VEN-10 | FE-VEN-007 | #2 collapsed with an error | Submit | #2 expands, shows "Has errors" while collapsed, first invalid field focused | — | not run |
| TC-VEN-11 | FE-VEN-008 | Drawer open | Compare with S1 | "Vendors" + total; "Search name or code name..."; draft row with typed Name/Code Name or "New vendor" / "Not saved yet"; rows Name / Code Name; grey dot + Inactive badge for inactive | 1920×1080 | not run |
| TC-VEN-12 | FE-VEN-008 | > 50 vendors | Scroll; Load more by keyboard; search | Pages of 50, one request in flight, debounced search, no-match text | keyboard | not run (no partner in the dev stack) |
| TC-VEN-13 | FE-VEN-008 | Drawer open | Collapse and expand | Matches S1 and S2; focus stays on the toggle | — | not run |
| TC-VEN-14 | FE-VEN-009 | Saved vendor, DELETE | Delete → Keep vendor; Delete → Delete | Focus handling; `Deleting...`; toast "Vendor deleted", row gone, draft selected | keyboard | not run (no partner in the dev stack) |
| TC-VEN-15 | FE-VEN-009 | Saved vendor with edits | Row switch, Refresh, Duplicate, draft row, tab reload | Discard dialog / native prompt; nothing when clean | Esc = keep | not run |
| TC-VEN-16 | FE-VEN-009 | Saved vendor, ADD | Duplicate | New draft without Code Name or address IDs; toast; focus Name | — | not run (mapping checked by the Node script) |
| TC-VEN-17 | FE-VEN-009 | Saved vendor with edits | Print | Only the saved vendor with all invoice addresses; no shell | print preview | not run |
| TC-VEN-18 | FE-VEN-010 | Backend delivered | Create with 2 invoice addresses; reopen; edit; save in two sessions | Saved data and default (or none) round-trip; second save shows the stale banner | — | not run (no partner in the dev stack) |
| TC-VEN-19 | FE-VEN-011 | Error cases | Duplicate code (other case), partner stopped, permission removed | Mapped messages; one request, no retry | network panel | not run live (no partner in the dev stack); mapper logic passed 26/26 in the Node check |
| TC-VEN-20 | FE-VEN-001 | After extraction | Run the customer journeys (TC-CUS-05…24) | Customer unchanged in look and behavior | 1920×1080 | not run in a browser (typecheck/lint pass; customer schema behavior unchanged per the Node check) |
| TC-VEN-21 | FE-VEN-012 | — | 1280, 1024, 768, 390 px | Customer responsive rules; address grid 4 → 2 → 1 columns (card body ≥ 900 / ≥ 600 px); no horizontal page scroll | widths listed | not run |
| TC-VEN-22 | all | — | Keyboard-only create, edit, duplicate, delete | Every control reachable with visible focus; dialogs trap and return focus | keyboard | not run |

## Revision 4 (draft row and address card) checks, 2026-10-16

One run covers customer revision 3 and vendor revision 4 (shared `features/partner/**`). The target → case map, commands
and results are in [customer testing, revision 3](../customer/testing.md#revision-3-draft-row-and-address-card-checks-2026-10-16).
Vendor-specific targets: `vendor/vendor-page.tsx` (`draft={access.add}`, removed accordion ref, `focusFirstError`) and
`vendor/components/vendors-drawer.tsx` (prop type) — IT-R3-01/04; `atMostOne` default rule — UT-R3-02d, UT-R3-03c/e.

Executed: typecheck exit 0; lint exit 0 (2 existing warnings); frontend restarted; GET `/setup/vendor` 200 (not signed
in); throwaway logic check "New vendor" pass (not a suite). **Automated-testing status: not satisfied** (no runner;
FE-VEN-R4-005 blocked). Browser cases below: not run.

| Case ID | TODO | Starting state | User actions | Expected result | Evidence |
|---|---|---|---|---|---|
| TC-VEN-31 | FE-VEN-R4-001 | ADD, create mode, drawer open | Type a Code Name and a Name | Draft row stays "New vendor" / "Not saved yet" with the Draft badge | not run |
| TC-VEN-32 | FE-VEN-R4-002 | Create mode | Compare the Invoice Address card with rev4-01/02 | "#1" outside on the left; gray rounded card, no chevron, no Default badge; first row checkbox + red trash; 4-column grid (VD-03) unchanged; dashed "+ Add another invoice address" | not run |
| TC-VEN-33 | FE-VEN-R4-003 | Create mode, 3 items | Tick #2; tick #3; untick #3; tick #3 and remove #3 | Only one ticked at a time; unticking leaves none; removing the default leaves none; new vendor starts with #1 unticked | not run |
| TC-VEN-34 | FE-VEN-R4-004 | Create / view mode | Inspect trash; switch to view | #1 trash disabled; #2 removable; view mode: checkbox and trash disabled | not run |

## Revision 3 (ADR-0021) checks, 2026-10-16

One run covers customer revision 2 and vendor revision 3 (shared `features/partner/**`). The target → case map, the
commands and the full results are in [customer testing, revision 2](../customer/testing.md#revision-2-adr-0021-checks-2026-10-16).
Vendor-specific targets: `vendor/api.ts` `toVendorFields` (UT-ADR21-04b), `mapSaveError` `VENDOR_CODE_TAKEN` →
`refetchNextCode` (UT-ADR21-04d), `required` → "Code Name is required" (UT-ADR21-04f); `vendor/hooks.ts`
`useVendorNextCode` (IT-ADR21-01/02); `vendor/vendor-page.tsx` modes and prefill (TC-VEN-23…29).

Executed: typecheck exit 0; lint exit 0 (2 existing warnings); throwaway logic script 34/34 (not a suite); live tRPC
15/15 including `vendor.nextCode` 200 `V001`, create with `V001`, `nextCode` → `V002`, `v001` → 409 `VENDOR_CODE_TAKEN`,
blank → 400 `VALIDATION_ERROR code:"required"`, `list q=V001` finds it, cleanup delete 200; signed-in GET `/setup/vendor` 200.
**Automated-testing status: not satisfied** (no runner; FE-VEN-018 blocked). Browser cases below: not run.

| Case ID | TODO | Starting state | User actions | Expected result | Evidence |
|---|---|---|---|---|---|
| TC-VEN-23 | FE-VEN-014/015 | ADD+EDIT+DELETE, no selection | Open `/setup/vendor` | "Add Vendor", "Vendor List N"; Cancel/Save enabled; Create Vendor/Edit/Delete disabled; Code Name `*` prefilled `V…`; one Invoice Address card only | not run |
| TC-VEN-24 | FE-VEN-014 | Saved vendor selected | Inspect | Title = vendor name; read-only; Create Vendor/Edit/Delete enabled; Cancel/Save disabled | not run |
| TC-VEN-25 | FE-VEN-014 | View | Edit → change → Cancel | Saved values restored; view mode | not run |
| TC-VEN-26 | FE-VEN-014 | View | Edit → change → Save | "Vendor saved"; view mode | not run |
| TC-VEN-27 | FE-VEN-014 | Limited permissions | Inspect | Buttons hidden per ADD/EDIT/DELETE | not run |
| TC-VEN-28 | FE-VEN-016 | Create | Clear Code Name, blur | "Code Name is required" | not run |
| TC-VEN-29 | FE-VEN-016 | Two tabs, same suggestion | Save A then B | B shows the taken error and the next suggestion; typed values never replaced | not run |
| TC-VEN-30 | FE-VEN-017 | Drawer | Compare with rev3-02 | Bold Code Name / Name; green dot; Inactive badge | not run |

## Automated tests (Vitest), 2026-10-16

Same run, runner and owner instructions as [customer automated tests](../customer/testing.md#automated-tests-vitest-2026-10-16)
(Vitest 5.0.3, `frontend/vitest.config.mts`, node environment). Test-only change: **no file under `frontend/src/` was
edited**, no dependency added. Shared Partner Master code is tested in `frontend/test/partner/` (schema with the
`atMostOne` rule, `errors.ts` with the vendor scope, `code-suggestion.ts`, header/drawer logic incl. UT-R3-01b
"New vendor"); see the customer table for those files and IDs.

### Test ID → file (vendor-specific)

| File | Case IDs | Covers (source) |
|---|---|---|
| `frontend/test/vendor/schema.test.ts` | UT-VEN-S01…S09 | `vendor/schema.ts`: complete form; draft (one unticked invoice item, no shipping); empty-draft errors incl. Code Name, "Name/Company Name", no Phone/State/City/default error; Code Name trim/1–120; zero or one default valid, two rejected (Q-VEN-03); 1–10 items; Phone optional but checked (Q-VEN-02); `VENDOR_ADDRESS_ARRAYS` |
| `frontend/test/vendor/api.test.ts` | UT-ADR21-04b/d, UT-VEN-A01…A22, IT-VEN-C01…C03 | `vendor/api.ts`: `toFormValues` (position order, nulls, phone, no shipping), `toDuplicateValues`, `toVendorFields` (exact strict keys, trim, null, lower-case email, E.164, `isDefault` as ticked); `mapServerFieldError` (vendor scope); `mapSaveError` (`VENDOR_CODE_TAKEN` → `refetchNextCode`, `required`, item paths + `unknown`, `multiple_defaults` invoice banner, shipping/root → generic, stale, not found, permission, 401, `LICENSE_*`, unavailable vs uncertain create, older `NOT_FOUND` → generic, raw message never shown); `mapDeleteError`; `loadErrorMessage`; `isVendorNotFound`, `isPermissionDenied`, `readVendorError`. **IT-VEN-C01…C03**: form schema → mapper → the gateway's real strict `createVendorInputSchema` accepts the result and rejects a `shippingAddresses` key |

### Executed

`pnpm test` in `f1-system-frontend-1`: **195 passed, 10 files** (vendor files 36 of them; partner files 80, shared).
`pnpm typecheck` exit 0; `pnpm lint` exit 0 (2 existing warnings in `features/auth/login-form.tsx`). No test failed;
no product defect found. Mutation check not run (editing `frontend/src/` was forbidden).

### Coverage gaps

Same as [customer coverage gaps](../customer/testing.md#coverage-gaps-not-covered-by-this-suite), for the vendor
side: `address-list-card.tsx` default changes under `atMostOne` (UT-R3-03c/e), `address-item.tsx` trash/checkbox
rules (UT-R3-02a/b/d/e), `PartnerDrawer` draft row markup (IT-R3-01), `vendor-page.tsx` modes, prefill and
`focusFirstError` wiring (IT-R3-04, TC-VEN-23…34), `vendor/hooks.ts` and `partner/hooks.ts` (IT-ADR21-01/02/05).
They need a DOM test library (not installed, not approved) or extraction from `src` (forbidden in this task).
FE-VEN-018 and FE-VEN-R4-005 stay unresolved for these gaps.
