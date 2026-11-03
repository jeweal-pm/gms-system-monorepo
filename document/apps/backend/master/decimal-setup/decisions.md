# SA decisions: decimal-setup SA revision 1

- Feature ID / SA revision / source UI revision: `decimal-setup` / 1 / UI rev 2 (parent, in preparation: [ui-spec](../../../frontend/decimal-setup/ui-spec.md))
- Status: **pending-review** (2026-11-03). Approval: none.
- ADR: [ADR-0040](../../../../adr/0040-global-decimal-setup.md). TODO: [decimal-setup.md](../../../../task/todo/decimal-setup.md) revision 2. Questions: [open-questions.md](../../../frontend/decimal-setup/open-questions.md) Q-DEC-08…18.
- Service: `backend-api-master` (schema `partner`). Auth catalog change in `backend-api-auth`. No new service, container, network, volume, variable or package.

| ID | Decision |
|---|---|
| SA-DEC-01 | Single row `partner.decimal_setup` (id smallint = 1, `weight_places` 0–4, `price_places` 0–4 (owner Q-DEC-08 change, migration `20261103120000_decimal_setup_places_max_4`), `version` ≥ 1, `updated_by` nullable, `updated_at`), seeded 2/2 by migration `20261103090000_decimal_setup` (expand-only). |
| SA-DEC-02 | **Changed by the owner 2026-11-03 (Q-DEC-08: "ให้ max decimal ที่ 4", "Choose 0–4, but show only")**: weight and price both 0–4, a display/typing setting only. Storage scales (`numeric(12,3)` weight, `numeric(18,2)` money), trade-document zod (`weightCt` decimal(5,3), money decimal(16,2)) and the 2-dp server totals do not change; no column widening. Originally: weight ≤ 3, price ≤ 2. |
| SA-DEC-03 | `decimalSetup.get` (signed in + licensed + current authorization, no grant) → `{setup}`; `decimalSetup.save({weightPlaces, pricePlaces, expectedVersion})` (`decimal-setup:EDIT` + CSRF) → `{setup}`; stale version → `DECIMAL_SETUP_CHANGED` 409. |
| SA-DEC-04 | New auth catalog leaf `decimal-setup` "Decimal Setup" under SETUP after Document Setup, actions VIEW and EDIT: 42 leaves / 360 cells. `MasterMenu` gains `decimal-setup`. Owner changed Q-DEC-14: grants copied once from `document-setup` (auth migration `20261103090000_decimal_setup_grants`). |
| SA-DEC-05 | The setting is a display + keyboard-entry rule. Server validation stays at storage scale and server totals stay half-up 2 dp; stored documents are not rewritten (Q-DEC-10/11). |
| SA-DEC-06 | Unaffected: pcs, percentages, exchange rates, currency rates, stored precision of `net_unit_price`/`discount_value` (Q-DEC-12). |
| SA-DEC-07 | Frontend: `DecimalSetupProvider` in the App Shell, `useNumberFormat()`, one exact formatter module with explicit places; fallback 2/2 on error; delete `gms.decimal-setup.v1` (Q-DEC-15…18). |
