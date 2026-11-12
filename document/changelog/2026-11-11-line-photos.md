# 2026-11-11 Line photos on Reserve, Memo Return, Memo Out, Memo Out Return and Purchase

- Decision: [ADR-0048](../adr/0048-line-photos-on-stock-documents.md) (Accepted 2026-11-11, owner "อนุมัติ"); TODO [line-photos](../task/todo/line-photos.md).
- The row panel on these five documents now takes up to 5 photos per line (JPEG/PNG ≤ 5 MB, drag to reorder, first = Default), as Quotation / Memo Receive / Purchase Order. "Photos for this document come in a later update." no longer shows on them. Lines picked from stock start without photos.
- Backend (backend-api-master): five `<doc>_line_photo` tables (migration `20261111090000_line_photos`); `photoIds` max 0 → 5 distinct; detail lines return `photoIds`; save checks every id is a ready photo of that document (`<CODE>_PHOTO_INVALID` 422) and writes the links in the same transaction (`withLinePhotos` wraps each document's existing line hook unchanged); routes `/api/v1/{reserve,memo-return,memo-out,memo-out-return,purchase}/photos` (POST ADD/EDIT + CSRF, GET VIEW) on the shared limiter.
- Infra: five nginx locations in `docker/nginx/gms-dev.conf`.
- Frontend: `trade-document/document-photos.ts` (routes, upload, read links); `document-form` takes `photos` from each page config; the five mappers load and send photos; refused photos get "A photo couldn't be used. Remove it and add it again."
- Verification and open items: see the TODO evidence.
