# 2026-10-16 company-profile (UI revision 2)

- New page `/setup/company-profile` (Setup tile and Home shortcut now link to it): Details (logo upload, general information), Address, Company Currency, Company Bank Details and Terms (rich text), invoice-preview checkboxes; Setup / View / Edit modes; discard confirmation; Print and Excel disabled.
- Installed (owner-approved, exact versions ≥ 14 days old): `@tiptap/react`, `@tiptap/pm`, `@tiptap/starter-kit`, `@tiptap/extensions` 3.31.4 and `libphonenumber-js` 1.13.14 (frontend).
- Saving is not available yet: data wiring (FE-CP-009) waits for the SA bundle ([handoff](../coordination/handoffs/company-profile-sa.md)) and backend.
- Backend (SA revision 2, ADR-0021): partner module `company-profile` (one row, optimistic version, rich text stored as validated Tiptap JSON), logo as a file `storage/company-profile/logo` overwritten on upload (named volume `partner-storage`), gateway `companyProfile.*` tRPC + REST logo route; frontend wired to the real API.
- Unit tests (Vitest 5.0.3, `test/` folders): partner 76, gateway 49, frontend 40 — all pass.
- Checks: typecheck and lint pass; build not completed in the agent environment; browser not run. See [testing](../apps/frontend/company-profile/testing.md).
