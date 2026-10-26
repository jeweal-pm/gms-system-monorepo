# INV-20261026-001 — Quotation photo routes have no total concurrency bound on buffered 5 MB bodies

## Tracking

- Ticket revision: 1
- Status: resolved 2026-10-26 (pass 1)
- Owner: backend (api-master)
- Priority: awaiting user review
- Auditor / mode / run ID: sec-auditor / focused pre-handoff review (read-only, static) / no run ID
- Date and audit scope: 2026-10-26; quotation SA rev 1 / ADR-0032 backend + frontend wiring (working tree on `feat/26-10-26-integrate-quotation-api`).
- Source commit, dirty paths, and relevant content hashes: HEAD b4136f5 + uncommitted working tree. Review hash 9a1a4ca06c95458d = sha256 (first 16) of `git diff -- backend-api-master/src docker/nginx/gms-dev.conf frontend/src/features/quotation` followed by `backend-api-master/src/quotation/*`, `document-numbering.ts`, the `20261026090000_quotation` migration, `frontend/src/features/quotation/lib/options.ts` and `options-context.tsx`. File hashes (first 16): `quotation-photo.storage.ts` d95ac4934dbc8e71, `quotation-photo.public.controller.ts` 4c9e5ba4fa7875e5, `main.ts` bf4e73a1b2c58c0c.
- Related ticket / root-cause fingerprint: `binary-image-routes:no-aggregate-buffer-bound`. Same root cause as INV-20261017-008 (auth/gateway user photo), which explicitly left other routes out of scope; this ticket covers the new api-master quotation photo boundary only. A shared helper may resolve both when the owner selects them.
- Category: hardening
- Verdict: not-applicable

## Evidence and impact

- Affected files and line numbers:
  - `backend-api-master/src/main.ts` L61: `express.raw({ limit: QUOTATION_PHOTO_MAX_BYTES })` buffers up to 5 MB per POST (and per GET that carries an image content type) after authorization.
  - `backend-api-master/src/quotation/quotation-photo.storage.ts` L28-45: `readQuotationPhoto` collects every chunk and `Buffer.concat`s the whole object (up to 5 MB) per GET.
  - `backend-api-master/src/quotation/quotation-photo.public.controller.ts` L41 (`storeQuotationPhoto(body, …)`) and L85 (`response.end(data)`).
  - `docker/nginx/gms-dev.conf` L58-61: route has `client_max_body_size 6m` but no `limit_conn` / `limit_req`.
  - `docker-compose.yml` api-master: `memory: 384M`, `cpus: "0.25"`.
- Attacker prerequisites and reachable entry point: an authenticated, licensed user holding `quotation:ADD` or `quotation:EDIT` (POST, plus CSRF headers) or only `quotation:VIEW` (GET). Entry: `POST /api/v1/quotation/photos`, `GET /api/v1/quotation/photos/:id`.
- Concrete trust boundary and source-to-sink trace: each request is individually bounded correctly (live grant check before `express.raw`, 5 MB limit, type + magic bytes, size-checked read). Nothing bounds how many such requests run at once in the api-master process, so N concurrent requests hold roughly N × 5–10 MB of off-heap Buffers (body-parser chunks + concat; read chunks + concat).
- Observed impact and independent verification evidence: static estimate only. Roughly 30–40 concurrent 5 MB uploads or downloads could exceed the 384 MiB container limit and OOM-kill api-master, taking customer, vendor, company-profile, stone-master, document-setup and quotation down together. Not a privilege escalation (the actor already holds the grant); it is a gap in keeping workloads bounded within the 4 GB / 2 vCPU host budget.
- Missing validation fact / capability (if any): measured RSS per request; whether the production ingress (not in this repo) applies connection/rate limits for this path.
- Sanitized evidence sufficient for owner review: yes.
- Raw report/run links: none.

## Proposed work

- Allowed code scope and assigned implementation role: backend — `backend-api-master/src/main.ts`, `backend-api-master/src/quotation/quotation-photo.*`, and their tests. Optional ingress `limit_conn` on the route is an infra/parent-serialized Docker edit, selected separately.
- Suggested remediation: a small in-process semaphore applied before `express.raw` (e.g. 2–4 concurrent uploads, a few concurrent downloads); requests over the cap get 503 (or 429) with a stable domain code and the slot is released on finish/error/abort. Stream the GET from storage to the response (bounded by the stored size check) instead of concatenating. Optionally reject GET requests that carry a body.
- SA design / contract / flow / dependency change needed: SA review only if a new error code is added to the quotation API contract. No dependency.
- Acceptance criteria: requests above the cap are rejected before any body buffering; GET does not hold a full concatenated copy; tests cover the cap and its release on error/abort.
- Safe verification plan and prerequisites: unit tests with fake streams/requests. No load test against shared or live services.

