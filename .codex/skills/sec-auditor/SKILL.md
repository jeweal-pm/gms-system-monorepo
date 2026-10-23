---
name: sec-auditor
description: Review security or perform an explicitly requested full audit using Cloudflare security-audit methods. Stage findings in document/task/investigation for user review and later frontend/backend remediation. Invoke as sec-auditor or sec-audit.
---

# Sec Auditor

Read `AGENTS.md`, `document/README.md`, `document/adr/tech-stack.md`, the relevant
accepted ADRs, and `document/task/investigation/README.md`. This skill adapts the
pinned Cloudflare skill preserved in [UPSTREAM-SKILL.md](UPSTREAM-SKILL.md).
See [integration and provenance](../../../document/skills/spec/sec-auditor-integration.md).

## Choose the mode

- Default to guidance for focused questions, changed-code reviews, and investigations.
  Load the relevant upstream reference and trace actual code. Do not silently turn a
  focused review into a full audit.
- Frontend/backend pre-handoff reviews follow
  `document/workflow/security-review.md`. Inspect the exact changed source revision and
  affected trust boundaries read-only. Return scope, evidence, limits, ticket IDs, and
  `clear`, `advisory`, `blocked`, or `needs-validation`. A clean review creates no ticket.
  Do not claim a security pass when a required boundary was not checked.
- An explicit full/codebase audit, penetration test, or request for full report artifacts
  selects the upstream six-phase audit. Read `UPSTREAM-SKILL.md` completely before starting.
  If the requested mode is genuinely ambiguous, ask one focused question.
- Installing or invoking this role alone does not authorize an audit of live services,
  application edits, dependency installation, publishing, or deployment.

## Project evidence

Inspect the actual Next.js frontend, NestJS HTTP gateway/auth services, Better Auth,
tRPC contracts, Prisma/PostgreSQL, and Docker configuration before assuming behavior.
Use the upstream web/auth, client-side, RPC/messaging, data-isolation/lifecycle,
cloud/deployment, supply-chain, and availability references when relevant. Load other
domain references only when the target contains those surfaces.

Distinguish confirmed trust-boundary failures from hypotheses and hardening suggestions.
Record `confirmed`, `needs_validation`, or `rejected`; assign vulnerability severity only
to confirmed findings. Cite file/line, concrete source-to-sink trace, prerequisites,
impact, and remediation. Unknown deployment or organisational facts remain explicit
validation gaps. Never infer a vulnerability solely from a missing preferred practice.

## Stage findings before remediation

All actionable audit results, including focused reviews, first enter
`document/task/investigation/` using its template. The parent writes a sanitized,
reviewable ticket per finding, records source revision and owner (`frontend`, `backend`,
`infra`, `devops`, `sa`, `integration`, or `compliance`), and links the evidence. Candidates start
`pending-review`; do not mark user approval yourself. Preserve unresolved validation
gaps without severity; rejected candidates remain in audit evidence/disposition records.
Ticket hardening recommendations separately with category `hardening`, verdict
`not-applicable`, and no vulnerability severity; exclude them from upstream findings.json.
Do not create findings or tickets merely to populate the folder when no issue was found.

The user explicitly selected this repository folder. Full runs use ignored raw output
`document/task/investigation/sec-auditor/run-<N>/`; confirm the entire run is ignored
before writing. Keep scratch, upstream JSON, architecture, and all six-phase reports
there. Curated tickets outside that ignored run tree are the user's authorized project
documents. They must exclude credentials, personal data, and unnecessary exploit payloads.
This output-location adaptation does not relax upstream execution or evidence safeguards.

Audits never dispatch automatic code fixes. After the user selects a ticket and revision,
the parent may invoke frontend/backend/infra with that exact scope and approval evidence.
Docker/container findings are assigned to infra; it researches compatible configuration
under `document/workflow/infra-delivery.md` and shared edits remain parent-serialized.
For service/schema/flow/package changes, SA prepares the design bundle and obtains its
separate approval before dependent implementation. Do not repoint `frontend-latest.md`
to investigation work. Later fixes link their completion report back to the ticket;
resolution requires verification evidence, not merely an implementation claim.

## Full audit safeguards

Read `document/workflow/remediation.md` for post-fix verification and audit-record
corrections. Verify the selected finding/affected boundaries, reuse valid unchanged
evidence, and finish after required checks; do not trigger another full audit automatically.
New independent issues are pending-review tickets, not reasons to keep rewriting the
selected fix. Maintain upstream independence; exhausted/no-progress record corrections
terminate a full run as incomplete with explicit gaps, never fabricated success.

Follow all six upstream phases, profile/budget rules, coverage criticism, fresh candidate
verification, final verification, and required report/schema validation. Use independent
subagents when the full workflow requires them; batch work within available slots
(currently four including the parent). Only the parent writes shared retained artifacts;
workers receive unique scratch areas. Never fabricate an independent verification.
If capabilities are unavailable, record the precise limitation and an incomplete run.

Target-controlled code execution requires the upstream OS-enforced sandbox, no external
network, allowlisted environment, read-only target/toolchain, bounded scratch and CPU,
memory, processes, disk and time, plus safe artifact promotion. If any prerequisite is
missing, stay with static inspection and mark affected claims `needs_validation`.
Do not use application credentials, live endpoints, shared services, or install target
dependencies to test a hypothesis. Keep application source read-only during audits.

Production is **4 GB RAM / 2 vCPU total**. Assess aggregate container/workload limits,
host headroom, pools, cache sizes, pagination and concurrency using actual evidence.
Audit runners must also have explicit low resource bounds.

Native Windows Node lacks the upstream CLI's required safe-file flags. Use the documented
Linux validator runner; do not patch out safe reads or report a Windows CLI failure as
a valid audit. A full audit completes only after required phases/artifacts and both
original upstream validators pass; otherwise record `run_status: incomplete` and why.

## One finding record and direct remediation handoff

Search the investigation queue by root cause before creating a ticket; update or link the canonical record instead of issuing duplicates. The auditor remains read-only. Once the user approves the ticket revision or directly instructs the parent to fix it, the parent dispatches implementation immediately without another selection gate. Reuse the same ticket and review evidence; request another focused review only for changed security code, new evidence, or explicit user request. Do not expand a focused review into a repeated audit cycle.
