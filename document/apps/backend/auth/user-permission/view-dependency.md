# Permission rule: every action needs VIEW (user-permission, SA addendum)

- Date: 2026-10-17. Owner request (verbatim): "sa ช่วยคิด logic User and Permission เวลาติ้กหน่อยหากเลือก ADD or EDIT or DELETE or CANCEL or APPROVE or PRICE or PRINT or EXCEL ต้องได้รับสิทธิ์ VIEW อะไรแบบนี้ คิดเสร็จ ให้ frontend ทำต่อและสรุปทุกอย่างมาให้ฉัน"
- Scope: the permission matrix of Setup › User and Permission (catalog v2, [ADR-0020](../../../../adr/0020-username-login-and-permission-matrix-v2.md)). SA run inline by the parent.
- Status: **VD-01…VD-05 approved by the owner's instruction above** (frontend only, no contract change). **VD-06 proposed** (backend change, needs separate approval).

## Why

Every page loads only with `<menu>:VIEW` (e.g. the Partner/Company Profile access guards and `permittedProcedure(menu, "VIEW")` for reads). A user with `EDIT` but no `VIEW` can never reach the edit screen, so such a grant is meaningless and confusing. Every leaf in catalog v2 has a VIEW action (Dashboard: VIEW/APPROVE/PRICE/PRINT/EXCEL; all others: the nine actions).

## Decisions

| ID | Rule | Example |
|---|---|---|
| VD-01 | Turning **on** any action other than VIEW on a menu also turns on that menu's **VIEW**. | Tick EDIT on Company Profile → VIEW and EDIT are ticked. |
| VD-02 | Turning **off** VIEW on a menu also turns **off every other action** of that menu (a menu without VIEW keeps nothing). | Untick VIEW on Company Profile (with VIEW, EDIT) → both cleared. |
| VD-03 | Aggregate checkboxes (the **Select All** row, a **group** row such as Master Code, an action column on those rows) apply VD-01/VD-02 to every menu they change. | Group row "Master Code" EDIT on → EDIT and VIEW on for all 7 sub-menus. Select All row VIEW off → all permissions off. |
| VD-04 | Turning off a non-VIEW action never changes VIEW. | Untick EDIT → VIEW stays. |
| VD-05 | Saved users are shown exactly as stored (no silent change on load). The rule applies to the cells the admin changes; saving then sends a consistent set. A short hint under the Permissions header explains the rule. | — |
| VD-06 (**proposed**) | The auth service also enforces it on create/update: grants are normalized by adding `<menu>:VIEW` for every `<menu>:<action>` received (no error), so API clients other than this page cannot store a grant without VIEW. Existing rows without VIEW are reported by a one-off read-only query; no automatic data change. | Requires an auth change (`user-admin` create/update), tests and an updated contract note: approve "VD-06" to start. |

## Frontend implementation

`toggleCells(keys, values, leaves)` in `frontend/src/features/user-permission/permission-utils.ts` replaces the plain toggle for every matrix checkbox (leaf cell, group/section/Select All aggregates); `permission-matrix.tsx` passes the leaves of the clicked row. Unit tests UT-UP-F10…F16 in `frontend/test/user-permission/permission-utils.test.ts`.

## Not changed

Catalog, API contract, stored grants of existing users, the 347 applicable cells, Super Admin (always all, locked).
