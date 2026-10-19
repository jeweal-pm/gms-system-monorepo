# Testing: stone-master (UI revision 1)

Unit tests live in `frontend/test/stone-master/` (Vitest 5.0.3, Node), as in the other features. The backend tests are listed in the SA bundle.

## Unit (frontend)

| ID | Covers |
|---|---|
| UT-SM-01 | `kinds.ts`: 9 pages, slugs, labels, unknown slug rejected |
| UT-SM-02 | Schemas: code format/uppercase, name length, HSN digits, sizes 1–100, stone code manual rules |
| UT-SM-03 | `buildAutoCode`: order respected, empty optional parts skipped, empty → "" |
| UT-SM-04 | `moveItem`: up/down at the edges, renumbering |
| UT-SM-05 | Size options limited to the chosen shape; changing the shape clears an invalid size |
| UT-SM-06 | Contract → view model (row secondary text per page); form ↔ input mapping (uppercase, null HSN) |
| UT-SM-07 | Error mapping for every code in [error-handling](error-handling.md) |
| UT-SM-08 | Navigation: Stone Master group/children visible only with `stone-master:VIEW`; Master Code tile links to `stone-group` |
| UT-SM-09 | Partner regressions: generalized header/drawer keep vendor/customer labels (existing partner tests stay green) |

## Manual (TC)

| ID | Steps → expected |
|---|---|
| TC-SM-01 | Master Code → Stone Master → Stone Group page, Add mode, drawer open (S1) |
| TC-SM-02 | Create, edit, duplicate (code cleared) and delete a Stone Group; the list and badge update |
| TC-SM-03 | Duplicate code (any case) → "This code is already used" |
| TC-SM-04 | Stone Name: the group select shows "DIA · Diamond"; HSN validation; the drawer subtitle format |
| TC-SM-05 | Shape: pick several sizes as chips, remove one with ×; at least one is required |
| TC-SM-06 | Stone Code Auto: choose the parts → the code is built live in order; reorder by mouse and by keyboard → the code follows |
| TC-SM-07 | Switch to Manual, edit the code, save; switching back to Auto replaces the code |
| TC-SM-08 | Size disabled until a Shape is chosen; changing the shape clears a size it doesn't have |
| TC-SM-09 | Delete a group used by a stone name → the in-use message; deactivate instead |
| TC-SM-10 | VIEW-only user: the menus are visible, every button is disabled, and the Add page is read-only |
| TC-SM-11 | User without `stone-master:VIEW`: no Stone Master menu, tile or route access |
| TC-SM-12 | Two tabs edit the same record → the second save shows the conflict banner |
