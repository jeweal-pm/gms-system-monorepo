# ADR-0037: App Shell tabs keep pages alive in one shared layout

- Status: Accepted (2026-11-02)
- Date: 2026-11-02
- Feature / source UI revision: `app-shell-tabs` / 1 ([ui-spec](../apps/frontend/app-shell-tabs/ui-spec.md))
- Deciders: project owner
- Approval evidence: owner 2026-11-02 "อนุมัติ app-shell-tabs revision 1"
- Related: the [app-navigation](../apps/frontend/app-navigation/) App Shell; [tech-stack](tech-stack.md) (Next 16.4, React 19.3, no new package)

## Context

The owner wants browser-like tabs in the App Shell. Switching tabs must keep typed but unsaved data, and the design shows 14 tabs open.

Today every page renders its own `<AppShell>` (24 route files). A navigation therefore unmounts the page and the shell together, and typed data is lost.

Next.js 16 can keep routes alive with React `Activity`, but only with `cacheComponents` and only for the last **3** routes (`next/dist/docs/01-app/02-guides/preserving-ui-state.md`). That is too few for tabs, and turning on Cache Components would change how every page caches.

## Decision

1. **One shared App Shell.**
   - A route-group layout `src/app/(app)/layout.tsx` renders the App Shell (sidebar, top bar, new tab bar) once.
   - The route folders move into the group, and URLs don't change.
   - Pages stop rendering `<AppShell>`. They declare their breadcrumbs and tab title through a small page-meta hook, and the layout shows them.
2. **A tab host keeps pages alive.**
   - The layout stores the page element of each open tab, keyed by its path, and renders every open tab.
   - The active tab is wrapped in `<Activity mode="visible">`, the others in `<Activity mode="hidden">`.
   - Hidden tabs keep React and DOM state (form drafts, row panels, scroll) while React runs their effect cleanups, which pauses timers, listeners and live queries.
   - At most 15 tabs (Q-TAB-02).
3. **Detail pages read their id from the route props** (`params`), not from `useParams()`. A hidden page then keeps its own id instead of reading the active URL.
4. **Tab state** (paths, titles, active tab) lives in one client store.
   - The list is saved per user in `localStorage` (try/catch, validated, bounded to 15) and restored after a reload (Q-TAB-04).
   - Pages report unsaved changes (`formState.isDirty`) to their tab through the same hook (Q-TAB-03).

## Alternatives

| Alternative | Reason not chosen |
|---|---|
| Next `cacheComponents` + built-in Activity | Keeps only 3 routes and changes caching on every page; tabs need 15. |
| Save each form's draft to a store and restore it on return | Every form would need wiring, and it loses everything that isn't a form field (open row panel, picker, scroll). |
| Each tab in an iframe | 15 copies of the app, separate sessions and memory, and broken shared state. |

## Consequences and capacity

- A one-time move of 24 route files into `(app)/` with the shell removed from each. Pages keep their content and tests. URLs, APIs and the server are unchanged.
- **Browser memory** grows with open tabs: at most 15 kept-alive pages. Hidden pages run no effects. The server, the 4 GB host and the containers are not affected.
- Page code must not depend on the global URL while hidden. Detail routes use their `params` props (decision 3), and the shell's own `usePathname` logic moves into the layout.
- No new package.

## Acceptance and approval

- Typed data survives switching tabs.
- Same page → same tab. The 16th tab is refused. Closing a tab with unsaved changes asks first. Close all leaves Home. The tabs reopen after a refresh.
- Every page still shows its breadcrumbs, permissions and content as before.
- Covers:
  - this ADR;
  - [ui-spec rev 1](../apps/frontend/app-shell-tabs/ui-spec.md);
  - [open questions Q-TAB-01…08](../apps/frontend/app-shell-tabs/open-questions.md);
  - [testing](../apps/frontend/app-shell-tabs/testing.md);
  - [TODO rev 1](../task/todo/app-shell-tabs.md).

  No packages.
