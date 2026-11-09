# Frontend acceptance and verification: approval-setup

- UI revision: 1 (pending-review)
- Reference images and viewport: [01](source/01-setup-tiles-approval.png) 1920 × 1080; [02](source/02-approval-setup.png), [03](source/03-cannot-turn-off-dialog.png) ≈ 1965 × 1101 CSS. Desktop only.
- Relevant TODO / API / SA revisions: [central TODO](../../../task/todo/approval-setup.md) FE-AS-001…011; existing `<doc>.list`; phase 2 SA bundle not yet written ([handoff](../../../coordination/handoffs/approval-setup-sa.md)).

## Automated coverage

| Target / behavior | Unit case ID and test path | Integration case ID and test path | Boundary / fixture | Command and result |
|---|---|---|---|---|
| Rows: 11 types in sidebar order from `APPROVE_MENUS`; availability | UT-AS-01 `frontend/test/approval-setup/model.test.ts` | IT-AS-01 `frontend/test/approval-setup/approval-setup-page.test.tsx` (renders 11 rows, Memo rows included) | registry | not run |
| `DEFAULT_APPROVAL_SETTINGS` (Quotation off, others on) | UT-AS-02 | IT-AS-01 | — | not run |
| Chain + helper by state (off Quotation, off other, on, not available) | UT-AS-03 | IT-AS-02 (toggle changes chain/helper) | — | not run |
| `documentsText`: 0 → "No documents", 1 → "1 document", 2 → "2 documents", 1234 → "1,234 documents" | UT-AS-04 | — | boundaries 0/1/2/large | not run |
| Waiting cell states (loading, error + retry, no VIEW, —, link vs plain text by APPROVE) | UT-AS-05 | IT-AS-03 (mocked list returns total 2/0/error) | permission fixtures | not run |
| Count hook uses the approve-center query key; VIEW-gated; Quotation/not-available make no call | UT-AS-06 `frontend/test/approval-setup/api.test.ts` | IT-AS-03 | key equality with `listQueryKey` | not run |
| Turn-off decision: `wait` (loading), `blocked` (> 0), `confirm` (0), `check-failed` (error), no-count rows → `confirm` | UT-AS-07 | IT-AS-04 (blocked dialog text "2 Reserve documents are still waiting for approval.", singular for 1, Close keeps On, Go to Approve navigates `/approve/reserve`) | — | not run |
| Turn ON confirm; Cancel keeps Off; Turn on → On + toast "… Not saved yet." | UT-AS-08 | IT-AS-05 | — | not run |
| Not-available rows: switch `aria-disabled`, hint "Not available yet", clicks ignored | UT-AS-09 | IT-AS-06 | — | not run |
| Phase 1 state is local: remount restores defaults; nothing written to storage | UT-AS-10 | IT-AS-07 | storage spy | not run |
| Setup tile: label, `emerald` color, icon, order (after Document Setup, before Decimal Setup), Super Admin only in phase 1 | UT-AS-11 `frontend/test/setup/setup-destinations.test.ts` | IT-AS-08 `frontend/test/setup/setup-landing.test.tsx` | permission fixtures | not run |
| `ConfirmDialog` `confirmVariant="primary"` and rich body; default unchanged | UT-AS-12 `frontend/test/components/confirm-dialog.test.tsx` | IT-AS-04 | existing callers | not run |
| Accessibility: switch names "Require approval for {Menu}", dialog focus start/return, Esc | UT-AS-13 | IT-AS-04/05 | — | not run |

Commands to record: `pnpm --filter frontend test`, `pnpm --filter frontend typecheck`, `pnpm --filter frontend lint` (actual script names to be confirmed in `frontend/package.json` at implementation time).

## Security review before handoff

| Reviewer | Source revision / changed scope | Status | Evidence / ticket IDs |
|---|---|---|---|
| `sec-auditor` | not yet implemented | not run | — |
| `security-auditor` | not yet implemented | not run | — |

Focus: the page must not imply a saved security/business setting; the tile/page are hidden from non-Super-Admin users in phase 1; links never bypass `<doc>:APPROVE` server checks.

## UI acceptance

| Case ID | TODO / component | Starting state | User actions | Expected result | Viewport / keyboard | Evidence / result |
|---|---|---|---|---|---|---|
| UA-AS-01 | FE-AS-001 C-AS-01 | Super Admin on `/setup` | look at tiles | "Approval" tile, `#14A460` square 54 px, SVG icon, after Document Setup | 1920 × 1080 | not run |
| UA-AS-02 | FE-AS-001 | user without Super Admin | open `/setup`, then `/setup/approval` directly | no tile; page shows the no-permission placeholder | 1920 | not run |
| UA-AS-03 | FE-AS-002/003 | Super Admin | open Approval | breadcrumb, title, notice text, 11 rows in sidebar order, header 56 px, rows 82 px, chips and helpers as specified (±2 px vs source 02) | 1920 | not run |
| UA-AS-04 | FE-AS-004 | 2 pending Reserve, 1 pending Purchase, 0 Memo Out | open page | "2 documents ›", "1 document ›", "No documents"; Quotation and inventory "—" | 1920 | not run |
| UA-AS-05 | FE-AS-005 C-AS-10 | 2 pending Reserve | switch Reserve off | dialog per source 03; Close → still On, focus on switch; repeat → Go to Approve → `/approve/reserve` tab | mouse + keyboard (Space, Esc) | not run |
| UA-AS-06 | FE-AS-005 C-AS-11 | 0 pending Memo Out | switch off → Turn off | Off row: [Save] → [Approved] with Off helper; toast "… Not saved yet." | keyboard | not run |
| UA-AS-07 | FE-AS-005 | Quotation off | switch on → Turn on | On chain/helper; Waiting "—" | 1920 | not run |
| UA-AS-08 | FE-AS-003 | any | try Load to Stock switch | not toggled; hint "Not available yet" read by screen reader | keyboard | not run |
| UA-AS-09 | phase 1 limit | after UA-AS-06/07 | refresh | defaults restored; Approve menu and document pages unchanged | 1920 | not run |
| UA-AS-10 | FE-AS-005 | network offline for counts | switch Reserve off | "Couldn't check waiting documents" dialog; stays On | 1920 | not run |
| UA-AS-11 | responsive | — | 1280, 1024, 900 px widths | rail sidebar at 1024–1279; horizontal table scroll < 1024 with sticky Menu column | widths | not run |

Customer reports and screenshots belong under `document/testing/user-check/`.
