.
.# ADR-0049: Document notifications with server-sent events, owned by the domain API

- Status: Accepted
- Date: 2026-11-11
- Feature / source UI revision: `notifications` / 1 ([ui-spec](../apps/frontend/notifications/ui-spec.md))
- SA revision: 1
- Deciders: owner
- Approval evidence: owner in chat 2026-11-11, "อนุมัติ" (Q-NT-01…09 take their defaults)
- Inputs: owner team brief 2026-11-11 ([source](../apps/frontend/notifications/source/team-brief-2026-11-11.md)); design sources 01–07.
- Related: [ADR-0025](0025-gms-domain-routing-and-trpc.md) (domain routing), [ADR-0026](0026-gms-access-tokens-and-live-authorization.md) (access JWT, live authorization view), [ADR-0027](0027-gms-master-inventory-data-and-operations.md) (master / inventory boundary), [ADR-0046](0046-approval-review-status-and-approve-center-api.md) (Reject / Revise, on hold), [ADR-0048](0048-line-photos-on-stock-documents.md).

## Context

Facts (verified 2026-11-11):

- The top-bar bell is a placeholder (`frontend/src/features/home/topbar.tsx` "Notifications aren't available yet."). No notification table, endpoint or stream exists.
- api-master is NestJS with `@nestjs/common` 12.1.2 and `rxjs` ^7.8.2 installed; nginx routes `/api/master/` to it with default proxy buffering.
- Identity: a 15-minute access JWT in an HttpOnly cookie, verified locally, plus a live read of `auth.current_authorization` on every request (ADR-0026). That view has **one row per live session** — it can tell what a signed-in user may do, but not "which users hold `reserve:APPROVE`" when they are offline.
- api-master runs as **one** process; its Prisma pool is `max 5` (`PARTNER_POOL`). Host budget: 4 GB RAM / 2 vCPU.
- The status changes that exist today: create/update → `PENDING_APPROVAL`, `approve()` → `APPROVED` on Reserve, Memo Receive, Memo Return, Memo Out, Memo Out Return, Purchase Order, Purchase. Reject / Revise / Resubmit are designed (ADR-0046) but on hold.
- `api-inventory` (Hono) does not exist yet.

## Decision

1. **Owner of a notification = the domain API that changes the document** (team brief). api-master owns the notifications of its documents; a future `api-inventory` owns its own with the same contract shape. No notification gateway or extra service.
2. **Storage (api-master, schema `partner`)**:
   - `notification_event` — one row per event: `id` (uuid v7), `type` (`approval.pending`, `document.approved`, later `document.rejected`, `document.revision_requested`), `document_type` (menu leaf, e.g. `reserve`), `document_id`, `doc_no` (snapshot), `actor_user_id`, `summary` (jsonb, ≤ 1 KB: party name, amount, currency, reason/note — display only), `created_at`. Index `(document_type, created_at desc, id desc)`.
   - `notification_recipient` — one row per addressed user: `event_id` (FK, CASCADE), `user_id`, `read_at` (null = unread). PK `(event_id, user_id)`; index `(user_id, created_at desc)` via a copied `created_at`, and a partial index `(user_id) where read_at is null` for the unread count.
   - Additive migration only.
3. **Same transaction**: the event and its recipient rows are inserted inside the document's status-change transaction (`TradeDocumentEngine` create/update/approve and the Purchase Order / Purchase services). Business state and notification commit together — no outbox needed while both live in the same database and service. The SSE signal is emitted **after commit** only.
4. **Recipients (computed by the server, never from the client)**:
   - `approval.pending` → every active user holding `<leaf>:APPROVE` **and** `<leaf>:VIEW`, plus Super Admins (role `admin`), excluding the actor.
   - `document.approved` / `document.rejected` / `document.revision_requested` → the document's creator (`created_by`), excluding the actor.
   - Fan-out is bounded by the user seat limit (default 3, ADR-0013) — a handful of rows per event.
   - Needs a new **auth-owned read-only view** `auth.permission_holders(user_id, account_active, account_role, permissions[])` with SELECT for the master role (no names, e-mail or tokens), because `current_authorization` only has live sessions. This is an auth contract change and part of this ADR's approval.
5. **Read API (api-master tRPC, `notification` router, cookie auth + live authorization like every procedure)**:
   - `notification.unreadCount()` → `{ count }` (capped 99+ by the client).
   - `notification.list({ scope: "for-me" | "all", cursor?, limit ≤ 20 })` → keyset by `(created_at, id)`; `for-me` = the caller's recipient rows (with `readAt`); `all` = events of document types the caller may VIEW (no read state).
   - `notification.markRead({ ids ≤ 50 })` and `notification.markAllRead()` — only the caller's own rows; CSRF like every mutation.
   - Each item carries `documentType`, `documentId`, `docNo`, `type`, `summary`, `createdAt`, `readAt`; the frontend builds the link. Opening the document re-checks permission through its own `get`.
