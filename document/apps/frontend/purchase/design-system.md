# Design notes: purchase

- UI revision: 1 (pending-review)
- Source: [source/01-purchase-new.png](source/01-purchase-new.png). Colours were sampled from its pixels (E). The code values come from `frontend/src/app/globals.css` and `features/quotation/components/ui.tsx` (C).
- **No new token.** The page is built from the shared transaction-page components, so it looks exactly like Memo Return, Memo Receive and Reserve. A sampled value that differs from the code is recorded here; page-local colours are not changed.

| Element | Sampled (E) | Existing (C) | Decision |
|---|---|---|---|
| Primary button (Save) fill | `#006A70` | `Button primary` `#0E5E63` (token `--color-gms-primary` is `#006a70`) | Keep the shared button (DV-06). Aligning `Button primary` to the token is a design-system task across every transaction page, not part of Purchase. |
| Disabled Edit fill | `#7AB2B5` | primary `disabled:bg-[#7FB3B5]` | Same within the sampling error |
| Disabled Delete fill | `#EE8386` | danger `disabled:bg-[#F3A5A7]` | Keep the shared button |
| Dark tool buttons (Memo Stock, Purchase Order) | `#1C252E` | `Button dark` `#1C252E` | Match |
| Text / headings | — | `#1C252E` (`--color-gms-text`) | Match |
| Section divider | `#E3E7EC`, 1 px | `border-[#E3E6EA]` | Match within the sampling error |
| Table header, Totals row, photo box | `#F9F9F9` | `#F6F7F8` | Keep the shared table |
| Table row lines | `#F6F6F6` | shared row border | Keep |
| Read-only Exchange Rate | fill `#F8F8F8`, border `#EDEDED` | `TextInput readOnly` | Keep |
| Discount amount | `#DF1016` | `text-[#E5484D]` | Keep |
| Row remove icon ⊖ | `#E74C50` | `CircleMinus` `#E5484D` | Match within the sampling error |
| Sidebar active item | `#F3F3F3` | existing sidebar | Match |
| Required `*` | red | `Field required` | Match |
| Empty-row text | `#D1D4D5` (anti-aliased) | `#A9B1B9` | Keep |

Typography: a screenshot cannot establish the font family. Keep the app font and the shared sizes: title ≈ 28 px, section titles ≈ 18 px, body ≈ 15 px, table subtitles ≈ 12 px uppercase-ish (E, approximate). Numbers use tabular figures in the table (C).

Radii and shadows: inputs and buttons ≈ 8 px radius, photo box and summary ≈ 12 px (E). No visible shadow on the page, except the dialogs, which keep the shared shadow (C).

Icons (E): printer, Excel sheet, copy, refresh, scan (barcode frame), calendar, chevron-down, ⊖, ellipsis, sort up/down (not sortable, Q-PU-12), plus, and two rail icons (search-document, Σ summary). These are the existing lucide icons and `ScanIcon` (C).

## Revision 2 additions (2026-11-04)

Sampled from [source/05](source/05-memo-stock-dialog-expanded.png) and [source/07](source/07-memo-stock-group-headers.png). The full table is in [ui-spec › R2-MS](ui-spec.md#r2-ms-add-memo-stock-dialog-sources-0407). These are the only **new** colours. They are used inside the Purchase pickers and are not added as global tokens (A):

| Element | Sampled (E) | Decision |
|---|---|---|
| Sold group header and Sold badge fill | `#FAE6E4` | Use as drawn |
| Sold row left marker | 3 px `#DF1016` | Use as drawn |
| Sold badge text | `#DF1016` (4.14:1) | `#C2141A` (5.13:1), DV-09 / Q-PU-22 |
| In stock badge fill | `#C1EFD2` | Use as drawn |
| In stock badge text | `#22C55E` (1.80:1) | `#166534` (5.62:1), DV-09 / Q-PU-22 |
| In stock group header, tabs container, table header | `#F9F9F9` | Use the existing `#F6F7F8` (within tolerance) |
| Dialog lines and borders | `#EDEDED`, `#E6E6E8`, `#DFE4E4` | Use the existing `#E3E6EA` |
| Secondary text | `#656B71` | Use the existing `#6B7480` |
| Partly purchased badge (R2-PO, no design) | — | Existing `Badge lot`: `#FDF1DC` / `#B4540A` (C) |
