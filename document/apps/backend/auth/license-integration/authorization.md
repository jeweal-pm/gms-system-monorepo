# Authorization: per-user license integration

- Feature / SA revision: `auth-license` / 2
- Status: approved; SA revision 2 approved 2026-10-11
- Rules: [API contract](api-contract.md), [license spec](../../../../spec/0006-license.md)

| Operation / resource | Authentication | Allowed roles / ownership | Backend enforcement | Denied outcome | IDs |
|---|---|---|---|---|---|
| Resolve current license context | Valid Better Auth session | The session's own user; every role including Super Admin | Auth obtains user ID/email from the validated session, never caller input | 401 without session; fail closed on invalid/unverifiable license | BE-LIC-001/003 |
| `license.status` | Valid session | Own account | Return only status and public dates; no token/key | 401 | BE-LIC-006 |
| `license.activate` | Valid session | Own account | Email comes from session; validate key syntax/size; never accept arbitrary email/user ID | 400 invalid; after 3 failures lock for 1 minute | BE-LIC-004 |
| Licensed application procedures | Valid session and applicable license | Existing role/ownership rules plus license required for every user | Gateway `licensedProcedure` reads server-created context; UI cannot set/override it | 403 state-specific or 503 unverifiable | BE-LIC-003 |
| CRM user creation | Valid CRM API credential | Only when an issued license binds requested normalized email+instance; `pending` counts | Auth performs upstream lookup before creating user/sending generated credentials | 422 no/ineligible license; 503 outage; no account on failure | BE-LIC-007 |
| Email change for licensed account | Denied | A licensed account's email is immutable; a different email requires a new account and separately issued license | Keep Better Auth email change disabled for licensed users; never transfer/rebind a license | Reject change; create a new account under the normal CRM license preflight | BE-LIC-008 |
| Session concurrency | Valid credentials | Exactly one active session per user | Auth serializes login cleanup in PostgreSQL; newest session retained | older session gets 401 | BE-LIC-009 |
| logout, status, activation | Valid session when required by Better Auth | Always available while license restricted | Explicit allow-list; no blanket guard on these operations | Auth errors only | BE-LIC-003/004 |
| `license.list` | Deferred | Out of scope by owner decision | No route or permission in this revision | N/A | Out of scope |

Do not trust email, instance ID, role, license status or JWT claims supplied by browser.
Only the license server's verified signature and configured instance bind the license.
Internal auth endpoints accept the existing session cookie from gateway and are not exposed
through frontend proxies. Auth checks session independently for every internal operation.

Owner resolved QL2: license is not transferred; a licensed account's email is immutable and
a new email requires a new account and separately issued license. Owner resolved QL5: every
user including Super Admin needs a license; `license.list` is deferred. Revision 2 also
approved issuer from deployment configuration, audience `f1-system-customer-backend`, and the
`{error:{code,message}}` envelope.
