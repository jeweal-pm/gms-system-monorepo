# TODO: notifications

- feature-id: `notifications`
- revision: 1 (UI rev 1 + SA rev 1)
- status: **approved** 2026-11-11 (owner "อนุมัติ"; Q-NT-01…09 defaults), in progress
- request: owner 2026-11-11, "sa uxui ทำ spec และ adr ของ notification ให้หน่อย" with design sources 01–07, panel 440 × 650 radius 8, colours #FBFBFB / #E2F0F0 / #A3C9CC, bell SVG and a team brief
- source: [apps/frontend/notifications/source/](../../apps/frontend/notifications/source/)
- ui-spec: [ui-spec.md](../../apps/frontend/notifications/ui-spec.md); open questions: [open-questions.md](../../apps/frontend/notifications/open-questions.md)
- backend bundle: [api-contract.md](../../apps/backend/master/notifications/api-contract.md), [ADR-0049](../../adr/0049-notifications-sse.md)
- dependencies: none new (EventSource in the browser; `@nestjs/common` @Sse + `rxjs` already in api-master)
- infra: one nginx location for the stream (no buffering)
- approved-revision: 1 (UI 1 + SA 1)
- approval-evidence: owner in chat 2026-11-11, "อนุมัติ"

## Implementation items

| Done | ID | Owner | Task | Depends on | Acceptance |
|---|---|---|---|---|---|
| [x] | BE-NT-001 | backend (auth) | `auth.permission_holders` read-only view + SELECT grant for the master role (ADR-0049 D4) | approval | no PII; active users + role + permissions |
| [x] | BE-NT-002 | backend (master) | Migration: `notification_event`, `notification_recipient` (D2) | approval | additive; indexes as in the contract |
| [x] | BE-NT-003 | backend (master) | Emitters in the status-change transactions (create/update → pending, approve → approved) with recipient rules (D3/D4) | BE-NT-001/002 | same transaction; actor excluded; after-commit signal |
| [x] | BE-NT-004 | backend (master) | `notification` router: unreadCount, list (for-me / all), markRead, markAllRead (D5) | BE-NT-002 | keyset, ≤ 20, own rows only, VIEW filter on `all` |
| [x] | BE-NT-005 | backend (master) | SSE stream with auth at connect, heartbeat, reauth, limits (D6/D7) | BE-NT-003 | ids only; caps; no DB connection held |
| [x] | BE-NT-006 | backend (master) | 90-day retention job (D11) | BE-NT-002 | bounded batches |
| [x] | INF-NT-001 | infra + parent | nginx stream location (D8) | approval | no buffering; 120 s read timeout |
| [x] | FE-NT-001 | frontend | Bell + unread dot, panel shell (440 × 650), header, tabs, states (ui-spec) | BE-NT-004 | matches sources 01–07 |
| [x] | FE-NT-002 | frontend | Items, grouping, lazy pages, mark read / all, row and chevron navigation | FE-NT-001 | Q-NT-02/03 |
| [x] | FE-NT-003 | frontend | EventSource lifecycle: refetch on event / focus, reauth + renew, close on sign-out | BE-NT-005, INF-NT-001 | no duplicate items; max 3 retries |
| [x] | FE-NT-004 | frontend + parent | Tests, both security reviews | all | suites pass |
| [ ] | BE-NT-007 | backend (master) | Reject / revise events | ADR-0046 phase 2 | creator notified with reason / note |

## Verification (2026-11-11)

- BE-NT-001: migration `20261111120000_permission_holders` applied; SELECT granted to `gms_master_authz_reader` (`prisma/roles/grant-master-permission-holders.sql`, run on dev). Read-only check as that role: 2 Reserve approvers.
- BE-NT-002…006: migration `20261111130000_notifications` applied on api-master start. Engine `create()` records `approval.pending` (approvers looked up before the transaction, actor excluded) and the six approve methods record `document.approved` for the creator through `engine.notifyApproved`, inside the same transaction; signals are emitted after commit. Router `notification.{unreadCount,list,markRead,markAllRead}`; SSE `GET /api/master/notifications/stream` behind a gate in `main.ts`; daily 90-day purge.
- Tests: api-master `test/notification/` UT-NT-01…13; full suite 553 passed / 82 skipped (opt-in DB); tsc + eslint clean.
- INF-NT-001: `docker/nginx/gms-dev.conf` exact location, `proxy_buffering off`, 120 s timeouts; `nginx -t` ok, reloaded.
- Live smoke through nginx :8080: no cookie 401, cross-site 403, POST 405; signed in 200 `text/event-stream` with `event: ready` (`retry: 5000`); `unreadCount` / `list` (for-me, all) 200; `markAllRead` without CSRF 403.
- FE-NT-001…003: `frontend/src/features/notifications/` (model, api, stream, `NotificationsBell`, `NotificationItemRow`); top-bar placeholder replaced; sign-out calls `stopNotificationStreams()`. Tests `test/notifications/` (model, stream, panel integration); full suite 931 passed; tsc clean.
- Owner bell SVG saved as `source/bell-icon.svg` and used for the item avatar (sources 01/03); the top-bar bell keeps the outline icon shown in source 01.
- FE-NT-004: tests done. Both security reviews ran on the same revision: no vulnerability; one availability defect, [INV-20261111-001](../investigation/INV-20261111-001-notification-stream-reconnect-renew-storm.md) (multi-tab refresh reuse / reconnect loop): fixed 2026-11-11 on the owner's instruction. One stream per browser (Web Lock or localStorage lease), renewal shared across tabs, bounded reconnects; 4-tab live check over LAN and localhost: 1 stream.

## Approval and revisions

| Revision | Date | Change | Status |
|---|---|---|---|
| 1 | 2026-11-11 | UI spec from sources 01–07; ADR-0049 SA rev 1 | **approved** 2026-11-11 (owner, chat; defaults) |
