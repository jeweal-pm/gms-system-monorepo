# Frontend verification plan: GMS platform migration

- UI revision: none; SA revision: 1; status: approved-design; see central TODO gates; execution: not run (design only)
- Follow [automated testing](../../../workflow/automated-testing.md) and [security review](../../../workflow/security-review.md) when implementation is approved.

| Case | Acceptance | Planned evidence |
|---|---|---|
| GP-FT-01 | Login, activation and logout retain current visible behavior after Nginx routing | Page/component unit and real-browser integration with cookie jar |
| GP-FT-02 | Migrated master procedures preserve result/error shapes and bounded lists | Typed client unit and API integration per feature |
| GP-FT-03 | SSR forwards user credential and refresh `Set-Cookie` without cross-user cache leak | Server route unit and two-user integration |
| GP-FT-04 | Concurrent refresh is single-flight; 401/403/503 mapping has no redirect loop or mutation replay | Client state unit and browser/integration cases |
| GP-FT-05 | Online revoked license denies, transient outage UI follows API decision for grace 0/default 2 days | Browser and API integration after remote contract exists |
| GP-FT-06 | Old proxy route can be restored during observation window; target route is same-origin | Staging cutover/rollback and request-log evidence |

Every changed page, component, module and function receives current unit/integration coverage before handoff, then both focused security reviews of the final changed revision. Manual tester runs for changed journeys when required by its skill. No test, browser run or security review is claimed by this planning document.
