# Handoff: transaction-soft-delete SA revision 1 → owner review → backend → frontend

- Date: 2026-11-06 +07:00. From: sa. To: parent (presents the bundle to the owner), then backend and frontend.
- Feature / revision: `transaction-soft-delete` rev 1; SA revision 1; **approved** 2026-11-06 (owner answer in chat 2026-11-06, "อนุมัติ เริ่มทำเลย" (with OQ-1: Quotation deletable only before approval; OQ-3: after Delete return to Create New; OQ-2/4/5: defaults kept)).
- TODO: [document/task/todo/transaction-soft-delete.md](../../task/todo/transaction-soft-delete.md) (BE-SD-001…005, FE-SD-001…004).
- Bundle: [decisions D1…D18 + OQ-1…5](../../apps/backend/master/transaction-soft-delete/decisions.md), [api-contract](../../apps/backend/master/transaction-soft-delete/api-contract.md), [architecture](../../apps/backend/master/transaction-soft-delete/architecture.md), [authorization](../../apps/backend/master/transaction-soft-delete/authorization.md), [database-diagram](../../apps/backend/master/transaction-soft-delete/database-diagram.md), [sequence-diagram](../../apps/backend/master/transaction-soft-delete/sequence-diagram.md), [error-handling](../../apps/backend/master/transaction-soft-delete/error-handling.md), [dependencies](../../apps/backend/master/transaction-soft-delete/dependencies.md), [testing](../../apps/backend/master/transaction-soft-delete/testing.md), [main flow](../../diagram/transaction-soft-delete-flow.md), [ADR-0044](../../adr/0044-transaction-document-soft-delete.md) (Accepted 2026-11-06).
- Packages: none. Infra/devops: not routed (no container, image, variable or workflow change).

## For the parent (integration-owned files, not edited by SA)

- `document/task/index.md`: row `transaction-soft-delete` added 2026-11-06 (approved).
- `document/task/frontend-latest.md`: leave as is unless the owner selects this feature for frontend.
- `document/adr/tech-stack.md`: no change.

## Backend (approved, start now)

The owner's answers change two items: Quotation delete uses `DELETABLE` = DRAFT, PENDING_APPROVAL (CHECK `status IN ('DRAFT','PENDING_APPROVAL')`), and after a confirmed Delete the frontend returns to Create New.


Implement BE-SD-002 → BE-SD-003/004 → BE-SD-005 in `backend-api-master` only (allowed paths in the TODO). Constraints: do not touch `backend-api-auth/**`; do not edit existing migrations; there is no new package, pool, cache or job; each list stays ≤ 51 rows plus a count. Use the migration name from D18. Then return the verified contract to frontend.

## After backend verification: frontend

Implement FE-SD-001…004 against the verified contract. The delete confirm text stays as it is. After a confirmed Delete, return to Create New (OQ-3); open deleted documents read-only from the Deleted filter; the filter is shown to VIEW users and Restore only to DELETE users (OQ-5).
