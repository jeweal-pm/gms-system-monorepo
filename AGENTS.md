# Project agent routing

Use `document/` for all project requirements, specifications, architecture, diagrams,
task records, handoffs, reviews, test reports, and screenshots. Executable skill and
agent definitions remain in `.codex/`; `agents/` mirrors the agent definitions.
Read `document/README.md` and `document/workflow/ui-delivery.md` for documentation work.

| Prompt | Agent | Skill / definition |
|---|---|---|
| `ui-spec` | `ui-spec` | `.codex/skills/ui-spec/SKILL.md` |
| `sa`, `solution architect` | `sa` | `.codex/skills/sa/SKILL.md` |
| `frontend` | `senior-react-developer` | `.codex/skills/lead-frontend-engineer/SKILL.md` |
| `backend` | `senior-nestjs-developer` | `.codex/skills/senior-nestjs-developer/SKILL.md` |
| `manual-test`, `manual-tester`, `user test` | `manual-tester` | `.codex/skills/manual-tester/SKILL.md` |
| `sec-auditor`, `sec-audit` | `sec-auditor` | `.codex/skills/sec-auditor/SKILL.md` |
| `security-auditor` | `security-auditor` | `.codex/agents/security-auditor.toml` |
| `infra` | `infra` | `.codex/skills/infra/SKILL.md` |
| `devops` | `devops` | `.codex/skills/devops/SKILL.md` |

All actionable frontend/backend TODOs live in `document/task/todo/<feature-id>.md`;
see `document/task/todo/README.md` for conventions.
For `frontend ทำตาม Todo list ล่าสุด`, resolve `document/task/frontend-latest.md`;
read the linked central TODO and its source documents before editing. Never guess the latest
task from file modification times. A new draft must not silently select an older task.

The user authorizes orchestration for this workflow: frontend -> SA -> backend -> frontend.
Delegate scoped work when subagent tools are available. Carry the feature ID, revision,
approval evidence, TODO, contracts, and allowed paths in each handoff. If this environment
cannot launch custom roles, read that role's definition and apply its skill sequentially;
report that fallback. Do not claim an agent ran when it did not.

UI spec/TODO and changed service/API/schema/flow designs need one user approval before
dependent implementation. Approval of the exact revision starts its code work immediately;
do not add another review/approval handoff for the same bundle. Existing approved contracts
are reused as-is. A direct user instruction to fix an identified issue or ticket revision
also selects and authorizes that scope. Prepare only documents needed to make a new decision
reviewable; search and update the existing record instead of creating duplicates.

Read `document/coordination/ownership.yaml`; serialize shared manifests, lockfiles,
composition roots, Docker files, task pointers, and tech-stack updates through the parent
integration owner. Respect existing authorized branches; agent invocation alone does not
authorize committing, pushing, merging, or deployment.

Production has **4 GB RAM / 2 vCPU total**. All roles must preserve host headroom and
bounded data, pools, caches, jobs, and container resources. Read the accepted ADRs and
`document/adr/tech-stack.md`; distinguish installed libraries from proposed ones.

Frontend/backend follow `document/workflow/automated-testing.md`: add or update unit and
integration tests for each added/changed page, component, module, function, and API in
their scope, including untested code they fix. Run relevant suites to pass before handoff.
If an integration data-connection failure remains after three diagnosed corrective passes,
or progress/verification becomes unavailable earlier, record one `integration-blocker` in
`document/task/investigation/` and keep the dependent TODO unresolved.

Before frontend/backend handoff, route the final changed code through both `sec-auditor` and
`security-auditor` once on the same source revision. Do not review approved ADR/TODO documents
again or resend unchanged code as a new review. Run relevant tests for code changes. Record an
actionable finding once; when the user has authorized its fix, implement it directly without
another ticket-selection request. Do not run a full audit unless requested.

Audit findings first enter `document/task/investigation/` as one durable record. Auditors do
not edit application code. Once the user approves the ticket revision or directly instructs
the fix, the owner implements it without another selection loop. Changed
contracts/schema/flows/dependencies still require separate SA approval only when outside
the approved design. Read
`document/task/investigation/README.md`; keep this queue separate from the latest UI TODO.

For corrective work, read `document/workflow/remediation.md`. The parent persists one
root-cause ledger across all roles/sessions: at most three corrective passes by default,
initial fix included. Retry only with a diagnosed failure and new evidence/hypothesis.
Stop on success, no-progress, unavailable verification, or exhausted passes; return the
durable result rather than cycling roles. New independent findings return to investigation.
Only an explicit user-authorized extension changes the existing limit; never reset history.
After a pass succeeds, deliver the updated code and concise verification promptly; do not
write a duplicate review bundle or keep the task open for redundant reviewer passes.

When selected ADR/TODO work adds or changes container services/images/networks/storage,
the parent routes version-specific security research to infra, including manual user ADR
changes detected against document/infra/service-index.md. Drafts permit research; config
implementation uses exact approved scope and serialized shared-file ownership. SA includes
the infra bundle in relevant design review, then infra/backend/frontend resume in dependency
order. Read document/workflow/infra-delivery.md. Infra review findings first enter
investigation with owner infra; no auto-remediation or background watcher is implied.

Devops always acts as a senior DevOps engineer. Read document/workflow/devops-delivery.md
for CI/image/variable contracts. Service/ADR/infra changes route approved build and delivery
requirements to devops; parent serializes .github/**, build contexts and the delivery index.
Infra retains runtime/container security ownership. Preparing workflows does not authorize
GitHub settings changes, remote runs, publication, pushing or production deployment. A
request to reconcile local development Compose authorizes non-destructive `up --remove-orphans`
work; preserve all volumes. Findings use one investigation record and retain the shared
corrective ledger.
