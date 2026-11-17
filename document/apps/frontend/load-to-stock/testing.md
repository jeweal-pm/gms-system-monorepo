# Frontend acceptance and verification: load-to-stock

- UI revision: 1 (draft). Commands: `pnpm --filter frontend test` (vitest) and `pnpm --filter frontend typecheck` / lint as the repo scripts define (frontend confirms at implementation).

## Automated coverage

Run 2026-11-17 on branch `feat/17-11-26-load` (frontend, Windows): `npx vitest run` → **124 files / 1,098 tests passed**; `npx eslint .` → 0 errors (2 pre-existing warnings in `auth/login-form.tsx`); `npx tsc --noEmit` → no errors in frontend sources (42 errors outside: `backend-api-master/src/location-master` against a stale generated Prisma client, and stale `.next/types`). All boundaries are the real inventory REST client (`lib/inventory-client.ts`) against a controlled `/api/inventory/v1` fetch, or static renders through the app's providers with seeded caches under the hooks' real query keys. **No live backend**: every case is contract-fixture based.

| Target / behavior | Unit case ID and test path | Integration case ID and test path | Boundary / fixture | Result |
|---|---|---|---|---|
| Merge computation (Σ, average per ct, max THB/pc, mixed units, later pick joins) | UT-LS-01 `test/load-to-stock/form.test.ts` | IT-LS-02, IT-LS-04 `load-to-stock.integration.test.ts` | design numbers 1,387,835.60 / 29.30 = 47,366.40; PU2610-038 | pass |
| Split allocation (+ Split remainder, Σ ≤ remaining, group texts) | UT-LS-02 | IT-LS-03 | 10 pcs → 7 + 3; over-allocation | pass |
| None limits, remove / mode reset, required Location / Stock / Sale Price, weight-0 rule | UT-LS-03 | IT-LS-03 | 0 / remaining / remaining+1 | pass |
| Partial-load cost (Q-LS-12) | UT-LS-04 | — | per ct and per pcs | pass |
| Mode-dialog rules, payload mapping (`toLoadInput` / `fromLoad`) | UT-LS-07 | IT-LS-02, IT-LS-06 | | pass |
| Inventory client: same-origin, envelope, 401 renew once, network / invalid response, `readDomainError` | UT-LS-06 `api.test.ts` | IT-LS-06 | controlled fetch | pass |
| Save error mapping (EXCEEDS_REMAINING rows, IN_USE, SYNC_PENDING id, LOCATION_INACTIVE, VALIDATION_ERROR incl. `currency`), photo upload | UT-LS-05 `api.test.ts` | IT-LS-06 | envelope fixtures | pass |
| Page shell, access, Duplicate off, Currency read-only / missing, approval ON/OFF, Pending locked, in-use | — | IT-LS-05 | seeded caches | pass |
| Picker P-01 (vendor filter, exclusions, remaining > 0, OK disabled, empty, Load more) | — | IT-LS-01 | | pass |
| Item table T-04, Location select with stored inactive name (FE-LS-017) | — | IT-LS-03/04 | | pass |
| PU photo copy (≤ 3 concurrent, Merge suggested line only) | — | IT-LS-06 | | pass |
| Navigation href + active prefix (FE-LS-012) | — | `load-to-stock.integration.test.ts` | | pass |
| Approve Center inventory menu: counts, pending list, version read before review, preview (FE-LS-011) | — | IT-LS-07 `platform.integration.test.ts` | | pass |
| Approval Setup merge + inventory PUT, HAS_WAITING (FE-LS-014) | — | IT-LS-08 | | pass |
| Two notification feeds, mark-read routing, two EventSources (FE-LS-015) | — | IT-LS-09 | | pass |
| Updated existing tests (Load to Stock now available) | `approve-center/{menus,counts,states}.test.ts`, `approval-setup/approval-setup.test.ts`, `notifications/model.test.ts` | `approve-center/approve.integration.test.ts`, `notifications/panel.integration.test.ts`, `approval-setup/approval-setup.integration.test.ts` | | pass |

### Pending live verification (backend not reachable yet)

FE-LS-009/010/011/014/015 and TC-LS-01…08 against the running `backend-api-inventory`: real Save / Send / Approve / Delete round trips, 409/422/503 envelopes and `syncing`, photo copy and upload, picker remaining after an applied load, Approve Center counts and pending list, Approval Setup switch, the inventory SSE stream through nginx (cookie auth, reauth, sign-out closes both streams). No screenshots: the dev stack at http://localhost:8080 was not up.

### Deviations from ui-spec / contract

- Row panel L-09 is a Load-specific panel built from the shared primitives instead of an additive `DocumentKind` in `ItemEditorPanel` (that panel is bound to Quotation lines); same fields M-01…M-12.
- Account (I-02) must be chosen before From Purchase: the public `purchase-lines/search` returns no vendor per line, so the first pick cannot auto-fill it; the picker then filters by `vendorId` (one vendor per document). The Account locks while the Load table has rows.
- Later picks show P-02 with the document's mode selected and the other cards disabled ("This document is in {mode} mode", ADR-0052 D7) rather than skipping the dialog; Merge later-pick button "Add to the merged row".
- Inventory `approval/pending` rows have no `version` (SA rev 1): approve / reject / revise read `GET /load-to-stock/{id}` first. Rows show no line count.
- Bell lists from two feeds are merged by `createdAt` page by page; a feed that fails leaves the other visible.

## Security review before handoff

| Reviewer | Source revision / changed scope | Status | Evidence / ticket IDs |
|---|---|---|---|
| `sec-auditor` | | not run | |
| `security-auditor` | | not run | |

## UI acceptance

| Case ID | TODO / component | Starting state | User actions | Expected result | Viewport / keyboard | Evidence / result |
|---|---|---|---|---|---|---|
| TC-LS-01 | FE-LS-004 P-01 | new document | From Purchase → tick 3 → OK | Mode dialog lists 3 lines; "Create 3 load rows" | desktop; Tab/Space/Enter | |
| TC-LS-02 | FE-LS-006 None | TC-LS-01 | None → Create; set row 1 pcs 7 | Item table 3 rows; load row 1 = 7 pcs; Save (OFF) → PU2610-031 line shows 3 pcs left in picker | desktop | |
| TC-LS-03 | FE-LS-007 Split | TC-LS-01 | Split → Create; + Split on group 1; 6 + 4 pcs; two locations | 2 child rows, 2 Stock IDs after apply | desktop | |
| TC-LS-04 | FE-LS-008 Merge | TC-LS-01 | Merge → Create | 1 row 40 pcs · 29.30 ct · 47,366.40 THB/ct · 1,387,835.60; details from PU2610-038; pcs/weight locked | desktop | |
| TC-LS-05 | FE-LS-009 approval ON | setting ON | Save → Send to approve | Draft grey → Pending orange, locked; PU remaining unchanged until Approve | desktop | |
| TC-LS-06 | FE-LS-004 | line fully loaded | open picker | line no longer listed (remaining 0) | desktop | |
| TC-LS-07 | FE-LS-009 | approval OFF, stock used | open saved load | Edit/Delete disabled with reason | desktop | |
| TC-LS-08 | P-01/P-02 | dialog open | Esc / ✕ | closes; focus returns to From Purchase | keyboard | |
