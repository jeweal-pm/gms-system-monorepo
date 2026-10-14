# UI specification: user-permission

- Feature ID / revision: `user-permission` / 1
- Status: pending-review
- Source: five owner-supplied screenshots (not Figma), copied to [source/](source/)
- Viewport / source dimensions: screenshots 1–3 and 5 are 3840×2160 device px. Screenshot 4 is a 1368×436 crop of the dialog. **Assumption:** device-pixel ratio 2, so the viewport is 1920×1080 CSS px. All CSS values below are device px ÷ 2 and are estimates.
- Inspection evidence: each image viewed with the image reader and pixel colors and edges sampled on the originals with System.Drawing (2026-10-12). No Figma file or design tokens were supplied.
- Requirements / main flow: [user-permission-flow.md](../../../diagram/user-permission-flow.md); [open questions and conflicts](open-questions.md)
- Review bundle: this file, [design-system.md](design-system.md), [conventions.md](conventions.md), [form-guidelines.md](form-guidelines.md), [data-fetching.md](data-fetching.md), [error-handling.md](error-handling.md), [dependencies.md](dependencies.md), [testing.md](testing.md), [open-questions.md](open-questions.md); central TODO: [`document/task/todo/user-permission.md`](../../../task/todo/user-permission.md); SA handoff: [user-permission-sa.md](../../../coordination/handoffs/user-permission-sa.md)

## Source and evidence

| # | File | SHA-256 (prefix) | State shown |
|---|---|---|---|
| 1 | [01-create-empty-drawer-open.png](source/01-create-empty-drawer-open.png) | `a1b75212edeb909b` | Setup › User and permission tab, "Add User and Permission", empty create form, Users drawer open, matrix all unchecked |
| 2 | [02-validation-errors-drawer-collapsed.png](source/02-validation-errors-drawer-collapsed.png) | `6035c2f99ea3246f` | Drawer collapsed, form widened; required errors on Username, Password, Name, Phone No. |
| 3 | [03-filled-form-partial-permissions.png](source/03-filled-form-partial-permissions.png) | `a6cfc8cf3618895a` | Filled form; VIEW/ADD/EDIT Select All indeterminate; badge still "0 of 53 on" |
| 4 | [04-delete-confirm-deleting.png](source/04-delete-confirm-deleting.png) | `f699bada24642641` | Delete confirmation dialog in its "Deleting..." loading state |
| 5 | [05-duplicated-from-super-admin.png](source/05-duplicated-from-super-admin.png) | `9cc9021c6ff8c68f` | Success toast after Duplicate; matrix shows grey checks everywhere; drawer "0 / 3", "Not saved yet" |

Original temporary path: `C:\Temp\claude\…\images\1.png`–`5.png`. The copies above are byte-identical (same hashes).

## Source quality and open decisions

| Kind | What it covers |
|---|---|
| **Measured from pixels** (exact in the PNG, still an estimate for CSS) | Colors listed in [design-system.md](design-system.md); 1 CSS px borders (2 device px); drawer width ~319 CSS px; top header height ~47 CSS px; checkbox interior 20 CSS px; table header row ~38 CSS px; Select All row ~39 CSS px |
| **Estimated from the image** | Font family (looks like IBM Plex Sans), font sizes/weights, radii, shadows, spacing, field heights, column widths |
| **Existing code facts** | `AppShell` (187 px sidebar, 46 px header), `navigation.ts`, `globals.css` tokens, installed packages, Prisma `User` model, gateway tRPC router, password policy 4–64 |
| **Assumptions** (need confirmation) | DPR 2; the Permissions card scrolls internally; the drawer pushes content instead of covering it; Duplicate copies from the user selected in the drawer |
| **Not in source** | Edit mode for an existing user, delete trigger, success after create, server errors, user limit reached, loading/empty states, mobile/tablet layout, location options list, photo preview, country list, print/Excel output |

