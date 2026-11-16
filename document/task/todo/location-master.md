# TODO: location-master (UI rev 1 + SA rev 1)

- Status: **done** 2026-11-16 (approved the same day) — one owner approval covers this TODO, the [ui-spec](../../apps/frontend/location-master/ui-spec.md), the [SA bundle](../../apps/backend/master/location-master/architecture.md) and [ADR-0052](../../adr/0052-location-master.md).
- Approval: owner "อนุมัติ" in chat, 2026-11-16 (Q-LM-01…05 take their defaults)
- Order: backend BE-LM-001…004 → frontend FE-LM-001…004 → FE-LM-005 reviews.
- Implementation note: optimistic locking uses `updatedAt` / `expectedUpdatedAt` and a taken name is `LOCATION_NAME_TAKEN` (409), like the other masters; the [contract](../../apps/backend/master/location-master/api-contract.md) is updated.

| Done | ID | Owner | Task | Depends on | Acceptance |
|---|---|---|---|---|---|
| [x] | BE-LM-001 | backend (master) | Migration `20261116090000_location_master` (table, unique lower(name), CHECKs, seed from PO / Purchase lines) + Prisma model | approval | IT-LM-B01 |
| [x] | BE-LM-002 | backend (master) | `locationMaster` service + router (list/get/create/update/delete), `MasterMenu` `location-master`, errors | BE-LM-001 | UT-LM-B01…03, IT-LM-B02 |
| [x] | BE-LM-003 | backend (master) | `purchaseOrder.options` / `purchase.options` add `locations`; manual-line check SA-LM-05 in both services | BE-LM-001 | UT-LM-B04, IT-LM-B03 |
| [x] | BE-LM-004 | backend | tests (backend suite with DB: all pass except the pre-existing host body-parser IT-BP-M01); reviews run with FE-LM-005 on the final revision | BE-LM-002/003 | suites pass |
| [x] | FE-LM-001 | frontend | `features/location-master` page (Stone Master › Size layout: header, card Name + Active, drawer, duplicate, print, delete), route `/setup/location-master` | BE-LM-002 | UT-LM-01/02, IT-LM-01 |
| [x] | FE-LM-002 | frontend | Master Code tile → real link; breadcrumbs; menu key; Setup context panel | FE-LM-001 | UT-LM-03 |
| [x] | FE-LM-003 | frontend | PO + Purchase kinds: Location dropdown from `options.locations` (keeps a stored value), field error mapping | BE-LM-003 | UT-LM-04, IT-LM-02 |
| [x] | FE-LM-004 | frontend | tests (frontend 120 files / 1042 pass, tsc, lint); browser check: page + drawer list A / Safe, PO row Location dropdown | FE-LM-001…003 | suites pass |
| [x] | FE-LM-005 | parent | both security reviews on the final revision (2026-11-16): sec-auditor and security-auditor clear, no ticket; their two correctness notes fixed in the same pass (list cursor ≤ 400 for long Thai names; duplicate check `lower(name) = lower($1)` instead of a possible ILIKE) with regression tests | all | no open finding |
