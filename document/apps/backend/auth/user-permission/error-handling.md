# Service error handling: auth + gateway / user-permission

- Source UI revision / SA revision: 2 / 2 (**implemented**; [ADR-0020](../../../../adr/0020-username-login-and-permission-matrix-v2.md) revision 1 Accepted 2026-10-15, owner "frontend backend อนุมัติ ADR-0020"). Revision 1 content below is kept where unchanged; revision 2 notes override it.
- Frontend counterpart: [error-handling.md](../../../frontend/user-permission/error-handling.md)
- Auth envelope (existing): `{error:{code, message, fieldErrors?: {path: string, code: string}[]}}`
- Gateway: `TRPCError({code: <tRPC code>, message: <domain code>})`. Add a router `errorFormatter`
  that copies `domainCode` and the bounded `fieldErrors` (≤ 50 entries) into `shape.data`. This is
  additive for existing procedures.

| Scenario | Domain error / status | Public contract (tRPC code) | User-visible outcome | Retry/idempotency | Logging |
|---|---|---|---|---|---|
| Invalid input (shape, length, unknown field incl. `email`/`photo`, username format) | `VALIDATION_ERROR` 400 (`fieldErrors` path `username` for the username rule) | `BAD_REQUEST` + `fieldErrors` | inline field errors | fix and resubmit | none (expected) |
| Password outside 4–64 | `PASSWORD_POLICY_VIOLATION` 400 | `BAD_REQUEST`, field `password` | field error with the policy message | — | never the value |
| Unknown permission key / location key | `PERMISSION_UNKNOWN` / `LOCATION_UNKNOWN` 400 | `BAD_REQUEST` | form error; reload catalog | refetch catalog | warn with key count only |
| Photo wrong type, magic bytes or size | `PHOTO_INVALID` 400 | `BAD_REQUEST`, field `photo` | error under the tile | choose another file | warn: size/type, no bytes |
| Body over 1 MiB | gateway 413 | `PAYLOAD_TOO_LARGE` | "Photo is too large" | resize | warn |
| No session / inactive session | 401 | `UNAUTHORIZED` | existing redirect to /login | — | existing |
| Caller license restricted | existing `LICENSE_*` | existing | existing license routing | — | existing |
| Not Super Admin | `SUPER_ADMIN_REQUIRED` 403 | `FORBIDDEN` | FE-UP-014 access-denied state | — | info: actor ID |
| Super Admin target: change permissions/active/password, or delete Super Admin/self | `SUPER_ADMIN_LOCKED` 403 (rev 2; replaces `SUPER_ADMIN_READ_ONLY`) | `FORBIDDEN` | locked cells/switch; Delete disabled; dialog/banner error if raced | — | warn: actor/target IDs |
| Username sent on update with a different value | `USERNAME_IMMUTABLE` 400, `fieldErrors:[{path:"username",code:"immutable"}]` | `BAD_REQUEST` | Username field error (field is read-only in the UI) | — | none |
| Missing grant on a menu procedure | `PERMISSION_DENIED` 403 | `FORBIDDEN` | page-level "no access" (future features) | — | info: menuKey/action |
| Target not found | `USER_NOT_FOUND` 404 | `NOT_FOUND` | toast + return to draft; list refetch | — | none |
| Duplicate username | `USERNAME_TAKEN` 409, `fieldErrors:[{path:"username",code:"duplicate"}]` (rev 2; replaces `EMAIL_ALREADY_EXISTS`) | `CONFLICT` | Username field error | change username | none |
| Seat cap reached | `USER_LIMIT_REACHED` 409 | `CONFLICT` | FormError banner "User limit reached (N of N)" | none until a user is deleted or the limit raised | info |
| Stale edit | `USER_CHANGED` 409 | `CONFLICT` | "This user was changed elsewhere. Reload?" | reload `get(id)` and reapply | none |
| Target username has no eligible license | `USER_LICENSE_NOT_ELIGIBLE` 422 | `UNPROCESSABLE_CONTENT` | FormError: "This username has no issued license. Contact sales." | after the license is issued | info: no email |
| License server outage / malformed during preflight | `USER_LICENSE_UNVERIFIABLE` 503 | `SERVICE_UNAVAILABLE` | FormError "Couldn't verify the license. Try again." | retry is safe (nothing created) | warn (existing sanitized license log) |
| License cache write failed after create | compensation delete → `USER_LICENSE_UNVERIFIABLE` 503 | `SERVICE_UNAVAILABLE` | same as above | retry is safe | error, no token |
| Gateway → auth timeout or connection failure | `USER_SERVICE_UNAVAILABLE` 503 | `SERVICE_UNAVAILABLE` | FormError "Couldn't save the user. Try again." | reads: client retry; create: a retry may hit `USERNAME_TAKEN` → UI suggests refresh | warn: route, duration |
| DB transaction failure | 500 → gateway `INTERNAL_SERVER_ERROR` | generic | generic error | retry | error with correlation ID, no PII |
| Wrong username/password (incl. impossible username format) | 401 `{code:"INVALID_USERNAME_OR_PASSWORD", attemptsRemaining}`; 3rd failure / locked → 423 `{code:"ACCOUNT_LOCKED", retryAfterSeconds}` | REST `/api/auth/sign-in/username` | login message | wait | LoginAttempt row (HMAC only) |
| Inactive user signs in with the correct password | `ACCOUNT_INACTIVE` 403 (Better Auth JSON; implemented rev 2) | REST | login message "บัญชีนี้ถูกปิดใช้งาน กรุณาติดต่อผู้ดูแลระบบ" | — | info: user ID |
| Photo not present | `PHOTO_NOT_FOUND` 404 | REST | tile shows the empty state | — | none |

Important: target-license failures use `USER_LICENSE_*` codes, **never** `LICENSE_REQUIRED/EXPIRED/REVOKED/UNVERIFIABLE`,
which the frontend treats as the caller's own license state and redirects on.

Rules: no stack traces, raw upstream messages, passwords, photo bytes, phone numbers or emails
in responses or logs (usernames are logged only as HMAC in `LoginAttempt`), beyond the user's own field values echoed in validation paths. Every
auth error log includes the request ID from pino-http. Gateway does not retry mutations.
