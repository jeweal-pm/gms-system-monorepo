# Design tokens and components: app-navigation

- Feature ID / UI revision: `app-navigation` / 1 (pending-review)
- Based on: [design-system template](../template/design-system-template.md). Its example values (blue primary, sample spacing) do **not** apply. Values below come from the four source images and the existing code.
- Current code: `frontend/src/app/globals.css` (`gms-*` tokens from user-permission FE-UP-011/FE-UP-017 and customer FE-CUS-016). Components: `frontend/src/features/home/*`, `frontend/src/features/setup/*`.
- Provenance: **M** = measured from PNG pixels at the assumed DPR 2 (S2 at ≈0.52×); exact in the image, approximate for the design because of anti-aliasing. **E** = estimated from glyph extents, curves or falloff. **C** = existing token/code. Font: IBM Plex Sans Thai site-wide (owner, 2026-10-14).

## 1. Colors

| Token (Tailwind 4 `@theme`) | Value | Prov. | Used for | Status |
|---|---|---|---|---|
| `--color-gms-surface-muted` | `#FCFCFC` | M = C | Sidebar and rail background | existing |
| `--color-gms-border` | `#EDEDED` | M = C | Sidebar right border; rail border (S1 shows `#E8E8E8`, DV-05) | existing |
| `--color-gms-nav-active` | **`#F3F3F3`** (was `#F5F5F6`) | M (S2 hover/active, S3 active) | Item/sub-item/rail hover and active background; also topbar icon hover | **change** (Q-NAV-12) |
| `--color-gms-rail-button` | `#F7F7F7` | M (S1, S2) | Rail button and sidebar collapse-toggle default background | **new** |
| `--color-gms-text` | `#1C252E` | M = C | Item labels, icons, chevrons, tile labels | existing |
| `--color-gms-text-secondary` | `#656B71` | E (S2 sub-items anti-aliased `#696969`) = C | Sub-item labels | existing |
| `--color-gms-text-subtle` | `#95A0A9` | M = C | Group labels (contrast note Q-NAV-13) | existing |
| `--color-gms-border-header` | `#E3E7EC` | M = C | Topbar border (unchanged) | existing |
| `--color-gms-tooltip` | `#000000` | M (S2) | Rail tooltip background; text `gms-on-primary` | **new** |
| `--color-gms-tile-indigo` | `#5040DB` | M | Company Profile tile | **new** |
| `--color-gms-tile-green` | `#14A460` | M | User and Permission tile | **new** |
| `--color-gms-primary` | `#006A70` | M = C | Notifications tile (exact match with primary) | existing |
| `--color-gms-tile-neutral` | `#737780` | M | Master Code tile and all seven modal tiles | **new** |
| `--color-gms-on-primary` | `#FFFFFF` | M (S4 title) / E (tile glyphs sample `#FCFCFC`) | Tile icons, modal title, tooltip text | existing |
| `--color-gms-scrim` | `rgb(52 62 62 / 0.4)` | **M** (RGBA alpha 102/255 read from S4) | `dialog::backdrop` of the Master Code modal | **new** |
| (none) | `#D71717` (glossy gradient) | M | Badge dot | **not added**: badges are hidden in rev 1 (DV-01) |

Rules: no hex in components; use the tokens above. Non-text contrast of white icons: on `#737780` ≈4.5:1, on `#14A460` ≈3.2:1, on `#5040DB` and `#006A70` > 6:1 (all ≥ 3:1 for graphics). Tile labels `#1C252E` on white pass AA. Group labels fail AA small-text contrast (≈2.6:1; kept as approved, Q-NAV-13).

## 2. Typography

| Role | Size / line height | Weight | Prov. | Notes |
|---|---|---|---|---|
| Sidebar item | 15 / 20 | 400; active 600 | M (cap 10–10.5 px) = C | existing `SidebarLink` |
| Group label | 13 / 17 | 400 | M = C | existing |
| Sub-item | 14 / 20 | 400 | E (S2) | new |
| Tooltip | 13 / 18 | 400 | E (S2) | new |
| Setup page title | 24 / 32 | 600 | E (cap ≈18 px suggests 24–26) | new; `<h1>` |
| Tile label | 14 / 20 | 500 | E (cap ≈10 px, heavier strokes than items) | new |
| Modal title | 18 / 26 | 400 | E (≈18–20 px) | white |

## 3. Spacing and sizes

