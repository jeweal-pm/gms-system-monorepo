# Handoff: user-permission (UI → SA)

- Feature ID / UI revision: `user-permission` / 1 (approved 2026-10-12, UI only)
- SA revision / source UI revision (if applicable): **1 (pending-review, drafted 2026-10-12)** / 1
- From role/scope: ui-spec / `document/apps/frontend/user-permission/**`
- To role/scope / parent integration owner: sa / `document/apps/backend/**`, `document/adr/**`, `document/diagram/**`; the parent serializes `document/adr/tech-stack.md` and `document/task/index.md`
- Exact TODO IDs and source documents: FE-UP-003, FE-UP-004, FE-UP-005, FE-UP-006, FE-UP-007, FE-UP-008, FE-UP-009, FE-UP-012, FE-UP-013, FE-UP-014 in [central TODO](../../task/todo/user-permission.md); [ui-spec](../../apps/frontend/user-permission/ui-spec.md), [data-fetching](../../apps/frontend/user-permission/data-fetching.md), [open questions/conflicts](../../apps/frontend/user-permission/open-questions.md), [flow](../../diagram/user-permission-flow.md)
- Approval status, approved revision, and owner evidence: **UI revision 1 not approved.** The owner only requested the draft ("ui-spec ขอ spec จาก 5 ภาพที่ส่งไป", 2026-10-12). SA may research and draft, but no SA bundle is approved and no backend code/migration is authorized.
- Required contract / diagrams / ADRs (requested):
  - **SA-UP-08 ADR — admin-managed users.** This page creates users in the app, while ADR-0015/BR-01 make CRM the only creator (C-01). It needs a license preflight decision (C-02, AC-L12), the meaning of "3 users, Super Admin not counted" versus ADR-0013 (C-03), an admin-set password versus the ADR-0015 rejected alternative (C-04), username versus immutable licensed email (C-05, QL2), and delete versus QL1 (C-06).
  - **SA-UP-01** user list + usage `{used, limit}`, bounded (Q-UP-05)
  - **SA-UP-02** get/create/update/delete user, with new profile fields phone, locations, photo, active (C-08, Q-UP-12/14/15). Includes the Prisma schema change, migration and authorization rules (Super Admin/self deletion).
  - **SA-UP-03** permission model: menu catalog (Q-UP-13; 53 applicable cells?), storage, and gateway enforcement or storage-only (Q-UP-20, C-07)
  - **SA-UP-04** location options source (Main/Sub Location services do not exist; Q-UP-10)
  - **SA-UP-05** authorization for this page and its procedures (Q-UP-20)
  - **SA-UP-06** photo upload/storage (multipart through the gateway, storage location, size limits, cleanup); likely **infra** research if it adds a volume/object store (Q-UP-11)
  - **SA-UP-07** Excel export/print (server-generated, bounded) (Q-UP-16)
  - Sequence and ER diagrams, API contract, error codes for duplicate username / limit reached / license ineligible
- Dependency ledger entries and installation status: frontend DEP-UP-01 `libphonenumber-js`, DEP-UP-02 `country-flag-icons`, both **proposed**, not installed. If SA chooses server-side phone validation, it must decide whether the same library is used in the backend.
- Allowed code/document paths: documentation only for SA (`document/apps/backend/<service>/user-permission/**`, ADR drafts, diagrams). No application code.
- Integration-owned changes: future `backend-api-auth/prisma/**`, `backend-api-*/src/app.module.ts`, gateway router, Compose (if storage is added). The parent serializes them, and only after SA approval.
- Infra service bundle/revision, ADR/config drift, network/egress and secret-adapter prerequisites (when containers change): only if SA-UP-06 adds a volume/object storage service → route to infra per [infra delivery](../../workflow/infra-delivery.md).
- DevOps pipeline/source revision, Dockerfile/workspace dependencies, build/runtime variables, image platform and release/check requirements (when delivery changes): none expected unless a new service/image is added.
- Resource budget / capacity impact (4 GB RAM / 2 vCPU total): the user list is tiny (limit + 1); catalog static; photo files must have a size cap and be stored outside the DB or capped; export must be bounded and synchronous only for small outputs. Current Compose limits total 2.85 vCPU / 5.0 GiB. Any new storage container must fit the remaining headroom.
- Expected output and acceptance criteria: an SA bundle (architecture, API contract, sequence/ER diagrams, authorization, errors, dependencies, testing, ADR for SA-UP-08) and backend TODO rows added to the central TODO, presented for **separate** owner approval.
- Verification completed / not run: no verification run (documentation only).
- Blocking item, if any: owner answers to C-01…C-06 and Q-UP-05/06/07/08/10/11/12/13/14/15/16/20 are needed before the SA design can be final.
- Resume action and destination (backend -> frontend, etc.): owner reviews UI rev 1 → SA drafts the bundle → owner approves the SA bundle → backend → frontend FE-UP-012/013/014.
- Corrective work ID / root-cause ledger link (if applicable): none
- Existing pass limit / allocated passes / active pass (inherit; never reset): n/a (no corrective work)
- Changed evidence, contract, or prerequisite justifying this handoff: new design source (5 screenshots) requiring new user/permission services
- Concrete receiving-role output / next fact needed: owner decisions on C-01 (in-app creation allowed?) and C-03 (source of user limit) first
- Stop reason / terminal outcome / explicit extension evidence, if any: none

## SA status (2026-10-12)

- SA revision 1 drafted; status **pending-review**. Not approved, so no backend code, migration, Compose edit or install is authorized.
- Bundle: [architecture](../../apps/backend/auth/user-permission/architecture.md), [owner decisions C-01…C-09](../../apps/backend/auth/user-permission/decisions.md), [API](../../apps/backend/auth/user-permission/api-contract.md), [authorization](../../apps/backend/auth/user-permission/authorization.md), [sequence](../../apps/backend/auth/user-permission/sequence-diagram.md), [database](../../apps/backend/auth/user-permission/database-diagram.md), [errors](../../apps/backend/auth/user-permission/error-handling.md), [dependencies](../../apps/backend/auth/user-permission/dependencies.md), [testing](../../apps/backend/auth/user-permission/testing.md), [ADR-0016](../../adr/0016-per-user-menu-action-permissions.md) (Proposed), [ADR-0017](../../adr/0017-super-admin-managed-users.md) (Proposed).
- Infra: not triggered under the recommended options. The photo is stored in PostgreSQL, and only the auth env var `USER_SEAT_LIMIT` is added, through the parent. If the owner picks C-08 B (file-system volume), route infra first.
- Backend TODO rows `BE-UP-001…014` and the tech-stack row are returned to the parent for integration. SA did not edit the central TODO or tech-stack.md, which are being edited concurrently.
- Next: the owner approves SA revision 1 (or names alternatives per conflict) → the parent records the evidence → backend BE-UP-* → frontend FE-UP-012/013/014.
