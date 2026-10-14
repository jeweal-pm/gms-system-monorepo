# Design tokens and components: user-permission

- Feature ID / UI revision: `user-permission` / 1
- Based on: [design-system template](../template/design-system-template.md). The template's example values (blue primary, IBM Plex Sans Thai, and so on) do **not** apply. The values below come from the screenshots.
- Current code values: `frontend/src/app/globals.css` (`--gms-teal #006c68`, `--gms-ink #18232b`, `--gms-muted #687887`, `--gms-line #d9e1e5`, `--gms-blue #1877f2`; body font Arial)
- Value provenance: **S** = sampled from the PNG pixels (exact in the image, approximate for the design because of anti-aliasing and compression); **E** = estimated by eye or from a measured extent at the assumed DPR 2.

## 1. Colors

| Proposed token | Value | Provenance | Used for | Existing code equivalent |
|---|---|---|---|---|
| `primary` | `#006A70` | S (button fill, switch track, checked checkbox, selected drawer border, shield icon) | Primary button, switch on, checkbox checked/indeterminate, selected item border | `--gms-teal #006c68` (near; Q-UP-27) |
| `primary-strong` | `#0E6064` | S (drawer toggle tab) | Drawer edge tab / hover of primary (assumed) | none |
| `primary-subtle` | `#FAFCFC` | S (selected drawer item background) | Selected list item | none |
| `on-primary` | `#FFFFFF` | S | Text/icons on primary | none |
| `bg-page` | `#F9F9F9` | S (content background between cards; table header; badge background) | Content area, table header, count badges | body `#fff` |
| `surface` | `#FFFFFF` | S | Cards, drawer, header, sidebar, toast, dialog | |
| `surface-muted` | `#FCFCFC` | S | Select All row | none |
| `surface-sunken` | `#F3F3F3` | S | Active sidebar item, chips | none |
| `upload-tile` | `#ECECEC` | S | Photo tile background | none |
| `border` | `#EDEDED` | S (input, card, checkbox, table header bottom; 2 device px = 1 CSS px) | Inputs, cards, checkboxes, dividers | `--gms-line #d9e1e5` |
| `border-drawer` | `#E8E8E8` | S | Drawer left border | |
| `border-tabs` | `#E3E7EC` | S | Tab bar bottom line | |
| `divider-dialog` | `#DEE3E3` | S | Dialog dividers | |
| `text` | `#1C252E` | S (labels, active tab underline) | Body text, labels, headings | `--gms-ink #18232b` |
| `text-heading` | `#17212B` | S (page title darkest pixel) | Page title (probably the same token as `text`) | |
| `text-secondary` | `#656B71` | S (breadcrumb, sub-menu rows) | Secondary text | `--gms-muted #687887` |
| `text-placeholder` | `#ADB1B4` | S | Placeholder | |
| `danger` | `#DF1016` (fields) / `#E01B21` (dialog button) | S | Error border, error label, required asterisk, destructive button | none |
| `danger-subtle` | `#FAE6E4` | S | Error input fill | none |
| `success` | `#22C55E` | S (toast check, online dot) | Success icon, online status dot | header dot `#168052` in code |
| `info-dot` | `#3385F0` | S | Notification unread dot | |
| `excel-green` | `#187949` | S | Excel icon color only | |
| `warning-subtle` | `#FFE7B8` | S | Draft badge background | |
| `warning-text` | `~#FFAB00` (sampled) → proposed `#9A5B00` for AA | S / proposal | Draft badge text (contrast Q-UP-28) | |
| `checkbox-readonly` | `#A9A9A9` | S | Grey check glyph after duplicate (meaning Q-UP-04) | |

Rule: no hard-coded hex values in components. Add the tokens through Tailwind 4 `@theme` in `globals.css` (FE-UP-011).

## 2. Typography (all E)

