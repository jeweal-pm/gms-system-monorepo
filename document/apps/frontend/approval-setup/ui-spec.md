# UI specification: approval-setup revision 1

- Feature ID / revision: `approval-setup` / 1
- Status: **pending-review** (draft for owner review, 2026-11-09). Approval fields are unset in the [central TODO](../../../task/todo/approval-setup.md).
- Owner request (2026-11-09, verbatim): "Setup เพิ่ม Approval … หน้านี้จะเป็นหน้าที่สามารถเปิดปิด approve transaction เช่นถ้าหน้า Quotation ใน approval ปิด หน้า Quotation ก็จะไม่มี approve กด save ได้เลย และเมื่อเปิดใน Quotation Approval ก็จะมี approve ให้กด ถ้าจะกดปิด ต้องเคลียร์ approve reject ให้หมดก่อน. ตอนนี้ยังไม่ต้องทำ backend ให้ frontend ทำ ui ก่อน".
- Owner answers (2026-11-09, as relayed by the parent):
  1. Approval **OFF** for a type: Save means `APPROVED` at once, as Quotation works today. Stock effects happen at Save, and afterwards the document can be edited only as far as an APPROVED document of that type can be. Approval **ON**: Save leads to `PENDING_APPROVAL`, then Approve / Revise / Rejected in the Approve menu.
  2. The four Memo documents are included and can be toggled. Row order follows the sidebar: Quotation, Reserve, Memo Receive, Memo Return, Memo Out, Memo Out Return, Purchase Order (PO), Purchase, Load to Stock, Merge/Split Stock, Transfer Location.
  3. Turning a toggle **OFF** is blocked while any document of that type is `PENDING_APPROVAL` or `REVISION_REQUESTED`. The blocking dialog follows source 03. Turning **ON** has no precondition; whether it needs a confirm is proposed here (Q-AS-05).
  4. This round has **no backend**. Toggles can be clicked but are not saved. The initial state matches the system today (Quotation off, all others on). "Waiting for approval" counts come from the existing per-document list APIs, as approve-center phase 1 does. Turning OFF while documents wait opens the blocking dialog. Any other change is local only and is lost on refresh. A visible notice says the settings are not saved yet (wording Q-AS-06).
- Sources (copied into [source/](source/)):

  | File | What it shows | Pixels | SHA-256 prefix |
  |---|---|---|---|
  | [01-setup-tiles-approval.png](source/01-setup-tiles-approval.png) | Setup tile grid with the new green **Approval** tile after Document Setup | 3840 × 2160 (1920 × 1080 CSS at 2×) | `a1a1d02c8fa9ff4b` |
  | [02-approval-setup.png](source/02-approval-setup.png) | Setup › Approval table, 8 rows (no Memo rows), two purple designer callouts | 2099 × 1176 (≈ 1965 × 1101 CSS at ≈ 1.068×, derived from the 236 px sidebar = 252 device px) | `2b6bdd2d2efc1b70` |
  | [03-cannot-turn-off-dialog.png](source/03-cannot-turn-off-dialog.png) | "Can't turn off approval yet" dialog over the page (Reserve row) | 2100 × 1179 (same ≈ 1.068×) | `9e1ac5214c0d1b72` |
  | [approval-setup-icon.svg](source/approval-setup-icon.svg) | Tile icon, 32 × 32 artboard, 2 px strokes in `#FCFCFC` / white | vector | `6fef4e1ea4e7905c` |

