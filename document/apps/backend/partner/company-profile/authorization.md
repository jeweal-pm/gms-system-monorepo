# Authorization: company-profile (SA 1, pending-review)

| Operation | Gateway check | Partner check |
|---|---|---|
| `companyProfile.get`, `companyProfile.options`, `GET …/logo` | session + licence (existing) + `company-profile:VIEW` | service token, actor id present |
| `companyProfile.save`, `companyProfile.removeLogo`, `PUT …/logo` | session + licence + `company-profile:EDIT`; REST PUT also checks `Origin` equals the app origin | service token, actor id present |

- Super Admin has every permission (existing `permission.mine` / `permittedProcedure`).
- ADD, DELETE, PRINT and EXCEL are not used by this feature (SA-CP-07). The frontend shows read-only without EDIT.
- The partner never trusts browser input directly: it re-validates every field and the image signature.
- Logging: no field values, no image bytes; log actor id, operation, outcome, size and duration only.
