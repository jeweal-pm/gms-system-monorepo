# 2026-11-07 Approve Center, phase 1 (frontend)

- Feature `approve-center`, revision 1 (UI rev 1). The owner approved it on 2026-11-07 in chat ("อนุมัติ เริ่มทำเลย"). TODO: [approve-center](../task/todo/approve-center.md) FE-AP-001…008 done; FE-AP-012 (security reviews, manual-tester) is open for the parent. Phase 2 (FE-AP-009…011) waits for the SA bundle.
- Owner answers:
  - Q-AP-01: Reject sets a final REJECTED status and needs a reason.
  - Q-AP-02: Revise sends the document back to its creator with a note, and the creator resubmits it.
  - Q-AP-03: the menu follows the sidebar order.
  - Every other question takes its default. Details: [open-questions](../apps/frontend/approve-center/open-questions.md).
- Backend: none. Phase 1 uses only the existing `<doc>.list` / `get` / `approve` procedures.

## What users see

- **Sidebar › Approve** now opens `/approve` instead of the `/modules/approve` placeholder. It stays active on `/approve/*`.
  - It shows only to users who may approve at least one Approve menu (`<leaf>:APPROVE`). Super Admin always sees it.
  - It has a teal count pill: the total of the menu counts, capped at `99+`. The pill is hidden while counts load, when they fail, and at 0.
- **`/approve`** opens the first menu that has pending documents, or else the first menu the user can see, in the same tab.
- **Approve panel**: Quotation, Reserve, Memo Receive, Memo Return, Memo Out, Memo Out Return, Purchase Order (PO), Purchase, Load to Stock, Merge/Split Stock, Transfer Location.
  - Each menu shows its pending count, except Quotation, which always shows "off".
  - Below 1024 px the panel becomes a menu select above the title.
- **Pending table**: Document (link and date), Detail (party and sub line), Qty, Value, Submitted, Status, Action.
  - The default order is oldest first. Users can sort by Document, Detail, Qty, Value or Submitted.
  - Search covers doc no., party and Ref., with a 300 ms debounce. Esc clears it.
  - The table loads 50 rows at a time, with **Load more** and "Showing {n} of {total}".
  - Cells the current API cannot fill show "—": Qty, line count, stone names and the submitter. Submitted shows the last-saved time, labelled "Last saved".
- **Approve** first loads the current version, then asks "Approve {No.}?" with the same consequence text as the document page.
  - On success the row leaves the table, the counts drop, and a "{No.} approved" toast shows.
  - Errors follow error-handling.md:
    - changed by someone else: the list is refreshed;
    - no longer pending, or deleted: the row is removed;
    - not enough stock pending: the reason shows under the row, with a link to open the document;
    - permission removed: a message shows and the user's grants are reloaded.
- **Approve selected** works on rows picked with the checkboxes. It approves them one at a time with "Approving i of n…", and Cancel stops before the next document.
  - The result toast reads "Approved {ok} of {n}". Rows that failed stay selected and show their reason.
- **Reject…** and **Revise…** appear as in the design but are disabled. Each has an info icon and a keyboard-reachable tooltip ("Reject is coming soon" / "Revise is coming soon").
- **Quotation** shows the source 01 empty state.
- **Load to Stock, Merge/Split Stock and Transfer Location** show the table header and "Not available yet". They make no API call.
- **Other states**: no APPROVE grant, APPROVE without VIEW, an unknown menu ("Menu not found"), loading skeleton, list error with Retry, and an empty search with Clear search.

## Code (`frontend/src`)

- New `features/approve-center/`:
  - `menus.ts`: registry, links and breadcrumbs.
  - `model.ts`: pure rules for permissions, counts, row adapter, sort, selection, error mapping and `runBulkApprove`.
  - `api.ts`: `documentClients`, which the compiler checks against the router; count, list and approve hooks; tRPC query keys, so document pages and Approve invalidate each other.
  - `components/ApprovePanel.tsx`, `ApprovalTable.tsx`, `ApproveCenterPage.tsx`.
- New routes: `app/(app)/approve/page.tsx` and `app/(app)/approve/[menu]/page.tsx`.
- `features/home/navigation.ts`:
  - `approveLink` now points to `/approve`, with `activePrefix` and the APPROVE permissions;
  - `canViewWith` matches a key that names an action (`reserve:APPROVE`) as is, while bare keys still need VIEW;
  - `REAL_PAGE_HREFS.approve` is added.
- `features/home/sidebar.tsx`: `SidebarCountBadge` on the Approve item.
- `app/globals.css`: `--color-gms-revise`, `--color-gms-count-badge` and `--color-gms-count-badge-text`, as the design system proposed.

## Budget (4 GB / 2 vCPU)

- Counts make at most 7 `limit: 1` list calls. They refetch only when the window regains focus after 60 s, or after an approval. Nothing polls on a timer.
- Rows load at most 50 per page. `get` runs only for the document being approved.
- Approve selected runs strictly one request at a time.

## Tests and verification

- New tests in `frontend/test/approve-center/`:
  - `menus`, `visibility`, `counts`, `api`, `table`, `states` and `approve` cover UT-AP-01…10;
  - `approve.integration.test.ts` covers IT-AP-01…05;
  - `fixtures.ts` holds the shared test data.
- `test/home/menu-access.test.ts`: UT-MENU-02 and UT-MENU-06 now expect Approve to be hidden without an APPROVE grant.
- Results:
  - `tsc --noEmit` exit 0;
  - ESLint 0 errors (2 existing warnings in `auth/login-form.tsx`);
  - `vitest run` 86 files / 822 tests passed (765 before).
- Runtime: the frontend container was restarted and `repair-dev-networks` reported OK. `/`, `/approve` and the `/approve/*` routes return 200.
- Signed-in smoke (dev Super Admin):
  - the 7 count calls answered;
  - a pending list returned the fields the adapter reads;
  - `get` returned `version` and `lines`.
- Not run:
  - a live approve, because it would change dev data;
  - a browser comparison with source 02 at 1920 px;
  - manual-tester;
  - both security reviews, which the parent routes.

## Deviations and open items

- From 1024 to 1279 px the main sidebar keeps the user's saved choice. It is not forced to the collapsed rail, because that would mean changing `app-shell.tsx`, which is outside the claimed paths.
- Test fixtures live under `frontend/test/` rather than `src/features/approve-center/fixtures.ts`, so they never reach the bundle.
- The list `total` ignores `q`, so while a search is active the footer shows only "Showing {n}".
- The confirm button uses the shared `confirm-dialog.tsx` danger style, as the document pages' Approve confirm does.
- Not changed: `backend-api-auth/**`, backend code, `document/adr/**`, `document/apps/backend/**`, manifests and the lockfile. No new dependency.
- `document/task/frontend-latest.md` still says "pending-review". It is integration-owned, so the parent should update it.
