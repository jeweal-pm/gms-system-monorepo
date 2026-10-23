# UI specification: stone-master

- Feature ID / revision: `stone-master` / 1
- Status: **approved** — owner 2026-10-19: "อนุมัติ stone-master UI rev 1 และ SA rev 1" (Q-SM-01…09 use the documented defaults)
- Owner request (2026-10-19, verbatim): "uxui ช่วยคิด spec stone master ให้หน่อยโดยตอนนี้ ฉันมีหน้า Stone Group,Size,Color,Cutting,Quality,Clarity ที่จะเหมือนกันทำ ui เหมือนกันเลย, Stone ที่จะมี Code\* Name\* Stone Group :\* HSN : ,Shape Code\* Name\* Sizes ดึงมาจากหน้า size และ Stone Code ดึงข้อมูลมาจากทุกหน้า frontend backend ช่วยทำ ui ทั้งหมดของ stone master และ api หน่อย"
- Source: seven owner-supplied images (not Figma). Images 2 and 3 are byte-identical, so six are kept in [source/](source/).
- Viewport: full-page images are 3840×2160 px. **Assumption:** DPR 2, so 1920×1080 CSS px, the same as the vendor/customer sources. The shell geometry matches. All CSS values are estimates from pixels unless marked as reused from code.
- Pattern features: [vendor](../vendor/ui-spec.md) / [customer](../customer/ui-spec.md). These are implemented in `frontend/src/features/partner/**`: the page header, right drawer with search, draft row, Active switch, buttons disabled by permission, and VIEW-only landing on a disabled Add page.
- Review bundle:
  - this file
  - [form-guidelines.md](form-guidelines.md), [data-fetching.md](data-fetching.md), [error-handling.md](error-handling.md)
  - [design-system.md](design-system.md), [conventions.md](conventions.md), [dependencies.md](dependencies.md), [testing.md](testing.md)
  - [open-questions.md](open-questions.md)
  - flow: [stone-master-flow.md](../../../diagram/stone-master-flow.md)
  - central TODO: [`document/task/todo/stone-master.md`](../../../task/todo/stone-master.md)
  - SA proposal: [apps/backend/partner/stone-master/decisions.md](../../backend/partner/stone-master/decisions.md)

## Source and evidence

| # | File | SHA-256 (prefix) | Size | State shown |
|---|---|---|---|---|
| S1 | [01-stone-group-add.png](source/01-stone-group-add.png) | `806b149c37e501dc` | 3840×2160 | **Stone Group**, Add mode. Card "Stone Group" + Active switch. Code Name\*, Name\*. The drawer "Stone Groups 3" lists Diamond/DIA, Precious Stone/PRE and Semi-precious Stone/SEM (Inactive). The draft row reads "New user" (DV-01). |
| S2 | [02-stone-name-add.png](source/02-stone-name-add.png) | `6dfb77b192e3fb09` | 3840×2160 | **Stone Name**, Add mode. Fields: Code Name\* (e.g. RUB), Name\* (e.g. Ruby), "Sizes\*" select with placeholder "Select stone group" (DV-02), HSN (e.g. 7103). Drawer row subtitle: "RD · DIA · Diamond · HSN 7102". The Amethyst row shows a green dot together with an "Inactive" badge (DV-03). Supplied twice. |
| S3 | [03-sizes-multiselect-open.png](source/03-sizes-multiselect-open.png) | `a8b5ae4fce6c9b3a` | 912×771 crop | Multi-select **"Add Sizes Available\*"**, open. Chip "1.0 mm ×", trigger text "+ Stone Group" (DV-04). Options 1.0 / 1.1 / 1.2 / 2.0 x 3.0 / 2.5 / 3.5 / 4.5 / 5.5 mm; the selected option is shaded with a check. |
| S4 | [04-stone-code-auto.png](source/04-stone-code-auto.png) | `71a938eb61683c4c` | 3840×2160 | **Stone Code (Option)**, Auto Code selected. Stone Code\* (grey, read-only) with placeholder "XX - XXXX" and helper text. Parts #1–#6 with drag handles: Name\*, Shape\*, Color\*, Cutting, Clarity, Quality. Drawer rows: RD-1.0-RD-D-EX-VVS1 / "Round Diamond · Auto code", RUB-1.5-OV-RED-AAA, SAP-BLUE-2MM (Inactive, Manual code). Search placeholder "Search name or username..." (DV-05). |
| S5 | [05-stone-code-name-select-open.png](source/05-stone-code-name-select-open.png) | `9332719fdf4c7a18` | 928×466 crop | Name\* select, open: "RD · Round Diamond", "RUB · Ruby", "SAP · Sapphire". |
| S6 | [06-stone-code-manual.png](source/06-stone-code-manual.png) | `171da63132b17893` | 3840×2160 | Same page with Manual Code selected. Stone Code\* is white and editable; the helper text changes. |

## Design deviations (reconciled; confirm in open questions where marked)

