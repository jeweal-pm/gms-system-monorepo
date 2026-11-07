# Frontend acceptance and verification: approve-center

- UI revision: 1 (approved 2026-11-07)
- Reference: [source/01](source/01-approve-quotation-empty.png), [source/02](source/02-approve-reserve-pending.png), desktop 1920×1080
- TODO: [task/todo/approve-center.md](../../../task/todo/approve-center.md); API: existing per-document procedures (phase 1); SA: phase 2 in progress ([handoff](../../../coordination/handoffs/approve-center-sa.md))

## Automated coverage (phase 1, run 2026-11-07)

Files under `frontend/test/approve-center/`; fixtures (source 02 rows) in `fixtures.ts`. Integration cases render through the app's provider stack (React Query + auth/master tRPC) and send calls through the real tRPC link and CSRF fetch wrapper to a controlled `/api/master/trpc` server.

| Target / behavior | Unit case | Integration case | Boundary / fixture | Command and result |
|---|---|---|---|---|
| `menus.ts` registry: 11 items in the sidebar order (Q-AP-03), availability, leaf, party, document links, search placeholders | UT-AP-01 `menus.test.ts` | IT-AP-01 (panel order) | registry | pass (2026-11-07) |
| `model.ts` visibility (`menuAccess`, `visibleMenus`, `countedMenus`); `navigation.ts` `approveLink` + `canViewWith` with `<key>:<ACTION>`; sidebar/rail hide Approve without any APPROVE | UT-AP-02 `visibility.test.ts`; UT-MENU-02/06 updated in `test/home/menu-access.test.ts` | IT-AP-01 | permission fixtures | pass (2026-11-07) |
| Counts: `menuBadge`, `capCount` (99+), `approvalTotal`, `landingMenu` (Q-AP-04), tRPC query keys (`listQueryKey` = `getQueryKey`); `useApprovalCounts`, `useApprovalTotal`, `ApprovePanel`, `Sidebar` badge | UT-AP-03 `counts.test.ts` | IT-AP-02 | seeded count caches; controlled server | pass (2026-11-07) |
| Row adapter `toApprovalRow` / `rowsOf` (deleted and non-pending dropped), "—" for phase-1 gaps, `detailSubLine`, `stoneSummary` (3 + `+k`), dates (Asia/Bangkok), `searchQuery`, `pendingListInput` | UT-AP-04 `api.test.ts` | IT-AP-03 (list input with `q`/cursor, no `deleted`) | fixtures | pass (2026-11-07) |
| `ApprovalTable`: columns, `aria-sort` on 5 sortable headers, sort (oldest first), selection + indeterminate + scope, busy / locked rows, inline error with document link | UT-AP-05 `table.test.ts` | IT-AP-03 (`ApproveMenuPage` rows, total) | fixtures | pass (2026-11-07) |
| States: skeleton, empty (source 01 text), empty search, not available (FE-AP-008), list errors + Retry, no VIEW / no APPROVE texts; `/approve` waits before opening a menu; unknown slug | UT-AP-06 `states.test.ts` | IT-AP-03 (Quotation off, Transfer Location, unknown slug, `/approve`; no API calls) | — | pass (2026-11-07) |
| Approve one: `approveConfirm`, `approveFailure` for `_CHANGED`, `_STATUS_INVALID`, `_DELETED`, `_NOT_FOUND`, `*_PENDING_SHORT`, `*_OUTSTANDING_SHORT`, `PERMISSION_DENIED`, CSRF, network; `useApproveCalls` get → approve, invalidation | UT-AP-07 `approve.test.ts` | IT-AP-04 `approve.integration.test.ts` | controlled server | pass (2026-11-07) |
| Approve selected: `runBulkApprove` one at a time in order, fresh version each, progress, continue after failure, Cancel | UT-AP-08 `approve.test.ts` | IT-AP-05 | controlled server | pass (2026-11-07) |
| Reject… / Revise… disabled: `aria-disabled`, info icon, keyboard-reachable tooltip "… is coming soon" | UT-AP-09 `table.test.ts` | — | — | pass (2026-11-07) |
| Routes `/approve`, `/approve/[menu]`, breadcrumbs Home › Approve › {Menu}, sidebar Approve active on `/approve/*` | UT-AP-10 `menus.test.ts`, `visibility.test.ts` | IT-AP-01 (active state) | — | pass (2026-11-07) |

