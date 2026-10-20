# UI specification and delivery workflow

Confirmed by the project owner on **2026-10-11**, Asia/Bangkok.

## Roles and documents

`ui-spec` analyzes the design; `frontend` implements UI; `sa` designs service changes;
`backend` implements them; frontend completes integration. The parent coordinates the
sequence, owns shared edits, and passes documents between roles. Handoffs are durable
files, so later conversations can continue the same work. If subagents are unavailable,
the parent follows each role's skill sequentially and states that limitation.

| Artifact | Location |
|---|---|
| Frontend document templates | `document/apps/frontend/template/` |
| Actual page/feature specifications | `document/apps/frontend/<feature>/` |
| Backend document templates | `document/apps/backend/template/auth-service/` |
| Actual service/feature design | `document/apps/backend/<service>/<feature>/` |
| Architecture decisions and package ledger | `document/adr/` and `document/adr/tech-stack.md` |
| Main user flow | `document/diagram/<feature>-flow.md` |
| Shared product/API requirements | `document/spec/` |
| Latest feature pointer and task registry | `document/task/frontend-latest.md`, `document/task/index.md` |
| Central feature TODOs | `document/task/todo/<feature-id>.md` (see [conventions](../task/todo/README.md)) |
| Scope claims and cross-role handoffs | `document/coordination/tasks/`, `document/coordination/handoffs/` |
| Review reports | `document/reviews/<role>/` |
| Customer UI reports and screenshots | `document/testing/user-check/`, its `artifacts/` folder |
| Completion report | `document/task/done/YYYY-MM-DD-<feature>.md` |
| Small change log | `document/changelog/` |
| Skill requirements | `document/skills/spec/` |

`template/` is a checklist and starting format, never an approved requirement. TODO templates
only provide a starting format; create the actionable TODO in `document/task/todo/`. Create all
other listed feature documents; use a brief explanation for inapplicable topics. Additional
documents are allowed when needed. Preserve supplied template wording unless changes are
necessary; illustrative tokens, paths, fonts, and examples do not override the actual design.
Skill/agent definitions and their UI metadata remain executable configuration in `.codex/`
and `agents/`. No project output goes to root `docs/`, `.ai/`, or `user-check/` anymore.
Global/plugin skills outside this repository are not modified by project routing.

## Revision and approval

The central TODO at `document/task/todo/<feature-id>.md` records `feature-id`, `revision`,
`status`, `source`, `ui-spec`,
`dependencies`, `backend-bundles`, `approved-revision`, `approved-by`, `approved-at`,
`approval-evidence`, and `review-bundle`. Use repo-relative links and ISO timestamps with
`+07:00`. Backend TODOs also record `source-ui-revision` and their separate SA approval.
Keep empty approval fields as `none` until a real instruction approves that revision.
Record the user's words or a durable conversation reference; never infer approval from
a timer, read receipt, a checkbox set by an agent, or this workflow's creation.

| Status | Meaning |
|---|---|
| `draft` | Incomplete analysis |
| `pending-review` | Complete bundle awaiting the owner |
| `approved` | Owner approved the exact revision and listed documents |
| `in-progress` | Implementing approved TODOs |
| `blocked` | A specific item awaits a contract, answer, or approval |
| `done` | All criteria met with recorded verification |
| `superseded` | Replaced by a later revision |

A clear instruction to implement the presented/identified revision is approval for that
bundle. If the revision is ambiguous, identify the exact bundle before asking. UI approval
does not approve a later SA bundle. Approval of UI spec/TODO permits independent frontend
work; service/API/schema/flow changes need separate SA approval before dependent code.
Do not ask again when the exact design already has valid user authorization.

For changed flow, source, API, schema, or package choice, increment the affected revision,
record the change and affected TODO IDs, and require review of the changed bundle. Cosmetic
spelling/link repairs do not invalidate an otherwise unchanged design. Historical reports
are preserved; add revision history instead of discarding previous decisions.

## Finding the latest TODO

`ui-spec` creates the central TODO at `document/task/todo/<feature-id>.md`, sets
`document/task/frontend-latest.md` to the current feature ID, UI revision, that TODO path,
source, and backend bundle links, and updates its row in `document/task/index.md`.
The pointer is selection metadata; the TODO's revision and recorded approval are authoritative.
Update shared pointers serially. Editing an older task does not make it latest automatically.
The user can explicitly select another feature/revision.

For `frontend ทำตาม Todo list ล่าสุด`, read that pointer and the linked central TODO, compare
revision numbers, inspect the review bundle and package ledger, and resume unchecked items.
If the pointer is unset, report that no UI TODO has been created. If its latest revision is
unapproved, prepare the review request and complete no dependent implementation; do not
fall back to an older approved feature. If already done, report completion without inventing
new work. Never choose by filename sort or file modification time.

