# Frontend acceptance and verification: app-navigation

- UI revision: 1 (pending-review)
- Reference images and viewport: [source/](source/) S1–S4; desktop reference 1920×1080 CSS (assumed DPR 2); S2 is a ≈0.52× canvas
- Relevant TODO / API / SA revisions: [app-navigation.md](../../../task/todo/app-navigation.md); no API/SA revision (none required)
- Checks discovered: `pnpm --filter frontend typecheck`, `pnpm --filter frontend lint`, `pnpm --filter frontend build` (previous features ran them inside `f1-system-frontend-1`). No unit/E2E runner is installed; browser checks are manual or via an available browser tool. Nothing below has been run (status: **not run**).

| Case ID | TODO / component | Starting state | User actions | Expected result | Viewport / keyboard | Evidence / result |
|---|---|---|---|---|---|---|
| TC-NAV-01 | FE-NAV-002 fidelity | Signed in, `/setup`, expanded | Compare with S3 | Sidebar 236 px incl. 1 px `#EDEDED` border, `#FCFCFC`; item order/labels/icons and group labels as the IA table; Setup active (`#F3F3F3`, semibold); items 36 px at 40 px pitch; no red dots | 1920×1080 | not run |
| TC-NAV-02 | FE-NAV-006 fidelity | `/setup` | Compare with S3 | Title "Setup" centred; 4 tiles 54 px, pitch 176, colors `#5040DB`/`#14A460`/`#006A70`/`#737780`, labels centred; breadcrumbs `Home › Setup` | 1920×1080 | not run |
| TC-NAV-03 | FE-NAV-007 fidelity | `/setup` | Click Master Code; compare with S4 | Scrim rgb(52 62 62 / 0.4); white title above a ≈662×473 card radius ≈30; 7 grey tiles in 4 columns (pitch 152×124) | 1920×1080 | not run |
| TC-NAV-04 | FE-NAV-003 fidelity | Expanded | Collapse; compare with S1 | Rail 56 px; logo mark; 11 module buttons + ⇆; 40×40 `#F7F7F7` buttons at 46 px pitch, first at 77 px | 1920×1080 | not run |
| TC-NAV-05 | FE-NAV-001/002 routes | Any page | Click every sidebar link | Each opens the route in the IA table; placeholders show the item label as title and the breadcrumb rule; Home `/`, Setup `/setup` | desktop | not run |
| TC-NAV-06 | FE-NAV-002 disclosure | `/` | Click Memo Outstanding; Enter/Space on Account Outstanding; Tab through | Chevron › ↔ ⌄; `aria-expanded` toggles; children appear/disappear and are skipped by Tab when closed | keyboard + mouse | not run |
| TC-NAV-07 | FE-NAV-002 auto-expand | Load `/modules/closing-stock-consignment` directly | — | Report section visible (scrolled into view), Closing Stock open, "Consignment Stock" active with `aria-current="page"`; other parents unchanged | desktop | not run |
| TC-NAV-08 | FE-NAV-001/008 active Setup | Visit `/setup`, `/setup/vendor`, `/setup/customer`, `/setup/user-permission`, `/modules/currency`, `/modules/notifications` | — | Setup is the active sidebar item (and active rail button when collapsed) on all of them; `/modules/dashboard` makes Dashboard active instead | desktop | not run |
| TC-NAV-09 | FE-NAV-003 toggle + focus | Expanded | Activate "Collapse sidebar" with keyboard; then "Expand sidebar" | Layout switches; focus lands on the toggle of the new layout; width animates 150 ms (none with reduced motion) | keyboard | not run |
| TC-NAV-10 | FE-NAV-003 persistence | Collapsed | Reload; open a new tab; collapse in tab A | Reload keeps the rail; new tab shows the rail; tab B follows tab A's change (storage event) | desktop | not run |
| TC-NAV-11 | FE-NAV-003 storage blocked | Private window / site data blocked | Toggle, reload | Toggle works; reload starts expanded; no console error thrown to the user | desktop | not run |
| TC-NAV-12 | FE-NAV-003 tooltip | Collapsed | Hover Home; Tab to Setup; press Escape | Black tooltip "Home" to the right after ≈150 ms; "Setup" tooltip immediately on focus; Escape hides it; screen reader announces the name once | mouse + keyboard + SR | not run |
| TC-NAV-13 | FE-NAV-003 group button | Collapsed, on `/` | Click the cart (Pre-Sale) | Sidebar expands, Pre-Sale section scrolled into view, focus on "Quotation"; preference now expanded | desktop | not run |
| TC-NAV-14 | FE-NAV-003 short viewport | Collapsed | Set height 560 px; hover the last buttons | Rail scrolls; tooltips not clipped by the rail | 1280×560 | not run |
| TC-NAV-15 | FE-NAV-004 drawer | 390×844 | Open menu; open Memo Outstanding; tab to the end; Escape | Drawer shows the expanded sidebar (no collapse toggle, no rail); disclosure works; focus trapped; Escape closes and returns focus to the menu button; activating a link closes the drawer | mobile + keyboard | not run |
| TC-NAV-16 | FE-NAV-006 tiles | `/setup` | Activate each tile with Enter | Company Profile → `/modules/company-profile`; User and Permission → `/setup/user-permission`; Notifications → `/modules/notifications`; Master Code opens the modal | keyboard | not run |
| TC-NAV-17 | FE-NAV-007 modal keyboard | `/setup` | Open Master Code with Enter; Tab around; Escape | Focus starts on Partner Master; Tab cycles inside (incl. the focus-visible Close button); page inert; Escape closes; focus back on the Master Code tile | keyboard + SR | not run |
| TC-NAV-18 | FE-NAV-007 modal pointer | Modal open | Click the scrim; reopen; click a tile | Scrim click closes; tile click navigates (Partner Master → `/setup/vendor`, Currency → `/modules/currency`, …) and the modal is gone | mouse/touch | not run |
| TC-NAV-19 | FE-NAV-008 breadcrumbs | Visit `/setup/vendor`, `/modules/labor-name`, `/modules/os-payable` | Click "Setup" crumb on the first | `Home › Setup › Vendor` with Setup linking to `/setup`; `Home › Setup › Master Code › Labor Name`; `Home › Account › Account Outstanding › O/S Payable` | desktop | not run |
| TC-NAV-20 | FE-NAV-008/014 regression (rev 2) | `/setup/user-permission`, `/setup/vendor`, `/setup/customer` | Open each page | No Setup tab bar; pages otherwise unchanged apart from the Setup crumb link | desktop | not run |
| TC-NAV-25 | FE-NAV-013 (rev 2) | `/setup/vendor`, `/setup/customer` at ≥ md | Open the page; click Customer/Vendor in the panel; ⇆ expand, then Collapse sidebar | Rail + "Setup" panel (image 6); active child highlighted; expand shows the full sidebar, collapse returns to rail + panel; stored preference unchanged | desktop | not run |
| TC-NAV-27 | FE-NAV-016 (rev 3) | rail (collapsed, or a Partner master page) | Hover Memo, move into the menu, click From Vendor; Tab from a section button into its links; Escape | Menu lists the section's pages (disclosure children indented); stays open while moving into it; link navigates and closes it; Escape closes and returns focus to the button | desktop | not run |
| TC-NAV-26 | FE-NAV-015 (rev 2) | `/setup/vendor` | Click "Partner master"; close with Escape; reload | `/setup` with Master Code open; focus returns to the Master Code tile; URL is `/setup`; reload does not reopen | desktop | not run |
| TC-NAV-21 | FE-NAV-010 responsive | `/setup`, sidebar expanded and collapsed | Resize 1920/1280/1024/768/390 | No horizontal page scroll; tiles 4 → 2 columns as specified; modal 4 → 3 → 2 columns, fits within 16 px gutters, scrolls inside if needed | listed widths | not run |
| TC-NAV-22 | FE-NAV-001 unknown slug | `/modules/does-not-exist` | — | Existing "ไม่พบเมนู" page, no crash; no sidebar item active | desktop | not run |
| TC-NAV-23 | FE-NAV-009 tokens | Code review | grep new components for `#` hex and arbitrary colors | Only `gms-*` tokens; new tokens present in `globals.css` and match design-system.md | — | not run |
| TC-NAV-24 | FE-NAV-011 checks + manual test | All implemented | typecheck, lint, build (if the parent allows), browser walkthrough, manual-tester journey "find a menu, open Setup, open Master Code, go to Vendor" | Commands exit 0 (existing warnings only); report saved under `document/testing/user-check/` | — | not run |

Design fidelity tolerance: positions/sizes within ±2 CSS px of the measured values; estimated values (fonts,
radii, shadows) are reviewed visually against the source, not pixel-asserted. Record actual commands and results
here when run; mark anything not executed as not run.

## Results (2026-10-15, parent, after revision 2)

| Check | Command | Result |
|---|---|---|
| Typecheck | `pnpm --filter frontend typecheck` (run in `frontend/`) | pass (exit 0) |
| Lint | `pnpm --filter frontend lint` | pass: 0 errors; 2 existing warnings in `features/auth/login-form.tsx` (not touched) |
| Build | not run | skipped: would write `.next` on the host beside the running dev container |
| Browser / manual-tester | not run | the app is reachable at localhost:3000, but every page needs a signed-in session and no dev test credentials are documented; all TC-NAV cases remain "not run" |
