# Design system: approval-setup revision 1

- UI revision: 1 (pending-review)
- Sources: [01](source/01-setup-tiles-approval.png) (2× → ÷ 2), [02](source/02-approval-setup.png) and [03](source/03-cannot-turn-off-dialog.png) (≈ 1.068× → ÷ 1.068, ±1 px).
- Base: the project tokens in `frontend/src/app/globals.css` and [app-navigation](../app-navigation/design-system.md) / [approve-center](../approve-center/design-system.md). Only differences and new uses are listed. The template's Thai sections on login fields do not apply (this page has no text fields).

## 1. Colors

| Use | Value | Evidence | Token |
|---|---|---|---|
| Approval tile square | `#14A460` | measured (01, solid fill) | **new** `--color-gms-tile-emerald` (proposed; the existing `tile-green` is teal `#0E9888`, measured on User and Permission) |
| Tile icon strokes | `#FCFCFC` / `#FFFFFF` | SVG | `text-gms-on-primary` via `currentColor` |
| Page background | `#F9F9F9` | measured | `gms-page` |
| Card | `#FFFFFF` | measured | `gms-surface` |
| Table header background | `#F9F9F9` | measured | `gms-page` |
| Header bottom border | `#EDEDED`, 1 px | measured | `gms-border` |
| Row divider | `#F2F2F2`, 1 px | measured (anti-aliased `#FAFAFA` above) | use `gms-border` `#EDEDED` (difference not visible; default) |
| Title / breadcrumb current / header text | `#1C252E` | measured | `gms-text` |
| Menu label | `#242D2E` (darkest anti-aliased sample) | measured | `gms-text` |
| Helper line, "—" | `#637381` | measured | `gms-text-muted` |
| Chip "Draft"/"Save" | bg `#F9F9F9`, text `#5C5C5C` | measured | bg `gms-page`, text `gms-text-secondary` `#656B71` |
| Chip "Pending approval" | bg `#EEDAB9`, text `#C47A06` | measured | bg new `--color-gms-pending-chip` `#EEDAB9`; text **`gms-warning-text` `#9A5B00`** (contrast, Q-AS-18) |
| Chip "Approved" | bg `#C1EFD2`, text `#22C55E` | measured | bg `gms-success-subtle`; text **`gms-status-active` `#1C744A`** (Q-AS-18) |
| Chip "Revise" | bg `#FFE7B8`, text `#FFAB00` | measured | bg `gms-warning-subtle`; text **`gms-warning-text`** (Q-AS-18; same rule as approve-center Q-AP-12) |
| Chip "Rejected" | bg `#FAE6E4`, text `#DF1016` | measured | `gms-danger-subtle` / `gms-danger` (≈ 4.4:1; keep, bold-ish medium weight) |
| Waiting link | `#A96A10` (darkest sample; ≈ 4.4:1 on white) | measured | **`gms-warning-text` `#9A5B00`** (Q-AS-18) |
| Switch on track | `#006A70` | measured | `gms-primary` |
| Switch off track | `#C7CECE` | measured | existing switch uses `gms-text-placeholder` `#ADB1B4`; keep the existing component (difference noted, Q-AS-19) |
| Switch label "On"/"Off" | `#242D2E` | measured | `gms-text` |
| Dialog dividers | `#EDEDED` | measured (03) | existing dialog uses `gms-divider-dialog` `#DEE3E3`; keep component |
| Dialog primary button | `#006A70` bg, white text | measured | `Button variant="primary"` |
| Dialog secondary button | white, 1 px `#EDEDED` border, `#1C252E` text | measured | `Button variant="secondary"` |
| Modal scrim | blended `#AEB2B2` over white = `rgb(52 62 62 / 0.4)` | measured (03) | `gms-scrim` (the existing dialog uses `black/30`; use `gms-scrim` if the component change is accepted, else keep) |
| Notice (phase 1) | bg `#FCFCFC`, 1 px `#EDEDED` border, radius 8, lucide `Info` 16 px `#3385F0`, text `gms-body` `#1C252E` | **default**, not in design | `gms-surface-muted`, `gms-border`, `gms-info-dot`, `gms-text` (no new token) |

## 2. Typography (estimated; same family as the app)

| Element | Size / line | Weight |
|---|---|---|
| Title "Approval" | `gms-title` 24/32 | semibold |
| Header cells | `gms-body` 14/20 | semibold |
| Menu label | `gms-body` | semibold |
| Chips | `gms-label` 12/16 | medium |
| Helper line, "Not available yet" | `gms-label` 12/16 | regular |
| Waiting link | `gms-body` | semibold |
| Switch label | `gms-label` | medium |
| Tile label | `gms-body` | medium (existing tile) |
| Dialog title | `gms-heading` 16 | bold (existing component) |
| Dialog body | `gms-body`; first sentence semibold (03) | regular / semibold |

## 3. Spacing and sizes

| Item | Value | Evidence |
|---|---|---|
| Tile square | 54 × 54, radius 16 | measured 108 device px (01); existing |
| Page side padding | 24 | measured |
| Card inner padding | 24 | measured (top 25 dev, left 26 dev, right 27 dev at 1.068) |
| Table header height | 56 | measured (60 dev) |
| Body row height | 82 | measured (87–88 dev) |
| Menu cell left padding | ≈ 33 | measured |
| Menu icon | 20, gap 12 to label | estimated |
| Chip height | 20 | measured (19–21) |
| Chip horizontal padding | 6 | estimated |
| Chain gap (chip ↔ arrow ↔ chip) | 8 | estimated |
| Chain → helper line | 4 | estimated |
| Switch | design ≈ 36 × 20 (measured 38–39 × 21 dev); existing component 40 × 24 | keep the existing component (Q-AS-19) |
| Switch → label | 8 | estimated (existing `gap-2`) |
| Dialog width | ≈ 656 measured; existing component `min(640px, 100vw − 32px)` | keep 640 |
| Dialog header / body / footer | header ≈ 61 incl. divider, body ≈ 82, footer ≈ 63 | measured (03) |
| Dialog buttons | height 36; Close ≈ 97 wide; Go to Approve ≈ 130 wide; gap 12 | measured |

## 4. Radius, shadow, other

- Card radius 12 (`gms-lg`, estimated). Chip radius 4 (`gms-sm`, estimated). Dialog radius 16 (existing `gms-xl`). Tile shadow `gms-setup-tile` (existing).
- Arrow `→` lucide `ArrowRight` 16 px, `#637381`; slash `/` text `#637381`, 4 px each side (estimated).

## 5. Breakpoints

See [ui-spec › layout](ui-spec.md#page-structure-and-layout-desktop). No new breakpoint tokens.

## 6. Component changes

| Component | Change | Reason |
|---|---|---|
| `setup-tile.tsx` / `SetupTileColor` | add `emerald` → `bg-gms-tile-emerald` | C-AS-01 |
| `setup-icons.tsx` | add `ApprovalSetupIcon` (32 artboard, 2 px stroke, `currentColor`) from the SVG | C-AS-01 |
| `confirm-dialog.tsx` | add optional `confirmVariant?: "danger" | "primary"` (default `danger`, unchanged callers) and optional rich body (`ReactNode`) for the bold first sentence | C-AS-10/11 |
| new `StatusChip`, `StatusChain` | feature-local in `features/approval-setup/components/` | C-AS-05/06 |

## 7. Tokens to add (proposed, `globals.css`)

```css
/* approval-setup UI rev 1 (sources 01/02, measured). */
--color-gms-tile-emerald: #14a460;
--color-gms-pending-chip: #eedab9;
```
