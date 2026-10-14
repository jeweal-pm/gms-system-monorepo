# Form guidelines applied: customer

- Feature ID / UI revision: `customer` / 1
- Project guideline: [form guidelines template](../template/form-login-guildlines.md) (error timing, submit button, input restriction, attributes)
- Field rules: **[ADR-0018](../../../adr/0018-customer-master-partner-service.md) §3, mirrored exactly**. Client validation is UX only; the partner service validates again.
- Related: [ui-spec.md](ui-spec.md), [error-handling.md](error-handling.md), [data-fetching.md](data-fetching.md)

## Customer fields

All text values are trimmed before validation and before sending. Lengths are counted after trimming.

| Field (label) | Required | Rules (client = ADR) | Attributes | Error text (proposal; the design shows "Error message") |
|---|---|---|---|---|
| Code Name | No | ≤ 120; empty → sent as `null`; unique case-insensitive (**server only**) | `autoComplete="off"`, `maxLength` not set (type, then show the error) | "Code name must be at most 120 characters"; server: "This code name is already in use" |
| Name \* | Yes | 1–200 | `autoComplete="organization"` | "Name is required" / "Name must be at most 200 characters" |
| Currency \* | Yes | one of `customer.options.currencies[].code` (ISO 4217) | `SelectField` | "Currency is required" |
| Active | n/a | boolean, default **on** | `role="switch"` | — |
| First name \* | Yes | 1–100 | `autoComplete="given-name"` | "First name is required" / "… at most 100 characters" |
| Middle name | No | ≤ 100 | `autoComplete="additional-name"` | "Middle name must be at most 100 characters" |
| Last name | No | ≤ 100 | `autoComplete="family-name"` | "Last name must be at most 100 characters" |
| Phone No. | No | Empty is allowed (sent as `null`). If a number is entered: the user-permission rule — digits/spaces only (non-digits blocked), ≤ 15 digits, leading trunk `0` dropped, result matches E.164 `^\+[1-9]\d{6,14}$`; sent as `{ country, e164 }` | `type="tel"`, `inputMode="numeric"`, `autoComplete="tel-national"`; selector `autoComplete="tel-country-code"` | "Enter a valid phone number" / "Phone No. must be at most 15 digits" |
| Email \* | Yes | 1–254, email format, sent lower-cased; **not** unique | `type="email"`, `inputMode="email"`, `autoComplete="email"` | "Email is required" / "Enter a valid email address" / "Email must be at most 254 characters" |

## Address fields (per item)

| Field | Invoice | Shipping | Rules | Attributes | Error text |
|---|---|---|---|---|---|
| Name/Company Name (Invoice) / Name (Shipping) | \* | \* | 1–200 | `autoComplete="organization"` (invoice) / `"name"` (shipping) | "Name is required" / "… at most 200 characters" |
| Tax ID | optional | — (not shown, not sent) | ≤ 32, free text | `autoComplete="off"` | "Tax ID must be at most 32 characters" |
| Address \* | \* | \* | 1–500 (single-line input as in the design; a textarea is not proposed) | `autoComplete="street-address"` | "Address is required" / "… at most 500 characters" |
| Country \* | \* | \* | one of `customer.options.countries[].code` (ISO 3166-1 alpha-2) | `SelectField`, `autoComplete="country"` | "Country is required" |
| State/Province \* | \* | \* | 1–100; **disabled until Country is chosen**; the required error is shown only when a Country is chosen | `autoComplete="address-level1"` | "State/Province is required" / "… at most 100 characters" |
| City \* | \* | \* | 1–100; same enabling rule | `autoComplete="address-level2"` | "City is required" / "… at most 100 characters" |
| Postcode \* | \* | \* | 1–20, free text (international formats) | `autoComplete="postal-code"` | "Postcode is required" / "… at most 20 characters" |
| Set as default address | exactly one per type | exactly one per type | see below | `LabeledCheckbox` | — (enforced by the UI) |

`autoComplete` values are prefixed with `billing` / `shipping` sections (for example `billing street-address`) so browsers do not mix the two address types.

## List rules (ADR §3)

- Each type has **at least 1 and at most 10** items. A new form starts with one Invoice and one Shipping item.
- Item #1 of each type **cannot be removed** (no trash icon). Items #2+ can be removed.
- Exactly **one default per type**: the first item starts as default; checking another moves the default; the default cannot be unchecked; removing the default makes #1 the default. The schema still checks "exactly one" as a safety net.
- "Add another … address" is disabled at 10, with the helper "Up to 10 {invoice|shipping} addresses".
- Positions are sent in display order (1…n).

## Timing (project guideline)

- No errors while first typing; first check on blur; after an error is shown, re-check on every change.
- Submit validates everything. Before focusing, **expand every collapsed item that contains an error**, then move focus (and scroll) to the first invalid field in visual order: Code Name → Name → Currency → First name → Middle name → Last name → Phone No. → Email → Invoice #1…#n (Name/Company, Tax ID, Address, Country, State, City, Postcode) → Shipping #1…#n.
- The Create Customer / Save button is **not** disabled for an invalid form. It is disabled only while submitting and shows `Creating...` / `Saving...`.
- Enter in a text field submits the form (native form behavior); Enter on a select does not.

## Modes

| Mode | Title | Primary | Fields |
|---|---|---|---|
| Draft (ADD) | "Add Customer" (S1) | Create Customer | editable |
| Saved, user has EDIT | "Edit Customer" (proposal, Q-CUS-03) | Save | editable; Code Name editable (uniqueness checked by the server) |
| Saved, no EDIT | "Customer" (proposal) | none | read-only (`readOnly` inputs, disabled selects, switch `aria-readonly`, no add/remove/default changes) |

Dirty state = RHF `isDirty` (compared with the values loaded or the empty draft). It drives the discard confirmation (FE-CUS-010).
