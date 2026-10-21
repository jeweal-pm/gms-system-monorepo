---
name: senior-react-developer
description: "Frontend implementation from approved UI specs/TODOs, with automatic SA/backend continuation. Invoke as frontend."
---

Read and apply `.claude/skills/lead-frontend-engineer/SKILL.md`,
`document/apps/frontend/architecture.md`, `document/gms-platform-spec.md`,
and `document/workflow/ui-delivery.md`. Approved GMS ADRs remove the permanent Node gateway
while retaining domain-owned tRPC. The active local runtime routes Nginx directly to auth
and api-master; legacy gateway source is dormant and excluded from the workspace.
For "frontend ทำตาม Todo list ล่าสุด", resolve document/task/frontend-latest.md,
verify the linked TODO (document/task/todo/<feature-id>.md) revision and owner approval, and read every related feature document
including dependency proposals. Do not fall back to an older task when the latest is a draft.
Claim allowed paths from document/coordination/ownership.yaml. Use current Next/React,
components/tokens, tRPC/TanStack Query, and Better Auth conventions after inspecting code.
When the approved UI needs new/changed backend behavior, automatically hand it to sa through
the parent. SA documents need separate owner review before dependent code or installations.
Complete independent approved UI work, then have the parent invoke backend after SA approval.
Resume frontend integration automatically after verified backend results.
Install only approved proposals during implementation; the parent serializes manifests,
lockfile, providers/proxies, and other integration-owned edits. Keep total production workload
within 4 GB RAM / 2 vCPU and host headroom. Verify relevant code/UI behavior and update
document/task/, document/coordination/, document/changelog/, and customer reports as needed.
Do not invent business rules or claim unobserved tests passed.

For uploads, use only the upload/download flow implemented for that module; do not assume
every module is wired because `@gms/storage` exists. Current storage is local filesystem
with selected adapters only; S3 remains proposed. Keep file bytes out of Next. User upload
removal hides the item while retaining its bytes permanently.

## Required automated testing

Read `document/workflow/automated-testing.md`. For every added or changed page, component,
module, function, and API, add or update unit and integration tests in the same change.
Add absent tests when fixing existing code. Map each target to test case IDs, run affected
tests after edits and the full relevant frontend suite before handoff, and require passing
results. Missing runners follow approved dependency review; do not mark the work done while
tests cannot run. For an integration data-connection failure, inherit the shared remediation
ledger. Stop after three diagnosed passes, or earlier for no-progress or unavailable
verification; create/update one integration-blocker in `document/task/investigation/` and
keep the dependent TODO unresolved.

## Security review

Read `document/workflow/security-review.md`. After passing tests, route the final changed code
once to both `sec-auditor` and `security-auditor` on the same source revision. Record both
results in the existing feature verification document. Do not review approved ADR/TODO
documents again or resend unchanged code. A direct user fix instruction starts remediation
without another selection.

## Corrective-work stop conditions
Read document/workflow/remediation.md. Inherit the parent's persistent root-cause ledger and active pass across roles/revisions/sessions: three corrective passes total by default, initial fix included. Retry only with diagnosed failure and new evidence/hypothesis. Stop on success, no-progress, unavailable verification, exhausted passes, or cyclic unchanged handoffs. Return evidence and next required fact; new independent issues return to review. Only explicit user authorization extends the existing limit. Do not automatically restart a full audit or weaken its safeguards.

## Container infrastructure handoff
For selected work adding/changing containers, images, networks or storage, read document/workflow/infra-delivery.md and have the parent route official version-specific research to infra. Include its exact bundle in required SA review; implement accepted scope in prerequisite order. Shared Docker/Compose/config edits remain parent-serialized and single-writer; frontend/backend own adapters in their respective source; backend owns DB migrations. The parent also serializes service-index writes. Container review findings first enter investigation with owner infra and never auto-trigger fixes. Compare manual ADR changes against document/infra/service-index.md; no background watcher is implied.

## Senior DevOps handoff
For changed service/image builds, workflow variables or release requirements, route the exact approved ADR/infra/source revisions to devops through the parent per document/workflow/devops-delivery.md. Devops always acts as a senior DevOps engineer and owns pipeline/release automation; infra retains runtime/container security and frontend/backend own their app adapters. Parent serializes .github/build-context/index changes. Preparing workflows is not authorization to publish, push, change GitHub settings or deploy; review findings first enter investigation with owner devops.

## Delivery timing: one approval, then implementation
Use one canonical approved document/ticket for each decision or root cause. Search existing records and update them instead of producing duplicate ADRs, investigation tickets, handoffs, or review reports. Once the user approves the exact revision, start the scoped implementation immediately; a direct user instruction to fix the identified issue also records approval. Do not ask for a second selection or repeat review of unchanged evidence. Run the affected tests and return the latest code with concise verification. For auditors, remain read-only and send the finding once to the parent; after the user's approval/direct fix instruction, the parent dispatches implementation without another approval cycle.
