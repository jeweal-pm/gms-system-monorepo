# API contract: mounted master customer/vendor tRPC boundary

- Source / SA revision: `INV-20261021-006-r1` / 1; approved for implementation (2026-10-21)
- Reuses: [master revision-1 tRPC procedures](../api-contract.md), [auth internal decision contract](../../../auth/gms-platform/inv006-auth-license-boundary/api-contract.md).

| Operation | Request authentication and validation | Before domain call | Outcome |
|---|---|---|---|
| Browser `/api/master/trpc/customer.*`, `vendor.*` | Same-origin `gms_access` cookie; EdDSA JWT issuer/audience/expiry; existing tRPC typed schemas and strict `limit <= 200`. | Mutation: exact trusted Origin, `X-GMS-CSRF: 1`, and `Sec-Fetch-Site` absent or same-origin/same-site must be enforced before view/license/domain work. Read: no CSRF requirement. Then current view row, private license result and exact existing action grant. | Existing typed result/error shape. 401 unauthenticated, 403 CSRF/license/grant denial, 503 auth/license dependency unavailable; no domain-service call for any denied/unavailable precondition. |

No client-supplied actor or license context is accepted. Current private license call is server-to-server only; see auth contract. Do not add public auth headers or cookie forwarding to the partner service. Expose only the mounted customer/vendor procedure family; company/stone remain on the legacy path until their own parity work. URL and tRPC route must not expose any `/internal/*` operation.