- Inspection evidence: all three PNGs opened in the image viewer and sampled with System.Drawing on 2026-11-09. **Measured** = pixel sample ÷ scale (2 for source 01, ≈ 1.068 for 02/03; ±1 px for 02/03 because the scale is derived). **Estimated** = read by eye. No Figma file was supplied, so font families/metrics, hover/focus states, tablet/mobile layouts and exact radii are not established.
- Purple callouts in 02/03 are designer notes, not UI: "กำลังอธิบายขั้นตอนการใช้งานสามสถานะให้ชัดเจน" (explains the three-status flow) and "ตัวอย่าง ปิด Toggle ในคอลัมน์ Require approval" (example of turning a toggle off). The cursor arrows are also annotations.
- Main flow: [diagram/approval-setup-flow.md](../../../diagram/approval-setup-flow.md)
- Review bundle: this file, [design-system.md](design-system.md), [conventions.md](conventions.md), [data-fetching.md](data-fetching.md), [error-handling.md](error-handling.md), [form-guidelines.md](form-guidelines.md), [dependencies.md](dependencies.md), [testing.md](testing.md), [open-questions.md](open-questions.md) (Q-AS-01…22), the [flow](../../../diagram/approval-setup-flow.md), the SA request [coordination/handoffs/approval-setup-sa.md](../../../coordination/handoffs/approval-setup-sa.md), and the central TODO [task/todo/approval-setup.md](../../../task/todo/approval-setup.md).
- No new package.

## What Approval setup is

One Setup page that switches, per document type, whether a saved document must be approved.

| Require approval | Save result | Afterwards |
|---|---|---|
| **Off** | `APPROVED` at once; the effects that Approve has today (stock hold/move, Memo Stock, PO items to Purchase) happen at Save | edited only as far as an APPROVED document of that type can be (Quotation: editable; the others: read-only today) |
| **On** | `PENDING_APPROVAL`; waits in Approve | Approve → `APPROVED`; Revise → `REVISION_REQUESTED` (back to the creator); Reject → `REJECTED` (final). Revise/Reject are ADR-0046, backend on hold. |

Facts from the code (verified 2026-11-09):

| Row | Today | Pending list API (phase 1 count) | Catalog leaf | Page |
|---|---|---|---|---|
| Quotation | created `APPROVED` (`quotation.service.ts`); approval effectively **off** | `quotation.list` exists, but nothing is ever pending; phase 1 makes **no** count call (as approve-center) | `quotation` | `/pre-sale/quotation` |
| Reserve | `PENDING_APPROVAL → APPROVED` (**on**) | `reserve.list` | `reserve` | yes |
| Memo Receive | on | `memoReceive.list` | `memo-receive` | yes |
| Memo Return | on | `memoReturn.list` | `memo-return` | yes |
| Memo Out | on | `memoOut.list` | `memo-out` | yes |
| Memo Out Return | on | `memoOutReturn.list` | `memo-out-return` | yes |
| Purchase Order (PO) | on | `purchaseOrder.list` | `purchase-order` | yes |
| Purchase | on | `purchase.list` | `purchase` | yes |
| Load to Stock | no page, no API | none | `load-to-stock` | no |
| Merge/Split Stock | no page, no API | none | `merge-split` | no |
| Transfer Location | no page, no API | none | `stock-transfer-location` | no |

The rows, icons, labels, leaves and order are the approve-center registry `APPROVE_MENUS` (`frontend/src/features/approve-center/menus.ts`), which already follows the sidebar order (Q-AP-03). This page reuses it rather than keeping a second list.

## Source quality and open decisions

