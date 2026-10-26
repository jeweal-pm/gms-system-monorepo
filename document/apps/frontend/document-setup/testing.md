# Frontend acceptance and verification: document-setup

- UI revision: 1 (pending-review)
- Reference: owner text + [reference image](source/01-reference-other-program.png) (other program); GMS page pattern from Stone Master
- TODO / API: [document-setup TODO](../../../task/todo/document-setup.md); API requires-sa

## Automated coverage (to add during implementation)

| Target / behavior | Unit case | Integration case | Command and result |
|---|---|---|---|
| Zod schema: every rule in form-guidelines | UT-DS-01 `frontend/test/document-setup/schema.test.ts` | — | not run |
| Number preview `Prefix + Separator + StartNo`, padding rule | UT-DS-02 same file | — | not run |
| Row sort by Date, unique Date, In use / Upcoming badge for "today" | UT-DS-03 `rows.test.ts` | — | not run |
| Defaults for a transaction never set up | UT-DS-04 `defaults.test.ts` | — | not run |
| Form render: view vs edit, Add row / remove row, last row not removable | UT-DS-05 `page.test.ts` (static render) | IT-DS-01 with the API adapter once SA delivers | not run |
| API adapter mapping (list/get/save, errors) | UT-DS-06 `api.test.ts` | IT-DS-02 | not run |
| Setup tile + navigation href / permission | UT-DS-07 update `test/setup/setup-destinations.test.ts`, `test/home/home-links.test.ts` | — | not run |

## Security review before handoff

| Reviewer | Source revision / changed scope | Status | Evidence / ticket IDs |
|---|---|---|---|
| `sec-auditor` | | not run | |
| `security-auditor` | | not run | |

## UI acceptance

| Case ID | Starting state | User actions | Expected result | Result |
|---|---|---|---|---|
| TC-DS-01 | user with VIEW | open Setup › Document Setup | drawer lists the transactions; first selected; read-only form | not run |
| TC-DS-02 | transaction never set up | select it | defaults shown with the "Not set up yet" notice | not run |
| TC-DS-03 | EDIT permission | Edit → change Name/Code/Start From → Save | toast "Document setup saved"; view mode shows new values; drawer shows the code | not run |
| TC-DS-04 | edit mode | + Add row, set a future Date, Prefix, Suffix, Start No | Example shows e.g. `PO-180001`; row marked Upcoming; rows sorted by Date | not run |
| TC-DS-05 | edit mode | two rows with the same Date → Save | inline "Another row already starts on this date"; focus on it | not run |
| TC-DS-06 | edit mode, changes made | pick another transaction | discard dialog; Keep editing keeps data | not run |
| TC-DS-07 | VIEW only | open page | Edit disabled; no Save | not run |
| TC-DS-08 | iPad landscape / PC | open page | drawer overlays & starts closed on iPad; pushes & open on PC | not run |
| TC-DS-09 | keyboard only | Tab through form and table, Add row, remove row | every control reachable; focus visible; remove buttons labelled | not run |
