# Frontend data flow: app-navigation

- UI revision: 1 (pending-review)
- Related shared/SA API contract: none new. Existing: Better Auth session (`authClient.useSession`, used by the `AppShell` guard, unchanged).
- Backend requirement: **unchanged-approved** for revision 1. Badges and permission-based menu hiding would be `requires-sa` and are deferred (not part of revision 1).

| UI action / TODO ID | Existing or proposed operation | Input / output | Query key / cache | Loading / error / empty | Backend owner |
|---|---|---|---|---|---|
| Render sidebar / rail / drawer (FE-NAV-001…004) | **None** — static IA in `features/home/navigation.ts` | — | — | Shell skeleton while the session loads (existing) | none |
| Remember collapsed/expanded (FE-NAV-003) | Browser `localStorage["gms.sidebar.collapsed"]` (per viewer convenience, not server state) | `"1"` / `"0"` | — | Unavailable storage → expanded, no message | none |
| Session guard / sign-out (existing) | Better Auth `useSession`, `signOut` | unchanged | Better Auth store | unchanged | auth (existing) |
| Avatar menu (existing FE-UP-017) | `permission.mine` (tRPC, approved) | unchanged | unchanged | unchanged | auth (existing) |
| Setup landing tiles, Master Code modal (FE-NAV-006/007) | **None** — static destinations in `features/setup/setup-destinations.ts` | — | — | — | none |
| Placeholder pages (FE-NAV-008) | **None** — slug → label/breadcrumbs lookup | — | — | Unknown slug → existing "ไม่พบเมนู" text | none |
| Badge dots (FE-NAV-012, **deferred**) | Proposed: a bounded per-user count query (e.g. `navigation.badges` returning `{ home?: number; approve?: number; quotation?: number }`) | requires SA design | would be TanStack Query with a refetch interval or event push (SA decides) | hidden until delivered | SA → backend (not requested) |
| Hide menu items by permission (deferred, Q-NAV-11) | Possible reuse of `permission.mine`, but the catalog v1 lacks most new keys (approve, memo-receive, load-to-stock, …) | catalog change = SA | — | — | SA (not requested) |

Revision 1 adds **no** network request, polling, cache, or worker; client bundle growth is limited to a few
components and ≈30 tree-shaken Lucide icons (estimate, a few kB gzip). No server/container cost; fits the
8 GB RAM / 4 vCPU budget unchanged.

## Requirements for a later SA bundle (only if the owner selects them)

- **SA-NAV-01 Badges:** what each dot means (unread notifications? pending approvals? open quotations?), per-user
  scope, counts vs dot only, freshness (poll interval vs push), maximum value display, and permission filtering.
  Must stay bounded (single aggregate query, short cache, no per-item fan-out).
- **SA-NAV-02 Menu permissions:** align the permission catalog keys with this IA if the owner wants hidden items
  (Q-NAV-11); includes migration of stored grants for renamed keys (e.g. `memo-in` → `memo-receive`).

These are recorded in the not-dispatched [SA handoff](../../../coordination/handoffs/app-navigation-sa.md).