- Measured: tile color and size, card/table paddings, header and row heights, divider colors, chip backgrounds and text colors, toggle colors and size, dialog width/height/dividers/buttons, scrim. See [design-system.md](design-system.md).
- Estimated: font sizes/weights (they match `gms-title` 24, `gms-body` 14, `gms-label` 12), chip radius/padding, arrow icon size, column split.
- Design-only data: the counts (Reserve 2, PO 2, Purchase 1, Load to Stock 2, Merge/Split 1, Transfer Location 2) and the sidebar badge 10 are sample content. The three inventory types cannot have documents today.
- **Mismatches found** (each has a default and a question):
  1. **"Draft" leads every chain.** No engine document has a `DRAFT` status: the editable "draft" of the seven documents *is* `PENDING_APPROVAL`, and Quotation is created `APPROVED`. Default: replace the first chip with a neutral **"Save"** step chip (not a status) (Q-AS-01).
  2. **On-row helper says "can't be edited until the approver decides."** Today a `PENDING_APPROVAL` document is the editable, deletable draft (ADR-0045 D2, ADR-0046 D1). Default helper: "Waits in the Approve menu until an approver decides. Can still be edited while it waits." (Q-AS-02).
  3. **Off-row helper** exists only for Quotation ("Can still be edited later."). Approved Reserve/Memo/PO/Purchase documents are read-only, so the same sentence would be false for them. Default per-type text (Q-AS-03).
  4. **Memo rows are missing** from source 02; the owner added them (answer 2). They are inserted in sidebar order.
  5. **"1 documents"** (Purchase, Merge/Split rows) is a grammar error. Fixed to "1 document" (Q-AS-07).
  6. **Sort icons** on all four headers. Eleven fixed rows in sidebar order; sorting adds nothing. Default: no sorting, no icons (Q-AS-08).
  7. **Revise / Rejected chips** describe ADR-0046 statuses that the backend does not have yet (on hold). Default: show the chain as designed (it describes the target model) (Q-AS-15).
  8. **Chip text contrast**: Pending `#C47A06` on `#EEDAB9`, Approved `#22C55E` on `#C1EFD2`, Revise `#FFAB00` on `#FFE7B8` are below WCAG AA 4.5:1; the "N documents" link `#A96A10` on white is ≈ 4.4:1. Default: darker existing text tokens (Q-AS-18).
  9. **Tile placement**: source 01 has no Decimal Setup tile, which the code has after Document Setup. Default order: … Document Setup, **Approval**, Decimal Setup, Stone Factory (Q-AS-10).
  10. The sidebar dots (green/orange/red/pink) and the Approve badge "10" are designer progress annotations / sample data; not part of this feature.
- Not supplied: loading, error, no-permission, ON confirm, OFF-with-nothing-waiting confirm, not-available rows, mobile/tablet, hover/focus. Everything for those is a **default** marked as such.

## Route and navigation

- Route: `/setup/approval` (new), inside the app-shell tabs (ADR-0037) like the other Setup pages.
- Setup tile (C-AS-01) opens it. Breadcrumb: Home › Setup › Approval (source 02). `<h1>`: "Approval".
- The sidebar keeps "Setup" active on `/setup/*` (existing behaviour, source 02).

## Page structure and layout (desktop)

```
[ sidebar 236 | topbar (tabs strip) ............................................................ ]
[             | Home › Setup › Approval                                                         ]
[             | <h1> Approval                                                                   ]
[             | ┌ card ───────────────────────────────────────────────────────────────────────┐ ]
[             | │ (i) Preview — these settings aren't saved yet. …        (phase 1 only)      │ ]
[             | │ Menu            │ When a document is saved          │ Waiting for │ Require │ ]
[             | │ ▣ Quotation     │ [Save] → [Approved]               │ —           │ ○ Off   │ ]
[             | │                 │ Approved automatically on Save…   │             │         │ ]
[             | │ ▣ Reserve       │ [Save] → [Pending approval] → [Approved] / [Revise] / [Rejected] │ 2 documents › │ ● On │ ]
[             | │ … Memo Receive … Transfer Location (11 rows)                                │ ]
[             | └─────────────────────────────────────────────────────────────────────────────┘ ]
```

- Content: `#F9F9F9` page, 24 px side padding (measured), breadcrumb then title "Approval" (24 px semibold, estimated).
- Card: white, starts ≈ 32 px below the title (estimated), 24 px inner padding on all sides (measured), radius 12 px (estimated), fills the remaining height; no border visible (measured: white on `#F9F9F9`).
- Table: full card width (≈ 1606 px at the 1965 px viewport, measured). Header row `#F9F9F9`, 56 px high (measured), 1 px `#EDEDED` bottom border (measured). Body rows 82 px high (measured), 1 px `#F2F2F2` dividers (measured).
- Column split (measured at 1965 px, kept as proportions; Menu and Chain flexible):

  | # | Column | Left edge (measured) | Width rule (default) |
  |---|---|---|---|
  | 1 | Menu | 0 (content at 33 px; ≈ 33 px left padding) | min 240 px, 24 % |
  | 2 | When a document is saved | ≈ 423 px | flexible, min 520 px |
  | 3 | Waiting for approval | ≈ 1164 px | 200 px |
  | 4 | Require approval | ≈ 1410 px | 180 px |