The font looks like **IBM Plex Sans** (letterforms of `g`, `a`, `y`), but a screenshot cannot prove it (Q-UP-27).
Until it is approved, keep the current font and apply the sizes and weights below.

| Token | Size / line height | Weight | Used for |
|---|---|---|---|
| `title-page` | ~24 / 32 | 500 | "Add User and Permission" |
| `title-card` | ~16 / 24 | 600 | "Personal Information", "Permissions", "Users" |
| `title-dialog` | ~20 / 28 | 700 | "Delete User 001?" |
| `body` | ~15–16 / 24 | 400 | Input values, dialog body, toast |
| `label` | ~12–13 / 16 | 600 | Notched field labels |
| `table-head` | ~14 / 20 | 500, uppercase | Matrix column headers |
| `row-strong` | ~15 / 22 | 600 | Top-level and group rows |
| `row` | ~15 / 22 | 400 | Sub-rows |
| `caption` | ~12 / 16 | 400 | Badges, helper text, breadcrumb |
| `error` | ~13 / 18 | 400 italic | Field error message |

Thai text must keep a line height of at least 1.4× its size if Thai copy is used later.

## 3. Spacing, radii, shadows (all E)

| Token | Value | Used for |
|---|---|---|
| Content padding | 24 px | Content area horizontal padding |
| Card gap | 16 px | Between cards |
| Card padding | 24 px | Card header and body |
| Field gap | 16 px horizontal / 20 px vertical | Field grid |
| Field height | ~52 px (outlined) | Text, phone and location fields |
| Button height | 36 px | Primary/secondary/danger |
| Checkbox | 22 px overall (20 px interior + 1 px border) | Matrix |
| `radius-sm` | 4 px | Checkbox, badges, chips |
| `radius-md` | 8 px | Inputs, buttons, photo tile, drawer item |
| `radius-lg` | 12 px | Cards, toast |
| `radius-xl` | 16 px | Dialog |
| `shadow-overlay` | soft, large blur (≈ `0 12px 32px rgb(0 0 0 / 0.08)`) | Toast, dialog |
| `shadow-tile` | subtle (≈ `0 1px 3px rgb(0 0 0 / 0.12)`) | Photo tile |
| Border width | 1 px everywhere (measured as 2 device px) | Inputs, cards, dividers, checkboxes, selected item |
| Focus ring | 2 px `primary`, 2 px offset (not in source; required for keyboard use) | All interactive elements |

## 4. Component specifications

Detailed props and states are in [ui-spec.md component inventory](ui-spec.md#component-inventory). Rules:

- **Button**: `primary` teal / `secondary` white with `border` / `danger` red. The loading state keeps the width, shows a spinner plus a verb ("Deleting...") and disables the button. A disabled button has reduced opacity. Labels are verbs ("Create User", "Keep user", "Delete").
- **OutlinedTextField**: the label is centered on the top border, with a white background behind it to make the notch. The required asterisk is `danger`. Error state uses `danger-subtle` fill, a `danger` border and label, and an italic error message below. Disabled uses `surface-sunken` with `text-placeholder`.
- **Checkbox**: native `<input type="checkbox">` with custom styling. Indeterminate is set through the DOM property.
- **Toast**: max 3 visible; `success` and `info` dismiss themselves after 5 s (proposal, Q-UP-24); `error` stays until closed. Never used for field errors.
- **ConfirmDialog**: native `<dialog>` + `showModal()`, the destructive action on the right, the cancel action first in reading order.

## 5. Deviations from project templates

| Template rule | Source shows | Proposal |
|---|---|---|
| Mark optional fields "(ไม่บังคับ)" rather than using asterisks | Asterisks on required fields | Follow the source (Q-UP-22) |
| Toast at bottom-right | Top-center | Follow the source (Q-UP-24) |
| Font IBM Plex Sans Thai (example) | Latin sans that looks like IBM Plex Sans | Decide with Q-UP-27 |
