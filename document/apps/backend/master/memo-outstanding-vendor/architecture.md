# Architecture: memo-outstanding-vendor (SA revision 1, 2026-10-29, approved 2026-10-29)

Decisions: [decisions.md](decisions.md) · ADR: [ADR-0035](../../../../adr/0035-memo-outstanding-vendor-report.md)

| Concern | Decision |
|---|---|
| Placement | `backend-api-master`: `src/trade-document/memo-outstanding.service.ts` and `memo-outstanding.schemas.ts`, plus router `memoOutstanding`. The report lives next to the memo-stock services that own the data. |
| Queries | `Prisma.sql` tagged templates with bound parameters, and an escaped ILIKE. Per call: summary 1 query, list 2, items 1, options 1. |
| Transactions | Read-only. The default read connection, with no explicit transaction. |
| Bounds | pageSize ≤ 50; vendorItems ≤ 25 documents (≤ 5,000 rows); vendorIds ≤ 50; options ≤ 1,000; q ≤ 100 chars; date range ≤ 366 days. |
| Caching | No server cache. The client caches per react-query: summary and list 10 s, items 30 s, options 60 s. |
| Capacity (4 GB / 2 vCPU) | No new process. Queries hit the partial open-items index. Expected size is a few thousand documents a year. Targets, measured after build: list p95 < 150 ms and summary < 100 ms at 50k `memo_stock` rows. Offset paging is acceptable at this size. Revisit it with keyset paging if p95 is missed. |
| Frontend | `features/memo-outstanding-vendor/**`. Filters live in URL search params, so the view can be shared and survives reload. Column choices and the subtasks mode are kept in `localStorage` under `gms.memo-outstanding-vendor.view.v1` (validated, try/catch). Print uses a print-only view (the vendor print pattern). |
