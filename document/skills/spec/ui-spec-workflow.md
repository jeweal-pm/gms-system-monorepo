# UI spec and service-delivery requirements

- Owner-confirmed date: 2026-10-11, Asia/Bangkok
- Implemented workflow: [ui-delivery.md](../../workflow/ui-delivery.md)
- UI skill: [.codex/skills/ui-spec/SKILL.md](../../../.codex/skills/ui-spec/SKILL.md)
- SA skill: [.codex/skills/sa/SKILL.md](../../../.codex/skills/sa/SKILL.md)

Analyze supplied Figma URLs/screenshots into page regions, alignment, colors, borders,
typography, spacing, tables, component behavior, source evidence, and dependency choices.
Use the repository's current stack and components. Record measured values versus estimates
and unresolved rules. Propose new packages in document/adr/tech-stack.md and the feature
dependency document so the next frontend invocation reads them before implementation.

Create frontend feature documentation from document/apps/frontend/template/ and service
documentation from document/apps/backend/template/auth-service/. Put every actionable
frontend/backend TODO at `document/task/todo/<feature-id>.md`; templates are formats, while
design work remains grouped by feature/service. All generated documents, diagrams, handoffs,
reports, and screenshots live under document/.

The owner selected these workflow decisions:

1. Frontend automatically requests SA design for missing/changed backend capabilities,
   then backend implementation and frontend integration after the relevant review.
2. UI spec/TODO and subsequent SA documents need separate owner review before related code.
   Complete the review bundle before asking; reuse already-approved unchanged contracts.
3. Create a new Solution Architect skill/subagent named sa, alongside ui-spec.
4. Separate templates from actual feature documents and migrate root docs/, .ai/, and
   user-check/ documentation into document/, repairing references. Skill requirements also
   live in document/skills/spec/; executable role configuration stays under .codex/ and agents/.
5. New libraries start proposed; frontend/backend install them during approved implementation
   with serialized manifest/lockfile changes. Approval and actual installation are distinct.

The prompt `frontend ทำตาม Todo list ล่าสุด` uses the explicit latest-task pointer and exact
revision/approval evidence. No page design or package is approved merely by creating this
workflow. Service designs include editable sequence/ER diagrams, ADRs, contracts, backend
TODOs, and the shared production capacity constraint of 4 GB RAM / 2 vCPU with host headroom.
