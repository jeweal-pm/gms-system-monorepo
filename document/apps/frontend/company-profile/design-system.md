# Design tokens and components: company-profile

- Feature ID / UI revision: `company-profile` / 1 (pending-review)
- Based on the [design-system template](../template/design-system-template.md); its example values do not apply.
- Values are estimated from the screenshots (≈DPR 1.09). Wherever a value matches an existing `gms-*` token within the estimate, the existing token is used. **No new tokens are proposed.**

## Colors (all existing)

| Use | Token | Note |
|---|---|---|
| Page and section background | `gms-surface` (white) | S1 has no cards; sections sit directly on the page |
| Section divider, field border, editor border | `gms-border` | 1 px |
| Text, titles, labels | `gms-text` | |
| Section description, helper text | `gms-text-secondary` | |
| Placeholders, disabled select text | `gms-text-placeholder` | "Choose a country first", editor placeholder |
| Disabled field background (State, City) | `gms-field-disabled` | as partner address |
| Required asterisk, logo trash icon | `gms-danger` | |
| Logo trash button background | `gms-surface-sunken` | round 28 px |
| Logo empty tile | `gms-upload-tile` | as user-permission `PhotoTile` |
| Editor toolbar background | `gms-surface-muted` | |
| Toolbar button active / hover | `gms-nav-active` | S3 Bold |
| Save button / disabled Edit | `gms-primary` / `gms-primary-subtle` | existing `Button` variants |
| Excel icon | `gms-excel` | existing header |

## Typography (IBM Plex Sans Thai, site-wide)

| Role | Size / line | Weight |
|---|---|---|
| Page title | 28 / 36 | 500 (as the partner header) |
| Section title (label column) | 15 / 20 | 400 |
| Section description | 13 / 18 | 400 |
| Sub-heading "General Information" | 15 / 20 | 500 |
| "Company Logo" label | 14 / 20 | 400 |
| Field label (outlined) / value | existing `FieldShell` / `TextField` | — |
| Editor body | 14 / 22 | 400 |
| Checkbox label | 15 / 20 | 400 (existing `LabeledCheckbox`) |

## Spacing and sizes

| Item | Value |
|---|---|
| Label column / form column start | 330 px column, form starts ≈395 px from the content edge (≥ 1280) |
| Form column max width / gap | 860 / 16 px; rows 72 px apart (existing field rhythm) |
| Section padding | 24 px above and below each divider |
| Logo tile | 128×128, radius `gms-lg` (12), dotted 1 px outline `gms-border` |
| Editor toolbar / body | 40 px / min 104 px, padding 12 |
| Toolbar button | 28 px hit area, 20 px icon, radius `gms-sm` |

## Radii and shadows

Existing `gms-md` (fields, editor), `gms-lg` (logo tile), `shadow-gms-tile` (empty logo tile, as `PhotoTile`). No new shadows.

## History

| Date | By | Change |
|---|---|---|
| 2026-10-16 | ui-spec (parent, inline) | Created for UI revision 1 |
