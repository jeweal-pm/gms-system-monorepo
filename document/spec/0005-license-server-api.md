# API Contract: License Server

- **Status:** Approved customer-backend contract draft; external license server not implemented
- **Last updated:** 2026-10-11
- **ผู้ใช้สัญญานี้:** `HttpLicenseClient` และ `MockLicenseClient` ใน `backend-api-auth`, ผ่าน gateway

> Contract นี้ใช้กับ `HttpLicenseClient` และ `MockLicenseClient` ใน `backend-api-auth`;
> ดู consumer design ที่ [auth license integration](../apps/backend/auth/license-integration/api-contract.md)
> เมื่อ API นิ่งแล้ว ให้แปลงเป็น `openapi.yaml`

## 1. การยืนยันตัวตนของ instance

ทุก request จาก `backend-api-auth` ต้องมี header:

```
X-Instance-Id: inst_acme_01
Authorization: Bearer <instance API key>
```

- API key ออกให้ตอนติดตั้ง instance ใหม่ license-server เก็บเป็น hash
- instance_id ใน header ต้องตรงกับ API key ไม่งั้นตอบ 401

## 2. Endpoints สำหรับ auth service

### 2.1 ดูสถานะ license ของ email

`POST /v1/licenses/lookup`

```json
{ "email": "superadmin@demo.com" }
```

Response `200`:
```json
{ "state": "none" }
{ "state": "pending" }
{ "state": "active", "token": "eyJ..." }
```

`active` รวมถึง license ที่หมดอายุหรือถูกระงับด้วย (สถานะจริงอยู่ใน token)
ส่วน `revoked` ตอบ `active` พร้อม token ที่มี `status: "revoked"`

### 2.2 Activate

`POST /v1/licenses/activate`

```json
{ "email": "superadmin@demo.com", "key": "ABCD-EFGH-JKLM-NPQR-STUV" }
```

| Status | code | กรณี |
|---|---|---|
| 200 | - | `{ "token": "eyJ..." }` |
| 400 | `INVALID_KEY` | key ไม่ถูก หรือไม่ใช่ของ email + instance นี้ |
| 409 | `ALREADY_ACTIVATED` | key นี้ activate แล้ว (ตอบ token ด้วยเพื่อให้ใช้งานต่อได้) |
| 429 | `TOO_MANY_ATTEMPTS` | กรอกผิดเกินกำหนด |

### 2.3 ขอ token ใหม่

`POST /v1/licenses/refresh`

```json
{ "email": "superadmin@demo.com" }
```

| Status | code | กรณี |
|---|---|---|
| 200 | - | `{ "token": "eyJ..." }` |
| 404 | `LICENSE_NOT_FOUND` | ไม่มี license (เช่น ถูกลบ) |

### 2.4 รายการ license ของ instance

`GET /v1/licenses?status=&cursor=`

Response `200`:
```json
{
  "items": [
    {
      "email": "superadmin@demo.com",
      "type": "paid",
      "status": "active",
      "expiresAt": "2027-10-11T00:00:00+07:00",
      "keyPrefix": "ABCD"
    }
  ],
  "nextCursor": null
}
```

### 2.5 Email binding policy

License transfer to a new email is not supported. This API has no rebind/transfer endpoint.
A licensed account's email is immutable. A user who needs a different email must create a new
account with a separately issued license. Never silently change a license subject or move a
key to another email.

## 3. Signed Token

JWT, algorithm `EdDSA` (Ed25519)

Header:
```json
{ "alg": "EdDSA", "kid": "2026-10" }
```

Payload:

| Claim | ตัวอย่าง | ความหมาย |
|---|---|---|
| `sub` | `superadmin@demo.com` | email |
| `iss` | configured per license-server deployment | Expected issuer is read from backend deployment configuration; owner approved this policy |
| `aud` | `f1-system-customer-backend` | approved customer backend audience |
| `instance` | `inst_acme_01` | ต้องตรงกับ `LICENSE_INSTANCE_ID` ของ `backend-api-auth` |
| `type` | `trial` / `paid` | |
| `status` | `active` / `suspended` / `revoked` | |
| `license_expires_at` | `2027-10-11T00:00:00+07:00` | วันหมดอายุจริงของ license |
| `iat` | | เวลาออก token |
| `exp` | iat + 24 ชม. | อายุของ token (คนละอย่างกับ license_expires_at) |

- `kid` ใช้รองรับการหมุนเปลี่ยน key: `backend-api-auth` เก็บ public key ได้หลายตัว เลือกตาม `kid`
- `backend-api-auth` ตรวจลายเซ็นและ `instance` เสมอ ส่วน `exp` ใช้ตัดสินว่าต้อง refresh หรือเข้า grace ตาม [backend integration contract](../apps/backend/auth/license-integration/api-contract.md)

## 4. รูปแบบ Error

รูปแบบ error นี้ได้รับอนุมัติใน SA revision 2 และเป็น contract สำหรับ auth/gateway integration

```json
{ "error": { "code": "INVALID_KEY", "message": "..." } }
```

Owner approved this error envelope for SA revision 2. `backend-api-auth` uses `code` only to
decide behavior and must not trust/display the upstream `message`.

## 5. Endpoints สำหรับทีมขาย (internal)

ไม่ได้เรียกจาก `backend-api-auth`; ใช้ auth แยก (ไม่ใช่ instance API key)

| Endpoint | หน้าที่ |
|---|---|
| `POST /v1/admin/licenses` | ออก license (trial / paid) ให้ email + instance ส่ง key ทาง email |
| `POST /v1/admin/licenses/{id}/renew` | ขยายวันหมดอายุ / เปลี่ยน trial เป็น paid |
| `POST /v1/admin/licenses/{id}/suspend` | ระงับชั่วคราว |
| `POST /v1/admin/licenses/{id}/revoke` | ยกเลิกถาวร |
| `POST /v1/admin/instances` | ลงทะเบียน instance ใหม่ คืน instance_id + API key (แสดงครั้งเดียว) |
