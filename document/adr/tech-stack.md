# Tech Stack

- **Last updated:** 2026-10-11
- **Owner:** Project team
- **Status:** Initial implementation aligned with accepted ADRs

ตารางนี้สรุป stack ที่ใช้งานใน monorepo ปัจจุบัน การเปลี่ยน core stack ต้องมี ADR และแก้เอกสารนี้พร้อม code ใน PR เดียวกัน

## Runtime และสถาปัตยกรรม

| หมวด | เทคโนโลยี | ขอบเขต |
|---|---|---|
| Runtime | Node.js 24.11.0 | `.nvmrc`; ใช้ pnpm 10.22.0 |
| Language | TypeScript 5.9, strict | frontend และ backend |
| Repository | pnpm monorepo | หนึ่ง repository สำหรับ frontend และ backend |
| Architecture | Microservices | NestJS gateway และ domain services; เริ่มจาก auth service |
| Network boundary | tRPC สำหรับ frontend app data; REST สำหรับ CRM integration และ Better Auth | ห้าม frontend เรียก internal service ตรง |
| Database | PostgreSQL 18.6 หรือ compatible | แบ่ง schema และเจ้าของข้อมูลตาม service |
| ORM | Prisma 7 | ใช้ Prisma Client และ committed migrations |

เหตุผลการตัดสินใจอยู่ใน [ADR-0001](0001-record-architecture-decisions.md), [ADR-0002](0002-use-typescript.md),
[ADR-0003](0003-use-postgresql.md), [ADR-0004 Frontend](0004-use-Nextjs-tanstack-for-Frontend.md),
[ADR-0006](0006-use-prisma-orm.md), [ADR-0007](0007-trpc-procedure.md) และ [ADR-0008](0008-use-better-auth.md)

## Core libraries

| หน้าที่ | เลือกใช้ | หมายเหตุ |
|---|---|---|
| Frontend | Next.js 16 App Router, React 19 | ดู ADR-0004 Frontend |
| Styling | Tailwind CSS 4 | ใช้ utility classes; CSS เพิ่มเฉพาะกรณี custom จริง ([ADR-0005](0005-use-tailwild-for-css-styling)) |
| Server state | TanStack Query 5 + tRPC 11 | ไม่เรียก internal API ด้วย fetch/axios จาก feature code |
| Form | react-hook-form + Zod 4 | validation ฝั่ง client และ server |
| UI icons | lucide-react | ติดตั้งอยู่ใน frontend; component sheet/UI kit ใหม่ต้องผ่าน dependency ledger ด้านล่าง |
| Authentication | Better Auth 1.7 | email/password, Argon2id, secure session cookie |
| Database client | Prisma 7 + PostgreSQL adapter | migration เป็นแหล่ง schema change |
| Logging | NestJS Logger / structured logs | ห้าม log password, credential หรือ API key |
| Email | ไม่มี | ระบบไม่ส่ง email; เอา SMTP, Mailpit และ `nodemailer` ออกตาม [ADR-0015](0015-remove-forgot-password-and-email.md) |

## Development และ deployment

| หมวด | เครื่องมือ |
|---|---|
| Package manager | pnpm 10.22.0; ห้ามสร้าง npm/yarn lockfile |
| Lint / format | ESLint, Prettier |
| Unit / integration | Vitest 5.0.3 (devDependency) ใน frontend, backend-api-partner, backend-api-gateway ตั้งแต่ 2026-10-16 (company-profile unit tests, โฟลเดอร์ `test/`); ยังไม่มี DOM test library และ integration test DB |
| UI / E2E | ยังไม่มี browser automation; เพิ่ม Playwright เมื่อเริ่มทำ E2E suite |
| Local dependencies | Docker Compose: PostgreSQL |
| Production | Docker Compose เป็น baseline สำหรับเริ่มระบบ; แยก environment และ secret ก่อน deploy |
| Production capacity | Host 4 GB RAM / 2 vCPU ([ADR-0024](0024-production-host-4gb-2vcpu.md), 2026-10-19); Compose service limits รวม 1.70 vCPU / 2944 MiB เพื่อกัน headroom ~1.1 GiB ให้ OS และ Docker ([capacity](../infra/capacity.md)) |

## Dependency proposals and implementation status

