# UI specification: app-shell-tabs

- Feature ID / revision: `app-shell-tabs` / 1
- Status: **approved** (owner 2026-11-02 "อนุมัติ app-shell-tabs revision 1").
- Owner request: "uxui ช่วยเขียน spec App Shell – Tabs โครงหน้าหลักของระบบ ที่ให้เปิดหลายหน้าพร้อมกันเป็นแท็บแบบเบราว์เซอร์ ผู้ใช้สลับไปมาระหว่างงานได้โดยข้อมูลที่กรอกค้างไว้ไม่หาย และปิดทีละแท็บหรือปิดทั้งหมดได้ frontend ช่วยทำ ui หน่อย". Answers Q-TAB-01…04 in [open-questions.md](open-questions.md).
- Sources (owner GMS design, 2026-11-02, in [source/](source/)):

  | File | SHA-256 prefix | Shows |
  |---|---|---|
  | `01-tabs-open.png` | `9a39b88061e209a4` | Quotation with 14 tabs open |
  | `02-tabs-disabled.png` | `76b1910e9a913390` | The bar with nothing to list |
  | `03-tab-bar.png` | `661d19ef1727702d` | The bar close up |
  | `04-tab-states.png` | `c11f5eafe110983d` | Tab: default, hover, active |
  | `05-scroll-arrows.png` | `11b80beb7c6b41d8` | ← → |
  | `06-count-states.png` | `7576a6e46886d858` | Count box: enabled, disabled |
  | `07-close-all-states.png` | `8ea647c1f99e9c76` | Close all: default, hover, disabled |

- Decision: [ADR-0037](../../../adr/0037-app-shell-tabs.md) (Accepted). TODO: [task/todo/app-shell-tabs.md](../../../task/todo/app-shell-tabs.md). Tests: [testing.md](testing.md).
- Frontend only: no API, database, service or package change.

## What it is

The App Shell (sidebar + top bar) gets a **tab bar**. Every page the user opens becomes a tab, like browser tabs. The user moves between tabs and finds each page exactly as left: typed but unsaved form data, an open row panel, the scroll position. Tabs close one at a time or all at once.

## Layout (source 01, 03)

The tab bar fills the top bar from the sidebar edge to the clock (date · flag · bell · full screen · avatar stay on the right):

```
[ ← | Company Profile ⓧ | Branch ⓧ | … | Stone Code ⓧ (active) | … | → ]  [ 14 ⌄ ]  [ ⓧ Close all ]   ● date  🇺🇸 🔔 ⛶ (SA)
```

| Part | Look (source 03–07) | Behaviour |
|---|---|---|
| Tab | Title + circled ⓧ; thin dividers between tabs; rounded top corners. Default: light background, grey title. Hover: grey background. **Active**: teal tint background, bold dark title. | Click: show that page. ⓧ: close that tab. A tab with unsaved changes shows a dot before its ⓧ (Q-TAB-03). The full title shows as a tooltip; long titles end with "…". |
| ← / → | Plain arrows at the ends of the strip | Shown when the tabs overflow; scroll the strip by about one tab; disabled at each end. The active tab always scrolls into view. |
| Count box `14 ⌄` | Bordered box with the number of open tabs and a chevron. Disabled: grey (source 06). | Opens a list of every tab (title, unsaved dot, ⓧ). Click a row to switch; ⓧ closes it. Disabled when only one tab is open. |
| ⓧ Close all | Icon + text; hover grey pill; disabled grey (source 07) | Closes every tab and opens Home as the only tab. Disabled when Home is the only tab. |

Source 02 shows the strip empty with the count and Close all disabled: the state while the tab list loads after sign-in, and the look of the disabled controls.

## Rules

| ID | Rule |
|---|---|
| T-01 | **One tab per page** (Q-TAB-01). A tab is identified by its URL path; its query (e.g. memo outstanding filters) stays with the tab and comes back when switching to it. Opening a page that already has a tab (sidebar, link, breadcrumb, Create New, a daybook entry) switches to that tab and keeps its data. A different saved document (`/memo/memo-out/A` vs `/memo/memo-out/B`) is a different tab. |
| T-02 | **Kept alive.** Hidden tabs stay mounted in the browser (React `Activity`, ADR-0037). Their typed data, row panels, pickers and scroll position stay; their background work (timers, listeners, live queries) pauses until shown again. |
| T-03 | **Titles.** The page's name from its last breadcrumb (e.g. "Stone Code", "Memo Out"). A saved document adds its number: "Memo Out · MO-1"; a new one shows "New Memo Out". |
| T-04 | **Limit 15** (Q-TAB-02). Opening a 16th page shows "Close a tab to open another (15 tabs open)" and stays on the current tab. Nothing closes by itself. |
| T-05 | **Unsaved changes** (Q-TAB-03). Closing a tab with unsaved changes asks "Discard unsaved changes in {title}?". Close all asks once: "Discard unsaved changes in {n} tabs?". Cancel keeps everything open. |
| T-06 | **Closing the active tab** shows the tab to its right, else to its left. Closing the last tab opens Home. |
| T-07 | **Reload / sign-in** (Q-TAB-04). The tab list (paths, titles, which is active) is kept per user in this browser and reopens after a refresh or the next sign-in. Only the active tab loads at once; the others load when first shown. Unsaved data can't survive a reload. Signing out keeps the list for that user; another user on the same browser has their own list. |
| T-08 | **Address bar and Back / Forward** follow the active tab. The browser's own Back / Forward moves between pages as now and opens or switches tabs by T-01. |
| T-09 | **Where tabs apply**: every page inside the App Shell (Home, Setup, Pre-Sale, Memo, …). The login page has no tabs. A saved document whose page navigates to its new id after the first save (`/memo/memo-out` → `/memo/memo-out/<id>`) keeps the same tab, which takes the new path and title. |
| T-10 | **Access.** A tab only shows what its page already allows; a page the user can no longer open shows its normal "no permission" message. |

## Accessibility

- The strip is a `tablist`; each tab is a `tab` with `aria-selected`, and its ⓧ is a separate button named "Close {title}".
- Keyboard: Left / Right move between tabs, Enter opens, Delete closes the focused tab.
- The count box is a menu button.
- Dialogs use the shared confirm dialog.
- Keyboard focus rings follow the existing focus-modality rule.

## Not in revision 1

- Dragging tabs to reorder.
- Pinning tabs.
- Opening a tab in a new browser window.
- Keeping unsaved data across a browser reload.
- Middle-click to close.
