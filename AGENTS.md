# Project agent routing

Use `document/` for all project requirements, specifications, architecture, diagrams,
task records, handoffs, reviews, test reports, and screenshots. Executable skill and
agent definitions remain in `.codex/`; `agents/` mirrors the agent definitions.
Read `document/README.md` and `document/workflow/ui-delivery.md` for documentation work.

| Prompt | Agent | Skill |
|---|---|---|
| `ui-spec` | `ui-spec` | `.codex/skills/ui-spec/SKILL.md` |
| `sa`, `solution architect` | `sa` | `.codex/skills/sa/SKILL.md` |
| `frontend` | `senior-react-developer` | `.codex/skills/lead-frontend-engineer/SKILL.md` |
| `backend` | `senior-nestjs-developer` | `.codex/skills/senior-nestjs-developer/SKILL.md` |
| `manual-test`, `manual-tester`, `user test` | `manual-tester` | `.codex/skills/manual-tester/SKILL.md` |
| `sec-auditor`, `sec-audit` | `sec-auditor` | `.codex/skills/sec-auditor/SKILL.md` |
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

UI spec/TODO needs user approval before frontend implementation. New or changed service,
API, schema, or flow designs need separate SA-document approval before dependent code or
dependency installation. Prepare those documents and complete independent approved work
before asking. Existing unchanged, approved contracts can be reused without another review.
An instruction to implement an identified revision counts as approval for that revision;
permission to create this workflow does not approve any future feature.

Read `document/coordination/ownership.yaml`; serialize shared manifests, lockfiles,
composition roots, Docker files, task pointers, and tech-stack updates through the parent
integration owner. Respect existing authorized branches; agent invocation alone does not
authorize committing, pushing, merging, or deployment.

Production has **8 GB RAM / 4 vCPU total**. All roles must preserve host headroom and
bounded data, pools, caches, jobs, and container resources. Read the accepted ADRs and
`document/adr/tech-stack.md`; distinguish installed libraries from proposed ones.

Frontend/backend follow `document/workflow/automated-testing.md`: add or update unit and
integration tests for each added/changed page, component, module, function, and API in
their scope, including untested code they fix. Run relevant suites to pass before handoff.
If an integration data-connection failure remains after three diagnosed corrective passes,
or progress/verification becomes unavailable earlier, record one `integration-blocker` in
`document/task/investigation/` and keep the dependent TODO unresolved.

Audit findings first enter `document/task/investigation/` for user review. Auditors do
not edit application code or automatically dispatch fixes. Frontend/backend/infra consume only
explicitly selected ticket revisions; record the user's actual instruction as approval.
Changed contracts/schema/flows/dependencies still require separate SA approval. Read
`document/task/investigation/README.md`; keep this queue separate from the latest UI TODO.

For corrective work, read `document/workflow/remediation.md`. The parent persists one
root-cause ledger across all roles/sessions: at most three corrective passes by default,
initial fix included. Retry only with a diagnosed failure and new evidence/hypothesis.
Stop on success, no-progress, unavailable verification, or exhausted passes; return the
durable result rather than cycling roles. New independent findings return to investigation.
Only an explicit user-authorized extension changes the existing limit; never reset history.

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
GitHub settings changes, remote runs, publication, pushing or deployment. Findings first
enter investigation with owner devops and retain the shared corrective ledger.
