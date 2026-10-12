# Open Questions

This page tracks decisions that still need an owner before production.

## Resolved login and password decisions

- Initial passwords (CRM-supplied since [ADR-0015](adr/0015-remove-forgot-password-and-email.md)) do not expire; users may change them from their profile. See [ADR-0011](adr/0011-change-password-via-profile-page.md).
- Open: an admin password-reset tool for users who forget their password needs its own ADR; ADR-0015 removed forgot password.
- Profile password changes require the current password. The implementation and [API contract](spec/0001-api-contract.md) follow this decision.

## Privacy details before production

- No analytics or marketing tracking is currently planned or loaded. The app currently uses only authentication/session cookies; no consent banner or consent log is implemented.
- Identify the DPO/privacy owner and privacy policy URL, and confirm whether the app will be public-facing before production.
- If non-essential cookies or third-party tracking are introduced later, review [ADR-0009](adr/0009-cookie-consent-approach.md) and the [cookie specification](spec/0004-cookie-and-consent.md) before loading them.
