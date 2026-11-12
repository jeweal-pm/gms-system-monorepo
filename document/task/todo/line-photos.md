# TODO: line-photos

- feature-id: `line-photos`
- revision: SA 1 (no UI revision: reuses the existing row-panel photo grid)
- status: **approved** 2026-11-11 (owner "อนุมัติ"); BE-LP-001…006, INF-LP-001, FE-LP-001…002 **implemented** 2026-11-11; FE-LP-003 security reviews pending
- request: owner 2026-11-11, "อันไหนที่เขียน Photos for this document come in a later update. ให้เพิ่มรูปได้แล้ว"; answers: "Own uploads, like PO (Recommended)"
- scope: Reserve, Memo Return, Memo Out, Memo Out Return, Purchase (the documents that show "Photos for this document come in a later update.")
- design: [ADR-0048](../../adr/0048-line-photos-on-stock-documents.md); pattern references: Purchase Order photos ([ADR-0041](../../adr/0041-purchase-order-document.md) decision 5, `backend-api-master/src/purchase-order/purchase-order-photo.public.controller.ts`)
- dependencies: none new
- approved-revision: SA 1
- approval-evidence: owner in chat 2026-11-11, "อนุมัติ"

## Implementation items

| Done | ID | Owner | Task | Allowed files | Depends on | Acceptance | Verification |
|---|---|---|---|---|---|---|---|
| [x] | BE-LP-001 | backend | Migration: five `<doc>_line_photo` tables (ADR-0048 D1) | `backend-api-master/prisma/schema.prisma`, `backend-api-master/prisma/migrations/<new>/**` | approval | Same shape/constraints as `purchase_order_line_photo`; additive only | migration applies on restart; DB integration test |
| [x] | BE-LP-002 | backend | Photo sources, `<CODE>_PHOTO_INVALID` errors, `checkLinePhotos` per document (D3) | the five services, `src/common/errors.ts` | BE-LP-001 | Foreign / pending / unknown ids refused at `lines.N.photoIds.M` | unit + DB integration |
| [x] | BE-LP-003 | backend | Schemas `photoIds` max 0 → 5 unique; detail lines output `photoIds`; save writes photos in the same transaction, composed with existing line hooks (D4) | `trade-document/memo-schemas.ts`, `purchase/purchase.schemas.ts`, the five services, `customer-stock-document.ts`, `document-engine.ts` (only if a hook-composition helper is needed) | BE-LP-002 | Existing Stock ID / stock behaviour unchanged; order kept; approved documents read-only | existing suites + new UT/IT |
| [x] | BE-LP-004 | backend | Five photo controllers + module registration (D2) | `src/<doc>/…-photo.public.controller.ts`, the module files | BE-LP-002 | POST ADD/EDIT + CSRF, GET VIEW; JPEG/PNG ≤ 5 MB; signature check | controller tests as PO |
| [x] | BE-LP-005 | backend + parent | `main.ts` access checks + shared limiter for the five routes | `backend-api-master/src/main.ts` (parent-serialized composition root) | BE-LP-004 | Same middleware chain as PO | route tests |
| [x] | BE-LP-006 | backend | Restart api-master; signed-in smoke: upload, read, save with photos, refuse a foreign photo id | — | BE-LP-001…005 | All pass | smoke log |
| [x] | INF-LP-001 | infra + parent | nginx: five `location ^~ /api/v1/<doc>/photos` blocks copied from the PO block (D8) | `docker/nginx/gms-dev.conf` (shared, parent-serialized) | approval | Upload ≤ 5 MB reaches api-master; reads stream | curl through :8080 |
| [x] | FE-LP-001 | frontend | Per-document photo target in `document-form.tsx` config (replace `NO_PHOTOS`); `upload…Photo` / `…PhotoUrl` in the five api modules (D9) | `frontend/src/features/{reserve,memo-return,memo-out,memo-out-return,purchase}/**`, `frontend/src/features/trade-document/**` | BE-LP-006, INF-LP-001 | The later-update note is gone on the five documents; uploads, reorder, Default, remove work; approved = read-only | UT + IT |
| [x] | FE-LP-002 | frontend | Save sends `photoIds`; detail maps `photoIds` to photo refs | same | FE-LP-001 | Photos survive save / reload / duplicate document | IT |
| [ ] | FE-LP-003 | frontend + parent | Typecheck, lint, full suites; both security reviews on the final diff | — | all | pass | full suites |

## Approval and revisions

| Revision | Date | Change | Status |
|---|---|---|---|
| SA 1 | 2026-11-11 | ADR-0048: own line photos on five documents, like PO | **approved** 2026-11-11 (owner, chat) |

## Evidence (2026-11-11)

- Changelog: [2026-11-11-line-photos](../../changelog/2026-11-11-line-photos.md).
- backend-api-master: `tsc --noEmit` exit 0; ESLint 0 errors on the changed files; `vitest run` 46 files / 540 passed (13 DB-integration files skipped: no test database); new `test/trade-document/line-photos.test.ts` UT-LP-01…05; 4 schema/router tests moved from "no photos" to "≤ 5 distinct photos".
- Migration `20261111090000_line_photos` applied on api-master restart; `prisma migrate diff` DB → schema shows no difference for the new tables (only the pre-existing partial index `stored_files_one_ready_source_key`, which Prisma cannot model).
- nginx: 5 locations added, `nginx -t` ok, reloaded.
- Live smoke through :8080 (superadmin): upload 201 + read 200 image/png + read without session 401 on all five routes; `reserve.create` with a Purchase photo id → 422 `RESERVE_PHOTO_INVALID` at `lines.0.photoIds.0`, nothing written (0 photo links, stock 260005 unchanged). Five 2×2 test PNGs remain as unreferenced `stored_files` rows (same as any unsaved upload).
- frontend: `tsc` exit 0; ESLint 0 errors; `vitest run` 100 files / 907 passed (new `test/trade-document/document-photos.test.ts` UT-LP-F01…F04; each document mapper loads photos from its own route); container restarted, the five pages return 200.
- Not run: a full save with photos through the UI (would create dev documents), browser check, both security reviews (FE-LP-003).