The screenshots cannot establish exact fonts, hidden interactions, permissions, API rules or mobile behavior.
There are 9 conflicts and 28 questions in [open-questions.md](open-questions.md). Key blocking ones:
in-app creation versus CRM-only creation and licensing (C-01–C-03, Q-UP-05/06), admin-set
passwords (C-04, Q-UP-07), username versus immutable email (C-05, Q-UP-08), required fields
(Q-UP-01), what the permission count means and the full permission catalog (Q-UP-02, Q-UP-13),
the "department" wording (Q-UP-03), and edit/delete triggers (Q-UP-14/15).

## Page structure and layout

All positions are CSS px estimates at a 1920×1080 viewport.

| Region | Observed layout | Evidence |
|---|---|---|
| Sidebar | Left, ~235 px wide, white, 1 px right border `#EDEDED`. GMS logo, then Home, Setup (active: `#F3F3F3` background, bold), Dashboard. Groups: Sales Process (Quotation, Reserve, Sale), Partner Master (Vendor, Customer), Stone Master (Stone Group, Stone, Shape, Size, Color, Cutting, Quality, Clarity, Stone Code), Purchase Order (Purchase Order, Purchase (PU)), Memo (Memo In, Memo Return, …), scrollable. Group labels are small grey text. Icon is 16–18 px with a 14–15 px label. | S1 |
| Top header | ~47 px tall, white, bottom border. Left: breadcrumb `Home › Setup › User and permission` (secondary text, last item darker). Right: green dot `#22C55E` + "Thu 1 Oct 2026, 09:30 AM", fullscreen icon, bell with a blue dot `#3385F0`, dark 32 px avatar "SA". | S1 |
| Setup tab bar | ~36 px tall under the header, spans the content and drawer width. Tabs: General, **User and permission** (active, 1 px dark underline `#1C252E` over a 1 px `#E3E7EC` bar), Notifications, Main Location, Sub Location, Currency, Certificate Type, Labour Type. Each tab has a small colored square icon. | S1 |
| Content area | Background `#F9F9F9`. Horizontal padding ~24 px. Page header row with title "Add User and Permission" (~24 px, dark) + secondary "User list 1" (Q-UP-18). Right toolbar: Print, Excel (green icon `#187949`), Duplicate (disabled appearance), Refresh, then **Create User** primary button (~152×36, `#006A70`, plus icon). | S1–S3 |
| Personal Information card | White, 1 px `#EDEDED` border, ~12 px radius (estimate). Header row ~58 px: "Personal Information" (semibold ~16 px) and, on the right, an Active switch (teal track) + "Active" label. 1 px divider. Body: 120×120 photo tile on the left, then a 3-column fluid grid of outlined fields. Row 1: Username\*, Password, (empty). Row 2: Name\*, Phone No., Location\*. | S1 |
| Gap | ~16 px between cards (measured ~13–18 px) | S1 |
| Permissions card | Same card style. Header: "Permissions" + count badge "0 of 53 on" (`#F9F9F9` background, small radius, ~12 px text). Body: the permission matrix. The card appears to fill the remaining viewport height and scroll internally, because rows are clipped at the card's bottom edge (**assumption**). | S1, S3 |
| Users drawer (open) | Right side under the tab bar, ~320 px wide, full height, white, 1 px left border `#E8E8E8`. **Pushes** content: when collapsed, the cards widen (S2) instead of being covered. A collapse tab (~24×40, teal `#0E6064`, white chevron) sits on its outer left edge. | S1, S2 |
| Users drawer (collapsed) | Only the teal tab remains at the far right edge, chevron pointing left. | S2, S3 |
| Toast | Top-center over the page-header row, ~615 px wide, white, rounded ~8, shadow. Green check `#22C55E`, two-line text, close X. | S5 |
| Delete dialog | Centered modal, ~640 px wide (if DPR 2), radius ~16, large soft shadow. Title "Delete User 001?" (bold ~20 px), 1 px divider `#DEE3E3`, body text, divider, right-aligned footer: secondary "Keep user", danger "Deleting..." with a spinner. | S4 |

### Scrolling and sticky behavior (proposal; not provable from stills)

- Sidebar, header, tab bar and drawer stay fixed. The content area scrolls.
- In the matrix, the column header row stays visible (sticky) while rows scroll.
- The drawer list scrolls on its own if it overflows (at most limit + 1 users).

