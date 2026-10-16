# API Contract: Login & Password Management

- **Status:** Draft; initial implementation contract
- **Last updated:** 2026-10-15 ([ADR-0020](../adr/0020-username-login-and-permission-matrix-v2.md): login และ CRM ใช้ `username` แทน email); 2026-10-12 ([ADR-0015](../adr/0015-remove-forgot-password-and-email.md): CRM ส่ง password, เอา forgot password ออก)

> เมื่อ API นิ่งแล้ว แนะนำให้ย้ายไปเขียนเป็น OpenAPI (`openapi.yaml`) แทนไฟล์นี้

## 1. สร้าง User (เรียกโดย CRM)

`POST /api/v1/users`

- **Auth:** API key ของ CRM (service-to-service) ใน header `X-API-Key`

Request:
```json
{
  "username": "somchai",
  "name": "Somchai Jaidee",
  "role": "SUPER_ADMIN",
  "password": "********"
}
```

`username` (ADR-0020): ตัด space หน้า/หลัง, เก็บเป็นตัวพิมพ์เล็ก, 3–64 ตัว, ใช้ได้ `a-z 0-9 . _ - @ +`
(ค่าหน้าตาเหมือน email เช่น `somchai@gmail.com` ก็ได้ แต่ระบบไม่ตรวจว่าเป็น email), ห้ามซ้ำ และแก้ไม่ได้หลังสร้าง
(ใช้ผูก license) — **ช่วงเปลี่ยนผ่าน:** ยังรับ field `email` แบบ deprecated โดยถือเป็น username;
ส่งทั้ง `username` และ `email` แต่ค่าไม่ตรงกัน (หลัง normalize) → `400 VALIDATION_ERROR`

`password` จำเป็นต้องส่ง และต้องผ่าน [Password Policy ข้อ 1](0003-password-policy.md) (4–64 ตัวอักษร)
CRM ต้องเรียกผ่าน HTTPS ไม่ log รหัสผ่าน และส่งรหัสให้ user ทางช่องทางของ CRM เอง

Response `201 Created`:
```json
{
  "userId": "usr_01HZX...",
  "username": "somchai",
  "email": "somchai",
  "createdAt": "2026-10-04T09:00:00Z"
}
```

> `email` ใน response เป็นสำเนาของ `username` (deprecated) ไม่ใช่ email จริง; คอลัมน์ email ภายในของระบบเป็นค่า `<id>@users.invalid` ที่ไม่ส่งออก
>
> Response **ไม่ส่ง password กลับ** ระบบเก็บเฉพาะ Argon2id hash และไม่ส่ง email ใด ๆ ตาม [ADR-0015](../adr/0015-remove-forgot-password-and-email.md)

| Status | กรณี |
|---|---|
| 400 `VALIDATION_ERROR` | ข้อมูลไม่ครบ (รวมถึงไม่มี `password` หรือไม่มีทั้ง `username`/`email`), username ผิดกฎ, หรือ `username` กับ `email` ไม่ตรงกัน |
| 400 `PASSWORD_POLICY_VIOLATION` | `password` ไม่ผ่าน policy; ส่ง `violations` กลับ |
| 401 | API key ไม่ถูกต้อง |
| 409 `{"error":"USERNAME_TAKEN"}` | username นี้มีในระบบแล้ว (ถ้าส่งมาแค่ `email` แบบเดิม จะได้ `{"error":"EMAIL_ALREADY_EXISTS"}` เหมือนเดิม) |
| 422 `LICENSE_REQUIRED` | username นี้ยังไม่มี license ที่ใช้ได้ (ADR-0013; license server รับ username ใน field `email`) |
| 503 `LICENSE_UNVERIFIABLE` | ตรวจ license ไม่ได้ชั่วคราว |

## 2. Login

ใช้ Better Auth ผ่าน same-origin route `/api/auth/*` และ session cookie แบบ HttpOnly/Secure/SameSite=Lax
ตาม [ADR Better Auth](../adr/0008-use-better-auth.md) แทน access token ใน response ด้านล่าง
Frontend ไม่เก็บ session token ใน local storage

`POST /api/auth/sign-in/username` (Better Auth `username` plugin, ADR-0020) — `POST /api/auth/sign-in/email` ปิดแล้ว (`404`)

Request:
```json
{ "username": "somchai", "password": "********", "rememberMe": true }
```

ระบบ normalize username (trim + ตัวพิมพ์เล็ก) ก่อนค้นหา จึงพิมพ์ `Somchai` ได้

Response ถูกกำหนดโดย Better Auth และส่ง session cookie กลับผ่าน frontend same-origin proxy

| Status | กรณี |
|---|---|
| 401 `{code:"INVALID_USERNAME_OR_PASSWORD", message, attemptsRemaining}` | username หรือ password ผิด (รวมถึง username ที่ผิดรูปแบบ); `attemptsRemaining` (0–2) รูปแบบเดียวกันไม่ว่า username จะมีบัญชีหรือไม่ |
| 423 `{code:"ACCOUNT_LOCKED", message, retryAfterSeconds}` | ผิดครบ 3 ครั้งหรือยังอยู่ในช่วงล็อก |
| 403 `{code:"ACCOUNT_INACTIVE", message}` | password ถูกแต่บัญชีถูกปิดใช้งาน (ไม่สร้าง session) |
| 429 | เรียกถี่เกินไป (rate limit) |

เมื่อผิดครบ 3 ครั้ง ระบบล็อกบัญชี 1 นาทีตาม [ADR-0012](../adr/0012-change-flow-login.md)
และบันทึกทุก attempt ลงตาราง `auth.LoginAttempt` โดยเก็บ username (normalize แล้ว) เป็น HMAC-SHA-256 hash
(คอลัมน์ยังชื่อ `email_hash`) ไม่บันทึก username ดิบในประวัติ attempt ใช้ `auth.LoginLockout` ที่ keyed ด้วย hash เดียวกัน
เพื่อให้ lockout/attempt count ไม่เปิดเผยว่า username มีบัญชีหรือไม่ Rate limit 5 ครั้ง/นาที/IP ที่ `/sign-in/username`

## 3. Forgot Password (ยกเลิกแล้ว)

เอาออกตาม [ADR-0015](../adr/0015-remove-forgot-password-and-email.md):
`POST /api/v1/auth/forgot-password` และ Better Auth `/api/auth/request-password-reset`, `/api/auth/reset-password`
ตอบ `404` ผู้ใช้ที่ลืมรหัสผ่านต้องติดต่อผู้ดูแลระบบนอกระบบ

## 4. เปลี่ยน Password (Profile page)

`PUT /api/v1/me/password`

- **Auth:** Better Auth session cookie ของ user

Request:
```json
{
  "currentPassword": "********",
  "newPassword": "********",
  "confirmPassword": "********"
}
```

> `currentPassword` is required, per the confirmed decision in [Open Questions](../open-questions.md#resolved-login-and-password-decisions).

Response `204 No Content`

| Status | กรณี |
|---|---|
| 400 | newPassword ไม่ผ่าน policy หรือ confirm ไม่ตรง (ส่งรายการกฎที่ไม่ผ่านกลับไปด้วย) |
| 401 | ไม่ได้ login หรือ currentPassword ผิด |

ตัวอย่าง error 400:
```json
{
  "error": "PASSWORD_POLICY_VIOLATION",
  "violations": ["MISSING_UPPERCASE", "MISSING_DIGIT"]
}
```
