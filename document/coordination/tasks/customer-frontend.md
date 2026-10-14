# Task claim: customer frontend (FE-CUS-001…017)

- Agent/vendor: senior-react-developer (frontend), launched by the parent integration owner
- Feature ID / UI revision: `customer` / 1
- SA revision (when applicable): 1 ([api-contract.md](../../apps/backend/partner/customer/api-contract.md)); used only as the shape of the fixture adapter until backend delivers `customer.*`
- Source TODO and review bundle: [document/task/todo/customer.md](../../task/todo/customer.md) FE-CUS rows; bundle `document/apps/frontend/customer/*`
- User approval evidence: owner 2026-10-14T11:45+07:00: "อนุมัติ customer ทั้งชุด ใช้ค่าแนะนำ เเต่ป้าย Default สีตัวอักษร #22C55E สีป้าย#C1EFD2" (UI rev 1 with Q-CUS-01…05 defaults; Q-CUS-06 overridden to text `#22C55E` on `#C1EFD2`)
- Branch / worktree: `feat/14-10-26-customer` (main checkout; no commit/push)
- Ownership scope from `document/coordination/ownership.yaml`: frontend-feature (`customer`, `setup`, user-permission import paths only), frontend-home (FE-CUS-003, parent-assigned), new shared UI scope `frontend/src/components/ui/**` and `frontend/src/lib/{phone.ts,trpc-error.ts}` (parent-assigned), `frontend/src/app/globals.css` tokens (parent-assigned)
- Allowed paths: `frontend/src/features/customer/**`, `frontend/src/app/setup/customer/**`, `frontend/src/components/ui/**`, `frontend/src/lib/phone.ts`, `frontend/src/lib/trpc-error.ts`, `frontend/src/features/user-permission/**` (import paths only), `frontend/src/features/setup/setup-tabs.tsx`, `frontend/src/features/home/{navigation.ts,app-shell.tsx}`, `frontend/src/app/globals.css`; TODO FE rows and `document/apps/frontend/customer/testing.md` results. NOT: backend/gateway, Docker/Compose, `package.json`/lockfile, `frontend/src/providers/**`.
- Expected output and acceptance criteria: TODO rows FE-CUS-001…017 acceptance; FE-CUS-014/015 wired after the backend handoff (2026-10-14); also `frontend/src/features/home/home-dashboard.tsx` (coordinator request: dashboard shortcut `href`)
- Dependency proposals / approved installations: none (no new packages)
- Integration-owned edits requested: none beyond the parent-assigned shared paths above
- Status: active
- Verification evidence and next handoff: recorded in [testing.md](../../apps/frontend/customer/testing.md) and the TODO

## Corrective-work ledger (when fixing a defect)

- Work ID / root-cause fingerprint / duplicate links: none opened
- Pass limit: 3 (initial fix included)
- Passes allocated: 0
- Active pass: none