ใช้ร่วมกับ [UI delivery workflow](../workflow/ui-delivery.md) และ feature `dependencies.md`.
ตรวจ `package.json` และ `pnpm-lock.yaml` ก่อนเลือก library; ตาราง stack ด้านบนคือ baseline
ที่ติดตั้งอยู่ ไม่ใช่รายการเสนอใหม่. `ui-spec` และ `sa` เพิ่มรายการด้านล่างเมื่อมีดีไซน์/งานจริง
พร้อมเหตุผล ลิงก์เอกสารทางการ ความเข้ากันได้ และต้นทุน bundle/runtime บน host 4 GB / 2 vCPU.

| Package / workspace | Status | Purpose / feature / revision | Official evidence / alternatives | Bundle / host cost | ADR / review bundle | Owner approval evidence | Installed version |
|---|---|---|---|---|---|---|---|
| `nodemailer@^7.0.12`, `@types/nodemailer@^7.0.4` in `backend-api-auth` | removed | ระบบไม่ส่ง email แล้ว; feature `remove-forgot-password-email` SA revision 1 | n/a (removal) | ลด dependency และ SMTP egress; ไม่มี runtime เพิ่ม | [ADR-0015](0015-remove-forgot-password-and-email.md) | Owner instructed implementation of revision 1 on 2026-10-12 | Removed from manifest and lockfile 2026-10-12 |
| `libphonenumber-js` in `frontend` | installed | Per-country phone validation/formatting for PhoneField; feature `user-permission` UI revision 1, DEP-UP-01; needed only if Q-UP-09 requires per-country rules | [npm metadata](https://registry.npmjs.org/libphonenumber-js/latest) (MIT, no runtime deps, ESM, `sideEffects:false`), [README](https://gitlab.com/catamphetamine/libphonenumber-js); alternatives: Zod length/regex only, server-only validation | Client only, about 80 kB `min` metadata (estimate; lazy-load on route); no server/container cost | none; [user-permission dependencies](../apps/frontend/user-permission/dependencies.md); [company-profile DEP-CP-02](../apps/frontend/company-profile/dependencies.md) | Owner 2026-10-16 for `company-profile` revision 2: "Phone ให้ลง lib ที่นายแนะนำเลยเอาที่เขาใช้กันทั่วไป" | 1.13.14 exact (2026-10-16); used by company-profile; user-permission DEP-UP-01 may reuse it |
| `country-flag-icons` in `frontend` | installed | Flag icons in phone country selector; `user-permission` UI revision 1, DEP-UP-02; only if many countries are needed (Q-UP-09) | [npm metadata](https://registry.npmjs.org/country-flag-icons/latest) (MIT, no runtime deps, per-country React SVG exports); alternatives: inline SVG for an approved short list, no flag (flag emoji does not render on Windows) | Per imported country, small SVG (estimate a few hundred bytes to ~2 kB each); no runtime cost | none; [user-permission dependencies](../apps/frontend/user-permission/dependencies.md) | Owner 2026-10-17 "ทาง A" (PhoneField countries from libphonenumber-js + local flags; per-flag lazy chunks via generated `src/lib/flag-loaders.ts`) | 1.6.20 exact (2026-10-17) |
| `motion` in `frontend` | installed | Animated drag-and-drop reorder of the Stone Code parts (`Reorder` from `motion/react`); `stone-master` UI revision 1 follow-up | [motion.dev](https://motion.dev/docs/react-reorder) (MIT; deps `framer-motion`, `tslib`; peers React 18/19); reference component 21st.dev ddoemonn/reorder-list uses it; alternative considered: native FLIP with CSS transitions (no spring physics) | Client only, loaded on the Stone Code route (estimate 30–40 kB gzip); no server/container cost | none; [stone-master dependencies](../apps/frontend/stone-master/dependencies.md) | owner 2026-10-19: "frontend หน้า stone code อยากได้ drag and drop คล้ายๆแบบนี้ https://21st.dev/…/reorder-list อยากได้ animation คล้ายๆแบบนี้", then chose "ใช้ motion 14.0.0 (Recommended)" | 14.0.0 exact (released 2026-10-02, ≥ 14 days); lockfile gained motion, framer-motion, motion-dom, motion-utils 14.0.0; pnpm also re-keyed the better-auth/next snapshot (same versions); `pnpm install --frozen-lockfile` passes |
| `jose@6.2.12` in `backend-api-auth` | approved | EdDSA JWT verification and development-only mock token signing; `auth-license` SA revision 2, BE-LIC-001/005 | [Official jose API docs](https://github.com/panva/jose/tree/main/docs) and [v6.2.12 release](https://github.com/panva/jose/releases/tag/v6.2.12); exact direct version avoids custom JWT code | Existing auth process; no container. CPU/latency runtime measurements remain pending. | ADR-0013/0014, [auth-license bundle](../apps/backend/auth/license-integration/architecture.md) | Owner approved SA revision 2 on 2026-10-11 (`อนุมัติชุดนี้`) | Installed as exact direct dependency `6.2.12` |
| none new — new workspace `@gem-crm/backend-api-partner` reusing locked NestJS 12.1.2, Prisma 7.10.0 (+ `partialIndexes` preview), `@prisma/adapter-pg` 7.10.0, pg 8.23.1, zod 4.6.5, nestjs-pino 5.3.1 (pino 10.4.0), express 5.2.1 | installed (no new package) | `customer` SA rev 1 / UI rev 1, BE-CUS-001 | Rejected: `country-state-city`, `exceljs`, backend `libphonenumber-js`, `pg_trgm` | +1 container 0.35 vCPU / 512 MiB (measured idle RSS 80 MiB in the hardened image); +5 DB connections | [ADR-0018](0018-customer-master-partner-service.md), [bundle](../apps/backend/partner/customer/architecture.md) | Owner 2026-10-14T11:45+07:00 "อนุมัติ customer ทั้งชุด ใช้ค่าแนะนำ …" | 2026-10-14: lockfile gained importer `backend-api-partner` only (resolved versions above, all pre-existing); pnpm re-serialized one `eslint-plugin-import@2.32.0` snapshot peer key (same versions) |
| `@tiptap/react`, `@tiptap/pm`, `@tiptap/starter-kit`, `@tiptap/extensions` in `frontend` | removed | **Removed 2026-10-17** (`company-profile` SA revision 3, SA-CP-17: Bank Details became plain text, Terms removed). Was: rich-text editor for Company Bank Details and Terms; `company-profile` UI revision 1, DEP-CP-01 | [Next.js install guide](https://tiptap.dev/docs/editor/getting-started/install/nextjs) (client component, `immediatelyRender: false`), MIT; alternatives: Markdown textarea + toolbar (no package), Lexical | Client only, route-split; estimate ≈100–150 kB min+gzip incl. ProseMirror (measure at build); no server/container cost | none; [company-profile dependencies](../apps/frontend/company-profile/dependencies.md) | Owner 2026-10-16 "อนุมัติ company-profile revision 1" (Tiptap default, Q-CP-05) | 3.31.4 exact (2026-10-16) |
| `vitest@5.0.3` (devDependency, exact) in `frontend`, `@gem-crm/backend-api-partner`, `@gem-crm/backend-api-gateway` | installed | Unit tests in `test/` folders; `company-profile` (planned in the stack table: "เพิ่ม Vitest เมื่อเริ่มทำชุดทดสอบ") | [vitest.dev](https://vitest.dev/) MIT; released 2026-09-30 (newest ≥ 14 days); brings vite 8.3.4, rolldown, lightningcss as dev-only transitive packages | Dev/CI only; not in production images (devDependency; build stages unaffected). Runs with 2 workers | none | Owner 2026-10-16: "frontend backend ทำ unit test case ส่วนของ company-profile ให้ฉันด้วย" + selected "โค้ด test ในโฟลเดอร์ test/" (test runner as devDependency) | 5.0.3 exact |

ข้อเสนอปัจจุบัน: `user-permission` UI revision 1 เสนอ `libphonenumber-js` และ `country-flag-icons`
แบบมีเงื่อนไข (status proposed, ยังไม่ติดตั้ง, รออนุมัติ UI และคำตอบ Q-UP-09); dialog/toast/table/checkbox/
multi-select ใช้ native element กับ stack ที่ติดตั้งแล้ว ไม่มี UI kit ใหม่. ตัวอย่าง Vendor sheet ไม่ใช่คำสั่งติดตั้ง.

- **proposed:** วิเคราะห์แล้ว แต่ยังไม่อนุมัติและยังไม่ติดตั้ง.
- **approved:** เจ้าของตรวจและอนุมัติ revision/package ที่ระบุแล้ว; บันทึกหลักฐานจริง.
- **installed:** frontend/backend ติดตั้งระหว่างทำงานที่อนุมัติแล้ว และตรวจ manifest/lockfile
  พร้อมบันทึกเวอร์ชันจริง; parent integration owner จัดการ shared files ทีละงาน.
- **rejected:** ข้อเสนอถูกปฏิเสธหรือแทนด้วยวิธีอื่น; เก็บเหตุผลและตัวเลือกที่เลือก.

Frontend ต้องอ่าน ledger และ `dependencies.md` ของ TODO ล่าสุดทุกครั้งที่เริ่มงาน.
Core stack, service, runtime/queue/cache ใหม่ หรือการเปลี่ยนสถาปัตยกรรมต้องมี ADR และการตรวจ
เอกสาร SA ก่อน code/migration/API wiring/dependency installation ที่เกี่ยวข้อง.
Approval ของ UI ไม่ครอบคลุมเอกสาร SA ที่สร้างภายหลัง และ approval ไม่ใช่หลักฐานการติดตั้ง.
การเปลี่ยน flow/API/schema/package choice ต้องอัปเดต revision และให้ตรวจส่วนที่เปลี่ยนใหม่.

## Development security audit tooling

`sec-auditor` uses [Cloudflare security-audit-skill](https://github.com/cloudflare/security-audit-skill)
at commit `c1c8a8c1471069fb0e188eeaff69b8e8db6564a8`, installed project-locally under
`.codex/skills/sec-auditor/`. It adds no application package or runtime service. Original
Node JSON validators run in a bounded Linux container on Windows using the existing local
development image. Findings first enter `document/task/investigation/` for owner review;
implementation and any dependency change require a selected approved scope.
See [integration instructions](../skills/spec/sec-auditor-integration.md).

## Container infrastructure role

`infra` researches official, version-specific Docker/image/service configuration when an
ADR adds or changes containers. Its bundle is included in relevant SA approval; accepted
scoped work can then configure shared files through the parent integration owner. It checks
required inter-service traffic, secrets, permissions, writable volumes, isolation, backups
and the total 4 GB RAM / 2 vCPU budget. Reviews first stage findings in investigation.
It adds no application dependency or background watcher. See
[infra delivery](../workflow/infra-delivery.md) and [service index](../infra/service-index.md).

## CI and image delivery

`devops` acts as a senior DevOps engineer. GitHub Actions use Node from `.nvmrc`, pnpm from
packageManager and the frozen lockfile; CI runs existing lint/build/typecheck and quiet
Compose validation. A manual image workflow builds frontend/gateway/auth using pinned
upstream actions; GHCR publication is off by default and gated by named configuration.
No app package/test runner or production deployment is added. Build execution belongs on
GitHub runners rather than the 4 GB RAM / 2 vCPU production host.
See [GitHub configuration](../devops/github-configuration.md) and
[DevOps delivery](../workflow/devops-delivery.md).

## Cookie และ consent

ปัจจุบันใช้เฉพาะ cookie session ที่จำเป็นต่อการเข้าสู่ระบบตาม Better Auth ไม่มี analytics หรือ marketing tracking จึงยังไม่มี consent banner หรือ consent log หากจะเพิ่ม cookie/script ที่ไม่จำเป็น ต้องทบทวน [ADR-0009](0009-cookie-consent-approach.md) และ [Cookie & Consent Spec](../spec/0004-cookie-and-consent.md) กับ DPO/privacy owner ก่อนเปิดใช้

## เรื่องที่ต้องตัดสินใจก่อน production

- ตกลงกับทีม CRM ให้ส่ง `password` ผ่าน HTTPS และไม่ log รหัสผ่าน ([ADR-0015](0015-remove-forgot-password-and-email.md))
- ออกแบบเครื่องมือให้ admin reset รหัสผ่าน user ที่ลืมรหัส (ADR แยก; ตอนนี้ไม่มีทางกู้รหัสในระบบ)
- เปลี่ยน `AUTH_SECRET`, `CRM_API_KEY` และฐานข้อมูลเป็น secrets ที่จัดการภายนอก repository
- ให้ DPO ทบทวน consent banner และ privacy notice ก่อนเพิ่ม third-party cookies หรือ analytics
- ใช้ policy ล็อกบัญชีตาม [ADR-0012](0012-change-flow-login.md)
- ระบุ deployment topology, TLS termination, backup/restore และ monitoring สำหรับทุก service
- กำหนด trusted ingress/client-IP header สำหรับ rate limit; ห้ามรับ forwarded IP จาก client โดยตรง
