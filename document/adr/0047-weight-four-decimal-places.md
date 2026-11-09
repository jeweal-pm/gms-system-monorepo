# ADR-0047: Store and enter stone weight with 4 decimal places

- Status: Proposed
- Date: 2026-11-09
- Feature / source: INV-20261107-007 (typed weight loses the third decimal); owner decision 2026-11-09 "weight เก็บ 4 ตำแหน่ง"
- SA revision: 1
- Deciders: project owner; approval pending
- Approval evidence: none
- Related: [ADR-0040](0040-global-decimal-setup.md) (Decimal Setup, Q-DEC-08 typing cap), [INV-20261107-007](../task/investigation/INV-20261107-007-typed-weight-loses-third-decimal.md)

## Context

Weight (ct) is stored as `numeric(12,3)` in 22 columns of 9 tables, accepted by the API with at most 3 decimals and typed on the pages with at most `min(Decimal Setup weight places, 3)` decimals (Q-DEC-08). With weight places set to 2, a typed 0.125 becomes 0.12 and 2.415 is saved as 2.41 (INV-20261107-007). The owner decided on 2026-11-09 that weight is kept to **4 decimal places**.

## Decision (proposed)

1. **Database** (one additive migration): every weight column becomes `numeric(13,4)` — same integer range (up to 99,999,999), one more decimal. Existing values keep their value (3 → 4 decimals, e.g. 2.415 → 2.4150). Columns: `quotation_line` (weight, stock pending), `memo_out_line` (weight, returned, stock pending), `memo_out_return_line` (weight, outstanding), `memo_receive_line` (weight), `memo_return_line` (weight, outstanding), `memo_stock` (received, returned, sold, reserved, pending, purchased), `reserve_line` (weight, stock pending), `purchase_order_line` (weight, purchased), `purchase_line` (weight, sold part). CHECK constraints are unchanged (they compare values, not scales).
2. **API**: every weight input accepts up to 4 decimals (today 3); every weight output is a string with 4 decimals (today 3). Weight arithmetic (pending, outstanding, proportional fill, open value) works at 4 decimals, half-up where a value is shortened.
3. **Pages**: typing a weight allows up to **4 decimals regardless of the Decimal Setup display places** (replaces Q-DEC-08 "min(places, storage)"), so what is typed is what is stored. Display follows Decimal Setup weight places (0–4) and **rounds half-up** (0.125 at 2 places shows 0.13, never 0.12). Pcs → Weight fill keeps 4 decimals and is exact when all pieces are taken.
4. Prices and amounts are unchanged (2 / 4 decimals as today).

## Alternatives

- Keep 3 decimals in storage and only fix the display rounding: loses the owner's 4th decimal.
- Keep typing capped by the display setting: a user with 2 display places still can't enter 0.125 — the reported problem.

## Consequences and capacity

- One migration of 22 `ALTER COLUMN … TYPE numeric(13,4)` statements; on the current data sizes this rewrites small tables in seconds, under a short lock. Rollback: back to `numeric(12,3)` only while no value uses the 4th decimal.
- Contract change for every document API (weight strings gain a 4th decimal); frontend and backend ship together. Tests that compare `"x.xxx"` strings change to `"x.xxxx"`.
- No new service, package or index.

## Acceptance

- 0.125, 2.415 and 0.1234 are saved and shown back exactly (display at 4 places), and 0.125 shows 0.13 at 2 display places.
- Memo Stock, Memo Outstanding, Purchase Outstanding, merge and approve guards work at 4 decimals (existing suites updated + a 4-decimal case each).
- Stays Proposed until the owner approves this revision.