## Corroborating review (merged 2026-10-26)

security-auditor reviewed the same revision independently (photo-route hash 0e5779acf337bfa8) and reached the same root cause and impact estimate. Its duplicate record `INV-20261026-001-quotation-photo-route-no-aggregate-buffer-bound.md` was merged here by the parent so one durable record remains (AGENTS.md). Its proposed work, kept for the owner:

### security-auditor proposed work

- Allowed code scope and assigned implementation role: backend — `backend-api-master/src/quotation/quotation-photo.*`, `backend-api-master/src/main.ts` (parent-serialized composition root), and their tests. Optional ingress `limit_conn` belongs to infra as a separately selected task.
- Suggested remediation:
  - Add a small in-process semaphore (for example 2-3 concurrent uploads and 4-6 concurrent downloads) applied in the access-check middleware before `express.raw`; over-cap requests get 503 (or 429) with a stable domain code and the permit is released on finish/abort/error.
  - Stream GET responses from storage (`storage.get` piped to the response with the size bound kept) instead of buffering and concatenating.
  - Consider reusing the same helper for the company-logo routes and INV-20261017-008 under its own selection.
- SA design / contract / flow / dependency change needed: SA review only if a new error code is added to the quotation API contract. No dependency needed.
- Acceptance criteria:
  - Concurrent photo requests above the cap are rejected before any body buffering.
  - GET peak memory per request is no more than about one stream chunk window rather than 2x file size.
  - Tests cover the cap, release on error/abort, and the unchanged auth/type/size checks.
- Safe verification plan and prerequisites: unit/integration tests with fake streams; no load test against shared or live services.

## User selection and approval

- Approved ticket revision: 1 (merged record)
- Actual user instruction / approval evidence: owner 2026-10-26 "แก้  INV-20261026-001"
- Approval date: 2026-10-26
- Separate approved SA bundle/revision, if required: none — over-cap requests reuse the existing `PARTNER_UNAVAILABLE` (503) code, no contract change

Do not infer approval from creation of this ticket or approval of a different revision.

## Implementation and resolution

Apply [bounded remediation](../../workflow/remediation.md); counts persist across roles,
revisions, and sessions for the same cause. Do not allocate a fresh budget on handoff.

- Selected work ID / root-cause fingerprint: `binary-image-routes:no-aggregate-buffer-bound` (api-master quotation photo)
- Corrective pass limit: 3 (initial fix included)
- Passes allocated: 1
- Active pass: none (pass 1 succeeded)
- User-authorized extension and new limit: none
- Stop reason / missing prerequisite: none
- Reopen evidence and explicit selection: none

| Pass | Owner(s) / input revision or hash | Causal hypothesis / new evidence | Meaningful change | Authorized verification / result / failure signature | Next fact or terminal decision |
|---|---|---|---|---|---|
| 1 | backend (parent) / HEAD b4136f5 + working tree | Unbounded concurrent photo requests each hold up to 5–10 MB (buffered upload, concatenated GET) | Per-process limiter (3 uploads, 6 downloads) after live auth and before `express.raw`, 503 `PARTNER_UNAVAILABLE` + Retry-After over cap, release on finish/close; GET streamed through `sizeGuard`; GET with a body → 400 | master vitest 369 pass, tsc + eslint clean; live via nginx: GET+body 400, no session 401, PUT 405; sec-auditor + security-auditor clear (hashes 2d731c80f47ca01e / a081331be6ae0a24 / 9392fb2dfd07b0c2) | Terminal: resolved |

