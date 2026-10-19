# UI specification: company-profile

- Feature ID / revision: `company-profile` / **3** (owner redesign, 2026-10-17). Revision 2 (approved 2026-10-16) stays below; the **Revision 3** section overrides it where they differ.
- Status: **revision 3 approved** (layout items implemented; data-coupled items wait for SA revision 3). Evidence in the [central TODO](../../../task/todo/company-profile.md)

## Revision 3 (2026-10-17) — overrides the sections below

- Source: S7 [07-rev3-form-column.png](source/07-rev3-form-column.png) (form, 3352×2456), S8 [08-rev3-full-page.png](source/08-rev3-full-page.png) (full page in the shell, 3840×2160 = 1920 CSS @2×), S9 [09-rev3-logo-states.png](source/09-rev3-logo-states.png) (logo tile: empty / uploading / edit + trash / view)
- Owner request (verbatim): "design หน้า company profile เปลี่ยน ช่วยแก้แบบ companyprofile ให้หน่อยเอาแบบในรูปนะ"; answers to the clarifying questions: Road/Street "เพิ่มจริง ทำ SA + backend"; City/State "ทำหน้าตาแบบ dropdown แต่ยังพิมพ์เองได้"; Bank Details "เปลี่ยนเป็นข้อความธรรมดา"; Terms "เอาออกจากหน้า เอาออกจาก schema ด้วยไม่ใช่ term and consdition เเล้วในหน้า company proflie"

| ID | Change (S7/S8, positions in CSS px at 1920) | Needs |
|---|---|---|
| R3-01 | **Layout**: no label column. Left column 200 px holds "Company Logo" (heading) + the logo tile; right column (≈48 px gap) holds the sections **General Information, Address, Company Currency, Company Bank Details**, each with its title above its fields; 1 px dividers across the right column between sections. Fields max 860 px, 2 columns × ≈422 px, 16 px gap, rows 68 px apart | UI only |
| R3-02 | **Labels**: notched outline labels (label on the top border, as in vendor/customer) instead of labels above the field | UI only |
| R3-03 | **Logo tile** 200×200; states per S9: empty (grey, icon, "Upload photo", "JPEG or PNG only"); **uploading** (grey + spinner, while Save uploads the picked file); edit (white + red trash); view (grey). Logo `object-contain` | UI only |
| R3-04 | **Address**: "Address No.1 \*", "Address No.2" (full width); **Road/Street** (optional) │ Country \*; **State/Province \* │ City** (owner 2026-10-19: State first, City optional); Postcode \*. Design label "Stage/Province" is a typo (DV-04 → "State/Province") | Road/Street: **SA rev 3** |
| R3-05 | **City / State**: look like dropdowns (chevron, grey disabled "Choose a country first" until a Country is chosen) but stay **free text** (owner) | UI only |
| R3-06 | **Currency**: label "Company Currency \*", placeholder "Select" (DV-01 closed) | UI only |
| R3-07 | **Company Bank Details**: plain multi-line text box (no toolbar), placeholder "Enter bank transfer details...", vertical resize; checkbox **"Need to show on invoice"** | Plain text: **SA rev 3** |
| R3-08 | **Term and Condition removed** from the page and the schema (owner) | **SA rev 3** |
| R3-09 | Header unchanged (title; Print / Excel / Refresh; Cancel · Save · Edit) | — |

Deviations: DV-01 closed (design now says "Company Currency"); DV-02, DV-03 unchanged; **DV-04** "Stage/Province" → "State/Province".
- Revision 2 answers: Phone validated with libphonenumber-js (DEP-CP-02); logo ≤ **10 MB**; grey logo tile = read-only, white + trash = edit; Print/Excel disabled; Tiptap for the editors.
- Source: six owner-supplied screenshots, 2026-10-16, in [source/](source/) (no Figma)
- Viewport / source dimensions: S1–S3 ≈2100×1180 px. **Assumption:** the viewport is 1920 CSS px wide at ≈DPR 1.09 (the same scale as the app-navigation image 6), so CSS ≈ px ÷ 1.09. S4–S6 are crops of the logo tile.
- Inspection evidence: every image viewed on 2026-10-16. Positions are estimated from the pixels. No exact font, colour or token values were supplied.
- Owner request (verbatim): "uxui ทำ spec Company profile ให้หน่อย". This is a request for the spec, not approval.
- Requirements / main flow: this file, [open questions](open-questions.md), [flow](../../../diagram/company-profile-flow.md)
- Review bundle: this file, [open-questions](open-questions.md), [design-system](design-system.md), [conventions](conventions.md), [form-guidelines](form-guidelines.md), [data-fetching](data-fetching.md), [error-handling](error-handling.md), [dependencies](dependencies.md), [testing](testing.md), [flow](../../../diagram/company-profile-flow.md), [SA handoff](../../../coordination/handoffs/company-profile-sa.md); central TODO: [`document/task/todo/company-profile.md`](../../../task/todo/company-profile.md)

