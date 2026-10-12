# API Contract: Login & Password Management

- **Status:** Draft; initial implementation contract
- **Last updated:** 2026-10-12 ([ADR-0015](../adr/0015-remove-forgot-password-and-email.md): CRM ส่ง password, เอา forgot password ออก)

> เมื่อ API นิ่งแล้ว แนะนำให้ย้ายไปเขียนเป็น OpenAPI (`openapi.yaml`) แทนไฟล์นี้

## 1. สร้าง User (เรียกโดย CRM)

`POST /api/v1/users`

- **Auth:** API key ของ CRM (service-to-service) ใน header `X-API-Key`

Request:
```json
{
  "email": "somchai@example.com",
  "name": "Somchai Jaidee",
  "role": "SUPER_ADMIN",
  "password": "********"
}
```

`password` จำเป็นต้องส่ง และต้องผ่าน [Password Policy ข้อ 1](0003-password-policy.md) (4–64 ตัวอักษร)
CRM ต้องเรียกผ่าน HTTPS ไม่ log รหัสผ่าน และส่งรหัสให้ user ทางช่องทางของ CRM เอง

Response `201 Created`:
```json
{
  "userId": "usr_01HZX...",
  "email": "somchai@example.com",
  "createdAt": "2026-10-04T09:00:00Z"
}
```

> Response **ไม่ส่ง password กลับ** ระบบเก็บเฉพาะ Argon2id hash และไม่ส่ง email ใด ๆ ตาม [ADR-0015](../adr/0015-remove-forgot-password-and-email.md)

| Status | กรณี |
|---|---|
| 400 `VALIDATION_ERROR` | ข้อมูลไม่ครบ (รวมถึงไม่มี `password`) หรือรูปแบบ email ผิด |
| 400 `PASSWORD_POLICY_VIOLATION` | `password` ไม่ผ่าน policy; ส่ง `violations` กลับ |
| 401 | API key ไม่ถูกต้อง |
| 409 | email นี้มีในระบบแล้ว |

## 2. Login

ใช้ Better Auth ผ่าน same-origin route `/api/auth/*` และ session cookie แบบ HttpOnly/Secure/SameSite=Lax
ตาม [ADR Better Auth](../adr/0008-use-better-auth.md) แทน access token ใน response ด้านล่าง
Frontend ไม่เก็บ session token ใน local storage

`POST /api/auth/sign-in/email` (Better Auth)

Request:
```json
{ "email": "somchai@example.com", "password": "********" }
```

Response ถูกกำหนดโดย Better Auth และส่ง session cookie กลับผ่าน frontend same-origin proxy

| Status | กรณี |
|---|---|
| 401 | email หรือ password ผิด; ส่ง `attemptsRemaining` (0–2) โดยใช้รูปแบบเดียวกันไม่ว่า email จะมีบัญชีหรือไม่ |
| 423 | ผิดครบ 3 ครั้งหรือยังอยู่ในช่วงล็อก; ส่ง `retryAfterSeconds` |
| 429 | เรียกถี่เกินไป (rate limit) |

เมื่อผิดครบ 3 ครั้ง ระบบล็อกบัญชี 1 นาทีตาม [ADR-0012](../adr/0012-change-flow-login.md)
และบันทึกทุก attempt ลงตาราง `auth.LoginAttempt` โดยเก็บ email เป็น HMAC-SHA-256 hash
ไม่บันทึก email ดิบในประวัติ attempt ใช้ `auth.LoginLockout` ที่ keyed ด้วย hash เดียวกัน
เพื่อให้ lockout/attempt count ไม่เปิดเผยว่า email มีบัญชีหรือไม่

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
