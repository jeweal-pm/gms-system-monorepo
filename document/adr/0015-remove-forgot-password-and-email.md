# ADR-0015: เอา Forgot Password และระบบ Email ออก ให้ CRM เป็นผู้กำหนดรหัสผ่านเริ่มต้น

- **Status:** Accepted — revision 1 approved 2026-10-12
- **Date:** 2026-10-12
- **Feature / source UI revision:** `remove-forgot-password-email` / none (ลบหน้าและลิงก์เดิม ไม่มี UI spec ใหม่)
- **SA revision:** 1
- **Deciders:** Project owner
- **Approval evidence:** 2026-10-12 ผู้ใช้สั่ง implement revision 1: "นี่ยังไม่เริ่มทำใช่ไหมถ้ายังเริ่มทำได้เลย" — ข้อมูลตั้งต้นจากผู้ใช้ 2026-10-12: "frontend backend เอา flow forgot password ออก พวก email ด้วย นะเขียน adr มาให้ก่อนเริ่มทำ" และเลือก (1) เอาระบบ email ออกทั้งหมด (2) user ที่ลืมรหัสให้ติดต่อ admin นอกระบบ (3) CRM ส่งรหัสผ่านเริ่มต้นมาเอง
- **Supersedes / related ADRs:** Supersedes [ADR-0010](0010-system-generates-password.md) เมื่อ Accepted; related [ADR-0008](0008-use-better-auth.md), [ADR-0011](0011-change-password-via-profile-page.md), [ADR-0012](0012-change-flow-login.md), [ADR-0013](0013-per-user-license-with-signed-token.md)

## Context

ปัจจุบันระบบใช้ email สองจุด ผ่าน `EmailService.sendGeneratedPassword` (nodemailer → SMTP, local ใช้ Mailpit):

1. **สร้าง user จาก CRM** (`POST /api/v1/users`) — ระบบ generate รหัสผ่าน 12 ตัวแล้วส่ง email ให้ user ตาม ADR-0010
   ถ้าส่ง email ไม่สำเร็จจะลบ user ทิ้งแล้วตอบ 503
2. **Forgot password** (`POST /api/v1/auth/forgot-password`) — สุ่มรหัสใหม่ ส่ง email แทนรหัสเดิม และลบ session ทั้งหมด
   มี rate limit ผ่านตาราง `auth.ForgotPasswordAttempt`

ส่วนที่เกี่ยวข้องในโค้ดปัจจุบัน:

| ชั้น | สิ่งที่มีอยู่ |
|---|---|
| Frontend | หน้า `/forgot-password`, `forgot-password-form.tsx`, `forgotPasswordSchema` ใน `schemas.ts`, ลิงก์ "Forgot Password?" ใน `login-form.tsx` |
| Gateway | `POST api/v1/auth/forgot-password` forward ไป auth (`app.controller.ts`) |
| Auth | `forgotPassword`/`deliverForgotPassword`/`incrementForgotLimit` ใน `auth.service.ts`, route ใน `auth.controller.ts`, `src/email/**`, `generatePassword` ใน `password-policy.ts` |
| Better Auth | `revokeSessionsOnPasswordReset`, rate-limit rule `/request-password-reset` ใน `auth.ts` |
| Database | model `ForgotPasswordAttempt` (schema `auth`) |
| Dependencies | `nodemailer`, `@types/nodemailer` ใน `backend-api-auth/package.json` |
| Infra | service `mailpit` และตัวแปร `SMTP_*` ใน `docker-compose.yml`, `.env.example` |

ผู้ใช้ต้องการเอา flow forgot password และระบบ email ออกทั้งหมด
เมื่อไม่มี email ระบบจึงส่งรหัสผ่านเริ่มต้นให้ user ไม่ได้ ต้องเปลี่ยนที่มาของรหัสผ่านเริ่มต้น

## Decision

### 1. CRM กำหนดรหัสผ่านเริ่มต้น

`POST /api/v1/users` รับ field `password` เพิ่ม (required):

```json
{ "email": "somchai@example.com", "name": "Somchai", "role": "SUPER_ADMIN", "password": "********" }
```

- ตรวจด้วย `passwordSchema` เดียวกับการเปลี่ยนรหัสผ่าน ([Password Policy ข้อ 1](../spec/0003-password-policy.md): 4–64 ตัวอักษร)
  ไม่ผ่าน → `400 { "error": "PASSWORD_POLICY_VIOLATION", "violations": [...] }`
- Hash ด้วย Argon2id เหมือนเดิม ไม่เก็บ ไม่ log และไม่ส่ง password กลับใน response
- Response `201` คงรูปแบบเดิม `{ userId, email, createdAt }`
- ลำดับใหม่: ตรวจ API key → validate → ตรวจ email ซ้ำ → license preflight → transaction สร้าง user+account → cache license token
  (ตัดขั้นส่ง email และ rollback/503 ที่ผูกกับการส่ง email ออก)
