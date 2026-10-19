# Open questions: stone-master (UI revision 1)

Defaults are used if not answered. "Blocking" = changes the data model or API, so SA needs the answer (or the default) before approval.

| ID | Type | Question | Default if not answered | Affects |
|---|---|---|---|---|
| Q-SM-01 | blocking | Should codes be suggested with a running number (like Vendor V001)? | **No.** The design codes are short names (DIA, RD, 1.0), so the user types every code. Codes are unique per page. | FE-SM-004, SA-SM-04 |
| Q-SM-02 | blocking | The Stone Name design shows "Sizes\*" with the placeholder "Select stone group". Is that field **Stone Group** (your text), and do Sizes belong to **Shape** (the "Add Sizes Available\*" picker)? | **Yes:** Stone Name = Code, Name, Stone Group\*, HSN. Shape = Code, Name, Sizes Available\* (from the Size page). | FE-SM-006/007, SA-SM-03 |
| Q-SM-03 | blocking | Both example stone codes contain a size (RD-**1.0**-RD-D-EX-VVS1), but the parts list has no Size. Add a Size part? | **Yes:** an optional Size part after Name. Its options are the sizes available on the chosen Shape. Default order: Name, Size, Shape, Color, Cutting, Clarity, Quality. | FE-SM-008, SA-SM-05 |
| Q-SM-04 | blocking | Permissions: one menu key for all 9 pages, or one per page? | **One key**, `stone-master` (already in the permission catalog). A user who can edit Stone Master can edit all 9 pages. | FE-SM-003, SA-SM-02 |
| Q-SM-05 | blocking | If a part's code changes later (e.g. DIA → DM), should existing Auto stone codes change too? | **No.** The stone code is saved as text when it is saved. Opening and saving it again in Auto mode rebuilds it. | SA-SM-05 |
| Q-SM-06 | non-blocking | Code format? | 1–20 characters: letters, digits and `. - /`. Spaces are not allowed. Stored in UPPERCASE. A manual stone code may be up to 60 characters. | form-guidelines |
| Q-SM-07 | non-blocking | HSN format? | Optional, digits only, 4–8 digits. | form-guidelines |
| Q-SM-08 | non-blocking | Deleting a record that is used elsewhere (a group used by a stone name, a size used by a shape, …)? | **Blocked** with the message "This {page} is used by other records. Turn off Active instead." | SA-SM-06 |
| Q-SM-09 | non-blocking | List order in the drawer? | By code, A→Z. | SA-SM-07 |
