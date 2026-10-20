# Authorization: auth / GMS platform migration

- SA revision: 1, approved-design; see central TODO gates; [API](api-contract.md); [ADR-0026](../../../../adr/0026-gms-access-tokens-and-live-authorization.md)

| Operation/resource | Authentication | Backend enforcement | Denied outcome | TODO |
|---|---|---|---|---|
| Sign-in | Existing Better Auth credential | Existing lockout, active account, signed license eligibility; no password disclosure | Generic 401/activation state | GP-AUTH-01 |
| Refresh | Valid one-time refresh bound to one active Better Auth session | Atomic token rotation; current user/license; family reuse detection | 401/403/503 | GP-AUTH-02 |
| Auth user admin/menu rights | Access JWT + current view; existing role/permission rules | Auth-owned tRPC checks menu/action and delegation bounds; super admin still needs license | 401/403 | GP-AUTH-04 |
| JWKS | Public | Public keys only; no private key and bounded cache | 503 on key store failure | GP-AUTH-03 |
| Logout/password change/deactivation | Existing authenticated session and CSRF | Revoke Better Auth session plus refresh family; current view invalidates protected next request | 401/403/503 | GP-AUTH-02/04 |

JWT claims identify a caller; they are not a permission grant. Local account/session/grant changes deny the next request through the proposed live view. A reachable license-server revocation denies the next request through the approved online design in ADR-0026. During a transient outage, a still-valid signed eligible result may be used for `LICENSE_OFFLINE_GRACE_DAYS` (default 2, 0 denies immediately); a remote revocation cannot be known until reconnection or grace expiry. Explicit revoked/expired status never uses grace. SA revision 1 and the GMS §2 exception are approved; the actual remote contract and implementation remain blocked. Frontend hiding a menu never authorizes a backend operation. `X-Actor-User-Id` from browser is ignored. Internal service calls need service authentication separately from user claims.

**SA revision 3 approved and staged:** the service now resolves the immutable license subject from its own `User` record and rejects a disabled/missing user; a caller-supplied subject is not accepted. Only the newest database-ordered `ACTIVE` decision can support outage grace. `DENIED`, unknown, stale, malformed or database-unavailable states fail closed. The future private endpoint must still authenticate its service caller and verified user/session identity before GP-AUTH-05 activation.
