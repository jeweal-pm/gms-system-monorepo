# Dependencies: company-profile (SA 1, pending-review)

**No new package** in any workspace. Partner and gateway reuse NestJS, Express (`express.raw` is part of Express 5), Prisma 7.10.0, Zod 4 and Node `crypto` (sha256). Rich text is validated as JSON (SA-CP-03), so no HTML sanitiser is needed. The rejected alternative, `sanitize-html` for HTML storage, is not proposed.

Frontend packages for this feature were already installed under UI revision 2 (Tiptap 3.31.4, libphonenumber-js 1.13.14).

Shared files: `backend-api-partner/prisma/schema.prisma` and its migrations, `backend-api-gateway/src/trpc/router.ts`, `backend-api-gateway/src/main.ts`, `backend-api-partner/src/main.ts`, both `app.module.ts`. Edited serially by the parent integration owner. Lockfile: no change.
