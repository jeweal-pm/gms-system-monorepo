# Dependencies: inventory / merge-split (SA revision 1, pending-review)

**No new package, service, container, volume or network.** Reuses installed Hono, Zod, Prisma/pg, `@gms/storage` (local-fs profile, new scope `files/merge-split/` inside the existing inventory storage root) and the existing master internal client ([tech-stack](../../../../adr/tech-stack.md)). There is no infra or devops impact, so no INF-/DO- items; the tech-stack ledger needs no change.

Capacity (4 GB / 2 vCPU host): one short write transaction per apply (≤ 200 + 200 rows, ≈ 10 statements, row locks only on the involved stocks), uses the existing inventory connection pool; picker/list one statement per page of ≤ 50; photo upload uses the existing ≤ 3 concurrent upload limit. No cache, polling or background job. Measurement still needed: apply latency for 200 results on the dev DB (target < 500 ms), recorded in testing.