- Phase 1 notice (C-AS-08, default, not in design) sits between the card top and the table, 16 px gap below.
- **Responsive (default)**: ≥ 1280 px as above. 1024–1279 px: the sidebar uses its existing collapsed rail; the chain wraps to two lines (the helper line below). < 1024 px: the table keeps min-width 960 px and scrolls horizontally inside the card; the Menu column stays sticky on the left. No mobile card layout in revision 1.

## Component inventory

| ID | Region / component | Existing implementation | Props / states | Source evidence |
|---|---|---|---|---|
| C-AS-01 | Setup tile "Approval" | `setup-tile.tsx`, `setup-destinations.ts` (`setupLandingTiles`), icon via `setup-icons.tsx` `designIcon` | 54 × 54 px square, radius `gms-xl` 16, new color `emerald` `#14A460` (measured), 32 px icon from [approval-setup-icon.svg](source/approval-setup-icon.svg) (strokes → `currentColor`), label "Approval"; permission Q-AS-09 | 01, tile ≈ (963–1017, 340–394) CSS, same 54 px as Document Setup (measured 1574–1681 device px) |
| C-AS-02 | Page header | `TabPage` breadcrumbs + `<h1>` | — | 02 |
| C-AS-03 | Settings table | new `ApprovalSettingsTable` (semantic `<table>`, `<caption class="sr-only">Approval settings</caption>`) | 11 rows; states below | 02 |
| C-AS-04 | Menu cell | new; icon from `APPROVE_MENUS[].icon` (`nav-icons.tsx`) 20 px `#1C252E` + label `gms-body` semibold `#1C252E`; not-available rows add "Not available yet" `gms-label` `#656B71` below (default) | label, icon, availability | 02 (icon ≈ 20 px, estimated) |
| C-AS-05 | Status chain | new `StatusChain` (an ordered list, `aria-label="Status after Save"`) | `requireApproval` on/off; chips + arrow `→` (lucide `ArrowRight` 16 px `#637381`) + slash `/` separators; helper line below | 02 |
| C-AS-06 | Status chip | new `StatusChip` (or reuse the document status tone map if extended) | tone `step` / `pending` / `approved` / `revise` / `rejected`; height 20 px (measured 19–21), radius 4 px, padding 0 6 px, `gms-label` medium | 02 |
| C-AS-07 | Waiting cell | new | loading skeleton · "—" · "No documents" · "{n} document(s) ›" link · error + Retry | 02 "2 documents ›" |
| C-AS-08 | Phase 1 notice | new inline info banner (default; reuse a banner if one exists in `features/trade-document`) | text Q-AS-06, `role="note"` | — (owner answer 4) |
| C-AS-09 | Require approval switch | existing `components/ui/switch.tsx` (`role="switch"`, visible label "On"/"Off", `hint`, `disabled` via `aria-disabled`) | checked, busy (while checking count), disabled (not available / no EDIT) | 02 (track `#006A70` on, `#C7CECE` off) |
| C-AS-10 | Blocking dialog | `components/ui/confirm-dialog.tsx` (native `<dialog>`), extended with a `confirmVariant: "primary"` and a mode without destructive confirm (FE-AS-006) | title, body (bold first sentence), Close (secondary) + Go to Approve (primary) | 03 |
| C-AS-11 | ON / OFF confirm dialog | same component, primary confirm | default, not in design (Q-AS-05) | — |
| C-AS-12 | Toast | `toast.tsx` | phase 1: "Approval turned on for {Menu} (not saved)" / "…off…" (default) | — |