- CRM ต้องเรียกผ่าน HTTPS และรับผิดชอบส่งรหัสให้ user ทางช่องทางของตัวเอง และต้องไม่ log รหัสผ่าน
- **Breaking change:** request ที่ไม่มี `password` จะได้ `400 VALIDATION_ERROR` — ต้องประสานกับทีม CRM ก่อน deploy

### 2. เอา Forgot Password ออก

- Frontend: ลบหน้า `/forgot-password`, `forgot-password-form.tsx`, `forgotPasswordSchema`
  และเอาลิงก์ "Forgot Password?" ออกจากหน้า Login โดยไม่แสดงข้อความแทน
  (แก้ตามคำสั่งผู้ใช้ 2026-10-12: "เอา ลืมรหัสผ่าน? กรุณาติดต่อผู้ดูแลระบบ ออกเป็นโล่งๆไปเลย")
- Gateway/Auth: ลบ route `POST /api/v1/auth/forgot-password` → ตอบ `404` ตาม default ของ NestJS
- Auth: ลบ `forgotPassword`, `deliverForgotPassword`, `incrementForgotLimit`, `generatePassword`
- Better Auth: ลบ `revokeSessionsOnPasswordReset` และ rule `/request-password-reset`
  และปิด endpoint reset ในตัวของ Better Auth (`/request-password-reset`, `/reset-password`) ด้วย `disabledPaths`
  เพื่อไม่ให้มีทาง reset รหัสผ่านค้างอยู่ (backend ยืนยันพฤติกรรมกับ Better Auth 1.7 ตอน implement)
- User ที่ลืมรหัสผ่าน: ติดต่อ admin นอกระบบ ตอนนี้ **ยังไม่มีเครื่องมือ reset รหัสให้ admin** (ดู Consequences)
- การเปลี่ยนรหัสผ่านเองจากหน้า Profile ([ADR-0011](0011-change-password-via-profile-page.md)) ยังอยู่เหมือนเดิม

### 3. เอาระบบ Email ออก

- ลบ `backend-api-auth/src/email/**` และการ inject `EmailService`
- ลบ `nodemailer` และ `@types/nodemailer` (แก้ manifest/lockfile ผ่าน integration owner)
- ลบตัวแปร `SMTP_HOST`, `SMTP_PORT`, `SMTP_SECURE`, `SMTP_USER`, `SMTP_PASSWORD`, `SMTP_FROM`
- ลบ service `mailpit` ออกจาก Docker Compose (ส่งต่อ infra) และ variable ที่เกี่ยวข้องใน CI (ส่งต่อ devops)

### 4. Database

- Migration ใหม่ drop table `auth."ForgotPasswordAttempt"` และลบ model ออกจาก `schema.prisma`
- ข้อมูลในตารางเป็นตัวนับ rate limit อายุ 1 นาที ไม่มีข้อมูลธุรกิจ จึงไม่ต้อง backfill
- ไม่มีการเปลี่ยน `User`, `Account`, `Session`, `LoginLockout`, `LoginAttempt`

## Alternatives

| ทางเลือก | ข้อดี | ข้อเสีย |
|---|---|---|
| คงไว้เหมือนเดิม (ADR-0010) | ไม่ต้องแก้โค้ด, user กู้รหัสเองได้ | ต้องดูแล SMTP provider ในทุก instance ลูกค้า ซึ่งผู้ใช้ไม่ต้องการ |
| ระบบ generate แล้วคืนรหัสให้ CRM ครั้งเดียวใน response | รหัสเริ่มต้นยังแข็งแรง (12 ตัว), policy อยู่ที่เดียว | รหัสยังไหลผ่าน CRM เหมือนกัน และขัดกับหลัก "API ไม่ส่ง password กลับ" |
| **CRM ส่งรหัสผ่านมาเอง (เลือก)** | ระบบเราไม่ต้องมีช่องทางส่ง credential เลย, contract ตรงไปตรงมา | รหัสผ่านผ่าน CRM (ความเสี่ยงที่ ADR-0010 เคยปฏิเสธ), CRM ต้องรู้ password policy, รหัสอาจอ่อน (ขั้นต่ำ 4 ตัว) |
| Admin ตั้ง/reset รหัสผ่านผ่านหน้า admin ในระบบ | ไม่ต้องพึ่ง CRM, แก้ปัญหาลืมรหัสได้ในระบบ | ต้องออกแบบ UI/สิทธิ์ admin ใหม่ทั้งชุด เกินขอบเขตงานนี้ — ทำเป็น ADR แยกได้ภายหลัง |

ผู้ใช้เลือกให้ CRM ส่งรหัสผ่านมาเองเมื่อ 2026-10-12

## Consequences and capacity

**ข้อดี**
- ไม่ต้องตั้งค่าและดูแล SMTP/ส่งซ้ำ/กู้คืนเมื่อส่ง email ไม่สำเร็จ (ปิดงานค้างใน `tech-stack.md`)
- การสร้าง user ไม่ล้มเพราะ email ส่งไม่ได้อีกต่อไป
- ลด attack surface: ไม่มี endpoint สาธารณะที่เปลี่ยนรหัสผ่านโดยไม่ต้อง login และไม่มี SMTP egress

