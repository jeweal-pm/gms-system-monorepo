# Handoff: load-to-stock → SA (new service design)

- Feature ID / UI revision: `load-to-stock` / UI revision 1 (**draft**, not approved)
- SA revision / source UI revision: **1 (pending-review, 2026-11-16)** / UI 1 + owner answers 2026-11-16
- SA output: [ADR-0052](../../adr/0052-load-to-stock-in-backend-api-inventory.md) (Proposed); bundle [document/apps/backend/inventory/load-to-stock/](../../apps/backend/inventory/load-to-stock/decisions.md) (architecture, api-contract, authorization, database-diagram, sequence-diagram, error-handling, dependencies, testing, decisions); BE-LS-001…012, INF-LS-001, DO-LS-001, FE-LS-014…016 in the [TODO](../../task/todo/load-to-stock.md); infra/devops requirement [load-to-stock-infra-devops](load-to-stock-infra-devops.md). SA-LS-01…12 answered as SA-LS-01…16 in [decisions](../../apps/backend/inventory/load-to-stock/decisions.md). New owner questions Q-LS-23…36 in ADR-0052 (owner answers 2026-11-16 to Q-LS-23/26/28/29/30/33 applied; Q-LS-34…36 open). Status: awaiting owner approval of SA revision 1; no backend/infra config work before it (infra research may start).
- From role/scope: ui-spec (documents only)
- To role/scope / parent integration owner: `sa`; parent owns shared manifests, Compose, gateway composition, task pointers
- Exact TODO IDs and source documents: SA-LS-01…12 below; frontend FE-LS-002, 004, 008, 009, 010, 011 are requires-sa. Sources: [ui-spec](../../apps/frontend/load-to-stock/ui-spec.md), [open-questions](../../apps/frontend/load-to-stock/open-questions.md), [data-fetching](../../apps/frontend/load-to-stock/data-fetching.md), [flow](../../diagram/load-to-stock-flow.md), [TODO](../../task/todo/load-to-stock.md)
- Approval status, approved revision, and owner evidence: **none** — dispatch only after the owner reviews UI rev 1 (or explicitly starts SA design in parallel)
- Required contract / diagrams / ADRs: new ADR for the Load to Stock service; sequence + database diagrams; API contract; amendments to ADR-0050 D4 "used" table (Purchase used when Load references it) and ADR-0051 §6 (Stock ID issuing)
- Dependency ledger entries and installation status: no frontend package; backend packages, if any, proposed by SA
- Allowed code/document paths: `document/apps/backend/<new-service>/load-to-stock/`, `document/adr/`, `document/diagram/load-to-stock-*.md` (sequence only), this handoff; no application code
- Integration-owned changes: Compose service, gateway/nginx route, auth catalog (leaf `load-to-stock` exists), tech-stack ledger
- Infra service bundle: **required** — a new container/service → route to infra per [infra-delivery](../../workflow/infra-delivery.md)
- DevOps: new service image/pipeline → devops after SA approval
- Resource budget / capacity impact: new container within 4 GB / 2 vCPU; current profile ≈1.55–1.70 vCPU / 2624–2944 MiB ([capacity](../../infra/capacity.md)); SA must state CPU/memory/heap/DB-pool limits or justify a module in master instead
- Expected output and acceptance criteria: decisions for SA-LS-01…12; contract covering every row in data-fetching; owner-approvable bundle
- Verification completed / not run: none (design stage)
- Blocking item: owner review of UI rev 1; Q-LS-01/02/04/05/11/19/22
- Resume action and destination: SA bundle → owner approval → infra → backend → frontend FE-LS-*
- Corrective work: none

## SA decisions requested

| ID | Topic | UI default / question |
|---|---|---|
| SA-LS-01 | Service boundary: new service (owner) vs module in `backend-api-master`; name, DB schema, gateway route, tRPC client for frontend | Owner wants a new service (Q-LS-22) |
| SA-LS-02 | Reading Purchase lines and **deducting remaining** atomically across services (Purchase lives in master): shared DB schema access, API call, or outbox; lock/consistency at Approve and applied Save | Remaining re-checked under lock (Q-LS-06) |
| SA-LS-03 | **Stock ID issuing**: counter `memo_stock_id_counter` is in master (ADR-0051 §6); when issued (Save vs Approve) and by which service | Issue when stock is created; "Auto" before (Q-LS-04) |
| SA-LS-04 | Stock record: where loaded stock lives (new stock table vs Memo Stock), fields incl. Location, Parcel, Price, Stock Price, Sale Price, photos, note | Q-LS-11/13/14 |
| SA-LS-05 | Approval Setting + Daybook: reuse master `approvalSetting` (type `load-to-stock` exists) from a new service; status model ADR-0050 D2; Approve Center integration | ADR-0050 |
| SA-LS-06 | Edit/delete until used (ADR-0050 D4): reversal of PU deduction + stock removal; "used" definition for loaded stock | Q-LS-19 |
| SA-LS-07 | Document numbering via Document Setup `load-to-stock` (code LS, in master) from the new service | Q-LS-20 |
| SA-LS-08 | Account / Currency semantics; vendor restriction; cost currency and conversion at PU rate | Q-LS-01/02/03 |
| SA-LS-09 | Mode persistence (batch id, mode, merged sources many-to-one, split one-to-many) | Q-LS-07…10 |
| SA-LS-10 | Partial-load cost and weight write-off on last pcs | Q-LS-12/21 |
| SA-LS-11 | Location master (catalog leaf `location-master` exists, no API) | Q-LS-11 |
| SA-LS-12 | Permissions (auth leaf `load-to-stock`), CSRF, audit, capacity, and infra/devops routing | — |
