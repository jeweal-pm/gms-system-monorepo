# Frontend architecture: GMS platform migration

- Feature ID: `gms-platform-migration`; UI revision: none (existing screens and flows retained)
- SA revision: 1; status: approved-design; see central TODO gates
- Central TODO: [GP-FE items](../../../task/todo/gms-platform-migration.md)
- Source: [GMS target spec](../../../gms-platform-spec.md), [SA review](../../../reviews/sa/2026-10-20-gms-platform-migration-rev1.md), [routing ADR](../../../adr/0025-gms-domain-routing-and-trpc.md), [auth ADR](../../../adr/0026-gms-access-tokens-and-live-authorization.md)

The current Next app proxies `/api/auth`, `/api/trpc` and some `/api/v1` traffic to the gateway/auth services. The target runs behind one Nginx origin: domain API paths go directly to their owners, while Next owns pages and small `/bff/` composition routes. Preserve the visible login, activation, home and existing master pages during transport migration. No new inventory UI is authorized by this bundle.

After the approved backend routes and cookie contract exist, migrate one typed client/feature at a time to `/api/auth/trpc` or `/api/master/trpc`; inventory uses only a separately approved typed REST contract. Browser URLs stay relative. SSR calls private Docker DNS with bounded timeout, forwards the incoming user credential, forwards any refresh `Set-Cookie` to the browser and never shares personalized cache entries. Keep the legacy proxy/gateway path until each feature has parity and a tested return route. Do not infer that a hidden menu grants access; domain APIs enforce current grants and license.

The proposed user access and refresh cookies are Secure, HttpOnly and same-origin. Client refresh is single-flight across concurrent requests/tabs as the approved auth contract permits; a non-idempotent mutation is never replayed automatically after ambiguous auth or network failure. Cookie-authenticated mutations include CSRF/origin evidence. A known license denial follows the existing activation/access UI; temporary license-status failure is a distinct unavailable state. The proposed [offline policy](../../../spec/gms-license-offline-policy.md) defaults to two days; frontend does not calculate or extend grace. The API alone decides and may report a safe fallback status for user messaging.

Target standalone image and runtime configuration require an approved frontend/infra handoff. Customer-specific URLs and secrets stay runtime-only; no customer value is baked into `NEXT_PUBLIC_*`. Keep current frontend image and routes until Nginx, auth/master, SSR, capacity and rollback checks pass. This document does not approve a visual redesign or route cutover.