- Assigned owner and start date: backend (parent session, applying the backend skill), 2026-10-26
- Changed files / implementation revision: `backend-api-master/src/quotation/quotation-photo.http.ts`, `quotation-photo.storage.ts`, `quotation-photo.public.controller.ts`; tests `backend-api-master/test/quotation/quotation-photo.http.test.ts` (UT-QT-B26…B30), `quotation-photo.test.ts` (streamed GET). Uncommitted on `feat/26-10-26-integrate-quotation-api`.
- Checks performed, results, and limitations: unit tests for cap, idempotent release, release on finish and abort, client gone during auth, denied users take no slot, GET with body, stream size guard; full master suite 369 pass. No load test (not authorized on shared services); memory figures remain estimates.
- Follow-up auditor and verification evidence: sec-auditor focused follow-up 2026-10-26 (read-only, static + unit tests), pass 1 working tree; file hashes (sha256 first 16) `quotation-photo.http.ts` 2d731c80f47ca01e, `quotation-photo.storage.ts` a081331be6ae0a24, `quotation-photo.public.controller.ts` 9392fb2dfd07b0c2, `main.ts` bf4e73a1b2c58c0c (unchanged), `test/quotation/quotation-photo.http.test.ts` 97ff1bd0e9644b16. Verdict: **clear** — acceptance criteria met. (1) `main.ts` L61 order is method check → live auth + slot (`createQuotationPhotoAccessCheck`) → `express.raw`, so over-cap (3 POST / 6 GET) requests get 503 `PARTNER_UNAVAILABLE` + `retry-after: 1` before any body is read; denied users never acquire a slot (acquire happens after `requireMasterGrant`/`uploaderId`, catch path takes none). (2) Release is idempotent and bound to `finish` + `close`; the "client left during authorization" guard relies on `response.closed || response.destroyed`, confirmed on Node v22.14.0 by a local probe (client abort mid-request → close fired, `closed=true`, `destroyed=true`), so no slot leak. (3) GET streams `createReadStream` → `sizeGuard(size)` → response via `stream/promises.pipeline` (pipeline destroys all streams on error/abort, so no FD leak); no whole-file concat remains; head-size check ≤ 5 MB kept; errors after headers destroy the socket and log only `{event, id}` (no error text leaked). (4) Response headers come from the validated stored `contentType` (jpeg/png) and a numeric size — no header-injection path. (5) GET with `content-length > 0` or any `transfer-encoding` → 400 before auth. `npx vitest run test/quotation`: 5 files / 32 tests passed. Advisory only (no new ticket): slots are held for the full request/response lifetime, so if a future ingress does not buffer requests/responses (nginx dev uses default `proxy_request_buffering`/`proxy_buffering` on), slow clients could keep the photo feature at 503 for other users — memory stays bounded; there is no unit test of the mid-stream error → `destroy` branch. — security-auditor focused follow-up 2026-10-26 (read-only, static + unit tests), same pass 1 hashes (`quotation-photo.http.ts` 2d731c80f47ca01e, `quotation-photo.storage.ts` a081331be6ae0a24, `quotation-photo.public.controller.ts` 9392fb2dfd07b0c2); `npx vitest run` of the two photo test files: 9/9 passed. Verdict: **clear**, concurs with sec-auditor; acceptance criteria met. Independent checks: body-parser 413/415/400 and other errors after acquire are all answered (`bodyErrorHandler` or `next(error)` → Nest/Express handler), so `finish` releases; keep-alive is safe because `finish` fires per response; no auth bypass (controller re-checks the grant, acquire only after the grant passes); a GET with a non-numeric `content-length` is rejected by Node's parser first. Advisory only (no new ticket): (a) `quotation-photo.http.ts` L41-44 releases on `close`, so a POST client that sends the full body and then aborts frees its slot while `storeQuotationPhoto`/Prisma still hold the ≤ 5 MB buffer; this is bounded by upload bandwidth × local write time, so it is not a regression. (b) `quotation-photo.public.controller.ts` L84/L92: Node `strictContentLength` is false (checked on v22.14.0), so if an object were shorter than its `head` size the response would end short and the client/nginx would wait until proxy timeout. Objects are immutable, so this is unlikely, and the slot is still released on `finish`. (c) Tests do not cover the `openQuotationPhoto` invalid-size throw (storage.ts L35) or the real `express.raw` error path.
- Remaining risk or reopened validation gap: advisory only — slots are held for the whole request/response, so a production ingress without request/response buffering could let slow clients keep the routes at 503 (memory stays bounded); an upload slot is freed on client close while the 5 MB buffer may still be written; untested branches: mid-stream error destroy and invalid stored size. Production ingress config is not in this repo.
- Completion report under document/task/done/: [2026-10-26-inv-20261026-001-quotation-photo-bound.md](../done/2026-10-26-inv-20261026-001-quotation-photo-bound.md)
- Final status / date: resolved 2026-10-26
