# Open questions and conflicts: customer

- Feature ID / UI revision: `customer` / 1
- Status: pending-review (answers not recorded)
- Source: [three supplied screenshots](source/) (see [ui-spec.md](ui-spec.md#source-and-evidence)); governing decision [ADR-0018](../../../adr/0018-customer-master-partner-service.md) rev 1 (Accepted)
- Central TODO: [customer.md](../../../task/todo/customer.md)

ADR-0018 already answers the big questions (service, delete policy, lists, buttons, field rules,
permissions). What remains is UI detail the design and the ADR do not show. **None of the questions
below blocks implementation**: each has a default that frontend will build unless the owner says
otherwise. An answer that changes flow, source, API or schema creates UI revision 2.

## Conflicts with ADR-0018

No conflict that requires re-opening the ADR. Points for the parent and SA to note:

| ID | Observation | Handling | Affected IDs |
|---|---|---|---|
| A-01 | The design contradicts the ADR in several places (drawer title, draft row, search placeholder, State/City dropdowns, Country input, Excel, breadcrumb) | ADR wins; recorded as DV-01…DV-12 in [ui-spec.md](ui-spec.md#deviations-from-the-design-adr-0018-and-owner-decisions) | FE-CUS-005..009 |
| A-02 | ADR §3 says Email is required and ≤ 254 but does not state a **format** check | UI validates email format (as user-permission does); the SA draft also uses `z.email()` (SA-CUS-05) — resolved if SA review keeps it | FE-CUS-008 |
| A-03 | ADR §5 places the Delete button but not where; it only says "like delete user". In user-permission the trigger is in a "Viewing …" banner, not the toolbar | Proposal: toolbar (Q-CUS-02) | FE-CUS-005, 012 |
| A-04 | ADR §5 requires the sidebar link to point to `/setup/customer`, but `AppShell` builds every sidebar link as `/modules/<slug>` | Small `frontend-home` change (optional `href` per navigation item); cross-scope handoff | FE-CUS-003 |
| A-05 | ADR follow-up step 2 assigns `document/diagram/customer-flow.md` to SA, while the ui-spec skill normally writes the main flow | SA has drafted [customer-flow.md](../../../diagram/customer-flow.md); the screen-level states (Duplicate, Print, discard confirm) are in [ui-spec.md](ui-spec.md#main-user-flow) for SA to merge (SA-CUS-09) | — |
| A-06 | Phone "same as user-permission" (ADR §3) means the current US/TH selector only. Customers may be international. | Default keeps US/TH; Q-CUS-01 | FE-CUS-006 |

## Questions for the owner

| ID | Blocking? | Question | Default if unanswered | TODO IDs |
|---|---|---|---|---|
| Q-CUS-01 | no | Phone country codes: user-permission offers only **US +1 and TH +66** (default US, as in the design). Is that enough for customers, or do you need every country? (All countries needs a dial-code list: either the proposed `libphonenumber-js` DEP-UP-01 or a hand-made table.) | US and TH only, US default (same as user-permission) | FE-CUS-006 |
| Q-CUS-02 | no | Where should **Delete** go? Proposal: a red "Delete" button in the header toolbar, between Refresh and Save, shown only for a saved customer and users with DELETE. After deleting, the page returns to a new customer draft. | As proposed | FE-CUS-005, 012 |
| Q-CUS-03 | no | Edit mode is not in the design. Proposal: title **"Edit Customer"** and primary button **"Save"** for a saved customer; title **"Customer"** with no primary button for users who can only VIEW. | As proposed | FE-CUS-005, 006 |
| Q-CUS-04 | no | Position of the new **Customer** tab in the Setup tab bar. Proposal: right after "User and permission". | As proposed | FE-CUS-002 |
| Q-CUS-05 | no | Only a 1920-wide desktop is supplied. Accept the responsive proposal in [ui-spec.md](ui-spec.md#responsive-behavior-proposal-not-in-source-q-cus-05) (same as user-permission, address cards stack below ~1000 px)? | As proposed; built last (FE-CUS-017) | FE-CUS-017 |
| Q-CUS-06 | no | The green "Default" badge text in the design is hard to read (contrast ~1.8:1). OK to use darker green text `#166534` on the same light green? | Darker text | FE-CUS-016 |

## Proposals adopted unless the owner objects

These fill small gaps in the design; they are listed so the owner can see them in review.

| ID | Proposal | Where |
|---|---|---|
| P-01 | "Set as default address": checking moves the default; the default cannot be unchecked; removing the default item makes #1 the default | [ui-spec](ui-spec.md#interaction-and-data) |
| P-02 | Removing an address needs no confirmation (nothing is saved until Create/Save) | ui-spec |
| P-03 | Duplicate and Print use the **saved** customer, not unsaved edits; Duplicate asks to discard unsaved edits first | ui-spec toolbar table |
| P-04 | Unsaved-changes confirmation also applies to switching customers, the draft row and Duplicate (the ADR names only Refresh) | [error-handling](error-handling.md) |
| P-05 | Buttons without permission are hidden (Excel is the only disabled one) | ui-spec |
| P-06 | Error copy in English, for example "Name is required" (the design shows "Error message") | [form-guidelines](form-guidelines.md) |
| P-07 | A collapsed address item with errors shows a red frame **and** a "Has errors" tag; on submit such items expand automatically | ui-spec DV-12 |
| P-08 | Drawer rows without a Code Name show "No code name" on the second line | ui-spec |
