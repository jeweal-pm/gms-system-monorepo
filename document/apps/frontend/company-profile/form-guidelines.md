# Form guidelines: company-profile

- UI revision: 2 (approved). Follows the [project form guidelines](../template/form-login-guildlines.md) and the partner form behaviour (C).

## Timing

- No error is shown while the user is still typing for the first time. A field is first validated on blur.
- After a field has shown an error, it re-validates on every change.
- Save validates every field, then scrolls to and focuses the first invalid field (in section order; the logo and editors included).
- Save is disabled only while saving (shows a spinner), never because the form is invalid.

## Fields

| Field | Required | Rule (length limits are set by SA) | Input attributes |
|---|---|---|---|
| Company Logo | no | JPEG or PNG (checked again on the server by signature); size ≤ **10 MB** (owner) | `accept="image/jpeg,image/png"` |
| Name/Company Name | yes | trimmed, 1–200 | `autocomplete="organization"` |
| Tax ID | no | trimmed; no format rule (Q-CP-09) | `inputMode="numeric"` not forced (letters allowed) |
| Contact Person Name | yes | trimmed, 1–200 | `autocomplete="name"` |
| Phone No. | yes | existing `PhoneField` input; valid for the chosen country by libphonenumber-js `isValidPhoneNumber` (DEP-CP-02) | `type="tel"`, `inputMode="tel"` |
| Email | yes | valid email, ≤ 254 | `type="email"`, `autocomplete="email"` |
| Website | no | `http(s)://` URL; a bare domain gets `https://` added on blur | `type="url"`, `autocomplete="url"` |
| Address | yes | trimmed, 1–300 | `autocomplete="address-line1"` |
| Address Line 2 | no | ≤ 300 | `autocomplete="address-line2"` |
| Country | yes | must be in the options list | select |
| State/Province | yes | trimmed; disabled until a Country is chosen; clearing the Country clears it | `autocomplete="address-level1"` |
| City | yes | as State | `autocomplete="address-level2"` |
| Postcode | yes | trimmed, ≤ 20; no format rule | `autocomplete="postal-code"` |
| Currency | yes | must be in the options list | select |
| Bank Details | no | ≤ SA limit (default 5,000 characters of text) | editor |
| Terms and Conditions | no | ≤ SA limit (default 10,000 characters of text) | editor |
| Show … on Invoice preview (×2) | — | boolean, default off | checkbox |

Every field has a visible label (placeholders never replace labels). The editors are labelled by their section title (`aria-labelledby`).
