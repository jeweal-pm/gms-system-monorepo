# Frontend acceptance and verification: load-to-stock

- UI revision: 1 (draft). Commands: `pnpm --filter frontend test` (vitest) and `pnpm --filter frontend typecheck` / lint as the repo scripts define (frontend confirms at implementation).

## Automated coverage

| Target / behavior | Unit case ID and test path | Integration case ID and test path | Boundary / fixture | Command and result |
|---|---|---|---|---|
| Merge computation (Σ, average per ct, suggested details from max THB/pc) | UT-LS-01 `features/load-to-stock/form.test.ts` | — | design numbers: 650,876 + 340,569.60 + 396,390 = 1,387,835.60; ÷ 29.30 = 47,366.40; max 66,065 THB/pc → PU2610-038 | not run |
| Split allocation (+ Split remainder, Σ ≤ remaining) | UT-LS-02 same file | IT-LS-03 `load-table.test.tsx` | 10 pcs → 7 + 3; over-allocation error | not run |
| None row limits (pcs/weight ≤ remaining) | UT-LS-03 | IT-LS-04 | 0, remaining, remaining+1 | not run |
| Partial-load amount (Q-LS-12) | UT-LS-04 | — | per ct and per pcs | not run |
| Picker excludes rows on the document, OK disabled until ticked | — | IT-LS-01 `purchase-line-picker.test.tsx` | typed fixtures | not run |
| Mode dialog: labels per mode; Merge disabled only below 2 lines (mixed units allowed); Back to list keeps ticks; later picks reuse the document mode; the mode changes only after the Load table is emptied | — | IT-LS-02 `load-mode-dialog.test.tsx` | 1 line / mixed units / second pick | not run |
| Approval ON/OFF buttons, locked when Pending, in-use disables Edit/Delete | — | IT-LS-05 `LoadToStockPage.test.tsx` | `requireApproval` true/false | not run |
| Save payload mapping (header `mode`, row `sources`, required `stockPrice`/`salePrice`, `photoIds`) | UT-LS-05 `api.test.ts` | IT-LS-06 | SA contract fixtures | blocked on SA |

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
