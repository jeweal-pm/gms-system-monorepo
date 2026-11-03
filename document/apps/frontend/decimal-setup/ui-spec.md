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

---

## Revision 2 — one setting for the whole website (pending review)

- Status: **pending-review** (2026-11-03). Replaces the rev 1 layout below once approved; rev 1 above is kept as history.
- Owner request (2026-11-03, verbatim): "sa uxui Decimal Setup ให้มันไม่ต้องมี Decimal Places by Page ให้มัน set decimal ทั้ง web เลย frontend backend ทำ ui และ api ด้วย"
- Source: owner text only (no design image). Layout reuses the rev 1 frame and the other Setup pages (**A** = assumption).
- Backend/API: SA bundle [document/apps/backend/master/decimal-setup/](../../backend/master/decimal-setup/) and the ADR it adds; questions Q-DEC-08… in [open-questions.md](open-questions.md); TODO [decimal-setup.md](../../../task/todo/decimal-setup.md) revision 2.

### What changes from rev 1

| Rev 1 | Rev 2 |
|---|---|
| "Default" card + **Apply to all pages** | Removed — there is only one value per kind |
| "Decimal Places by Page" table (15 pages, search) | Removed |
| Preview note "kept in this browser only…" | Removed — saved on the server, used by every page |
| Choices 0–4 | Limited to what the database stores (weight 0–3, price 0–2 by default; Q-DEC-08) |
| Gate: `document-setup` permission | Own `decimal-setup` permission (VIEW, EDIT); reading the value needs only a signed-in, licensed user (Q-DEC-11) |

### Page structure (A)

```
[ Topbar: Home › Setup › Decimal Setup                                                   ]
[ Header: "Decimal Setup"   "Weight and price decimal places for the whole website"       ]
[                                                        [Cancel] [Save] [Edit]           ]
[ Card "Decimal Places"                                                                    ]
[   Weight (ct) decimals [ 2 ▾ ]   Example 1.23 ct                                         ]
[   Price decimals       [ 2 ▾ ]   Example 12,345.68                                       ]
[   Note: Applies to every page (Quotation, Reserve, Memo, Purchase, Inventory, Sale,      ]
[   Account, reports). Pieces are always whole numbers. Percentages and exchange rates     ]
[   keep their own decimals.                                                               ]
[   Last updated {dd/mm/yyyy HH:mm} by {name}                                              ]
```

- One card, max width ~640 px, left aligned like Company Profile fields; below `sm` the two rows stack (label above the select).

### Input fields

| ID | Field | Control | Values | Default | Rule |
|---|---|---|---|---|---|
| F2-01 | Weight (ct) decimals | select | 0–3 (Q-DEC-08) | from the server (seed 2, Q-DEC-09) | Used to show and type every carat weight in the website |
| F2-02 | Price decimals | select | 0–2 (Q-DEC-08) | from the server (seed 2, Q-DEC-09) | Used to show and type every price and money amount (unit price, amount, discount amount, charges, labor, subtotal, tax, grand total) |
| F2-03 | Example (weight) | read-only | `1.23456` → e.g. `1.23 ct` (2) / `1.235 ct` (3) | — | Live, half-up rounding (Q-DEC-04 unchanged) |
| F2-04 | Example (price) | read-only | `12,345.6789` → e.g. `12,345.68` | — | Live, thousands separator |
| F2-05 | Last updated | read-only text | date/time + user | — | From the server; hidden before the first save |

### Modes and states

- **View** (default): selects read-only; **Edit** enabled only with `decimal-setup:EDIT`.
- **Edit**: selects enabled; **Save** / **Cancel**; leaving with changes asks to discard (existing dialog).
- **Save**: sends the values with the loaded version; success toast "Decimal setup saved"; every page in this browser re-formats without a reload; other users get the new places on their next load or within 10 minutes (Q-DEC-15).
- **Conflict** (409 `DECIMAL_SETUP_CHANGED`, someone saved first): message "Someone else changed the decimal setup. Reload to see the latest values." with **Reload**; the draft is kept until Reload.
- **Loading**: card skeleton. **Load error**: existing `DetailLoadError` with Retry.
- **No permission**: existing `PartnerAccessGuard` page (VIEW required to open).

### Website-wide behaviour (frontend)

- Every money value and carat weight shown in the app uses these places (tables, summaries, dialogs, print views, the Memo Outstanding report). Inputs accept at most the chosen places (extra digits are not typed in).
- Pieces stay whole numbers; percentages, exchange rates and currency rates are unchanged.
- If the setting cannot be loaded, pages fall back to weight 2 / price 2 (Q-DEC-16) and keep working; only the Decimal Setup page shows the load error.
- The rev 1 browser-only value (`localStorage` key `gms.decimal-setup.v1`) is deleted on load.

### Accessibility

Each select has a visible label; examples are `aria-live="polite"` while editing; the conflict message is `role="alert"`.