## Rows and the status chain

| Row state | Chain (C-AS-05) | Helper line (`gms-label` `#637381`) | Waiting (C-AS-07) | Switch |
|---|---|---|---|---|
| Off, Quotation | [Save] → [Approved] | "Approved automatically on Save. Can still be edited later." (source 02) | "—" | Off, enabled |
| Off, other types | [Save] → [Approved] | "Approved automatically on Save and takes effect at once. Can't be edited afterwards." (default, Q-AS-03) | "—" if 0; the count if > 0 (cannot normally happen once the backend guards it) | Off, enabled |
| On, available | [Save] → [Pending approval] → [Approved] / [Revise] / [Rejected] | "Waits in the Approve menu until an approver decides. Can still be edited while it waits." (default, Q-AS-02; source text "…and can't be edited until the approver decides.") | count | On, enabled |
| On, Quotation (after a local toggle) | as On | as On | "—" (phase 1 makes no Quotation count; Q-AS-16) | On |
| Not available (Load to Stock, Merge/Split Stock, Transfer Location) | as On (the chain the type will use, ADR-0046 D8) | as On | "—" | On, **disabled**, hint "Not available yet" (default, Q-AS-04) |

Chip texts: "Save" (step, neutral), "Pending approval", "Approved", "Revise", "Rejected" (source 02 wording; Revise = `REVISION_REQUESTED`).

## Waiting for approval cell

- Count = `total` of `<doc>.list({ status: "PENDING_APPROVAL", limit: 1 })` (phase 1). Phase 2 also counts `REVISION_REQUESTED` (SA-AS-05).
- Text: `1 document ›`, `{n} documents ›` (exact number, `toLocaleString`, no cap), `gms-body` semibold, color Q-AS-18 (design `#A96A10` measured), chevron lucide `ChevronRight` 14 px.
- Link → `/approve/{slug}` (approve-center route) when the user has `<leaf>:APPROVE`; otherwise plain text (default). Accessible name "{n} {Menu} documents waiting for approval".
- 0 → "No documents" in `#637381`, no link (default). Off/not available/no count call → "—" (`#637381`, `aria-label="Not applicable"`).
- Loading → 96 × 16 px skeleton bar `#F3F3F3`. Error → "Couldn't load" `#637381` + icon button "Retry" (lucide `RotateCw` 14 px). No `<doc>:VIEW` → "—" with title "You can't view {Menu} documents" (default).

## Interactions

### Turn ON (Off → On)

1. Click / Space / Enter on the switch.
2. Confirm dialog (default, Q-AS-05): title "Turn on approval for {Menu}?"; body "From now on, a saved {Menu} waits in the Approve menu until an approver approves, sends back or rejects it. Documents already saved don't change."; buttons Cancel / Turn on (primary). Focus starts on Cancel; Esc = Cancel.
3. Turn on → switch On; chain/helper switch to the On row; toast "Approval turned on for {Menu}. Not saved yet." (phase 1).

### Turn OFF (On → Off)

1. Click the switch. While that row's count is loading, the switch shows `aria-busy` and a 14 px spinner beside it and the click waits for the count (max the query's own retry; default).
2. **Count > 0** → blocking dialog (C-AS-10, source 03), switch stays On:
   - Title: "Can't turn off approval yet"
   - Body: "**{n} {Menu} document(s) is/are still waiting for approval.** Approve or reject them in the Approve menu first, then turn approval off." (source 03; singular "1 Reserve document is still waiting for approval."). Phase 2 wording when some are `REVISION_REQUESTED`: Q-AS-12.
   - Buttons: **Close** (secondary, focused first) and **Go to Approve** (primary `#006A70`). Go to Approve closes the dialog and opens `/approve/{slug}`; Close/Esc returns focus to the switch.
