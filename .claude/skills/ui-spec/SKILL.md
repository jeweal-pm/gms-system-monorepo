---
name: ui-spec
description: Analyze a Figma URL or supplied screenshot into a page specification, component and token inventory, library proposals, and a revisioned frontend TODO for this project. Use ui-spec for design analysis and implementation planning before frontend work.
---

# UI Spec

Produce reviewable documents from the actual supplied design. Read
`document/workflow/ui-delivery.md`, `document/adr/tech-stack.md`, the relevant ADRs,
`document/apps/frontend/architecture.md`, and existing feature documents first.
Write feature output to `document/apps/frontend/<feature>/` using every file in
`document/apps/frontend/template/` as a starting checklist, except the TODO, which goes to `document/task/todo/<feature-id>.md`. Read a template when writing
its corresponding document; preserve useful project conventions and replace examples.
For an irrelevant section, explain why it does not apply instead of inventing a feature.

## Inspect the source

- For a Figma URL, identify the file/node and retrieve actual design context and a screenshot
  when the tools are available. Load `figma:figma-design-to-code` before `get_design_context`;
  load `figma:figma-use` before `use_figma`. Design inspection grants no permission to modify
  the Figma file. If access fails, record the limitation and ask for the missing source.
- For a local image, inspect it with the image viewer. For an attached image, inspect the
  attachment itself. Record its dimensions, viewport, and source in `ui-spec.md`.
- Distinguish values measured from Figma, values estimated from pixels, existing code,
  user requirements, and assumptions. Screenshots cannot establish exact font families,
  hidden interactions, mobile behavior, permissions, or API rules. Flag missing behavior
  that changes the flow; do not invent it or promise pixel-perfect fidelity without evidence.

## Describe and plan

Describe page regions, alignment, sizes, responsive rules, typography, spacing, colors,
border/divider thickness and style, radii, shadows, icons, and reusable tokens. Inventory
components including table columns, cell formats, sorting/filtering/pagination, selection,
and actions. For sheets/dialogs, specify opening triggers, side/width, close behavior,
focus return, keyboard interaction, form validation, and states that are actually required.
Cover loading, empty, error, success, and partial states where relevant.
Write/update the editable main user flow under `document/diagram/<feature>-flow.md`
from established behavior, linking it from the UI bundle. Mark unknown transitions as
open questions; SA refines service interactions without duplicating that main flow.

Compare components and packages with actual code and package manifests before proposing
a library. Prefer existing components. A sheet in a picture does not prove any particular
package was used. Verify proposed packages against official documentation for current
framework compatibility, accessibility, maintenance, and bundle/runtime cost; record links
and alternatives in `dependencies.md`. Use status **proposed** in both that document and
the dependency ledger in `document/adr/tech-stack.md`; never install packages at this stage.
Do not label a proposal installed or accepted. Ask SA for an ADR when it changes the core
stack, adds a service/runtime resource, or introduces a significant architecture decision.

Write the frontend TODO to `document/task/todo/<feature-id>.md` (central folder, see `document/task/todo/README.md`; never a feature-local `todo.md`) with stable item IDs, explicit file scope, component/source references,
acceptance criteria, dependencies, frontend/backend ownership, and verification. Map
required data and actions to existing contracts in `data-fetching-template.md`.
Mark missing/changed APIs, business rules, schemas, and flows as `requires-sa`; request
SA documents with a handoff containing the exact UI revision and affected TODO IDs.
Flag container/runtime/storage gaps for SA -> infra research using
`document/workflow/infra-delivery.md`; an ordinary UI library proposal does not itself
require a new container or infra implementation.

Update `document/task/index.md` and `document/task/frontend-latest.md` (pointing to the TODO in `document/task/todo/`) so the next frontend
invocation can find this feature and its dependency proposals. New/changed documents start
as `pending-review` with approval fields unset. Link the complete review bundle and summarize
the decisions needed from the user. Do not start implementation or mark approval yourself.
On approval, record the user's instruction, date, approved revision, and exact documents.
If source/flow changes later, update the revision and invalidate affected approval as
described in the shared workflow.

For findings during implementation/review, follow `document/workflow/remediation.md`.
Keep accepted criteria stable; new preferences or independent hardening go to review
rather than repeatedly rewriting a completed spec. Revisions preserve corrective history
and do not grant another implementation budget or automatic approval.
