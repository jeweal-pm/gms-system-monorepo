# SA decisions: company-profile (partner)

- Feature ID / SA revision: `company-profile` / SA 2 (**approved**: revision 1 + the owner's storage change, owner 2026-10-16 ≈12:00 +07:00: "บันทึกลงใน folder ใน backend เลยเมื่ออัพรูปใหม่ไปจะไปทับรูปเก่า  logic นี้ แค่ module company profile เท่านั้น  อนุมัติ company-profile SA revision 1")
- Revision 2 change: SA-CP-05 (logo stored as a file in the partner service folder, overwritten on each upload, company profile module only); consequences in SA-CP-04/06, the database diagram and infra bundle [backend-api-partner/2](../../../../infra/services/backend-api-partner/2/security.md)
- Source UI revision: 2 (approved 2026-10-16, [TODO](../../../../task/todo/company-profile.md))
- Request: [SA handoff](../../../../coordination/handoffs/company-profile-sa.md); owner 2026-10-16 "ทำ api ให้เลยได้มั้ย" (request to build the API; not approval of this bundle)
- Bundle: this file, [architecture](architecture.md), [api-contract](api-contract.md), [database-diagram](database-diagram.md), [sequence-diagram](sequence-diagram.md), [authorization](authorization.md), [error-handling](error-handling.md), [dependencies](dependencies.md), [testing](testing.md), [ADR-0021](../../../../adr/0021-company-profile-in-partner-service.md)

## Owner decisions already given (not re-asked)

Logo ≤ 10 MB, JPEG/PNG; Phone validated per country (frontend libphonenumber-js); Print/Excel disabled; one company profile; editor = Tiptap (UI revision 2).

## Decisions in this revision (approve "as written", or name an ID to change it)

| ID | Decision | Why / alternatives |
|---|---|---|
| SA-CP-01 | **Owner service: `backend-api-partner`**, new module `company-profile`, tables in schema `partner` | It already owns the currency/country reference lists, has the gateway client, service token and migrations. No new container (8 GB host). Rejected: auth (identity only), a new service (+1 container). |
| SA-CP-02 | **One record per installation**: `company_profile.id` is a constant `1` (CHECK) | Q-CP-11 default. No list or delete operation. |
| SA-CP-03 | **Rich text stored as Tiptap/ProseMirror JSON**, validated by a strict Zod schema (allowed nodes: doc, paragraph, text, hardBreak, bulletList, orderedList, listItem, codeBlock; marks: bold, italic, strike, code, link with `http(s):`/`mailto:` href only; depth ≤ 8, ≤ 2,000 nodes; text length ≤ 5,000 bank / 10,000 terms) | No HTML is stored, so there is nothing to sanitise and no XSS path; **no new package**. A future invoice renders it with Tiptap `generateHTML`. Alternative: store HTML + `sanitize-html` (new backend dependency). The frontend changes its field value from HTML to JSON (FE-CP-007 small change). |
| SA-CP-04 | **Logo through a binary REST path**, not tRPC: `PUT/GET /api/v1/company-profile/logo` (gateway, session cookie) → `PUT/GET /internal/v1/company-profile/logo` (partner). Raw body, `Content-Type: image/jpeg \| image/png`, ≤ 10 MB; removal via tRPC `companyProfile.removeLogo` | A 10 MB image in tRPC JSON would be ≈13.4 MB base64 and exceed the 1 MB tRPC limit (customer D-10). Raw bytes keep memory at ≈1× file size per hop. |
| SA-CP-05 | **Revision 2 (owner):** the logo is a **file in the partner service folder** `storage/company-profile/logo` (relative to the partner working directory). A new upload **overwrites** the old file (temp file + atomic rename in the same folder, under a row lock); removal deletes it. Only the company-profile module uses this folder. The DB keeps metadata only (`logo_content_type`, `logo_size_bytes`, `logo_sha256`, `logo_updated_at`) | Owner instruction. Production needs the named volume `partner-storage` (infra bundle backend-api-partner/2); dev writes into the git-ignored repo folder. Served with `Cache-Control: private, max-age=31536000, immutable` keyed by `?v=<sha256 prefix>`. Revision 1 (bytea table) superseded. |
| SA-CP-06 | Server checks the logo **file signature** (JPEG `FF D8 FF`, PNG `89 50 4E 47 0D 0A 1A 0A`) and that it matches `Content-Type`; size ≤ 10,485,760 bytes; no re-encoding or resizing | Q-CP-04 (owner 10 MB). |
| SA-CP-07 | Permissions: `company-profile:VIEW` for get/options/logo GET; **`company-profile:EDIT`** for save, logo upload and removal (ADD is not used, also for the first save) | Simple rule for admins; Super Admin has all. Frontend `canEdit` becomes `access.edit` only. |
| SA-CP-08 | Optimistic concurrency: integer `version` (starts 1, +1 per save or logo change); save sends `expectedVersion` (`null` for the first save) → `CONFLICT` on mismatch | Two admins cannot silently overwrite each other (TC-CP-18). |
| SA-CP-09 | Save then logo: the page saves fields first (`companyProfile.save`), then uploads or removes the logo with the new `expectedVersion`. A failed logo step leaves the saved fields and shows "Details saved, but the logo couldn't be updated" | Keeps each request small and simple; the logo can be retried. Logo upload requires an existing profile (`COMPANY_PROFILE_NOT_FOUND` otherwise). |
| SA-CP-10 | Phone stored as the partner contract `{country, e164}` (gateway `phoneSchema`); website `http(s)` URL ≤ 300; other limits as the [form guidelines](../../../frontend/company-profile/form-guidelines.md) | Same shape as vendor/customer. |
| SA-CP-11 | Options: `companyProfile.options` returns the partner reference lists (same object as `vendor.options`) under `company-profile:VIEW` | A company admin may not have vendor permission. |

## Open questions

None blocking. Q-CP-09 (no Tax ID/postcode format) and Q-CP-10 (EDIT permission) take the defaults above.

## Backend handoff (only after the owner approves this exact revision)

Backend items BE-CP-001…008 in the [central TODO](../../../../task/todo/company-profile.md); then frontend FE-CP-007 (JSON value) and FE-CP-009/010.
