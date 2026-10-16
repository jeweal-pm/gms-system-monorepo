# Frontend acceptance and verification: company-profile

- UI revision: 1 (pending-review)
- Reference images: [source/](source/) S1–S6, 1920×1080 CSS assumed
- Relevant TODO / SA: [company-profile TODO](../../../task/todo/company-profile.md); SA bundle pending ([handoff](../../../coordination/handoffs/company-profile-sa.md))

## Automated coverage

No frontend test runner is configured yet ([architecture](../architecture.md)). Until one exists, the checks are `pnpm --filter frontend typecheck`, `pnpm --filter frontend lint` and `pnpm --filter frontend build`, plus the browser cases below. When a runner is added, the first targets are `schema.ts` (validation and mapping) and the logo state reducer.

| Target / behavior | Unit case | Integration case | Boundary / fixture | Command and result |
|---|---|---|---|---|
| Form schema and mapping | UT-CP-01 (when a runner exists) | — | required, email, URL, country/state reset | not run |
| Logo state (unchanged/new/removed) | UT-CP-02 | — | wrong type, oversize | not run |

## Security review before handoff

| Reviewer | Source revision / changed scope | Status | Evidence / ticket IDs |
|---|---|---|---|
| `sec-auditor` | after implementation (file upload + rich text) | not run | — |
| `security-auditor` | same | not run | — |

## UI acceptance

| Case ID | TODO / component | Starting state | User actions | Expected result | Viewport / keyboard | Result |
|---|---|---|---|---|---|---|
| TC-CP-01 | FE-CP-001/002 | signed in, VIEW + EDIT | Open Setup → Company Profile | `/setup/company-profile`, crumbs Home › Setup › Company Profile, Setup active in the sidebar | 1920 | not run |
| TC-CP-02 | FE-CP-003 | no profile saved | Open the page | Setup mode: fields empty and editable, Save/Cancel enabled, Edit disabled (S1) | 1920 | not run |
| TC-CP-03 | FE-CP-003 | profile saved | Open the page | View mode: read-only, Edit enabled, Save/Cancel disabled | 1920 | not run |
| TC-CP-04 | FE-CP-002 | any | Compare with S1/S2 | Section order, label column, 2-column fields, dividers match within ±4 px of the estimates | 1920 | not run |
| TC-CP-05 | FE-CP-004 | Setup | Leave the required fields empty, Save | Errors under each required field; focus on Name/Company Name | keyboard | not run |
| TC-CP-06 | FE-CP-004 | Setup | Type an invalid email, Tab | Error after blur only; it clears as soon as it is corrected | keyboard | not run |
| TC-CP-07 | FE-CP-005 | Setup | Look at State/City; choose a Country; clear the Country | Disabled "Choose a country first" → enabled → cleared and disabled again | — | not run |
| TC-CP-08 | FE-CP-005 | Setup | Open the Currency select | Currency list; label "Currency" (DV-01) | — | not run |
| TC-CP-09 | FE-CP-006 | Setup, no logo | Click the tile, pick a PNG | Preview on a white tile with the trash button (S5) | mouse + Enter/Space | not run |
| TC-CP-10 | FE-CP-006 | Setup | Pick a .gif or a 5 MB file | Inline error; previous state kept | — | not run |
| TC-CP-11 | FE-CP-006 | logo set, View | Look at the tile | Grey read-only look (S4), no trash (Q-CP-03 default) | — | not run |
| TC-CP-12 | FE-CP-006 | Edit, logo set | Trash, then Save | Logo removed after save; Cancel instead restores it | — | not run |
| TC-CP-13 | FE-CP-007 | Setup | Type text, press Bold, select text and press Ctrl+B | Toolbar Bold shows pressed (S3); bold text | keyboard | not run |
| TC-CP-14 | FE-CP-007 | Setup | Add a link with `javascript:` and with `https://` | `javascript:` refused; https link created | — | not run |
| TC-CP-15 | FE-CP-007 | View | Look at the editors | Formatted text; toolbar disabled (Q-CP-06) | — | not run |
| TC-CP-16 | FE-CP-008 | Edit with changes | Cancel; Refresh; reload | Discard dialog; discard dialog; browser prompt (sidebar links are not intercepted, as on the partner pages) | keyboard | not run |
| TC-CP-17 | FE-CP-009 | Setup, valid | Save | Toast "Company profile saved", View mode, reload shows the saved values | — | not run (needs backend) |
| TC-CP-18 | FE-CP-009 | two tabs in Edit | Save in tab A, then in tab B | Tab B shows the conflict dialog | — | not run (needs backend) |
| TC-CP-19 | FE-CP-010 | VIEW only | Open the page | View mode, Edit disabled with reason; no save possible | — | not run (needs backend) |
| TC-CP-20 | FE-CP-011 | any | Resize 1920/1280/1024/768/390 | Layout per the responsive table; no horizontal scroll | listed widths | not run |

## Results (2026-10-16, parent, after FE-CP-001…008/011 and partial 010)

| Check | Command | Result |
|---|---|---|
| Typecheck | `pnpm --filter frontend typecheck` | pass (exit 0) |
| Lint | `pnpm --filter frontend lint` | pass: 0 errors; 2 existing warnings in `features/auth/login-form.tsx` (not touched) |
| Build | `pnpm --filter frontend build` | **not completed**: Turbopack could not start its PostCSS child process in the agent's Windows environment (`0xc0000142`, at `globals.css`, unchanged by this work), twice. Needs a run on the developer machine |
| Browser / manual-tester | not run | No test session credentials; the dev container also needs `pnpm docker:dev:install` for the new packages |

## Unit tests (Vitest 5.0.3, folder `test/`) — 2026-10-16

Owner request: "frontend backend ทำ unit test case ส่วนของ company-profile ให้ฉันด้วย" + choice "โค้ด test ในโฟลเดอร์ test/" (2026-10-16). Config `frontend/vitest.config.mts` (node environment, `@/` → `src/`, 2 fork workers); script `pnpm --filter frontend test`.

| File | Cases | Covers |
|---|---|---|
| `test/company-profile/schema.test.ts` | UT-CP-F01…F14 | required fields, blank text, phone per country (libphonenumber-js), email, website, rich-text limits, text limits, `richTextLength`, `normalizeWebsite`, `logoFileError` |
| `test/company-profile/api.test.ts` | UT-CP-F20…F31 | profile ↔ form mapping (national phone ↔ E.164), round trip, server field paths and messages, `logoUrl`, `uploadLogo` (raw PUT, error code, non-JSON error, network), logo error messages |

| Command | Result |
|---|---|
| `pnpm --filter frontend test` | **40 passed** (2 files) |
| typecheck / lint | pass / pass (2 existing warnings in `login-form.tsx`) |
| Mutation check | logo size limit doubled → UT-CP-F14 failed as intended; source restored |

Not covered: component tests of the page, logo tile and editor (need a DOM test library such as Testing Library + jsdom, not installed: not requested), browser checks TC-CP-01…20.
