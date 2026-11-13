# api-master notifications — API contract (SA revision 1, approved 2026-11-11)

Decision record: [ADR-0049](../../../../adr/0049-notifications-sse.md) (Accepted). UI: [ui-spec](../../../frontend/notifications/ui-spec.md).

## Types

```ts
type NotificationType = "approval.pending" | "document.approved" | "document.rejected" | "document.revision_requested";
type NotificationDocumentType = "quotation" | "reserve" | "memo-receive" | "memo-return" | "memo-out" | "memo-out-return" | "purchase-order" | "purchase";

type NotificationItem = {
  id: string;                        // notification_event.id (uuid v7)
  type: NotificationType;
  documentType: NotificationDocumentType;
  documentId: string;
  docNo: string;                     // snapshot at the event
  summary: {                         // display only, ≤ 1 KB (texts ≤ 200 chars; reason, then partyName, shortened with "…" to fit), never authoritative
    partyName?: string; amount?: string; currency?: string;
    actorName?: string; actorRole?: string;
    reason?: string;                 // reject reason / revise note (ADR-0046)
  };
  createdAt: string;                 // ISO
  readAt: string | null;             // for-me only; always null in "all"
};
```

## tRPC (`/api/master/trpc`, `notification` router)

| Procedure | Kind | Input | Output | Notes |
|---|---|---|---|---|
| `notification.unreadCount` | query | — | `{ count: number }` | caller's unread recipient rows |
| `notification.list` | query | `{ scope: "for-me" \| "all"; cursor?: string \| null; limit?: number /* ≤ 20, default 20 */ }` | `{ items: NotificationItem[]; nextCursor: string \| null }` | keyset `(createdAt desc, id desc)`; `all` = events of document types the caller may VIEW |
| `notification.markRead` | mutation | `{ ids: string[] /* 1…50, distinct */ }` | `{ updated: number }` | only the caller's rows; unknown ids ignored |
| `notification.markAllRead` | mutation | — | `{ updated: number }` | caller's unread rows |

Authorization: signed-in user with a live session (no menu grant needed to read one's own notifications); `all` filters by `<leaf>:VIEW`. Mutations need CSRF like every write. Errors: `UNAUTHORIZED`, `VALIDATION_ERROR`, `PARTNER_UNAVAILABLE`.

## Stream

`GET /api/master/notifications/stream` — `text/event-stream`, `Cache-Control: no-store`.

| Event | Data | When |
|---|---|---|
| `notification` | `{"id":"…","type":"approval.pending","documentType":"reserve"}` | a committed event addressed to the caller |
| `reauth` | `{}` | 60 s before the access token expires; the server then closes |
| `ready` | `{}` | once the stream is registered (the browser catches up on the count) |
| `ping` | `{}` | every 25 s (keeps proxies from closing an idle stream) |

`retry: 5000`. Refused connections: 401 (no/expired access), 403 (bad origin), 503 + `Retry-After` (stream cap). Limits per ADR-0049 D7.

## Data (schema `partner`)

```text
notification_event(id uuid pk, type varchar(40), document_type varchar(40), document_id uuid, doc_no varchar(40),
                   actor_user_id varchar(64), summary jsonb (≤ 1 KB), created_at timestamptz)
  idx (document_type, created_at desc, id desc)
notification_recipient(event_id uuid fk→notification_event on delete cascade, user_id varchar(64),
                       created_at timestamptz, read_at timestamptz null, pk(event_id, user_id))
  idx (user_id, created_at desc, event_id desc); partial idx (user_id) where read_at is null
```

Auth dependency: `auth.permission_holders(user_id, account_active, account_role, permissions text[])`, SELECT for the master role.

## Sequence (approval.pending)

```mermaid
sequenceDiagram
  participant A as User A (browser)
  participant N as nginx
  participant M as api-master
  participant DB as PostgreSQL
  participant B as User B (browser, stream open)
  A->>N: reserve.create (tRPC, CSRF)
  N->>M: forward
  M->>DB: BEGIN; insert reserve…; insert notification_event + recipients (from auth.permission_holders); COMMIT
  M-->>B: SSE event: notification {id, type, documentType}
  B->>N: notification.unreadCount / list (tRPC)
  N->>M: forward
  M->>DB: indexed reads (caller's rows)
  M-->>B: count + items
```

## Revision note 2026-11-12 (BE-NT-007)

- `document.rejected` and `document.revision_requested` are emitted by Reject and Revise. Both go to the creator, never the actor. `summary.reason` holds the reject reason or revise note.
- `quotation` is a `NotificationDocumentType`, because Quotation now has the Send to approve / Approve / Reject / Revise flow (approval-setup, ADR-0050).
- There is no new procedure, field or schema change.
