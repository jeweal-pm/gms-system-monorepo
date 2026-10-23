# UI specification: document-setup

- Feature ID / revision: `document-setup` / 1
- Status: **approved and implemented** — owner 2026-10-23: "frontend backend เริ่มทำ Document Setup เลย" (instruction to implement revision 1 with the proposed defaults Q-DS-01…10)
- Owner request (2026-10-23, verbatim): "uxui เขียน spec Document Setup ให้หน่อยโดยฉันได้รับ requirement ว่าอยากให้สามารถตั้งชื่อหัวกระดาษได้ โดยlist ข้างๆจะเป็น หัวข้อ transaction ต่างๆและ โดยรูปที่ให้ไปคือตัวอย่างโปรแกรมอื่น โดย Document Setup ของเราจะมี Name,Code, Start From (เป็น textfirld ที่เอาให้เป็น default),ตาราง ข้อมูลในตาราง ประกอบด้วย Sno Date(วันที่เริ่มใช้หัวอันนี้ ถ้าไม่ตั้งวันใหม่มันก็จะรันไปเรื่อยๆ) Prefix, Start No(เริ่มที่เลขอะไร), Suffix (จะใช้คั่นกลาง Prefix กับ Start No),อันสุดท้าย คือ Decleration"
- Source: one owner-supplied screenshot of **another program** (reference only, not our design): [source/01-reference-other-program.png](source/01-reference-other-program.png), 1600×589 px, SHA-256 prefix `67319096fcf80166`. There is no GMS design for this page, so the layout reuses the existing GMS Setup page pattern (Vendor/Customer/Stone Master). All GMS sizes below come from existing code, not from the screenshot.
- Requirements / main flow: owner text above; [document-setup-flow.md](../../../diagram/document-setup-flow.md)
- Review bundle:
  - this file
  - [form-guidelines.md](form-guidelines.md), [data-fetching.md](data-fetching.md), [error-handling.md](error-handling.md)
  - [design-system.md](design-system.md), [conventions.md](conventions.md), [dependencies.md](dependencies.md), [testing.md](testing.md)
  - [open-questions.md](open-questions.md)
  - central TODO: [`document/task/todo/document-setup.md`](../../../task/todo/document-setup.md)

## Source quality and open decisions

| Kind | What it tells us |
|---|---|
| Owner text | The fields (Name, Code, Start From, numbering table SNo/Date/Prefix/Start No/Suffix, Declaration), that the right-hand list holds transaction types, and the purpose: name the document header ("หัวกระดาษ"). |
| Reference screenshot (other program) | The idea only: a form on the left, a list of transaction types on the right, a numbering table with Date/Prefix/Start No/Suffix rows, a large Declaration box. Its other fields (Group, Store, Print VAT, Text SMS, App Path, Custom Class, Print File, Document Reference, Voucher Header, …) are **not requested** and are left out. |
| Existing GMS code | Page frame, header buttons, right list drawer, card, fields, toast, permission handling (`frontend/src/features/partner/**`, `stone-master/**`, `components/ui/**`). |
| Assumptions (marked **A**) | Listed where used; each has a question in [open-questions.md](open-questions.md). |

Questions that change behavior: which transactions are listed (Q-DS-01), what Name means on paper (Q-DS-02), the exact meaning of Start From (Q-DS-03) and Suffix (Q-DS-04), number padding (Q-DS-05), editing rows already used (Q-DS-06), the permission key (Q-DS-07). Defaults are proposed so the spec can be approved with them.

## Page structure and layout

Route `/setup/document-setup` (replaces the current `/modules/document-setup` placeholder that the Setup tile opens). Same frame as Stone Master / Vendor:

```
[ AppShell sidebar | Topbar: Home › Setup › Document Setup                         ]
[ Header: "Document Setup"  {transaction name}        [Cancel] [Save] [Edit]  ‹tab ]
[ Card "Document Setup"                                   | Drawer "Transactions" ]
[   Name*            Code*            Start From*         |  search               ]
[ Card "Document Numbering"                [+ Add row]    |  Quotation   QT       ]
[   table: SNo | Date* | Prefix | Separator(Suffix) | Start No* | Example | ⌫    |  Reserve     RS       ]
[ Card "Declaration"                                      |  Memo Receive …       ]
[   textarea                                              |  …                    ]
```

- Page column, header, card spacing, drawer width (320 px), push/overlay rule and default open state reuse [drawer-layout.ts](../../../../frontend/src/lib/drawer-layout.ts) (PC: drawer pushes and starts open; iPad: overlays and starts closed) and the Stone Master page frame.
- Below `lg` (1024 px) the main menu is the ☰ drawer, as on every page.
- The page scrolls as a whole; no inner scroll areas. The numbering table is not height-limited.
- Narrow widths: the three top fields stack (1 column below `md`, 2 at `md`, 3 at `xl`), the table scrolls sideways inside its card below 640 px.

## Component inventory

