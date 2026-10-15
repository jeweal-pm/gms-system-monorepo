# Task claim: user-permission UI revision 2 frontend (ADR-0020) (FE-UP2-*)

- Agent/vendor: senior-react-developer (frontend), launched by the parent integration owner; also acts as ui-spec for the UI revision 2 documents
- Feature ID / UI revision: `user-permission` / 2
- SA revision (when applicable): ADR-0020 revision 1 (Accepted 2026-10-15). Shared contract as stated in the parent handoff (username plugin, catalog v2, `userAdmin` `email` -> `username`, Super Admin personal-info update); SA rev 1 `userAdmin.update` shape `{id, expectedUpdatedAt, name?, password?, phone?, locationKeys?, active?, permissions?}`
- Source TODO and review bundle: [document/task/todo/user-permission.md](../../task/todo/user-permission.md) section "Revision 2 (ADR-0020) frontend"; [ADR-0020](../../adr/0020-username-login-and-permission-matrix-v2.md); sources `document/apps/frontend/user-permission/source/rev2-0{1..4}-*.png`
- User approval evidence: 2026-10-15 owner: "frontend backend อนุมัติ ADR-0020" (instruction to implement revision 1)
- Branch / worktree: `feat/15-10-26-check-fix-userpermission` (main checkout; no commit/push)
- Ownership scope from `document/coordination/ownership.yaml`: frontend-feature (`user-permission`), frontend-auth (`features/auth`, `app/login`), ui-spec-docs (`document/apps/frontend/user-permission/**`), parent-assigned `frontend/src/lib/auth-client.ts` (integration-frontend-shared) and `frontend/src/components/ui/**` (additive)
- Allowed paths: `frontend/src/features/home/{account-menu.tsx,app-shell.tsx}` (parent-assigned 2026-10-15, backend deviation 6), `frontend/src/features/user-permission/**`, `frontend/src/features/auth/**`, `frontend/src/app/login/**`, `frontend/src/lib/auth-client.ts`, `frontend/src/components/ui/**`, `document/apps/frontend/user-permission/**`, own section of `document/task/todo/user-permission.md`, this claim, `document/changelog/`. NOT: backend code, Compose, `package.json`/lockfile, `frontend/src/features/{customer,vendor}/**`, other `features/home/**` files.
- Expected output and acceptance criteria: ADR-0020 observable checks 1, 2, 5, 7, 8 (frontend side); FE-UP2-* rows
- Dependency proposals / approved installations: none (`usernameClient` ships in the installed `better-auth`)
- Integration-owned edits requested: none
- Status: ready-for-integration (browser checks not run)
- Verification evidence and next handoff: recorded in the TODO revision 2 section and [testing.md](../../apps/frontend/user-permission/testing.md)

## Corrective-work ledger (when fixing a defect)

- Work ID / root-cause fingerprint / duplicate links: none opened
- Pass limit: 3 (initial fix included)
- Passes allocated: 0
- Active pass: none
- Explicit extension evidence: none
- Stop reason / missing verification / reopen evidence: none
