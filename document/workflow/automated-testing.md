# Automated testing for frontend and backend changes

This policy applies to every added or changed page, component, module, function, and API.
Frontend and backend own the tests for their code. Read the selected TODO, approved
contracts, neighboring tests, package scripts, and actual test dependencies first.

## Coverage in the same change

1. List each affected page/component/module/function/API and the behavior it owns in the
   feature testing document or task record. For a fix, identify missing coverage before
   editing and add it in the same change. Keep existing tests aligned with changed behavior.
2. Add unit tests for each affected unit's observable contract, important branches, and
   error/edge cases. A page or module can be covered through its exported behavior; avoid
   tests that merely repeat implementation details. Do not omit a changed helper/function
   because a higher-level test exists.
3. Add integration coverage for each affected item through the smallest real boundary that
   exercises it. Several items may share one integration scenario when the scenario
   explicitly exercises and asserts each item. Frontend examples: page composition,
   navigation, form submission, providers, and API adapter with a controlled server.
   Backend examples: HTTP/tRPC route through validation, authorization, service and
   persistence with isolated test data. Mock external systems at a documented boundary;
   a fully mocked unit test does not count as integration coverage.
4. Map affected items to unit and integration case IDs. Include successful and relevant
   failure paths. New tests must fail for the intended regression before the fix when a
   safe reproduction is possible; do not alter assertions merely to make a failing test green.

When a runner or fixture is missing, check `document/adr/tech-stack.md` and package
manifests. Propose any new dependency through the existing review process, then have the
parent serialize installation and lockfile updates once approved. An unavailable runner is
an unmet verification prerequisite, not a passing check. Do not mark an item done until
the required unit and integration coverage can run and pass.

## Verification and handoff

Run affected unit and integration suites after every code/test change and run package
typecheck, lint, build, contract or migration checks when relevant. Before handoff, run the
full relevant package/service test suites so the changed items and their interactions pass.
Use an isolated database and deterministic fixtures for tests that write data; never run
destructive test setup against production. Bound concurrent test workers and database
connections on the 8 GB RAM / 4 vCPU production-sized environment. Record exact commands,
results, case IDs, commit/working-tree revision, and any environment limits in the feature
testing document and central TODO. A handoff is complete only when the required tests pass.

## Integration data-connection failures

Diagnose the failing data boundary and use the same root-cause ledger and three-pass limit
in [bounded remediation](remediation.md). One pass is a diagnosed correction followed by
targeted verification; repeating a command or transferring the issue between roles does
not create another pass. Stop earlier for no progress or unavailable credentials, service,
fixture, or other prerequisite. Do not spend three attempts on a known unavailable setup.

If the integration remains broken after pass three, stop with `attempt-limit`. Create or
update one `integration-blocker` ticket in `document/task/investigation/` using its
[template](../task/investigation/INTEGRATION-BLOCKER-TEMPLATE.md). Link the exact TODO,
contract revision, sanitized failure signature, environment, commands, three-pass ledger,
and next needed fact. Mark the dependent TODO blocked or needs-validation, leave tests
recorded as failing, and return the ticket for owner review. The ticket does not authorize
an automatic fourth pass or a new cross-role loop. Independent approved work may continue.
