# 2026-11-03 decimal-setup backend (BE-DEC-001…005)

- api-master: new table `partner.decimal_setup` with a single row, seeded at 2/2 (migration `20261103090000_decimal_setup`), module `src/decimal-setup/`, and tRPC `decimalSetup.get` and `decimalSetup.save`.
  - `get`: any signed-in, licensed user can call it.
  - `save`: needs `decimal-setup:EDIT` plus CSRF, and uses an optimistic version (409 `DECIMAL_SETUP_CHANGED` on a stale version).
- api-master: `requireMasterSession` and the `signedIn()` middleware are used only by `decimalSetup.get`. `requireMasterGrant` now reuses `requireMasterSession` and keeps the same check order.
- auth: new catalog leaf `decimal-setup` (VIEW, EDIT), which makes 42 leaves and 360 cells. Migration `20261103090000_decimal_setup_grants` copies Document Setup VIEW/EDIT grants once and is idempotent (owner Q-DEC-14).
- Server validation and totals are unchanged (SA-DEC-05). The setting only affects frontend display and keyboard entry.
- Handoff: [decimal-setup-backend](../coordination/handoffs/decimal-setup-backend.md). Tests: [testing](../apps/backend/master/decimal-setup/testing.md).
- Owner change Q-DEC-08 (2026-11-03): weight and price places both 0–4 (display and typing only). New migration `20261103120000_decimal_setup_places_max_4` widens the two range CHECKs; the committed first migration is unchanged. Zod maxima are now 4/4. Storage, document validation and server totals are unchanged.
