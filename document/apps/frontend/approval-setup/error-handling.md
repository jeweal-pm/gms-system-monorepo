# Frontend error handling: approval-setup

- UI revision: 1 (pending-review)
- Error mapping reuses `frontend/src/lib/trpc-error.ts` (`readDomainError`, `retryTransient`) as approve-center does.

## Phase 1 (existing list APIs only)

| Case | Where | Message / behaviour | Recovery |
|---|---|---|---|
| Count request fails (network, 5xx, timeout) | Waiting cell | "Couldn't load" + Retry icon button (`aria-label="Retry loading {Menu} count"`) | Retry refetches that one query; automatic retry per `retryTransient` |
| Count request `FORBIDDEN` (no `<doc>:VIEW`) | Waiting cell | "—" with title "You can't view {Menu} documents" | none; no retry |
| License / session errors (`isCallerLicenseCode`, 401) | page | existing global handling (redirect to sign-in / license page) | existing |
| Turn OFF while the count is loading | switch | `aria-busy`, spinner; decision waits for the result | — |
| Turn OFF and the count fails | dialog | Title "Couldn't check waiting documents"; body "Try again in a moment. Approval for {Menu} stays on."; Close / Try again | Try again refetches and repeats the decision; the switch never turns off on an unknown count |
| Turn OFF with count > 0 | dialog (source 03) | "Can't turn off approval yet" … Close / Go to Approve | switch stays On |
| Permission query fails | page | existing Setup guard error ("Couldn't load your permissions." + Retry) | existing |

No validation errors exist: the page has no text input.

## Phase 2 (requires SA; codes are proposals for SA-AS-01/02)

| Proposed code | Meaning | UI |
|---|---|---|
| `APPROVAL_SETTING_HAS_WAITING` (409, with `{ pending, revisionRequested }`) | server found waiting documents at update time | blocking dialog with the server counts; refresh the row count |
| `APPROVAL_SETTING_CHANGED` (409) | stale `expectedVersion` | toast "Someone else changed this setting. The latest value is shown."; refetch settings |
| `APPROVAL_SETTING_UNAVAILABLE` (409) | type has no document page yet | switch stays disabled; toast "Not available yet" |
| `FORBIDDEN` | no `approval-setup:EDIT` | toast "You don't have permission to change approval settings."; refetch `permission.mine`; switches become read-only |
| `VALIDATION_ERROR` | unknown type | toast with the generic message; log |
| Network / 5xx on update | — | the switch reverts to its previous value; toast "Couldn't save. Approval for {Menu} is still {On/Off}." |

Updates are **not optimistic**: the switch shows busy until the server answers, then shows the saved value.

## Document pages after phase 2 (for FE-AS-010; SA-AS-03)

A document page may hold a stale setting while the owner changes it. The server decides at Save; when the result status differs from what the page expected (e.g. it became `APPROVED` instead of `PENDING_APPROVAL`), the page shows the saved status and a toast "Approval settings for {Menu} changed. This document was saved as {Status}." Exact handling is decided with SA.
