# Frontend acceptance and verification: user-permission

- UI revision: 1 and 2 (revision 2 cases in the last section)
- Reference image and viewport: [source/](source/) screenshots, 1920×1080 CSS (assumed DPR 2)
- Relevant TODO / API / SA revisions: [central TODO](../../../task/todo/user-permission.md); SA contract pending

All cases are **not run** (no implementation exists).

| Case ID | TODO / component | Starting state | User actions | Expected result | Viewport / keyboard | Evidence / result |
|---|---|---|---|---|---|---|
| TC-UP-01 | FE-UP-001/002 | Signed in, licensed | Open Setup › User and permission | Breadcrumb `Home › Setup › User and permission`, the tab is active with an underline, title "Add User and Permission" | 1920×1080 | not run |
| TC-UP-02 | FE-UP-003 | Create mode | Inspect toolbar | Print, Excel, Duplicate (disabled with no saved user selected), Refresh, Create User; every icon button has an accessible name and tooltip | keyboard Tab order left→right | not run |
| TC-UP-03 | FE-UP-004 | Create mode | Inspect form | Matches S1: photo tile, Active on, fields in a 3-column layout, outlined notched labels, required asterisks per the Q-UP-01 answer | 1920×1080; compare with S1 | not run |
| TC-UP-04 | FE-UP-005 | Empty form | Click Create User | Errors as in S2 for the required fields; focus on Username; button not disabled beforehand | keyboard Enter submits | not run |
| TC-UP-05 | FE-UP-005 | Error shown on Username | Type a valid value | Error clears on change | — | not run |
| TC-UP-06 | FE-UP-005 | Password field | Enter 3 characters, then 65 characters, blur | Policy min/max messages; value not trimmed | — | not run |
| TC-UP-07 | FE-UP-004 | Phone field | Type letters | Non-digits are blocked; the country selector changes the dial code | mobile numeric keyboard (`inputMode`) | not run |
| TC-UP-08 | FE-UP-004 | Location | Open the list, select and remove chips with the keyboard | Combobox works with Arrow keys/Enter/Escape/Backspace; required error when empty | keyboard only | not run |
| TC-UP-09 | FE-UP-006 | Matrix all unchecked | Check Vendor VIEW | The Partner Master VIEW checkbox becomes indeterminate, Select All VIEW indeterminate, badge 1 of N (if Q-UP-02 confirms live) | Space toggles | not run |
| TC-UP-10 | FE-UP-006 | — | Click Partner Master VIEW | Vendor and Customer VIEW checked; group checked | — | not run |
| TC-UP-11 | FE-UP-006 | — | Click Select All EDIT twice | All applicable EDIT cells checked, then all unchecked; non-applicable cells are untouched | — | not run |
| TC-UP-12 | FE-UP-006 | — | Collapse/expand Stone Master | Sub-rows hidden/shown; `aria-expanded` updates; checkbox values are kept | Enter/Space on the chevron | not run |
| TC-UP-13 | FE-UP-007 | Drawer open | Click collapse tab, then expand | Content widens (S2) and narrows (S1); focus stays on the toggle | — | not run |
| TC-UP-14 | FE-UP-007 | Drawer with users | Type in search | List filters by name/username; empty-result message | — | not run |
| TC-UP-15 | FE-UP-008 | Saved user selected | Click Duplicate | New draft; personal fields cleared; permissions copied; toast as in S5 (copy per Q-UP-03); drawer draft "Not saved yet" | toast does not steal focus | not run |
| TC-UP-16 | FE-UP-009 | Delete trigger (Q-UP-15) | Open dialog; press Esc | Dialog closes, focus returns to the trigger | focus starts on "Keep user" | not run |
| TC-UP-17 | FE-UP-009 | Dialog open | Click Delete | Button shows a spinner and "Deleting...", both buttons disabled, Esc ignored (S4); success closes the dialog | — | not run |
| TC-UP-18 | FE-UP-010 | Toast visible | Wait / click X | Dismisses after 5 s (if confirmed) or when closed | close reachable via Tab | not run |
| TC-UP-19 | FE-UP-012 | SA contract implemented | Create a user with valid data | Server persists; list updates; password not visible in network response or cache | — | not run (requires-sa) |
| TC-UP-20 | FE-UP-012 | At limit | Create | Limit message per Q-UP-05 | — | not run (requires-sa) |
| TC-UP-21 | FE-UP-014 | User without access | Open route | Access-denied state | — | not run (requires-sa) |
| TC-UP-22 | FE-UP-016 | — | Resize to 1280, 1024, 768, 390 | Proposed responsive behavior (if approved); no horizontal page scroll except the matrix's own scroller | widths listed | not run |
| TC-UP-23 | FE-UP-011 | — | Compare colors with S1–S5 | Tokens match the sampled values within anti-aliasing tolerance | 1920×1080 | not run |
| TC-UP-24 | all | — | Keyboard-only walkthrough of create + duplicate + delete | Every control reachable with visible focus; the dialog traps focus | keyboard | not run |