| ID | In the design | Spec | Why |
|---|---|---|---|
| DV-01 | Stone Group draft row "New user" | "New stone group", and per page "New stone name", "New size" and so on | Copy error. Same rule as vendor rev 4 (fixed title, never mirrors typed values). |
| DV-02 | Stone Name third field "Sizes\*" with placeholder "Select stone group" | **Stone Group\*** single select, placeholder "Select stone group" | Owner text: Stone = Code, Name, Stone Group, HSN. Sizes belong to Shape (Q-SM-02). |
| DV-03 | Amethyst: green dot + "Inactive" badge | Hollow dot + "Inactive" badge, as in S1/S4 | Inconsistent dot. |
| DV-04 | Sizes multi-select trigger "+ Stone Group" | "+ Add size" | Copy error. |
| DV-05 | Stone Code search "Search name or username..." | "Search code or name..." | Copy from user-permission. |
| DV-06 | Stone Name search "Search code, name or HSN..." | kept | Matches the fields. |
| DV-07 | Examples RD-**1.0**-RD-… contain a size, but the parts list has no Size | Optional **Size** part added after Name (Q-SM-03) | Both example codes include a size. |

## Pages and routes

All pages live under Setup › Master Code › **Stone Master**. Route base: `/setup/stone-master/<page>`.

| Page | Route | Context-nav label | Title (add / saved) | List label | Fields |
|---|---|---|---|---|---|
| Stone Group | `stone-group` | Stone Group | Add Stone Group / {name} | Stone Group List N | Code Name\*, Name\* |
| Stone Name | `stone-name` | Stone Name | Add Stone Name / {name} | Stone Name List N | Code Name\*, Name\*, Stone Group\*, HSN |
| Size | `size` | Size | Add Size / {name} | Size List N | Name\* only (owner 2026-10-23; unique, 1–20 of letters, digits, space . - /; Auto stone codes use it uppercased without spaces). Search placeholder "Search name...". Duplicate clears the Name. |
| Shape | `shape` | Shape | Add Shape / {name} | Shape List N | Code Name\*, Name\*, Sizes Available\* (multi) |
| Color | `color` | Color | Add Color / {name} | Color List N | Code Name\*, Name\* |
| Cutting | `cutting` | Cutting | Add Cutting / {name} | Cutting List N | Code Name\*, Name\* |
| Clarity | `clarity` | Clarity | Add Clarity / {name} | Clarity List N | Code Name\*, Name\* |
| Quality | `quality` | Quality | Add Quality / {name} | Quality List N | Code Name\*, Name\* |
| Stone Code (Option) | `stone-code` | Stone Code (Option) | Add Stone Code / {code} | Stone Code List N | Manual/Auto, Stone Code\*, ordered parts |

- `/setup/stone-master` redirects to `stone-group`.
- Entry points:
  - the Master Code dialog tile "Stone Master" (today a placeholder) opens `stone-group`
  - the sidebar/Home "Stone Master" items get real `href`s
- Breadcrumbs: Home › Setup › {context-nav label} (S1, S4).
- Context panel (S1 left): group **Stone Master** with a chevron and the 9 children in the order above. It uses the same group component and behavior as Partner master: the group label returns to Setup with Master Code open, and the chevron collapses or expands the children (default expanded). Active child is highlighted.

## Shared page layout (all 9 pages; same as vendor)

- **Header** (S1):
  - Title 24 px, with the list label beside it (secondary text).
  - Icon buttons: Print, Excel, Duplicate, Refresh.
  - Second row, right-aligned: **Create {Page}** (outline), **Cancel**, **Save** (primary), **Edit** (primary), **Delete** (danger).
  - Mode rules are the partner ones: view mode enables Create/Edit/Delete; create/edit mode enables Cancel/Save.
  - Permission rules are the 2026-10-17 ones: missing ADD/EDIT/DELETE/PRINT disables the button but keeps it visible. VIEW-only lands on the disabled Add page.
  - Excel stays disabled ("Excel export isn't available yet"), as on vendor.
- **Card** (S1): title = page name (16 px), Active switch at the right of the card header (default on). Body fields are in one column, 404 px wide, label notch style, 20 px apart. The card fills the remaining height (page does not scroll; empty space below the fields).
- **Drawer** (S1 right, 320 px, open by default, toggle tab on its left edge):
  - Header: title (plural) with a count badge, and a close button.
  - Search input.
  - Draft row in create mode: "+", "New {page}", "Not saved yet", Draft badge.
  - Rows: dot (green = active, hollow = inactive), bold primary text, secondary line, and an "Inactive" badge when inactive. The selected row is highlighted.
  - Infinite scroll; empty and error states are the partner ones.
- **Row text**:

  Owner 2026-10-23: the code comes first (bold), then the name, on every page.

  | Page | Primary | Secondary |
  |---|---|---|
  | Simple pages (not Size) | Code | Name |
  | Size | Name | (none; a size has no code) |
  | Stone Name | Code | `Name · GroupCode · GroupName · HSN n` (HSN part only when set) |
  | Shape | Code | `Name · N sizes` |
  | Stone Code | Code | `{Stone Name} · Auto code` or `· Manual code` |

