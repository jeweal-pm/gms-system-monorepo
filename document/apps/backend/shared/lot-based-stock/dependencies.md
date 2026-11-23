# Dependencies: lot-based stock (SA revision 1, approved 2026-11-20)

**No new package, library, container, image, network, secret or volume.** [tech-stack](../../../../adr/tech-stack.md) is unchanged.

| Need | Installed capability used |
|---|---|
| Generated key | PostgreSQL 18 (`postgres:18.6-alpine`) stored generated columns, `md5`, `btrim`, `upper` |
| Queries / migrations | Prisma (installed, ADR-0006) with `$queryRaw` and SQL migrations, as the existing bucket SQL |
| Validation | Zod 4 (installed) in master and inventory |
| Internal HTTP | existing `inventory-client` (master) and `master-api` (inventory) clients, same tokens and timeouts |
| Frontend | existing picker kit (`picker-ui.tsx`, `stock-picker.tsx`, `memo-stock-modal.tsx`), TanStack Query, tRPC client; no popover is needed because the Stock ID is not shown (owner Q-LOT-10); no new UI library |

Storage: lot lines add no upload path. Line photos stay per document line (ADR-0048, `@gms/storage`, existing scopes, permanent retention ADR-0030). Stock photos stay per Stock ID and are not merged.
