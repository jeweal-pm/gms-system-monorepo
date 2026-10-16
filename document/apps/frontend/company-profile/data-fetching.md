# Frontend data flow: company-profile

- UI revision: 1 (pending-review)
- Related SA contract: **none yet**. Backend requirement: **requires-sa** ([handoff](../../../coordination/handoffs/company-profile-sa.md))

Proposed operations (names are illustrative; SA decides the service, router and exact shapes):

| UI action / TODO ID | Proposed operation | Input / output | Query key / cache | Loading / error / empty | Backend owner |
|---|---|---|---|---|---|
| Open page (FE-CP-009) | `companyProfile.get` query | none → `profile \| null` (fields, `logo: {url, contentType, updatedAt} \| null`, `version`) | tRPC key; `staleTime` 30 s | skeleton / page error + Retry / `null` = Setup mode | SA → backend |
| Options (FE-CP-005) | reuse the partner **options** lists (currencies, countries), via an existing or company-specific procedure | `{currencies, countries}` | `staleTime: Infinity` (as vendor) | select disabled while loading; error → field-level "Couldn't load options" + Retry | SA decides whether the profile service reads the partner lists |
| Save (FE-CP-009) | `companyProfile.upsert` mutation | all fields + `version` + logo change → saved profile | invalidate `companyProfile.get` | Save spinner; field errors mapped; conflict → reload prompt | SA → backend |
| Logo bytes (FE-CP-006) | same-origin REST/route proxy for the image (GET) and upload (multipart or base64 in the mutation) | JPEG/PNG ≤ limit | browser cache by `updatedAt` query string | broken image → empty tile + "Couldn't load logo" | SA (precedent: `UserPhoto` Bytes in PostgreSQL) |
| Permissions (FE-CP-010) | existing `permission.mine` | `company-profile` actions | existing | as partner `PartnerAccessGuard` | existing |

Rules for SA to settle: a single record per installation; optimistic concurrency (`version`) so that two admins do not overwrite each other silently; server-side sanitising of the rich text (allowed tags only: `p, br, strong, em, s, a[href http/https/mailto], ol, ul, li, code, pre`) or Markdown storage; logo checked by file signature and size; audit fields (`updatedBy`, `updatedAt`). There is no pagination (one record).

Independent UI work (FE-CP-001…008) uses a typed local model and does not call any API. Wiring (FE-CP-009/010) waits for the approved SA bundle and backend delivery.
