# Design tokens and components: customer

- Feature ID / UI revision: `customer` / 1
- Based on: [design-system template](../template/design-system-template.md) as a checklist. Its example values (blue primary, IBM Plex Sans Thai, bottom-right toast, "(ไม่บังคับ)" labels) do **not** apply; the user-permission decisions do.
- Current code values: the `gms-*` tokens in `frontend/src/app/globals.css` (added by user-permission FE-UP-011). This feature **reuses them** and proposes only the few new tokens below.
- Provenance: **S** = sampled from the PNG pixels on 2026-10-14 (exact in the image, approximate for the design); **E** = estimated by eye or from measured extents at DPR 1; **=UP** = identical to the user-permission sample.

## 1. Colors

### Reused tokens (no change)

| Token (existing) | Value | Provenance here | Used for |
|---|---|---|---|
| `gms-primary` | `#006A70` | S, =UP (Create button, switch, checked box, unchecked box border, dashed button border and text, selected draft row border) | Primary actions, focus |
| `gms-primary-strong` | `#0E6064` | S (`#0D6064`), =UP | Drawer toggle tab, primary hover |
| `gms-primary-subtle` | `#FAFCFC` | S, =UP | Selected drawer row |
| `gms-page` | `#F9F9F9` | S | Content background, **address item background**, count badges, Inactive badge background |
| `gms-surface` | `#FFFFFF` | S | Cards, inputs, drawer |
| `gms-border` | `#EDEDED` | S | Inputs, address item border and divider, address card divider, sidebar border |
| `gms-border-drawer` | `#E8E8E8` | S | Drawer left border |
| `gms-border-tabs` | `#E3E7EC` | S (header bottom) | Tab bar |
| `gms-text` | `#1C252E` | S | Labels, drawer row names, card titles |
| `gms-text-heading` | `#17212B` | S | Page title |
| `gms-text-secondary` | `#656B71` | S | Subtitle, drawer second line, Inactive badge text (proposed; sampled `#5C5C5C`) |
| `gms-text-placeholder` | `#ADB1B4` | =UP | Placeholders, inactive status dot |
| `gms-danger` | `#DF1016` | S, =UP | Error border, error label, asterisk, item error frame, trash icon |
| `gms-danger-button` | `#E01B21` | =UP | Delete confirm button |
| `gms-danger-subtle` | `#FAE6E4` | S, =UP | Error input fill |
| `gms-success` | `#22C55E` | S (Default badge text) | Toast success icon |
| `gms-excel` | `#187949` | S `#267D52` (darkest anti-aliased pixel; same icon as UP) | Excel icon |
| `gms-warning-subtle` / `gms-warning-text` | `#FFE7B8` / `#9A5B00` | S bg =UP; text sampled `#FFAB00`, UP's AA proposal reused | Draft badge |
| `gms-checkbox-readonly` | `#A9A9A9` | S (disabled Duplicate icon, disabled select placeholder) | Disabled text/icon |

### Proposed new tokens (FE-CUS-016; parent serializes `globals.css`)

| Proposed token | Value | Provenance | Used for | Note |
|---|---|---|---|---|
| `gms-success-subtle` | `#C1EFD2` | S | Default badge background | |
| `gms-success-text` | `#22C55E` | owner decision 2026-10-14 (Q-CUS-06) | Default badge text | Owner chose text `#22C55E` on `#C1EFD2` as in the design, overriding the `#166534` proposal. Contrast is about 1.8:1 (below 4.5:1); the word "Default" carries the meaning, so color is not the only signal |
| `gms-status-active` | `#1C744A` | S | Active status dot in the drawer | user-permission uses `gms-primary` for its dot; this design uses green |
| `gms-field-disabled` | `#F8F8F8` | S | Disabled input fill (State/City before Country) | Text/placeholder uses `gms-checkbox-readonly` `#A9A9A9` (rename to a neutral name is optional) |

### Observed but not adopted

| Value | Where | Decision |
|---|---|---|
| `#DDDFE1` | Customer Information card border and header divider | Use `gms-border` `#EDEDED` for consistency with user-permission and the address cards (difference is small). Flag only. |
| `#F3F3F5` | Band behind the page title row (all images) | Not implemented (DV-11, user-permission Q-UP-26) |
| `#E95C61` | Darkest pixel of the italic error message | Anti-aliasing of `gms-danger` thin text; use `gms-danger` |

