# TODO: approval-setup

- feature-id: `approval-setup`
- revision: 1 (UI rev 1; no SA revision)
- status: **approved** 2026-11-09; phase 1 (FE-AS-001…006) implemented 2026-11-09, FE-AS-007 reviews pending
- request: owner 2026-11-09, "Setup เพิ่ม Approval … หน้านี้จะเป็นหน้าที่สามารถเปิดปิด approve transaction เช่นถ้าหน้า Quotation ใน approval ปิด หน้า Quotation ก็จะไม่มี approve กด save ได้เลย และเมื่อเปิดใน Quotation Approval ก็จะมี approve ให้กด ถ้าจะกดปิด ต้องเคลียร์ approve reject ให้หมดก่อน. ตอนนี้ยังไม่ต้องทำ backend ให้ frontend ทำ ui ก่อน"; owner answers A1–A4 (2026-11-09) in the [ui-spec](../../apps/frontend/approval-setup/ui-spec.md) header.
- source: [01-setup-tiles-approval.png](../../apps/frontend/approval-setup/source/01-setup-tiles-approval.png), [02-approval-setup.png](../../apps/frontend/approval-setup/source/02-approval-setup.png), [03-cannot-turn-off-dialog.png](../../apps/frontend/approval-setup/source/03-cannot-turn-off-dialog.png), [approval-setup-icon.svg](../../apps/frontend/approval-setup/source/approval-setup-icon.svg)
- ui-spec: [ui-spec.md](../../apps/frontend/approval-setup/ui-spec.md)
- dependencies: [dependencies.md](../../apps/frontend/approval-setup/dependencies.md) — no new package; infra: none expected
- backend-bundles: none for phase 1 (existing per-document `list` only). Phase 2 **requires SA**: [handoff](../../coordination/handoffs/approval-setup-sa.md) (SA-AS-01…10; not dispatched; backend not requested by the owner yet)
- related: [approve-center](approve-center.md) (rev 1 approved; Q-AP-06 "Quotation off" becomes settings-driven in phase 2), [ADR-0046](../../adr/0046-approval-review-status-and-approve-center-api.md) (Accepted, backend on hold), [ADR-0045](../../adr/0045-transaction-document-soft-delete.md)
- approved-revision: UI rev 1
- approved-by: owner
- approved-at: 2026-11-09
- approval-evidence: owner chat 2026-11-09 "อนุมัติ ทำในแชท"; Q-AS-01 = **Save** chip; Q-AS-02 = **a pending document can NOT be edited** (as the design; changes ADR-0046 D7, so SA must revise it before phase 2); all other Q-AS use their defaults
- review-bundle: [ui-spec](../../apps/frontend/approval-setup/ui-spec.md), [design-system](../../apps/frontend/approval-setup/design-system.md), [conventions](../../apps/frontend/approval-setup/conventions.md), [data-fetching](../../apps/frontend/approval-setup/data-fetching.md), [error-handling](../../apps/frontend/approval-setup/error-handling.md), [form-guidelines](../../apps/frontend/approval-setup/form-guidelines.md), [dependencies](../../apps/frontend/approval-setup/dependencies.md), [testing](../../apps/frontend/approval-setup/testing.md), [open-questions](../../apps/frontend/approval-setup/open-questions.md) (Q-AS-01…22), [flow](../../diagram/approval-setup-flow.md), [SA handoff](../../coordination/handoffs/approval-setup-sa.md)

## Implementation items

Phase 1 (FE-AS-001…007) is **UI only** on existing APIs: toggles are local and not saved. It may start once the owner approves revision 1. Phase 2 (FE-AS-008…011) is blocked on an approved SA bundle and backend completion; the owner has not asked for backend yet.

