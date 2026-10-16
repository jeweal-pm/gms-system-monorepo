# Backend verification: <service> / <feature>

- Source UI revision / SA revision: <revision> / <revision>
- Approved API/schema/authorization references: <links>

## Automated coverage

List every added or changed module, function, and API. Add absent tests when fixing
existing code and update stale tests in the same change. Follow
[automated testing](../../../../workflow/automated-testing.md).

| Target / behavior | Unit case ID and test path | Integration case ID and test path | Real boundary / isolated fixture | Command and result |
|---|---|---|---|---|

Shared integration scenarios must exercise and assert every mapped target. Record the
exact affected-suite results after edits and final full relevant service suite results
before handoff. Failing or unavailable required tests keep the TODO blocked/needs-validation;
link any integration-blocker ticket.

## Service acceptance

| Case ID | Rule / operation / TODO ID | Setup | Action | Expected outcome | Check type | Evidence / result |
|---|---|---|---|---|---|---|

Cover meaningful contract, validation, permission, duplicate/concurrent, failure/retry,
migration, and resource-bound cases as applicable. Discover scripts from package.json;
record typecheck/lint/build and applicable integration commands. Mark planned checks as
not run until observed. Do not claim a test runner exists without checking manifests.
