# UI specification: notifications revision 1

- Feature ID / revision: `notifications` / 1
- Status: **approved** 2026-11-11 (owner "อนุมัติ"; Q-NT-01…09 defaults)
- Owner request (2026-11-11, verbatim): "sa uxui ทำ spec และ adr ของ notification ให้หน่อย", with the design images below, the panel size `440 × 650, radius 8px`, the colours `#FBFBFB`, light `#E2F0F0`, dark `#A3C9CC`, a bell icon SVG and a team brief on real-time status notifications ([source/team-brief-2026-11-11.md](source/team-brief-2026-11-11.md)).
- Sources (owner design PNGs, 2026-11-11):
  - [source/01-panel-in-page.png](source/01-panel-in-page.png), 647×844, SHA-256 prefix `869e80dc6bcd20bb`: the open panel under the top-bar bell, "For me 6", Today / Yesterday groups.
  - [source/02-panel-states.png](source/02-panel-states.png), 3722×1384, `3ef6af78c1518723`: empty, loading and list states.
  - [source/03-inbox-item-states.png](source/03-inbox-item-states.png), 2304×1584, `67d77e785f9730e1`: item read / unread × default / hover / loading.
  - [source/04-panel-header.png](source/04-panel-header.png), 960×156, `179aeebbd131b3b9`: "Notifications" + "Mark all as read".
  - [source/05-tabs.png](source/05-tabs.png), 960×168, `84a47f8fe67aa081`: "For me 6" / "All".
  - [source/06-tab-states.png](source/06-tab-states.png), 784×144, `77d52569e4b464c8`: tab default / hover / focus / active with a count.
  - [source/07-open-list-tooltip.png](source/07-open-list-tooltip.png), 766×567, `2acb17bdf130dff3`: the row chevron with the tooltip "Open list page" (read and unread fills).