| Token / constant | Value | Prov. | Used for |
|---|---|---|---|
| `--spacing-gms-sidebar` | 236 px | M = C | Expanded sidebar (235 + 1 border) |
| `--spacing-gms-rail` | 56 px | M | Collapsed rail (55 + 1 border) — **new** |
| `--spacing-gms-topbar` | 48 px | M = C | unchanged |
| Item | h 36, inset 14, padding 10, icon 18, gap 8, pitch 40 | M = C | `SidebarLink`, disclosure parent |
| Sub-item | h ≈30 (use 32 for touch), label inset 36 from item edge | E | `SidebarSubLink` |
| Section gap / label gap | 15 / 4 | M = C | |
| Rail button | 40×40, x 8, pitch 46 (gap 6), first top 77, icon 24 | M; icon E | |
| Rail logo mark | ≈31×31, top ≈20.5 | M | |
| Tooltip | gap 8 from button, height ≈32, padding 8×12, arrow 6 | E | |
| Setup tile | 54×54, icon 32, item width 144 + gap 32 (pitch 176), label gap ≈10 | M size/pitch; E rest | |
| Setup title / tiles offset | cap top 49.5 below topbar; tiles 128 below topbar | M | use `pt-10` title, `mt-12` grid (E) |
| Modal card | ≈662×473, title gap 32, grid pitch 152×124, first tile 39 from top, side inset ≈26 | M | |
| Modal tile | 54×54, icon ≈26 | M; icon E | |

## 4. Radii and shadows

| Token | Value | Prov. | Used for |
|---|---|---|---|
| `--radius-gms-md` | 8 px | E (corner curve) = C | Sidebar items, sub-items |
| `--radius-gms-lg` | 12 px | E (S1 corner ≈11–13) = C | Rail buttons, tile focus ring |
| `--radius-gms-xl` | 16 px | E (corner ≈15–16) = C | Setup and modal tiles |
| `--radius-gms-2xl` | 30 px | E (corner fit 28–32) | Master Code card — **new** |
| Tailwind `rounded-md` | 6 px | E (S2) | Tooltip (between `gms-sm` 4 and `gms-md` 8; Tailwind's default 6 px is acceptable) |
| `--shadow-gms-tile` | update to ≈ `0 2px 10px rgb(0 0 0 / 0.10)` **or** add `--shadow-gms-setup-tile` | E (falloff ≈11 px above, ≈12 px below) | Setup tiles only; modal tiles have no shadow. Existing `--shadow-gms-tile` is used by the user-permission photo tile → **add a new token** rather than change it |
| `--shadow-gms-overlay` | `0 12px 32px rgb(0 0 0 / 0.08)` | C ≈ S4 falloff (≈26 px below the card) | Master Code card |
| Focus ring | 2 px `gms-primary`, offset 2 (inset −2 inside the sidebar list) | C | All interactive elements |

## 5. Components

- **SidebarLink** (existing): default transparent; hover `gms-nav-active`; active `gms-nav-active` + semibold + `aria-current="page"`; focus-visible ring.
- **SidebarDisclosure** (new): SidebarLink look + trailing 20 px chevron (`ChevronRight` closed / `ChevronDown` open, stroke 1.5); no active style for the parent (Q-NAV-03).
- **SidebarSubLink** (new): no icon, `text-secondary`; hover `gms-nav-active`; active `gms-nav-active`, `text`, semibold (proposal; not in source).
- **RailButton** (new): `gms-rail-button` default, `gms-nav-active` hover/active, 24 px icon, radius 12, focus ring; tooltip on hover/focus.
- **RailTooltip** (new): `gms-tooltip` background, white 13 px text, left arrow, `aria-hidden`.
- **SetupTile** (new): icon square (color prop) + label; Setup variant with shadow, modal variant without; hover label underline (proposal); focus ring around the whole tile area (radius 12).
- **MasterCodeDialog** (new): native `<dialog>`, transparent dialog box containing the white title and the card; `::backdrop` = `gms-scrim`.

## 6. Change rules

Add the new tokens and the `gms-nav-active` change in `globals.css` in the same change as the components (FE-NAV-009). `globals.css` is a shared file: the frontend implementing FE-NAV-009 is its sole writer for that run, serialized through the parent. Documented values here and in code must match.

## 7. History

| Date | By | Change |
|---|---|---|
| 2026-10-15 | ui-spec | Created for UI revision 1 (pending-review) |