- **Search**:
  - code or name
  - Stone Name: code, name or HSN
  - Stone Code: stone code or stone name
- **Duplicate**: copies the saved record into a new draft with **Code cleared**, because codes are unique and there is no running number (Q-SM-01). For Stone Code it copies the mode, parts and order; in Auto mode the code is rebuilt and the user changes a part before saving.
- **Print**: prints the saved record in a simple print layout (title, fields, Active), like vendor print. Needs PRINT.

## Page specifics

### Simple pages (Stone Group, Size, Color, Cutting, Clarity, Quality), S1

- Code Name\* and Name\*, no other fields.
- Placeholders per page, e.g. Stone Group "e.g. DIA" / "e.g. Diamond"; Size "e.g. 1.0" / "e.g. 1.0 mm"; Color "e.g. D" / "e.g. D Color".

### Stone Name, S2

- Fields:
  - Code Name\* (e.g. RUB)
  - Name\* (e.g. Ruby)
  - **Stone Group\***: single select of active groups, shown as "DIA · Diamond", placeholder "Select stone group"
  - HSN: optional, e.g. 7103
- A saved record whose group was later deactivated keeps showing it, marked "(inactive)". It can be saved unchanged, but a new choice must be active.

### Shape, S3

- Fields: Code Name\*, Name\*, and **Sizes Available\***: a multi-select of active sizes (S3).
- Selected sizes appear as chips with ×. The trigger text is "+ Add size". The list stays open for several picks and shows a check on selected options. It is searchable when there are more than 10 options.
- 1–100 sizes.

### Stone Code (Option), S4–S6

- **Mode radios**: Manual Code / Auto Code. New drafts default to **Auto**.
- **Stone Code\*** (530 px wide):
  - Auto: read-only grey field showing the code built from the parts in their current order: **the first two together, then "-", then the rest without separators** (owner 2026-10-19, e.g. RUB1.0-RDDEX). The placeholder "XX - XXXX" shows while no part is chosen. Helper (S4): "Auto Code: built from the parts below, in their order, joined with "-". Choose Manual Code to type your own."
  - Manual: editable white field, helper (S6): "Manual Code: you can change the code freely. Choosing Auto Code again replaces it with the code built from the parts."
  - Switching Auto → Manual keeps the current code as the starting text.
- **Parts list**: rows "drag handle · #n · select".
  - Parts: **Name\*** (Stone Name, options "RD · Round Diamond", S5), **Size** (Q-SM-03: options = sizes available on the chosen Shape; disabled until a Shape is chosen), **Shape\***, **Color\***, Cutting, Clarity, Quality.
  - Default order: Name, Size, Shape, Color, Cutting, Clarity, Quality. That order reproduces RD-1.0-RD-D-EX-VVS1.
  - "#n" renumbers after a move. The order is saved with the record.
  - Reordering: drag the handle with a mouse or touch. For keyboard, focus the handle (button "Move {part}") and press ArrowUp/ArrowDown; the move is announced in a live region.
  - Empty optional parts are skipped in the code.
- Changing a part, the order or the mode recomputes the Auto code immediately. The server rebuilds Auto codes when it saves (authoritative).
- Owner 2026-10-23: a saved Auto code is a snapshot. View mode shows the saved code, even if a part's code changed on another page. Edit (and create) shows the code built from the current part codes, and Save stores it (SA-SM-05a). The size part uses the size name, uppercased without spaces.

## States

| State | Behavior |
|---|---|
| Access pending / error / denied | Partner access guard with menu key `stone-master` (VIEW). Denied: "You don't have access to Stone Master". |
| Loading | Skeleton card + drawer skeleton rows (partner). |
| Option lists loading/failed | The affected select shows "Loading…" or "Couldn't load options · Retry". Save is blocked while required options failed. |
| Empty list | The drawer says "No {plural} yet". With ADD: "Create the first one with Create {Page}". |
| Saving | Save shows "Saving…"; the form is disabled. |
| Saved | Toast "{Page} created" or "Changes saved"; view mode; the drawer row updates. |
| Conflict / not found / in use | See [error-handling.md](error-handling.md). |
| Unsaved changes | Switching record, Create or Cancel while dirty opens the partner discard dialog. |

## Main user flow

1. Open Setup › Master Code › Stone Master. The Stone Group page opens on the Add form (drawer open).
2. Create the basics in any order: Stone Group, Size, Color, Cutting, Clarity, Quality.
3. Create Shapes and pick their available sizes. Create Stone Names and pick their group.
4. Open Stone Code. Choose Name, Shape (then Size), Color and optional parts, and reorder if needed. Keep Auto or switch to Manual, then Save.
5. Later: select a row → Edit / Delete / Duplicate / Print. Deactivate instead of deleting a record that is in use.

The editable diagram is in [stone-master-flow.md](../../../diagram/stone-master-flow.md).
