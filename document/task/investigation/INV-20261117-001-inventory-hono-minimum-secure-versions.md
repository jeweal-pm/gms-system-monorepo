# INV-20261117-001 — backend-api-inventory must pin Hono / node-server releases with the November 2026 security fixes

## Tracking

- Ticket revision: 1
- Status: pending-review
- Owner: infra (finding); implementation role: backend (package pin, BE-LS-006)
- Priority: awaiting user review
- Auditor / mode / run ID: infra / version-specific research for INF-LS-001 / none
- Date and audit scope: 2026-11-17; dependency rule in `document/apps/backend/inventory/load-to-stock/dependencies.md` vs upstream advisories
- Source commit, dirty paths, and relevant content hashes: base `4254526`, branch `feat/17-11-26-load` (uncommitted); `backend-api-inventory/package.json` not yet present
- Related ticket / root-cause fingerprint: `inventory-hono-pin-age-rule-vs-security-release`
- Category: hardening
- Verdict: not-applicable (no vulnerable version is installed yet)

## Evidence and impact

- Affected files: `document/apps/backend/inventory/load-to-stock/dependencies.md` rows `hono` ("exact pin of the latest 4.x stable release that is ≥ 2 weeks old at install") and `@hono/node-server` ("latest 1.x ≥ 2 weeks old").
- Upstream facts (checked 2026-11-17): `hono` 4.13.18 (2026-11-11) fixes `bodyLimit()` unbounded memory with small transfer chunks (GHSA-39q9-qp46-w8xg, affects 4.12.16–4.13.17), a `validator()` content-type parameter bypass (GHSA-92p4-j3wq-jmqx), and `mount()` path issues; 4.13.16 (2026-11-01) fixes `csrf()` `text/ping`, `validator('form')` multipart bypass and RegExpRouter wildcard-middleware skips. `@hono/node-server` 1.19.18 / 2.1.6 (2026-11-02) fix a raw-backslash path rewrite that bypasses reverse-proxy path rules (GHSA-jpvv-r467-5p4w, CVE-2026-126210); 1.19.19 / 2.1.7 (2026-11-11) fix a `serveStatic` double decode.
- Impact: applying the two-week age rule on 2026-11-17 selects `hono` ≤ 4.13.14 and `@hono/node-server` ≤ 1.19.17, i.e. versions with the `bodyLimit` and `validator` issues on exactly the middleware the SA design uses (`hono/body-limit`, Zod validation) and the proxy-path bypass. Unauthenticated memory exhaustion of the 256 MiB container is the most direct consequence.
- Infra mitigation already in place: Nginx returns 400 for a raw backslash in `/api/inventory/*` paths and limits bodies (256k / 6m), but Nginx buffering does not change the chunking seen by Node, so the `bodyLimit` issue still needs the patched release.
- Sources: <https://github.com/honojs/hono/security/advisories>, <https://github.com/honojs/hono/releases>, <https://github.com/honojs/node-server/security/advisories/GHSA-jpvv-r467-5p4w>, <https://github.com/honojs/node-server/releases>.

## Proposed work

- Allowed scope: backend `backend-api-inventory/package.json` (parent-serialized) and `pnpm-lock.yaml`; SA/backend note in `dependencies.md`.
- Suggested remediation: pin `hono` exactly at ≥ 4.13.18 and `@hono/node-server` at ≥ 1.19.19 (1.x) or ≥ 2.1.7 (2.x); record the security exception to the age rule; do not use `serveStatic`.
- SA change needed: no contract change; the dependency rule gets a "security releases override the age window" note.
- Acceptance criteria: lockfile resolves those minimums; `pnpm audit --prod` (or the CI equivalent) shows no open Hono/node-server advisory; a test posts a chunked body over the limit and gets 413 without process growth.

## User selection and approval

- Approved ticket revision:
- Actual user instruction / approval evidence:
- Approval date:

## Implementation and resolution

- Corrective pass limit: 3 (initial fix included); passes allocated: 0; active pass: none.

### Backend pin evidence (2026-11-17, BE-LS-006, on the parent's instruction)

- `backend-api-inventory/package.json` pins `hono` **4.13.18** and `@hono/node-server` **2.1.7** (2.x because the advisory database marks every 1.x ≥ 1.19.10 as affected by GHSA-rmxm-3fg6-px4f, patched only in 2.1.3+; 2.1.7 includes the backslash-path and serveStatic fixes). `pnpm-lock.yaml` resolves exactly these; `pnpm audit --prod` shows no Hono / node-server advisory.
- No `serveStatic`; `hono/body-limit` caps JSON at 256 KiB and photo uploads at 5 MiB + 64 KiB. Test `body caps: JSON > 256 KiB → 413 even when chunked` (`backend-api-inventory/test/load-to-stock/http-photos-sse.db.integration.test.ts`) passes.
- Remaining for this ticket's owner: user review / closure; no further backend change planned.
