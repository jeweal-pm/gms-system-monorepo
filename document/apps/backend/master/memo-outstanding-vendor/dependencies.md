# Dependencies: memo-outstanding-vendor (SA revision 1, 2026-10-29, approved 2026-10-29)

There is no new package, container, image, volume, route, variable or secret, so infra and devops have nothing to do. The [tech-stack ledger](../../../../adr/tech-stack.md) is unchanged.

The page uses installed Prisma, zod and tRPC (master router) on the backend, and react-query, `masterTrpc` and the existing table, popover, sheet and print components on the frontend.

Data dependency: `memo_receive` and `memo_stock` from [memo-receive SA rev 1–2](../memo-receive/decisions.md).