- Design-system parts are read from the images by eye (**estimated**); only the panel size, radius and the three colours were given exactly.
- Backend design: [ADR-0049](../../../adr/0049-notifications-sse.md) (Accepted) and [api-contract](../../backend/master/notifications/api-contract.md). Central TODO: [task/todo/notifications.md](../../../task/todo/notifications.md). Open questions: [open-questions.md](open-questions.md).
- No new package (the browser's `EventSource` is used).

## What it is

The top-bar bell (today a placeholder that says "Notifications aren't available yet.") opens a **notifications panel**: what happened to documents the user is involved in, newest first, with an unread count on the bell. New notifications appear without reloading the page (server-sent events). Notifications are stored, so they are still there after a refresh or after being offline.

Revision 1 covers the documents in **api-master** (Reserve, Memo Receive, Memo Return, Memo Out, Memo Out Return, Purchase Order, Purchase; Quotation has no approval step today). Inventory, Sale, Account Outstanding and Reports belong to the future `api-inventory` service and join later through the same contract (ADR-0049 D10).

## Trigger: the bell (top bar)

| State | Look |
|---|---|
| No unread | Bell icon (the owner's SVG, `#637381`), no badge |
| Unread ≥ 1 | Red dot at the top right of the bell (as in source 01); the accessible name says "Notifications, 6 unread" (Q-NT-01: dot, not a number) |
| Panel open | Bell button pressed (`aria-expanded="true"`) |
| Stream unavailable | No visual change; the list still loads by query and refetches on focus |

Click or Enter/Space toggles the panel; Esc and a click outside close it; focus returns to the bell.

## Panel layout (sources 01–05)

- Floating panel under the bell, right-aligned to it: **440 × 650 px**, radius **8 px**, 1 px border `#E3E6EA`, shadow (`shadow-gms-overlay`), white body. On screens narrower than 472 px it becomes full width (16 px gutters) and up to the viewport height minus the top bar.
- **Header** (source 04): background `#FBFBFB`, height ≈ 56 px (estimated); "Notifications" (`text-gms-heading`, medium, `#1C252E`) on the left; "Mark all as read" text button (`text-gms-label` medium, `#637381`, hover `#1C252E`) on the right, disabled when nothing is unread.
- **Tabs** (sources 05–06): background `#FBFBFB`, bottom border `#E3E6EA`. "For me" with a red count badge (white number on `#DF1016`, ≥ 18 px round, `99+` cap) and "All".
  - default: `#637381`; hover: `#1C252E`; keyboard focus: 1 px rounded outline `#E3E6EA` (source 06 third state); active: `#1C252E` + 3 px underline `#006A70`, full tab width.
  - The badge shows the user's unread count in **For me** only.
- **Body**: scrolls inside the panel; groups "Today", "Yesterday", then dates (`dd MMM yyyy`) as section labels (`text-gms-body`, `#637381`, ≈ 16 px left padding, 12 px top).
- Lazy pages of 20 when scrolled to the end ("Loading more…" row); no page numbers.

## Item (source 03)

| Part | Spec |
|---|---|
| Avatar | 40 px circle, `#F4F6F8` (estimated), the owner's bell SVG (`#637381`) centred |
| Title | `text-gms-body` medium `#1C252E`; the document number **bold** (e.g. "**RS2611002** waits for your approval") |
| Badge + body | document-type badge (e.g. "Reserve", "Purchase", "Load to Stock"): 11–12 px text `#637381` on `#EEF0F2`, radius 4; then the body text `#637381`, wrapping, max 2 lines then ellipsis |
| Meta line (optional) | party · amount + currency, then "{actor} ({role}) · {relative time}" (source 01) |
| Time | `text-gms-label` `#A9A9A9`: "Today at 9:42 AM" / "Yesterday at …" / "dd MMM at …" |
| Unread mark | 8 px red dot `#DF1016` at the top right |
| Divider | 1 px `#EDEDED` under each item |

| State | Read (default) | Unread |
|---|---|---|
| Default | white | `#E2F0F0` |
| Hover / keyboard focus | `#FBFBFB` + chevron button at the right | `#A3C9CC` + chevron button |
| Loading | skeleton bars `#F4F6F8`, avatar kept | same |

- **Chevron button** (source 07): 32 px rounded square, `#F4F6F8` on read rows / `#E2F0F0` on unread rows, `>` icon `#1C252E`; tooltip **"Open list page"** (black, white text). It opens the list page of that document type (e.g. Approve › Reserve, or the document daybook) in the app-shell tab (Q-NT-03).
- **Clicking the row** opens the document itself in its tab (Q-NT-03) and marks the notification read.

## States (source 02)

| State | Behaviour |
|---|---|
| Loading (first open) | 5 skeleton items |
| Empty | centred illustration (stacked list placeholders, the design's art) + "Alerts about your organization and account will show here" (`#637381`) |
| Error | "Couldn't load notifications." + Try again; the bell keeps its last count |
| List | grouped by day, newest first |

## Notifications in revision 1 (see ADR-0049 D4 for recipients)

| Event | Title | Recipients | Opens |
|---|---|---|---|
| A document enters **Pending approval** (saved, or resubmitted) | "**{docNo}** waits for your approval" | users with `<document>:APPROVE` (and VIEW), not the actor | row: the document; chevron: Approve › {type} |
| **Approved** | "**{docNo}** was approved" | the document's creator, not the actor | row: the document |
| **Rejected** (needs ADR-0046 phase 2) | "**{docNo}** was rejected" + the reason | creator | row: the document |
| **Sent back for revision** (needs ADR-0046 phase 2) | "**{docNo}** was sent back for revision" + the note | creator | row: the document |

- The "Security Update: Token Management" rows in the design are placeholder text; system announcements are **not** in revision 1 (Q-NT-04).
- **For me** lists the notifications addressed to the user. **All** lists every notification event of the document types the user may VIEW, read-only (no unread mark), newest first (Q-NT-02).

## Real-time behaviour (frontend side of ADR-0049)

- On sign-in the shell loads the unread count; the panel loads its list when opened.
- The shell opens one same-origin `EventSource` to `/api/master/notifications/stream` while signed in. On `notification` it refetches the unread count and, if open, the list (it never renders from the event payload). A small toast is **not** shown in revision 1 (Q-NT-05).
- On `reauth` (access about to expire) or a stream error it renews the session once (`renewAccess`) and reconnects; after 3 failed attempts it stops streaming and relies on focus refetch until the next navigation.
- On reconnect / window focus it refetches the count (catch-up). Items are keyed by notification id (no duplicates).
- Sign-out closes the stream.

## Accessibility

- Bell: `aria-haspopup="dialog"`, `aria-expanded`, accessible name with the unread count.
- Panel: `role="dialog"` labelled "Notifications"; tabs are a real `tablist` (arrow keys); the list is a `list` of items; unread items announce "Unread"; the chevron has the label "Open list page for {type}".
- New notifications update a polite live region ("1 new notification") at most once per 10 s.

## Out of scope (revision 1)

System announcements, email / push, per-user notification settings (Setup › Notifications was removed from Setup on 2026-11-11), deleting / hiding notifications, inventory-service notifications (until `api-inventory` exists).