## Automatic continuation

This is forward continuation through approved stages. Corrections follow
[bounded remediation](remediation.md): persist one root-cause ledger across roles,
default three corrective passes including the first fix, and stop on success or a recorded
unresolved terminal outcome. Repeated handoffs need changed evidence or prerequisites.
Do not return to SA or audit the full application again merely because a check failed.

1. `ui-spec` inspects Figma/image, documents UI/components/tokens/behavior/dependencies,
   writes the frontend TODO to `document/task/todo/<feature-id>.md`, identifies backend gaps,
   and presents the UI bundle for owner review.
2. After UI approval, frontend reads the feature documents and dependency proposals. It can
   build independent approved UI while asking SA to design new/changed service requirements.
3. SA writes sequence and database diagrams, contracts, architecture, backend TODO items in
   the central TODO file, ADRs, and library/capacity proposals; the parent presents this
   bundle for separate approval.
   If services/container deployment change, infra researches their security/configuration
   before that review and its exact bundle is included. See [infra delivery](infra-delivery.md).
4. After SA approval, the parent invokes backend automatically with the approved bundle.
   Backend implements and verifies the contract, migrations, and approved dependencies.
5. The parent returns backend's completion evidence to frontend automatically. Frontend
   integrates the actual contract, verifies the UI, and updates item status and task records.
6. Frontend and backend add/update unit and integration tests for every added or changed
   page, component, module, function, and API in their scope. Run required suites to pass
   before handoff per [automated testing](automated-testing.md). Block dependent work when
   verification fails; after three diagnosed integration data-connection correction passes,
   stage the blocker in investigation and stop that cycle.
7. After tests pass, route the final frontend/backend diff to both `sec-auditor` and
   `security-auditor` for focused read-only review. Record their results for the same
   source revision and apply the [security gate](security-review.md) before code handoff.
8. Run manual-tester for changed user journeys according to its skill. Write completion
   evidence under `document/task/done/`; mark done only when required criteria are satisfied.

At a review boundary, finish and link the documents before asking the owner. Save a handoff
and return rather than waiting forever. After the owner approves, resume from the recorded
stage without requiring separate prompts for SA/backend/frontend. Existing unchanged,
approved backend capabilities can be integrated directly without regenerating diagrams.

Each handoff includes feature ID, both revisions, exact TODO IDs, approvals, source/contract
paths, dependencies, allowed code paths, expected output, and checks. Use
`document/coordination/handoffs/TEMPLATE.md`. Only one active owner edits a scope; serialize
manifests, lockfile, Prisma/composition/Docker changes through the parent integration owner.
Use worktrees for genuinely concurrent writers, not automatically for a sequential handoff.
Respect existing branch authorization; no push, merge, or deploy is implied by this workflow.

## Package decisions and capacity

Use the central package ledger with `proposed`, `approved`, `installed`, or `rejected` status.
Record package/workspace, purpose, feature/revision, official evidence, alternatives,
bundle/runtime cost, ADR link if needed, owner approval, and actual installed version.
`ui-spec` and SA propose; frontend/backend install approved packages during implementation.
The parent serializes manifests and `pnpm-lock.yaml`. Update both feature dependency docs
and the ledger. A documentation proposal alone never proves installation. Do not add a real
library for the illustrative Vendor sheet until that design is analyzed and approved.

All work targets **4 GB RAM / 2 vCPU total**. Current aggregate limits are **1.70 vCPU /
2944 MiB** ([infra/capacity.md](../infra/capacity.md)), leaving host headroom. Recalculate from Compose before changing limits/services.
Bound queries, pagination, pools, caches, SSR work, and workers; verify resource estimates
against measurements before claiming capacity guarantees.

Custom agent configuration uses `developer_instructions` per
[official OpenAI subagent documentation](https://learn.chatgpt.com/docs/agent-configuration/subagents).
Project aliases are declared in `AGENTS.md`; `.codex/agents/` is canonical and `agents/`
contains identical mirrors. A new session/reload may be needed to discover newly added roles.

## Audit investigations

Focused security reviews use security-auditor; explicit full security audits use sec-auditor;
privacy reviews use compliance-auditor. Audit invocation is independent of UI implementation.
All actionable audit findings first enter [investigation](../task/investigation/README.md)
for user review. Audit discovery does not authorize implementation or automatic dispatch.
Frontend/backend fix an explicitly selected ticket revision later. New architecture,
contracts, schema, flow, or dependencies still pass through SA and separate owner review.
Keep the investigation queue separate from frontend-latest.md and link completion evidence
back to selected tickets. Full audits retain upstream independent verification and execution
safeguards; focused reviews do not silently become full audits.
Container/config findings can be assigned to infra for a user-selected later fix.