Commands (frontend, 2026-11-07): `npx tsc --noEmit` exit 0; `npx eslint .` 0 errors (2 existing warnings in `auth/login-form.tsx`); `npx vitest run` **86 files / 822 tests passed** (765 before; `test/approve-center` 8 files / 57 tests). Phase 1 changes no backend code.

Not covered by automation: the component event handlers in `ApproveCenterPage.tsx` (debounce timer, focus after removal, toasts) run only in a browser; the static-render tests cover their states and the extracted pure functions (`runBulkApprove`, `approveFailure`). The repo has no DOM test environment (vitest `environment: "node"`, no Testing Library); adding one needs the dependency process.

Runtime smoke (2026-11-07): frontend container restarted, `repair-dev-networks` OK; `/`, `/approve`, `/approve/reserve`, `/approve/quotation`, `/approve/load-to-stock` and an unknown slug return 200. Signed in as the dev Super Admin: the 7 count lists `{status: PENDING_APPROVAL, limit: 1}` answered (Memo Receive 1, Memo Out 1, others 0); a pending list returned the fields the adapter reads; `memoOut.get` / `memoReceive.get` returned `version` and `lines`. No live approve was sent, because it would change dev data.

## Security review before handoff

| Reviewer | Source revision / changed scope | Status | Evidence / ticket IDs |
|---|---|---|---|
| `sec-auditor` | — | not run | — |
| `security-auditor` | — | not run | — |

## UI acceptance

| Case ID | TODO | Starting state | User actions | Expected result | Viewport / keyboard | Result |
|---|---|---|---|---|---|---|
| UA-AP-01 | FE-AP-001/002 | user with APPROVE on all leaves | click sidebar Approve | `/approve` opens the first menu with pending; panel lists 11 items in the default order; breadcrumb Home › Approve › {Menu} | 1920×1080 | not run |
| UA-AP-02 | FE-AP-003 | 2 pending Reserves, 1 Purchase | look at panel and sidebar | Reserve 2, Purchase 1, sidebar 3; Quotation "off"; inventory items no badge | 1920 | not run |
| UA-AP-03 | FE-AP-004 | Approve › Reserve | compare with source 02 | columns, colors, row height 56, buttons ~95×36 match within ±2 px; "—" where phase 1 has no data | 1920 | not run |
| UA-AP-04 | FE-AP-004 | Approve › Quotation | open | empty state text of source 01 | 1920 | not run |
| UA-AP-05 | FE-AP-005 | a pending Reserve | Approve → confirm | row leaves, counts drop, toast; the Reserve page shows Approved | keyboard only | not run |
| UA-AP-06 | FE-AP-005 | the same Reserve open in another tab and edited | Approve in Approve Center | "changed by someone else" toast, list refreshed | — | not run |
| UA-AP-07 | FE-AP-006 | 3 pending rows selected | Approve selected | one-by-one progress; "Approved 3 of 3" | keyboard | not run |
| UA-AP-08 | FE-AP-008 | Approve › Load to Stock | open | provisional header + "Not available yet" | — | not run |
| UA-AP-09 | FE-AP-002 | user with APPROVE on Reserve only | open Approve | only Reserve item; other routes show "Menu not found"/permission state | — | not run |
| UA-AP-10 | FE-AP-004 | a deleted pending document | open its menu | not listed | — | not run |
| UA-AP-11 | FE-AP-001 | width 1024 and 800 | resize | rail + panel; then panel → select, table scrolls, Action sticky | 1024 / 800 | not run |