**ข้อเสีย / ความเสี่ยง**
- **รหัสผ่านผ่าน CRM:** CRM อาจเก็บหรือ log รหัส — ต้องตกลงกับทีม CRM ให้ใช้ HTTPS และไม่ log body
  และฝั่งเราต้องยืนยันว่า gateway/auth ไม่ log request body
- **ไม่มีทางกู้รหัสในระบบ:** จนกว่าจะมี ADR เครื่องมือ admin reset รหัส user ที่ลืมรหัสจะใช้งานต่อไม่ได้
  (การแก้ hash ใน database ตรง ๆ ไม่ใช่ขั้นตอนที่รองรับ) — แนะนำให้ทำ ADR แยกก่อน go-live
- **รหัสเริ่มต้นอ่อนได้:** CRM ส่งรหัส 4 ตัวได้ตาม policy การป้องกันพึ่ง lockout ของ ADR-0012 และ rate limit
- ข้อเสนอใน ADR-0012 เรื่อง "แจ้งเตือนทาง email เมื่อบัญชีถูกล็อกบ่อย" ทำไม่ได้แล้ว
- ADR-0010 และ [Password Policy ข้อ 2](../spec/0003-password-policy.md) (รหัสที่ระบบ generate) จะล้าสมัย

**Compatibility / rollout / rollback**
- ลำดับ deploy: CRM พร้อมส่ง `password` → backend (auth+gateway+migration) → frontend → infra เอา Mailpit/SMTP ออก
- Frontend ลบหน้าได้หลัง backend ลบ endpoint หรือพร้อมกัน เพราะไม่มีผู้ใช้อื่นของ endpoint นี้
- Rollback: revert commit ของแต่ละ role และเพิ่ม migration ใหม่สร้าง `ForgotPasswordAttempt` คืน (Prisma ไม่มี down migration)
  user ที่สร้างระหว่างนั้นยังใช้งานได้ เพราะรหัสผ่านถูก hash ในตาราง `Account` เหมือนเดิม

**Capacity (8 GB RAM / 4 vCPU)**
- เอา Mailpit ออกคืน limit 0.15 vCPU / 256 MB ใน Compose; รวมทั้ง stack ลดเหลือ 2.85 vCPU / 5.0 GiB
- ลบงาน async ส่ง email และ query rate limit forgot password; ไม่เพิ่ม connection pool, cache หรือ container

**งานต่อเนื่องเมื่อ Accepted**
- SA: อัปเดต [API Contract](../spec/0001-api-contract.md) ข้อ 1 และ 3, [Login Flow](../diagram/login-flow.md),
  [Login Requirements](../spec/0002-login-requirements.md), [Password Policy](../spec/0003-password-policy.md),
  [tech-stack.md](tech-stack.md), [backend architecture](../apps/backend/architecture.md)
  และเขียน TODO ที่ `document/task/todo/remove-forgot-password-email.md`
- เปลี่ยน ADR-0010 เป็น `Superseded by ADR-0015`
- Infra: แก้ Compose/`.env.example` และ service index; DevOps: เอา variable SMTP ออก

## Acceptance and approval

**Observable checks**
1. `POST /api/v1/users` พร้อม `password` ที่ผ่าน policy → `201` และ login ด้วยรหัสนั้นได้
2. ไม่มี `password` หรือ password สั้นกว่า 4 ตัว → `400` และไม่มี user ถูกสร้าง
3. Response ของการสร้าง user และ log ของ gateway/auth ไม่มีรหัสผ่าน
4. `POST /api/v1/auth/forgot-password` ทั้งผ่าน gateway และ auth → `404`
5. Better Auth `/api/auth/request-password-reset` และ `/api/auth/reset-password` ใช้งานไม่ได้
6. `/forgot-password` → `404` และหน้า Login ไม่มีลิงก์หรือข้อความเรื่องลืมรหัสผ่าน
7. Auth start ได้โดยไม่มีตัวแปร `SMTP_*` และ stack รันได้โดยไม่มี Mailpit
8. ไม่มีการอ้างอิง `nodemailer`, `EmailService` และ `ForgotPasswordAttempt` เหลือในโค้ด; migration ใหม่ apply ได้บน database เดิม
9. Login, lockout (ADR-0012), เปลี่ยนรหัสผ่านจาก Profile (ADR-0011) และ license (ADR-0013) ยังทำงานเหมือนเดิม

**การอนุมัติครอบคลุม**
- ADR นี้ revision 1 และงานต่อเนื่องที่ระบุข้างต้น
- การลบ package `nodemailer` และ `@types/nodemailer` (ไม่มี package ใหม่)
- การลบ service `mailpit` และตัวแปร `SMTP_*` จาก Compose/`.env.example`

อนุมัติ revision 1 แล้ว (ดูหลักฐานในหัวเอกสาร) การเปลี่ยนแปลงที่มีนัยสำคัญต้องออก revision ใหม่และขออนุมัติอีกครั้ง
