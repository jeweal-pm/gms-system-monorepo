# Frontend dependencies: GMS platform migration

- UI revision: none; SA revision: 1; status: approved-design; see central TODO gates
- Ledger: [tech stack](../../../adr/tech-stack.md)

Reuse installed Next.js, React, tRPC 11 and TanStack Query while moving typed clients to domain routers. No new frontend library is proposed for the routing or auth transition. Better Auth remains server-owned; its opaque session, separate proposed access JWT and refresh cookie are handled through the approved backend contract. Do not install a new state manager, HTTP client or UI kit from this document. Changes to shared manifests and lockfile are serialized by the parent after the exact SA revision is approved.
