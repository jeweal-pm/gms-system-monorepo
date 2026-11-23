# Task claim: stock-card frontend

- Agent/vendor: frontend (senior-react-developer), invoked by the parent
- Feature ID / UI revision: `stock-card` / UI 1
- SA revision (when applicable): 1 (pending-review; ADR-0056, api-contract `/api/inventory/v1/stock-card`)
- Source TODO and review bundle: [todo/stock-card.md](../../task/todo/stock-card.md) FE-SC-001…014; [apps/frontend/stock-card/](../../apps/frontend/stock-card/)
- User approval evidence: owner "frontend ทำ ui ต่อได้เลย" (2026-11-23), relayed by the parent as approval of UI revision 1 with the ui-spec defaults and SA-revision-1 scope; SA bundle approval is separate and not claimed
- Branch / worktree: current checkout, `feat/23-11-26-stock-card`; no commit
- Ownership scope from `document/coordination/ownership.yaml`: `frontend-feature` (`frontend/src/features/stock-card/**`, `frontend/src/app/(app)/report/**`) plus the serialized shared files below, edited on the parent's instruction
- Allowed paths: `frontend/src/features/stock-card/**`, `frontend/src/app/(app)/report/stock-movement/**`, `frontend/test/stock-card/**`, `frontend/src/features/home/navigation.ts`, `frontend/src/app/globals.css`, `frontend/src/features/trade-document/picker-ui.tsx`, `frontend/src/features/memo-outstanding-vendor/components/customize-view-panel.tsx` (one `export`), the tests that assert them, `document/apps/frontend/stock-card/testing.md`, `document/task/todo/stock-card.md`, `document/changelog/`. No `backend-*` file touched.
- Expected output and acceptance criteria: FE-SC-001…013 as in the TODO; tests pass; typecheck and eslint clean
- Dependency proposals / approved installations: none (no new package)
- Integration-owned edits requested: none by this agent. `document/task/index.md` and `document/task/frontend-latest.md` are left to the parent (status of `stock-card` changes from pending-review to in progress / implemented).
- Status: ready-for-integration (UI done; live-contract check waits for BE-SC-009; FE-SC-014 reviews and manual test not started)
- Verification evidence and next handoff: [testing](../../apps/frontend/stock-card/testing.md) "Results recorded 2026-11-23". Next: parent routes the final changed code once to `sec-auditor` and `security-auditor`, runs manual-tester, and has frontend do the read-only live-contract check after backend BE-SC-009.

## Corrective-work ledger (when fixing a defect)

None: no defect was fixed in this pass; no pass allocated.
