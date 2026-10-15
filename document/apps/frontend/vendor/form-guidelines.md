# Form guidelines applied: vendor

- Feature ID / UI revision: `vendor` / 1
- Project guideline: [form guidelines template](../template/form-login-guildlines.md)
- Field rules: **proposed** to mirror Customer ([ADR-0018](../../../adr/0018-customer-master-partner-service.md) §3 and the [customer form guidelines](../customer/form-guidelines.md)) without Shipping. They become binding only when SA approves the `vendor.*` contract (SA-VEN-03); the client then mirrors the approved rules exactly. Client validation is UX only.
- Related: [ui-spec.md](ui-spec.md), [error-handling.md](error-handling.md), [data-fetching.md](data-fetching.md)

## Vendor fields

All text values are trimmed before validation and before sending.

| Field (label, Q-VEN-01 default) | Required | Proposed rule | Attributes | Error text |
|---|---|---|---|---|
| Code Name | No | ≤ 120; empty → `null`; unique case-insensitive among vendors (server only) | `autoComplete="off"` | "Code name must be at most 120 characters"; server: "This code name is already in use" |
| Name \* | Yes | 1–200 | `autoComplete="organization"` | "Name is required" / "… at most 200 characters" |
| Currency \* | Yes | ISO 4217 code from the options | `SelectField` | "Currency is required" |
| Active | n/a | boolean, default on | `role="switch"` | — |
| First name \* | Yes | 1–100 | `autoComplete="given-name"` | "First name is required" |
| Middle name | No | ≤ 100 | `autoComplete="additional-name"` | "… at most 100 characters" |
| Last name | No | ≤ 100 | `autoComplete="family-name"` | "… at most 100 characters" |
| Phone No. | No (Q-VEN-02 answer) | Customer phone rule (US/TH, digits only, ≤ 15 digits, E.164); empty → `null` | `type="tel"`, `inputMode="numeric"`, `autoComplete="tel-national"` | "Enter a valid phone number" / "Phone No. must be at most 15 digits" (+ "Phone No. is required" if required) |
| Email \* | Yes | 1–254, email format, lower-cased; not unique | `type="email"`, `autoComplete="email"` | "Email is required" / "Enter a valid email address" |

Error copy matches S3 ("Name is required", "Currency is required", "First Name is required" → "First name is required" per Q-VEN-01, "Email is required").

## Invoice address fields (per item)

| Field | Required | Rule | Attributes | Error text |
|---|---|---|---|---|
| Name/Company Name | Yes | 1–200 | `autoComplete="billing organization"` | "Name/Company Name is required" (S3) |
| Tax ID | No | ≤ 32 | `autoComplete="off"` | "Tax ID must be at most 32 characters" |
| Address | Yes | 1–500, single line | `autoComplete="billing street-address"` | "Address is required" |
| Country | Yes | ISO 3166-1 alpha-2 from the options | `SelectField`, `autoComplete="billing country"` | "Country is required" |
| State/Province | Yes | 1–100; disabled until a Country is chosen; required error only once a Country is chosen (S3 shows no error on it) | `autoComplete="billing address-level1"` | "State/Province is required" |
| City | Yes | 1–100; same enabling rule. **Note:** S3 shows "City is required" while Country is empty, but State/Province does not show an error. The UI follows the customer rule (neither shows an error until a Country is chosen) so the two fields behave the same. | `autoComplete="billing address-level2"` | "City is required" |
| Postcode | Yes | 1–20 | `autoComplete="billing postal-code"` | "Postcode is required" |
| Set as default address | exactly one | see below | `LabeledCheckbox` | — |

## List rules (proposed, SA-VEN-03)

- 1 to 10 invoice addresses; a new form starts with one. Item #1 has no trash icon.
- Default (Q-VEN-03 answer, revision 2): **optional, at most one.** New items, including #1 of a new form, start unchecked. Ticking one unticks the others; the ticked one can be unticked; removing the default leaves no default. Saving with no default is valid (no error, no red frame). The "Default" badge shows only on the ticked item.
- "Add another invoice address" is disabled at 10 with helper "Up to 10 invoice addresses".

## Timing and modes

Same as customer: first check on blur, then on change; submit validates all, expands items with errors and
focuses the first invalid field in visual order (Code Name → … → Email → Invoice #1…#n). The primary button
is disabled only while submitting (`Creating...` / `Saving...`).

| Mode | Title | Primary | Fields |
|---|---|---|---|
| Draft (ADD) | "Add Vendor" | Create Vendor | editable |
| Saved, EDIT | "Edit Vendor" | Save | editable |
| Saved, no EDIT | "Vendor" | none | read-only |
