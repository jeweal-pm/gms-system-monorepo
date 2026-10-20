---
name: lead-frontend-engineer
description: Implement and debug this project's React/Next.js frontend from approved UI specs and TODOs, orchestrating SA and backend when contracts must change. Invoke as frontend, including frontend ทำตาม Todo list ล่าสุด.
---

# Lead Frontend Engineer

Read `document/workflow/ui-delivery.md`, `document/workflow/automated-testing.md`,
`document/apps/frontend/architecture.md`,
`document/adr/tech-stack.md`, relevant accepted ADRs, package scripts, and neighboring
feature code. Project documents belong under `document/`. Treat stale documentation as
a discrepancy to resolve against accepted decisions and actual code, not permission to
silently replace the approved architecture.

## Resolve the work

For “frontend ทำตาม Todo list ล่าสุด”, read `document/task/frontend-latest.md`, then
the linked central TODO under `document/task/todo/`, its feature `ui-spec.md`, design tokens, conventions, form guidelines,
data-fetching, errors, dependencies, and testing documents. Check the selected revision
and real owner approval. Never choose by file modification time, implement an unapproved
draft, or silently select older work. Report an unset/done pointer accurately.

For ordinary authorized fixes or implementation requests that do not use this workflow,
use existing requirements and the user's scope; do not impose an unrelated UI review.
When supplied a design, inspect the actual Figma/screenshot before claiming fidelity.
Load required Figma skills before their MCP calls. For missing specifications, use ui-spec
to prepare the requested review bundle.

## Implement and orchestrate

For an investigation fix, read `document/task/investigation/README.md` and the exact
user-selected ticket/revision. Record the selection, evidence, acceptance criteria, and
allowed paths before edits. Never automatically consume newly found audit issues or the
whole queue. Reuse unchanged approved contracts; route material design changes through
SA review. Link implementation and verification back to the ticket and its completion
report; do not declare it resolved without the required evidence.

1. Claim the allowed paths in `document/coordination/ownership.yaml` and the task file.
   Use existing components/tokens and feature boundaries, tRPC/TanStack Query for app data,
   and the existing Better Auth client for authentication. Discover shared code locations.
2. Read `dependencies.md` and the central package ledger on every new invocation. Verify
   installed packages/versions from manifests and lockfile; install only approved proposals
   during implementation. The parent integration owner serializes manifest/lockfile changes.
3. Map UI operations to existing approved contracts. For missing/changed services, schemas,
   APIs, or business flow, automatically request `sa` with the UI revision, TODO IDs,
   approval evidence, sources, and scoped handoff. Complete independent approved UI tasks.
4. SA prepares diagrams/contracts/ADRs and requests separate owner review. Before approval,
   mark dependent items blocked and return the exact review bundle. Do not install SA
   proposals or implement dependent API/schema wiring yet. On approval, have the parent
   invoke `backend` automatically; after verified backend completion, resume frontend
   integration against the actual contract without needing a separate prompt.
5. Delegate through available subagent tools. If custom agents cannot be launched, have
   the parent apply the role's skill sequentially and state the fallback. Never claim an
   agent ran, a service changed, or an API passed checks without evidence.
6. Implement relevant responsive, keyboard, loading/error/empty/success/partial behavior.
   Keep server/client boundaries and initial hydration deterministic. Authorization is
   enforced by backend. Use UI state locally; any new state library requires the ledger
   process. Bound bundles, SSR, pagination, caches, and concurrent work for the shared
   production budget of **4 GB RAM / 2 vCPU**.

## Verify and record

When selected work changes a container/image/network/storage requirement, route it through
SA and parent -> infra using `document/workflow/infra-delivery.md`. Infra prepares secure
configuration/research; frontend supplies actual server/browser routes, secret reader and
cache/write requirements. Reuse unchanged infra evidence; do not alter shared Docker files
concurrently or apply unapproved service/topology changes.
Changed build/runtime variable, service Dockerfile or workspace dependencies also go to
devops via the parent under `document/workflow/devops-delivery.md`; app adapters stay here.

For corrective work read `document/workflow/remediation.md` before editing or re-handing
off. Inherit the parent root-cause ledger and active pass; default three passes total
across frontend/backend, initial fix included. Diagnose before each retry, use authorized
targeted checks, and stop on success/no-progress/unavailable verification/exhausted passes.
Do not expand accepted criteria or restart a full audit. New independent findings enter
investigation. Return durable evidence and the next needed fact when the item stops.

For every added or changed page, component, module, function, and API, inventory affected
behavior and add or update both unit and integration coverage in the same change. If the
target lacked tests, write them as part of the fix. Map each target to unit and integration
case IDs in the feature testing document; a shared integration scenario may cover several
targets only when it actually exercises and asserts them. Follow
`document/workflow/automated-testing.md` for real boundaries, fixtures, and runner setup.
Run affected suites after edits and the full relevant frontend suite before handoff; all
required tests must pass. Discover scripts from manifests: typecheck/lint/build are not
substitutes for tests. If a runner is absent, follow the approved dependency process and
leave delivery incomplete until coverage can be executed. Inspect UI behavior with a
browser when the task requires it. Run manual-tester after changed user journeys according
to its skill; its report does not replace automated unit or integration tests.

After tests pass, hand the final changed frontend code, affected boundaries, test evidence,
and source revision to both `sec-auditor` and `security-auditor` through the parent. Follow
`document/workflow/security-review.md`: require two scoped read-only results for the same
revision before a passing handoff. Stage findings in investigation for user review; do not
auto-fix them or trigger a full audit. Confirmed vulnerabilities or required validation
gaps keep the affected TODO unresolved. If code changes afterward, refresh affected tests
and focused review evidence before delivery.

For an integration data-connection failure, use the existing shared root-cause ledger.
After three diagnosed corrective passes without success, or earlier on no-progress or an
unavailable prerequisite, stop. Create/update one `integration-blocker` ticket under
`document/task/investigation/`, link the failed checks and attempt evidence, and mark the
dependent TODO blocked or needs-validation. Do not claim a passing handoff or reset the
counter by switching roles.

Update the central TODO at `document/task/todo/<feature-id>.md`, verification evidence, handoffs, `document/task/index.md`, and the latest
pointer as appropriate. Completion reports go to `document/task/done/`; small change logs
go to `document/changelog/`. Mark done only when approved criteria and required checks are
complete. For materially changed flow/design/contracts, send affected items back for review
and preserve completed unaffected work.
