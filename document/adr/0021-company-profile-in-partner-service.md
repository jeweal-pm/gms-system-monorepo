# ADR-0021: Company Profile in the partner service, binary logo route, rich text as JSON

- **Status:** Accepted — SA revision 2 (owner 2026-10-16 ≈12:00 +07:00: "บันทึกลงใน folder ใน backend เลยเมื่ออัพรูปใหม่ไปจะไปทับรูปเก่า  logic นี้ แค่ module company profile เท่านั้น  อนุมัติ company-profile SA revision 1")
- **Date:** 2026-10-16
- **Feature / source UI revision:** `company-profile` / 2 ([TODO](../task/todo/company-profile.md))
- **Related:** [ADR-0001](0001-record-architecture-decisions.md), [ADR-0007](0007-trpc-procedure.md), [ADR-0016](0016-per-user-menu-action-permissions.md), [ADR-0018](0018-customer-master-partner-service.md)
- **Details:** [SA bundle](../apps/backend/partner/company-profile/decisions.md)

## Context

The Setup › Company Profile page needs one company record, a logo of up to 10 MB (owner) and two rich-text fields. No service owns company data yet. The tRPC body limit is 1 MB and partner JSON is limited to 256 kB.

## Decision

1. `backend-api-partner` owns the company profile (module `company-profile`, schema `partner`, one row with `id = 1`), reusing its reference lists, token-protected internal API and migrations. No new service.
2. The logo uses a dedicated binary REST path (gateway `PUT/GET /api/v1/company-profile/logo` → partner internal), raw bytes ≤ 10 MB, signature-checked, **stored as one file in the partner service folder** `storage/company-profile/logo` (owner, revision 2), overwritten on each upload and served with immutable, versioned caching. Production keeps the read-only root filesystem and mounts the named volume `partner-storage` for that folder.
3. Rich text is stored as Tiptap/ProseMirror JSON validated by a strict schema (allowed nodes/marks, safe link protocols, size and depth limits). No HTML is stored, so no sanitiser package is needed.
4. Access uses the existing `company-profile` catalog leaf: VIEW to read, EDIT to change.

## Consequences

- No new container, package or environment variable; one additive migration.
- The gateway gains its first binary upload route and a shared request-context helper for REST and tRPC.
- Future invoices render the JSON with Tiptap `generateHTML` (or a small renderer) instead of trusting stored HTML.
- The logo lives in a Docker volume, so backups must copy the volume as well as the database. Revisit (object storage, infra review) if more upload features are added; this folder is for the company profile module only.
