# Testing: location-master (UI rev 1)

Follows [automated-testing](../../../workflow/automated-testing.md).

| ID | Level | Checks |
|---|---|---|
| UT-LM-01 | unit | form schema: Name trimmed, 1–40 chars, required message; Duplicate clears Name |
| UT-LM-02 | unit | drawer row text (Name only), Inactive badge, list label "Location List N" |
| UT-LM-03 | unit | Master Code tile opens `/setup/location-master`; breadcrumbs Home › Setup › Location Master; menu key `location-master` |
| UT-LM-04 | unit | PO / Purchase kinds use a Location dropdown from `options.locations`; a stored name missing from the list still shows |
| IT-LM-01 | integration | page through the real tRPC client against seeded caches: list, create, duplicate-name field error, save, delete confirm |
| IT-LM-02 | integration | PO row: choose a location, Save sends the name; an unknown name from the server maps to the row's Location field error |
| Manual | browser | create / rename / deactivate / delete; the PO dropdown shows the new name after the list is reopened |

Design fidelity is Stone Master › Size (no new design source).