| Done | ID | Owner | Task / component | Allowed files | Depends on / requires-sa | Acceptance criteria | Verification |
|---|---|---|---|---|---|---|---|
| [x] | FE-AS-001 | frontend | Setup tile "Approval" (C-AS-01): `ApprovalSetupIcon` from the SVG, `emerald` tile color + token, order after Document Setup (Q-AS-10), `permission: ["approval-setup"]` (phase 1 = Super Admin/ALL only, Q-AS-09) | `frontend/src/features/setup/setup-destinations.ts`, `setup-icons.tsx`, `setup-tile.tsx`, `frontend/src/app/globals.css` (`--color-gms-tile-emerald`), `frontend/test/setup/**` | UI approval | Tile as [design-system](../../apps/frontend/approval-setup/design-system.md) §1/§3; hidden for users without Super Admin/ALL; links to `/setup/approval` | UT-AS-11, IT-AS-08, UA-AS-01/02 |
| [x] | FE-AS-002 | frontend | Route `/setup/approval` (`TabPage`, breadcrumb Home › Setup › Approval, `<h1>` Approval), Setup permission guard, card, phase 1 notice (C-AS-08, Q-AS-06) | `frontend/src/app/(app)/setup/approval/**`, `frontend/src/features/approval-setup/**`, `frontend/test/approval-setup/**` | FE-AS-001 | Layout/paddings per [ui-spec › layout](../../apps/frontend/approval-setup/ui-spec.md#page-structure-and-layout-desktop); notice text exact; no-permission placeholder | IT-AS-01, UA-AS-02/03/11 |
| [x] | FE-AS-003 | frontend | Settings table (C-AS-03/04/05/06): rows from `APPROVE_MENUS` (11, sidebar order, Memo rows included), `DEFAULT_APPROVAL_SETTINGS` (Quotation off, others on), `StatusChain`/`StatusChip` with Off/On/not-available variants and helper texts (Q-AS-01/02/03/15), not-available rows disabled (Q-AS-04), no sorting (Q-AS-08), contrast tokens (Q-AS-18), `--color-gms-pending-chip` | same as FE-AS-002 + `frontend/src/app/globals.css` | FE-AS-002 | Rows/chips/helpers per [ui-spec › Rows](../../apps/frontend/approval-setup/ui-spec.md#rows-and-the-status-chain); header 56 px, rows 82 px; ±2 px vs source 02 at its viewport | UT-AS-01/02/03/09, IT-AS-01/02/06, UA-AS-03/08 |
| [x] | FE-AS-004 | frontend | Waiting cell (C-AS-07): counts via existing `<doc>.list({status:"PENDING_APPROVAL",limit:1}).total`, same query key as approve-center, VIEW-gated, no call for Quotation/not-available; pluralisation (Q-AS-07); link to `/approve/{slug}` only with `<leaf>:APPROVE`; loading/error+Retry/"—"/"No documents" | same as FE-AS-002; import only from `frontend/src/features/approve-center/**` (an additive pure export in `approve-center/model.ts` is allowed if needed) | FE-AS-003 | Cell states per [ui-spec › Waiting](../../apps/frontend/approval-setup/ui-spec.md#waiting-for-approval-cell); opening the page adds no request when the sidebar counts are fresh | UT-AS-04/05/06, IT-AS-03, UA-AS-04 |
| [x] | FE-AS-005 | frontend | Switch behaviour (C-AS-09/10/11/12), local state only: ON confirm (Q-AS-05); OFF → wait / blocked dialog (source 03: Close, Go to Approve) / confirm / check-failed; toasts "… Not saved yet."; state resets on refresh; nothing persisted | same as FE-AS-002 | FE-AS-004, FE-AS-006 | Exact texts per [ui-spec › Interactions](../../apps/frontend/approval-setup/ui-spec.md#interactions); singular/plural dialog sentence; focus start/return; Esc; never turns Off on an unknown count | UT-AS-07/08/10/13, IT-AS-04/05/07, UA-AS-05/06/07/09/10 |
| [x] | FE-AS-006 | frontend | `ConfirmDialog`: additive `confirmVariant: "danger" \| "primary"` (default `danger`) and rich body (bold first sentence); existing callers unchanged | `frontend/src/components/ui/confirm-dialog.tsx`, `frontend/test/components/**` | UI approval | Source 03 buttons (secondary Close, primary Go to Approve); existing dialogs render exactly as before | UT-AS-12, existing dialog tests |
| [ ] | FE-AS-007 | frontend | Verification: frontend suite, typecheck, lint; both security roles once on the final diff; manual-tester for Setup → Approval | `document/apps/frontend/approval-setup/testing.md`, `document/testing/user-check/**` | FE-AS-001…006 | All listed tests pass; reviews recorded together | testing.md |
| [ ] | FE-AS-008 | frontend | Persist settings: read `approvalSetting.list`, update per switch (not optimistic), server errors (`HAS_WAITING`, `CHANGED`, `FORBIDDEN`), remove the phase 1 notice and toast suffix; `REVISION_REQUESTED` in counts and dialog (Q-AS-12) | `frontend/src/features/approval-setup/**`, tests | **requires-sa** SA-AS-01/02/05 + backend | per approved SA contract | TBD with SA |
| [ ] | FE-AS-009 | frontend | Approve Center follows settings: replace hard-coded Quotation `availability: "off"`; OFF types show "off"; Quotation ON becomes available (add `quotation` to `ApprovalProc`, consequence text) | `frontend/src/features/approve-center/**`, `frontend/test/approve-center/**` | **requires-sa** SA-AS-04/06; coordinate approve-center FE-AP-009…011 | per approved SA contract; approve-center Q-AP-06 superseded | TBD |
| [ ] | FE-AS-010 | frontend | Document pages follow settings (Quotation, Reserve, 4 Memo, PO, Purchase): OFF = Save approves (no Approve button, Save confirm states the effect), ON = Save → Pending + Approve; stale-setting result handling (Q-AS-21) | `frontend/src/features/{quotation,reserve,memo-*,purchase-order,purchase,trade-document}/**` and tests | **requires-sa** SA-AS-03/04/09 | per approved SA contract | TBD |
| [ ] | FE-AS-011 | frontend | Permission leaf wiring: add `approval-setup` to `SETUP_MENU_KEYS`/catalog keys; VIEW read-only switches, EDIT toggles | `frontend/src/features/home/navigation.ts`, `frontend/src/features/approval-setup/**`, tests | **requires-sa** SA-AS-07 (auth catalog) | VIEW/EDIT behaviour per [ui-spec › Permissions](../../apps/frontend/approval-setup/ui-spec.md#permissions) | TBD |

### Backend needs (requires-sa; for SA, not yet designed)

| ID | Need | Owner (proposed) |
|---|---|---|
| SA-AS-01 | Per-type approval setting store + list/update API (`approval-setup:EDIT` + CSRF, versioned, audit fields) | master |
| SA-AS-02 | Atomic turn-OFF guard against `PENDING_APPROVAL` / `REVISION_REQUESTED` (race-safe with concurrent Saves) | master |
| SA-AS-03 | Save path when OFF: Save = `APPROVED` + today's approve effects in one transaction (7 engine documents) | master |
| SA-AS-04 | Quotation when ON: Pending on create, approve, Revise/Reject (extends ADR-0046), edit-after-approval rule | master |
| SA-AS-05 | Setup waiting counts incl. `REVISION_REQUESTED`, one bounded call | master |
| SA-AS-06 | Approve Center summary/pending follow the settings | master |
| SA-AS-07 | Auth catalog leaf `approval-setup` (VIEW/EDIT) | auth |
| SA-AS-08 | Soft delete / Restore when OFF (ADR-0045) | master |
| SA-AS-09 | How document pages read the setting | master |
| SA-AS-10 | Convention for future inventory documents | master |

Backend implementation items (BE-AS-*) are added by SA. Details: [SA handoff](../../coordination/handoffs/approval-setup-sa.md).

## Approval and revisions

| Revision | Date | Change | Status |
|---|---|---|---|
| 1 | 2026-11-09 | Initial UI spec from sources 01–03 and owner answers A1–A4 | approved 2026-11-09 |

The owner reviews the exact revision-1 bundle above. The decisions needed are the Q-AS defaults in [open-questions](../../apps/frontend/approval-setup/open-questions.md), most importantly Q-AS-01 (Draft chip), Q-AS-02 (Pending editable), Q-AS-04 (not-available rows), Q-AS-05 (confirms), Q-AS-06 (notice), Q-AS-09 (permission leaf), Q-AS-12/13/14/22 (backend rules for SA).

## Handoffs, evidence, and completion

- SA: [coordination/handoffs/approval-setup-sa.md](../../coordination/handoffs/approval-setup-sa.md) (not dispatched).
- Evidence (2026-11-09, phase 1, implemented in the parent session): `tsc` 0; ESLint 0 errors (2 existing warnings in `auth/login-form.tsx`); vitest 87 files / 838 tests (+15: `test/approval-setup/approval-setup.test.ts` UT-AS-01/02/04/07/09/11/12; `test/setup/setup-destinations.test.ts` tile order); frontend restarted, `/setup/approval` 200. No browser comparison with source 02 yet. Changelog: [2026-11-09-approval-setup-frontend](../../changelog/2026-11-09-approval-setup-frontend.md).

## Corrective work

None. Defects during implementation follow [bounded remediation](../../workflow/remediation.md) with one root-cause ledger linked here.
