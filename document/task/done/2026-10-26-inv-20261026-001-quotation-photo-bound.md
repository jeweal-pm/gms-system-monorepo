# Completion: INV-20261026-001 revision 1

- Feature/ticket: [`INV-20261026-001`](../investigation/INV-20261026-001-quotation-photo-routes-no-aggregate-bound.md) revision 1 (merged sec-auditor + security-auditor record); root cause `binary-image-routes:no-aggregate-buffer-bound` (api-master quotation photo routes).
- Owner approval: user instructed `แก้  INV-20261026-001` on 2026-10-26.
- Root cause: the quotation photo routes (SA-QT-10) bounded each request to 5 MB but not how many ran at once; uploads were buffered by `express.raw` and downloads concatenated the whole file, so ~30–40 concurrent requests could exceed api-master's 384 MiB limit.
- Changed source (uncommitted, branch `feat/26-10-26-integrate-quotation-api`):
  - `backend-api-master/src/quotation/quotation-photo.http.ts` — per-process limiter (3 uploads, 6 downloads) acquired after live authorization and before `express.raw`; over the cap → 503 `PARTNER_UNAVAILABLE` + `Retry-After: 1` (existing code, no contract change); slot released once on `finish`/`close`; no slot when the client already left; a GET with a body → 400.
  - `backend-api-master/src/quotation/quotation-photo.storage.ts` — `openQuotationPhoto` + `sizeGuard` replace whole-file reads.
  - `backend-api-master/src/quotation/quotation-photo.public.controller.ts` — GET streams with `content-length`; a stream error destroys the response.

## Verification

- Unit tests UT-QT-B26…B30 (cap, idempotent release, release on finish and abort, client gone during auth, denied users, GET with body, size guard) and the streamed GET test; full api-master suite 369 passed; tsc and eslint clean.
- Live through nginx `:8080` (dev): GET with a body → 400, GET without a session → 401, PUT → 405.
- Follow-up review: sec-auditor and security-auditor both clear on the same revision (sha256/16 `2d731c80f47ca01e`, `a081331be6ae0a24`, `9392fb2dfd07b0c2`).

## Remaining advisory

Slots are held for the whole request/response: a production ingress without buffering could let slow clients keep the routes at 503 (memory stays bounded). The production ingress is not in this repo. No load test was run.
