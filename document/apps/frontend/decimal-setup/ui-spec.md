# UI specification: decimal-setup

- Feature ID / revision: `decimal-setup` / 1
- Status: **approved** 2026-10-27 ("อนุมัติ decimal-setup UI rev 1"; frontend + mock data only, no backend/database)
- Owner request (2026-10-27, verbatim): "ฉันได้ requirement มาใหม่ เป็นหน้าในsetup ชื่อ decimal setup สำหรับ set ทศนิยมได้ว่าในเเต่ละหน้าจะมีทศนิยมกี่ตำแหน่ง เฉพาะ weight กับ price นะ ยังไม่ต้องต่อ api เเค่หน้าบ้าน mock data เเล้วก็ input field ที่ควรมีให้หน่อย ทำเอกสารก่อนก็ได้"
- Source: owner text only. There is no design image; the layout below reuses existing GMS Setup pages (Document Setup, Currency) and is marked **A** (assumption) where it is a proposal.
- Review bundle: this file, [open-questions.md](open-questions.md), central TODO [`document/task/todo/decimal-setup.md`](../../../task/todo/decimal-setup.md)

## Purpose

Let an admin choose, **per page (transaction)**, how many decimal places are shown and entered for:

- **Weight** (carats, e.g. `0.62 ct` vs `0.620 ct`)
- **Price** (unit price and money amounts, e.g. `48,000.00` vs `48,000`)

Nothing else (pcs are always whole numbers; percentages and exchange rates keep their own rules).
In this revision the page only stores the choice in mock data; other pages do **not** use it yet (Q-DEC-06).

## Page structure (A)

Route `/setup/decimal-setup`, Setup tile "Decimal Setup" (icon like Document Setup). One page, no right drawer (the
list is short and fixed), same frame and header as Document Setup:

```
[ AppShell sidebar | Topbar: Home › Setup › Decimal Setup                                   ]
[ Header: "Decimal Setup"   "Weight and price decimal places per page"   [Cancel] [Save] [Edit] ]
[ Card "Default"                                                                            ]
[   Weight decimals [ 2 ▾ ]   Price decimals [ 2 ▾ ]        [ Apply to all pages ]           ]
[ Card "Decimal Places by Page"                         search [ Search page… ]             ]
[   Section  | Page            | Weight (ct) | Example      | Price | Example               ]
[   PRE-SALE | Quotation       | [ 2 ▾ ]     | 1.23 ct      | [2 ▾] | 12,345.68             ]
[            | Reserve         | [ 2 ▾ ]     | 1.23 ct      | [2 ▾] | 12,345.68             ]
[   MEMO     | Memo Receive …                                                               ]
[   …                                                                                       ]
[   ACCOUNT  | Payable         |   —  (no weight)           | [2 ▾] | 12,345.68             ]
```

- Narrow widths: below `md` each row becomes a small card (Page title, then Weight and Price selects side by side).
- The page scrolls as a whole; the table is not height-limited (15 rows).

## Input fields

| ID | Field | Control | Values | Default | Rule |
|---|---|---|---|---|---|
| F-01 | Default · Weight decimals | select | 0, 1, 2, 3, 4 | 2 (A, Q-DEC-03) | Used for **Apply to all pages** and for pages never saved |
| F-02 | Default · Price decimals | select | 0, 1, 2, 3, 4 | 2 (A, Q-DEC-03) | Same |
| F-03 | **Apply to all pages** | button (edit mode) | — | — | Copies F-01/F-02 to every row (weight only where the page has weight); asks to confirm when any row differs |
| F-04 | Row · Weight decimals | select per page | 0–4 | from F-01 | Hidden (shown as "—") for pages without weight (Payable, Receivable, Q-DEC-02) |
| F-05 | Row · Price decimals | select per page | 0–4 | from F-02 | Every page |
| F-06 | Row · Example (weight) | read-only text | e.g. `1.2346` → `1.23 ct` | — | Live preview of the chosen places, half-up rounding (Q-DEC-04) |
| F-07 | Row · Example (price) | read-only text | e.g. `12,345.6789` → `12,345.68` | — | Live preview, thousands separator |
| F-08 | Search page | text | ≤ 50 chars | "" | Filters rows by page or section name; does not change data |

Selects are used instead of free number inputs so only valid values (0–4) can be chosen.

## Pages listed (A, Q-DEC-01)

The same 15 transactions as Document Setup, grouped as in the main menu:

| Section | Page | Weight | Price |
|---|---|---|---|
| PRE-SALE | Quotation, Reserve | ✓ | ✓ |
| MEMO | Memo Receive, Memo Return, Memo Out, Memo Out Return | ✓ | ✓ |
| PURCHASE | Purchase Order, Purchase | ✓ | ✓ |
| INVENTORY | Load to Stock, Merge/Split, Stock Transfer Location, Stock Adjustment | ✓ | ✓ |
| SALE | Sale | ✓ | ✓ |
| ACCOUNT | Payable, Receivable | — | ✓ |

## Modes and states

- **View** (default): selects shown read-only (grey), **Edit** enabled with edit permission (Q-DEC-05).
- **Edit**: selects enabled, **Apply to all pages** shown, **Save** / **Cancel**; leaving with changes asks to discard (same dialog as other Setup pages).
- **Save** (mock): stores the whole table, shows toast "Decimal setup saved", returns to view. **Cancel** restores the last saved values.
- **Loading**: table skeleton while the mock loads (≈ 250 ms delay to mimic the API). **Error**: not reachable with mock data; the component keeps the shared `DetailLoadError` slot for the API revision.
- **Empty search**: "No pages match "{text}"".

## Mock data (this revision)

- `frontend/src/features/decimal-setup/mock.ts`: the 15 pages with `{ key, label, section, hasWeight, weightDecimals, priceDecimals }`, seeded from the defaults.
- `api.ts` keeps the data in memory (and in `localStorage` per browser so a refresh keeps it during demos); `getDecimalSetup()` / `saveDecimalSetup()` return Promises with a short delay, so swapping to tRPC later changes only `api.ts`.

## Accessibility

Every select has a visible label (column header + page name via `aria-label`, e.g. "Quotation weight decimals"); the
example text is `aria-live="polite"` only while editing; the table has a caption "Decimal places by page".

## Out of scope (this revision)

API, database, permission catalog entry, and using the setting on Quotation/other pages (Q-DEC-06).
