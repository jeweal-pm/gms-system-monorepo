# Design tokens and components: vendor

- Feature ID / UI revision: `vendor` / 1
- Based on: [design-system template](../template/design-system-template.md) as a checklist, and the approved [customer design system](../customer/design-system.md), which this page matches.
- Current code values: the `gms-*` tokens in `frontend/src/app/globals.css`, including the customer additions (`gms-success-subtle`, `gms-success-text`, `gms-status-active`, `gms-field-disabled`) and the FE-UP-017 shell tokens.
- Provenance: **=CUS** = visually identical to the customer source (compared side by side, not re-sampled); **E** = estimated from the vendor images at DPR 2.

## 1. Colors

**No new tokens.** Every color in S1–S4 matches a token the customer page already uses (=CUS): primary
`#006A70` (Create button, switch, checkbox, dashed button, selected draft row), primary-strong (drawer tab),
page `#F9F9F9` (content, address item), surface, border `#EDEDED`, text tokens, danger `#DF1016` / danger-subtle
`#FAE6E4` (errors, item frame), success-subtle/success-text (Default badge, owner decision Q-CUS-06),
warning (Draft badge), status-active (dot), excel green, field-disabled (State/City).

Rule: no hex values in `features/vendor/**` or `features/partner/**`.

## 2. Typography

Font: IBM Plex Sans Thai for the whole site (owner, 2026-10-14; FE-UP-017). Sizes and weights are the
customer table (=CUS): page title 24/500, subtitle 14, card title 18/500, drawer title 16/600, subheading
14/500, item index 15/600, body 16, notched label 12/600, drawer row 14–15/600 and 14, caption 12, error 13 italic.

## 3. Spacing and sizes

Same as customer (=CUS) except the address layout:

| Element | Vendor value | Provenance |
|---|---|---|
| Invoice Address card | full content width (no Shipping card beside it) | E (S1–S4) |
| Address item body grid | **4 columns, gap ~17 px, max-width ~1220 px, left-aligned**; spans: Name/Company Name 1, Tax ID 1, Address 4, Country 2, State/Province 2, City 2, Postcode 2 | E: S1 and S2 give the same x positions with the drawer open and closed |
| Vendor Information grid | 3 columns, max-width ~1290 px (as customer) | E (S2 shows empty space on the right) |
| Address item frame | spans the full card width; red 1 px frame on error | E, =CUS |

## 4. Component rules

- **AddressItem `layout`** (new prop in FE-VEN-001): `"split"` = customer's 2-column body; `"wide"` = the
  4-column body above. Narrow fallback: 2 columns below ~900 px item width, 1 column below ~600 px (container query).
- All other component rules are the customer rules (SelectField, disabled TextField, item error frame +
  "Has errors" tag, badges, print view).

## 5. Deviations from the project template

Same as customer: asterisks for required fields, top-center toast.
