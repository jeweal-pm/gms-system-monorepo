# 2026-10-16 Partner Code Name required + running-number suggestion — backend (ADR-0021, BE-CUS-016…022, BE-VEN-016…022)

- `code` is required on `customer.create/update` and `vendor.create/update` at the gateway and in partner POST/PUT. It is trimmed and must be 1–120 characters.
  - Empty input → `VALIDATION_ERROR` `{path:"code",code:"required"}`.
  - Missing or `null` → `invalid_type`.
  - `*_CODE_TAKEN` is unchanged.
- New `customer.nextCode` / `vendor.nextCode` tRPC queries (no input, `ADD` permission) → `{code:"C001"}` / `{code:"V001"}`.
  - They call the new partner routes `GET /internal/v1/{customers,vendors}/next-code`, which are declared before `/:id`.
  - The value is max numeric suffix + 1, computed in SQL as bigint; suffixes are capped at 18 significant digits.
- Gateway `describeError` now reports zod custom issues by `params.code`.
- Migration `20261016090000_partner_code_required` backfills NULL codes with the running number in `created_at, id` order, then makes `code`/`code_key` NOT NULL. No data was lost; the dev DB had no NULL rows.
- New `node:test` suites, with no new dependency:
  - `backend-api-partner/test/*.test.mjs`: 37/37 pass.
  - `backend-api-gateway/test/*.test.mjs`: 23/23 pass.
  - Partner and gateway typecheck/lint pass.
- Security reviews are pending (parent). Handoff: `document/coordination/handoffs/partner-code-adr0021-backend.md`.
