# UI specification: app-navigation

- Feature ID / revision: `app-navigation` / 3 (revision 1 approved 2026-10-15; revision 2 = owner change, see [Revision 2](#revision-2-partner-master-context-and-no-setup-tabs))
- Status: **approved / in progress** (see the [central TODO](../../../task/todo/app-navigation.md) for approval evidence)
- Source: four unique owner-supplied images (not Figma), 2026-10-15, kept in [source/](source/). Images 3 and 4 were byte-identical, so one copy is kept.
- Viewport / source dimensions: see [Source and evidence](#source-and-evidence). **Assumption:** the 3840×2160 images are device-pixel ratio 2, so the viewport is 1920×1080 CSS px. The shell geometry supports this: the sidebar measures exactly 470 + 2 device px (= 235 + 1 CSS px, the existing `--spacing-gms-sidebar: 236px`) and the topbar 94 + 2 device px (= 48 CSS px, the existing `--spacing-gms-topbar`).
- Inspection evidence: every image viewed with the image reader on 2026-10-15; full-resolution crops of the sidebar, tiles, modal grid and component sheet; pixel runs, colors and alpha read with a throwaway `sharp` script in the session scratchpad (sharp 0.35.5 is already present as a transitive dependency of Next; nothing installed, nothing written to the repo). No Figma file, tokens, or CSS were supplied.
- Owner request (2026-10-15, verbatim): "frontend ช่วยทำ sidebar ให้หน่อย และ เมื่อกดที่ setup จะกลายเป็นหน้าที่ฉันส่งไปให้" (build the sidebar; when Setup is clicked it should become the page I sent). The parent routed this to ui-spec because no spec existed; it is **not** approval of this revision.
- Requirements / main flow: this file, [open questions](open-questions.md), editable flow [app-navigation-flow.md](../../../diagram/app-navigation-flow.md)
- Review bundle: this file, [open-questions.md](open-questions.md), [design-system.md](design-system.md), [conventions.md](conventions.md), [form-guidelines.md](form-guidelines.md), [data-fetching.md](data-fetching.md), [error-handling.md](error-handling.md), [dependencies.md](dependencies.md), [testing.md](testing.md), [flow](../../../diagram/app-navigation-flow.md); central TODO: [`document/task/todo/app-navigation.md`](../../../task/todo/app-navigation.md)
- Supersedes (on approval only): the sidebar content/IA of `user-permission` FE-UP-017 (sources 06-sidebar/07-topbar/08-shell). The FE-UP-017 topbar, avatar menu, session guard and mobile drawer are **kept**.

## Source and evidence

| # | File | Supplied as | SHA-256 (prefix) | Size (device px) | CSS size (assumed) | Shows |
|---|---|---|---|---|---|---|
| S1 | [01-sidebar-collapsed-rail.png](source/01-sidebar-collapsed-rail.png) | image 1 | `266d8a45a279176a` | 112×2160, RGB | 56×1080 | Collapsed icon-only rail: logo mark, 11 module buttons and a ⇆ toggle |
| S2 | [02-sidebar-component-states.png](source/02-sidebar-component-states.png) | image 2 | `6ba751b42ff24bdd` | 492×886, RGBA | Figma canvas screenshot at **≈0.52×** (a 40 px rail button measures 21 px) | Component sheet: `standard-sidebar-item` default/hover/active; icon-only button states; `Navigation button` (icon + label) states; `Module rail` button with dark tooltip "Home"/"Setup"; `sidebar-item-collapse` closed (›) and open (⌄) for five parents and their children |
| S3 | [03-setup-landing-sidebar-expanded.png](source/03-setup-landing-sidebar-expanded.png) | images 3 and 4 (identical, `f93bb3199463fa0e`) | `f93bb3199463fa0e` | 3840×2160, RGB | 1920×1080 | Full page: expanded sidebar with Setup active, topbar `Home › Setup`, content "Setup" with four colored tiles |
| S4 | [04-master-code-modal.png](source/04-master-code-modal.png) | image 5 | `95b0e5c8824d1ba9` | 3840×2160, **RGBA** | 1920×1080 | "Master Code" modal: white card with seven grey tiles on a translucent scrim (the page behind is transparent in the export) |

## Source quality

| Kind | What it covers |
|---|---|
| **Measured from pixels (M)** | Exact in the image; for the design they are exact up to anti-aliasing and the DPR-2 assumption: sidebar 235+1 px, item 208×36 px at x 14, item pitch 40, section gap 15, group label → first item 4, colors `#FCFCFC`, `#EDEDED`, `#F3F3F3`, `#1C252E`, `#95A0A9`, `#E3E7EC`; rail 55+1 px, button 40×40 at x 8, pitch 46, `#F7F7F7`, border `#E8E8E8`; tile 54×54, tile colors, Setup tile pitch 176; modal scrim **rgb(52 62 62 / 0.40)** (alpha 102/255 read directly), card ≈662×473, grid pitch 152×124 |
| **Estimated (E)** | Font sizes from cap heights (IBM Plex Sans Thai is the site font, owner 2026-10-14), radii from corner curves, shadows from falloff, icon sizes from glyph extents, all S2 values (scaled canvas) |
| **Existing code facts (C)** | `AppShell`, `Sidebar`, `Topbar`, `Breadcrumbs`, `GmsMark` (FE-UP-017), `navigation.ts` model, `/modules/[slug]` placeholder, `SetupTabs` (C-02), `/setup/{user-permission,vendor,customer}` routes, `globals.css` `gms-*` tokens, lucide-react 1.52.0 installed |
| **Assumptions / proposals** | Everything listed in [open-questions.md](open-questions.md): the cut-off "Account…" group and a following "Report" group, rail ↔ group mapping, group-button behavior in the rail, toggle placement when expanded, Partner Master destination, placeholder routes, badge handling |
| **Not in source** | Expanded-sidebar collapse control, rail active state, sub-item active state, Setup tile hover/focus, modal close control, tablet/mobile layouts, loading states, keyboard behavior, the content of the cut-off sidebar bottom |

Screenshots cannot establish the icon library. The glyphs (cart with up/down arrow, "cards", "packages", "arrows-exchange", "file-certificate") match **Tabler Icons** more closely than Lucide. This spec uses the closest **installed Lucide** glyphs (no new package); see [dependencies.md](dependencies.md) and Q-NAV-09.

## Decisions in this revision (summary)

| ID | Decision | Authority |
|---|---|---|
| D-01 | One new sidebar IA (below) replaces the FE-UP-017 sections (Main/Partner Master/Stone Master/Purchase Order/Report library + pinned Setup). | S3, S2 |
| D-02 | Setup becomes a normal top item that links to a **new landing page `/setup`** (S3). It stays active on `/setup`, every `/setup/*` route, and the Setup-owned placeholder routes. | Owner request; S3 |
| D-03 | Items without a page link to `/modules/<slug>` placeholders (existing pattern). New slugs are registered in the navigation model so the placeholder shows the right title and breadcrumbs. | Existing code (FE-UP-017, FE-CUS-003) |
| D-04 | The Master Code tile opens a modal (S4); its tiles navigate. Partner Master opens **`/setup/vendor`** (Vendor and Customer tabs sit next to each other in the existing Setup tab bar). | S3/S4; Q-NAV-04 |
| D-05 | Collapsible parents use the **disclosure** pattern; the parent of the active child opens automatically. | S2; WAI-ARIA APG |
| D-06 | ≥ 768 px: the user can switch between the expanded sidebar (236 px) and the collapsed rail (56 px). The choice is remembered **per browser** in `localStorage` (convenience only; default expanded). < 768 px: the existing drawer, always expanded. | S1, S3; existing drawer |
| D-07 | Red badge dots (Home, Approve, Quotation) are **not rendered** in revision 1: there is no count/notification contract. Backend gap recorded (Q-NAV-06, deferred SA handoff). | S3; no contract |
| D-08 | **Superseded by D-11 (revision 2).** `SetupTabs` stays unchanged on `/setup/user-permission`, `/setup/vendor`, `/setup/customer`; the `/setup` landing page has no tab bar (S3). The "Setup" breadcrumb on those pages gets a link to `/setup`. | S3; approved features |
| D-09 | No new package, no backend/SA work required for revision 1. | This analysis |

## Revision 2: Partner master context and no Setup tabs

Owner instruction (verbatim): "เวลาเข้าหน้า Partner master แล้ว Sidebar จะกลายเป็น UI แบบนี้ ตัว tab ข้างบนจะหายไปแล้วเอาออกทุกหน้าเลย เมื่อกดที่ Parter master จะกลับไปยังหย้า Setup เปิด modal master code ไว้". Sources: [05-partner-master-context-sidebar.png](source/05-partner-master-context-sidebar.png) (image 6, 2092×1174, ≈DPR 1.09) and [06-setup-tabs-removed.png](source/06-setup-tabs-removed.png) (image 7, the tab bar to remove).

| ID | Decision |
|---|---|
| D-10 | On `/setup/vendor` and `/setup/customer` (≥ md) the sidebar is the collapsed rail **plus a context panel** (236 px, `#FCFCFC`, 1 px `#EDEDED` right border): title "Setup" (≈20 px semibold), a "Partner master" row (`Receipt` icon, 15 px label, `ChevronDown`), and its children Vendor / Customer indented behind a 1 px vertical guide line; active child = `gms-nav-active` background, regular weight (image 6). "Vender" is spelled "Vendor" (DV-03). |
| D-11 | `SetupTabs` (C-02) is removed from every page (user-permission, vendor, customer) and the component is deleted. |
| D-12 | The "Partner master" row is a link to `/setup?dialog=master-code`: the Setup landing opens the Master Code modal on arrival and removes the parameter (`router.replace("/setup")`), so reload/Back does not reopen it. Closing returns focus to the Master Code tile. |
| D-13 | On a context page the rail's ⇆ and group buttons open the **full expanded sidebar for that page only**; its "Collapse sidebar" returns to rail + panel. The stored rail preference (D-06) is not changed; the next page starts in its default layout. Below md the drawer shows the normal expanded sidebar (no context panel). |

| D-14 | **Revision 3** (owner: "อยากให้ tootip ตรงนี้โชว์ submenu ด้วย" (images 8–9, 2026-10-15); source [07-rail-tooltip-submenu-request.png](source/07-rail-tooltip-submenu-request.png)): the tooltip of a rail **section** button (Pre-Sale … Report) shows the section title and its pages as links, disclosure children indented under their parent label (same black `gms-tooltip` style, min width 188 px, title row level with the button, kept inside the viewport). It is hoverable (150 ms grace when moving from the button), reachable with Tab right after the button, closes on Escape (focus back to the button), on leaving it, or when a link is clicked. Clicking the section button still expands the sidebar (Q-NAV-02). Link tooltips (Home, Dashboard, Setup, Approve, ⇆) are unchanged. |

Model: `ContextNav` / `contextNavFor(pathname)` in `navigation.ts`; component `features/home/sidebar-context-panel.tsx`; wiring in `AppShell`.

## Page structure and layout

### Shell (S3)

`[Sidebar 236 | Topbar 48 over content]`, full viewport height, as the existing `AppShell`. Only the sidebar list and the content area scroll; the topbar is fixed. Topbar is **unchanged** from FE-UP-017 and matches S3 (48 px, `#E3E7EC` 1 px bottom border, 24 px side padding (M: breadcrumb starts 25 px right of the border), breadcrumb `Home › Setup`, clock, fullscreen, bell, avatar 30 px).

### Expanded sidebar (S3, S2)

| Property | Value | Prov. |
|---|---|---|
| Width / background / right border | 235 + 1 px / `#FCFCFC` / 1 px `#EDEDED` | M (= existing) |
| Logo | GMS logo ≈130×34 px, top ≈21.5 px, left 14 px | M (existing `GmsMark` 131.5×36 is within 2 px; keep) |
| First item (Home) top | 85 px from viewport top | M (existing layout gives ≈83; keep existing) |
| Item | 208×36 px, left inset 14 px, radius ≈8 px; icon 18 px stroke 1.5 at padding 10 px; gap 8 px; label 15 px `#1C252E` | M; radius E (= existing `SidebarLink`) |
| Item pitch | 40 px (gap 4) | M (= existing) |
| Item active | background `#F3F3F3`, label semibold | M (S3 Setup) |
| Item hover | background `#F3F3F3`, regular weight | M (S2) |
| Group label | 13 px / 17, `#95A0A9`, 4 px above the first item; 15 px between sections | M (= existing) |
| Disclosure parent | same as item + chevron at right: `ChevronRight` closed, `ChevronDown` open, glyph ≈5.5×10 px (≈20 px icon, stroke 1.5), `#1C252E`, right padding 10 | M (S3) / E (S2) |
| Sub-item | no icon; label starts at the parent label's x (36 px inside the item); ≈14 px, `#656B71`; row ≈30 px; first sub-item centre ≈35 px below the parent centre | E (S2 at 0.52×) |
| Badge dot | 14 px circle, glossy red gradient (`#FC9D9C` top → `#D71717` → `#A82222` bottom; emoji-like), right edge 12 px inside the item, vertically centred | M — **not rendered** in rev 1 (D-07) |
| Overflow | list scrolls vertically, scrollbar hidden (existing `scrollbar-none`); the bottom of S3 is cut off at "Sale" + a partial group label "Account…" | M |

### Collapsed rail (S1, S2)

| Property | Value | Prov. |
|---|---|---|
| Width / background / border | 55 + 1 px / `#FCFCFC` / 1 px `#E8E8E8` (proposal: use the sidebar's `#EDEDED` token, DV-05) | M |
| Logo mark | ≈31×31 px, top ≈20.5 px, centred (left square of the GMS logo, no wordmark) | M |
| Button | 40×40 px at x 8, radius ≈12 px, background `#F7F7F7`; icon 24 px (glyph ≈17×18), stroke ≈1.5, `#1C252E` | M; radius/icon E |
| Pitch / first button | 46 px (gap 6) / top 77 px | M |
| Button count | 12 = 11 modules + ⇆ toggle; the toggle follows the last module (not pinned to the bottom) | M |
| Hover / active | S2 icon-only states: default `#F7F7F7`, hover `#F3F3F3`, active `#F3F3F3`. S1 shows no active button. | M (S2 colors) |
| Tooltip | to the right, ≈8 px gap, black `#000000` pill with a left-pointing arrow, white ≈13–14 px label, ≈32 px tall, radius ≈6 | M color; size E (S2) |

### Setup landing page `/setup` (S3)

| Property | Value | Prov. |
|---|---|---|
| Layout | single column, horizontally centred in the content area (title centre = tile-row centre = content centre, M) | M |
| Title "Setup" | `<h1>` ≈24–26 px semibold `#1C252E`; cap top 49.5 px below the topbar | M position; size E |
| Tile row | 4 items, pitch 176 px (proposal: item width 144 + gap 32); tile tops 128 px below the topbar | M |
| Tile | 54×54 px, radius ≈16, soft shadow (≈ `0 2px 10px rgb(0 0 0 / 0.10)`), white icon ≈32 px stroke 1.5 | size M; rest E |
| Tile colors | Company Profile `#5040DB`, User and Permission `#14A460`, Notifications `#006A70` (= `gms-primary`), Master Code `#737780` | M |
| Label | centred under the tile, cap top 14.5 px below it; ≈14 px medium `#1C252E`; one line ("User and Permission" is the widest at 129.5 px) | M position; size E |
| Icons | Company Profile gear (`Settings`), User and Permission user+lock (`UserLock`), Notifications bell (`Bell`), Master Code `</>` (`CodeXml`) | glyph match |

### Master Code modal (S4)

| Property | Value | Prov. |
|---|---|---|
| Scrim | `rgb(52 62 62 / 0.40)` over the page | **M (alpha read)** |
| Title "Master Code" | outside and above the card, centred, white `#FFFFFF`, ≈18–20 px regular; 32 px between its baseline area and the card | M position/color; size E |
| Card | ≈662×473 px, white, radius ≈30 px, faint shadow (≈ existing `shadow-gms-overlay`); title + card are centred vertically as a group | M size/position; radius E (corner fit 28–32) |
| Grid | 4 columns, column pitch 152 px, row pitch 124 px; first tile top 39 px inside the card; ≈26 px side inset to the column cells; rows left-aligned (row 2 has 3 items) | M |
| Tile | 54×54, radius ≈16, `#737780`, **no shadow**, white icon ≈26 px | M size/color; E rest |
| Label | as the Setup tile label | M |
| Items (order) | Partner Master (`FileUser`), Currency (`Banknote`), Stone Master (`Crown`), Location Master (`MapPinned`), Certificate Master (`FileBadge`), Labor Name (`Pickaxe`), Sale Person (`UserRound`; Lucide has no user-with-$ glyph) | S4 |
| Empty space | ≈230 px of empty card below row 2 (fixed frame in the design) | M |
| Close control | none visible | — (see [Interaction](#interaction-and-behavior)) |

### Responsive behavior (proposal; not in source)

| Width | Sidebar | Setup landing | Master Code modal |
|---|---|---|---|
| ≥ 1024 | Expanded 236 or rail 56 (remembered) | 4 tiles in one row | Card 662 wide, min-height ≈472 (as S4) |
| 768–1023 | Same as above (no automatic collapse, Q-NAV-08) | 4 tiles (row is 32 + 4×144 + 3×32 = 704 px max; content ≥ 532 px with the expanded sidebar → **2 columns below 704 px content width**) | Card `min(662px, 100vw − 32px)`; 4 columns while ≥ 640 px wide, else 3 |
| < 768 | Hidden; topbar menu opens the existing drawer (expanded sidebar, collapsibles work, no rail toggle) | 2 columns, 24 px side padding | Card full width minus 16 px gutters; 2 columns below 480 px; height = content; scrolls inside if taller than the viewport |

No horizontal page scroll at 390/768/1024/1280/1920.

## Navigation IA and route mapping

Kinds: **link** (existing page), **landing** (new page in this feature), **placeholder** (`/modules/<slug>`, existing generic page; new slugs must be added to the model), **disclosure** (button that opens children; no route). "New" = slug not yet in `navigation.ts`.

| Section (label shown) | Item | Kind | Route | Lucide icon (closest) | Notes |
|---|---|---|---|---|---|
| (none) | Home | link | `/` | `House` | Active only on `/`. S3 badge not rendered |
| | Dashboard | placeholder | `/modules/dashboard` | `ChartColumn` | existing slug |
| | Setup | **landing** | `/setup` | `Settings` | active on `/setup`, `/setup/*`, and Setup-owned placeholders (below) |
| | Approve | placeholder | `/modules/approve` | `FileCheckCorner` | new; badge not rendered |
| Pre-Sale | Quotation | placeholder | `/modules/quotation` | `Receipt` | existing slug; badge not rendered |
| | Reserve | placeholder | `/modules/reserve` | `FileCheck` | existing slug |
| Memo | Memo Receive | placeholder | `/modules/memo-receive` | `FileDown` | new (the old "Memo In"/`memo-in` stays only in the Home shortcut fallback) |
| | Memo Return | placeholder | `/modules/memo-return` | `RotateCcwSquare` | existing slug |
| | Memo Out | placeholder | `/modules/memo-out` | `FileUp` | existing slug |
| | Memo Out Return | placeholder | `/modules/memo-out-return` | `RefreshCcwDot` | existing slug |
| | Memo Outstanding | disclosure | — | `FileClock` | children below |
| | ↳ From Vendor | placeholder | `/modules/memo-outstanding-from-vendor` | — | new; design text "From Vender" corrected (DV-03) |
| | ↳ From Customer | placeholder | `/modules/memo-outstanding-from-customer` | — | new |
| Purchase Order | Purchase Order (PO) | placeholder | `/modules/purchase-order` | `ReceiptText` | existing slug |
| | Purchase (PU) | placeholder | `/modules/purchase` | `ShoppingBasket` | existing slug; source glyph = cart with down arrow |
| | Purchase Outstanding | placeholder | `/modules/purchase-outstanding` | `ClipboardClock` | new |
| Inventory | Load to Stock | placeholder | `/modules/load-to-stock` | `CalendarClock` | new |
| | Merge/Split | placeholder | `/modules/merge-split` | `UnfoldVertical` | new |
| | Stock Transfer Location | placeholder | `/modules/stock-transfer-location` | `Blend` | new |
| | Stock Adjustment | placeholder | `/modules/stock-adjustment` | `FileDiff` | new |
| | Barcode Printing | placeholder | `/modules/barcode-printing` | `Barcode` | new |
| Sale | Sale | placeholder | `/modules/sale` | `ShoppingBag` | new slug (matches catalog leaf `sale`); source glyph = cart with up arrow |
| **Account** (assumed, Q-NAV-01) | Account Outstanding | disclosure | — | `FileClock` | S2 |
| | ↳ O/S Payable | placeholder | `/modules/os-payable` | — | new |
| | ↳ O/S Receivable | placeholder | `/modules/os-receivable` | — | new |
| **Report** (assumed, Q-NAV-01) | Stock Movement | disclosure | — | `FileChartColumn` | S2 |
| | ↳ Primary Stock | placeholder | `/modules/stock-movement-primary` | — | new |
| | ↳ Consignment Stock | placeholder | `/modules/stock-movement-consignment` | — | new |
| | Closing Stock | disclosure | — | `Blend` | S2 (same glyph family as Stock Transfer Location) |
| | ↳ Primary Stock | placeholder | `/modules/closing-stock-primary` | — | new |
| | ↳ Consignment Stock | placeholder | `/modules/closing-stock-consignment` | — | new |
| | Sale Report | disclosure | — | `ReceiptText` | S2 |
| | ↳ Compare With Costing | placeholder | `/modules/sale-report-compare-with-costing` | — | new |
| | ↳ Shareholder Report | placeholder | `/modules/sale-report-shareholder` | — | new |
| | ↳ Commission Report | placeholder | `/modules/sale-report-commission` | — | new |

**Setup-owned destinations** (from the landing page and the Master Code modal):

| Entry | Destination | Kind | Breadcrumbs |
|---|---|---|---|
| Company Profile tile | `/modules/company-profile` | placeholder (existing slug) | Home › Setup › Company Profile |
| User and Permission tile | `/setup/user-permission` | link (existing) | Home › Setup › User and permission (existing; Setup gets `href`) |
| Notifications tile | `/modules/notifications` | placeholder (new) | Home › Setup › Notifications |
| Master Code tile | opens the modal | button | — |
| Partner Master | `/setup/vendor` | link (existing) | Home › Setup › Vendor (existing; Setup gets `href`) |
| Currency | `/modules/currency` | placeholder (existing slug) | Home › Setup › Master Code › Currency |
| Stone Master | `/modules/stone-master` | placeholder (new) | Home › Setup › Master Code › Stone Master |
| Location Master | `/modules/location-master` | placeholder (new) | Home › Setup › Master Code › Location Master |
| Certificate Master | `/modules/certificate-master` | placeholder (new) | Home › Setup › Master Code › Certificate Master |
| Labor Name | `/modules/labor-name` | placeholder (new) | Home › Setup › Master Code › Labor Name |
| Sale Person | `/modules/sale-person` | placeholder (new) | Home › Setup › Master Code › Sale Person |

Breadcrumb rule for sidebar placeholders: `Home › <section title> › [<disclosure parent>] › <item>` (untitled top section: `Home › <item>`). "Home" links to `/`, "Setup" links to `/setup`; other intermediate crumbs are plain text (existing `Breadcrumbs` behavior). `/setup` itself: `Home › Setup`. "Master Code" is plain text (the modal has no route; Q-NAV-05).

**Collapsed-rail modules** (default mapping, Q-NAV-02). The rail lists modules in the expanded order; icons are matched by meaning, so the clipboard-list glyph (S1 position 8) moves to the end:

| # | Module | Kind in rail | Icon (Lucide) | S1 glyph |
|---|---|---|---|---|
| 1 | Home | link `/` | `House` | house (1) |
| 2 | Dashboard | link | `ChartColumn` | bar chart (2) |
| 3 | Setup | link `/setup` | `Settings` | gear (3) |
| 4 | Approve | link | `FileCheckCorner` | document with check badge (4) |
| 5 | Pre-Sale | group | `ShoppingCart` | cart (5) |
| 6 | Memo | group | `StickyNotes` | "cards" (6) |
| 7 | Purchase Order | group | `FileText` | document (7) |
| 8 | Inventory | group | `Boxes` | boxes (9) |
| 9 | Sale | group | `ShoppingBag` | cart with up arrow (10) |
| 10 | Account | group | `Wallet` | wallet (11) |
| 11 | Report | group | `ClipboardList` | clipboard list (8) |
| 12 | Expand sidebar | toggle | `ArrowLeftRight` | ⇆ (12) |

## Component inventory

| ID | Region / component | Existing implementation | Props / states | Source |
|---|---|---|---|---|
| N-01 | `AppShell` | `features/home/app-shell.tsx` (FE-UP-017) | adds `collapsed` preference; renders `Sidebar` (expanded) or `SidebarRail` (collapsed) at ≥ md; drawer unchanged < md; skeleton unchanged (expanded width) | S1, S3 |
| N-02 | Navigation model | `features/home/navigation.ts` | new typed IA: sections → items (`link`/`disclosure` with children), rail modules, placeholder slug catalog (labels + breadcrumb chain + `ownerSection`), `isNavItemActive` extended with `activeHrefs`; `navigationGroups` (Home fallback) untouched | S2, S3 |
| N-03 | `Sidebar` (expanded) | `features/home/sidebar.tsx` | sections with group labels; `SidebarLink` (default/hover/active/focus); `SidebarDisclosure` (closed/open, contains active child); pinned bottom collapse toggle at ≥ md (hidden in the drawer); scroll active item into view on mount | S3, S2 |
| N-04 | `SidebarDisclosure` | new (in `features/home/`) | `button[aria-expanded][aria-controls]` + chevron; child `ul` hidden when closed; children are `SidebarSubLink` (default/hover/active `aria-current="page"`) | S2 |
| N-05 | `SidebarRail` | new | logo mark link to `/`; 11 `RailButton`s + toggle; scrolls vertically if the viewport is shorter than ≈620 px | S1 |
| N-06 | `RailButton` + `RailTooltip` | new | link or button; states default/hover/focus/active (contains current route); tooltip on hover (≈150 ms delay) and on keyboard focus (immediate), hidden on Escape/blur/leave; tooltip rendered in the top layer (`popover="manual"`) so the rail overflow does not clip it | S1, S2 |
| N-07 | `useSidebarCollapsed` | new hook | reads/writes `localStorage["gms.sidebar.collapsed"]` (`"1"`/`"0"`) inside try/catch; server/hydration snapshot = expanded; syncs across tabs via the `storage` event | — (proposal) |
| N-08 | `GmsMark` | `features/home/gms-mark.tsx` | add a `variant="mark"` that shows only the left square of `/gms-logo.png` (CSS crop of the existing 263×72 asset; no new asset unless the owner supplies one, Q-NAV-10) | S1 |
| N-09 | `Topbar` / `Breadcrumbs` | existing | unchanged; pages pass the new breadcrumbs | S3 |
| N-10 | Setup landing page | new `app/setup/page.tsx` + `features/setup/setup-landing.tsx` | `<h1>Setup</h1>` + tile grid; 3 link tiles + 1 button tile | S3 |
| N-11 | `SetupTile` | new `features/setup/setup-tile.tsx` | `as="link" \| "button"`, `color`, `icon`, `label`, `shadow` (landing yes, modal no); states default/hover (label underline, proposal)/focus-visible ring 2 px `gms-primary` around icon+label, radius 12 | S3, S4 |
| N-12 | `MasterCodeDialog` | new `features/setup/master-code-dialog.tsx` | native `<dialog>` + `showModal()`; `aria-labelledby` the white title; 7 link tiles; closes on Escape, backdrop click, tile activation, and a visually hidden "Close" button that appears on keyboard focus; focus returns to the Master Code tile | S4 |
| N-13 | `SetupTabs` | `features/setup/setup-tabs.tsx` (C-02) | **unchanged** | approved features |
| N-14 | Module placeholder | `app/modules/[slug]/page.tsx` | unchanged component; resolves the new slugs via N-02 | existing |

Typography, colors and radii are defined as tokens in [design-system.md](design-system.md); components must use tokens, not hex values.

## Interaction and behavior

### Navigation and active state

- Sidebar and rail links are `next/link`; the current item has `aria-current="page"` and the active style.
- Setup is active for `/setup`, `/setup/*`, and the Setup-owned placeholder hrefs (Company Profile, Notifications, and the five Master Code placeholders). A disclosure child is active on its exact href.
- In the drawer, activating a link closes the drawer (existing `onNavigate`).
- On mount and after navigation, the active sidebar item is scrolled into view (`block: "nearest"`), so a deep item such as Barcode Printing is visible.

### Collapsible sub-menus (disclosure)

- Parent row = `<button type="button" aria-expanded aria-controls="<sub-list id>">` with the parent icon, label and chevron (`aria-hidden`). It is not a link and has no route.
- Enter/Space toggle; Tab moves through visible items in order; children of a closed parent are not in the tab order (`hidden`). No arrow-key roving: the sidebar stays a `nav` list, not an ARIA `menu`/`tree` (APG disclosure navigation pattern).
- When the current route is a child, its parent is open on load and after navigation; opening is additive (other open parents stay open). Users may close a parent that contains the active child.
- Open/closed state is in-memory only (not persisted). Several parents may be open.
- The parent row does not get the active style when a child is active (not in the source; Q-NAV-03); the child does.

### Collapse / expand (≥ 768 px)

- Rail toggle (⇆, last rail button, `aria-label="Expand sidebar"`) → expanded; expanded-sidebar toggle (⇆, pinned at the bottom of the expanded sidebar, 40×40 rail-button style, `aria-label="Collapse sidebar"`, tooltip "Collapse sidebar") → rail (Q-NAV-07). Both are plain buttons whose label states the action (no `aria-pressed`), with `aria-controls` pointing at the sidebar container.
- After toggling, focus moves to the toggle in the other layout so keyboard users keep their place.
- Width change animates 150 ms (`transition-[width]`); disabled under `prefers-reduced-motion: reduce`.
- Preference: `localStorage["gms.sidebar.collapsed"]`, default expanded; unavailable storage (private window, blocked) → expanded, no error. On first paint the server renders expanded, so a collapsed user may see one frame of the expanded sidebar before hydration (accepted limitation; documented in [error-handling.md](error-handling.md)).
- Rail group buttons (Pre-Sale … Report) **expand the sidebar, open nothing else, scroll that section's label into view and focus its first item** (Q-NAV-02 default). Rail links navigate.
- Rail active: the button for the current module (Home/Dashboard/Setup/Approve by route; a group when the route belongs to one of its items) shows `#F3F3F3`. Links get `aria-current="page"`; group buttons get visually hidden text "(current section)".

### Tooltip (rail)

- Visual duplicate of the button's accessible name (`aria-label`), so it is `aria-hidden` and not announced twice.
- Shows on pointer hover after ≈150 ms and immediately on keyboard focus; stays while the pointer is over the button; hides on blur, pointer leave, or Escape (WCAG 1.4.13). Positioned to the right of the button, vertically centred, from `getBoundingClientRect()`; uses the native Popover API top layer to escape the rail's scroll container. If `popover` is unsupported, the tooltip is not shown (labels remain available to assistive tech).
- Not shown in the drawer or the expanded sidebar (labels are visible there), except the collapse toggle.

### Setup landing

- Tiles in reading order: Company Profile, User and Permission, Notifications, Master Code. Each tile is one focusable element (icon + label); the first three are links, Master Code is a `button` with `aria-haspopup="dialog"`.
- No permission filtering of tiles (Q-NAV-11); destination pages keep their own guards (e.g. user-permission/vendor/customer access states).

### Master Code modal

- Opens with `showModal()` from the Master Code tile; the rest of the page becomes inert; initial focus goes to the first tile (Partner Master).
- Closes on Escape (`cancel`), click on the scrim outside the title and card, the focus-visible "Close" button, or when a tile is activated (navigation starts and the dialog closes). Focus returns to the Master Code tile on close without navigation.
- Tab cycles inside the dialog (native modal behavior); page scroll is locked while open.
- Tiles are links (open in the same tab); middle-click/ctrl-click open a new tab as normal links.

### Badges

Not rendered (D-07). The topbar bell dot (FE-UP-017, decorative) is unchanged.

## Deviations from the design

| ID | Design shows | Implement instead | Why |
|---|---|---|---|
| DV-01 | Red badge dots on Home, Approve, Quotation | Not rendered | No count/notification contract (D-07, Q-NAV-06) |
| DV-02 | Icons appear to be Tabler (cart-up/down, cards, packages) | Closest installed Lucide glyphs listed in the IA table | No new package (Q-NAV-09) |
| DV-03 | "From Vender" | "From Vendor" | Spelling; the rest of the app uses "Vendor" |
| DV-04 | Rail order: …, document, **clipboard-list**, boxes, cart-up, wallet | …, document, boxes, cart-up, wallet, **clipboard-list** (Report) | Rail follows the expanded order (Q-NAV-02) |
| DV-05 | Rail border `#E8E8E8`, sidebar border `#EDEDED` | Both `gms-border` `#EDEDED` | One container; difference is 5 levels (Q-NAV-12, cosmetic) |
| DV-06 | Active/hover `#F3F3F3` (existing token `gms-nav-active` is `#F5F5F6` from 06-sidebar) | Set `gms-nav-active` to `#F3F3F3` | Newer source; also changes topbar icon hover by 2 levels (Q-NAV-12) |
| DV-07 | Group label `#95A0A9` on `#FCFCFC` (contrast ≈2.6:1, below WCAG AA 4.5:1) | Keep as approved in FE-UP-017 | Previously approved; owner may choose `gms-text-secondary` (Q-NAV-13) |
| DV-08 | No close control on the modal | Visually hidden "Close" button, shown on keyboard focus | Escape/backdrop alone are not discoverable for every user |
| DV-09 | Modal card fixed ≈473 px tall | Keep min-height ≈472 at ≥ 768; content height below | Mobile layout not in source |

## Data, permissions, and backend

No server data is needed: the IA is static frontend configuration; session data comes from the existing `AppShell` guard. Permission-based hiding of menu items is **not** in this revision (current behavior; the permission catalog v1 does not contain most of the new keys). Badges need a new contract. Both are recorded as deferred SA topics in [data-fetching.md](data-fetching.md) and the [SA handoff](../../../coordination/handoffs/app-navigation-sa.md) (**not dispatched**; nothing in revision 1 depends on it).

## Dependencies and traceability

- Packages: none new ([dependencies.md](dependencies.md)); central ledger unchanged.
- TODO IDs: FE-NAV-001 (model) · 002 (expanded sidebar + disclosure) · 003 (rail + tooltip + toggle + preference) · 004 (drawer regression) · 005 (logo mark) · 006 (Setup landing) · 007 (Master Code dialog) · 008 (breadcrumbs/active wiring on existing setup pages and placeholders) · 009 (tokens) · 010 (responsive) · 011 (verification) · FE-NAV-012 (badges, **deferred, requires-sa**). See the [central TODO](../../../task/todo/app-navigation.md).
- Tests: [testing.md](testing.md) TC-NAV-01…24.
