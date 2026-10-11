# Central feature TODOs

Store every actionable frontend and backend feature TODO here as
`<feature-id>.md`. Keep architecture, API contracts, diagrams, specs, ADRs and
verification plans in their respective `document/` areas; link those sources from the TODO.
Do not create duplicate feature-local TODOs.

Each TODO records its revision, status, source/UI/SA revisions as applicable, ownership,
allowed paths, dependencies, approval evidence, review bundle, stable item IDs, acceptance
criteria and verification. Preserve revision history when decisions change. The exact TODO
revision and linked review bundle control what can be implemented.

`document/task/index.md` indexes all active feature TODOs. The separate
`document/task/frontend-latest.md` points only to the selected frontend TODO; backend-only
work does not make that pointer active.