## Checks discovered

`pnpm --filter frontend typecheck`, `pnpm --filter frontend lint`, `pnpm --filter frontend build`
exist. No unit or E2E runner is installed (tech-stack.md). Use browser observation at the listed
viewports, then run manual-tester for the changed journey. Customer reports go in
`document/testing/user-check/`.

## Revision 2 (ADR-0020) cases

No browser automation is installed, so every visual/browser case is **not run** unless stated.
Results below are filled from real commands only.

| Case ID | TODO | Starting state | User actions | Expected result | Evidence / result |
|---|---|---|---|---|---|
| TC-UP2-01 | FE-UP2-001 | Create mode | Inspect header | "Add User and Permission", "User List N"; Create User / Edit / Delete faded, Cancel / Save enabled (rev2-02) | not run (browser) |
| TC-UP2-02 | FE-UP2-001 | Saved regular user selected | Inspect header; hover Excel | Create User / Edit / Delete enabled, Cancel / Save faded; Excel tooltip "Excel export isn't available yet" | not run (browser) |
| TC-UP2-03 | FE-UP2-002 | View mode | Edit, change Name, Cancel | Saved name restored, view mode | not run (browser) |
| TC-UP2-04 | FE-UP2-002 | Edit mode | Change Name/permissions, Save | `userAdmin.update` succeeds, "Changes saved", view shows new values | API pass 2026-10-15 (curl via proxy: update 200, `get` shows new values; stale token 409 `USER_CHANGED`); browser not run |
| TC-UP2-05 | FE-UP2-002 | Edit mode, password blank | Save | Password not sent (unchanged) | code review: `toUpdateUserInput` omits empty password |
| TC-UP2-06 | FE-UP2-002 | Saved user | Duplicate | New draft with details + permissions, Username/Password empty | not run (browser) |
| TC-UP2-07 | FE-UP2-003 | Catalog v2 loaded | Inspect matrix | 9 columns, Select All, Dashboard "—" in ADD/EDIT/DELETE/CANCEL, sections, groups "N sub-menus" (rev2-01) | data pass 2026-10-15 (version 2, 39 leaves, 347 cells, groups 7/2/2/2/2/3, Dashboard 5 actions); render not run |
| TC-UP2-08 | FE-UP2-003 | — | Click Master Code VIEW, then Select All EDIT | 7 sub-menu VIEW cells on; all EDIT cells on; counter updates; aggregates not in the saved grants | not run (browser) |
| TC-UP2-09 | FE-UP2-003 | — | Search "stock"; filter Turned on | Matching menus with ancestors; groups expanded; empty message when nothing matches | not run (browser) |
| TC-UP2-10 | FE-UP2-003 | — | Collapse All / Expand All | All groups collapse / expand; chevrons rotate; `aria-expanded` updates | not run (browser) |
| TC-UP2-11 | FE-UP2-004 | Create mode | Username "ab", "user one", "User1" | Errors for the first two; "User1" accepted and sent as `user1` | server rule pass ("user one" 400 path `username`); client form not run |
| TC-UP2-12 | FE-UP2-004 | View/edit of saved user | Inspect Username | Read-only, not sent on update | code review |
| TC-UP2-13 | FE-UP2-005 | Super Admin selected | Inspect, Edit, change Phone, Save | Lock banner, 347 of 347, all cells locked; only Name/Phone/Location editable; Delete disabled | API pass (personal-only update 200; permissions/active:false/delete 403 `SUPER_ADMIN_LOCKED`); UI not run. Seeded Super Admin has no location, so Edit requires choosing one |
| TC-UP2-14 | FE-UP2-006 | Drawer | Search by username | Rows show name + username; badge = seat limit | not run (browser) |
| TC-UP2-15 | FE-UP2-007 | Regular user selected | Delete | Dialog "Delete {username}?", Keep user / Delete | not run (browser) |
| TC-UP2-16 | FE-UP2-008 | Login page | Sign in `superadmin@demo.com` / `password123` via username | Session created | API pass (200 via proxy; `/sign-in/email` 404; wrong password 401 + attemptsRemaining); SSR shows "Username" label; form submit in browser not run |
| TC-UP2-17 | FE-UP2-008 | Login page | Sign in with `User1` (created as `user1`) | Session created (lowercased by server) | API pass (`FE-UP2-Test` → 200) |
| TC-UP2-18 | FE-UP2-009 | Running stack | curl create/update/delete `fe-up2-test` | Responses match the view models | pass 2026-10-15 (create 200, dup 409 `USERNAME_TAKEN`, delete 200, repeat 404); test user deleted |

Revision 2 static checks (2026-10-15, inside `f1-system-frontend-1`): `npx tsc --noEmit` exit 0 against the
current `AppRouter`; `npx eslint src` 0 errors, 2 pre-existing warnings (`login-form.tsx:46`).
