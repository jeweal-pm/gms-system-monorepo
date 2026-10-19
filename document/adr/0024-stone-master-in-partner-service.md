# ADR-0024: Stone Master data in the partner service

- Status: Accepted (2026-10-19)
- Date: 2026-10-19
- Feature / source UI revision: `stone-master` / 1 (approved 2026-10-19)
- SA revision: 1 ([decisions.md](../apps/backend/partner/stone-master/decisions.md))
- Deciders: project owner
- Approval evidence: owner 2026-10-19: "อนุมัติ stone-master UI rev 1 และ SA rev 1" (Q-SM-01…09 use the documented defaults)
- Supersedes / related ADRs: related [ADR-0018](0018-customer-master-partner-service.md) (partner service), [ADR-0020](0020-username-login-and-permission-matrix-v2.md) (catalog leaf `stone-master`), [ADR-0021](0021-company-profile-in-partner-service.md) (non-partner master data in partner)

## Context

The owner wants the 9 Stone Master pages and their API: Stone Group, Stone Name, Size, Shape, Color, Cutting, Clarity, Quality and Stone Code. No service owns stone data today. The permission catalog already has the leaf `stone-master`.

## Decision

- **Owner:** `backend-api-partner` owns the stone master tables in a separate PostgreSQL schema **`stone`** (owner 2026-10-19: "แยก shcema stone แทนได้มั้ย หรือนายมีความเห็นอื่นๆตอบแล้วทำงานต่อเลย"). This keeps stone data apart from partner data so it can move to its own service later. The production partner DB role must be allowed to create the schema, or a DBA creates it before the first migration.
- **Gateway:** exposes `stoneMaster.*` under `stone-master:<action>`.
- **Data rules** (detailed in SA-SM-03…09):
  - Separate tables with real foreign keys.
  - Uppercase codes, unique per table; no running number.
  - Stone Code is built from ordered parts. In Auto mode the server builds the code and stores it as a snapshot.
  - Deleting a record that is in use is blocked.
  - Optimistic concurrency via `updatedAt`.

## Alternatives

- New `backend-api-master` service: rejected for now. It adds a container, token and infra work on the 8 GB host.
- One generic lookup table: rejected. It cannot enforce the kind of each reference.
- Per-page permission keys: rejected by default (Q-SM-04). This can be revisited with a catalog revision.

## Consequences and capacity

- One additive migration; nothing existing changes.
- Bounded lists (≤ 50 rows per page) and options (≤ 1,000 per kind).
- No new runtime resource, cache or job.
- Partner's memory and CPU limits are unchanged.
- Rollback: drop the new tables.

## Acceptance and approval

- Partner, gateway and frontend tests listed in the central TODO pass.
- The dual security review passes.
- Accepted 2026-10-19.
