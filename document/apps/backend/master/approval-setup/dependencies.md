# Dependencies: approval-setup (SA revision 1, 2026-11-10, approved with ADR-0050)

- New packages: **none**. Uses installed NestJS, tRPC, zod, Prisma 7 (`backend-api-master`) and the auth catalog code (`backend-api-auth`).
- [tech-stack.md](../../../../adr/tech-stack.md): unchanged.
- Infra: none (no container, image, network, volume or variable change). DevOps: none (no workflow change). The go-live command runs with the existing master image (`node dist/scripts/approve-pending.js`), using the existing `PARTNER_DATABASE_URL`; one new optional variable `GO_LIVE_ACTOR_ID` read only by the command (documented in the release note, not a service variable).
- Service dependencies: master depends on the existing auth authorization view only; no new cross-service call.
- Ordering: ADR-0046 migration → this migration → master code → go-live command → frontend.