### Responsive behavior (proposal, not in source)

Requires owner confirmation (Q-UP-23).

| Width | Behavior |
|---|---|
| ≥1280 px | As in the source. The drawer pushes content. |
| 1024–1279 px | The drawer opens as an overlay over the content (still non-modal, dismissible) so the form stays readable. The field grid stays at 3 columns or drops to 2. |
| 768–1023 px | Sidebar follows the existing `AppShell` (hidden below `md`). Fields use 2 columns. The matrix scrolls horizontally with the MENU column sticky on the left. |
| <768 px | Fields use 1 column, and the photo tile sits above the fields. Toolbar icons collapse into a "More" menu with Create User kept visible. The drawer becomes a full-width sheet. The matrix scrolls horizontally, and the MENU column stays sticky at least 160 px wide. |

## Component inventory

| ID | Region / component | Existing implementation | Props / states | Source evidence |
|---|---|---|---|---|
| C-01 | AppShell (sidebar + header) | `frontend/src/features/home/app-shell.tsx` (differs from source; see Q-UP-21) | session loading, active item | S1 |
| C-02 | SetupTabs | none | items, active, link targets; keyboard-focusable links with `aria-current="page"` | S1 |
| C-03 | PageHeader + Toolbar | none | title, subtitle, IconButton×4 (`aria-label` + tooltip), Button primary with icon; Duplicate disabled/enabled | S1–S3, S5 |
| C-04 | IconButton | none (`lucide-react` icons installed: `Printer`, `Sheet`/`FileSpreadsheet`, `CopyPlus`, `RotateCw`, `X`, `ChevronRight/Left/Down`, `Search`, `ImagePlus`, `ShieldCheck`, `Check`, `Minus`, `Plus`, `Loader2`) | default, hover, focus-visible, disabled (~40% opacity) | S1 |
| C-05 | Button | none shared (login-form has inline styles) | variants `primary` (teal), `secondary` (white + border), `danger` (red); `loading` (spinner + label, fixed width, disabled) | S1, S4 |
| C-06 | Card | none | header (title, optional badge, trailing slot), divider, body | S1 |
| C-07 | Switch ("Active") | none | on/off, focus, disabled; `role="switch"` + `aria-checked`, visible label "Active" | S1 |
| C-08 | PhotoUpload tile | none | empty (icon, "Upload photo", "JPEG or PNG only"), preview, uploading, error, remove (behavior Q-UP-11) | S1 |
| C-09 | OutlinedTextField | none (login uses a different style) | label sits on the top border (notched), required `*` in red `#DF1016`, placeholder `#ADB1B4`, error: fill `#FAE6E4`, border `#DF1016`, red label, italic red message below | S1–S3 |
| C-10 | PasswordField | `password-change-form.tsx` (pattern only) | OutlinedTextField + `autocomplete="new-password"`; show/hide toggle pending Q-UP-07 | S1 |
| C-11 | PhoneField | none | country selector (flag + dial code + up/down chevrons) + number input in one outlined box; error state | S1–S3 |
| C-12 | MultiSelect (Location) | none | chips with remove X (`#F3F3F3` chip), dropdown chevron, open listbox, required, error (not shown), keyboard per WAI-ARIA combobox pattern | S1 |
| C-13 | PermissionMatrix | none | see [matrix specification](#permission-matrix) | S1, S3, S5 |
| C-14 | Checkbox (tri-state) | none | unchecked (1 px `#EDEDED` border, white, ~22 px overall, radius ~4); checked (teal fill, white check); indeterminate (teal fill `#006A70`, white bar); read-only/inherited (grey check, no box; Q-UP-04); focus-visible ring | S1, S3, S5 |
| C-15 | Badge / Chip | none | count badge (`#F9F9F9`), sub-menu count chip, Draft badge (`#FFE7B8` / amber text, contrast Q-UP-28) | S1 |
| C-16 | UsersDrawer | none | open/collapsed, header (title + count badge + close), SearchField, helper text "N of L users added. Super Admin is not counted.", UserListItem list | S1, S5 |
| C-17 | UserListItem | none | `draft` (plus icon, "New user", subtitle "Not saved yet", Draft badge, selected teal 1 px border + `#FAFCFC` background); `saved` (status dot, name, email); `super-admin` (shield icon); selected/hover/focus | S1, S5 |
| C-18 | Toast | none | `success` (shown), `error`, `info`; close button; `aria-live` region; top-center | S5 |
| C-19 | ConfirmDialog | none | title, body, cancel ("Keep user"), destructive confirm ("Delete" → "Deleting..." loading); modal focus trap | S4 |
| C-20 | FormError (form-level) | none | server error banner above the form (not in source; required for server failures) | Template; not in source |

### Permission matrix

Columns, all centered except MENU:

| Column | Header text | Cell | Notes |
|---|---|---|---|
| MENU | `MENU` | row label | Top-level rows are bold and dark. Group rows have a chevron (expanded = down) + bold label + a "N sub-menus" chip. Sub-rows are indented ~48 px, regular weight, secondary color `#656B71`. |
| VIEW | `VIEW` | tri-state checkbox | |
| ADD | `ADD` | tri-state checkbox | |
| EDIT | `EDIT` | tri-state checkbox | |
| DELETE | `DELETE` | tri-state checkbox | |
| CANCEL | `CANCEL` | tri-state checkbox | Meaning: Q-UP-13 |
| Price | `Price` (sic, mixed case; Q-UP-26) | tri-state checkbox | Meaning: Q-UP-13 |

Rows in source order (partial; the full catalog is Q-UP-13): **Select All** (on a `#FCFCFC` background,
controls each column), Quotation, Reserve, Partner Master ▾ (2 sub-menus: Vendor, Customer), Stone Master ▾
(8 sub-menus: Stone Group, Stone, Shape, Size, Color, …). Row heights: header ~38, Select All ~39,
top-level/group rows ~48, sub-rows ~40 (estimates). Dividers are 1 px light grey.

Behavior (derived from the standard tri-state pattern; any rule that is not obvious is listed as a question):

1. A cell checkbox toggles one menu × action permission.
2. A group row's checkbox in a column reflects its sub-rows (all = checked, some = indeterminate, none = unchecked). Clicking it sets every applicable sub-row in that column.
3. A Select All checkbox in a column reflects every applicable row in that column (S3 shows the indeterminate state) and sets all of them when clicked.
4. A cell that does not apply to a menu is not rendered as a checkbox and is not counted. This is assumed from "53" not being a multiple of 6 (Q-UP-02/13).
5. The count badge shows `enabledCount of applicableCount on`. **Proposal:** it updates live (Q-UP-02).
6. Group expand/collapse is a button (`aria-expanded`) and is local UI state. All groups start expanded, as in the source.
7. No implied dependencies (for example "ADD turns on VIEW") are applied until Q-UP-13 is answered.
8. Accessibility: render as a `<table>` with column and row headers. Each checkbox's accessible name is "{Menu} {Action}" (for example "Vendor EDIT"). Group/Select All checkboxes expose `aria-checked="mixed"` through the native `indeterminate` property. Tab moves through the checkboxes and Space toggles. Arrow-key grid navigation is optional and not required.

## Interaction and data

| Interaction | Trigger | Result | Status |
|---|---|---|---|
| Open page | Sidebar Setup → tab "User and permission" | Shows create mode for a new draft, with the drawer open (S1). Route proposal: `/setup/user-permission` (see [conventions](conventions.md)). | Route path needs owner OK |
| Toggle drawer | Teal edge tab or X | Collapses or expands. Content reflows. Focus moves to the toggle. The open/closed state may be remembered per viewer in `localStorage` (convenience only). | Shown S1/S2 |
| Search users | Drawer search field | Client-side filter by name or username, case-insensitive (list is ≤ limit + 1 entries) | Behavior assumed |
| Select a user | Click drawer item | Loads that user into the form (edit mode) | Edit mode unknown (Q-UP-14) |
| New user | (implicit) draft item at the top of the drawer | Empty form. Draft item "New user / Not saved yet" with Draft badge. | S1, S5 |
| Create | Create User button | Validate all fields; on error show inline errors and focus the first invalid field (S2). If valid: button loading → server create → success feedback (not shown) → drawer list refresh. | Success/failure UI not shown (proposal in error-handling) |
| Duplicate | Toolbar Duplicate (with a saved user selected) | Copies "department" and permissions into a new draft, clears personal fields, success toast (S5) | Q-UP-03/04/16 |
| Delete | Unknown trigger | ConfirmDialog → "Keep user" closes; "Delete" → "Deleting..." → close + feedback | Q-UP-15 |
| Print / Excel / Refresh | Toolbar | Unknown output | Q-UP-16 |
| Active toggle | Switch | Changes the form value; saved with Create/Save | Q-UP-12 |
| Photo | Tile click/drop | File picker accepting `image/jpeg,image/png`; client type/size check; preview | Q-UP-11 |

Server capabilities required (all **requires-sa**): list users plus the limit/usage figures, get a user with
permissions, create, update, delete, the permission catalog, location options, photo upload, export, and
authorization for this page. See [data-fetching.md](data-fetching.md) and the
[SA handoff](../../../coordination/handoffs/user-permission-sa.md).

Form timing and attributes: [form-guidelines.md](form-guidelines.md). Errors: [error-handling.md](error-handling.md). Acceptance: [testing.md](testing.md).

## States required

| State | Where | Source |
|---|---|---|
| Empty create form | form, matrix | S1 |
| Validation errors | fields | S2 |
| Filled / partial permissions | matrix | S3 |
| Duplicated draft + success toast | toast, matrix, drawer | S5 |
| Destructive confirm, loading | dialog | S4 |
| Page loading (list, user, catalog) | drawer skeleton, form skeleton, matrix skeleton | Not shown; proposal: skeletons like `AppShell` loading |
| Drawer empty search result | drawer | Not shown; proposal: "No users match "{q}"" |
| Load error | drawer/matrix | Not shown; proposal: inline error with Retry |
| Submitting | Create button | Not shown; follows the Button loading spec (same as the dialog) |
| Limit reached | drawer helper, Create | Not shown (Q-UP-05) |
| Session/license failure | page | Existing license redirects (unchanged contract) |

## Accessibility

- One `<h1>` (page title). Card titles are `<h2>`.
- Every field has a visible `<label>` (the notched label is the real label element). Errors are linked with `aria-describedby` and `aria-invalid`. Required fields use `aria-required` as well as the asterisk.
- Toolbar icon buttons have `aria-label` text plus a tooltip (Print, Export to Excel, Duplicate user, Refresh).
- The drawer is a non-modal `<aside aria-label="Users">`. The toggle has `aria-expanded` and `aria-controls`. Focus is not trapped.
- The dialog is modal: focus starts on "Keep user" (the safe action), Esc maps to "Keep user" (disabled while deleting), focus is trapped, and focus returns to the trigger when it closes.
- The toast lives in a polite `aria-live` region and does not steal focus. Its close button is reachable by keyboard.
- Color is never the only signal: errors include text, and the Draft state includes text.
- Contrast: the placeholder `#ADB1B4` on white (~2.2:1) is acceptable only because it is a placeholder, not a label. The Draft badge amber text fails 4.5:1 (Q-UP-28).

## Dependencies and traceability

- Package decisions: [dependencies.md](dependencies.md) (DEP-UP-01 `libphonenumber-js`, DEP-UP-02 `country-flag-icons`, both **proposed** and conditional on Q-UP-09). The ledger rows are in [tech-stack.md](../../../adr/tech-stack.md). No dialog, toast, table, checkbox or select library is proposed; these are built with native elements and the installed stack.
- SA handoff: [user-permission-sa.md](../../../coordination/handoffs/user-permission-sa.md)
- Flow: [user-permission-flow.md](../../../diagram/user-permission-flow.md)
- TODO IDs: FE-UP-001 … FE-UP-018 in the [central TODO](../../../task/todo/user-permission.md)

## Revision history

| Revision | Date | Change |
|---|---|---|
| 1 | 2026-10-12 | Initial analysis of five screenshots. Status pending-review. |