3. **Count = 0** → confirm (default, Q-AS-05): title "Turn off approval for {Menu}?"; body "From now on, saving a {Menu} approves it at once, and its stock changes happen on Save. Documents already approved don't change."; Cancel / Turn off (primary). Quotation body: "From now on, saving a Quotation approves it at once. Documents already saved don't change."
4. **Count failed** → dialog title "Couldn't check waiting documents", body "Try again in a moment. Approval for {Menu} stays on.", buttons Close / Try again (refetches the count, then repeats step 2/3). Default.
5. Row without a count call (Quotation turned on locally) → step 3 directly.

### Phase 1 limits (owner answer 4)

- State lives in page component state, initialised from `DEFAULT_APPROVAL_SETTINGS` (Quotation off, all others on). It is lost on refresh and on closing the tab. It is **not** shared with Approve Center, the sidebar, or any document page. No `localStorage` (would imply a persisted setting).
- Notice (C-AS-08, default wording, Q-AS-06): **"Preview only. These settings aren't saved yet: changes are lost when you refresh and don't change how documents are saved."**

## Table states

| State | Display |
|---|---|
| Loading (permissions) | header + 11 skeleton rows of 82 px (default) |
| Ready | rows as above; counts load independently per row |
| No `approval-setup` VIEW (phase 2) / not Super Admin (phase 1) | standard Setup "You don't have permission to view this page." placeholder (existing guard) |
| VIEW without EDIT (phase 2) | switches `readOnly` (`aria-readonly`), hint "View only" in the header cell tooltip (default) |
| Count error | per-row only (above); the rest of the page works |

## Permissions

- Proposed catalog leaf (requires SA, auth catalog change): **`approval-setup`**, label "Approval", section SETUP after `document-setup`, actions **VIEW / EDIT** (same shape as `document-setup` and `decimal-setup`). VIEW = tile + page read-only; EDIT = toggle. Counts additionally need `<doc>:VIEW`; the "documents ›" link needs `<doc>:APPROVE` (Q-AS-09, Q-AS-16).
- Phase 1 (leaf does not exist yet): the tile and page use `permission: ["approval-setup"]`; with the existing check this resolves only for Super Admin / `ALL`. No grant is invented.
- The server (phase 2) checks `approval-setup:EDIT` + CSRF on update; the UI check is display only.

## Dependencies on other features

- **approve-center** (approved rev 1, phase 1 implemented): today `APPROVE_MENUS` hard-codes Quotation `availability: "off"` (Q-AP-06 "permanent off"). Once settings are saved (phase 2), the Approve panel must read them: a type turned OFF shows the "off" badge and no count; Quotation turned ON becomes an available menu (needs `quotation` in `ApprovalProc`, its list/approve wiring and its consequence text). This changes approve-center Q-AP-06 → FE-AS-009, and must be coordinated with approve-center phase 2 (FE-AP-009…011). Phase 1 local toggles do **not** affect Approve.
- **Document pages** (Quotation, Reserve, Memo ×4, PO, Purchase): when OFF, Save approves (no Approve button, Save confirm text names the effect); when ON, Save → Pending + Approve. Needs the saved setting and the backend save path (FE-AS-010, SA-AS-03/04).
- **transaction-soft-delete / ADR-0045**: deletable = before approval. With approval OFF a saved document is APPROVED at once and therefore not deletable. Deleted pending documents vs. turning OFF: Q-AS-13.
- **ADR-0046** (Accepted, backend on hold): defines `REVISION_REQUESTED` / `REJECTED` for the seven documents only; Quotation would need the same when ON (SA-AS-04).

## Dependencies and traceability

- Packages: none ([dependencies.md](dependencies.md)).
- Phase 1 (independent UI, existing APIs only): FE-AS-001…007 in the [central TODO](../../../task/todo/approval-setup.md).
- Phase 2 (requires SA): SA-AS-01…10 in the [SA handoff](../../../coordination/handoffs/approval-setup-sa.md) and FE-AS-008…011.
