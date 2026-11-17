# UI specification: location-master

- Feature ID / revision: `location-master` / 1
- Status: **approved** 2026-11-16 (owner "อนุมัติ" in chat, 2026-11-16 (Q-LM-01…05 take their defaults))
- Date: 2026-11-16
- Owner request (2026-11-16, verbatim): "sa uxui ช่วยทำ spec และ adr หน้า location master หน่อยโดยหน้านี้จะมี textfield เดียวคือ Name UI หน้าเหมือน stone เลย frontend backend ช่วยทำ ui ให้หน่อย และ ทำ api และหน้าไหนมี location ให้เลือกก็ fetch จาก location จริงๆไปใช้ได้เลย"
- Source: owner text only (no new image). The layout reuses the approved Stone Master pages ([stone-master ui-spec](../stone-master/ui-spec.md), source S1), the Size page in particular (one Name field).
- SA bundle: [backend location-master](../../backend/master/location-master/architecture.md), [ADR-0053](../../../adr/0053-location-master.md)
- Central TODO: [task/todo/location-master.md](../../../task/todo/location-master.md)
- Main flow: [diagram/location-master-flow.md](../../../diagram/location-master-flow.md)

## Evidence

| Kind | What |
|---|---|
| Owner requirement | One text field **Name**; UI like Stone Master; real API; pages that choose a Location read the master |
| Existing code | Stone Master pages (`features/stone-master`), Master Code dialog placeholder `location-master` (`setup-destinations.ts`), permission leaf `location-master` (auth catalog), `DocumentKind.locations` already supports a dropdown (`Option[]`) next to `"text"` and read-only |
| Assumption (Q-LM-*) | Active switch, delete rules, which documents change, existing values; see [Open questions](#open-questions) |

## Page and route

| Item | Value |
|---|---|
| Route | `/setup/location-master` (one page, no sub-pages, so no context panel) |
| Entry | Setup › Master Code dialog tile **Location Master** (today a placeholder) |
| Breadcrumbs | Home › Setup › Location Master |
| Title | "Add Location" (new) / the saved name |
| List label | "Location List N" |
| Access | menu key `location-master`: VIEW opens the page; ADD / EDIT / DELETE / PRINT enable those buttons (disabled, still visible, without the grant). Denied: "You don't have access to Location Master". |

## Layout (same as Stone Master › Size)

- **Header**: title 24 px with the list label beside it; icon buttons Print, Excel (disabled "Excel export isn't available yet"), Duplicate, Refresh; second row right: **Create Location** (outline), **Cancel**, **Save** (primary), **Edit**, **Delete** (danger). View / create / edit mode rules as Stone Master.
- **Card**: title "Location"; **Active** switch at the right of the card header (default on). One field:
  - **Name\*** — outlined text field, 404 px wide, placeholder "e.g. Safe A", trimmed, 1–40 characters (the documents store up to 40), unique ignoring case. Errors: "Enter a name", "Up to 40 characters", "This name is already used".
- **Drawer** (right, 320 px, open by default, toggle tab): "Locations" + count badge, search "Search name...", draft row in create mode, rows = dot (green active / hollow inactive) + **Name** (bold, no second line) + "Inactive" badge; infinite scroll; empty "No locations yet" (+ "Create the first one with Create Location" with ADD).
- **Duplicate**: copies the saved record into a new draft with the **Name cleared** (names are unique).
- **Print**: simple print of Name and Active (PRINT).
- **Delete**: confirm "Delete {name}?"; see Q-LM-02.

## States

Same as Stone Master: access pending/denied, loading skeleton, empty, saving ("Saving…", form disabled), saved toast ("Location created" / "Changes saved"), conflict / not found ("This location was changed or deleted. Refresh to see the latest."), duplicate name (field error), unsaved-changes discard dialog.

## Documents that choose a Location (owner: "หน้าไหนมี location ให้เลือก")

| Document | Today | Revision 1 |
|---|---|---|
| Purchase Order (manual rows) | free text "e.g. Safe A" | **dropdown of active locations** (type to filter); a stored value no longer in the list still shows |
| Purchase (manual rows) | free text | **dropdown of active locations**, same rules |
| Purchase rows copied from Memo Stock / PO | copied, locked | unchanged (copied, locked) |
| Quotation, Reserve, Memo Out, Memo Return, Memo Out Return | from stock, read-only ("From stock only") | unchanged — nothing is chosen there |
| Memo Receive | no Location (Memo Stock is always `Memo`) | unchanged |
| Inventory › Stock Transfer Location | not built | will read this master when built (out of scope) |

- The dropdown uses the existing `AutocompleteInput`/`FormSelect` (no new component); options come from the document's `options` call (`locations`), refreshed when the list opens (like stone options).
- Blank stays allowed (Location is optional on these rows today).

## Accessibility

As Stone Master: labelled fields, the Active switch is a `switch` with its label, drawer list is a `listbox`-like list of links, focus returns to the row after save, Escape closes the discard dialog.

## Open questions

| ID | Question | Default if not answered |
|---|---|---|
| Q-LM-01 | Keep the **Active** switch (inactive locations stay on old documents but are not offered)? | Yes, as Stone Master |
| Q-LM-02 | May a location be **deleted** after documents used its name? | Yes: documents keep the name they saved (it is copied, not linked); Inactive is the usual choice |
| Q-LM-03 | Fill the master from the **names already typed** on Purchase Orders / Purchases? | Yes, once, by the migration (distinct trimmed names, ≤ 40 chars) |
| Q-LM-04 | Should **Memo** (the Memo Stock location) be a master row? | No: it is a system location set by Memo Receive, not chosen by users |
| Q-LM-05 | Is the dropdown strict (only master names) or may users still type a new name? | Strict: only active master names (or the value already stored on that row) |