| ID | Region / component | Existing implementation | Props / states | Source evidence |
|---|---|---|---|---|
| C-01 | Page header: title "Document Setup", subtitle = selected transaction name, buttons Cancel / Save / Edit | `PartnerPageHeader` pattern (stone-master) | view: Edit enabled with EDIT permission; edit: Cancel + Save; Save shows loading while saving. No Create / Duplicate / Delete (the list is fixed, **A**, Q-DS-01) | owner text; existing pattern |
| C-02 | Drawer "Transactions {count}" with search "Search transaction…" | `PartnerDrawer` / `UsersDrawer` pattern | rows: transaction name + code (or "Not set up" in muted text when no setup saved yet); active row highlighted; keyboard ↑/↓ + Enter; search filters by name or code (client-side, list ≤ 30) | reference right list; owner "list ข้างๆจะเป็นหัวข้อ transaction ต่างๆ" |
| C-03 | Card "Document Setup": **Name\***, **Code\***, **Start From\*** | `Card`, `TextField` | Name = document header title printed on paper, e.g. "PURCHASE ORDER" (Q-DS-02); Code e.g. "PO", shown uppercase; Start From numeric, the default **Start No** for new rows (Q-DS-03) | owner text |
| C-04 | Card "Document Numbering": table + "+ Add row" | new table in the feature (pattern: address list rows) | columns below; "+ Add row" appends a row with Date = today, Prefix = previous row's Prefix (or Code for the first row), Separator = previous row's, Start No = Start From; row ⌫ removes (disabled when only one row) | owner text; reference grid |
| C-05 | Card "Declaration": multi-line text | `textarea` styled like `TextField` (outlined, label "Declaration") | 6 rows visible, grows to 16; counter "n / 2000" | owner text; reference Declaration box |
| C-06 | Empty / loading / error states | existing skeleton, `DetailLoadError`, `FormErrorBanner` | see Interaction | existing pattern |

### Numbering table columns (C-04)

| Column | Content | Format / input | Rule |
|---|---|---|---|
| SNo | 1, 2, 3 … | read-only, right-aligned | Row order after sorting by Date (oldest first). |
| Date\* | date this numbering starts to apply | date input, `DD/MM/YYYY` display | Unique per transaction. "If no new date is set the number keeps running" (owner): a row stays in use until the next row's date. |
| Prefix | text before the number | up to 10 of `A–Z 0–9 - / .`, uppercase | Optional. |
| Separator (owner: "Suffix") | text between Prefix and number | up to 3 of `- / . _` or empty | Owner: "Suffix จะใช้คั่นกลาง Prefix กับ Start No". Column header shows "Suffix" with helper tooltip "Placed between Prefix and the number" until Q-DS-04 settles the name. |
| Start No\* | first number of this row | digits only (blocked input), 1–999,999,999 | Defaults to Start From. |
| Example | live preview, e.g. `PO-180001` | read-only, monospace-like tabular figures | `Prefix + Separator + Start No` (padding per Q-DS-05). Not stored. |
| (action) | remove row | icon button ⌫, `aria-label="Remove row {SNo}"` | Disabled for the only row; rows already used by documents follow Q-DS-06. |

The row that applies **today** (latest Date ≤ today) shows a small "In use" badge in SNo; future rows show "Upcoming".

## Interaction and data

1. Open Setup › Document Setup → the drawer lists the transactions (Q-DS-01 default: Quotation, Reserve, Memo Receive, Memo Return, Memo Out, Memo Out Return, Purchase Order, Purchase, Load to Stock, Merge/Split, Stock Transfer Location, Stock Adjustment, Sale, Payable, Receivable). The first one is selected.
2. View mode shows the saved setup read-only. A transaction never set up shows the form prefilled with defaults (Name = transaction name uppercase, Code = its default code, Start From = 1, one row dated today) and the notice "Not set up yet — numbers use these defaults." **A**
3. Edit → fields become editable; Cancel restores the saved values (confirm when changed, same discard dialog as Stone Master); Save validates, sends, shows toast "Document setup saved" and returns to view mode.
4. Switching transaction with unsaved changes asks to discard first (existing discard dialog).
5. Permission: VIEW to open, EDIT to edit/save (Q-DS-07, needs a new catalog key). Without VIEW the Setup tile is hidden, as for other tiles.

Data/API: none exists — see [data-fetching.md](data-fetching.md) (**requires-sa**). Validation: [form-guidelines.md](form-guidelines.md). Errors: [error-handling.md](error-handling.md). Tests: [testing.md](testing.md).

## Dependencies and traceability

No new package ([dependencies.md](dependencies.md)). Date input uses the native `input type="date"` styled like `TextField` (same as existing date-free forms; no date picker library in the stack). Backend: SA must design storage, the API and the permission key (TODO FE-DS-007 → `requires-sa`). TODO IDs: FE-DS-001 … FE-DS-008 in the central TODO.
