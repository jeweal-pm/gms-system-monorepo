# Flat module storage layout

- **Date:** 2026-10-21
- **Scope:** New user-uploaded image object keys for company profile and user photos
- **Owner direction:** Store files directly under `storage/files/{module}/{file}`.

## Result

New logo keys use `company-profile/<filename>` and new user-photo keys use `user-photo/<filename>` beneath the configured storage root's `files` bucket. A module may provide its own safe basename with the matching content extension; when absent the adapter generates a UUIDv7 filename and validated extension. For local development, this is `C:\dev\f1-system\storage\files\{module}\{file}`. The driver rejects writes outside the assigned module prefix and reads outside that module plus its exact legacy prefix. Historical service-prefixed keys remain read-only. No existing files were moved or deleted; all user-upload bytes remain permanently retained.

## Verification

- `@gms/storage`: 25 tests passed, including dynamic filename and exact legacy-prefix checks.
- Auth photo and service tests: 29 tests passed.
- Company-profile storage/service tests: 40 tests passed.
- Auth and master backend typechecks passed.
- Storage package TypeScript build/typecheck passed using the workspace compiler and existing backend Node type definitions.
- Both `sec-auditor` and `security-auditor` reviewed the same final source revision and returned advisory with no newly confirmed vulnerability. Their hardening notes match existing tickets INV-20261021-002 and INV-20261021-003; no duplicate tickets were created.
- Container reload and runtime upload were not performed in this change. Existing profile metadata continues to reference the prior logo key until the next upload.
