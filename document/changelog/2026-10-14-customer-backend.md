# 2026-10-14 customer backend (BE-CUS-001…010)

- New service `backend-api-partner` (NestJS, port 3201, schema `partner`, migration `20261014120000_customer`) with token guard, actor header, health endpoints, 256 KB body limit, envelope errors and redacted logging.
- Gateway: `customer.list/get/options/create/update/delete` via `callPartner` (3 s/5 s, no retry, 1 MiB cap), tRPC `maxBodySize` 1 MiB, production token check; dashboard Customer shortcut `href: "/setup/customer"`.
- Workspace: lockfile importer, root scripts, partner `COPY` line in all Dockerfiles, dev-image partner generate, ownership entry.
- Evidence: `document/apps/backend/partner/customer/testing.md` results; handoff `document/coordination/handoffs/customer-backend.md`.

## Fix: customer.list rejected browser requests (2026-10-14)

- Symptom: the Customers drawer showed "Couldn't load customers"; every `customer.list` call from the page returned 400.
- Cause: tRPC `useInfiniteQuery` adds `direction` and sends `cursor: null` on the first page; the strict gateway input schema rejected both. API checks had used plain input, so they missed it.
- Fix: `backend-api-gateway/src/trpc/customer-schemas.ts` accepts `cursor` as nullish and an optional `direction` (`forward`/`backward`, ignored).
- Verified: gateway and frontend typecheck pass; signed-in `customer.list` with `{limit:50,direction:"forward",cursor:null}` returns 200 with the saved customer; an invalid `direction` still returns 400. Browser re-check by the owner pending.