6. **Stream (SSE)**: `GET /api/master/notifications/stream` (NestJS `@Sse`, RxJS), same-origin through nginx.
   - Authorization at connect: access cookie + live authorization (as the photo routes); trusted `Origin`; `Cache-Control: no-store`.
   - Events carry **ids only**: `event: notification` `data: {"id","type","documentType"}`; `event: reauth` sent 60 s before the access JWT's `exp`, then the server closes the stream; `: ping` comment every 25 s (heartbeat). `retry: 5000`.
   - Delivery: an in-process `Subject` keyed by user id; after commit the service emits to the recipients' open streams. The stream holds **no DB connection**.
   - The live authorization is re-read at every reconnect (≤ 15 min apart); sign-out ends the stream at the next `reauth` / reconnect, and the client closes it at once on sign-out.
7. **Limits (4 GB / 2 vCPU)**: ≤ 3 open streams per user (the oldest is closed), ≤ 200 per process (new connections get 503 + `Retry-After`); per-stream send buffer bounded (drop and close a stream that falls behind > 100 events — the client refetches). Rough cost: ~50 KB per idle stream → < 10 MB at the cap.
8. **nginx**: a dedicated `location = /api/master/notifications/stream` with `proxy_buffering off`, `proxy_cache off`, `proxy_read_timeout 120s` (> heartbeat), `proxy_http_version 1.1`, `Connection ""`. Infra owns the change.
9. **Single instance now**: fan-out is in-process because api-master runs one process. If it is ever scaled out, PostgreSQL `LISTEN/NOTIFY` on one dedicated connection is the next step (no new dependency); Redis/broker stays out until justified (ADR-0027 D4).
10. **api-inventory later**: it exposes the same router shape and `/api/inventory/notifications/stream`; the frontend then shows one list per service in the same panel and adds the two unread counts. A merged cursor or a single exact total across services needs its own contract then.
11. **Retention**: events older than 90 days are deleted by a bounded daily job inside api-master (≤ 5,000 rows per run, off-peak).
12. **Frontend**: no package; `EventSource` with `withCredentials`, refetch on event / focus / reconnect, renew-and-reconnect on `reauth` or error (max 3 tries), close on sign-out (ui-spec "Real-time behaviour").

## Alternatives

- **Polling every N seconds** — simplest, but N users × N seconds of tRPC requests each hitting the live-authorization view and the pool of 5; slower to show. Kept only as the fallback when the stream is unavailable (refetch on focus).
- **WebSocket / Socket.IO** — two-way not needed; a new dependency and a custom auth handshake.
- **A central notification service** — rejected by the brief: another process on a 4 GB host and cross-service writes.
- **Outbox table + worker** — only needed if state and notification were in different stores or services; they are not.
- **Recipients from `current_authorization`** — misses offline approvers, so they would never see the notification.

## Consequences and capacity

- DB: per status change one event row + a few recipient rows in the same transaction; unread count is an index-only lookup on the partial index.
- Memory: bounded by D7; no DB connection per stream; one 25 s timer per stream.
- Security: no data in events (ids only), recipients server-computed, CSRF on mutations, origin check and live authorization at connect, no token logging, `no-store`.
- Failure: if the process restarts, streams drop and the browsers reconnect and refetch; nothing is lost because the rows are committed.
- Depends on: the auth view (D4), the nginx block (D8), and — for reject / revise events — ADR-0046 phase 2.

## Acceptance and approval

- Owner approves ADR-0049 + ui-spec revision 1 (and Q-NT-01…09) → auth view (backend auth) → api-master migration, router, stream, emitters → nginx (infra) → frontend → both security reviews.
- Tasks: [task/todo/notifications.md](../task/todo/notifications.md).

## Implementation note 2026-11-12 (BE-NT-007)

This note records no new decision; it applies D3 and D4 to the flow that PR #90 merged (ADR-0050).

- Reject and Revise record `document.rejected` and `document.revision_requested` for the creator, with the reason or note, in the review transaction.
- Quotation is a notifying document type. It now has the approval step that D4 assumes; ui-spec revision 1 left it out only because it had none.
- The display summary is held to the 1 KB CHECK by shortening the reason, then the party name.

Owner instruction: "frontend backend ทำ notification ให้ครบ flow ทั้งต่อ api และ ui" (2026-11-12).
