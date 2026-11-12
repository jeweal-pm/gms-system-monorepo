# Team brief: real-time status notifications (owner, 2026-11-11)

Supplied by the owner in chat on 2026-11-11 together with the design images in this folder. Status as stated by the brief itself: **draft / proposal**, not an approved specification. Summary of its content (the full Thai text is in the chat transcript of that day):

- Goal: when a document changes status (e.g. Revise, Reject), the users concerned see it quickly; notifications are stored so they can be read later and caught up after coming back online.
- Stack direction: frontend TanStack Query + tRPC; NestJS `@Sse` + RxJS in api-master; Hono `streamSSE` for every module of the future `api-inventory`; PostgreSQL storage; browser `EventSource` (no client library).
- Ownership: the service that changes a document's status records the notification and is its source of truth; no central notification gateway/service.
  - api-master (NestJS): Quotation, Purchase Order, Purchase and the other master documents — service exists, no notification contract yet.
  - api-inventory (Hono, target; workspace `backend-api-inventory`): Inventory (Load to Stock, Merge/Split, Stock Transfer Location, Stock Adjustment, Barcode Printing), Sale, Account Outstanding, Reports — not in the runtime yet.
- Flow: user A changes a status → Nginx → owning API checks identity and rules → status and notification committed in PostgreSQL → the owning API pushes an SSE signal to the recipients → user B's browser refetches the unread count and list from the owning API.
- SSE carries only a small signal (type + notification id); the database is the source of truth; details are reloaded with a fresh permission check.
- Frontend: load unread count + latest list on entry; open a same-origin `EventSource` per owning API; on an event refetch; on click navigate to the item and mark read through the owning API; on reconnect refetch to catch up; de-duplicate by notification id.
- Cross-service bell: one stream per API, each API returns its own list and unread count; a merged cursor / exact single unread total needs an extra contract.
- Security: authorize at connect (cookie, origin, expiry, logout); recipients computed by the backend, never from the client; no secrets in events; limit origins, connections and buffered data; never log tokens.
- Open decisions for SA: recipient rules per document type and status change; durability (same transaction or an outbox); multi-instance fan-out without Redis until justified; reconnect, heartbeat, retry, retention, delete/hide, pagination; service naming (`api-inventory` route, `backend-api-inventory` workspace); connection and DB-pool cost on the 4 GB / 2 vCPU host.
- References named by the brief: ADR-0025 (domain routing), ADR-0027 (master/inventory boundaries), ADR-0032 (Quotation in master), ADR-0041 (Purchase Order), ADR-0042 (Purchase).
