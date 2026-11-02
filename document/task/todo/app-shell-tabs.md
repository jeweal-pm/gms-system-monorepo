# TODO: app-shell-tabs

- feature-id: `app-shell-tabs`
- revision: 1
- status: **approved** 2026-11-02; frontend implemented 2026-11-02 (FE-TAB-001…004 done; FE-TAB-005 tests + live check done, auditor reviews recorded below).
- request: owner 2026-11-02 "uxui ช่วยเขียน spec App Shell – Tabs … frontend ช่วยทำ ui หน่อย"; answers Q-TAB-01…04 the same day.
- source: [apps/frontend/app-shell-tabs/source/](../../apps/frontend/app-shell-tabs/source/)
- review-bundle:
  - [ui-spec](../../apps/frontend/app-shell-tabs/ui-spec.md), [open questions](../../apps/frontend/app-shell-tabs/open-questions.md), [testing](../../apps/frontend/app-shell-tabs/testing.md)
  - [ADR-0037](../../adr/0037-app-shell-tabs.md)
- backend-bundles: none (frontend only)
- dependencies: none new
- approved-revision: 1 / approved-by: project owner / approved-at: 2026-11-02 / approval-evidence: owner 2026-11-02 "อนุมัติ app-shell-tabs revision 1"

| Done | ID | Owner | Task | Allowed files | Depends on | Verification |
|---|---|---|---|---|---|---|
| [x] | FE-TAB-001 | frontend | Tab store: open / switch / close / close all / limit 15 / titles / dirty flags / per-user persistence (`localStorage`, validated) | `frontend/src/features/home/tabs/**` | approval | UT-TAB-01…03 |
| [x] | FE-TAB-002 | frontend | Shared layout `src/app/(app)/layout.tsx`: App Shell once + tab host (`Activity` visible / hidden per tab); move the App Shell routes into `(app)/` (URLs unchanged); page-meta hook for breadcrumbs / title / dirty; pages stop rendering `<AppShell>`; detail routes read `params` props | `frontend/src/app/**`, `src/features/home/**`, the 24 route files | FE-TAB-001 | UT-TAB-05, existing page tests |
| [x] | FE-TAB-003 | frontend | Tab bar UI in the top bar: tabs (default / hover / active / unsaved dot), ← → on overflow, count box menu, Close all, confirm dialogs, limit toast, a11y roles and keys | `frontend/src/features/home/**` | FE-TAB-001 | UT-TAB-04 |
| [x] | FE-TAB-004 | frontend | Report unsaved changes from the document forms (shared DocumentForm, Quotation, Memo Receive) and the master pages that edit (customer, vendor, company profile, stone master, document setup, currency, user permission) | the forms' feature folders (one-line hook calls) | FE-TAB-002 | UT-TAB-03 |
| [ ] | FE-TAB-005 | frontend + parent | Tests, typecheck, lint; live TC-TAB-01; sec-auditor + security-auditor on the final code | — | all | all suites pass |

## Implementation notes (2026-11-02)

- `src/features/home/tabs/`: `tab-state.ts` (pure rules + storage), `tab-host.tsx` (`TabsProvider`, `TabPanels`, `TabPage`, `useTabDirty` / `useTabDocument` / `useTabReplace`), `tab-bar.tsx`.
- Next.js hands a layout its route as a router element that always renders the *current* URL, so a cached `children` can't keep an old page. Each route page wraps its content in `<TabPage breadcrumbs>`; the element (with its props, a detail page's id included) is handed to the shell and rendered per tab inside `<Activity>`. The route itself renders nothing; a not-found page still shows through.
- A tab is keyed by its path; the query (memo outstanding filters) is kept with the tab and restored when switching back (T-01 clarification).
- After a save / delete the document forms move their own tab (`useTabReplace`, T-09); `useUnsavedChangesPrompt` (master pages) and the three document forms report unsaved changes; the shell keeps one `beforeunload` prompt for hidden dirty tabs.
- The tab list is read synchronously when the signed-in shell mounts; until then the existing shell skeleton shows (Q-TAB-08's loading look). A signed-in shell is no longer swapped back to the skeleton while the session refreshes, which would drop every tab.
- Verification: frontend `vitest` 553 passed (17 new in `test/home/tabs.test.ts`), `tsc` clean, `eslint` 0 errors (2 old warnings in login-form); live TC-TAB-01 on :8080 passed (drafts kept across tabs, same page → same tab, dirty dot + confirm, 16th refused with the message, arrows on overflow, count menu, reload restores, Close all → Home, saved documents titled "Quotation · QT-1" / "Memo Receive · 1", hidden detail tabs keep their own record, Back/Forward). The save-in-place move (T-09) is unit tested; not exercised live (needs a complete new document).
- Audits 2026-11-02, same source revision (HEAD `1e0aa6b` + uncommitted changes): sec-auditor and security-auditor are both advisory, with one shared Low finding, [INV-20261102-001](../investigation/INV-20261102-001-app-shell-tabs-stored-url-control-char-redirect.md) (a stored tab URL with tab/LF/CR can pass `isAppUrl` and lead off-site). Status: pending-review, owner frontend; waiting for the owner to approve the fix. Advisory notes (no ticket): the tab list kept after sign-out holds filters and document numbers (T-07 by design; a possible compliance-auditor topic); hidden tabs keep already-fetched data until shown again (the server still enforces permissions).
