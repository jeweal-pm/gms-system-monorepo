# Open questions and conflicts: app-navigation

- Feature ID / UI revision: `app-navigation` / 1
- Status: **pending-review**. No question is answered yet. None blocks revision 1: each has a default that frontend builds after the owner approves the revision unless the owner answers otherwise. Answers that change the IA, routes, flow or package choice create revision 2.
- Source: [source/](source/) S1–S4 (see [ui-spec.md](ui-spec.md#source-and-evidence))
- Central TODO: [app-navigation.md](../../../task/todo/app-navigation.md)

## Questions for the owner

| ID | Blocks | Question | Default if unanswered | TODO IDs |
|---|---|---|---|---|
| Q-NAV-01 | no | S3 is cut off below "Sale" at a group label starting "Account…". What are the remaining groups and items? S2 shows five collapsible parents; Memo Outstanding is clearly in Memo, the other four are not placed. | Group **"Account"**: Account Outstanding › O/S Payable, O/S Receivable. Then group **"Report"**: Stock Movement › Primary Stock, Consignment Stock; Closing Stock › Primary Stock, Consignment Stock; Sale Report › Compare With Costing, Shareholder Report, Commission Report. All children are placeholders. | FE-NAV-001, 002 |
| Q-NAV-02 | no | Collapsed rail (S1): which button maps to which group, and what happens when a group button (e.g. the cart) is clicked? S1 has 7 group glyphs (cart, cards, document, clipboard-list, boxes, cart-up, wallet) in an order that does not match the expanded groups by meaning. | Rail follows the expanded order: Pre-Sale (cart), Memo (cards), Purchase Order (document), Inventory (boxes), Sale (cart-up), Account (wallet), Report (clipboard-list, moved to the end, DV-04). Clicking a group **expands the sidebar, scrolls to that group and focuses its first item** (no flyout menu). | FE-NAV-001, 003 |
| Q-NAV-03 | no | When a sub-item is the current page (e.g. Memo Outstanding › From Vendor), should the parent row also look active? | Parent stays normal and open; only the child gets the active background and semibold text. | FE-NAV-002 |
| Q-NAV-04 | no | Master Code › **Partner Master**: where should it go? There are two existing pages (Vendor, Customer). | Open **`/setup/vendor`**; Customer is the neighboring tab in the Setup tab bar. Alternatives: a second step in the modal with Vendor/Customer tiles, or a new `/setup/partner-master` page (both need a design). | FE-NAV-007 |
| Q-NAV-05 | no | Company Profile, Notifications and the other six Master Code items have no pages yet. OK to send them to the generic "not available yet" placeholder? | Yes, `/modules/<slug>` placeholders (Company Profile and Currency reuse existing slugs; Notifications, Stone Master, Location Master, Certificate Master, Labor Name, Sale Person get new slugs). Breadcrumbs `Home › Setup › [Master Code ›] item`; the modal itself has no URL. | FE-NAV-001, 006, 007, 008 |
| Q-NAV-06 | no | The red dots on Home, Approve and Quotation: what do they count, and for whom? There is no notification or count service. | **Hidden** in revision 1. Showing real dots needs an SA design (counts per user, refresh rule) and backend work; recorded as deferred FE-NAV-012 and a not-dispatched [SA handoff](../../../coordination/handoffs/app-navigation-sa.md). | FE-NAV-012 |
| Q-NAV-07 | no | How does the user collapse the **expanded** sidebar? S3 shows no control (the bottom is cut off). | A ⇆ button (rail-button style, tooltip "Collapse sidebar") **pinned at the bottom** of the expanded sidebar; in the rail the ⇆ follows the last module as in S1. | FE-NAV-002, 003 |
| Q-NAV-08 | no | Should the sidebar collapse automatically on narrower desktops (768–1023 px)? | No. The user's choice applies at every width ≥ 768 px; below 768 the existing drawer opens from the topbar menu. | FE-NAV-003, 010 |
| Q-NAV-09 | no | The icons look like **Tabler Icons** (e.g. cart with up/down arrow). Do you want the exact glyphs? That would add a package (`@tabler/icons-react`). | Use the closest **already installed Lucide** icons (listed in ui-spec); no new package. Choosing Tabler creates revision 2 with a dependency proposal. | FE-NAV-001 |
| Q-NAV-10 | no | The rail shows only the GMS mark (no wordmark). Is there an official mark-only file (SVG/PNG)? | Crop the existing `/gms-logo.png` with CSS (left square only); no new asset. | FE-NAV-005 |
| Q-NAV-11 | no | Should menu items and Setup tiles be hidden for users without permission? | No (current behavior): everyone sees the full menu; each real page keeps its own access check. Permission-based hiding needs the permission catalog to contain the new menu keys (SA topic, deferred). | FE-NAV-001, 006 |
| Q-NAV-12 | no | Two tiny color differences: the newer images use `#F3F3F3` for hover/active (current token `#F5F5F6`) and `#E8E8E8` for the rail border (sidebar `#EDEDED`). | Change the hover/active token to **`#F3F3F3`** (also used by topbar icon hover); use **`#EDEDED`** for both borders. | FE-NAV-009 |
| Q-NAV-13 | no | Group labels (`#95A0A9` on `#FCFCFC`) are below the WCAG AA contrast for small text (≈2.6:1). Keep or darken? | Keep the approved FE-UP-017 color. Darkening to `#656B71` (≈5.3:1) is a one-token change if you prefer. | FE-NAV-009 |
| Q-NAV-14 | no | Should `SetupTabs` (the tab bar on User and permission / Vendor / Customer) be kept now that `/setup` has a landing page? Its items (General, Main Location, …) no longer match the Setup page. | Keep it unchanged on those pages in this revision; the `/setup` landing page has no tab bar (S3). Changing or removing it is a separate decision for those approved features. | FE-NAV-008 |

## Conflicts with existing approved work

| Topic | Existing | This revision | Handling |
|---|---|---|---|
| Sidebar IA | FE-UP-017 (approved 2026-10-14): Main, Partner Master (Vendor, Customer), Stone Master, Purchase Order, Report library, Setup pinned at bottom → `/setup/user-permission` | New IA from S3/S2; Setup at the top → `/setup` | Replaced on approval of this revision. Vendor/Customer remain reachable via Setup › Master Code › Partner Master and `SetupTabs`; Stone Master items via Home shortcuts. |
| Sidebar link for Vendor | vendor FE-VEN-002 added "Partner Master › Vendor" to the sidebar | No Partner Master group in the sidebar | Entry point moves to Master Code › Partner Master (D-04). The `/setup/vendor` route, tab and Home shortcut are unchanged. The vendor TODO is not edited; this note records the change for its owner. |
| Setup breadcrumb | `Home › Setup › X` with "Setup" as plain text | "Setup" links to `/setup` | FE-NAV-008 edits only the breadcrumb constant in `app/setup/{user-permission,vendor,customer}/page.tsx` |
| Hover/active token | `gms-nav-active #F5F5F6` | `#F3F3F3` | Q-NAV-12 |
