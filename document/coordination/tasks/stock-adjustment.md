# Task claim: stock-adjustment

- Feature ID / revision: `stock-adjustment`, UI rev 1 / SA rev 1
- Source TODO and review bundle: `document/task/todo/stock-adjustment.md`; approved SA bundle, UI specification, ADR-0059 and `document/coordination/handoffs/stock-adjustment-sa.md`
- User approval evidence: owner approved UI rev 1 + SA rev 1 + ADR-0059 defaults on 2026-11-24; current direct instruction: “backend ทำ stock-adjustment ตาม document/coordination/handoffs/stock-adjustment-sa.md เริ่มจาก BE-SAJ-001 แล้วต่อ frontend จนจบ TODO”
- Branch / worktree: `dev` at `9357bcc`; existing unrelated worktree changes are preserved
- Ownership scope from `document/coordination/ownership.yaml`: backend service `backend-api-inventory`; frontend feature `stock-adjustment`; parent owns integration-listed shared files
- Allowed paths: as listed in the stock-adjustment handoff and central TODO
- Expected output and acceptance criteria: complete BE-SAJ-001…008, then FE-SAJ-001…009, with recorded test/security/manual-test evidence and completion record
- Dependency proposals / approved installations: no new package; use installed stack
- Integration-owned edits requested: serialize the handoff-listed shared backend/frontend files through parent integration owner
- Status: needs-validation
- Verification evidence: backend focused tests passed 9/9; local dev migrations deployed and `prisma migrate status` is up to date; frontend full suite passed 1,400/1,400. Both focused security roles were applied sequentially by the parent from their definitions because dedicated custom review agents are unavailable; on the same dirty source snapshot based at `9357bcc`, both returned **clear** for the Stock Adjustment trust boundaries inspected. Scope included authenticated route registration, grants and CSRF, strict bounded schemas/body cap, parameterized SQL and cursor handling, stock apply/reverse transactions and version guards, notification recipient scoping, and frontend API/rendering boundaries. No actionable finding or investigation ticket was created by either security review. Evidence limit: static source review only; no live auth/browser checks were claimed.
- Manual test: [customer report](../../testing/user-check/2026-11-24-stock-adjustment.md); unavailable because the GMS frontend and nginx containers were stopped and host port 3000 was occupied by another local project.
- Full backend suite: unresolved under [INV-20261124-001](../../task/investigation/INV-20261124-001-stock-adjustment-inventory-suite.md); focused Stock Adjustment PostgreSQL tests passed, but the broader inventory suite did not.
- Verification evidence and next handoff: BE-SAJ-001…007 and FE-SAJ-001…008 are checked in the TODO. Keep BE-SAJ-008 and FE-SAJ-009 unresolved until the full inventory suite can pass and the customer UI flows can be opened for manual verification; then write the completion report.
