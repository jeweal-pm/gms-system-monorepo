# 2026-11-20 — Sale backend (BE-SL-001…007, BE-SL-008 backend part)

- Master: Sale consumption internal API completed and tested (prepare in ≤ 4 queries, circular import fixed); migration `20261118090000_sale_consumption` unchanged (already applied).
- Inventory: migration `20261119090000_sale` (sale, sale_line, sale_charge, sale_line_photo, sale_sync_op; approval type `sale`), generic `SyncDriver` (op store + master port, shared sweep budget), Sale module `/api/inventory/v1/sale*` (options, next-number, list, get, reserve-lines, create/update/submit/approve/revise/reject/delete/restore, photos under `files/sale/`), Approve Center + notifications for `sale`, `sync:redrive sale <id>`.
- Tests: master 798 passed / inventory 71 passed on a fresh disposable DB. Record: `document/apps/backend/inventory/sale/testing.md`.