Rule: no hard-coded hex values in feature components (same as user-permission).

## 2. Typography (all E)

Font: unchanged app font until user-permission Q-UP-27 is decided (the design looks like IBM Plex Sans).

| Token | Size / line height | Weight | Used for |
|---|---|---|---|
| `title-page` | 24 / 32 | 500 | "Add Customer" |
| `subtitle` | 14 / 20 | 400 | "Customer list 8" |
| `title-card` | 18 / 26 | 500 | "Customer Information", "Invoice Address", "Shipping Address" |
| `title-drawer` | 16 / 24 | 600 | "Customers" |
| `subheading` | 14 / 20 | 500 | "Basic Information" |
| `item-index` | 15 / 22 | 600 | "#1" |
| `body` | 16 / 24 | 400 | Input values, button labels (15), dialog body |
| `label` | 12 / 16 | 600 | Notched labels |
| `row-strong` | 14–15 / 20 | 600 | Drawer Name line |
| `row` | 14 / 20 | 400 | Drawer Code Name line |
| `caption` | 12 / 16 | 400–500 | Badges, helper text, breadcrumb |
| `error` | 13 / 18 | 400 italic | Field error message |

## 3. Spacing, sizes, radii (all E unless S)

| Token / element | Value | Notes |
|---|---|---|
| Content padding | 24 px (40 px right with the drawer open) | =UP |
| Card radius / item radius / input radius | 12 / 8 / 8 px | =UP tokens `radius-gms-lg/md` |
| Customer Information body padding | ~24 px top, ~39 px sides | measured from field x positions |
| Customer Information grid | 3 columns, gap 17 px × 20 px, **max-width ~1290 px**, left-aligned | S2 shows the cap |
| Address card padding | 16 px | |
| Address item header | ~46 px tall; body padding 16 px; 2-column grid gap 16 px; row pitch 68 px | |
| Gaps | 16–18 px between stacked cards; ~24 px between the two address cards | |
| Field height | 52 px (S: 214→266) | =UP |
| Dashed add button | ~42 px tall, 1 px **dashed** `gms-primary` border, radius 8, primary text + plus icon, centered | S |
| Badges | 22–24 px tall, radius 4, 8 px horizontal padding | |
| Checkbox (labeled) | 20 px box, radius 4 | S |
| Drawer | ~319 px wide; header ~58 px; search ~40 px; row pitch ~78 px | S, =UP |
| Drawer toggle | 24×40, radius 4 on the outer side | S, =UP |
| Toolbar | 36×36 icon buttons; ~12 px gap between Excel and Duplicate; primary button ~170×36 | |
| Border width | 1 px everywhere | S |
| Focus ring | 2 px `gms-primary`, 2 px offset | =UP |

## 4. Component rules (additions to user-permission)

- **SelectField** (new shared primitive): `FieldShell` + native `<select>` with `appearance-none`, a `ChevronDown` icon on the right, 52 px, same error/disabled/read-only states as TextField. The first option is a disabled placeholder ("Select currency" / "Select country"). Options are sorted by display name; the option text is `"{code} — {name}"` for currencies and `"{name}"` for countries (proposal). A native select is chosen because it supports type-to-jump on ~250 entries without a library.
- **TextField disabled**: `disabled` attribute, `gms-field-disabled` fill, `gms-checkbox-readonly` placeholder, no hover border.
- **Address item error frame** (DV-12): border `gms-danger` while any field inside has an error; header text unchanged; when collapsed, also show an "Has errors" text tag next to "#n" so color is not the only signal.
- **Badges**: `Default` (`gms-success-subtle` / `gms-success-text`), `Draft` (=UP), `Inactive` (`gms-page` background, `gms-text-secondary` text, 1 px `gms-border`).
- **Print view**: plain black text on white, no shell, no colors required; one page section per address type; page title "Customer {Name}" and print date (formatted after mount with an explicit locale and `Asia/Bangkok`).

## 5. Deviations from the project template

Same as user-permission: asterisks for required fields (template uses "(ไม่บังคับ)"), top-center toast, font pending Q-UP-27.
