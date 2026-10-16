# Open questions and conflicts: customer

- Feature ID / UI revision: `customer` / 2 (revision 1 questions below; [revision 2 notes](#revision-2-adr-0021-2026-10-16) at the end)
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
| P-08 | Drawer rows without a Code Name show "No code name" on the second line (revision 2: on the **first** line, see below) | ui-spec |

## Revision 2 (ADR-0021), 2026-10-16

ADR-0021 answers the header, modes, Code Name and drawer-row questions; it **supersedes Q-CUS-03** (title is the
record name; Edit is an explicit button) and **Q-CUS-02** placement (Delete is the last header button), and changes
P-08 (the code is the bold first line). P-05 (hide buttons without permission) is kept, as ADR-0021 §3 allows.

| ID | Blocking? | Question / decision taken | Default used | TODO IDs |
|---|---|---|---|---|
| Q-CUS-07 | no | When a save fails with `CUSTOMER_CODE_TAKEN` and the Code Name still held the untouched suggestion, the UI replaces it with the newly fetched suggestion and shows "C001 is already in use. C002 is suggested instead; check it, then save again." It does **not** save automatically. A code the user typed is never replaced. Is that acceptable? | As described (UX copy proposed by frontend, not a business rule) | FE-CUS-021 |
| Q-CUS-08 | no | Cancel in create mode returns to the customer that was open before Create Customer / Duplicate (User & Permission behavior); with none, it starts a fresh draft. No discard prompt on Cancel (it is an explicit discard), same as User & Permission. | As described | FE-CUS-019 |
| Q-CUS-09 | no | If `customer.nextCode` fails (e.g. partner unavailable), the Code Name stays empty with no extra message; the user can type a code. Should a hint be shown? | No hint | FE-CUS-021 |
| Q-CUS-10 | no | Legacy rows without a code (before the backfill migration runs) show "No code name" on the bold line. After ADR-0021's migration every row has a code, so this is a fallback only. | As described | FE-CUS-022 |
| A-07 | — | Automated tests: no frontend unit/integration runner is installed (tech-stack.md: Vitest planned) and this run could not add dependencies. The mapped case IDs in [testing.md](testing.md#revision-2-adr-0021-checks-2026-10-16) wait for an owner-approved runner proposal; FE-CUS-023 stays blocked. | — | FE-CUS-023 |

## Revision 3 (draft row and address card), 2026-10-16

The owner instruction of 2026-10-16 ([ui-spec revision 3](ui-spec.md#revision-3-draft-row-and-address-card)) answers
the draft-row question: the title is always "New customer" (supersedes DV-02 and the revision 2 draft-row text). The new
card removes the accordion, so **P-07** ("Has errors" tag on a collapsed item; expand on submit) no longer applies; the
red frame stays. The "Default" badge is removed, so the Q-CUS-06 badge-color decision no longer has a visible use here.

| ID | Blocking? | Question / decision taken | Default used | TODO IDs |
|---|---|---|---|---|
| A-08 | no | The mock (rev3-02) shows #1 **unchecked**. ADR-0018 / P-01 require exactly one default per type, and the owner said the default rules do not change. | A new customer shows #1 checked (as rev3-03); the checked default cannot be unticked (`aria-disabled` + hint) | FE-CUS-R3-003 |
| A-09 | no | The mock shows an enabled trash icon on #1. The existing rule keeps #1 non-removable (1–10 items). | #1 trash is shown **disabled** with the tooltip "The first invoice address cannot be removed" | FE-CUS-R3-004 |
| A-10 | no | The mock shows only Invoice Address. | Shipping Address uses the same card for consistency (owner brief) | FE-CUS-R3-002 |
| A-11 | — | Automated tests: same gap as A-07 (no frontend runner; no dependency authorization). Cases mapped in [testing.md](testing.md#revision-3-draft-row-and-address-card-checks-2026-10-16). | — | FE-CUS-R3-005 |