## Source and evidence

| # | File | Size | Shows |
|---|---|---|---|
| S1 | [01-details-general-information.png](source/01-details-general-information.png) | 2100×1179 | Full page, top: header and actions; **Details** (Company Logo empty upload tile, General Information fields); **Address**; start of **Company Currency** |
| S2 | [02-address-currency-bank-terms.png](source/02-address-currency-bank-terms.png) | 2105×1185 | Scrolled: Address, Company Currency, **Company Bank Details** (rich-text editor + checkbox), **Term and Condition** (rich-text editor + checkbox) |
| S3 | [03-editor-bold-active.png](source/03-editor-bold-active.png) | 2100×1178 | Same as S2 with the Bank Details toolbar **Bold** button in the active/pressed state |
| S4 | [04-logo-uploaded-grey.png](source/04-logo-uploaded-grey.png) | 678×348 | Logo uploaded, tile background dark grey |
| S5 | [05-logo-uploaded-delete.png](source/05-logo-uploaded-delete.png) | 695×428 | Logo uploaded on a white tile with a red trash button at the top right |
| S6 | [06-logo-uploaded-grey-crop.png](source/06-logo-uploaded-grey-crop.png) | 634×244 | Another crop of the grey state (S4); not byte-identical |

Provenance labels: **E** = estimated from pixels; **C** = existing code or contract; **A** = assumption or proposal (listed in [open-questions.md](open-questions.md)).

## Decisions in this revision

