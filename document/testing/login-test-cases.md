# Test Cases: Login & Password Management

- **Last updated:** 2026-10-15 ([ADR-0020](../adr/0020-username-login-and-permission-matrix-v2.md): email → username); 2026-10-12 ([ADR-0015](../adr/0015-remove-forgot-password-and-email.md))
- **Related:** [Acceptance Criteria](../spec/0002-login-requirements.md#6-acceptance-criteria)

## Login

| ID | กรณี | ขั้นตอน | ผลที่คาดหวัง | อ้างอิง |
|---|---|---|---|---|
| TC-01 | Login สำเร็จ | กรอก username + password ถูกต้อง กด Login | เข้าหน้า Home | AC-01 |
| TC-02 | Password ผิด | กรอก username ถูก password ผิด | 401 `INVALID_USERNAME_OR_PASSWORD` แสดง "ชื่อผู้ใช้หรือรหัสผ่านไม่ถูกต้อง (เหลืออีก 2 ครั้ง)" | AC-01, ADR-0012 |
| TC-03 | Username ไม่มีในระบบ | กรอก username ที่ไม่มี (หรือผิดรูปแบบ เช่น `x`) | 401 รูปแบบเดียวกับ TC-02 | AC-01 |
| TC-04 | ช่องว่าง | ไม่กรอกอะไรเลย กด Login | แสดงว่าต้องกรอก ไม่ส่ง request | AC-01 |
| TC-05 | ผิดครบ 3 ครั้ง | กรอก password ผิดติดกัน 3 ครั้ง | 423 แสดง "ใส่ password ผิด 3 ครั้ง กรุณารอ 1 นาที" พร้อมนับถอยหลัง 60 วินาที | BR-07, ADR-0012 |
| TC-06 | Login ระหว่างถูกล็อก | หลัง TC-05 กรอก password ถูกภายใน 1 นาที | 423 + เวลาที่เหลือ login ไม่สำเร็จ | ADR-0012 |
| TC-07 | Login หลังครบเวลา | หลัง TC-05 รอครบ 1 นาที แล้วกรอก password ถูก | Login สำเร็จ | ADR-0012 |
| TC-08 | Reset ตัวนับเมื่อสำเร็จ | ผิด 2 ครั้ง แล้ว login สำเร็จ แล้วผิดอีก 1 ครั้ง | 401 เหลืออีก 2 ครั้ง (ไม่ถูกล็อก) | ADR-0012 |
| TC-09a | ตัวพิมพ์ใหญ่/space | กรอก `  SuperAdmin@Demo.COM ` | login สำเร็จ (normalize) | BR-08 |
| TC-09b | User เดิมหลัง migrate | `superadmin@demo.com` / `user@demo.com` | login ได้ด้วยค่าเดิมเป็น username | ADR-0020 |
| TC-09c | ปิด sign-in ด้วย email | POST `/api/auth/sign-in/email` | 404 | ADR-0020 |
| TC-09d | บัญชีถูกปิดใช้งาน | password ถูก แต่ Active off | 403 `ACCOUNT_INACTIVE` ไม่มี session | BR-09 |
| TC-09 | ไม่มี forgot password | เปิดหน้า `/login` | ไม่มีลิงก์หรือข้อความเรื่องลืมรหัสผ่าน | AC-01, ADR-0015 |

## สร้าง User ผ่าน CRM

| ID | กรณี | ขั้นตอน | ผลที่คาดหวัง | อ้างอิง |
|---|---|---|---|---|
| TC-10 | สร้างสำเร็จ | CRM เรียก POST /users ด้วย `username` ใหม่และ password ที่ผ่าน policy | 201 `{userId, username, email(=username), createdAt}`, ไม่มี password, login ด้วย username นั้นได้ | AC-02 |
| TC-10a | Deprecated email | ส่งแค่ `email` | 201 โดยใช้ค่านั้นเป็น username | ADR-0020 |
| TC-10b | username ≠ email | ส่งทั้งสองค่าไม่ตรงกัน | 400 `VALIDATION_ERROR` | ADR-0020 |
| TC-11 | Username ซ้ำ | เรียกด้วย username ที่มีแล้ว | 409 `USERNAME_TAKEN` (ส่งแค่ `email` → `EMAIL_ALREADY_EXISTS`) | AC-02 |
| TC-12 | ไม่มี API key | เรียกโดยไม่ใส่ X-API-Key | 401 | API |
| TC-13 | ไม่มี password | เรียกโดยไม่ส่ง `password` | 400 `VALIDATION_ERROR` ไม่สร้าง user | AC-02, ADR-0015 |
| TC-14 | Password ไม่ผ่าน policy | ส่ง `password` = `abc` | 400 `PASSWORD_POLICY_VIOLATION` ไม่สร้าง user | AC-02, ADR-0015 |
| TC-15 | ไม่มี password ใน log | หลัง TC-10 ตรวจ log ของ gateway/auth | ไม่พบรหัสผ่าน | ADR-0015 |

## Forgot Password (ยกเลิกตาม ADR-0015)

| ID | กรณี | ขั้นตอน | ผลที่คาดหวัง | อ้างอิง |
|---|---|---|---|---|
| TC-20 | หน้า forgot password ถูกลบ | เปิด `/forgot-password` | 404 | AC-03 |
| TC-21 | API forgot password ถูกลบ | POST `/api/v1/auth/forgot-password` ผ่าน gateway และ auth | 404 | AC-03 |
| TC-22 | Better Auth reset ถูกปิด | POST `/api/auth/request-password-reset` และ `/api/auth/reset-password` | 404 | AC-03 |

## เปลี่ยน Password

| ID | กรณี | ขั้นตอน | ผลที่คาดหวัง | อ้างอิง |
|---|---|---|---|---|
| TC-30 | เปลี่ยนสำเร็จ | กรอก `abcd` ทั้งสองช่อง กด Save | บันทึกสำเร็จ login ด้วยรหัสใหม่ได้ | AC-04 |
| TC-31 | สั้นเกิน | กรอก `abc` | error: อย่างน้อย 4 ตัวอักษร | Policy |
| TC-32 | ยาวเกิน | กรอก 65 ตัวอักษร | error: ไม่เกิน 64 ตัวอักษร | Policy |
| TC-33 | ไม่บังคับประเภทตัวอักษร | กรอก `1234` | บันทึกสำเร็จ | Policy |
| TC-35 | Confirm ไม่ตรง | password `abcd` confirm `abce` | error: รหัสผ่านยืนยันไม่ตรงกัน | BR-06 |
| TC-36 | ไม่บังคับเปลี่ยน | Login ครั้งแรกด้วยรหัสเริ่มต้นจาก CRM | เข้าหน้า Default ได้เลย ไม่มี popup | BR-04 |
