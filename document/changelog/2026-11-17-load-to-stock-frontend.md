# 2026-11-17 — Load to Stock frontend (UI rev 1 + SA rev 1)

- New page Inventory › Load to Stock (`/inventory/load-to-stock`, `/[id]`): header, Item table, Load table in None / Split / Merge, Add From Purchase picker, load-mode dialog, row panel (Location, Stock Price, Sale Price, photos), Daybook / Summary, ADR-0050 approval flow. Feature code `frontend/src/features/load-to-stock/**`.
- New typed REST client for `backend-api-inventory` (`frontend/src/lib/inventory-client.ts`): same-origin `/api/inventory/v1`, error envelope, one renew-and-retry on 401, Zod-checked responses; `readDomainError` reads its errors.
- Approve Center, Approval Setup and the notification bell now include Load to Stock from the inventory service (`features/inventory/**`, `approve-center/inventory.ts`, two notification streams). Sidebar link points to the real page.
- No package changes. Tests: 124 files / 1,098 pass. Live checks wait for the running service — see `document/apps/frontend/load-to-stock/testing.md`.