| ID | Decision | Basis |
|---|---|---|
| D-01 | A new route **`/setup/company-profile`** replaces the `/modules/company-profile` placeholder. The Setup landing tile "Company Profile" links to it. Breadcrumbs are `Home › Setup › Company Profile`; the sidebar shows Setup as active (app-navigation `activePrefix`). | S1 breadcrumb; app-navigation rev 3 |
| D-02 | A single-record page with no list or drawer. The header reuses the partner header pattern: title, then the Print / Excel / Refresh icon buttons, then **Cancel · Save · Edit**. | S1; `PartnerPageHeader` (C) |
| D-03 | Modes. **Setup** (no profile saved yet): every field is editable; Save and Cancel are enabled and Edit is disabled (as in S1). **View** (profile saved): fields are read-only, Edit is enabled, Save and Cancel are disabled. **Edit**: as Setup; Cancel restores the saved values. | S1 button states; partner modes (C) |
| D-04 | Layout: sections separated by full-width 1 px dividers. Each section has a left **label column** (title, optional description) and a right **form column**. | S1, S2 |
| D-05 | Fields reuse `TextField` / `SelectField` / `FieldShell` (outlined label), `LabeledCheckbox`, and the partner address pattern (Country select; State and City are dropdowns from the country's region list, disabled until a Country is chosen; partner DV-04, owner 2026-10-19). | C |
| D-06 | Company Logo reuses the user-permission upload tile (`PhotoTile` look, `gms-upload-tile`), accepting JPEG or PNG. Uploaded states follow S4–S6 (see the Logo section). | S1, S4–S6; FE-UP C-08 (C) |
| D-07 | The two rich-text fields (Bank Details, Terms and Conditions) need an editor. The **proposed** library is Tiptap ([dependencies.md](dependencies.md), DEP-CP-01); the zero-dependency alternative is a Markdown textarea with a toolbar. The owner chooses (Q-CP-05). | S2, S3 |
| D-08 | No company profile API exists. Data, logo storage, rich-text storage and sanitising, and permissions are **requires-sa** ([SA handoff](../../../coordination/handoffs/company-profile-sa.md)). The independent UI (layout, form, validation, modes against a typed local model) can start after UI approval; data wiring waits for SA approval and backend delivery. | Code search 2026-10-16 (C) |
| D-09 | Access follows the existing permission catalog leaf `company-profile` (C): VIEW is required to open the page and EDIT (or the catalog's equivalent action) to change it. SA confirms the exact action keys. | `backend-api-auth/src/permission/catalog.ts` (C) |

## Page structure and layout

Shell: the app-navigation `AppShell`, i.e. the expanded sidebar (or rail) plus the 48 px topbar (C). The content area scrolls; the page header **scrolls with the content** in S2 (it is visible at the top of the scrolled frame). **A:** the header stays sticky at the top of the content area (Q-CP-08). This matches the visible frame and keeps Save reachable.

| Region | Value | Prov. |
|---|---|---|
| Content padding | ≈24 px left (title x ≈25 px from the sidebar edge), ≈20 px right | E |
| Title "Company Profile" | ≈28 px / 36, weight 500–600, `gms-text`; same style as "Add Vendor" | E; C (partner header) |
| Icon buttons | Print, Excel (green glyph), Refresh, right-aligned, ≈32 px squares, top ≈32 px | E; C (partner header) |
| Action buttons | Cancel (secondary, white, 1 px border), Save (primary `gms-primary` teal), Edit (pencil icon; disabled = light teal), height ≈36, right-aligned under the icons | E; C (`Button`) |
| Sections area | starts ≈100 px below the title; full content width up to the dividers (≈1630 px at 1920) | E |
| Label column | x ≈60 px from the content edge, width ≈330 px; title 15 px / 20 `gms-text` regular; description 13 px / 18 `gms-text-secondary` | E |
| Form column | starts ≈395 px from the content edge; max width ≈860 px; 2 columns of ≈422 px with a 16 px gap; rows 72 px apart (field ≈52 px + label overlap) | E |
| Section divider | 1 px `gms-border`, from the label column to the right content edge; ≈24 px above and below | E |

### Sections (in order)

| Section (label column) | Form column content | Prov. |
|---|---|---|
| **Details** (no description) | "Company Logo" label (14 px) → logo tile; then the sub-heading **General Information** (15 px medium) → 2-column grid: Name/Company Name\*, Tax ID; Contact Person Name\*, Phone No.\*; Email\*, Website | S1 |
| **Address** — "Manage company address and contact information." | Address\* (full width); Address Line 2 (optional) (full width); Country\* (select), State/Province\* (disabled "Choose a country first" until a Country is chosen); City\* (same), Postcode\* | S1, S2 |
| **Company Currency** | one select at half width. **The design labels it "Contact Person Name \*"; this spec uses "Currency \*"** (DV-01, Q-CP-01) | S2 |
| **Company Bank Details** | rich-text editor (toolbar + ≈104 px body, resizable vertically, placeholder "Enter bank transfer details..."); checkbox "Show bank details on Invoice preview" | S2 |
| **Term and Condition** | rich-text editor (placeholder "Enter terms and conditions..."); checkbox "Show terms and conditions on Invoice preview" | S2 |

The bottom of S2 ends after the Terms checkbox, so no further section is assumed. **A:** 48 px bottom padding.

### Company Logo tile (S1, S4–S6)

| State | Look | Behaviour | Prov. |
|---|---|---|---|
| Empty (editable) | ≈128×128 px, radius ≈12, `gms-upload-tile` grey surface with a dotted light outline; image icon, "Upload photo" (13 px semibold), "JPEG or PNG only" (12 px secondary) | Click or Enter/Space opens the file picker (JPEG/PNG) | S1; C |
| Uploaded, view mode | Logo image `object-contain` on the tile; no trash button | Not interactive | S4/S6 (A: the grey background is the read-only look, Q-CP-03) |
| Uploaded, edit mode | Logo on a white tile; round light-grey 28 px button with a red trash icon (`gms-danger`), 8 px from the top-right corner | Trash removes the logo (pending until Save). Clicking the tile replaces the image | S5 |
| Uploading / invalid | **A:** spinner overlay while the file is read; inline error under the tile ("JPEG or PNG only", "File is larger than N MB") | Size limit 10 MB (owner, Q-CP-04) | — |

Q-CP-03 asks whether the grey S4/S6 look is the read-only state or the hover state. Default: read-only.

### Rich-text editor (S2, S3)

| Part | Value | Prov. |
|---|---|---|
| Container | full form-column width (≈860), 1 px `gms-border`, radius ≈8 | E |
| Toolbar | ≈40 px, `gms-surface-muted` background; 20 px icon buttons (≈28 px hit area) in groups separated by 1 px vertical rules: **Bold, Italic, Strikethrough │ Link │ Ordered list, Bullet list │ Code, Code block** | S2 |
| Active button | light grey background (`gms-nav-active`), dark icon (S3 Bold) | S3 |
| Body | ≈104 px minimum height, padding 12, 14 px text; placeholder `gms-text-placeholder`; vertical resize handle at the bottom right | S2 |
| Read-only | toolbar hidden or disabled (A: disabled, Q-CP-06); content rendered as formatted text | — |

Buttons are `type="button"` with `aria-pressed` for the marks and `aria-label`s. Keyboard shortcuts: Ctrl/Cmd+B, I, Shift+X (strike) and E (code) when the library provides them. Link asks for a URL (**A:** a small inline prompt: URL input with Apply/Remove; only `http(s):` and `mailto:` are allowed).

### Responsive (proposal; not in source)

| Width | Layout |
|---|---|
| ≥ 1280 | As the source |
| 1024–1279 | Label column 240 px; form column fills the rest (max 860) |
| 768–1023 | Label column stacks above its form (title then description, 8 px gap); form 2 columns |
| < 768 | Form 1 column; header actions wrap below the title; 16 px gutters; no horizontal scroll |

## Component inventory

| ID | Region / component | Existing implementation | Props / states | Source |
|---|---|---|---|---|
| CP-01 | Route `/setup/company-profile` | new `frontend/src/app/setup/company-profile/page.tsx` in `AppShell` | breadcrumbs `Home(/) › Setup(/setup) › Company Profile` | S1 |
| CP-02 | Page header | reuse `PartnerPageHeader` if its props fit (title, icons, Cancel/Save/Edit, no Create/Delete/Duplicate); otherwise a small `CompanyProfileHeader` with the same classes | setup / view / edit / saving | S1; C |
| CP-03 | `ProfileSection` | new | `title`, `description?`, `children`; two-column at ≥ 1024, stacked below; divider above every section except the first | S1, S2 |
| CP-04 | General Information fields | `TextField`, `PhoneField` (Q-CP-02) | required markers, errors, read-only | S1; C |
| CP-05 | Address fields | partner address pattern (Country `SelectField` from options; State/City free text disabled until Country) | as partner | S1; C |
| CP-06 | Currency select | `SelectField` with currency options (`{code, name}`) | required | S2; C (partner options shape) |
| CP-07 | `LogoUploadTile` | new; visual base = user-permission `PhotoTile` | empty / uploaded-view / uploaded-edit / uploading / error; hidden `<input type="file" accept="image/jpeg,image/png">` | S1, S4–S6 |
| CP-08 | `RichTextField` | new; editor per DEP-CP-01 decision | label via `aria-labelledby` the section title; toolbar; active marks; read-only; error | S2, S3 |
| CP-09 | Invoice-preview checkboxes | `LabeledCheckbox` | checked / read-only | S2; C |
| CP-10 | Discard confirmation | reuse partner `DiscardChangesDialog` | Cancel with unsaved changes, or navigating away | C |
| CP-11 | Setup landing tile | `features/setup/setup-destinations.ts` (Company Profile → `/setup/company-profile`); remove `company-profile` from `setupOwnedPlaceholders` | — | app-navigation (C) |

## Interaction and data

- Load: the profile query decides the mode (none → Setup, otherwise View). While loading, show field skeletons. On error, show an inline page error with **Retry**.
- Save: validate everything ([form-guidelines](form-guidelines.md)), then send one mutation with all fields and the logo change (unchanged / new file / removed). Show a success toast; the page switches to View and the query is invalidated.
- Cancel: from Edit with changes, confirm discard, then restore the saved values and switch to View. From Setup with changes, confirm, then clear the form.
- Refresh: refetch. With unsaved edits, confirm first.
- Print and Excel: there is no defined output for a single company record, so they render disabled with "Not available yet" (as the user-permission precedent) until the owner defines them (Q-CP-07).
- Leaving with unsaved changes (link in the sidebar or a browser unload): `beforeunload` prompt plus the discard dialog for in-app links, as the partner pages do (C).
- "Show … on Invoice preview" flags are stored only; there is no invoice feature yet.
- Data contracts, errors and permissions: [data-fetching](data-fetching.md), [error-handling](error-handling.md).

## Deviations from the design

| ID | Design shows | Implement instead | Why |
|---|---|---|---|
| DV-01 | Company Currency field labelled "Contact Person Name \*" | "Currency \*" | Label appears copied by mistake (Q-CP-01) |
| DV-02 | Phone No. as a plain field | Existing `PhoneField` (country code + number), as vendor and customer | Same validation and storage across the app (Q-CP-02) |
| DV-03 | Print and Excel icons active | Disabled with "Not available yet" | No defined output (Q-CP-07) |

## Dependencies and traceability

- Packages: DEP-CP-01 rich-text editor (**proposed**, [dependencies.md](dependencies.md) and the [central ledger](../../../adr/tech-stack.md)).
- Backend: requires-sa ([handoff](../../../coordination/handoffs/company-profile-sa.md)); infra review only if SA chooses storage outside PostgreSQL.
- TODO IDs: FE-CP-001…012 in the [central TODO](../../../task/todo/company-profile.md). Tests: [testing.md](testing.md) TC-CP-01…20.
